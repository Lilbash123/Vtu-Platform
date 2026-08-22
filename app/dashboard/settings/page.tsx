'use client';

import { Settings } from 'lucide-react';
import { Breadcrumb, Card } from '@/components/ui';

// Honest placeholder — no settings backend exists yet.
export default function SettingsPage() {
  return (
    <div className="max-w-lg">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Settings' }]} />
      <h1 className="text-xl font-bold mb-4">Settings</h1>
      <Card className="text-center py-10">
        <Settings size={32} className="mx-auto text-text-muted mb-3" />
        <p className="font-medium mb-1">Account settings coming soon</p>
        <p className="text-text-muted text-sm">Password changes and notification preferences will live here.</p>
      </Card>
    </div>
  );
}
