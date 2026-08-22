-- 0004_functions.sql
-- All functions are security definer with pinned search_path. Only ever
-- called via the Supabase service role from server-side code.
--
-- This file includes the fixes from the security & financial-integrity
-- review — see README "Security & Financial Integrity Review" section for
-- the full writeup of each issue and why it mattered.

-- ============================================================
-- credit_wallet_from_funding
-- SECURITY FIX: now binds and validates transaction ID, tx_ref, amount,
-- currency, and funding owner (wallet.user_id == funding.user_id) before
-- crediting — not just amount as before. Also fixes a dead-end: funds
-- that exceed the KYC wallet cap are now held in a genuinely distinct
-- 'held_for_review' status (not silently marked 'successful'), so they
-- can actually be released later via admin_release_held_funding once the
-- admin raises the user's tier — previously that money was gone for good,
-- because 'successful' short-circuited any future credit attempt.
-- ============================================================
create or replace function credit_wallet_from_funding(
  p_tx_ref text,
  p_flw_transaction_id text,
  p_amount bigint,
  p_currency text
) returns table (result_status text, new_balance bigint) as $$
declare
  v_funding funding_transactions%rowtype;
  v_wallet wallets%rowtype;
  v_cap bigint;
  v_ledger_ref text;
begin
  if p_flw_transaction_id is null or length(trim(p_flw_transaction_id)) = 0 then
    raise exception 'flw_transaction_id is required';
  end if;

  select * into v_funding from funding_transactions where tx_ref = p_tx_ref for update;

  if not found then
    raise exception 'funding_transaction not found for tx_ref %', p_tx_ref;
  end if;

  -- Idempotent no-op ONLY for genuinely completed credits. 'held_for_review'
  -- is deliberately excluded — see admin_release_held_funding for how those finish.
  if v_funding.status = 'successful' then
    select balance into new_balance from wallets where id = v_funding.wallet_id;
    return query select 'already_processed'::text, new_balance;
    return;
  end if;

  if v_funding.status = 'held_for_review' then
    return query select 'held_for_review'::text, null::bigint;
    return;
  end if;

  -- Binding check: once a transaction ID has been associated with this
  -- funding row, it can never be swapped for a different one on a retry —
  -- prevents a buggy or malicious caller from re-crediting the same tx_ref
  -- against an unrelated Flutterwave transaction.
  if v_funding.flw_transaction_id is not null and v_funding.flw_transaction_id <> p_flw_transaction_id then
    raise exception 'flw_transaction_id mismatch for tx_ref % (existing %, got %) — possible tampering',
      p_tx_ref, v_funding.flw_transaction_id, p_flw_transaction_id;
  end if;

  if v_funding.amount <> p_amount then
    raise exception 'amount mismatch for tx_ref %: expected %, got %', p_tx_ref, v_funding.amount, p_amount;
  end if;

  -- Currency binding: without this, a transaction verified as "successful"
  -- in a different currency than what we expect (NGN) would be credited at
  -- face value in kobo regardless of real value received.
  if upper(trim(v_funding.currency)) <> upper(trim(p_currency)) then
    raise exception 'currency mismatch for tx_ref %: expected %, got %', p_tx_ref, v_funding.currency, p_currency;
  end if;

  select * into v_wallet from wallets where id = v_funding.wallet_id for update;

  -- Owner binding: the wallet resolved via funding.wallet_id must belong to
  -- the same user who initiated the funding. This can only diverge through a
  -- data-integrity bug elsewhere, but a financial credit path should never
  -- rely on that not happening — assert it explicitly.
  if v_wallet.user_id <> v_funding.user_id then
    raise exception 'wallet/user mismatch for funding %: wallet belongs to %, funding belongs to %',
      v_funding.id, v_wallet.user_id, v_funding.user_id;
  end if;

  select wallet_cap into v_cap from kyc_tiers kt
    join profiles p on p.kyc_tier = kt.tier
    where p.id = v_wallet.user_id;

  if v_wallet.balance + p_amount > v_cap then
    update funding_transactions
      set status = 'held_for_review', flw_transaction_id = p_flw_transaction_id, verified_at = now(), updated_at = now()
      where id = v_funding.id;

    insert into admin_actions (admin_id, action_type, target_user_id, amount, reason)
      values (v_wallet.user_id, 'wallet_adjustment', v_wallet.user_id, p_amount,
              'Funding exceeded KYC wallet cap — held for manual review, not auto-credited. Release via admin_release_held_funding once resolved.');

    return query select 'held_for_review'::text, v_wallet.balance;
    return;
  end if;

  v_ledger_ref := 'fund_' || v_funding.id::text;

  insert into wallet_ledger (wallet_id, entry_type, amount, balance_before, balance_after, reference, related_funding_id)
    values (v_wallet.id, 'funding_credit', p_amount, v_wallet.balance, v_wallet.balance + p_amount, v_ledger_ref, v_funding.id);

  update wallets set balance = balance + p_amount, version = version + 1, updated_at = now()
    where id = v_wallet.id returning balance into new_balance;

  update funding_transactions
    set status = 'successful', flw_transaction_id = p_flw_transaction_id, verified_at = now(), updated_at = now()
    where id = v_funding.id;

  return query select 'credited'::text, new_balance;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- admin_release_held_funding — NEW
