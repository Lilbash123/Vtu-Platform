'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tv } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase-browser';
import { apiFetch } from '@/lib/api-fetch';
import { Breadcrumb, Card, TextField, Button, TransactionResultModal } from '@/components/ui';
import { formatNaira } from '@/components/wallet-card';

interface Variation {
  id: string;
  name: string;
  network_or_disco: string;
  sale_price: number;
}

export default function CablePage() {
  return (
    <Suspense fallback={null}>
      <CableContent />
    </Suspense>
  );
}

function CableContent() {
  const params = useSearchParams();
  const [variations, setVariations] = useState<Variation[]>([]);
  const [provider, setProvider] = useState('');
  const [variationId, setVariationId] = useState(params.get('variationId') ?? '');
  const [recipient, setRecipient] = useState(params.get('recipient') ?? '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase
      .from('service_variations')
      .select('id, name, network_or_disco, sale_price')
      .eq('service_type', 'cable')
      .eq('is_active', true)
      .then(({ data }) => {
        setVariations(data ?? []);
        if (data && data.length > 0 && !provider) setProvider(data[0].network_or_disco);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const providers = Array.from(new Set(variations.map((v) => v.network_or_disco)));
  const providerOptions = variations.filter((v) => v.network_or_disco === provider);
  const selected = variations.find((v) => v.id === variationId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (!recipient || !selected) {
      setResult({ status: 'failed', message: 'Select a package and enter your smartcard number.' });
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/vtu/purchase', {
        method: 'POST',
        body: JSON.stringify({
          serviceType: 'cable',
          variationId: selected.id,
          recipient,
          amount: selected.sale_price,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      if (res.status === 'success') setResult({ status: 'success', message: 'Cable subscription successful.' });
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
      <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Cable TV' }]} />
      <h1 className="text-xl font-bold mb-4 flex items-center gap-2"><Tv size={20} className="text-brand-500" /> Cable TV Subscription</h1>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <span className="text-text-muted mb-1.5 block text-sm font-medium">Provider</span>
            {providers.length === 0 ? (
              <p className="text-text-muted text-sm">No cable providers configured yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {providers.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setProvider(p); setVariationId(''); }}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-medium uppercase transition-colors ${
                      provider === p ? 'border-brand-500 ring-2 ring-brand-100 bg-brand-50' : 'border-line bg-white hover:bg-surface'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {providerOptions.length > 0 && (
            <div>
              <span className="text-text-muted mb-1.5 block text-sm font-medium">Package</span>
              <div className="grid grid-cols-1 gap-2">
                {providerOptions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariationId(v.id)}
                    className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-colors flex items-center justify-between ${
                      variationId === v.id ? 'border-brand-500 ring-2 ring-brand-100 bg-brand-50' : 'border-line bg-white hover:bg-surface'
                    }`}
                  >
                    <span className="font-medium">{v.name}</span>
                    <span className="text-brand-600 font-semibold amount">{formatNaira(v.sale_price)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <TextField
            label="Smartcard Number"
            required
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Enter smartcard number"
          />

          {result && (
            <TransactionResultModal
              status={result.status === 'success' ? 'success' : result.status === 'pending' ? 'pending' : 'failed'}
              message={result.message}
              onClose={() => setResult(null)}
            />
          )}

          <Button type="submit" disabled={loading || !selected} className="w-full">
            {loading ? 'Processing…' : 'Proceed to Pay'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
