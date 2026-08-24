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
  serviceId: string;
  variationCode?: string;
  amount: number;
  phone: string;
  billersCode?: string;
}

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
    
    // DEBUG LOG: Domin mu gani a Vercel logs me VTPass ke dawowa da shi
    console.log("VTPASS RAW RESPONSE:", JSON.stringify(body, null, 2));

    // GYARAN SHARAƊI: Muna duba code 000 ko kuma duk wani status da ke nuna nasara (delivered / success / successful)
    const txStatus = body.content?.transactions?.status?.toLowerCase();
    const isSuccess = body.code === '000' || txStatus === 'delivered' || txStatus === 'success' || txStatus === 'successful';

    if (isSuccess) {
      return { outcome: 'success', providerReference: body.requestId ?? params.requestId, rawResponse: body };
    }

    if (['failed', 'reversed'].includes(txStatus)) {
      return { outcome: 'failed', providerReference: body.requestId ?? params.requestId, rawResponse: body };
    }

    return { outcome: 'ambiguous', providerReference: body.requestId ?? null, rawResponse: body };
  } catch (err) {
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
    const status = body.content?.transactions?.status?.toLowerCase();
    const isSuccess = body.code === '000' || status === 'delivered' || status === 'success' || status === 'successful';

    if (isSuccess) return { outcome: 'success', providerReference: body.requestId ?? requestId, rawResponse: body };
    if (['failed', 'reversed'].includes(status)) return { outcome: 'failed', providerReference: body.requestId ?? requestId, rawResponse: body };
    return { outcome: 'ambiguous', providerReference: body.requestId ?? null, rawResponse: body };
  } catch (err) {
    logger.error('vtpass_requery_network_error', { route: 'vtpass_lib', requestId, error: String(err) });
    return { outcome: 'ambiguous', providerReference: null, rawResponse: { error: String(err) } };
  }
}

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
