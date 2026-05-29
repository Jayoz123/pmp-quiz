-- General application problem reports.
-- Run in Supabase after the existing numbered migrations.

create table if not exists public.app_problem_reports (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category     text not null check (category in ('bug', 'ui', 'sync', 'login', 'content', 'other')),
  comment      text,
  app_version  text,
  user_agent   text,
  page_href    text,
  page_hash    text,
  app_language text,
  app_theme    text
);

create index if not exists idx_app_problem_reports_user_created_at
  on public.app_problem_reports(user_id, created_at desc);

create index if not exists idx_app_problem_reports_category_created_at
  on public.app_problem_reports(category, created_at desc);

alter table public.app_problem_reports enable row level security;

drop policy if exists "Users can insert their own app problem reports"
  on public.app_problem_reports;

create policy "Users can insert their own app problem reports"
  on public.app_problem_reports
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own app problem reports"
  on public.app_problem_reports;

create policy "Users can read their own app problem reports"
  on public.app_problem_reports
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant insert, select on public.app_problem_reports to authenticated;
