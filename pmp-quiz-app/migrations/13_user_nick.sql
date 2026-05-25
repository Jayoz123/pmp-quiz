-- ============================================================================
-- Migration 13 — Nick użytkownika (unikalny, case-insensitive) + login e-mail/nick
-- Plan: plans/14-nick-username.md
--
-- Uruchom w Supabase Studio → SQL Editor (cały plik na raz).
-- Idempotentny: ADD COLUMN IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS /
-- DROP CONSTRAINT IF EXISTS. Bezpieczny do ponownego uruchomienia.
--
-- Zasady nicka (źródło prawdy): 3–20 znaków, [A-Za-z0-9_-], bez spacji.
-- Unikalność po lower(nick) → 'Bartek' == 'bartek'.
-- ============================================================================

-- ── 1. Kolumna nick ─────────────────────────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS nick TEXT;

-- ── 2. Unikalny indeks case-insensitive ─────────────────────────────────────
-- lower(NULL) = NULL, a Postgres dopuszcza wiele NULL w unikalnym indeksie,
-- więc istniejący userzy bez nicka NIE wywołają konfliktu. Duplikaty wśród
-- niepustych nicków (niezależnie od wielkości liter) są blokowane.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_nick_lower
  ON user_profiles (lower(nick));

-- ── 3. CHECK formatu (druga linia obrony obok Edge Function) ────────────────
-- Dopuszcza NULL (istniejące konta bez nicka przejdą), ale każdy NIE-NULL nick
-- musi pasować do regexa.
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS chk_user_profiles_nick_format;
ALTER TABLE user_profiles
  ADD CONSTRAINT chk_user_profiles_nick_format
  CHECK (nick IS NULL OR nick ~ '^[A-Za-z0-9_-]{3,20}$');

-- Weryfikacja struktury:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'user_profiles' AND column_name = 'nick';
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'user_profiles' AND indexname = 'uq_user_profiles_nick_lower';


-- ============================================================================
-- RĘCZNE PRZYPISANIE NICKÓW ISTNIEJĄCYM UŻYTKOWNIKOM
-- ----------------------------------------------------------------------------
-- Konta utworzone przed tą funkcją mają nick = NULL. Logowanie e-mailem działa
-- u nich bez zmian; logowanie nickiem zacznie działać po nadaniu nicka poniżej.
--
-- WAŻNE: user_profiles.user_id to UUID z auth.users. Mapujemy po e-mailu,
-- bo e-mail jest czytelny dla człowieka, a UUID nie. Podzapytanie tłumaczy
-- e-mail → user_id.
-- ============================================================================

-- ── KROK A: zobacz, kto NIE MA jeszcze nicka (uzupełnij listę poniżej) ──────
-- Uruchom najpierw to zapytanie, żeby zobaczyć adresy e-mail do obsłużenia:
--
--   SELECT u.email, up.user_id, up.nick, up.tester_since
--   FROM user_profiles up
--   JOIN auth.users u ON u.id = up.user_id
--   WHERE up.nick IS NULL
--   ORDER BY up.tester_since NULLS FIRST;


-- ── KROK B: nadaj nick per użytkownik (po e-mailu) ──────────────────────────
-- Skopiuj poniższy wzorzec dla każdego użytkownika. Podmień e-mail i nick.
-- Nick musi spełniać regex (3–20 znaków, [A-Za-z0-9_-]) — inaczej CHECK odrzuci.
--
-- Przykłady (ODKOMENTUJ i edytuj):

-- UPDATE user_profiles
-- SET nick = 'bartek'
-- WHERE user_id = (SELECT id FROM auth.users WHERE email = 'bart100larski@gmail.com');

-- UPDATE user_profiles
-- SET nick = 'tester01'
-- WHERE user_id = (SELECT id FROM auth.users WHERE email = 'tester1@example.com');

-- UPDATE user_profiles
-- SET nick = 'tester02'
-- WHERE user_id = (SELECT id FROM auth.users WHERE email = 'tester2@example.com');


-- ── KROK B (wariant): nadanie hurtowe z mapy e-mail→nick ────────────────────
-- Wygodniejsze przy wielu userach. Edytuj wiersze w VALUES, potem uruchom.
-- Walidacja formatu odbywa się przez CHECK na kolumnie; kolizje (case-insensitive)
-- zablokuje unikalny indeks — w razie konfliktu cała transakcja się wycofa,
-- więc nadawaj w porcjach lub popraw kolidujący nick.
--
-- WITH mapa(email, nick) AS (
--   VALUES
--     ('bart100larski@gmail.com', 'bartek'),
--     ('tester1@example.com',     'tester01'),
--     ('tester2@example.com',     'tester02')
-- )
-- UPDATE user_profiles up
-- SET nick = m.nick
-- FROM mapa m
-- JOIN auth.users u ON u.email = m.email
-- WHERE up.user_id = u.id
--   AND up.nick IS NULL;   -- nie nadpisuj już ustawionych nicków


-- ── KROK C: weryfikacja po nadaniu ──────────────────────────────────────────
-- 1) Czy zostali jeszcze userzy bez nicka?
--   SELECT COUNT(*) AS bez_nicka
--   FROM user_profiles WHERE nick IS NULL;
--
-- 2) Czy nie ma kolizji case-insensitive? (powinno zwrócić 0 wierszy)
--   SELECT lower(nick) AS nick_lower, COUNT(*) AS ile
--   FROM user_profiles
--   WHERE nick IS NOT NULL
--   GROUP BY lower(nick)
--   HAVING COUNT(*) > 1;
--
-- 3) Podgląd przypisań:
--   SELECT u.email, up.nick, up.tester_since
--   FROM user_profiles up
--   JOIN auth.users u ON u.id = up.user_id
--   ORDER BY up.nick NULLS FIRST;


-- ── KROK D (OPCJONALNIE, dopiero gdy 100% userów ma nick) ───────────────────
-- Wymuś obowiązkowość nicka na poziomie bazy. NIE uruchamiaj, dopóki
-- "bez_nicka" z Kroku C nie wynosi 0 — inaczej ALTER się wywali.
--
--   ALTER TABLE user_profiles ALTER COLUMN nick SET NOT NULL;
