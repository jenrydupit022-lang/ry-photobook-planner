-- R&Y V3 OPTIONAL migration. Run in Supabase SQL Editor after taking a backup.
-- Does not modify or delete existing jobs, users, or RLS policies.
create table if not exists public.ry_v3_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'R&Y Studio',
  created_at timestamptz not null default now()
);
create table if not exists public.ry_v3_members (
  workspace_id uuid not null references public.ry_v3_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','artist')),
  display_name text,
  primary key (workspace_id,user_id)
);
create unique index if not exists ry_v3_one_workspace_per_user on public.ry_v3_members(user_id);
create table if not exists public.ry_v3_assignments (
  job_id text primary key,
  workspace_id uuid not null references public.ry_v3_workspaces(id) on delete cascade,
  artist_id uuid not null references auth.users(id),
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now()
);
create index if not exists ry_v3_assignments_artist on public.ry_v3_assignments(artist_id);
create or replace function public.ry_v3_is_member(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.ry_v3_members m where m.workspace_id=ws and m.user_id=(select auth.uid()));
$$;
create or replace function public.ry_v3_is_admin(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.ry_v3_members m where m.workspace_id=ws and m.user_id=(select auth.uid()) and m.role='admin');
$$;
revoke all on function public.ry_v3_is_member(uuid) from public;
revoke all on function public.ry_v3_is_admin(uuid) from public;
grant execute on function public.ry_v3_is_member(uuid), public.ry_v3_is_admin(uuid) to authenticated;
alter table public.ry_v3_workspaces enable row level security;
alter table public.ry_v3_members enable row level security;
alter table public.ry_v3_assignments enable row level security;
drop policy if exists ry_v3_workspace_read on public.ry_v3_workspaces;
create policy ry_v3_workspace_read on public.ry_v3_workspaces for select to authenticated using (public.ry_v3_is_member(id));
drop policy if exists ry_v3_members_read on public.ry_v3_members;
create policy ry_v3_members_read on public.ry_v3_members for select to authenticated using (public.ry_v3_is_member(workspace_id));
drop policy if exists ry_v3_assignments_read on public.ry_v3_assignments;
create policy ry_v3_assignments_read on public.ry_v3_assignments for select to authenticated using (public.ry_v3_is_member(workspace_id));
drop policy if exists ry_v3_assignments_insert on public.ry_v3_assignments;
create policy ry_v3_assignments_insert on public.ry_v3_assignments for insert to authenticated with check (
 public.ry_v3_is_admin(workspace_id) and assigned_by=(select auth.uid())
 and exists(select 1 from public.ry_v3_members m where m.workspace_id=ry_v3_assignments.workspace_id and m.user_id=artist_id and m.role='artist')
 and exists(select 1 from public.jobs j where j.id::text=job_id)
);
drop policy if exists ry_v3_assignments_update on public.ry_v3_assignments;
create policy ry_v3_assignments_update on public.ry_v3_assignments for update to authenticated using (public.ry_v3_is_admin(workspace_id)) with check (
 public.ry_v3_is_admin(workspace_id) and assigned_by=(select auth.uid())
 and exists(select 1 from public.ry_v3_members m where m.workspace_id=ry_v3_assignments.workspace_id and m.user_id=artist_id and m.role='artist')
);
-- Bootstrap manually via SQL editor with actual auth.users IDs. Do not put service-role keys in frontend.
-- insert into public.ry_v3_workspaces(name) values ('R&Y Studio') returning id;
-- insert into public.ry_v3_members(workspace_id,user_id,role,display_name)
-- values ('WORKSPACE_UUID','ADMIN_AUTH_USER_UUID','admin','Administrator');
-- Repeat member insert for artists with role='artist'.
-- Note: existing jobs RLS and legacy sync remain unchanged; cross-owner access needs a separate audited migration.
