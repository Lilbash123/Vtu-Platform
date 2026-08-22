-- 0005_seed.sql
-- Sandbox-safe seed data only. No credentials — those live in env vars.

insert into providers (code, type, is_active, config) values
  ('flutterwave', 'payment', true, '{}'),
  ('vtpass', 'vtu', true, '{}')
on conflict (code) do nothing;

-- Illustrative catalog rows — replace with real sync job output before launch.
insert into service_variations (provider_id, service_type, network_or_disco, variation_code, name, cost_price, sale_price)
select id, 'data', 'mtn', 'mtn-1gb-30d', 'MTN 1GB - 30 Days', 30000, 35000 from providers where code = 'vtpass'
union all
select id, 'data', 'mtn', 'mtn-2gb-30d', 'MTN 2GB - 30 Days', 55000, 62000 from providers where code = 'vtpass'
union all
select id, 'data', 'glo', 'glo-1gb-30d', 'Glo 1GB - 30 Days', 27000, 32000 from providers where code = 'vtpass'
union all
select id, 'cable', 'dstv', 'dstv-padi', 'DStv Padi', 250000, 250000 from providers where code = 'vtpass'
union all
select id, 'electricity', 'ikeja-electric', 'ikeja-prepaid', 'Ikeja Electric Prepaid', 0, 0 from providers where code = 'vtpass'
on conflict (provider_id, variation_code) do nothing;

-- To make a user an admin after they sign up, run manually in the SQL editor:
-- update profiles set role = 'admin' where id = '<their auth.users id>';
