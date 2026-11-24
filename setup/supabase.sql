-- JerseyRoom V4: private collection and explicitly shared snapshots.
-- Run once in the SQL Editor of the dedicated Supabase project.
begin;
create table if not exists public.jerseyroom_collection (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.jerseyroom_collection enable row level security;
revoke all on public.jerseyroom_collection from anon, authenticated;
grant select, insert, update, delete on public.jerseyroom_collection to authenticated;
drop policy if exists collection_owner on public.jerseyroom_collection;
create policy collection_owner on public.jerseyroom_collection
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.jerseyroom_share (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token uuid unique not null default gen_random_uuid(),
  payload jsonb not null check (jsonb_typeof(payload) = 'array'),
  updated_at timestamptz not null default now()
);
alter table public.jerseyroom_share enable row level security;
revoke all on public.jerseyroom_share from anon, authenticated;
grant select, insert, update, delete on public.jerseyroom_share to authenticated;
drop policy if exists share_owner on public.jerseyroom_share;
create policy share_owner on public.jerseyroom_share
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No public listing; only a snapshot with a matching unguessable token.
create or replace function public.jerseyroom_read_share(share_token uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select s.payload from public.jerseyroom_share s where s.token = share_token;
$$;
revoke all on function public.jerseyroom_read_share(uuid) from public;
grant execute on function public.jerseyroom_read_share(uuid) to anon, authenticated;
commit;
