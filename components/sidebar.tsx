'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Wallet, Smartphone, Wifi, Zap, Tv,
  Receipt, Users, User, Settings, LogOut, Zap as Logo, Shield,
} from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase-browser';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/fund', label: 'Fund Wallet', icon: Wallet },
  { href: '/dashboard/airtime', label: 'Buy Airtime', icon: Smartphone },
  { href: '/dashboard/data', label: 'Buy Data', icon: Wifi },
  { href: '/dashboard/electricity', label: 'Electricity', icon: Zap },
  { href: '/dashboard/cable', label: 'Cable TV', icon: Tv },
  { href: '/dashboard/transactions', label: 'Transactions', icon: Receipt },
  { href: '/dashboard/beneficiaries', label: 'Beneficiaries', icon: Users },
  { href: '/dashboard/profile', label: 'Profile', icon: User },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ isAdmin, mobileOpen, onClose }: { isAdmin: boolean; mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  const content = (
    <div className="h-full flex flex-col bg-[#14132B] text-white w-64 shrink-0">
      <div className="px-5 py-5 flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
          <Logo size={16} />
        </span>
        <span className="font-bold text-lg">QuickVTU</span>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active ? 'bg-brand-500 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={18} />
              {item.label}
            </a>
          );
        })}
        {isAdmin && (
          <a
            href="/admin"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Shield size={18} />
            Admin
          </a>
        )}
      </nav>

      <div className="p-3 border-t border-white/10">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors w-full"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:block h-screen sticky top-0">{content}</div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <div className="absolute inset-y-0 left-0">{content}</div>
        </div>
      )}
    </>
  );
}
