import { logger } from './logger';

const FLW_BASE_URL = 'https://api.flutterwave.com/v3';
const FLW_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY!;
const FLW_SECRET_HASH = process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH!;

if (!FLW_SECRET_KEY || !FLW_SECRET_HASH) {
  throw new Error('Missing Flutterwave environment variables');
}

interface InitializePaymentParams {
  txRef: string;
  amountNaira: number;
  email: string;
  redirectUrl: string;
  userId: string;
}

export async function initializePayment(params: InitializePaymentParams): Promise<{ checkoutUrl: string }> {
  const res = await fetch(`${FLW_BASE_URL}/payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FLW_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx_ref: params.txRef,
      amount: params.amountNaira,
      currency: 'NGN',
      redirect_url: params.redirectUrl,
      customer: { email: params.email },
      meta: { user_id: params.userId },
      customizations: { title: 'Wallet Funding' },
    }),
  });

  const body = await res.json();

  if (!res.ok || body.status !== 'success') {
    logger.error('flutterwave_init_failed', { route: 'flutterwave_lib', flwResponse: body });
    throw new Error('Failed to initialize Flutterwave payment');
  }

  return { checkoutUrl: body.data.link };
}

export interface FlutterwaveVerifyResult {
  status: 'successful' | 'failed' | 'pending';
  amountNaira: number;
  currency: string;
  txRef: string;
  flwTransactionId: string;
  channel: string;
}

/**
 * Re-verifies directly against Flutterwave's API using the transaction ID.
 * This is the ONLY source of truth for payment success — webhook payloads
 * and redirect query params are hints to look up a transaction, never proof.
 */
export async function verifyTransaction(flwTransactionId: string): Promise<FlutterwaveVerifyResult> {
  const res = await fetch(`${FLW_BASE_URL}/transactions/${flwTransactionId}/verify`, {
    headers: { Authorization: `Bearer ${FLW_SECRET_KEY}` },
  });

  const body = await res.json();

  if (!res.ok || body.status !== 'success') {
    logger.error('flutterwave_verify_failed', { route: 'flutterwave_lib', flwTransactionId, flwResponse: body });
    throw new Error('Failed to verify Flutterwave transaction');
  }

  const data = body.data;
  return {
    status: data.status === 'successful' ? 'successful' : data.status === 'failed' ? 'failed' : 'pending',
    amountNaira: data.amount,
    currency: data.currency,
    txRef: data.tx_ref,
    flwTransactionId: String(data.id),
    channel: data.payment_type,
  };
}

/**
 * Flutterwave webhooks carry a shared-secret header, not HMAC — compare
 * with constant time to avoid timing attacks.
 */
export function verifyWebhookSignature(receivedHash: string | null): boolean {
  if (!receivedHash) return false;
  if (receivedHash.length !== FLW_SECRET_HASH.length) return false;
  let mismatch = 0;
  for (let i = 0; i < receivedHash.length; i++) {
    mismatch |= receivedHash.charCodeAt(i) ^ FLW_SECRET_HASH.charCodeAt(i);
  }
  return mismatch === 0;
}
