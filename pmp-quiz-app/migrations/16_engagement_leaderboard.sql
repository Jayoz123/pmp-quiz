-- Migration 16: Career EXP and opt-in public leaderboard for PM Academy.
-- Run in Supabase SQL Editor after migration 13 (user_profiles.nick).
-- SECURITY DEFINER functions live in private, which must not be exposed by the Data API.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.user_engagement (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  career_exp INT NOT NULL DEFAULT 0 CHECK (career_exp >= 0),
  ranking_score INT NOT NULL DEFAULT 0,
  leaderboard_visible BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rewarded_sessions (
  session_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('quick', 'weak', 'daily', 'trial')),
  correct INT NOT NULL CHECK (correct >= 0),
  total INT NOT NULL CHECK (total > 0 AND correct <= total),
  career_exp_awarded INT NOT NULL CHECK (career_exp_awarded >= 0),
  ranking_delta INT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_rewarded_sessions_user_occurred
  ON public.rewarded_sessions (user_id, occurred_at DESC);

ALTER TABLE public.user_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewarded_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_engagement FROM anon, authenticated;
REVOKE ALL ON public.rewarded_sessions FROM anon, authenticated;
GRANT SELECT ON public.user_engagement TO authenticated;
GRANT SELECT ON public.rewarded_sessions TO authenticated;

DROP POLICY IF EXISTS user_engagement_select_own ON public.user_engagement;
CREATE POLICY user_engagement_select_own ON public.user_engagement
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS rewarded_sessions_select_own ON public.rewarded_sessions;
CREATE POLICY rewarded_sessions_select_own ON public.rewarded_sessions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION private.award_quiz_session(
  p_session_id UUID,
  p_mode TEXT,
  p_correct INT,
  p_total INT
)
RETURNS TABLE (
  career_exp INT,
  ranking_score INT,
  leaderboard_visible BOOLEAN,
  awarded_exp INT,
  awarded_ranking INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_wrong INT;
  v_career_exp INT;
  v_ranking_delta INT;
  v_training_count INT;
  v_inserted BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  -- Serialize rewards per user so parallel requests cannot bypass daily ranking limits.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::TEXT, 0));
  IF p_session_id IS NULL OR p_mode NOT IN ('quick', 'weak', 'daily', 'trial')
     OR p_total <= 0 OR p_correct < 0 OR p_correct > p_total THEN
    RAISE EXCEPTION 'Invalid quiz result';
  END IF;
  IF (p_mode = 'quick' AND p_total NOT IN (10, 20, 30))
     OR (p_mode = 'weak' AND p_total NOT BETWEEN 1 AND 10)
     OR (p_mode = 'daily' AND p_total <> 30)
     OR (p_mode = 'trial' AND p_total NOT IN (60, 90, 180)) THEN
    RAISE EXCEPTION 'Unsupported session size';
  END IF;

  v_wrong := p_total - p_correct;
  v_career_exp := p_correct * 5 + v_wrong;
  v_ranking_delta := p_correct * 2 - v_wrong * 2;

  IF p_mode = 'daily' THEN
    v_career_exp := v_career_exp + 20;
    IF p_correct::NUMERIC / p_total >= 0.7 THEN
      v_ranking_delta := v_ranking_delta + 5;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.rewarded_sessions rs
       WHERE rs.user_id = v_user_id AND rs.mode = 'daily'
         AND rs.occurred_at >= date_trunc('day', now())
    ) THEN
      v_ranking_delta := 0;
    END IF;
  ELSIF p_mode IN ('quick', 'weak') THEN
    SELECT count(*) INTO v_training_count
      FROM public.rewarded_sessions rs
     WHERE rs.user_id = v_user_id AND rs.mode IN ('quick', 'weak')
       AND rs.occurred_at >= date_trunc('day', now());
    IF v_training_count >= 5 THEN
      v_ranking_delta := 0;
    END IF;
  ELSIF p_mode = 'trial' THEN
    v_career_exp := v_career_exp + 50;
    IF p_correct::NUMERIC / p_total >= 0.8 THEN
      v_career_exp := v_career_exp + 100;
    END IF;
  END IF;

  INSERT INTO public.rewarded_sessions (
    session_id, user_id, mode, correct, total, career_exp_awarded, ranking_delta
  ) VALUES (
    p_session_id, v_user_id, p_mode, p_correct, p_total, v_career_exp, v_ranking_delta
  )
  ON CONFLICT (session_id) DO NOTHING;
  GET DIAGNOSTICS v_training_count = ROW_COUNT;
  v_inserted := v_training_count = 1;

  IF v_inserted THEN
    INSERT INTO public.user_engagement (user_id, career_exp, ranking_score)
    VALUES (v_user_id, v_career_exp, v_ranking_delta)
    ON CONFLICT (user_id) DO UPDATE
      SET career_exp = public.user_engagement.career_exp + EXCLUDED.career_exp,
          ranking_score = public.user_engagement.ranking_score + EXCLUDED.ranking_score,
          updated_at = now();
  END IF;

  RETURN QUERY
    SELECT ue.career_exp, ue.ranking_score, ue.leaderboard_visible,
           CASE WHEN v_inserted THEN v_career_exp ELSE 0 END,
           CASE WHEN v_inserted THEN v_ranking_delta ELSE 0 END
      FROM public.user_engagement ue
     WHERE ue.user_id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.set_leaderboard_visibility(p_visible BOOLEAN)
