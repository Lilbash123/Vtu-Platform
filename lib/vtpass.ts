import { logger } from './logger';

const VTPASS_BASE_URL = process.env.VTPASS_ENV === 'live'
  ? 'https://vtpass.com/api'
  : 'https://sandbox.vtpass.com/api';

const VTPASS_API_KEY = process.env.VTPASS_API_KEY!;
const VTPASS_SECRET_KEY = process.env.VTPASS_SECRET_KEY!;

if (!VTPASS_API_KEY || !VTPASS_SECRET_KEY) {
  throw new Error('Missing VTpass environment variables');
}

export type VtpassOutcome = 'success' | 'failed' | 'ambiguous';

export interface VtpassPurchaseResult {
  outcome: VtpassOutcome;
  providerReference: string | null;
  rawResponse: unknown;
}

interface PurchaseParams {
  requestId: string;
  serviceId: string; // VTpass serviceID, e.g. 'mtn', 'dstv', 'ikeja-electric'
  variationCode?: string;
  amount: number; // naira, not kobo
  phone: string;
  billersCode?: string;
}

/**
 * Classifies the response into success / failed / ambiguous. Ambiguous
 * covers timeouts, 5xx, and unclear/"processing" states — must NEVER be
 * treated as failure. See settle route + requery cron for how it's resolved.
 */
export async function purchaseService(params: PurchaseParams): Promise<VtpassPurchaseResult> {
  try {
    const res = await fetch(`${VTPASS_BASE_URL}/pay`, {
      method: 'POST',
      headers: {
        'api-key': VTPASS_API_KEY,
        'secret-key': VTPASS_SECRET_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        request_id: params.requestId,
        serviceID: params.serviceId,
        variation_code: params.variationCode,
        amount: params.amount,
        phone: params.phone,
        billersCode: params.billersCode,
      }),
      signal: AbortSignal.timeout(25_000),
    });

    const body = await res.json();

    // Response code mapping is based on VTpass's commonly documented shape —
    // verify against current docs for your account type before going live.
    if (body.code === '000' && body.content?.transactions?.status === 'delivered') {
      return { outcome: 'success', providerReference: body.requestId ?? params.requestId, rawResponse: body };
    }
    if (body.code === '000' && ['pending', 'initiated'].includes(body.content?.transactions?.status)) {
      return { outcome: 'ambiguous', providerReference: body.requestId ?? params.requestId, rawResponse: body };
    }
    if (['failed', 'reversed'].includes(body.content?.transactions?.status)) {
      return { outcome: 'failed', providerReference: body.requestId ?? params.requestId, rawResponse: body };
    }
    return { outcome: 'ambiguous', providerReference: body.requestId ?? null, rawResponse: body };
  } catch (err) {
    // Network error/timeout — we don't know if VTpass received the request.
    // This must be ambiguous, never failed.
    logger.error('vtpass_purchase_network_error', { route: 'vtpass_lib', requestId: params.requestId, error: String(err) });
    return { outcome: 'ambiguous', providerReference: null, rawResponse: { error: String(err) } };
  }
}

export interface VtpassRequeryResult {
  outcome: VtpassOutcome;
  providerReference: string | null;
  rawResponse: unknown;
}

export async function requeryTransaction(requestId: string): Promise<VtpassRequeryResult> {
  try {
    const res = await fetch(`${VTPASS_BASE_URL}/requery`, {
      method: 'POST',
      headers: {
        'api-key': VTPASS_API_KEY,
        'secret-key': VTPASS_SECRET_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ request_id: requestId }),
      signal: AbortSignal.timeout(20_000),
    });

    const body = await res.json();
    const status = body.content?.transactions?.status;

    if (status === 'delivered') return { outcome: 'success', providerReference: body.requestId ?? requestId, rawResponse: body };
    if (['failed', 'reversed'].includes(status)) return { outcome: 'failed', providerReference: body.requestId ?? requestId, rawResponse: body };
    return { outcome: 'ambiguous', providerReference: body.requestId ?? null, rawResponse: body };
  } catch (err) {
    logger.error('vtpass_requery_network_error', { route: 'vtpass_lib', requestId, error: String(err) });
    return { outcome: 'ambiguous', providerReference: null, rawResponse: { error: String(err) } };
  }
}

/**
 * Confirm VTpass's actual webhook auth scheme for your account (some use a
 * shared secret header, others IP allowlisting) and adjust this accordingly.
 */
export function verifyVtpassWebhookAuth(receivedSecret: string | null): boolean {
  const expected = process.env.VTPASS_WEBHOOK_SECRET!;
  if (!receivedSecret || !expected) return false;
  if (receivedSecret.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < receivedSecret.length; i++) {
    mismatch |= receivedSecret.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
