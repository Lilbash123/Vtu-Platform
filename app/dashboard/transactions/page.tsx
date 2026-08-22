'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase-browser';
import { Breadcrumb, Card } from '@/components/ui';
import { TransactionList } from '@/components/transaction-list';

interface Tx {
  id: string;
  service_type: string;
  recipient: string;
  amount: number;
  status: string;
  created_at: string;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Tx[]>([]);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase
      .from('service_transactions')
      .select('id, service_type, recipient, amount, status, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setTransactions(data ?? []));
  }, []);

  return (
    <div>
      <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Transactions' }]} />
      <h1 className="text-xl font-bold mb-4">Transaction History</h1>
      <Card>
        <TransactionList transactions={transactions} />
      </Card>
    </div>
  );
}
