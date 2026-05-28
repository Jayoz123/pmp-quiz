-- Use the same persisted ranking points on the dashboard and leaderboard.

CREATE OR REPLACE FUNCTION private.get_public_leaderboard(p_period TEXT DEFAULT 'all', p_limit INT DEFAULT 50)
RETURNS TABLE (rank BIGINT, nick TEXT, score BIGINT, career_exp INT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ranked AS (
    SELECT dense_rank() OVER (
             ORDER BY GREATEST(0, ue.ranking_score) DESC, ue.career_exp DESC, up.nick
           ) AS rank,
           up.nick,
           GREATEST(0, ue.ranking_score)::BIGINT AS score,
           ue.career_exp
      FROM public.user_engagement ue
      JOIN public.user_profiles up ON up.user_id = ue.user_id
     WHERE ue.leaderboard_visible = true
       AND up.nick IS NOT NULL
  )
  SELECT ranked.rank, ranked.nick, ranked.score, ranked.career_exp
    FROM ranked
   ORDER BY ranked.rank, ranked.nick
   LIMIT greatest(1, least(COALESCE(p_limit, 50), 100));
$$;
