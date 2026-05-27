-- ============================================================================
-- Migration 14 — Email zdenormalizowany + audyt providera (OAuth + reset hasła)
-- Plan: plans/17-google-oauth-and-password-reset.md
--
-- Uruchom w Supabase Studio → SQL Editor (cały plik na raz).
-- Idempotentny: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- UPDATE warunkowy. Bezpieczny do ponownego uruchomienia.
--
-- Po co:
--   1. Reset hasła (reset-beta-password) potrzebuje lookupu user → po e-mailu,
--      a Supabase nie ma bezpośredniego getUserByEmail. Trzymamy e-mail
--      zdenormalizowany w user_profiles i czytamy po nim (service_role).
--   2. auth_provider = audyt skąd przyszedł tester ('email' / 'google').
--
-- RLS bez zmian: kolumny email/auth_provider NIE są czytelne dla anona — polityka
-- own_profile_select (migracja 10) dopuszcza SELECT tylko własnego profilu, a
-- wszystkie zapisy idą przez service_role w Edge Functions.
-- ============================================================================

-- ── 1. Kolumna email (zdenormalizowana, do lookupu przy resecie hasła) ───────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- ── 2. Kolumna auth_provider (audyt: 'email' | 'google') ─────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'email';

-- ── 3. Indeks case-insensitive po e-mailu (szybki lookup przy resecie) ───────
CREATE INDEX IF NOT EXISTS idx_user_profiles_email
  ON user_profiles (lower(email));

-- ── 4. Backfill istniejących profili e-mailem z auth.users ───────────────────
-- Jednorazowe uzupełnienie kont założonych przed tą migracją. Warunek email
-- IS NULL chroni przed nadpisaniem już wypełnionych wartości przy re-runie.
UPDATE user_profiles up
SET email = u.email
FROM auth.users u
WHERE u.id = up.user_id
  AND up.email IS NULL;

-- ── 5. Backfill auth_provider (istniejące konta = 'email', bo OAuth to nowość) ─
-- DEFAULT 'email' obsługuje nowe wiersze; ten UPDATE łata wiersze sprzed
-- dodania kolumny (gdyby DEFAULT nie zadziałał wstecznie w danej wersji PG).
UPDATE user_profiles
SET auth_provider = 'email'
WHERE auth_provider IS NULL;

-- ── Weryfikacja struktury ────────────────────────────────────────────────────
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'user_profiles' AND column_name IN ('email','auth_provider');
--
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'user_profiles' AND indexname = 'idx_user_profiles_email';
--
-- Czy zostały profile bez e-maila? (powinno być 0 — chyba że istnieją profile
-- bez powiązanego auth.users, co nie powinno mieć miejsca):
--   SELECT COUNT(*) AS bez_emaila FROM user_profiles WHERE email IS NULL;
