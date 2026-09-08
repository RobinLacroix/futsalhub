-- ─────────────────────────────────────────────────────────────────────────────
-- Demande Robin : les messages d'anniversaire dans le fil doivent être postés
-- automatiquement le jour J, sans dépendre de l'ouverture du fil par un humain.
--
-- Jusqu'ici (20260814170000), _ensure_birthday_posts(team_id) n'était appelée
-- que depuis get_team_feed : si personne n'ouvrait le fil le jour exact de
-- l'anniversaire, le post n'était jamais créé, ni ce jour-là ni après (aucun
-- rattrapage — c'était un choix assumé "pas de pg_cron installé sur le
-- projet"). On installe maintenant pg_cron et on planifie un job quotidien.
--
-- Deux bugs corrigés au passage, nécessaires pour que "posté automatiquement
-- le jour J" soit vrai dans tous les cas (pas une extension de périmètre :
-- sans ça l'automatisation elle-même serait silencieusement peu fiable) :
--
--   1. "Aujourd'hui" était CURRENT_DATE, résolu dans le fuseau de la session
--      (UTC sur ce projet, vérifié : `show timezone` → UTC). Entre minuit et
--      2h du matin heure de Paris (été), CURRENT_DATE en UTC est encore la
--      veille : le job cron déclenché à ce moment-là aurait manqué le jour J.
--      Remplacé par (now() AT TIME ZONE 'Europe/Paris')::date.
--
--   2. Le verrou anti-doublon (team_feed_birthday_log) était écrit AVANT de
--      vérifier qu'un admin de club existe pour poster le message. Sans
--      admin ce jour-là, le post était sauté et le verrou déjà posé bloquait
--      toute nouvelle tentative pour le reste de la journée (et donc pour
--      l'année, la fenêtre de correspondance ne redevenant vraie que l'année
--      suivante). Le verrou n'est maintenant écrit qu'après un post réussi :
--      un admin ajouté plus tard dans la même journée permet un rattrapage
--      same-day (toujours "le jour J", pas un rattrapage cross-jour).
--
-- Portée : pas de rattrapage des anniversaires déjà manqués cette année
-- (demande explicite de Robin de ne pas élargir plus que ça) — seulement la
-- fiabilité du mécanisme à partir de maintenant.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _ensure_birthday_posts(p_team_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player   RECORD;
  v_admin_id UUID;
  v_today    DATE := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_year     INT  := EXTRACT(YEAR FROM v_today)::INT;
BEGIN
  FOR v_player IN
    SELECT id, first_name
    FROM players
    WHERE team_id = p_team_id
      AND status = 'active'
      AND birth_date IS NOT NULL
      AND EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM v_today)
      AND EXTRACT(DAY FROM birth_date)   = EXTRACT(DAY FROM v_today)
  LOOP
    -- Déjà posté cette année pour ce joueur : rien à faire.
    IF EXISTS (
      SELECT 1 FROM team_feed_birthday_log
      WHERE team_id = p_team_id AND player_id = v_player.id AND birthday_year = v_year
    ) THEN
      CONTINUE;
    END IF;

    SELECT cm.user_id INTO v_admin_id
    FROM club_members cm
    JOIN teams t ON t.id = p_team_id
    WHERE cm.club_id = t.club_id AND cm.role = 'admin'
    ORDER BY cm.created_at ASC
    LIMIT 1;

    -- Pas d'admin trouvé : on ne pose PAS le verrou, pour permettre un
    -- rattrapage au prochain appel de la même journée (ex. cron du matin
    -- sans admin, puis admin ajouté dans la journée + ouverture du fil).
    IF v_admin_id IS NULL THEN
      CONTINUE;
    END IF;

    -- FOUND = true seulement si l'INSERT a réellement écrit une ligne (pas un
    -- conflit) : garantit qu'on ne poste qu'une fois par joueur et par année,
    -- même en cas d'appels concurrents (cron + ouverture du fil au même
    -- moment).
    INSERT INTO team_feed_birthday_log (team_id, player_id, birthday_year)
    VALUES (p_team_id, v_player.id, v_year)
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      INSERT INTO team_posts (team_id, author_user_id, content, post_type)
      VALUES (p_team_id, v_admin_id, '🎂 Joyeux anniversaire ' || v_player.first_name || ' !', 'birthday');
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION _ensure_birthday_posts(UUID) FROM PUBLIC, anon, authenticated;

-- ── Job cron : appelle _ensure_birthday_posts pour toutes les équipes ─────────
CREATE OR REPLACE FUNCTION _ensure_all_birthday_posts()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team RECORD;
BEGIN
  FOR v_team IN SELECT id FROM teams LOOP
    PERFORM _ensure_birthday_posts(v_team.id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION _ensure_all_birthday_posts() FROM PUBLIC, anon, authenticated;

-- pg_cron : si cette ligne échoue avec une erreur de permission, active
-- l'extension "pg_cron" depuis le dashboard Supabase (Database → Extensions)
-- puis rejoue ce fichier.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotent : un job du même nom est reprogrammé plutôt que dupliqué (rejouer
-- cette migration ne crée pas un deuxième job).
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'birthday-posts-daily') THEN
    PERFORM cron.unschedule('birthday-posts-daily');
  END IF;
END
$mig$;

-- 6h UTC ≈ 7h-8h heure de Paris selon la saison : large marge après minuit
-- Paris pour que (now() AT TIME ZONE 'Europe/Paris')::date soit déjà le bon
-- jour côté fonction, quelle que soit la période de l'année.
SELECT cron.schedule('birthday-posts-daily', '0 6 * * *', $$SELECT _ensure_all_birthday_posts();$$);

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname IN ('_ensure_birthday_posts', '_ensure_all_birthday_posts')
      AND has_function_privilege('public', oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Les fonctions anniversaire ne doivent pas être exécutables par PUBLIC';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'birthday-posts-daily') THEN
    RAISE EXCEPTION 'Le job cron birthday-posts-daily n''a pas été créé';
  END IF;
END;
$verify$;
