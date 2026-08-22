import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, AuthError } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';
import { adminRefundSchema, parseOrThrow } from '@/lib/validation';
import { checkRateLimit, adminLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);

    const { allowed } = await checkRateLimit(adminLimiter, admin.id);
    if (!allowed) return NextResponse.json({ error: 'Too many admin actions, slow down' }, { status: 429 });

    const body = parseOrThrow(adminRefundSchema, await req.json());
    const service = getServiceClient();

    const { data: result, error } = await service.rpc('admin_refund_purchase', {
      p_admin_id: admin.id, p_service_tx_id: body.serviceTransactionId, p_reason: body.reason,
    });

    if (error) {
      logger.error('admin_refund_failed', { route: 'admin_refund', adminId: admin.id, serviceTxId: body.serviceTransactionId, error: error.message });
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    logger.info('admin_refund_success', { route: 'admin_refund', adminId: admin.id, serviceTxId: body.serviceTransactionId });

    return NextResponse.json({ status: result?.[0]?.result_status, balance: result?.[0]?.new_balance });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const status = (err as any)?.status ?? 500;
    logger.error('admin_refund_route_error', { route: 'admin_refund', error: String(err) });
    return NextResponse.json({ error: status === 400 ? (err as Error).message : 'Internal error' }, { status });
  }
}
