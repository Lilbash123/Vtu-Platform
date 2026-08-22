'use client';

import { useState } from 'react';
import { Wallet2, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { Breadcrumb, Card, Button, StatusPill } from '@/components/ui';
import { AmountSelector } from '@/components/amount-selector';

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000];

export default function FundWalletPage() {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const naira = Number(amount);
    if (!naira || naira <= 0) {
      setError('Enter a valid amount.');
      return;
    }

    setLoading(true);
    try {
      // redirectUrl is intentionally not sent — the server derives the
      // trusted callback itself (APP_BASE_URL). See the security review in
      // the README for why this can't be client-supplied.
      const result = await apiFetch('/api/wallet/fund', {
        method: 'POST',
        body: JSON.stringify({ amount: Math.round(naira * 100) }),
      });
      setRedirecting(true);
      setTimeout(() => {
        window.location.href = result.checkoutUrl;
      }, 900);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  if (redirecting) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="flex justify-center mb-6">
          <Loader2 size={48} className="text-brand-500 animate-spin" />
        </div>
        <h2 className="text-lg font-bold mb-2">Redirecting to Payment</h2>
        <p className="text-text-muted text-sm mb-1">
          You will be redirected to Flutterwave to complete your payment of
        </p>
        <p className="amount text-2xl font-bold text-brand-600 mb-4">
          ₦{Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
        </p>
        <p className="text-text-muted text-xs">Please do not close this window.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Fund Wallet' }]} />
      <h1 className="text-xl font-bold mb-4 flex items-center gap-2"><Wallet2 size={20} className="text-brand-500" /> Fund Wallet</h1>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <AmountSelector value={amount} onChange={setAmount} quickAmounts={QUICK_AMOUNTS} />

          <div>
            <span className="text-text-muted mb-1.5 block text-sm font-medium">Payment Method</span>
            <div className="border border-line rounded-xl px-4 py-3 flex items-center gap-3 bg-surface">
              <span className="w-8 h-8 rounded-md bg-orange-500 text-white flex items-center justify-center text-xs font-bold">FW</span>
              <div>
                <p className="text-sm font-medium">Flutterwave</p>
                <p className="text-text-muted text-xs">Cards, Bank Transfer, USSD</p>
              </div>
            </div>
          </div>

          <div className="bg-pending-bg text-pending text-sm rounded-xl p-3">
            You will be redirected to Flutterwave to complete your payment securely.
          </div>

          {error && <StatusPill status="failed" />}
          {error && <p className="text-sm text-danger -mt-3">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Preparing…' : 'Fund Wallet'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
