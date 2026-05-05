create table public.stripe_accounts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  country text,
  default_currency text,
  deliveries_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_stripe_accounts_seller on public.stripe_accounts(seller_id);

alter table public.stripe_accounts enable row level security;

create policy "Sellers view own stripe account"
  on public.stripe_accounts for select
  using (auth.uid() = seller_id or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'owner'));

create policy "Sellers insert own stripe account"
  on public.stripe_accounts for insert
  with check (auth.uid() = seller_id);

create policy "Sellers update own stripe account"
  on public.stripe_accounts for update
  using (auth.uid() = seller_id);

create or replace function public.update_stripe_accounts_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_stripe_accounts_updated_at
before update on public.stripe_accounts
for each row execute function public.update_stripe_accounts_updated_at();