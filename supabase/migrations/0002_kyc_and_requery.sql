-- 0002_kyc_and_requery.sql

create table kyc_tiers (
  tier smallint primary key,
  name text not null,
  per_tx_limit bigint not null,
  daily_limit bigint not null,
  wallet_cap bigint not null
);

insert into kyc_tiers (tier, name, per_tx_limit, daily_limit, wallet_cap) values
  (0, 'unverified', 500000, 1000000, 2000000),      -- ₦5,000 / ₦10,000 / ₦20,000
  (1, 'basic',      5000000, 20000000, 30000000),   -- ₦50,000 / ₦200,000 / ₦300,000
  (2, 'full',       50000000, 200000000, 500000000); -- ₦500,000 / ₦2,000,000 / ₦5,000,000

alter table profiles add column kyc_tier smallint not null default 0 references kyc_tiers(tier);

alter table service_transactions
  add column next_requery_at timestamptz,
  add column flagged_for_review boolean not null default false;

create index idx_service_tx_requery on service_transactions (next_requery_at) where status = 'pending_verify';
