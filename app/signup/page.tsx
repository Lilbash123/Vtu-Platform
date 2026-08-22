'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, ShieldCheck, MailCheck } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase-browser';
import { TextField, Button } from '@/components/ui';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = getBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }, // picked up by the handle_new_user() trigger
    });

    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (!data.session) {
      setNeedsConfirmation(true);
      return;
    }

    router.push('/dashboard');
  }

  if (needsConfirmation) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 bg-surface">
        <div className="card max-w-sm w-full p-6 text-center space-y-3">
          <MailCheck size={32} className="mx-auto text-brand-500" />
          <h1 className="text-lg font-bold">Check your email</h1>
          <p className="text-text-muted text-sm">
            We sent a confirmation link to <span className="font-medium text-text-primary">{email}</span>. Confirm your account, then log in.
          </p>
          <a href="/login" className="text-brand-500 text-sm font-medium inline-block">Go to login</a>
        </div>
      </main>
    );
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
          <h1 className="text-xl font-bold text-center mb-1">Create Account</h1>
          <p className="text-text-muted text-sm text-center mb-5">Get started in less than a minute</p>

          <div className="flex border-b border-line mb-5">
            <a href="/login" className="flex-1 text-center pb-2.5 text-sm font-medium text-text-muted hover:text-text-primary">
              Login
            </a>
            <span className="flex-1 text-center pb-2.5 text-sm font-semibold text-brand-600 border-b-2 border-brand-500">Create Account</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <TextField label="Full Name" required placeholder="Enter your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <TextField label="Email" type="email" required placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField
              label="Password"
              type="password"
              required
              minLength={8}
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && <p className="text-danger text-sm">{error}</p>}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Creating account…' : 'Create Account'}
            </Button>

            <p className="text-text-muted text-sm text-center">
              Already have an account? <a href="/login" className="text-brand-500 font-medium">Log in</a>
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
