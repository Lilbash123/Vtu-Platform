import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireUser, AuthError } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';
import { fundWalletSchema, parseOrThrow } from '@/lib/validation';
import { initializePayment } from '@/lib/flutterwave';
import { checkRateLimit, fundingLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

// Server-only trusted base URL for constructing the Flutterwave redirect
// target — deliberately never sourced from the client. See the security
// note inline below.
const APP_BASE_URL = process.env.APP_BASE_URL!;
if (!APP_BASE_URL) {
  throw new Error('Missing APP_BASE_URL environment variable');
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);

    const { allowed } = await checkRateLimit(fundingLimiter, user.id);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many funding attempts. Try again shortly.' }, { status: 429 });
    }

    const body = parseOrThrow(fundWalletSchema, await req.json());
    const service = getServiceClient();

    const { data: wallet, error: walletError } = await service
      .from('wallets').select('id').eq('user_id', user.id).single();

    if (walletError || !wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }

    const { data: authUser } = await service.auth.admin.getUserById(user.id);
    const email = authUser?.user?.email;
    if (!email) return NextResponse.json({ error: 'Account email not found' }, { status: 400 });

    const txRef = `fund_${randomUUID()}`;

    const { error: insertError } = await service.from('funding_transactions').insert({
      user_id: user.id, wallet_id: wallet.id, tx_ref: txRef, amount: body.amount, status: 'pending',
    });

    if (insertError) {
      logger.error('funding_insert_failed', { route: 'wallet_fund', userId: user.id, error: insertError.message });
      return NextResponse.json({ error: 'Could not initialize funding' }, { status: 500 });
    }

    // SECURITY FIX: redirectUrl used to come straight from the client
    // request body and was passed to Flutterwave unmodified — a classic
    // open redirect. A caller could set it to any external domain, and
    // after a real payment, Flutterwave would send the user (with their
    // tx_ref/transaction_id in the query string) to that attacker-controlled
    // page instead of back to this app — useful for phishing or for
    // laundering trust in this domain's payment flow. The redirect target is
    // now always derived from a trusted, server-only APP_BASE_URL env var,
    // never from client input.
    const redirectUrl = `${APP_BASE_URL}/dashboard`;

    const { checkoutUrl } = await initializePayment({
      txRef, amountNaira: body.amount / 100, email, redirectUrl, userId: user.id,
    });

    logger.info('funding_initialized', { route: 'wallet_fund', userId: user.id, txRef, amount: body.amount });

    return NextResponse.json({ txRef, checkoutUrl });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const status = (err as any)?.status ?? 500;
    logger.error('funding_init_error', { route: 'wallet_fund', error: String(err) });
    return NextResponse.json({ error: status === 400 ? (err as Error).message : 'Internal error' }, { status });
  }
}
