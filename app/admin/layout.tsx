'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase-browser';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const supabase = getBrowserClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        router.replace('/dashboard');
        return;
      }

      setChecked(true);
    };

    checkAdmin();
  }, [router]);

  if (!checked) return null;

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-line">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <a
            href="/admin"
            className="font-bold text-brand-600"
          >
            QuickVTU — Admin
          </a>

          <a
            href="/dashboard"
            className="text-sm text-text-muted hover:text-text-primary font-medium"
          >
            ← Back to dashboard
          </a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {children}
      </div>
    </div>
  );
}
