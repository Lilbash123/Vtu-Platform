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

export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'danger';
  }
) {
  const { variant = 'primary', className, ...rest } = props;

  const base =
    'px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

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

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`card p-6 ${className ?? ''}`}>{children}</div>;
}

export function Breadcrumb({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav className="text-sm mb-4 flex items-center gap-1.5 flex-wrap">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {item.href ? (
            <a href={item.href} className="text-brand-500 hover:underline">
              {item.label}
            </a>
          ) : (
            <span className="text-text-muted">{item.label}</span>
          )}

          {i < items.length - 1 && (
            <span className="text-text-muted/50">›</span>
          )}
        </span>
      ))}
    </nav>
  );
}

type TransactionResultStatus = 'success' | 'pending' | 'failed';

export function TransactionResultModal({
  status,
  message,
  onClose,
}: {
  status: TransactionResultStatus;
  message: string;
  onClose: () => void;
}) {
  const config = {
    success: {
      title: 'Transaction Successful',
      subtitle: 'Your purchase has been completed successfully.',
      icon: '✓',
      iconClass: 'bg-emerald-100 text-emerald-600',
      buttonClass: 'bg-emerald-600 hover:bg-emerald-700',
    },

    pending: {
      title: 'Transaction Pending',
      subtitle: 'Your transaction is being verified. Please wait.',
      icon: '⏳',
      iconClass: 'bg-amber-100 text-amber-600',
      buttonClass: 'bg-amber-500 hover:bg-amber-600',
    },

    failed: {
      title: 'Transaction Failed',
      subtitle: 'We could not complete this transaction.',
      icon: '×',
      iconClass: 'bg-red-100 text-red-600',
      buttonClass: 'bg-red-600 hover:bg-red-700',
    },
  }[status];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl animate-[modalIn_.25s_ease-out]">
        <div className="px-6 pt-8 pb-6 text-center">

          <div
            className={`mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full text-4xl font-bold ${config.iconClass}`}
          >
            {status === 'pending' ? (
              <span className="animate-pulse">{config.icon}</span>
            ) : (
              config.icon
            )}
          </div>

          <h2 className="text-xl font-bold text-gray-900">
            {config.title}
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-500">
            {config.subtitle}
          </p>

          <div className="mt-5 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
            {message}
          </div>

          {status === 'pending' && (
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-amber-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              Verification in progress
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className={`mt-6 w-full rounded-xl px-5 py-3 font-semibold text-sm text-white transition-colors ${config.buttonClass}`}
          >
            {status === 'success'
              ? 'Done'
              : status === 'pending'
                ? 'Got it'
                : 'Close'}
          </button>

        </div>
      </div>
    </div>
  );
}
