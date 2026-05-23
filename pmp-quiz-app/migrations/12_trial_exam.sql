-- ============================================================================
-- Migration 12 — Trial Exam analytics columns (OPTIONAL)
-- Plan: plans/12-trial-exam-mode.md (sekcja 17)
--
-- Run this in Supabase Studio → SQL Editor (whole file at once).
-- Idempotent: safe to re-run (uses ADD COLUMN IF NOT EXISTS).
--
-- Tryb 'trial' działa BEZ tej migracji — bogatsze pola jadą w quiz_history
-- (JSON w user_progress, już synchronizowany). Ta migracja dokłada kolumny
-- analityczne do quiz_sessions, żeby dało się zliczać egzaminy po stronie bazy.
-- Po jej zastosowaniu klient (SupabaseSync.saveQuizSession) dosyła te pola dla
-- trybu trial; tryby quiz/daily/quick/weak zostawiają je NULL.
-- ============================================================================

ALTER TABLE quiz_sessions
  ADD COLUMN IF NOT EXISTS exam_length   INT,   -- liczba pytań egzaminu (180/90/60)
  ADD COLUMN IF NOT EXISTS duration_sec  INT,   -- dostępny czas egzaminu w sekundach
  ADD COLUMN IF NOT EXISTS time_left_sec INT,   -- czas pozostały przy zakończeniu
  ADD COLUMN IF NOT EXISTS rating        TEXT;  -- 'above' | 'target' | 'below' | 'needs'

-- Verify:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'quiz_sessions'
--     AND column_name IN ('exam_length','duration_sec','time_left_sec','rating');
