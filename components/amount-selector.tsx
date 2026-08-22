'use client';

import { useState } from 'react';

const QUICK_AMOUNTS = [100, 200, 500, 1000];

export function AmountSelector({
  value,
  onChange,
  quickAmounts = QUICK_AMOUNTS,
}: {
  value: string;
  onChange: (naira: string) => void;
  quickAmounts?: number[];
}) {
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div>
      <span className="text-text-muted mb-1.5 block text-sm font-medium">Amount</span>
      <div className="flex flex-wrap gap-2 mb-2">
        {quickAmounts.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => { onChange(String(amt)); setShowCustom(false); }}
            className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
              !showCustom && Number(value) === amt
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-line bg-white text-text-primary hover:bg-surface'
            }`}
          >
            ₦{amt.toLocaleString()}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
            showCustom ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-white text-text-primary hover:bg-surface'
          }`}
        >
          Other
        </button>
      </div>
      {showCustom && (
        <input
          type="number"
          min={50}
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter amount"
          className="w-full bg-white border border-line rounded-xl px-4 py-2.5 text-text-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
        />
      )}
    </div>
  );
}
