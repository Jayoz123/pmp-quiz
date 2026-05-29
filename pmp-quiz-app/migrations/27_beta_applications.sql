-- ============================================================================
-- Migration 27 - beta applications + invite code assignment metadata
--
-- Run this in Supabase Studio -> SQL Editor after the existing numbered
-- migrations. Idempotent: safe to re-run.
--
-- This does not change the existing beta registration flow. `register-beta-user`
-- remains the source of truth for finally consuming a beta code. This migration
-- only adds the lead queue and assignment metadata needed before a tester uses
-- the code.
-- ============================================================================

-- 1. Admin allow-list for the future admin queue.
-- Keep this table empty after migration, then insert trusted admin user IDs
-- manually through Supabase Studio or a service-role script.
CREATE TABLE IF NOT EXISTS public.beta_admins (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beta_admins_email_lower
  ON public.beta_admins (lower(email));

ALTER TABLE public.beta_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beta_admins_self_select" ON public.beta_admins;
CREATE POLICY "beta_admins_self_select"
  ON public.beta_admins
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- 2. Public beta applications. Writes and admin reads should go through
-- Edge Functions or authenticated admin policies, not through unrestricted
-- public table access.
CREATE TABLE IF NOT EXISTS public.beta_applications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL,
  name           TEXT,
  linkedin_url   TEXT,
  pmp_stage      TEXT,
  consent        BOOLEAN NOT NULL DEFAULT false,
  status         TEXT NOT NULL DEFAULT 'new',
  assigned_code  TEXT REFERENCES public.beta_codes(code),
  approved_at    TIMESTAMPTZ,
  sent_at        TIMESTAMPTZ,
  rejected_at    TIMESTAMPTZ,
  failed_at      TIMESTAMPTZ,
  last_error     TEXT,
  admin_notes    TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_beta_applications_email_format
    CHECK (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT chk_beta_applications_status
    CHECK (status IN ('new', 'approved', 'sent', 'rejected', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_beta_applications_email_lower
  ON public.beta_applications (lower(email));

CREATE INDEX IF NOT EXISTS idx_beta_applications_status_created_at
  ON public.beta_applications (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_beta_applications_assigned_code
  ON public.beta_applications (assigned_code)
  WHERE assigned_code IS NOT NULL;

ALTER TABLE public.beta_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beta_applications_admin_select" ON public.beta_applications;
CREATE POLICY "beta_applications_admin_select"
  ON public.beta_applications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.beta_admins ba
      WHERE ba.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "beta_applications_admin_update" ON public.beta_applications;
CREATE POLICY "beta_applications_admin_update"
  ON public.beta_applications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.beta_admins ba
      WHERE ba.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.beta_admins ba
      WHERE ba.user_id = (SELECT auth.uid())
    )
  );

-- No anon INSERT policy on purpose for now. The public landing form should call
-- a submit Edge Function so we can add validation, rate limiting, and honeypot
-- checks before writing applications.

GRANT SELECT, UPDATE ON public.beta_applications TO authenticated;
GRANT SELECT ON public.beta_admins TO authenticated;

-- 3. Invite-code assignment metadata. `used`, `used_by`, and `used_at` still
-- represent actual account registration. These columns track pre-registration
-- allocation and email delivery.
ALTER TABLE public.beta_codes
  ADD COLUMN IF NOT EXISTS assigned_to_email TEXT,
  ADD COLUMN IF NOT EXISTS assigned_application_id UUID REFERENCES public.beta_applications(id),
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_beta_codes_available
  ON public.beta_codes (created_at, code)
  WHERE used = false AND assigned_to_email IS NULL;

CREATE INDEX IF NOT EXISTS idx_beta_codes_assigned_to_email_lower
  ON public.beta_codes (lower(assigned_to_email))
  WHERE assigned_to_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_beta_codes_assigned_application_id
  ON public.beta_codes (assigned_application_id)
  WHERE assigned_application_id IS NOT NULL;

-- `beta_codes` intentionally keeps no anon/authenticated policies. Existing
-- and future Edge Functions use the service_role key and bypass RLS.

-- Verification:
--   SELECT column_name
--   FROM information_schema.columns
--   WHERE table_name = 'beta_applications'
--   ORDER BY ordinal_position;
--
--   SELECT column_name
--   FROM information_schema.columns
--   WHERE table_name = 'beta_codes'
--     AND column_name IN ('assigned_to_email', 'assigned_application_id', 'assigned_at', 'sent_at');
--
--   SELECT tablename, policyname
--   FROM pg_policies
--   WHERE tablename IN ('beta_applications', 'beta_admins')
--   ORDER BY tablename, policyname;
