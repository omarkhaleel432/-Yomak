-- YOMAK push notifications (morning summary + new private message).
-- Before running: replace __PUSH_SECRET__ with the random secret that is also stored as the PUSH_SECRET function secret.
-- New: push_subscriptions, push_config, notify_dm() + one AFTER INSERT trigger on dm_messages (existing table, no data or policy changed), cron job.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  tz_offset int not null default 0,          -- JS getTimezoneOffset (minutes behind UTC)
  morning_min int not null default 450,      -- local minutes after midnight
  morning_on boolean not null default true,
  country text not null default 'SA',
  last_sent date,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "push own select" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "push own insert" on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy "push own update" on public.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push own delete" on public.push_subscriptions for delete using (user_id = auth.uid());

create table if not exists public.push_config (key text primary key, value text not null);
alter table public.push_config enable row level security;   -- no policies: unreadable from the app
insert into public.push_config(key,value) values
  ('url','https://thdmlbmhloebkghmciyq.supabase.co/functions/v1/push'),
  ('secret','__PUSH_SECRET__')
on conflict (key) do update set value = excluded.value;

create or replace function public.notify_dm() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare rcpt uuid; nm text; u text; s text;
begin
  begin
    select case when c.user_a = new.user_id then c.user_b else c.user_a end into rcpt from public.dm_chats c where c.id = new.chat_id;
    if rcpt is null then return new; end if;
    select name into nm from public.profiles where id = new.user_id;
    select value into u from public.push_config where key = 'url';
    select value into s from public.push_config where key = 'secret';
    perform net.http_post(url := u,
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', s),
      body := jsonb_build_object('mode','dm','user_id', rcpt, 'title', coalesce(nm,'رسالة جديدة'), 'body', left(coalesce(new.body,''),120)));
  exception when others then null;   -- never block a message because push failed
  end;
  return new;
end $$;
drop trigger if exists trg_notify_dm on public.dm_messages;
create trigger trg_notify_dm after insert on public.dm_messages for each row execute function public.notify_dm();

select cron.schedule('yomak-push-morning', '*/15 * * * *', $$
  select net.http_post(
    url := (select value from public.push_config where key='url'),
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret',(select value from public.push_config where key='secret')),
    body := '{"mode":"morning"}'::jsonb)
$$);
