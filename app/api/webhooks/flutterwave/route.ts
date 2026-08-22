import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifyWebhookSignature, verifyTransaction } from '@/lib/flutterwave';
import { checkRateLimit, webhookLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  // Keyed by provider, not IP — Flutterwave sends from a shared IP pool, so
  // per-IP limiting isn't meaningful here. This blunts retry storms rather
  // than gating legitimate traffic. We still return 200 on rejection (never
  // 429) so Flutterwave doesn't mark the endpoint unhealthy and start
  // aggressive retries of its own.
  const { allowed } = await checkRateLimit(webhookLimiter, 'flutterwave');
  if (!allowed) {
    logger.warn('flutterwave_webhook_rate_limited', { route: 'flutterwave_webhook' });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const rawBody = await req.text();
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const receivedHash = req.headers.get('verif-hash');
  const signatureValid = verifyWebhookSignature(receivedHash);
  const service = getServiceClient();
  const externalEventId = String(payload?.data?.id ?? payload?.id ?? '');

  const { data: recordResult, error: recordError } = await service.rpc('record_webhook_event', {
    p_provider_code: 'flutterwave',
    p_event_type: payload?.event ?? 'unknown',
    p_signature_valid: signatureValid,
    p_external_event_id: externalEventId || null,
    p_payload: payload,
  });

  if (recordError) {
    logger.error('webhook_record_failed', { route: 'flutterwave_webhook', error: recordError.message });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (!signatureValid) {
    logger.warn('flutterwave_webhook_invalid_signature', { route: 'flutterwave_webhook', externalEventId });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const [{ result_status: recordStatus }] = recordResult as { result_status: string }[];
  if (recordStatus === 'duplicate') {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const flwTransactionId = payload?.data?.id;
  if (!flwTransactionId) {
    logger.warn('flutterwave_webhook_missing_tx_id', { route: 'flutterwave_webhook' });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const verified = await verifyTransaction(String(flwTransactionId));

    if (verified.status !== 'successful') {
      // Defensive: never downgrade a row that's already terminal from our
      // side, even though 'held_for_review' should only ever be reachable
      // via the verified.status === 'successful' branch below.
      await service
        .from('funding_transactions')
        .update({ status: verified.status === 'failed' ? 'failed' : 'pending' })
        .eq('tx_ref', verified.txRef)
        .not('status', 'in', '(successful,held_for_review)');
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const amountKobo = Math.round(verified.amountNaira * 100);

    // FINANCIAL INTEGRITY FIX: previously called credit_wallet_from_funding
    // directly off the verify response, relying entirely on the RPC's
    // internal checks to catch any mismatch. That RPC-level check is still
    // the authoritative enforcement (it holds a row lock, so it's the only
    // place this is truly race-safe) — but this route now also explicitly
    // resolves verified.txRef to a real, known funding record and confirms
    // amount/currency match BEFORE ever attempting the credit, so a
    // resolution failure is caught and logged clearly here rather than
    // surfacing only as a generic RPC error.
    const { data: funding, error: findError } = await service
      .from('funding_transactions')
      .select('id, tx_ref, amount, currency, status')
      .eq('tx_ref', verified.txRef)
      .maybeSingle();

    if (findError || !funding) {
      logger.warn('flutterwave_webhook_funding_not_found', {
        route: 'flutterwave_webhook', verifiedTxRef: verified.txRef, flwTransactionId,
      });
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (funding.amount !== amountKobo || funding.currency.toUpperCase() !== verified.currency.toUpperCase()) {
      logger.error('flutterwave_webhook_amount_currency_mismatch', {
        route: 'flutterwave_webhook',
        txRef: funding.tx_ref,
        expectedAmount: funding.amount,
        verifiedAmount: amountKobo,
        expectedCurrency: funding.currency,
        verifiedCurrency: verified.currency,
      });
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const { data: creditResult, error: creditError } = await service.rpc('credit_wallet_from_funding', {
      p_tx_ref: funding.tx_ref,
      p_flw_transaction_id: verified.flwTransactionId,
      p_amount: amountKobo,
      p_currency: verified.currency,
    });

    if (creditError) {
      logger.error('wallet_credit_failed', { route: 'flutterwave_webhook', txRef: funding.tx_ref, error: creditError.message });
      return NextResponse.json({ received: true }, { status: 200 });
    }

    logger.info('wallet_credited', { route: 'flutterwave_webhook', txRef: funding.tx_ref, result: creditResult?.[0]?.result_status });
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    logger.error('flutterwave_webhook_processing_error', { route: 'flutterwave_webhook', error: String(err) });
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
