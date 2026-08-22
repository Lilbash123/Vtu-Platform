'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, ShieldCheck } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase-browser';
import { TextField, Button } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = getBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }

    // "Remember me" real (if modest) effect: when unchecked, end the session
    // when the tab closes rather than persisting across browser restarts.
    // This doesn't touch the underlying session storage/cookie mechanism
    // Supabase Auth + middleware rely on, so it can't destabilize auth —
    // it's a best-effort sign-out attempt on tab close, not a silent no-op.
    if (!rememberMe) {
      window.addEventListener('beforeunload', () => {
        supabase.auth.signOut();
      });
    }

    router.push('/dashboard');
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('Enter your email above first, then click "Forgot password?"');
      return;
    }
    setError(null);
    const supabase = getBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (resetError) {
      setError(resetError.message);
    } else {
      setResetMessage('Password reset link sent — check your email.');
    }
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
          <h1 className="text-xl font-bold text-center mb-1">Welcome Back</h1>
          <p className="text-text-muted text-sm text-center mb-5">Login to your account</p>

          <div className="flex border-b border-line mb-5">
            <span className="flex-1 text-center pb-2.5 text-sm font-semibold text-brand-600 border-b-2 border-brand-500">Login</span>
            <a href="/signup" className="flex-1 text-center pb-2.5 text-sm font-medium text-text-muted hover:text-text-primary">
              Create Account
            </a>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <TextField
              label="Email or Phone Number"
              type="email"
              required
              placeholder="Enter email or phone number"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              label="Password"
              type="password"
              required
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-text-muted">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-line text-brand-500 focus:ring-brand-200"
                />
                Remember me
              </label>
              <button type="button" onClick={handleForgotPassword} className="text-brand-500 font-medium hover:underline">
                Forgot password?
              </button>
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}
            {resetMessage && <p className="text-success text-sm">{resetMessage}</p>}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Signing in…' : 'Login'}
            </Button>

            <p className="text-text-muted text-sm text-center">
              Don't have an account? <a href="/signup" className="text-brand-500 font-medium">Sign up</a>
            </p>
          </form>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-text-muted text-xs mt-4">
          <ShieldCheck size={14} /> Secure. Fast. Reliable.
        </p>
      </div>
    </main>
  );
}
