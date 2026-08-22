-- 0003_rls.sql
-- RLS governs READS. All WRITES to financial tables happen exclusively via
-- security definer RPC functions (0004_functions.sql) called through the
-- service role from server-side API routes. Regular users have no insert/
-- update/delete policies on any financial table.

alter table profiles enable row level security;
alter table wallets enable row level security;
alter table wallet_ledger enable row level security;
alter table funding_transactions enable row level security;
alter table service_transactions enable row level security;
alter table admin_actions enable row level security;
alter table webhook_events enable row level security;
alter table providers enable row level security;
alter table service_variations enable row level security;
alter table kyc_tiers enable row level security;

create policy "profiles_select_own" on profiles for select using (id = auth.uid());

-- SECURITY FIX: the original version of this policy only pinned `role`,
-- which left kyc_tier and is_active writable by any authenticated user via
-- a direct client call (e.g. supabase.from('profiles').update({kyc_tier:2})).
-- Since kyc_tier drives lock_wallet_funds' per-tx/daily limits and is_active
-- gates login, that gap let a user grant themselves higher transaction
-- limits or reactivate a suspended account, entirely bypassing every
-- server-side control. All three privileged columns must now match their
-- existing stored value — only full_name/phone are actually editable here.
create policy "profiles_update_own" on profiles for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from profiles where id = auth.uid())
    and kyc_tier = (select kyc_tier from profiles where id = auth.uid())
    and is_active = (select is_active from profiles where id = auth.uid())
  );
create policy "profiles_admin_select_all" on profiles for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "wallets_select_own" on wallets for select using (user_id = auth.uid());
create policy "wallets_admin_select_all" on wallets for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "ledger_select_own" on wallet_ledger for select using (
  wallet_id in (select id from wallets where user_id = auth.uid())
);
create policy "ledger_admin_select_all" on wallet_ledger for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "funding_select_own" on funding_transactions for select using (user_id = auth.uid());
create policy "funding_admin_select_all" on funding_transactions for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "service_tx_select_own" on service_transactions for select using (user_id = auth.uid());
create policy "service_tx_admin_select_all" on service_transactions for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "admin_actions_admin_select" on admin_actions for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "webhook_events_admin_select" on webhook_events for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "providers_public_select" on providers for select using (true);
create policy "variations_public_select" on service_variations for select using (true);
create policy "kyc_tiers_public_select" on kyc_tiers for select using (true);
