import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifyVtpassWebhookAuth, requeryTransaction } from '@/lib/vtpass';
import { checkRateLimit, webhookLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const { allowed } = await checkRateLimit(webhookLimiter, 'vtpass');
  if (!allowed) {
    logger.warn('vtpass_webhook_rate_limited', { route: 'vtpass_webhook' });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const rawBody = await req.text();
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const receivedSecret = req.headers.get('x-vtpass-secret'); // adjust to VTpass's actual webhook auth scheme
  const signatureValid = verifyVtpassWebhookAuth(receivedSecret);
  const service = getServiceClient();
  const requestId = payload?.request_id ?? payload?.requestId;

  const { data: recordResult, error: recordError } = await service.rpc('record_webhook_event', {
    p_provider_code: 'vtpass',
    p_event_type: payload?.type ?? 'transaction_update',
    p_signature_valid: signatureValid,
    p_external_event_id: requestId ?? null,
    p_payload: payload,
  });

  if (recordError) {
    logger.error('vtpass_webhook_record_failed', { route: 'vtpass_webhook', error: recordError.message });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (!signatureValid) {
    logger.warn('vtpass_webhook_invalid_signature', { route: 'vtpass_webhook', requestId });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const [{ result_status: recordStatus }] = recordResult as { result_status: string }[];
  if (recordStatus === 'duplicate') return NextResponse.json({ received: true }, { status: 200 });

  if (!requestId) {
    logger.warn('vtpass_webhook_missing_request_id', { route: 'vtpass_webhook' });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const { data: tx, error: txError } = await service
      .from('service_transactions').select('id, status').eq('request_id', requestId).single();

    if (txError || !tx) {
      logger.warn('vtpass_webhook_tx_not_found', { route: 'vtpass_webhook', requestId });
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (['success', 'failed', 'refunded'].includes(tx.status)) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Requery to confirm rather than trusting the webhook payload directly.
    const requeryResult = await requeryTransaction(requestId);

    if (requeryResult.outcome === 'ambiguous') {
      logger.info('vtpass_webhook_still_ambiguous', { route: 'vtpass_webhook', requestId });
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const { error: settleError } = await service.rpc('settle_wallet_purchase', {
      p_service_tx_id: tx.id,
      p_outcome: requeryResult.outcome,
      p_provider_reference: requeryResult.providerReference,
      p_provider_response: requeryResult.rawResponse,
    });

    if (settleError) {
      logger.error('vtpass_webhook_settle_failed', { route: 'vtpass_webhook', requestId, error: settleError.message });
    } else {
      logger.info('vtpass_webhook_settled', { route: 'vtpass_webhook', requestId, outcome: requeryResult.outcome });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    logger.error('vtpass_webhook_processing_error', { route: 'vtpass_webhook', requestId, error: String(err) });
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
