-- ============================================================================
-- Migration 10 — Beta invite codes + tester profiles
-- Plan: plans/06-beta-invite-codes.md
--
-- Run this in Supabase Studio → SQL Editor (whole file at once).
-- Idempotent: safe to re-run (uses IF NOT EXISTS / ON CONFLICT DO NOTHING).
--
-- PREREQUISITE (manual, Dashboard): Authentication → Providers → Email →
-- "Enable sign ups" = OFF. Without that, clients can still call signUp()
-- directly and bypass the Edge Function.
-- ============================================================================

-- ── 1. beta_codes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beta_codes (
  code         TEXT PRIMARY KEY,
  used         BOOLEAN DEFAULT false,
  used_by      UUID REFERENCES auth.users(id),
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE beta_codes ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated on purpose: every read/write goes through
-- the register-beta-user Edge Function using the service_role key, which
-- bypasses RLS. Clients get zero access to this table.

-- ── 2. user_profiles — full tester profile ──────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_tester            BOOLEAN DEFAULT false,   -- gates per-question EN/PL toggle
  tester_since         TIMESTAMPTZ,             -- when they joined the beta
  beta_code_used       TEXT,                    -- which code was used (audit)
  can_report_bugs      BOOLEAN DEFAULT false,   -- shows the "Report issue" button
  can_see_debug_info   BOOLEAN DEFAULT false,   -- extra diagnostics (future)
  tester_notes         TEXT DEFAULT '',         -- admin notes about the tester
  created_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- A user may read ONLY their own profile.
DROP POLICY IF EXISTS "own_profile_select" ON user_profiles;
CREATE POLICY "own_profile_select" ON user_profiles
  FOR SELECT USING (auth.uid() = user_id);

-- Writes happen only via service_role (Edge Function); no INSERT/UPDATE/DELETE
-- policies for anon/authenticated, so clients cannot modify their tester flags.

-- ── 3. Seed the 100 beta codes ──────────────────────────────────────────────
INSERT INTO beta_codes (code) VALUES
('PMP-2B66-TOBR'), ('PMP-HY3D-VLYX'), ('PMP-6XEN-5CQ2'), ('PMP-BFHG-V1JF'),
('PMP-SU6Y-3YMP'), ('PMP-5HRR-MKLO'), ('PMP-3UKW-7GM8'), ('PMP-IM77-UEIJ'),
('PMP-EGG4-16QL'), ('PMP-O57U-LP3S'), ('PMP-MLMW-QT6F'), ('PMP-AW2T-MECM'),
('PMP-QXII-YKUS'), ('PMP-PJTO-473B'), ('PMP-DMNK-JUCU'), ('PMP-V5S2-NRHE'),
('PMP-X1OU-0VZN'), ('PMP-0JIJ-CY6D'), ('PMP-BG9H-OKVW'), ('PMP-3L5W-SMJZ'),
('PMP-RG81-P608'), ('PMP-GK2R-1HRJ'), ('PMP-082H-9JYD'), ('PMP-6PUN-GMEK'),
('PMP-PNWL-RD0B'), ('PMP-XB9I-0FPX'), ('PMP-QHUQ-VZ9Y'), ('PMP-3VSM-9YZR'),
('PMP-LXWK-IP5M'), ('PMP-M1PL-4YZX'), ('PMP-MPK9-ERRZ'), ('PMP-PYUU-RORD'),
('PMP-I2S3-GSW6'), ('PMP-Y75Y-QVHC'), ('PMP-LE7N-ZAEZ'), ('PMP-4X8W-HRXW'),
('PMP-5GR1-M0DA'), ('PMP-7U3S-LPEH'), ('PMP-SKT7-V5AH'), ('PMP-O295-W5FQ'),
('PMP-NMYH-LZ4Z'), ('PMP-9YC0-KP3D'), ('PMP-TKOX-ACLP'), ('PMP-UT5H-CIP9'),
('PMP-LPM6-NFXQ'), ('PMP-QCV1-1UA7'), ('PMP-8CUM-9LX1'), ('PMP-VBFY-CFN6'),
('PMP-A7OE-NF3H'), ('PMP-BWWI-690E'), ('PMP-J74P-NLW8'), ('PMP-2NOA-0XO3'),
('PMP-B0FF-L6V4'), ('PMP-EKY2-E75N'), ('PMP-NR03-2HBV'), ('PMP-78JV-QXWO'),
('PMP-FGSR-IW05'), ('PMP-OHCB-OLPX'), ('PMP-CKLV-0PC9'), ('PMP-V86J-841Y'),
('PMP-ASTS-3Y8L'), ('PMP-25UG-40HR'), ('PMP-39BW-99SZ'), ('PMP-RPL9-UHUX'),
('PMP-8V69-2Q2S'), ('PMP-XF9X-D0YH'), ('PMP-JA8P-Z8JW'), ('PMP-40UG-FAP1'),
('PMP-5NK5-K279'), ('PMP-7HCV-4GL5'), ('PMP-AFNF-JID2'), ('PMP-EH88-K0XC'),
('PMP-SVD1-Z2JB'), ('PMP-IYIG-U6EC'), ('PMP-6FY6-U474'), ('PMP-ACO7-DJ3U'),
('PMP-WTA6-F5EA'), ('PMP-WBX6-LA9X'), ('PMP-F9LP-NYER'), ('PMP-JXDV-H9RY'),
('PMP-8XLH-2YKC'), ('PMP-Q15G-NS2Q'), ('PMP-5VGK-RIP9'), ('PMP-8285-UBVG'),
('PMP-BPUS-E1QB'), ('PMP-53FS-UJ3K'), ('PMP-3VJF-WGCR'), ('PMP-B9GA-BL50'),
('PMP-CA8V-IHLY'), ('PMP-9C7O-5Z1G'), ('PMP-HMVZ-8PI1'), ('PMP-Y62H-4EJU'),
('PMP-KZAU-HLQQ'), ('PMP-YSS8-NHWM'), ('PMP-YK69-5BEQ'), ('PMP-48AO-A62Q'),
('PMP-NTQN-65R9'), ('PMP-EF3V-VH2X'), ('PMP-9X97-YCVP'), ('PMP-7W7G-9R6H')
ON CONFLICT (code) DO NOTHING;

-- ── 4. Helpful monitoring views (optional) ──────────────────────────────────
-- Usage summary:
--   SELECT COUNT(*) FILTER (WHERE used) AS uzyte,
--          COUNT(*) FILTER (WHERE NOT used) AS wolne,
--          COUNT(*) AS razem
--   FROM beta_codes;
--
-- Who joined and when:
--   SELECT bc.code, bc.used_at, up.can_report_bugs, up.can_see_debug_info
--   FROM beta_codes bc
--   JOIN user_profiles up ON up.beta_code_used = bc.code
--   ORDER BY bc.used_at DESC;
