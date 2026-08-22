'use client';

export const NETWORKS = ['mtn', 'airtel', 'glo', '9mobile'] as const;
export type Network = typeof NETWORKS[number];

const NETWORK_STYLES: Record<Network, { label: string; bg: string; text: string }> = {
  mtn: { label: 'MTN', bg: '#FFCC00', text: '#1A1A2E' },
  airtel: { label: 'Airtel', bg: '#FF0000', text: '#FFFFFF' },
  glo: { label: 'Glo', bg: '#00A651', text: '#FFFFFF' },
  '9mobile': { label: '9mobile', bg: '#0A9E00', text: '#FFFFFF' },
};

export function NetworkSelector({ value, onChange }: { value: Network; onChange: (n: Network) => void }) {
  return (
    <div>
      <span className="text-text-muted mb-1.5 block text-sm font-medium">Select Network</span>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {NETWORKS.map((n) => {
          const style = NETWORK_STYLES[n];
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                active ? 'border-brand-500 ring-2 ring-brand-100 bg-brand-50' : 'border-line bg-white hover:bg-surface'
              }`}
            >
              <span
                className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ backgroundColor: style.bg, color: style.text }}
              >
                {style.label[0]}
              </span>
              {style.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { NETWORK_STYLES };
