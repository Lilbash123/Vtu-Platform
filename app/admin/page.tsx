'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase-browser';
import { apiFetch } from '@/lib/api-fetch';
import { StatusPill, Button } from '@/components/ui';
import { formatNaira } from '@/components/wallet-card';

interface ServiceTx {
  id: string;
  user_id: string;
  service_type: string;
  recipient: string;
  amount: number;
  status: string;
  requery_count: number;
  flagged_for_review: boolean;
  created_at: string;
}

interface FundingTx {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  channel: string | null;
  created_at: string;
}

type Tab = 'purchases' | 'funding' | 'flagged';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('purchases');
  const [purchases, setPurchases] = useState<ServiceTx[]>([]);
  const [funding, setFunding] = useState<FundingTx[]>([]);
  const [refundTarget, setRefundTarget] = useState<ServiceTx | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);

  const [releaseTarget, setReleaseTarget] = useState<FundingTx | null>(null);
  const [releaseReason, setReleaseReason] = useState('');
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [releaseLoading, setReleaseLoading] = useState(false);

  const load = useCallback(async () => {
    const supabase = getBrowserClient();

    const { data: purchaseRows } = await supabase
      .from('service_transactions')
      .select('id, user_id, service_type, recipient, amount, status, requery_count, flagged_for_review, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    setPurchases(purchaseRows ?? []);

    const { data: fundingRows } = await supabase
      .from('funding_transactions')
      .select('id, user_id, amount, status, channel, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    setFunding(fundingRows ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitRefund() {
    if (!refundTarget) return;
    if (refundReason.trim().length < 10) {
      setRefundError('Reason must be at least 10 characters — this is logged to admin_actions.');
      return;
    }
    setRefundLoading(true);
    setRefundError(null);
    try {
      await apiFetch('/api/admin/refund', {
        method: 'POST',
        body: JSON.stringify({ serviceTransactionId: refundTarget.id, reason: refundReason }),
      });
      setRefundTarget(null);
      setRefundReason('');
      load();
    } catch (err) {
      setRefundError((err as Error).message);
    } finally {
      setRefundLoading(false);
    }
  }

  async function submitRelease() {
    if (!releaseTarget) return;
    if (releaseReason.trim().length < 10) {
      setReleaseError('Reason must be at least 10 characters — this is logged to admin_actions.');
      return;
    }
    setReleaseLoading(true);
    setReleaseError(null);
    try {
      await apiFetch('/api/admin/release-funding', {
        method: 'POST',
        body: JSON.stringify({ fundingId: releaseTarget.id, reason: releaseReason }),
      });
      setReleaseTarget(null);
      setReleaseReason('');
      load();
    } catch (err) {
      setReleaseError((err as Error).message);
    } finally {
      setReleaseLoading(false);
    }
  }

  const flagged = purchases.filter((p) => p.flagged_for_review);
  const held = funding.filter((f) => f.status === 'held_for_review');

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-line pb-2">
        {([
          { key: 'purchases', label: 'Purchases' },
          { key: 'funding', label: `Funding${held.length ? ` (${held.length} held)` : ''}` },
          { key: 'flagged', label: `Flagged (${flagged.length})` },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-xl ${tab === t.key ? 'bg-brand-500 text-white' : 'text-text-muted hover:bg-surface'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'purchases' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-line">
                <th className="p-3 font-medium">Service</th>
                <th className="p-3 font-medium">Recipient</th>
                <th className="p-3 font-medium">Amount</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {purchases.map((tx) => (
                <tr key={tx.id}>
                  <td className="p-3 capitalize">{tx.service_type}</td>
                  <td className="p-3">{tx.recipient}</td>
                  <td className="p-3 amount">{formatNaira(tx.amount)}</td>
                  <td className="p-3"><StatusPill status={tx.status} /></td>
                  <td className="p-3 text-text-muted">{new Date(tx.created_at).toLocaleString('en-NG')}</td>
                  <td className="p-3">
                    {tx.status === 'success' && (
                      <button
                        onClick={() => setRefundTarget(tx)}
                        className="text-danger text-xs font-semibold underline"
                      >
                        Refund
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'funding' && (
        <div className="space-y-3">
          {held.length > 0 && (
            <p className="text-text-muted text-sm">
              {held.length} funding {held.length === 1 ? 'payment is' : 'payments are'} held because they would
              have pushed the wallet over its KYC-tier cap. The user was already charged by Flutterwave — raise
              their KYC tier first (in Supabase), then use Release to credit the wallet.
            </p>
          )}
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-line">
                <th className="p-3 font-medium">Amount</th>
                <th className="p-3 font-medium">Channel</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {funding.map((tx) => (
                <tr key={tx.id}>
                  <td className="p-3 amount">{formatNaira(tx.amount)}</td>
                  <td className="p-3 text-text-muted">{tx.channel ?? '—'}</td>
                  <td className="p-3"><StatusPill status={tx.status} /></td>
                  <td className="p-3 text-text-muted">{new Date(tx.created_at).toLocaleString('en-NG')}</td>
                  <td className="p-3">
                    {tx.status === 'held_for_review' && (
                      <button onClick={() => setReleaseTarget(tx)} className="text-brand-600 text-xs font-semibold underline">
                        Release
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {tab === 'flagged' && (
        <div className="space-y-3">
          <p className="text-text-muted text-sm">
            Transactions still ambiguous after the full requery backoff window (~2 hours) — check the VTpass
            dashboard directly for these using their request ID before taking any action.
          </p>
          {flagged.length === 0 ? (
            <p className="text-text-muted text-sm">Nothing flagged right now.</p>
          ) : (
            <div className="card divide-y divide-line">
              {flagged.map((tx) => (
                <div key={tx.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm capitalize">{tx.service_type} — {tx.recipient}</p>
                    <p className="text-text-muted text-xs">
                      {tx.requery_count} requery attempts · {new Date(tx.created_at).toLocaleString('en-NG')}
                    </p>
                  </div>
                  <p className="amount text-sm">{formatNaira(tx.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {refundTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-lg">
              Refund {formatNaira(refundTarget.amount)} — {refundTarget.service_type}
            </h3>
            <label className="block text-sm">
              <span className="text-text-muted mb-1 block">Reason (required, logged to admin_actions)</span>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                rows={3}
                className="w-full bg-white border border-line rounded-xl px-3 py-2 text-text-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
              />
            </label>
            {refundError && <p className="text-danger text-sm">{refundError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setRefundTarget(null); setRefundReason(''); setRefundError(null); }}
                className="px-4 py-2 text-sm text-text-muted hover:text-text-primary font-medium"
              >
                Cancel
              </button>
              <Button variant="danger" disabled={refundLoading} onClick={submitRefund}>
                {refundLoading ? 'Refunding…' : 'Confirm refund'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {releaseTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-lg">
              Release {formatNaira(releaseTarget.amount)} to wallet
            </h3>
            <p className="text-text-muted text-sm">
              Confirm the user's KYC tier has been raised enough to fit this amount — the function will reject
              the release otherwise.
            </p>
            <label className="block text-sm">
              <span className="text-text-muted mb-1 block">Reason (required, logged to admin_actions)</span>
              <textarea
                value={releaseReason}
                onChange={(e) => setReleaseReason(e.target.value)}
                rows={3}
                className="w-full bg-white border border-line rounded-xl px-3 py-2 text-text-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
              />
            </label>
            {releaseError && <p className="text-danger text-sm">{releaseError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setReleaseTarget(null); setReleaseReason(''); setReleaseError(null); }}
                className="px-4 py-2 text-sm text-text-muted hover:text-text-primary font-medium"
              >
                Cancel
              </button>
              <Button disabled={releaseLoading} onClick={submitRelease}>
                {releaseLoading ? 'Releasing…' : 'Confirm release'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
