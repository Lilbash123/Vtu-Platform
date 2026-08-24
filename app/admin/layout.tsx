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
  const [debug, setDebug] = useState<{
    userId: string;
    role: string;
    error: string;
  } | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      const supabase = getBrowserClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!user) {
        setDebug({
          userId: 'NO USER',
          role: 'N/A',
          error: userError?.message || 'User bai shiga login ba',
        });
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      setDebug({
        userId: user.id,
        role: profile?.role || 'NO ROLE',
        error: profileError?.message || 'NO ERROR',
      });

      if (profileError) return;

      if (profile?.role !== 'admin') return;

      setChecked(true);
    };

    checkAdmin();
  }, []);

  if (!checked) {
    return (
      <div className="min-h-screen bg-surface p-6">
        <div className="max-w-xl mx-auto bg-white border border-line rounded-xl p-6">
          <h1 className="text-xl font-bold mb-4">
            Admin Debug
          </h1>

          {debug ? (
            <div className="space-y-3 text-sm">
              <div>
                <strong>User ID:</strong>
                <p className="break-all">{debug.userId}</p>
              </div>

              <div>
                <strong>Role:</strong>
                <p>{debug.role}</p>
              </div>

              <div>
                <strong>Error:</strong>
                <p className="break-all">{debug.error}</p>
              </div>
            </div>
          ) : (
            <p>Checking admin access...</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-line">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/admin" className="font-bold text-brand-600">
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
