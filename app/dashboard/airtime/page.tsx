'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-fetch';
import {
  Breadcrumb,
  Card,
  TextField,
  Button,
  TransactionResultModal,
} from '@/components/ui';
import {
  NetworkSelector,
  NETWORK_STYLES,
  type Network,
} from '@/components/network-selector';
import { AmountSelector } from '@/components/amount-selector';

export default function BuyAirtimePage() {
  return (
    <Suspense fallback={null}>
      <BuyAirtimeContent />
    </Suspense>
  );
}

function BuyAirtimeContent() {
  const params = useSearchParams();

  const [network, setNetwork] = useState<Network>('mtn');
  const [recipient, setRecipient] = useState(params.get('recipient') ?? '');
  const [amount, setAmount] = useState(params.get('amount') ?? '');
  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState<{
    status: string;
    message: string;
    transactionId?: string;
    amount?: number;
    recipient?: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    const naira = Number(amount);

    if (!recipient || !naira || naira <= 0) {
      setResult({
        status: 'failed',
        message: 'Enter a valid phone number and amount.',
      });
      return;
    }

    setLoading(true);

    try {
      const res = await apiFetch('/api/vtu/purchase', {
        method: 'POST',
        body: JSON.stringify({
          serviceType: 'airtime',
          network,
          recipient,
          amount: Math.round(naira * 100),
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      if (res.status === 'success') {
        setResult({
          status: 'success',
          message: 'Airtime purchase successful.',
          transactionId: res.transactionId,
          amount: naira,
          recipient,
        });
      } else if (res.status === 'pending_verify') {
        setResult({
          status: 'pending',
          message:
            'Your purchase is processing. We will confirm shortly.',
          transactionId: res.transactionId,
          amount: naira,
          recipient,
        });
      } else {
        setResult({
          status: 'failed',
          message: `Purchase ${res.status}.`,
          transactionId: res.transactionId,
          amount: naira,
          recipient,
        });
      }
    } catch (err) {
      setResult({
        status: 'failed',
        message: (err as Error).message,
      });
    } finally {
      setLoading(false);
    }
  }

  const style = NETWORK_STYLES[network];

  return (
    <>
      <div className="max-w-lg">
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Buy Airtime' },
          ]}
        />

        <h1 className="text-xl font-bold mb-4">Buy Airtime</h1>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <NetworkSelector
              value={network}
              onChange={setNetwork}
            />

            <TextField
              label="Phone Number"
              required
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="080 123 456 78"
            />

            <AmountSelector
              value={amount}
              onChange={setAmount}
            />

            {recipient && Number(amount) > 0 && (
              <div className="bg-surface rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold"
                    style={{
                      backgroundColor: style.bg,
                      color: style.text,
                    }}
                  >
                    {style.label[0]}
                  </span>

                  <div>
                    <p className="text-sm font-medium">
                      {style.label} Airtime
                    </p>

                    <p className="text-text-muted text-xs">
                      {recipient}
                    </p>
                  </div>
                </div>

                <p className="amount font-semibold">
                  ₦{Number(amount).toLocaleString()}
                </p>
              </div>
            )}

            {result && (
              <TransactionResultModal
                status={
                  result.status === 'success'
                    ? 'success'
                    : result.status === 'pending'
                    ? 'pending'
                    : 'failed'
                }
                message={result.message}
                details={{
                  service: 'Airtime',
                  amount: result.amount,
                  recipient: result.recipient,
                  transactionId: result.transactionId,
                }}
                onClose={() => setResult(null)}
              />
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Processing…' : 'Proceed to Pay'}
            </Button>
          </form>
        </Card>
      </div>

      {/* PROCESSING OVERLAY */}
      {loading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-[2px] px-5">
          <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl">

            {/* Pink Loader */}
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-pink-50">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-pink-100 border-t-pink-500" />
            </div>

            <h2 className="text-lg font-bold text-gray-900">
              Processing your payment
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              We're sending this to the biller now.
              This can take a few seconds.
            </p>

            <p className="mt-4 text-xs font-medium text-gray-400">
              Please don't close the app or go back.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
