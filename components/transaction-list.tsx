'use client';

import { Smartphone, Wifi, Zap, Tv, HelpCircle } from 'lucide-react';
import { StatusPill } from '@/components/ui';
import { formatNaira } from './wallet-card';

interface Transaction {
  id: string;
  service_type: string;
  recipient: string;
  amount: number;
  status: string;
  created_at: string;
}

const SERVICE_ICON: Record<string, any> = {
  airtime: Smartphone,
  data: Wifi,
  electricity: Zap,
  cable: Tv,
};

export function TransactionList({ transactions, showViewAll }: { transactions: Transaction[]; showViewAll?: boolean }) {
  if (transactions.length === 0) {
    return <p className="text-text-muted text-sm py-6 text-center">No transactions yet.</p>;
  }

  return (
    <div className="divide-y divide-line">
      {transactions.map((tx) => {
        const Icon = SERVICE_ICON[tx.service_type] ?? HelpCircle;
        return (
          <div key={tx.id} className="py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium capitalize truncate">{tx.service_type} — {tx.recipient}</p>
                <p className="text-text-muted text-xs">{new Date(tx.created_at).toLocaleString('en-NG')}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="amount text-sm font-medium">{formatNaira(tx.amount)}</p>
              <StatusPill status={tx.status} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
