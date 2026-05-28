-- Keep leaderboard scoring motivating: no user-facing ranking balance goes below zero.

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

  v_ranking_delta := GREATEST(0, v_ranking_delta);

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
          ranking_score = GREATEST(0, public.user_engagement.ranking_score + EXCLUDED.ranking_score),
          updated_at = now();
  END IF;

  RETURN QUERY
    SELECT ue.career_exp, GREATEST(0, ue.ranking_score), ue.leaderboard_visible,
           CASE WHEN v_inserted THEN v_career_exp ELSE 0 END,
           CASE WHEN v_inserted THEN v_ranking_delta ELSE 0 END
      FROM public.user_engagement ue
     WHERE ue.user_id = v_user_id;
END;
$$;

UPDATE public.user_engagement
   SET ranking_score = 0,
       updated_at = now()
 WHERE ranking_score < 0;