RETURNS public.user_engagement
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row public.user_engagement;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  INSERT INTO public.user_engagement (user_id, leaderboard_visible)
  VALUES (v_user_id, COALESCE(p_visible, false))
  ON CONFLICT (user_id) DO UPDATE
    SET leaderboard_visible = COALESCE(p_visible, false),
        updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION private.get_public_leaderboard(p_period TEXT DEFAULT 'week', p_limit INT DEFAULT 50)
RETURNS TABLE (rank BIGINT, nick TEXT, score BIGINT, career_exp INT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH scores AS (
    SELECT rs.user_id,
           sum(rs.ranking_delta)::BIGINT AS score
      FROM public.rewarded_sessions rs
     WHERE CASE p_period
       WHEN 'week' THEN rs.occurred_at >= now() - interval '7 days'
       WHEN 'month' THEN rs.occurred_at >= now() - interval '30 days'
       WHEN 'all' THEN true
       ELSE false
     END
     GROUP BY rs.user_id
  ), ranked AS (
    SELECT dense_rank() OVER (ORDER BY scores.score DESC, ue.career_exp DESC) AS rank,
           up.nick,
           scores.score,
           ue.career_exp
      FROM scores
      JOIN public.user_engagement ue ON ue.user_id = scores.user_id
      JOIN public.user_profiles up ON up.user_id = scores.user_id
     WHERE ue.leaderboard_visible = true
       AND up.nick IS NOT NULL
  )
  SELECT ranked.rank, ranked.nick, ranked.score, ranked.career_exp
    FROM ranked
   ORDER BY ranked.rank, ranked.nick
   LIMIT greatest(1, least(COALESCE(p_limit, 50), 100));
$$;

CREATE OR REPLACE FUNCTION public.award_quiz_session(p_session_id UUID, p_mode TEXT, p_correct INT, p_total INT)
RETURNS TABLE (career_exp INT, ranking_score INT, leaderboard_visible BOOLEAN, awarded_exp INT, awarded_ranking INT)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT * FROM private.award_quiz_session(p_session_id, p_mode, p_correct, p_total); $$;

CREATE OR REPLACE FUNCTION public.set_leaderboard_visibility(p_visible BOOLEAN)
RETURNS public.user_engagement
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT * FROM private.set_leaderboard_visibility(p_visible); $$;

CREATE OR REPLACE FUNCTION public.get_public_leaderboard(p_period TEXT DEFAULT 'week', p_limit INT DEFAULT 50)
RETURNS TABLE (rank BIGINT, nick TEXT, score BIGINT, career_exp INT)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT * FROM private.get_public_leaderboard(p_period, p_limit); $$;

REVOKE ALL ON FUNCTION private.award_quiz_session(UUID, TEXT, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.set_leaderboard_visibility(BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_public_leaderboard(TEXT, INT) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.award_quiz_session(UUID, TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION private.set_leaderboard_visibility(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_public_leaderboard(TEXT, INT) TO authenticated;

REVOKE ALL ON FUNCTION public.award_quiz_session(UUID, TEXT, INT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_leaderboard_visibility(BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_public_leaderboard(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_quiz_session(UUID, TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_leaderboard_visibility(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_leaderboard(TEXT, INT) TO authenticated;

-- Verification after applying:
-- SELECT * FROM public.get_public_leaderboard('week', 10);
-- SELECT career_exp, ranking_score, leaderboard_visible
--   FROM public.user_engagement WHERE user_id = auth.uid();
