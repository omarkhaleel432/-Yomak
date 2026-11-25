-- YOMAK server-side market data (weather, currency, gold): one hourly fetch with fallbacks, shared by all users.
-- New only: market_cache table, cron job. Replace __PUSH_SECRET__ with the same random secret stored as the function secret PUSH_SECRET.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;
create table if not exists public.push_config (key text primary key, value text not null);
alter table public.push_config enable row level security;
insert into public.push_config(key,value) values ('secret','__PUSH_SECRET__') on conflict (key) do nothing;
insert into public.push_config(key,value) values ('market_url','https://thdmlbmhloebkghmciyq.supabase.co/functions/v1/market-refresh') on conflict (key) do update set value=excluded.value;

create table if not exists public.market_cache (
  id text primary key check (id in ('weather','rates','gold')),
  data jsonb not null,
  source text,
  fetched_at timestamptz not null default now()
);
alter table public.market_cache enable row level security;
create policy "market read all" on public.market_cache for select using (true);   -- public numbers; only the function (service role) can write

select cron.schedule('yomak-market-hourly', '7 * * * *', $$
  select net.http_post(
    url := (select value from public.push_config where key='market_url'),
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret',(select value from public.push_config where key='secret')),
    body := '{}'::jsonb)
$$);
