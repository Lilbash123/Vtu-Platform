'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase-browser';
import { TextField, Button } from '@/components/ui';

// Reached via the recovery link Supabase Auth emails from
// resetPasswordForEmail (triggered on /login). Supabase's client
// automatically establishes a recovery session from the URL fragment on
// load, so this only needs to call updateUser — no custom token handling.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = getBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push('/login'), 1500);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-surface">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="w-9 h-9 rounded-xl bg-brand-500 text-white flex items-center justify-center">
            <Zap size={18} />
          </span>
          <span className="font-bold text-xl">QuickVTU</span>
        </div>

        <div className="card p-6">
          {done ? (
            <p className="text-success text-sm text-center">Password updated — redirecting to login…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h1 className="text-lg font-bold text-center mb-1">Set a new password</h1>
              <TextField
                label="New password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {error && <p className="text-danger text-sm">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
