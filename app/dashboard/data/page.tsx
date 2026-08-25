'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase-browser';
import { apiFetch } from '@/lib/api-fetch';
import { Breadcrumb, Card, TextField, Button, TransactionResultModal } from '@/components/ui';
import { NetworkSelector, NETWORK_STYLES, type Network } from '@/components/network-selector';
import { formatNaira } from '@/components/wallet-card';

interface Variation {
  id: string;
  name: string;
  network_or_disco: string;
  sale_price: number;
}

export default function BuyDataPage() {
  return (
    <Suspense fallback={null}>
      <BuyDataContent />
    </Suspense>
  );
}

function BuyDataContent() {
  const params = useSearchParams();
  const [network, setNetwork] = useState<Network>('mtn');
  const [variations, setVariations] = useState<Variation[]>([]);
  const [variationId, setVariationId] = useState(params.get('variationId') ?? '');
  const [recipient, setRecipient] = useState(params.get('recipient') ?? '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase
      .from('service_variations')
      .select('id, name, network_or_disco, sale_price')
      .eq('service_type', 'data')
      .eq('network_or_disco', network)
      .eq('is_active', true)
      .then(({ data }) => setVariations(data ?? []));
  }, [network]);

  const selected = variations.find((v) => v.id === variationId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (!recipient || !selected) {
      setResult({ status: 'failed', message: 'Select a plan and enter a phone number.' });
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/vtu/purchase', {
        method: 'POST',
        body: JSON.stringify({
          serviceType: 'data',
          variationId: selected.id,
          recipient,
          amount: selected.sale_price,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      if (res.status === 'success') setResult({ status: 'success', message: 'Data purchase successful.' });
      else if (res.status === 'pending_verify') setResult({ status: 'pending', message: 'Processing — check Transactions shortly.' });
      else setResult({ status: 'failed', message: `Purchase ${res.status}.` });
    } catch (err) {
      setResult({ status: 'failed', message: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Buy Data' }]} />
      <h1 className="text-xl font-bold mb-4">Buy Data</h1>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <NetworkSelector value={network} onChange={(n) => { setNetwork(n); setVariationId(''); }} />

          <div>
            <span className="text-text-muted mb-1.5 block text-sm font-medium">Select Plan</span>
            {variations.length === 0 ? (
              <p className="text-text-muted text-sm">No plans available for {NETWORK_STYLES[network].label} right now.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {variations.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariationId(v.id)}
                    className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                      variationId === v.id ? 'border-brand-500 ring-2 ring-brand-100 bg-brand-50' : 'border-line bg-white hover:bg-surface'
                    }`}
                  >
                    <p className="font-medium truncate">{v.name}</p>
                    <p className="text-brand-600 font-semibold amount">{formatNaira(v.sale_price)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <TextField
            label="Phone Number"
            required
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="080 123 456 78"
          />

          {result && (
            <TransactionResultModal
              status={result.status === 'success' ? 'success' : result.status === 'pending' ? 'pending' : 'failed'}
              message={result.message}
              onClose={() => setResult(null)}
            />
          )}

          <Button type="submit" disabled={loading || !selected} className="w-full">
            {loading ? 'Processing…' : selected ? `Proceed to Pay (${formatNaira(selected.sale_price)})` : 'Proceed to Pay'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
