import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, AuthError } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';
import { parseOrThrow } from '@/lib/validation';
import { z } from 'zod';
import { checkRateLimit, adminLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const releaseFundingSchema = z.object({
  fundingId: z.string().uuid(),
  reason: z.string().min(10).max(500),
});

// Counterpart to admin_release_held_funding — completes a funding that was
// held because it would have pushed the wallet over its KYC-tier cap.
// Without this route, credit_wallet_from_funding's idempotency guard meant
// held funds had no path to ever reach the wallet, even after an admin
// raised the user's tier. See README security review notes.
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);

    const { allowed } = await checkRateLimit(adminLimiter, admin.id);
    if (!allowed) return NextResponse.json({ error: 'Too many admin actions, slow down' }, { status: 429 });

    const body = parseOrThrow(releaseFundingSchema, await req.json());
    const service = getServiceClient();

    const { data: result, error } = await service.rpc('admin_release_held_funding', {
      p_admin_id: admin.id,
      p_funding_id: body.fundingId,
      p_reason: body.reason,
    });

    if (error) {
      logger.error('admin_release_funding_failed', {
        route: 'admin_release_funding', adminId: admin.id, fundingId: body.fundingId, error: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    logger.info('admin_release_funding_success', { route: 'admin_release_funding', adminId: admin.id, fundingId: body.fundingId });

    return NextResponse.json({ status: result?.[0]?.result_status, balance: result?.[0]?.new_balance });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const status = (err as any)?.status ?? 500;
    logger.error('admin_release_funding_route_error', { route: 'admin_release_funding', error: String(err) });
    return NextResponse.json({ error: status === 400 ? (err as Error).message : 'Internal error' }, { status });
  }
}
