-- W1 non-destructive PDF migration staging
-- Run in Supabase SQL Editor BEFORE running the Apps Script migration.
-- Creates a private bucket and mapping table; does not delete or alter existing records.
insert into storage.buckets (id, name, public)
values ('weekly-reports-pdf', 'weekly-reports-pdf', false)
on conflict (id) do nothing;

create table if not exists public.report_file_migrations (
  source_sheet_id text not null,
  source_sheet_name text not null,
  source_sheet_row integer not null,
  report_id text,
  employee_name text,
  department text,
  report_date text,
  source_drive_file_id text,
  storage_path text,
  migration_status text not null default 'pending'
    check (migration_status in ('pending', 'migrated', 'skipped', 'error')),
  migrated_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_sheet_id, source_sheet_name, source_sheet_row)
);
alter table public.report_file_migrations enable row level security;
revoke all on table public.report_file_migrations from anon, authenticated;
grant all on table public.report_file_migrations to service_role;
create index if not exists report_file_migrations_status_idx on public.report_file_migrations (migration_status);
create index if not exists report_file_migrations_report_id_idx on public.report_file_migrations (report_id);
-- Intentionally no public read policy for Storage. Bucket stays private.
-- Never put the service_role key in GitHub or browser JavaScript.
