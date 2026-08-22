import { z } from 'zod';

const koboAmount = z.number().int().positive().max(500_000_000);

export const fundWalletSchema = z.object({
  amount: koboAmount,
  // redirectUrl intentionally NOT accepted from the client — see the
  // security note in app/api/wallet/fund/route.ts. The redirect target is
  // always derived server-side from the trusted APP_BASE_URL env var.
});

export const vtuPurchaseSchema = z.object({
  serviceType: z.enum(['airtime', 'data', 'electricity', 'cable', 'exam_pin']),
  network: z.enum(['mtn', 'glo', 'airtel', '9mobile']).optional(), // required for airtime
  variationId: z.string().uuid().optional(), // required for data/cable/exam_pin/electricity
  recipient: z.string().min(5).max(20),
  amount: koboAmount,
  // Client-generated key identifying this logical purchase attempt. Lets a
  // safely-retried request (network timeout, client-side auto-retry) return
  // the original transaction instead of creating — and re-locking funds
  // for — a second real purchase. Optional for backward compatibility, but
  // any client that might retry should always send one.
  idempotencyKey: z.string().uuid().optional(),
});

export const adminRefundSchema = z.object({
  serviceTransactionId: z.string().uuid(),
  reason: z.string().min(10).max(500),
});

export const walletVerifySchema = z.object({
  txRef: z.string().min(1),
  flwTransactionId: z.string().optional(),
});

export function parseOrThrow<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    const err = new Error(`Validation failed: ${message}`);
    (err as any).status = 400;
    throw err;
  }
  return result.data;
}
