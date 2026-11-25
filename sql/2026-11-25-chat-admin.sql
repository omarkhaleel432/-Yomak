-- YOMAK: Messenger-style chat controls + stronger owner/admin tools.
-- PART A only adds NEW tables/functions. It does not touch any existing table, data or policy.
-- PART B adds NEW policies on existing tables (additive: nothing is changed or removed). Apply only with explicit approval.

---------------- PART A: new tables ----------------
-- "Delete for me": a private per-user hide list. Nobody else can see it.
create table if not exists public.message_hides (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('g','d')),   -- g = group message, d = private message
  msg_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, msg_id)
);
alter table public.message_hides enable row level security;
create policy "hides read own"   on public.message_hides for select using (user_id = auth.uid());
create policy "hides insert own" on public.message_hides for insert with check (user_id = auth.uid());
create policy "hides delete own" on public.message_hides for delete using (user_id = auth.uid());

-- Group admins (appointed by the group owner).
create table if not exists public.group_admins (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.group_admins enable row level security;
create policy "gadmins read members" on public.group_admins for select using (public.is_member(group_id) or public.is_admin());
create policy "gadmins add owner"    on public.group_admins for insert with check (public.owns_group(group_id) and not public.is_banned());
create policy "gadmins remove owner" on public.group_admins for delete using (public.owns_group(group_id) or public.is_admin());

create or replace function public.is_group_admin(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.owns_group(gid)
      or exists (select 1 from public.group_admins ga where ga.group_id = gid and ga.user_id = auth.uid());
$$;
grant execute on function public.is_group_admin(uuid) to authenticated;

-- App admin can remove any market listing (market_listings is my own new table).
create policy "market admin delete" on public.market_listings for delete using (public.is_admin());

---------------- PART B: additive policies on existing tables (needs explicit OK) ----------------
-- Group admin may delete any message in their group.
create policy "msgs delete group admin" on public.messages for delete using (public.is_group_admin(group_id));

-- Group admin may remove a member. The owner can never be removed, and only the owner can remove another admin.
create policy "members removed by group admin" on public.group_members for delete using (
  public.is_group_admin(group_id)
  and user_id <> (select g.owner from public.groups g where g.id = group_members.group_id)
  and (public.owns_group(group_id)
       or not exists (select 1 from public.group_admins ga where ga.group_id = group_members.group_id and ga.user_id = group_members.user_id))
);

-- Group admin may rename the group / edit its description. The owner column cannot be changed by this policy.
create policy "groups edit by group admin" on public.groups for update
  using (public.is_group_admin(id))
  with check (public.is_group_admin(id) and owner = (select g.owner from public.groups g where g.id = groups.id));
