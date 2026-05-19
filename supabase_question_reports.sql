-- =====================================================
-- PMP Quiz App — tabela zgłoszeń błędów w pytaniach
-- Uruchom w: Supabase Dashboard → SQL Editor
-- =====================================================

create table if not exists public.question_reports (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  user_id      uuid references auth.users(id) on delete set null,
  question_id  text not null,
  question_text text,
  category     text not null,   -- np. 'wrong_answer', 'unclear', 'typo', 'translation', 'other'
  comment      text
);

-- Indeks do szybkiego przeglądu zgłoszeń per pytanie
create index if not exists idx_question_reports_question_id
  on public.question_reports(question_id);

-- Row Level Security: zalogowani mogą wstawiać własne zgłoszenia
alter table public.question_reports enable row level security;

create policy "Users can insert their own reports"
  on public.question_reports
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Opcjonalnie: zalogowani mogą czytać własne zgłoszenia
create policy "Users can read their own reports"
  on public.question_reports
  for select
  to authenticated
  using (auth.uid() = user_id);
