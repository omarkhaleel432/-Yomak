-- YOMAK: market tabs. NEW TABLE ONLY. No change to existing tables or data.
create table if not exists public.market_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tab text not null check (tab in ('transport','sim','crafts','restaurants','shops','other')),
  title text not null check (char_length(title) between 2 and 80),
  details text check (char_length(details) <= 1000),
  from_place text check (char_length(from_place) <= 60),   -- transport: start
  to_place text check (char_length(to_place) <= 60),       -- transport: end
  subtype text check (char_length(subtype) <= 40),         -- STC/Mobily/Zain, plumber/carpenter..., vehicle type
  price text check (char_length(price) <= 40),
  phone text check (phone is null or phone ~ '^[0-9+]{7,16}$'),
  whatsapp boolean not null default false,
  country text not null default 'EG' check (country in ('EG','SA')),
  city text check (char_length(city) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists market_listings_tab_created_idx on public.market_listings (tab, created_at desc);
create index if not exists market_listings_user_idx on public.market_listings (user_id);

alter table public.market_listings enable row level security;

create policy "market read all" on public.market_listings
  for select to anon, authenticated using (true);
create policy "market insert own" on public.market_listings
  for insert to authenticated with check (user_id = auth.uid());
create policy "market update own" on public.market_listings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "market delete own" on public.market_listings
  for delete to authenticated using (user_id = auth.uid());

-- Expense sync (NEW tables only). Each user sees only their own rows.
create table if not exists public.user_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  cat text not null check (char_length(cat) <= 40),
  amount numeric(14,2) not null check (amount > 0 and amount <= 1000000000),
  currency text not null check (currency in ('EGP','SAR')),
  spent_on date not null,
  created_at timestamptz not null default now()
);
create index if not exists user_expenses_user_idx on public.user_expenses (user_id, spent_on desc);
alter table public.user_expenses enable row level security;
create policy "expenses own select" on public.user_expenses for select to authenticated using (user_id = auth.uid());
create policy "expenses own insert" on public.user_expenses for insert to authenticated with check (user_id = auth.uid());
create policy "expenses own update" on public.user_expenses for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "expenses own delete" on public.user_expenses for delete to authenticated using (user_id = auth.uid());

create table if not exists public.user_budgets (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  currency text not null check (currency in ('EGP','SAR')),
  monthly numeric(14,2) not null check (monthly >= 0 and monthly <= 1000000000),
  primary key (user_id, currency)
);
alter table public.user_budgets enable row level security;
create policy "budgets own select" on public.user_budgets for select to authenticated using (user_id = auth.uid());
create policy "budgets own insert" on public.user_budgets for insert to authenticated with check (user_id = auth.uid());
create policy "budgets own update" on public.user_budgets for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "budgets own delete" on public.user_budgets for delete to authenticated using (user_id = auth.uid());
