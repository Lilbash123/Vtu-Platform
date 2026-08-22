'use client';

import { InputHTMLAttributes, ButtonHTMLAttributes } from 'react';

export function TextField(props: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, className, ...rest } = props;
  return (
    <label className="block text-sm">
      <span className="text-text-muted mb-1.5 block font-medium">{label}</span>
      <input
        {...rest}
        className={`w-full bg-white border border-line rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted/60 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition-colors ${className ?? ''}`}
      />
    </label>
  );
}

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const { variant = 'primary', className, ...rest } = props;
  const base = 'px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const styles = {
    primary: 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm',
    secondary: 'bg-white text-text-primary border border-line hover:bg-surface',
    danger: 'bg-danger-bg text-danger border border-danger/20 hover:bg-danger/10',
  }[variant];
  return <button {...rest} className={`${base} ${styles} ${className ?? ''}`} />;
}

export function StatusPill({ status }: { status: string }) {
  const styleMap: Record<string, string> = {
    success: 'bg-success-bg text-success',
    successful: 'bg-success-bg text-success',
    credited: 'bg-success-bg text-success',
    released: 'bg-success-bg text-success',
    failed: 'bg-danger-bg text-danger',
    refunded: 'bg-danger-bg text-danger',
    pending: 'bg-pending-bg text-pending',
    pending_verify: 'bg-pending-bg text-pending',
    processing: 'bg-pending-bg text-pending',
    held_for_review: 'bg-amber-50 text-amber-600',
  };
  const style = styleMap[status] ?? 'bg-surface text-text-muted';
  const label = status.replace(/_/g, ' ');
  return (
    <span className={`status-pill capitalize ${style}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`card p-6 ${className ?? ''}`}>{children}</div>;
}

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="text-sm mb-4 flex items-center gap-1.5 flex-wrap">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {item.href ? (
            <a href={item.href} className="text-brand-500 hover:underline">{item.label}</a>
          ) : (
            <span className="text-text-muted">{item.label}</span>
          )}
          {i < items.length - 1 && <span className="text-text-muted/50">›</span>}
        </span>
      ))}
    </nav>
  );
}
