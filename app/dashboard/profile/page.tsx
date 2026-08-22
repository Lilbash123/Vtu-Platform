'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase-browser';
import { Breadcrumb, Card } from '@/components/ui';

export default function ProfilePage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [kycTier, setKycTier] = useState<number | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setEmail(data.user.email ?? '');
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone, kyc_status, kyc_tier')
        .eq('id', data.user.id)
        .single();
      setFullName(profile?.full_name ?? null);
      setPhone(profile?.phone ?? null);
      setKycStatus(profile?.kyc_status ?? null);
      setKycTier(profile?.kyc_tier ?? null);
    });
  }, []);

  return (
    <div className="max-w-lg">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile' }]} />
      <h1 className="text-xl font-bold mb-4">Profile</h1>

      <Card className="space-y-4">
        <Row label="Full name" value={fullName ?? '—'} />
        <Row label="Email" value={email} />
        <Row label="Phone" value={phone ?? '—'} />
        <Row label="KYC status" value={kycStatus ?? '—'} capitalize />
        <Row label="KYC tier" value={kycTier !== null ? `Tier ${kycTier}` : '—'} />
      </Card>
    </div>
  );
}

function Row({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-line pb-3 last:border-0 last:pb-0">
      <span className="text-text-muted text-sm">{label}</span>
      <span className={`font-medium text-sm ${capitalize ? 'capitalize' : ''}`}>{value}</span>
    </div>
  );
}
