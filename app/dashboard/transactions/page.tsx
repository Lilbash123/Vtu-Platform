'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase-browser';
import { Breadcrumb, Card } from '@/components/ui';
import { TransactionList } from '@/components/transaction-list';

type Tx = {
  id: string;
  service_type: string;
  recipient: string;
  amount: number;
  status: string;
  created_at: string;
  provider_reference?: string | null;
};

const REFRESH_MS = 10000;

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTransactions = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);

    try {
      const supabase = getBrowserClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setTransactions([]);
        return;
      }

      const { data, error } = await supabase
        .from('service_transactions')
        .select(
          'id, service_type, recipient, amount, status, created_at, provider_reference'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error) {
        setTransactions((data ?? []) as Tx[]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTransactions();

    const interval = window.setInterval(() => {
      loadTransactions(true);
    }, REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [loadTransactions]);

  const pendingCount = transactions.filter(
    (tx) => tx.status === 'pending_verify' || tx.status === 'pending'
  ).length;

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Transactions' },
        ]}
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Transaction History</h1>

          {pendingCount > 0 && (
            <p className="mt-1 text-xs text-amber-600">
              {pendingCount} transaction{pendingCount === 1 ? '' : 's'} still
              being verified.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => loadTransactions(true)}
          disabled={refreshing}
          className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-semibold text-text-primary transition hover:bg-surface disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-text-muted">
            Loading transactions…
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-muted">
            No transactions yet.
          </div>
        ) : (
          <TransactionList transactions={transactions} />
        )}
      </Card>

      {pendingCount > 0 && (
        <p className="mt-3 text-center text-xs text-text-muted">
          Pending transactions are checked automatically every 10 seconds.
        </p>
      )}
    </div>
  );
}
