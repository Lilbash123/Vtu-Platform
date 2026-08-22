'use client';

import { useEffect, useState } from 'react';
import { Menu, Bell } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase-browser';
import { Sidebar } from '@/components/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name, kyc_status')
        .eq('id', data.user.id)
        .single();
      setIsAdmin(profile?.role === 'admin');
      setName(profile?.full_name ?? data.user.email ?? null);
      setKycStatus(profile?.kyc_status ?? null);
    });
  }, []);

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar isAdmin={isAdmin} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex-1 min-w-0">
        <header className="bg-white border-b border-line sticky top-0 z-30">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileOpen(true)} className="lg:hidden text-text-muted">
                <Menu size={22} />
              </button>
              <div>
                <p className="text-text-muted text-sm">Good morning,</p>
                <p className="font-semibold">{name ?? 'there'}</p>
              </div>
              {kycStatus === 'verified' && (
                <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-success bg-success-bg px-2 py-1 rounded-full">
                  ✓ Verified
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button className="text-text-muted hover:text-text-primary">
                <Bell size={20} />
              </button>
              <span className="w-9 h-9 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-semibold text-sm">
                {(name ?? '?')[0]?.toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 max-w-5xl mx-auto">{children}</main>
      </div>
    </div>
  );
}
