-- YOMAK groups upgrade: private groups + join requests, group post photos, covers, follow.
-- New tables/functions only, plus ONE restrictive policy on group_members (INSERT) that only affects groups marked private.
create table if not exists public.group_settings (
  group_id uuid primary key references public.groups(id) on delete cascade,
  privacy text not null default 'public' check (privacy in ('public','private')),
  cover_url text check (cover_url is null or cover_url like 'https://%/storage/v1/object/public/post-images/%'),
  updated_at timestamptz not null default now()
);
alter table public.group_settings enable row level security;
create policy "gset read"   on public.group_settings for select using (true);
create policy "gset insert" on public.group_settings for insert with check (public.owns_group(group_id));
create policy "gset update" on public.group_settings for update using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

create table if not exists public.group_join_requests (
  id bigserial primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);
alter table public.group_join_requests enable row level security;
create policy "gjr read"   on public.group_join_requests for select using (user_id = auth.uid() or public.is_group_admin(group_id) or public.is_admin());
create policy "gjr insert" on public.group_join_requests for insert with check (user_id = auth.uid() and status = 'pending' and not public.is_banned());
create policy "gjr update" on public.group_join_requests for update using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
create policy "gjr delete" on public.group_join_requests for delete using (user_id = auth.uid() or public.is_group_admin(group_id));

create or replace function public.group_is_private(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_settings s where s.group_id = gid and s.privacy = 'private');
$$;
create or replace function public.has_approved_request(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_join_requests r where r.group_id = gid and r.user_id = auth.uid() and r.status = 'approved');
$$;
grant execute on function public.group_is_private(uuid), public.has_approved_request(uuid) to authenticated;

-- the only change that narrows an existing table: joining a PRIVATE group needs an approved request (or being its owner/admin)
create policy "private groups need approval" on public.group_members as restrictive for insert
  with check (not public.group_is_private(group_id) or public.is_group_admin(group_id) or public.has_approved_request(group_id));

create table if not exists public.group_post_images (
  post_id uuid not null references public.posts(id) on delete cascade,
  url text not null check (url like 'https://%/storage/v1/object/public/post-images/%'),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, url)
);
alter table public.group_post_images enable row level security;
create policy "gpi read"   on public.group_post_images for select using (exists (select 1 from public.posts p where p.id = post_id));
create policy "gpi insert" on public.group_post_images for insert with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));
create policy "gpi delete" on public.group_post_images for delete using (user_id = auth.uid() or public.is_admin());

create table if not exists public.profile_covers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  url text not null check (url like 'https://%/storage/v1/object/public/post-images/%'),
  updated_at timestamptz not null default now()
);
alter table public.profile_covers enable row level security;
create policy "pcov read"   on public.profile_covers for select using (true);
create policy "pcov insert" on public.profile_covers for insert with check (user_id = auth.uid());
create policy "pcov update" on public.profile_covers for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pcov delete" on public.profile_covers for delete using (user_id = auth.uid());

create table if not exists public.follows (
  follower uuid not null default auth.uid() references auth.users(id) on delete cascade,
  following uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, following),
  check (follower <> following)
);
alter table public.follows enable row level security;
create policy "follows read"   on public.follows for select using (true);
create policy "follows insert" on public.follows for insert with check (follower = auth.uid() and not public.is_banned());
create policy "follows delete" on public.follows for delete using (follower = auth.uid());
