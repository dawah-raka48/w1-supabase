-- W1 Supabase application schema (initial, additive only).
-- Safe to run more than once. It does not drop tables or delete data.
-- Run supabase/migration.sql first to create the private storage bucket + PDF migration log.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text not null,
  department text not null,
  role text not null check (role in ('admin', 'manager', 'employee')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  employee_name text not null,
  department text not null,
  report_date date not null default current_date,
  report_week_start date,
  report_week_end date,
  title text,
  original_filename text,
  file_path text,
  source_drive_file_id text,
  source_sheet_id text,
  source_sheet_name text,
  source_sheet_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_employee_week_unique unique (employee_id, report_week_start)
);

create table if not exists public.app_settings (
  id integer primary key default 1 check (id = 1),
  upload_day integer not null default 4 check (upload_day between 0 and 6),
  start_time time not null default '08:00',
  end_time time not null default '23:00',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

create index if not exists reports_employee_date_idx on public.reports (employee_id, report_date desc);
create index if not exists reports_department_date_idx on public.reports (department, report_date desc);
create index if not exists profiles_department_role_idx on public.profiles (department, role);
create index if not exists app_settings_updated_by_idx on public.app_settings (updated_by);

create or replace function public.w1_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active = true
  limit 1;
$$;

create or replace function public.w1_current_department()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.department
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active = true
  limit 1;
$$;

revoke all on function public.w1_current_role() from public;
revoke all on function public.w1_current_department() from public;
grant execute on function public.w1_current_role() to authenticated;
grant execute on function public.w1_current_department() to authenticated;

alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "w1 profiles visible by role" on public.profiles;
create policy "w1 profiles visible by role" on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (select public.w1_current_role()) = 'admin'
  or (
    (select public.w1_current_role()) = 'manager'
    and department = (select public.w1_current_department())
  )
);

drop policy if exists "w1 profiles admin insert" on public.profiles;
create policy "w1 profiles admin insert" on public.profiles
for insert to authenticated
with check ((select public.w1_current_role()) = 'admin');

drop policy if exists "w1 profiles admin update" on public.profiles;
create policy "w1 profiles admin update" on public.profiles
for update to authenticated
using ((select public.w1_current_role()) = 'admin')
with check ((select public.w1_current_role()) = 'admin');

drop policy if exists "w1 profiles admin delete" on public.profiles;
create policy "w1 profiles admin delete" on public.profiles
for delete to authenticated
using ((select public.w1_current_role()) = 'admin');

drop policy if exists "w1 reports visible by role" on public.reports;
create policy "w1 reports visible by role" on public.reports
for select to authenticated
using (
  (select public.w1_current_role()) = 'admin'
  or (
    (select public.w1_current_role()) = 'manager'
    and department = (select public.w1_current_department())
  )
  or employee_id = (select auth.uid())
);

drop policy if exists "w1 employees insert own report" on public.reports;
create policy "w1 employees insert own report" on public.reports
for insert to authenticated
with check (
  employee_id = (select auth.uid())
  and (select public.w1_current_role()) = 'employee'
);

drop policy if exists "w1 admin update reports" on public.reports;
create policy "w1 admin update reports" on public.reports
for update to authenticated
using ((select public.w1_current_role()) = 'admin')
with check ((select public.w1_current_role()) = 'admin');

drop policy if exists "w1 admin delete reports" on public.reports;
create policy "w1 admin delete reports" on public.reports
for delete to authenticated
using ((select public.w1_current_role()) = 'admin');

drop policy if exists "w1 settings read authenticated" on public.app_settings;
create policy "w1 settings read authenticated" on public.app_settings
for select to authenticated
using (true);

drop policy if exists "w1 settings admin update" on public.app_settings;
create policy "w1 settings admin update" on public.app_settings
for update to authenticated
using ((select public.w1_current_role()) = 'admin')
with check ((select public.w1_current_role()) = 'admin');

-- The storage bucket remains private. Browser-side upload/read policies are
-- intentionally not opened globally; add per-user and per-department rules
-- after legacy users are mapped to auth.users and migrated report paths.
