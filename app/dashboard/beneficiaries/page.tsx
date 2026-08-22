'use client';

import { Users } from 'lucide-react';
import { Breadcrumb, Card } from '@/components/ui';

// Honest placeholder — no beneficiaries backend exists yet. Listed in the
// sidebar per the reference design, but this page says so plainly rather
// than faking a working feature.
export default function BeneficiariesPage() {
  return (
    <div className="max-w-lg">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Beneficiaries' }]} />
      <h1 className="text-xl font-bold mb-4">Beneficiaries</h1>
      <Card className="text-center py-10">
        <Users size={32} className="mx-auto text-text-muted mb-3" />
        <p className="font-medium mb-1">Saved beneficiaries coming soon</p>
        <p className="text-text-muted text-sm">
          You'll be able to save frequent phone numbers, meters, and smartcards here for faster repeat purchases.
        </p>
      </Card>
    </div>
  );
}
