-- Optional landlord-provided estimate. No automatic valuation or market-data claims.
-- Apply and verify in Supabase before deploying the UI that writes this field.
alter table public.properties
  add column if not exists market_rent_estimate numeric(12,2)
  check (market_rent_estimate is null or market_rent_estimate > 0);

comment on column public.properties.market_rent_estimate is
  'Optional owner-entered monthly market rent estimate in USD, not a verified market average.';
