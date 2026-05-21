-- Migration 09: Cross-device sync — extend user_progress with new columns
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Safe to re-run: IF NOT EXISTS guards prevent duplicate errors.

ALTER TABLE user_progress
  ADD COLUMN IF NOT EXISTS quiz_history    JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS settings        JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence_data JSONB DEFAULT '{}'::jsonb;

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'user_progress';
