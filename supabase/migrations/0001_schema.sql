-- 0001_schema.sql
-- Core tables: profiles, wallets, ledger, providers, variations, funding,
-- service transactions, webhook events, admin actions.
-- All amounts are bigint kobo (₦1 = 100 kobo) — never store money as float.

create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text unique,
  role text not null default 'user' check (role in ('user','admin','support')),
  kyc_status text not null default 'unverified' check (kyc_status in ('unverified','pending','verified','rejected')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade unique,
  balance bigint not null default 0 check (balance >= 0),
  locked_balance bigint not null default 0 check (locked_balance >= 0),
  currency text not null default 'NGN',
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null check (type in ('vtu','payment')),
  is_active boolean not null default true,
  config jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table service_variations (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id),
  service_type text not null check (service_type in ('airtime','data','electricity','cable','exam_pin')),
  network_or_disco text,
  variation_code text not null,
  name text not null,
  cost_price bigint not null,
  sale_price bigint not null,
  is_active boolean not null default true,
  last_synced_at timestamptz not null default now(),
  unique (provider_id, variation_code)
);

create table funding_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  wallet_id uuid not null references wallets(id),
  tx_ref text not null unique,
  flw_transaction_id text unique,  -- defense-in-depth: one real Flutterwave transaction can only ever credit one funding row
  amount bigint not null check (amount > 0),
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending','successful','failed','abandoned','held_for_review')),
  channel text,
  raw_webhook_payload jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_funding_pending on funding_transactions (status) where status = 'pending';

create table service_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  wallet_id uuid not null references wallets(id),
  provider_id uuid not null references providers(id),
  variation_id uuid references service_variations(id),
  service_type text not null check (service_type in ('airtime','data','electricity','cable','exam_pin')),
  recipient text not null,
  amount bigint not null check (amount > 0),
  request_id text not null unique,
  idempotency_key text,  -- client-supplied key for safe retry of the same logical purchase
  provider_reference text,
  status text not null default 'pending' check (status in (
    'pending', 'processing', 'success', 'failed', 'pending_verify', 'refunded'
  )),
  provider_response jsonb,
  wallet_locked_ledger_id bigint,
  wallet_settled_ledger_id bigint,
  requery_count int not null default 0,
  last_requeried_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_service_tx_active on service_transactions (status) where status in ('pending','processing','pending_verify');
-- One idempotency key per user can only ever back one transaction — lets the
-- purchase route safely detect and return an in-flight/completed duplicate
-- instead of creating (and re-locking funds for) a second one.
create unique index idx_service_tx_idempotency on service_transactions (user_id, idempotency_key) where idempotency_key is not null;

create table wallet_ledger (
  id bigint generated always as identity primary key,
  wallet_id uuid not null references wallets(id),
  entry_type text not null check (entry_type in (
    'funding_credit', 'purchase_debit', 'purchase_lock',
    'purchase_unlock', 'purchase_refund', 'admin_adjustment'
  )),
  amount bigint not null,
  balance_before bigint not null,
  balance_after bigint not null,
  reference text not null unique,
  related_funding_id uuid references funding_transactions(id),
  related_service_tx_id uuid references service_transactions(id),
  created_by uuid references profiles(id),
  note text,
  created_at timestamptz not null default now()
);
create index idx_ledger_wallet on wallet_ledger (wallet_id, created_at desc);

alter table service_transactions
  add constraint fk_locked_ledger foreign key (wallet_locked_ledger_id) references wallet_ledger(id),
  add constraint fk_settled_ledger foreign key (wallet_settled_ledger_id) references wallet_ledger(id);

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null,
  event_type text,
  signature_valid boolean not null,
  external_event_id text,
  payload jsonb not null,
  processed boolean not null default false,
  processing_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
-- Scoped to signature_valid = true ONLY. If this were unconditional, a single
-- spoofed/corrupted webhook sharing an event id would permanently occupy that
-- id and cause every subsequent — including the real, validly-signed — webhook
-- for that same event to be misread as a duplicate and silently dropped.
-- Invalid-signature events are still logged (for audit) but never block a
-- later valid one, and can repeat the same external_event_id freely.
create unique index idx_webhook_dedupe on webhook_events (provider_code, external_event_id)
  where external_event_id is not null and signature_valid = true;

create table admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references profiles(id),
  action_type text not null check (action_type in (
    'wallet_adjustment','manual_refund','manual_requery','user_suspend','user_reactivate'
  )),
  target_user_id uuid references profiles(id),
  target_service_tx_id uuid references service_transactions(id),
  amount bigint,
  reason text not null,
  created_at timestamptz not null default now()
);

-- Auto-create a profile + wallet whenever a new auth user signs up.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  insert into public.wallets (user_id) values (new.id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
