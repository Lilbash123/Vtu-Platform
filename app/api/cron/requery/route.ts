import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { requeryTransaction } from '@/lib/vtpass';
import { logger } from '@/lib/logger';

const BATCH_SIZE = 50;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = getServiceClient();

  const { data: dueTransactions, error: fetchError } = await service
    .from('service_transactions')
    .select('id, request_id, requery_count')
    .eq('status', 'pending_verify')
    .lte('next_requery_at', new Date().toISOString())
    .limit(BATCH_SIZE);

  if (fetchError) {
    logger.error('cron_fetch_failed', { route: 'cron_requery', error: fetchError.message });
    return NextResponse.json({ error: 'Failed to fetch due transactions' }, { status: 500 });
  }

  let settled = 0, rescheduled = 0, flagged = 0;

  if (dueTransactions && dueTransactions.length > 0) {
    for (const tx of dueTransactions) {
      try {
        const result = await requeryTransaction(tx.request_id);

        if (result.outcome === 'ambiguous') {
          const { error: scheduleError } = await service.rpc('schedule_next_requery', { p_service_tx_id: tx.id });
          if (scheduleError) {
            logger.error('cron_schedule_failed', { route: 'cron_requery', txId: tx.id, error: scheduleError.message });
            continue;
          }

          const { data: updated } = await service
            .from('service_transactions').select('flagged_for_review').eq('id', tx.id).single();

          if (updated?.flagged_for_review) {
            flagged++;
            logger.warn('cron_transaction_flagged', { route: 'cron_requery', txId: tx.id, requestId: tx.request_id });
          } else {
            rescheduled++;
          }
          continue;
        }

        const { error: settleError } = await service.rpc('settle_wallet_purchase', {
          p_service_tx_id: tx.id, p_outcome: result.outcome,
          p_provider_reference: result.providerReference, p_provider_response: result.rawResponse,
        });

        if (settleError) {
          logger.error('cron_settle_failed', { route: 'cron_requery', txId: tx.id, error: settleError.message });
          continue;
        }

        settled++;
        logger.info('cron_settled', { route: 'cron_requery', txId: tx.id, outcome: result.outcome });
      } catch (err) {
        logger.error('cron_tx_processing_error', { route: 'cron_requery', txId: tx.id, error: String(err) });
      }
    }
  }

  // Auto-expire stuck / flagged transactions ta hanyar kiran sabon RPC
  let expiredCount = 0;
  const { data: expiredData, error: expireError } = await service.rpc('auto_expire_stuck_transactions');
  if (expireError) {
    logger.error('cron_auto_expire_failed', { route: 'cron_requery', error: expireError.message });
  } else if (expiredData) {
    expiredCount = expiredData.length;
  }

  logger.info('cron_batch_complete', { 
    route: 'cron_requery', 
    total: dueTransactions?.length || 0, 
    settled, 
    rescheduled, 
    flagged,
    expired: expiredCount
  });

  return NextResponse.json({ 
    processed: dueTransactions?.length || 0, 
    settled, 
    rescheduled, 
    flagged,
    expired: expiredCount
  });
}
