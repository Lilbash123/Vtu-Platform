'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Zap } from 'lucide-react';
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

export default function ElectricityPage() {
  return (
    <Suspense fallback={null}>
      <ElectricityContent />
    </Suspense>
  );
}

function ElectricityContent() {
  const params = useSearchParams();
  const [variations, setVariations] = useState<Variation[]>([]);
  const [disco, setDisco] = useState('');
  const [variationId, setVariationId] = useState(params.get('variationId') ?? '');
  const [recipient, setRecipient] = useState(params.get('recipient') ?? '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; message: string; transactionId?: string; amount?: number; recipient?: string } | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase
      .from('service_variations')
      .select('id, name, network_or_disco, sale_price')
      .eq('service_type', 'electricity')
      .eq('is_active', true)
      .then(({ data }) => {
        setVariations(data ?? []);
        if (data && data.length > 0 && !disco) setDisco(data[0].network_or_disco);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const discos = Array.from(new Set(variations.map((v) => v.network_or_disco)));
  const discoOptions = variations.filter((v) => v.network_or_disco === disco);
  const selected = variations.find((v) => v.id === variationId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (!recipient || !selected) {
      setResult({ status: 'failed', message: 'Select your disco/plan and enter your meter number.' });
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/vtu/purchase', {
        method: 'POST',
        body: JSON.stringify({
          serviceType: 'electricity',
          variationId: selected.id,
          recipient,
          amount: selected.sale_price,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      if (res.status === 'success') setResult({ status: 'success', message: 'Electricity payment successful.', transactionId: res.transactionId, amount: selected.sale_price / 100, recipient });
      else if (res.status === 'pending_verify') setResult({ status: 'pending', message: 'Your purchase is processing. We will confirm shortly.', transactionId: res.transactionId, amount: selected.sale_price / 100, recipient });
      else setResult({ status: 'failed', message: `Purchase ${res.status}.`, transactionId: res.transactionId, amount: selected.sale_price / 100, recipient });
    } catch (err) {
      setResult({ status: 'failed', message: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Electricity' }]} />
      <h1 className="text-xl font-bold mb-4 flex items-center gap-2"><Zap size={20} className="text-brand-500" /> Pay Electricity Bill</h1>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <span className="text-text-muted mb-1.5 block text-sm font-medium">Disco</span>
            {discos.length === 0 ? (
              <p className="text-text-muted text-sm">No electricity providers configured yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {discos.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => { setDisco(d); setVariationId(''); }}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-medium capitalize transition-colors ${
                      disco === d ? 'border-brand-500 ring-2 ring-brand-100 bg-brand-50' : 'border-line bg-white hover:bg-surface'
                    }`}
                  >
                    {d.replace(/-/g, ' ')}
                  </button>
                ))}
              </div>
            )}
          </div>

          {discoOptions.length > 0 && (
            <div>
              <span className="text-text-muted mb-1.5 block text-sm font-medium">Plan</span>
              <div className="grid grid-cols-1 gap-2">
                {discoOptions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariationId(v.id)}
                    className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-colors flex items-center justify-between ${
                      variationId === v.id ? 'border-brand-500 ring-2 ring-brand-100 bg-brand-50' : 'border-line bg-white hover:bg-surface'
                    }`}
                  >
                    <span className="font-medium">{v.name}</span>
                    {v.sale_price > 0 && <span className="text-brand-600 font-semibold amount">{formatNaira(v.sale_price)}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <TextField
            label="Meter Number"
            required
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Enter meter number"
          />

          {result && (
            <TransactionResultModal
              status={result.status === 'success' ? 'success' : result.status === 'pending' ? 'pending' : 'failed'}
              message={result.message}
              details={{ service: 'Electricity', amount: result.amount, recipient: result.recipient, transactionId: result.transactionId }}
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
