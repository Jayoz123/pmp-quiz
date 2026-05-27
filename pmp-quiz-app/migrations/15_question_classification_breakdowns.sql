ALTER TABLE quiz_sessions
  ADD COLUMN IF NOT EXISTS breakdowns JSONB DEFAULT '{}'::jsonb;
