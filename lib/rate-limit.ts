import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Requires UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. In-memory
// limiting doesn't work reliably on Vercel — invocations are stateless.
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const purchaseLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'ratelimit:purchase',
});

export const fundingLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '5 m'),
  prefix: 'ratelimit:funding',
});

export const webhookLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'),
  prefix: 'ratelimit:webhook',
});

export const adminLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix: 'ratelimit:admin',
});

export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string
): Promise<{ allowed: boolean; remaining: number }> {
  const { success, remaining } = await limiter.limit(identifier);
  return { allowed: success, remaining };
}