-- Completes a funding that was held for exceeding the KYC wallet cap, once
-- an admin has resolved the underlying issue (typically raising the user's
-- tier). Without this function, credit_wallet_from_funding's idempotency
-- guard meant held funds could never be credited — this closes that gap.
-- ============================================================
create or replace function admin_release_held_funding(
  p_admin_id uuid,
  p_funding_id uuid,
  p_reason text
) returns table (result_status text, new_balance bigint) as $$
declare
  v_funding funding_transactions%rowtype;
  v_wallet wallets%rowtype;
  v_cap bigint;
  v_ledger_ref text;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'release reason is required';
  end if;

  select * into v_funding from funding_transactions where id = p_funding_id for update;
  if not found then
    raise exception 'funding_transaction not found: %', p_funding_id;
  end if;

  if v_funding.status <> 'held_for_review' then
    raise exception 'can only release a held_for_review funding, current status: %', v_funding.status;
  end if;

  select * into v_wallet from wallets where id = v_funding.wallet_id for update;

  select wallet_cap into v_cap from kyc_tiers kt
    join profiles p on p.kyc_tier = kt.tier
    where p.id = v_wallet.user_id;

  -- Still over cap (admin hasn't actually raised the tier yet) — refuse
  -- rather than silently bypassing the same control that held it in the
  -- first place. The admin must raise the tier before releasing.
  if v_wallet.balance + v_funding.amount > v_cap then
    raise exception 'wallet cap still exceeded for this tier — raise the user''s KYC tier before releasing';
  end if;

  v_ledger_ref := 'fund_' || v_funding.id::text;

  insert into wallet_ledger (wallet_id, entry_type, amount, balance_before, balance_after, reference, related_funding_id, created_by, note)
    values (v_wallet.id, 'funding_credit', v_funding.amount, v_wallet.balance, v_wallet.balance + v_funding.amount,
            v_ledger_ref, v_funding.id, p_admin_id, p_reason);

  update wallets set balance = balance + v_funding.amount, version = version + 1, updated_at = now()
    where id = v_wallet.id returning balance into new_balance;

  update funding_transactions set status = 'successful', updated_at = now() where id = p_funding_id;

  insert into admin_actions (admin_id, action_type, target_user_id, amount, reason)
    values (p_admin_id, 'wallet_adjustment', v_funding.user_id, v_funding.amount, p_reason);

  return query select 'released'::text, new_balance;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- lock_wallet_funds
-- BUG FIX: the daily-limit calculation previously summed BOTH
-- 'purchase_lock' and 'purchase_debit' ledger entries for the day. Every
-- successful purchase writes one of each (lock at request time, debit at
-- settlement) — meaning a single ₦5,000 purchase counted as ₦10,000 against
-- the daily limit, cutting real usable capacity roughly in half. This now
-- reads directly from service_transactions and counts each transaction's
-- amount exactly once, keyed by its current status: 'processing'/
-- 'pending_verify' = still locked and unresolved, 'success' = settled.
-- 'failed'/'refunded' are correctly excluded since those funds were
-- returned to the wallet.
-- ============================================================
create or replace function lock_wallet_funds(
  p_user_id uuid,
  p_wallet_id uuid,
  p_amount bigint,
  p_service_tx_id uuid
) returns table (result_status text, ledger_id bigint) as $$
declare
  v_wallet wallets%rowtype;
  v_tier record;
  v_daily_spent bigint;
  v_ledger_id bigint;
begin
  select * into v_wallet from wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'wallet not found: %', p_wallet_id;
  end if;

  select kt.* into v_tier from kyc_tiers kt
    join profiles p on p.kyc_tier = kt.tier
    where p.id = p_user_id;

  if p_amount > v_tier.per_tx_limit then
    return query select 'exceeds_tx_limit'::text, null::bigint;
    return;
  end if;

  select coalesce(sum(amount), 0) into v_daily_spent
    from service_transactions
    where wallet_id = p_wallet_id
      and created_at >= date_trunc('day', now())
      and status in ('processing', 'pending_verify', 'success');

  if v_daily_spent + p_amount > v_tier.daily_limit then
    return query select 'exceeds_daily_limit'::text, null::bigint;
    return;
  end if;

  if (v_wallet.balance - v_wallet.locked_balance) < p_amount then
    return query select 'insufficient_balance'::text, null::bigint;
    return;
  end if;

  insert into wallet_ledger (wallet_id, entry_type, amount, balance_before, balance_after, reference, related_service_tx_id)
    values (p_wallet_id, 'purchase_lock', p_amount, v_wallet.balance, v_wallet.balance,
            'lock_' || p_service_tx_id::text, p_service_tx_id)
    returning id into v_ledger_id;

  update wallets set locked_balance = locked_balance + p_amount, version = version + 1, updated_at = now()
    where id = p_wallet_id;

  update service_transactions
    set wallet_locked_ledger_id = v_ledger_id, status = 'processing', updated_at = now()
    where id = p_service_tx_id;

  return query select 'locked'::text, v_ledger_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- settle_wallet_purchase — unchanged in logic, included for completeness
-- ============================================================
create or replace function settle_wallet_purchase(
  p_service_tx_id uuid,
  p_outcome text,
  p_provider_reference text,
  p_provider_response jsonb
) returns table (result_status text, new_balance bigint) as $$
declare
  v_tx service_transactions%rowtype;
  v_wallet wallets%rowtype;
  v_settle_ledger_id bigint;
begin
  select * into v_tx from service_transactions where id = p_service_tx_id for update;
  if not found then
    raise exception 'service_transaction not found: %', p_service_tx_id;
  end if;

  if v_tx.status in ('success', 'failed', 'refunded') then
    select balance into new_balance from wallets where id = v_tx.wallet_id;
    return query select 'already_settled'::text, new_balance;
    return;
  end if;

  select * into v_wallet from wallets where id = v_tx.wallet_id for update;

  if v_wallet.user_id <> v_tx.user_id then
    raise exception 'wallet/user mismatch for service_transaction %: wallet belongs to %, transaction belongs to %',
      v_tx.id, v_wallet.user_id, v_tx.user_id;
  end if;

  if p_outcome = 'success' then
    insert into wallet_ledger (wallet_id, entry_type, amount, balance_before, balance_after, reference, related_service_tx_id)
      values (v_wallet.id, 'purchase_debit', v_tx.amount, v_wallet.balance, v_wallet.balance - v_tx.amount,
              'debit_' || p_service_tx_id::text, p_service_tx_id)
      returning id into v_settle_ledger_id;

    update wallets
      set balance = balance - v_tx.amount, locked_balance = locked_balance - v_tx.amount,
          version = version + 1, updated_at = now()
      where id = v_wallet.id returning balance into new_balance;

    update service_transactions
      set status = 'success', provider_reference = p_provider_reference,
          provider_response = p_provider_response, wallet_settled_ledger_id = v_settle_ledger_id, updated_at = now()
      where id = p_service_tx_id;

    return query select 'success'::text, new_balance;

  elsif p_outcome = 'failed' then
    insert into wallet_ledger (wallet_id, entry_type, amount, balance_before, balance_after, reference, related_service_tx_id)
      values (v_wallet.id, 'purchase_unlock', v_tx.amount, v_wallet.balance, v_wallet.balance,
              'unlock_' || p_service_tx_id::text, p_service_tx_id)
      returning id into v_settle_ledger_id;

    update wallets set locked_balance = locked_balance - v_tx.amount, version = version + 1, updated_at = now()
      where id = v_wallet.id returning balance into new_balance;

    update service_transactions
      set status = 'failed', provider_reference = p_provider_reference,
          provider_response = p_provider_response, wallet_settled_ledger_id = v_settle_ledger_id, updated_at = now()
      where id = p_service_tx_id;

    return query select 'failed'::text, new_balance;
  else
    raise exception 'invalid outcome: %, must be success or failed', p_outcome;
  end if;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- schedule_next_requery — unchanged
-- ============================================================
create or replace function schedule_next_requery(p_service_tx_id uuid)
returns void as $$
declare
  v_tx service_transactions%rowtype;
  v_delays interval[] := array['30 seconds','1 minute','2 minutes','5 minutes',
                                 '10 minutes','15 minutes','30 minutes','1 hour']::interval[];
begin
  select * into v_tx from service_transactions where id = p_service_tx_id for update;

  if v_tx.requery_count >= array_length(v_delays, 1) then
    update service_transactions
      set flagged_for_review = true, next_requery_at = null, updated_at = now()
      where id = p_service_tx_id;
  else
    update service_transactions
      set requery_count = requery_count + 1,
          last_requeried_at = now(),
          next_requery_at = now() + v_delays[requery_count + 1],
          updated_at = now()
      where id = p_service_tx_id;
  end if;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- admin_refund_purchase
-- Added the same owner-binding assertion as settle_wallet_purchase, for
-- consistency — defense-in-depth, not a fix for an observed exploit path.
-- ============================================================
create or replace function admin_refund_purchase(
  p_admin_id uuid,
  p_service_tx_id uuid,
  p_reason text
) returns table (result_status text, new_balance bigint) as $$
declare
  v_tx service_transactions%rowtype;
  v_wallet wallets%rowtype;
  v_ledger_id bigint;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'refund reason is required';
  end if;

  select * into v_tx from service_transactions where id = p_service_tx_id for update;
  if v_tx.status <> 'success' then
    raise exception 'can only refund a settled successful transaction, current status: %', v_tx.status;
  end if;

  select * into v_wallet from wallets where id = v_tx.wallet_id for update;

  if v_wallet.user_id <> v_tx.user_id then
    raise exception 'wallet/user mismatch for service_transaction %: wallet belongs to %, transaction belongs to %',
      v_tx.id, v_wallet.user_id, v_tx.user_id;
  end if;

  insert into wallet_ledger (wallet_id, entry_type, amount, balance_before, balance_after, reference, related_service_tx_id, created_by, note)
    values (v_wallet.id, 'purchase_refund', v_tx.amount, v_wallet.balance, v_wallet.balance + v_tx.amount,
            'refund_' || p_service_tx_id::text, p_service_tx_id, p_admin_id, p_reason)
    returning id into v_ledger_id;

  update wallets set balance = balance + v_tx.amount, version = version + 1, updated_at = now()
    where id = v_wallet.id returning balance into new_balance;

  update service_transactions set status = 'refunded', updated_at = now() where id = p_service_tx_id;

  insert into admin_actions (admin_id, action_type, target_user_id, target_service_tx_id, amount, reason)
    values (p_admin_id, 'manual_refund', v_tx.user_id, p_service_tx_id, v_tx.amount, p_reason);

  return query select 'refunded'::text, new_balance;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- record_webhook_event
-- BUG FIX: dedupe now only checks against previously RECORDED-AND-VALID
-- rows for a given (provider_code, external_event_id). Previously, ANY
-- prior row — including one logged from an invalid-signature webhook —
-- would cause every later webhook sharing that event id (including a
-- legitimate, validly-signed one) to be classified 'duplicate' and
-- dropped without processing. Combined with the partial unique index
-- (0001_schema.sql, scoped to signature_valid = true), invalid events can
-- now repeat the same external_event_id freely without ever blocking the
-- real one. A concurrent-insert race between two valid webhooks for the
-- same event is handled via the unique_violation exception handler below,
-- which treats the loser as a duplicate rather than erroring out.
-- ============================================================
create or replace function record_webhook_event(
  p_provider_code text,
  p_event_type text,
  p_signature_valid boolean,
  p_external_event_id text,
  p_payload jsonb
) returns table (result_status text, event_id uuid) as $$
declare
  v_existing_id uuid;
  v_new_id uuid;
begin
  if p_external_event_id is not null and p_signature_valid then
    select id into v_existing_id from webhook_events
      where provider_code = p_provider_code
        and external_event_id = p_external_event_id
        and signature_valid = true;

    if found then
      return query select 'duplicate'::text, v_existing_id;
      return;
    end if;
  end if;

  begin
    insert into webhook_events (provider_code, event_type, signature_valid, external_event_id, payload)
      values (p_provider_code, p_event_type, p_signature_valid, p_external_event_id, p_payload)
      returning id into v_new_id;
  exception when unique_violation then
    -- A concurrent valid webhook for the same event id won the race.
    select id into v_existing_id from webhook_events
      where provider_code = p_provider_code
        and external_event_id = p_external_event_id
        and signature_valid = true;
    return query select 'duplicate'::text, v_existing_id;
    return;
  end;

  return query select 'recorded'::text, v_new_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- Privilege lockdown for all financial SECURITY DEFINER functions
-- SECURITY FIX: a SECURITY DEFINER function runs with its owner's
-- privileges (bypassing RLS), but Postgres grants EXECUTE on newly created
-- functions to PUBLIC by default — and Supabase's standard project bootstrap
-- extends that to the anon and authenticated roles used by PostgREST.
-- Without an explicit REVOKE, any authenticated user could call these
-- functions directly from the browser via
-- supabase.rpc('lock_wallet_funds', {...}) — completely bypassing every
-- check the Next.js API routes perform (session/ownership validation, rate
-- limiting, request validation, Flutterwave/VTpass verification) and
-- manipulating wallet balances directly through a trusted, RLS-bypassing
-- code path.
--
-- These functions must only ever be reachable via the service-role client
-- from server-side Next.js code (lib/supabase.ts → getServiceClient()),
-- which authenticates to Postgres as service_role. The application code
-- already only ever called them that way — this is what actually enforces
-- it at the database level, since nothing previously stopped a client from
-- ignoring the application and calling the RPC directly.
-- ============================================================

revoke execute on function credit_wallet_from_funding(text, text, bigint, text) from public, anon, authenticated;
grant execute on function credit_wallet_from_funding(text, text, bigint, text) to service_role;

revoke execute on function admin_release_held_funding(uuid, uuid, text) from public, anon, authenticated;
grant execute on function admin_release_held_funding(uuid, uuid, text) to service_role;

revoke execute on function lock_wallet_funds(uuid, uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function lock_wallet_funds(uuid, uuid, bigint, uuid) to service_role;

revoke execute on function settle_wallet_purchase(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function settle_wallet_purchase(uuid, text, text, jsonb) to service_role;

revoke execute on function schedule_next_requery(uuid) from public, anon, authenticated;
grant execute on function schedule_next_requery(uuid) to service_role;

revoke execute on function admin_refund_purchase(uuid, uuid, text) from public, anon, authenticated;
grant execute on function admin_refund_purchase(uuid, uuid, text) to service_role;

revoke execute on function record_webhook_event(text, text, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function record_webhook_event(text, text, boolean, text, jsonb) to service_role;
