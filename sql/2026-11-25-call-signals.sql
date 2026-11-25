-- YOMAK phase 2: 1:1 voice call signaling. NEW TABLE ONLY.
create table if not exists public.call_signals (
  id bigint generated always as identity primary key,
  call_id uuid not null,
  from_uid uuid not null default auth.uid() references auth.users(id) on delete cascade,
  to_uid uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('offer','answer','ice','hangup','decline','busy')),
  payload jsonb check (payload is null or pg_column_size(payload) < 20000),
  created_at timestamptz not null default now()
);
create index if not exists call_signals_to_idx on public.call_signals (to_uid, id);
alter table public.call_signals enable row level security;

-- only between the two members of an existing private chat
create policy "signals insert in own dm" on public.call_signals
  for insert to authenticated
  with check (
    from_uid = auth.uid()
    and exists (
      select 1 from public.dm_chats c
      where (c.user_a = auth.uid() and c.user_b = to_uid)
         or (c.user_b = auth.uid() and c.user_a = to_uid)
    )
  );
create policy "signals read own" on public.call_signals
  for select to authenticated using (to_uid = auth.uid() or from_uid = auth.uid());
create policy "signals delete own" on public.call_signals
  for delete to authenticated using (to_uid = auth.uid() or from_uid = auth.uid());

-- live delivery: adds the NEW table to the realtime publication (no other table touched)
alter publication supabase_realtime add table public.call_signals;
