'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Wifi, ShieldCheck, Tag, Headset, Smartphone, Tv } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase-browser';

const FEATURES = [
  { icon: Zap, title: 'Instant Delivery', desc: '24/7 Available' },
  { icon: ShieldCheck, title: 'Secure Payments', desc: '100% Safe' },
  { icon: Tag, title: 'Best Prices', desc: 'Low & Affordable' },
  { icon: Headset, title: 'Reliable Support', desc: "We're here to help" },
];

export default function HomePage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace('/dashboard');
      } else {
        setChecked(true);
      }
    });
  }, [router]);

  if (!checked) return null;

  return (
    <main className="bg-white">
      {/* Navbar */}
      <header className="border-b border-line">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-brand-500 text-white flex items-center justify-center">
              <Zap size={16} />
            </span>
            <span className="font-bold text-lg">QuickVTU</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
            <a href="#" className="text-brand-600">Home</a>
            <a href="#features" className="text-text-muted hover:text-text-primary">Services</a>
            <a href="#features" className="text-text-muted hover:text-text-primary">Pricing</a>
            <a href="#" className="text-text-muted hover:text-text-primary">About Us</a>
            <a href="#" className="text-text-muted hover:text-text-primary">Contact</a>
          </nav>
          <div className="flex items-center gap-4">
            <a href="/login" className="text-sm font-medium text-text-primary hidden sm:block">Login</a>
            <a href="/signup" className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600">
              Sign Up
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-16 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <span className="inline-block bg-brand-50 text-brand-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
            All Your VTU Needs
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight mb-4">
            One Wallet for <span className="text-brand-500">Everything</span>
          </h1>
          <p className="text-text-muted text-lg mb-8 max-w-md">
            Buy airtime, data, pay bills, and more with ease. Fast, secure, and reliable services at your fingertips.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="/signup" className="px-6 py-3 rounded-xl bg-brand-500 text-white font-semibold hover:bg-brand-600 shadow-sm">
              Get Started
            </a>
            <a href="/login" className="px-6 py-3 rounded-xl bg-white border border-line font-semibold hover:bg-surface">
              Fund Wallet
            </a>
          </div>
        </div>

        {/* Decorative phone preview — static mockup, not a live/interactive
            component. No real actions are wired to it; it only illustrates
            what the dashboard looks like once logged in. */}
        <div className="flex justify-center">
          <div className="w-64 rounded-[2.5rem] border-8 border-[#14132B] bg-[#14132B] shadow-elevated overflow-hidden">
            <div className="bg-white rounded-[1.8rem] overflow-hidden">
              <div className="bg-gradient-to-br from-brand-500 to-brand-700 text-white p-4 pt-8">
                <p className="text-white/80 text-xs">Wallet Balance</p>
                <p className="text-2xl font-bold amount">₦24,560.00</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  {[Smartphone, Wifi, Zap, Tv].map((Icon, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <span className="w-9 h-9 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Icon size={16} />
                      </span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-semibold text-text-muted mb-1.5">Recent Transactions</p>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-text-muted">Airtime Purchase</span><span className="font-medium">₦500.00</span></div>
                    <div className="flex justify-between"><span className="text-text-muted">Data Purchase</span><span className="font-medium">₦1,500.00</span></div>
                    <div className="flex justify-between"><span className="text-text-muted">Wallet Funding</span><span className="font-medium">₦5,000.00</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section id="features" className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5 flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                <f.icon size={18} />
              </span>
              <div>
                <p className="font-semibold text-sm">{f.title}</p>
                <p className="text-text-muted text-xs">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
