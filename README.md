# VTU Platform

A standalone, wallet-based VTU (airtime, data, cable, electricity) platform.
Next.js + Supabase (Postgres) + Flutterwave + VTpass + Vercel.

No mock transactions anywhere — every purchase and funding path calls the
real Flutterwave/VTpass APIs (in sandbox/test mode until you switch to live
credentials). No real API keys or secrets are included in this project;
`.env.example` contains placeholders only.

---

## What's included

- **Database**: 5 SQL migrations — full schema, KYC tiers, RLS policies, all
  atomic Postgres functions, sandbox-safe seed data
- **API layer**: 7 route handlers covering funding, purchase, both provider
  webhooks, the requery cron job, and admin refunds
- **Auth**: Supabase Auth (email/password), with a trigger that auto-creates
  a `profiles` row and a `wallets` row for every new signup
- **User dashboard**: wallet balance, fund-wallet flow (Flutterwave
  checkout), airtime/data/cable/electricity purchase forms, transaction
  history
- **Admin dashboard**: purchase and funding transaction tables, a queue of
  transactions flagged after exhausting requery attempts, a refund control,
  and a release control for funding held against the KYC wallet cap (both
  require a reason, both logged to `admin_actions`)

This build includes a full security & financial-integrity review pass —
see Section 8 for the complete list of what was found and fixed (RLS
privilege escalation, funding verification binding, webhook dedupe,
daily-limit double-counting, a funds-stuck-forever bug, and purchase
idempotency).

## UI redesign (branded "QuickVTU")

The frontend was redesigned to a light, purple/indigo fintech visual style
with a sidebar dashboard, dedicated per-service purchase pages, and a real
marketing homepage — replacing the earlier dark, single-column layout.
**Nothing under `lib/`, `supabase/migrations/`, `app/api/**`, or
`middleware.ts` changed as part of this** — every form, button, and admin
action still calls the exact same API routes with the exact same payload
shapes as before.

What changed, structurally:
- `components/purchase-panel.tsx` (a single tabbed form) was retired in
  favor of four dedicated pages — `/dashboard/airtime`, `/dashboard/data`,
  `/dashboard/electricity`, `/dashboard/cable` — each still posting to the
  same `/api/vtu/purchase` endpoint with the same `idempotencyKey` pattern.
  This avoids a duplicate purchase system existing alongside the old one.
- Fund Wallet moved from an inline dashboard form to its own
  `/dashboard/fund` page — same `/api/wallet/fund` call, same server-derived
  `APP_BASE_URL` redirect (still never client-supplied).
- Added `/dashboard/transactions` (full history) and `/dashboard/profile`
  (reads real `profiles`/`auth` data — no fabricated fields).
- Added honest placeholder pages for `/dashboard/beneficiaries` and
  `/dashboard/settings`, since the reference design's sidebar includes them
  but no backend exists for either yet — each page says plainly that the
  feature isn't built rather than presenting a form that doesn't do anything.
- Added a real "Forgot password?" flow (`supabase.auth.resetPasswordForEmail`
  + a new `/reset-password` page calling `supabase.auth.updateUser`) — both
  are built-in Supabase Auth capabilities, not new backend code.
- The homepage's phone-screen preview is a static, non-interactive mockup
  (illustrating what the dashboard looks like) — it has no click handlers
  and makes no claims of being live.
- Admin dashboard: only CSS classes changed. Every `useState`, the
  `apiFetch('/api/admin/refund', ...)` and
  `apiFetch('/api/admin/release-funding', ...)` calls, and their exact
  payload shapes are untouched — verified via diff against the pre-redesign
  version, not just a visual check.

---

## 1. Prerequisites

