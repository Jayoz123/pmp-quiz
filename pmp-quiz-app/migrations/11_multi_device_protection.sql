-- ============================================================================
-- Migration 11 — Multi-device protection (one active device per account)
-- Plan: plans/07-multi-device-protection.md
--
-- Run this in Supabase Studio → SQL Editor (whole file at once).
-- Idempotent: safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- Model: one row per user holding the device_token of the last device that
-- logged in. On app start the client compares its localStorage token with the
-- one stored here; a mismatch means another device logged in → force sign-out.
-- ============================================================================

-- ── 1. user_sessions — one active device per user ───────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  device_token TEXT NOT NULL,
  device_info  TEXT,                       -- optional: 'Chrome / Windows'
  logged_in_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- A user may read ONLY their own session row.
DROP POLICY IF EXISTS "own_session_select" ON user_sessions;
CREATE POLICY "own_session_select" ON user_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- A user may insert/update/delete ONLY their own session row.
-- WITH CHECK is explicit so the INSERT path of upsert() is also constrained to
-- the caller's own user_id (can't register a device against someone else).
DROP POLICY IF EXISTS "own_session_upsert" ON user_sessions;
CREATE POLICY "own_session_upsert" ON user_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Verify:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'user_sessions';
--   SELECT polname, polcmd FROM pg_policy
--   WHERE polrelid = 'user_sessions'::regclass;
