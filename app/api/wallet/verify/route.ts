import { NextRequest, NextResponse } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';
import { walletVerifySchema, parseOrThrow } from '@/lib/validation';
import { verifyTransaction } from '@/lib/flutterwave';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = parseOrThrow(walletVerifySchema, await req.json());
    const service = getServiceClient();

    const { data: funding, error: findError } = await service
      .from('funding_transactions')
      .select('id, user_id, tx_ref, status, flw_transaction_id')
      .eq('tx_ref', body.txRef)
      .single();

    if (findError || !funding) return NextResponse.json({ error: 'Funding record not found' }, { status: 404 });

    if (funding.user_id !== user.id) {
      logger.warn('verify_ownership_mismatch', { route: 'wallet_verify', userId: user.id, txRef: body.txRef });
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (funding.status === 'successful') {
      return NextResponse.json({ status: 'already_credited' });
    }

    // Prefer the transaction_id passed through the Flutterwave redirect URL
    // (client should forward it here) over whatever the webhook may or may
    // not have populated yet — this is the tightened path noted in the API README.
    const flwTransactionId = body.flwTransactionId ?? funding.flw_transaction_id;
    if (!flwTransactionId) {
      return NextResponse.json({ status: 'pending', message: 'Awaiting confirmation, try again shortly' });
    }

    const verified = await verifyTransaction(flwTransactionId);
    if (verified.status !== 'successful') {
      return NextResponse.json({ status: verified.status });
    }

    // FINANCIAL INTEGRITY FIX: ownership was checked against `funding`, the
    // row looked up by body.txRef — but flwTransactionId can come from the
    // client (the redirect-forwarded transaction_id), and Flutterwave's
    // verify-by-ID response for THAT id could resolve to a different tx_ref
    // than the one we just confirmed this user owns. Without this check,
    // credit_wallet_from_funding would be called with verified.txRef instead
    // of funding.tx_ref — crediting whatever funding record that other
    // tx_ref actually belongs to (someone else's, in the worst case),
    // triggered by this user's session, with no ownership check ever run
    // against that other record. Require an exact match before crediting
    // anything; on mismatch, credit nothing and fail safely.
    if (verified.txRef !== funding.tx_ref) {
      logger.warn('wallet_verify_txref_mismatch', {
        route: 'wallet_verify',
        userId: user.id,
        expectedTxRef: funding.tx_ref,
        verifiedTxRef: verified.txRef,
        flwTransactionId,
      });
      return NextResponse.json({ error: 'Transaction verification mismatch' }, { status: 400 });
    }

    const amountKobo = Math.round(verified.amountNaira * 100);

    const { data: creditResult, error: creditError } = await service.rpc('credit_wallet_from_funding', {
      p_tx_ref: funding.tx_ref,
      p_flw_transaction_id: verified.flwTransactionId,
      p_amount: amountKobo,
      p_currency: verified.currency,
    });

    if (creditError) {
      logger.error('verify_credit_failed', { route: 'wallet_verify', userId: user.id, txRef: body.txRef, error: creditError.message });
      return NextResponse.json({ error: 'Could not confirm funding, contact support' }, { status: 500 });
    }

    return NextResponse.json({ status: creditResult?.[0]?.result_status, balance: creditResult?.[0]?.new_balance });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const status = (err as any)?.status ?? 500;
    logger.error('wallet_verify_error', { route: 'wallet_verify', error: String(err) });
    return NextResponse.json({ error: status === 400 ? (err as Error).message : 'Internal error' }, { status });
  }
}