- Node.js 18+
- A Supabase project ([supabase.com](https://supabase.com))
- A Flutterwave account, test/sandbox API keys
  ([dashboard.flutterwave.com](https://dashboard.flutterwave.com))
- A VTpass account, sandbox API keys
  ([vtpass.com](https://vtpass.com) → Sandbox)
- An Upstash Redis database, free tier is enough for dev
  ([upstash.com](https://upstash.com))
- A Vercel account, for deployment + Cron (optional for local dev — you can
  trigger the requery endpoint manually while developing)

---

## 2. Install

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` with your own sandbox/test credentials — see the
comments in `.env.example` for where each one comes from. **Never commit
`.env.local`.**

Make sure `APP_BASE_URL` matches wherever the app is actually reachable
(`http://localhost:3000` for local dev, your real domain once deployed) —
it's what the Flutterwave redirect callback is built from, deliberately
never taken from client input (see the Security Review, "Open redirect"
finding).

---

## 3. Set up the database

In your Supabase project, run the migrations **in order** — either via the
SQL editor (paste each file's contents and run) or the Supabase CLI:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

Order matters — each migration builds on the previous one:

1. `0001_schema.sql` — core tables (profiles, wallets, ledger, providers,
   variations, funding/service transactions, webhook events, admin actions)
   plus the trigger that auto-creates a profile+wallet on signup
2. `0002_kyc_and_requery.sql` — KYC tier table + tier column on profiles,
   requery scheduling columns on service_transactions
3. `0003_rls.sql` — Row Level Security policies (reads only — all writes to
   financial tables go through the functions below, via the service role)
4. `0004_functions.sql` — the six atomic Postgres functions:
   `credit_wallet_from_funding`, `lock_wallet_funds`,
   `settle_wallet_purchase`, `schedule_next_requery`,
   `admin_refund_purchase`, `record_webhook_event`
5. `0005_seed.sql` — registers the two providers and a few illustrative data
   plan/cable variations so the purchase UI has something to show. **Replace
   these with a real VTpass catalog sync before going live** — the sample
   `variation_code` values are illustrative, not guaranteed to match
   VTpass's actual current catalog.

### Make yourself an admin

After signing up through the app once, promote your own account in the
Supabase SQL editor:

```sql
update profiles set role = 'admin' where id = 'your-auth-user-id';
```

(Find your user ID under Authentication → Users in the Supabase dashboard.)

---

## 4. Configure webhooks

**Flutterwave**: Dashboard → Settings → Webhooks →
`https://your-domain.com/api/webhooks/flutterwave`, and set the same secret
hash there as `FLUTTERWAVE_WEBHOOK_SECRET_HASH` in your env.

**VTpass**: their webhook auth scheme varies by account (shared secret
header vs IP allowlist) — confirm the current method for your account in
their dashboard/docs and adjust `verifyVtpassWebhookAuth` in `lib/vtpass.ts`
if it doesn't match the placeholder header-based check already there.

For local development, use a tunnel (`ngrok http 3000` or similar) so these
providers can reach your machine, and point the dashboard webhook URLs at
the tunnel URL instead.

---

## 5. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000`, sign up, and you'll land on the dashboard
with a ₦0 wallet.

---

## 6. Set up the requery cron

`vercel.json` already defines a cron job hitting `/api/cron/requery` every
minute once deployed to Vercel — Vercel automatically sends
`Authorization: Bearer $CRON_SECRET` for cron-triggered requests, matching
what the route checks for.

For local testing without deploying, call it manually:

```bash
curl -H "Authorization: Bearer your-cron-secret" http://localhost:3000/api/cron/requery
```

---

## 7. Testing the flows end-to-end

### Funding (Flutterwave test mode)

1. On the dashboard, enter an amount and click "Fund wallet"
2. You'll be redirected to Flutterwave's checkout — use their published
   [test card numbers](https://developer.flutterwave.com/docs/test-cards)
   (not included here since they're Flutterwave's published test data, not
   a secret — check their current docs, test card numbers do change)
3. On success, you're redirected back with `tx_ref`/`transaction_id` in the
   URL — the dashboard calls `/api/wallet/verify` automatically as a
   fallback in case the webhook hasn't arrived yet
4. Confirm the wallet balance updates, and check the `wallet_ledger` table
   in Supabase for a `funding_credit` row

### Purchases (VTpass sandbox)

1. From the dashboard, try each tab: Airtime, Data, Cable, Electricity
2. VTpass's sandbox typically returns deterministic test responses per
   their sandbox docs — check current VTpass documentation for their
   sandbox test recipient numbers/behavior, as these can change
3. Watch `service_transactions.status` move through
   `pending` → `processing` → `success`/`failed`, or `pending_verify` if
   VTpass's sandbox returns an ambiguous response — the requery cron (or
   your manual curl call above) should resolve it

### Idempotency (important to actually verify, not just trust)

- Re-send the same Flutterwave webhook payload twice (Flutterwave's
  dashboard has a "resend" button on webhook logs) — confirm the wallet is
  only credited once (`wallet_ledger` should have exactly one
  `funding_credit` row for that `tx_ref`)
- Call `/api/wallet/verify` after a webhook has already credited — confirm
  it returns `already_processed`/`already_credited` and doesn't double-credit
- Call `/api/vtu/purchase` twice with the identical `idempotencyKey` — confirm
  the second call returns the same `transactionId` and status instead of
  creating a second `service_transactions` row or locking funds twice
- Send a webhook with a deliberately invalid signature (wrong `verif-hash`)
  followed by a real, validly-signed webhook using the *same* event ID —
  confirm the valid one still processes and credits the wallet (this is the
  invalid-webhook-blocking-valid-webhook fix — worth actually exercising,
  not just trusting the code read)

### Admin refund

1. Promote your account to admin (Section 3)
2. Visit `/admin`, find a `success` purchase, click Refund, enter a reason
3. Confirm `service_transactions.status` becomes `refunded`, a
   `purchase_refund` row appears in `wallet_ledger`, and an entry appears in
   `admin_actions`

### Admin release (held funding)

1. Temporarily lower a test user's `kyc_tiers` wallet cap (or fund close to
   it) so a funding attempt lands in `held_for_review`
2. Confirm `funding_transactions.status = 'held_for_review'` and an
   `admin_actions` row was logged automatically
3. In `/admin` → Funding tab, without raising the tier first, click Release
   — confirm it's rejected (cap still exceeded)
4. Raise the user's `kyc_tier` in Supabase, click Release again — confirm
   it succeeds, the wallet balance increases, and the funding row becomes
   `successful`

---

## 8. Security & Financial Integrity Review

A dedicated review pass was done against wallet, ledger, refund, idempotency,
authentication, authorization, and webhook flows. Everything below was found
and fixed in this codebase — not just described.

### Critical

**RLS privilege escalation (profiles table).** The original
`profiles_update_own` policy only pinned the `role` column, leaving
`kyc_tier` and `is_active` writable by any authenticated user via a direct
client call — e.g. `supabase.from('profiles').update({ kyc_tier: 2 })` from
the browser, bypassing every server-side limit check entirely, since
`kyc_tier` is exactly what `lock_wallet_funds` uses to set per-transaction
and daily limits. **Fix**: the policy's `with check` now pins `kyc_tier` and
`is_active` alongside `role` — all three must match their existing stored
value; only `full_name`/`phone` are actually editable through this path.
(`supabase/migrations/0003_rls.sql`)

**Financial RPC functions were callable directly by any authenticated user
(found in follow-up review).** Postgres grants `EXECUTE` on newly created
functions to `PUBLIC` by default, and Supabase's standard project bootstrap
extends that to the `anon` and `authenticated` roles used by PostgREST.
Nothing in the original migrations revoked this — so despite every function
being `SECURITY DEFINER` and every Next.js route correctly routing through
the service-role client, a normal logged-in user could bypass the
application entirely and call, say,
`supabase.rpc('lock_wallet_funds', { p_user_id: ..., p_amount: 999999999,
... })` directly from the browser console — skipping every check the API
routes perform (ownership validation, rate limiting, request validation,
Flutterwave/VTpass verification) and manipulating wallet state through a
trusted, RLS-bypassing code path. **Fix**: added explicit
`revoke execute ... from public, anon, authenticated` /
`grant execute ... to service_role` statements for all seven functions
(the six core functions plus `admin_release_held_funding`). See
"Verifying the RPC lockdown" below for how to confirm this yourself against
a real Supabase project — I don't have a live Postgres/Supabase instance
available in the environment these fixes were built in, so this was
verified by exact signature cross-check against each `create or replace
function` statement, not by executing the grants. (`0004_functions.sql`)

### High

**Flutterwave verification wasn't fully bound.** `credit_wallet_from_funding`
checked `tx_ref` and `amount` but not `currency`, and didn't bind the
Flutterwave transaction ID to the funding row once set — so a mismatched
currency could be credited at face value, and nothing prevented a retried
call from silently swapping in a different transaction ID for the same
`tx_ref`. **Fix**: the function now validates transaction ID (binds on first
write, rejects mismatches after), `tx_ref`, `amount`, `currency`, and asserts
wallet-owner/funding-owner consistency, all before crediting. A `unique`
constraint on `funding_transactions.flw_transaction_id` backs this at the
schema level too. (`0001_schema.sql`, `0004_functions.sql`, both webhook and
verify-callback routes now pass `p_currency`)

**Invalid webhook could permanently block the real one.** `record_webhook_event`
deduped on `(provider_code, external_event_id)` regardless of signature
validity — so a single spoofed or corrupted webhook sharing an event ID
would occupy that ID forever, and every subsequent webhook for the same
event, including a legitimate one, was misread as a duplicate and silently
dropped. **Fix**: the dedupe index and function logic now only consider
`signature_valid = true` rows for deduplication. Invalid-signature events
are still logged for audit but can never block a later valid one; a
concurrent-insert race between two valid webhooks is resolved via a
`unique_violation` handler rather than surfacing an error.
(`0001_schema.sql`, `0004_functions.sql`)

**Daily KYC limit double-counted every successful purchase.** The limit
calculation summed both `purchase_lock` and `purchase_debit` ledger entries
for the day — but a single successful purchase writes both (lock at request
time, debit at settlement), so it counted twice against the limit, cutting
real usable daily capacity roughly in half. **Fix**: `lock_wallet_funds` now
reads directly from `service_transactions`, summing each transaction's
amount exactly once based on its current status (`processing`/
`pending_verify` = still locked, `success` = settled; `failed`/`refunded`
correctly excluded since those funds returned to the wallet).
(`0004_functions.sql`)

**Funds held for exceeding the KYC cap had no way to ever be credited.**
When a funding payment would have pushed a wallet over its tier's cap, the
original code marked `funding_transactions.status = 'successful'` (to
avoid losing the payment record) but never actually credited the wallet.
Because `credit_wallet_from_funding`'s idempotency check treats
`status = 'successful'` as "already processed," that money could never be
credited later — even after an admin raised the user's tier. The user paid
Flutterwave and the money simply had no path into their wallet. **Fix**:
added a real `held_for_review` status distinct from `successful`, plus a
new `admin_release_held_funding` function (and `/api/admin/release-funding`
route + admin UI action) that completes the credit once the tier is fixed —
re-checking the cap at release time so the same control can't be bypassed
by skipping the tier fix. (`0001_schema.sql`, `0004_functions.sql`,
`app/api/admin/release-funding/route.ts`, `app/admin/page.tsx`)

**Purchases had no idempotency — a retry meant a second real charge.**
Every call to `/api/vtu/purchase` created a brand-new `service_transactions`
row with a fresh `request_id`, regardless of whether it was a genuinely new
purchase or a client retry/double-submit of the same one. A network
timeout with client-side auto-retry, or a double-tap that slipped past the
UI's disabled-button guard, would lock funds and call VTpass a second time —
a real second charge for what the user experienced as one action. **Fix**:
added an optional client-supplied `idempotencyKey`, stored uniquely per
user on `service_transactions`; a repeated key returns the existing
transaction's state instead of creating a new one, with a `unique_violation`
handler covering the concurrent-request race. The dashboard now generates a
fresh key per purchase submission. (`0001_schema.sql`,
`app/api/vtu/purchase/route.ts`, `components/purchase-panel.tsx`)

**`/api/wallet/verify` didn't require the verified transaction to match the
funding record it had just checked ownership against (found in follow-up
review).** The route resolved the target funding row from the client's
`body.txRef` and confirmed the caller owns it — but the Flutterwave
transaction ID it then verified could come from the client too
(`body.flwTransactionId`), and Flutterwave's authoritative response for
*that* ID returns whatever `tx_ref` it's actually associated with, which is
never guaranteed to be the same `tx_ref` ownership was just checked
against. The credit call used that returned `tx_ref` directly, meaning a
caller who supplied a `flwTransactionId` belonging to a real, successful,
unrelated transaction could trigger a credit against a completely different
funding record than the one they were authorized for — potentially another
user's — using their own session. **Fix**: the route now requires
`verified.txRef === funding.tx_ref` exactly before calling the credit RPC
at all; on any mismatch it credits nothing and returns a `400`. The webhook
handler (which only ever receives a signature-verified `flwTransactionId`
from Flutterwave itself, not from an arbitrary caller, so this specific
vector doesn't apply there the same way) now also explicitly resolves the
verified transaction to a real, known `funding_transactions` row and
confirms amount and currency match *before* calling the credit RPC, rather
than relying solely on the RPC's own internal check to catch a mismatch —
that RPC-level check remains the actual race-safe enforcement (it holds a
row lock), but the route-level check now fails fast with a specific,
distinguishable log line instead of surfacing only as a generic RPC error.
(`app/api/wallet/verify/route.ts`, `app/api/webhooks/flutterwave/route.ts`)

### Medium

**Webhook endpoints had no rate limiting despite one being built.** A
`webhookLimiter` existed in `lib/rate-limit.ts` but neither webhook route
actually called it. **Fix**: both webhook handlers now check it (keyed by
provider, not IP, since providers send from shared IP pools) — over-limit
requests still get a `200` response rather than `429`, so as not to trigger
aggressive retry behavior from the provider itself while still blunting a
genuine flood. (`app/api/webhooks/flutterwave/route.ts`,
`app/api/webhooks/vtpass/route.ts`)

**Ownership assertions were implicit, not explicit.** `settle_wallet_purchase`
and `admin_refund_purchase` resolved the wallet via the transaction's
`wallet_id` without asserting that wallet actually belongs to the
transaction's `user_id`. In the current schema this can only diverge
through a data-integrity bug elsewhere, but a financial write path
shouldn't rely on that never happening. **Fix**: both functions now assert
wallet/user consistency explicitly and raise rather than silently
proceeding if it's ever violated. (`0004_functions.sql`)

**Open redirect via client-supplied `redirectUrl` (found in follow-up
review).** `/api/wallet/fund` took a `redirectUrl` field straight from the
request body and passed it to Flutterwave unmodified as the post-payment
redirect target. A caller could set this to any external domain — after a
real payment, Flutterwave would send the user (with their `tx_ref`/
`transaction_id` in the query string) to that attacker-controlled page
instead of back to this app, which is useful for phishing and for
borrowing legitimacy from a real payment flow on a trusted domain. **Fix**:
`redirectUrl` was removed from the client-facing schema entirely — the
redirect target is now always built server-side from a trusted, server-only
`APP_BASE_URL` environment variable. The client cannot influence it at all.
(`lib/validation.ts`, `app/api/wallet/fund/route.ts`,
`components/wallet-card.tsx`, `.env.example`)

### Reviewed, no issue found

- `settle_wallet_purchase` and `admin_refund_purchase` idempotency (status
  checks under row locks) — correct as originally built
- Lock ordering across functions (child row, then wallet row, consistently)
  — no deadlock risk identified
- `wallets`, `wallet_ledger`, `funding_transactions`, `service_transactions`,
  `admin_actions` RLS — select-only for regular users, no insert/update/
  delete policies exist, so the service role remains the only writer
- Auth token verification (`requireUser`/`requireAdmin`) — standard
  Supabase JWT verification against the anon client, no gaps found
- CSRF exposure — low; all API routes require an explicit `Authorization`
  bearer token, which browsers don't attach automatically cross-site
- `handle_new_user()` (the signup trigger, also `SECURITY DEFINER`) — not
  locked down like the seven RPCs above, but not exploitable the same way:
  it references `NEW`, which only exists inside a trigger context, so
  calling it directly via `select handle_new_user()` errors out rather than
  executing meaningfully. Left as-is rather than adding a lockdown that
  isn't actually closing a reachable gap.

### Verifying the RPC lockdown

I can't execute these grants against a live database from the environment
this project was built in — there's no Postgres instance available, and no
network access to reach a real Supabase project. What's actually been
verified is that each `revoke`/`grant` statement's function signature
matches its `create or replace function` definition exactly, argument type
for argument type (the check that matters — Postgres resolves overloaded
functions by signature, so a mismatched signature would silently target
the wrong function, or no function at all, without erroring).

Run this after applying the migrations to confirm the real behavior against
your own project — paste into the Supabase SQL editor:

```sql
select
  p.proname as function_name,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'credit_wallet_from_funding', 'lock_wallet_funds', 'settle_wallet_purchase',
    'schedule_next_requery', 'admin_refund_purchase', 'record_webhook_event',
    'admin_release_held_funding'
  );
```

Expect `anon_can_execute = false` and `authenticated_can_execute = false`
on every row, `service_role_can_execute = true` on every row. If any row
shows `true` for anon/authenticated, the lockdown didn't apply — re-run the
`revoke`/`grant` block from `0004_functions.sql` directly.

For a practical (not just introspective) check: log into the app as a
normal, non-admin user, open the browser console, and run:

```js
const { data, error } = await supabase.rpc('lock_wallet_funds', {
  p_user_id: '<your own user id>',
  p_wallet_id: '<your own wallet id>',
  p_amount: 100,
  p_service_tx_id: '00000000-0000-0000-0000-000000000000',
});
console.log(error);
```

Expect `error.code` to be `42501` ("permission denied for function
lock_wallet_funds") — not a business-logic error like `insufficient_balance`,
which would mean the call actually reached the function body.

## 9. UI Redesign — Verification Performed

**Important limitation, stated plainly**: this project was built in an
environment with no `node_modules` installed and no network access to run
`npm install`. That means I could not literally execute `npm run build` or
`tsc --noEmit` against this code. What follows is exactly what was checked
instead, and it's real verification — not a substitute claim dressed up to
sound like one.

Checked and passed:
- **Every `@/` import** across `app/`, `components/`, and `middleware.ts`
  resolves to a file that actually exists (scripted check, not a manual
  skim)
- **No references to the deleted `components/purchase-panel.tsx`** remain
  anywhere in the codebase
- **Every `apiFetch(...)` call site** in the new UI targets a route that
  already exists under `app/api/` — no new endpoints were created, and
  every payload shape (field names, `idempotencyKey`, etc.) matches what
  the existing route handlers expect
- **Every `.rpc(...)` call** still targets one of the same 7 functions from
  the security review — unchanged by this redesign
- **All npm packages imported** (including the newly added `lucide-react`)
  are declared in `package.json`
- **All environment variables referenced** are declared in `.env.example`
  — no new ones were introduced by this UI work
- **No secret-bearing env vars** (`SERVICE_ROLE`, `*_SECRET_KEY`,
  `*_SECRET_HASH`, `CRON_SECRET`) appear in any file marked `'use client'`
- **No client component imports `lib/flutterwave.ts` or `lib/vtpass.ts`
  directly** — all provider interaction still goes through the server-side
  API routes
- **Structural balance** (matching braces/parens) on every new and modified
  `.tsx` file
- **The admin page specifically**: diffed line-by-line against the
  pre-redesign version to confirm every `useState`, the `load()` callback,
  and both `apiFetch('/api/admin/refund', ...)` /
  `apiFetch('/api/admin/release-funding', ...)` calls (including their
  exact JSON payload shapes) are byte-identical — only `className` strings
  changed

What this doesn't catch that a real `tsc`/`next build` would: subtle type
errors (e.g. a prop typed slightly wrong that still "looks right" in a
grep-based check), and genuine runtime/bundling issues. Before deploying,
run `npm install && npx tsc --noEmit && npm run build` yourself — that's
the real gate this couldn't substitute for.

Functionally, this redesign is a visual layer over the same backend as
before: same Supabase Auth calls, same wallet/ledger RPCs, same Flutterwave
and VTpass integration, same admin refund/release logic, same security
fixes from Section 8. If you already tested those flows against the
previous ZIP, the underlying behavior hasn't changed — only how it looks.

## 10. Known assumptions to revisit before going live

1. **VTpass response codes** in `lib/vtpass.ts` are based on their commonly
   documented response shape — confirm against current docs for your
   account type; these have shifted before.
2. **VTpass webhook auth** header name/scheme in
   `verifyVtpassWebhookAuth` is a placeholder — confirm your account's
   actual method.
3. **Seed data variations** (`0005_seed.sql`) are illustrative — build a
   real catalog sync job against VTpass's live service-variation-codes
   endpoint before launch, running on a schedule (e.g. every 6 hours),
   upserting on `(provider_id, variation_code)` and deactivating rows no
   longer returned rather than deleting them.
4. **KYC tier limits** (`0002_kyc_and_requery.sql`) are sensible starting
   defaults, not regulatory requirements — tune against real fraud/chargeback
   data once live, and consult a compliance professional for anything at
   meaningful volume. Not legal advice.
5. **Admin promotion** is manual (direct SQL) in this build — there's no
   in-app "invite an admin" flow. Add one if you'll have more than a
   handful of admins.

---

## 11. Deploying

1. Push this project to a git repo, import it into Vercel
2. Add all `.env.example` variables (with real values) in Vercel's project
   settings — the cron job in `vercel.json` picks up automatically on deploy
3. Point Flutterwave's and VTpass's webhook URLs at your production domain
4. Switch `VTPASS_ENV` to `live` and use live keys only once you've
   validated the full flow in sandbox
