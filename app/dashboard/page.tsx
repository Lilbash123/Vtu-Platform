'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Smartphone, Wifi, Zap, Tv } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase-browser';
import { apiFetch } from '@/lib/api-fetch';
import { WalletCard, formatNaira } from '@/components/wallet-card';
import { TransactionList } from '@/components/transaction-list';
import { Card } from '@/components/ui';

const QUICK_ACTIONS = [
  { href: '/dashboard/airtime', label: 'Airtime', icon: Smartphone },
  { href: '/dashboard/data', label: 'Data', icon: Wifi },
  { href: '/dashboard/electricity', label: 'Electricity', icon: Zap },
  { href: '/dashboard/cable', label: 'Cable TV', icon: Tv },
];

interface Tx {
  id: string;
  service_type: string;
  recipient: string;
  amount: number;
  status: string;
  created_at: string;
  variation_id: string | null;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getBrowserClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data: wallet } = await supabase.from('wallets').select('balance').eq('user_id', userData.user.id).single();
    setBalance(wallet?.balance ?? 0);

    const { data: txs } = await supabase
      .from('service_transactions')
      .select('id, service_type, recipient, amount, status, created_at, variation_id')
      .order('created_at', { ascending: false })
      .limit(20);
    setTransactions(txs ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Flutterwave redirect fallback — unchanged from prior build, just moved
  // out of the old inline-fund UI since funding now happens on its own page.
  useEffect(() => {
    const txRef = searchParams.get('tx_ref');
    const flwTransactionId = searchParams.get('transaction_id');
    const status = searchParams.get('status');
    if (!txRef) return;

    if (status === 'cancelled') {
      setVerifyMessage('Funding was cancelled.');
      router.replace('/dashboard');
      return;
    }

    apiFetch('/api/wallet/verify', {
      method: 'POST',
      body: JSON.stringify({ txRef, flwTransactionId: flwTransactionId ?? undefined }),
    })
      .then((result) => {
        if (['credited', 'already_processed', 'already_credited'].includes(result.status)) {
          setVerifyMessage('Wallet funded successfully.');
        } else if (result.status === 'pending') {
          setVerifyMessage('Funding is still confirming — refresh shortly.');
        } else if (result.status === 'held_for_review') {
          setVerifyMessage('Your payment was received but exceeds your current limit — our team will review it shortly.');
        } else {
          setVerifyMessage(`Funding status: ${result.status}`);
        }
        load();
      })
      .catch((err) => setVerifyMessage(err.message))
      .finally(() => router.replace('/dashboard'));
  }, [searchParams, router, load]);

  // Real "buy again" — deduped from the user's own recent successful
  // purchases, not fabricated sample data.
  const buyAgain = dedupeRecentSuccesses(transactions).slice(0, 3);

  return (
    <div className="space-y-6">
      {verifyMessage && <Card className="text-sm text-pending">{verifyMessage}</Card>}

      <WalletCard balance={balance} />

      <div>
        <p className="text-sm font-semibold text-text-muted mb-2">Quick Actions</p>
        <div className="grid grid-cols-4 gap-3">
          {QUICK_ACTIONS.map((a) => (
            <a
              key={a.href}
              href={a.href}
              className="card p-4 flex flex-col items-center gap-2 hover:border-brand-300 hover:shadow-elevated transition-all"
            >
              <span className="w-11 h-11 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
                <a.icon size={20} />
              </span>
              <span className="text-xs font-medium text-center">{a.label}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-1">
            <p className="font-semibold">Recent Transactions</p>
            <a href="/dashboard/transactions" className="text-brand-500 text-sm font-medium hover:underline">View all</a>
          </div>
          <TransactionList transactions={transactions.slice(0, 5)} />
        </Card>

        <Card>
          <p className="font-semibold mb-3">Buy Again</p>
          {buyAgain.length === 0 ? (
            <p className="text-text-muted text-sm">Your recent purchases will show up here.</p>
          ) : (
            <div className="space-y-3">
              {buyAgain.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium capitalize">{tx.service_type} — {tx.recipient}</p>
                    <p className="text-text-muted text-xs amount">{formatNaira(tx.amount)}</p>
                  </div>
                  <a
                    href={buyAgainHref(tx)}
                    className="px-3 py-1.5 rounded-lg border border-brand-500 text-brand-600 text-xs font-semibold hover:bg-brand-50"
                  >
                    Buy
                  </a>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function dedupeRecentSuccesses(transactions: Tx[]): Tx[] {
  const seen = new Set<string>();
  const result: Tx[] = [];
  for (const tx of transactions) {
    if (tx.status !== 'success') continue;
    const key = `${tx.service_type}:${tx.recipient}:${tx.variation_id ?? tx.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tx);
  }
  return result;
}

function buyAgainHref(tx: Tx): string {
  const params = new URLSearchParams({ recipient: tx.recipient });
  if (tx.variation_id) params.set('variationId', tx.variation_id);
  if (tx.service_type === 'airtime') params.set('amount', String(tx.amount / 100));
  return `/dashboard/${tx.service_type === 'cable' || tx.service_type === 'electricity' ? tx.service_type : tx.service_type}?${params.toString()}`;
}
