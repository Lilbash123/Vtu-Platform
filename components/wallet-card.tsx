'use client';

import { Eye } from 'lucide-react';
import { useState } from 'react';

export function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

export function WalletCard({ balance }: { balance: number }) {
  const [visible, setVisible] = useState(true);

  return (
    <div className="card p-6 bg-gradient-to-br from-brand-500 to-brand-700 text-white border-none">
      <div className="flex items-center justify-between mb-1">
        <p className="text-white/80 text-sm">Wallet Balance</p>
        <button onClick={() => setVisible((v) => !v)} className="text-white/80 hover:text-white">
          <Eye size={16} />
        </button>
      </div>
      <p className="amount text-3xl font-bold mb-4">{visible ? formatNaira(balance) : '••••••'}</p>
      <div className="flex gap-3">
        <a
          href="/dashboard/fund"
          className="px-4 py-2 rounded-xl bg-white text-brand-600 text-sm font-semibold hover:bg-white/90 transition-colors"
        >
          Fund Wallet
        </a>
        <a
          href="/dashboard/transactions"
          className="px-4 py-2 rounded-xl bg-white/15 text-white text-sm font-semibold hover:bg-white/25 transition-colors"
        >
          Transaction History
        </a>
      </div>
    </div>
  );
}
