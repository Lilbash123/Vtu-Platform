import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireUser, AuthError } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';
import { vtuPurchaseSchema, parseOrThrow } from '@/lib/validation';
import { purchaseService, requeryTransaction } from '@/lib/vtpass';
import { checkRateLimit, purchaseLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const FIRST_REQUERY_DELAY_SECONDS = 30;

function generateVtpassRequestId(): string {
  const date = new Date();
  const formattedDate = date.toISOString().replace(/[-T:\.Z]/g, "").slice(0, 12);
  const randomStr = randomUUID().replace(/-/g, "").substring(0, 8);
  return `${formattedDate}${randomStr}`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);

    const { allowed } = await checkRateLimit(purchaseLimiter, user.id);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many purchase attempts. Slow down and try again.' }, { status: 429 });
    }

    const body = parseOrThrow(vtuPurchaseSchema, await req.json());

    if (body.serviceType === 'airtime' && !body.network) {
      return NextResponse.json({ error: 'network is required for airtime purchases' }, { status: 400 });
    }
    if (body.serviceType !== 'airtime' && !body.variationId) {
      return NextResponse.json({ error: 'variationId is required for this service type' }, { status: 400 });
    }

    const service = getServiceClient();

    if (body.idempotencyKey) {
      const { data: existing } = await service
        .from('service_transactions')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('idempotency_key', body.idempotencyKey)
        .maybeSingle();

      if (existing) {
        logger.info('purchase_idempotent_replay', { route: 'vtu_purchase', userId: user.id, transactionId: existing.id });
        return NextResponse.json({
          status: existing.status,
          transactionId: existing.id,
          message: 'This purchase was already submitted.',
        });
      }
    }

    const { data: wallet, error: walletError } = await service
      .from('wallets').select('id').eq('user_id', user.id).single();
    if (walletError || !wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

    let providerServiceId: string;
    let variationCode: string | undefined;
    let providerId: string;
    let variationRowId: string | null = null;

    if (body.serviceType === 'airtime') {
      const { data: provider, error: providerError } = await service
        .from('providers').select('id').eq('code', 'vtpass').single();
      if (providerError || !provider) return NextResponse.json({ error: 'Provider not configured' }, { status: 500 });

      providerServiceId = body.network!.toLowerCase();
      providerId = provider.id;
    } else {
      const { data: variation, error: variationError } = await service
        .from('service_variations')
        .select('id, provider_id, variation_code, network_or_disco, is_active, sale_price')
        .eq('id', body.variationId)
        .single();

      if (variationError || !variation || !variation.is_active) {
        return NextResponse.json({ error: 'Invalid or inactive variation' }, { status: 400 });
      }

      if (variation.sale_price !== body.amount) {
        logger.warn('purchase_amount_mismatch', {
          route: 'vtu_purchase', userId: user.id, expected: variation.sale_price, received: body.amount,
        });
        return NextResponse.json({ error: 'Amount does not match current price' }, { status: 400 });
      }

      providerServiceId = (variation.network_or_disco ?? '').toLowerCase();
      variationCode = variation.variation_code;
      providerId = variation.provider_id;
      variationRowId = variation.id;
    }

    const requestId = generateVtpassRequestId();

    const { data: newTx, error: txInsertError } = await service
      .from('service_transactions')
      .insert({
        user_id: user.id, wallet_id: wallet.id, provider_id: providerId, variation_id: variationRowId,
        service_type: body.serviceType, recipient: body.recipient, amount: body.amount,
        request_id: requestId, idempotency_key: body.idempotencyKey ?? null, status: 'pending',
      })
      .select('id').single();

    if (txInsertError) {
      if (txInsertError.code === '23505' && body.idempotencyKey) {
        const { data: existing } = await service
          .from('service_transactions')
          .select('id, status')
          .eq('user_id', user.id)
          .eq('idempotency_key', body.idempotencyKey)
          .maybeSingle();

        if (existing) {
          logger.info('purchase_idempotent_race_resolved', { route: 'vtu_purchase', userId: user.id, transactionId: existing.id });
          return NextResponse.json({ status: existing.status, transactionId: existing.id, message: 'This purchase was already submitted.' });
        }
      }

      logger.error('purchase_tx_insert_failed', { route: 'vtu_purchase', userId: user.id, error: txInsertError.message });
      return NextResponse.json({ error: 'Could not create transaction' }, { status: 500 });
    }

    if (!newTx) {
      logger.error('purchase_tx_insert_no_row', { route: 'vtu_purchase', userId: user.id });
      return NextResponse.json({ error: 'Could not create transaction' }, { status: 500 });
    }

    const { data: lockResult, error: lockError } = await service.rpc('lock_wallet_funds', {
      p_user_id: user.id, p_wallet_id: wallet.id, p_amount: body.amount, p_service_tx_id: newTx.id,
    });

    if (lockError) {
      logger.error('lock_funds_rpc_error', { route: 'vtu_purchase', userId: user.id, error: lockError.message });
      return NextResponse.json({ error: 'Could not process purchase' }, { status: 500 });
    }

    const lockStatus = lockResult?.[0]?.result_status;
    if (lockStatus !== 'locked') {
      const messages: Record<string, string> = {
        exceeds_tx_limit: 'This amount exceeds your per-transaction limit. Verify your account to increase it.',
        exceeds_daily_limit: 'You have reached your daily transaction limit.',
        insufficient_balance: 'Insufficient wallet balance.',
      };
      return NextResponse.json({ error: messages[lockStatus] ?? 'Purchase could not be locked' }, { status: 422 });
    }

    let purchaseResult = await purchaseService({
      requestId,
      serviceId: providerServiceId,
      variationCode,
      amount: body.amount / 100,
      phone: body.recipient,
      billersCode: ['electricity', 'cable'].includes(body.serviceType) ? body.recipient : undefined,
    });

    if (purchaseResult.outcome === 'ambiguous') {
      await new Promise((resolve) => setTimeout(resolve, 3500));

      const retryResult = await requeryTransaction(requestId);

      if (retryResult.outcome !== 'ambiguous') {
        purchaseResult = retryResult;
      }
    }

    if (purchaseResult.outcome === 'ambiguous') {
      await service
        .from('service_transactions')
        .update({
          status: 'pending_verify',
          provider_response: purchaseResult.rawResponse as any,
          next_requery_at: new Date(Date.now() + FIRST_REQUERY_DELAY_SECONDS * 1000).toISOString(),
        })
        .eq('id', newTx.id);

      logger.info('purchase_ambiguous_pending_verify', { route: 'vtu_purchase', userId: user.id, requestId });

      return NextResponse.json({
        status: 'pending_verify', transactionId: newTx.id,
        message: 'Your purchase is processing. We will confirm shortly.',
      });
    }

    const { data: settleResult, error: settleError } = await service.rpc('settle_wallet_purchase', {
      p_service_tx_id: newTx.id,
      p_outcome: purchaseResult.outcome,
      p_provider_reference: purchaseResult.providerReference,
      p_provider_response: purchaseResult.rawResponse,
    });

    if (settleError) {
      logger.error('settle_rpc_error', { route: 'vtu_purchase', userId: user.id, requestId, error: settleError.message });
      return NextResponse.json({ error: 'Purchase processed but settlement failed — contact support' }, { status: 500 });
    }

    logger.info('purchase_settled', { route: 'vtu_purchase', userId: user.id, requestId, outcome: purchaseResult.outcome });

    return NextResponse.json({
      status: settleResult?.[0]?.result_status, transactionId: newTx.id, balance: settleResult?.[0]?.new_balance,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const status = (err as any)?.status ?? 500;
    logger.error('purchase_error', { route: 'vtu_purchase', error: String(err) });
    return NextResponse.json({ error: status === 400 ? (err as Error).message : 'Internal error' }, { status });
  }
}
