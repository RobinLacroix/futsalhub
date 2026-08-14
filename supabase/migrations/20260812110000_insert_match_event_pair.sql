-- =============================================================================
-- `insert_match_event` sait apparier le tir cadré d'un but
--
-- ÉTAPE 3 SUR 3 de la reprise des tirs appariés
-- (étape 1 : `20260812100000_paired_shot_backfill.sql`, passée le 2026-08-12).
--
-- ── CE QUE ÇA RÈGLE ──────────────────────────────────────────────────────────
--
-- Un but est nécessairement cadré, donc il s'écrit en deux lignes. Cette règle
-- vivait dans le seul client mobile (`PAIRED_EVENT`), avec deux conséquences :
--
--   1. **Le web ne pouvait que diverger** — et il a divergé : 110 buts de la
--      saison 25/26 sans tir cadré, soit 69 % du total mesuré.
--   2. **L'écriture n'était pas atomique** — le client enchaînait deux
--      `await createMatchEvent()` dans le même `try`, et un échec du second ne
--      faisait qu'afficher une alerte. Deux buts se sont retrouvés seuls en base
--      de cette façon.
--
-- Les deux clients appelant DÉJÀ cette même RPC, y déplacer l'appariement en
-- fait un invariant de la base qu'aucun des deux ne peut contourner, et rend
-- l'écriture atomique — une fonction, une transaction. Zéro ligne à toucher
-- dans le monolithe web de 5 000 lignes.
--
-- ── POURQUOI UN PARAMÈTRE, ET PAS UN APPARIEMENT SYSTÉMATIQUE ────────────────
--
-- Si la RPC appariait toujours, les clients mobiles **déjà installés**, qui
-- écrivent encore leur propre apparié, en produiraient deux par but. Il aurait
-- fallu séquencer « déployer l'app d'abord, migrer ensuite », avec une fenêtre
-- pendant laquelle les nouveaux buts seraient restés non appariés.
--
-- `p_write_pair` par défaut à FALSE supprime la contrainte d'ordre :
--
--   • ancien client mobile — n'envoie pas le paramètre, reçoit FALSE, continue
--     d'écrire son apparié lui-même. Comportement strictement inchangé.
--   • nouveau client (mobile ET web) — envoie TRUE, la RPC apparie, le client
--     n'écrit plus rien de son côté.
--
-- Cette migration peut donc être passée maintenant, avant ou après les
-- déploiements, sans fenêtre de risque. Le jour où tous les appareils sont à
-- jour, on bascule le défaut à TRUE et on retire le paramètre.
--
-- ── POURQUOI DROP PUIS CREATE, ET PAS CREATE OR REPLACE ──────────────────────
--
-- Ajouter un paramètre — même avec une valeur par défaut — ne remplace pas la
-- fonction : PostgreSQL la considère comme une **surcharge**. On se retrouverait
-- avec `insert_match_event` à 9 arguments ET à 10, et tout appel à 9 arguments
-- deviendrait **ambigu**, donc en erreur, pour tous les clients existants.
-- Le DROP est donc obligatoire, pas cosmétique.
--
-- La signature déposée a été relue sur `pg_proc` avant écriture, pas dans le
-- dépôt : `supabase/migrations/` n'est pas une source fiable du schéma.
--
-- À exécuter encadrée de BEGIN; / COMMIT; dans le SQL Editor.
-- =============================================================================

DROP FUNCTION IF EXISTS insert_match_event(
  UUID, TEXT, INTEGER, INTEGER, UUID, JSONB, double precision, double precision, TEXT
);

CREATE OR REPLACE FUNCTION insert_match_event(
  p_match_id UUID,
  p_event_type TEXT,
  p_match_time_seconds INTEGER,
  p_half INTEGER,
  p_player_id UUID DEFAULT NULL,
  p_players_on_field JSONB DEFAULT '[]'::jsonb,
  p_location_x double precision DEFAULT NULL,
  p_location_y double precision DEFAULT NULL,
  p_goal_type TEXT DEFAULT NULL,
  -- FALSE = le client écrit lui-même le tir cadré apparié (comportement
  -- historique, clients déjà installés). TRUE = la RPC s'en charge, dans la
  -- même transaction.
  p_write_pair BOOLEAN DEFAULT FALSE
)
RETURNS match_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
  v_team_id UUID;
  v_result  match_events;
  v_paired  TEXT;
BEGIN
  IF p_half IS NULL OR p_half NOT IN (1, 2) THEN
    RAISE EXCEPTION 'half doit être 1 ou 2 (reçu: %)', p_half;
  END IF;

  IF p_event_type IS NULL OR p_event_type NOT IN (
    'goal', 'shot', 'shot_on_target', 'recovery',
    'yellow_card', 'red_card', 'assist', 'ball_loss',
    'opponent_goal', 'opponent_shot', 'opponent_shot_on_target'
  ) THEN
    RAISE EXCEPTION 'event_type inconnu pour match_events: %', p_event_type;
  END IF;

  SELECT m.team_id, t.club_id INTO v_team_id, v_club_id
  FROM matches m
  LEFT JOIN teams t ON t.id = m.team_id
  WHERE m.id = p_match_id;

  IF v_team_id IS NULL AND v_club_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM matches WHERE id = p_match_id) THEN
      RAISE EXCEPTION 'Match introuvable';
    ELSE
      RAISE EXCEPTION 'Le match n''est pas associé à une équipe. Associez une équipe au match.';
    END IF;
  END IF;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'L''équipe du match n''est pas associée à un club.';
  END IF;

  IF NOT has_team_write_access(v_team_id) THEN
    RAISE EXCEPTION 'Accès refusé: vous n''avez pas les droits d''écriture sur cette équipe';
  END IF;

  IF p_goal_type IS NOT NULL AND p_event_type NOT IN ('goal', 'opponent_goal') THEN
    RAISE EXCEPTION 'goal_type ne peut être renseigné que pour les événements goal ou opponent_goal';
  END IF;

  INSERT INTO match_events (
    match_id, team_id, event_type, match_time_seconds, half,
    player_id, players_on_field, location_x, location_y, goal_type
  )
  VALUES (
    p_match_id, v_team_id, p_event_type, p_match_time_seconds, p_half,
    p_player_id, COALESCE(p_players_on_field, '[]'::jsonb),
    p_location_x, p_location_y, p_goal_type
  )
  RETURNING * INTO v_result;

  -- ── Tir cadré apparié ──────────────────────────────────────────────────────
  --
  -- Même coordonnée exacte que le but (match, mi-temps, seconde) et même
  -- `players_on_field` : c'est ce qui rend le `+/-T` cohérent, et c'est aussi
  -- l'empreinte sur laquelle le diagnostic d'appariement s'appuie.
  --
  -- Le côté adverse ne porte pas de joueur : on ne suit pas l'effectif adverse.
  -- Miroir exact de `PAIRED_EVENT` dans `mobile/components/recorder/recorderModel.ts`.
  --
  -- `backfill_reason` reste NULL : cette ligne est écrite au moment de l'action,
  -- elle est observée, pas déduite.
  IF p_write_pair THEN
    v_paired := CASE p_event_type
                  WHEN 'goal'          THEN 'shot_on_target'
                  WHEN 'opponent_goal' THEN 'opponent_shot_on_target'
                END;

    IF v_paired IS NOT NULL THEN
      INSERT INTO match_events (
        match_id, team_id, event_type, match_time_seconds, half,
        player_id, players_on_field
      )
      VALUES (
        p_match_id, v_team_id, v_paired, p_match_time_seconds, p_half,
        CASE WHEN p_event_type = 'goal' THEN p_player_id ELSE NULL END,
        COALESCE(p_players_on_field, '[]'::jsonb)
      );
    END IF;
  END IF;

  -- On renvoie le but, pas l'apparié : c'est le contrat historique de la RPC.
  RETURN v_result;
END;
$$;

-- ── Droits ───────────────────────────────────────────────────────────────────
-- Le DROP a emporté les GRANT : ils doivent être réémis. Le REVOKE explicite
-- n'est pas redondant — PostgreSQL accorde EXECUTE à PUBLIC par défaut à la
-- création, et sous Supabase `anon` est membre de PUBLIC. Sans lui, la fonction
-- redeviendrait appelable sans compte, et le garde-fou §15 de
-- `20260803100000_rpc_security_hardening_v2.sql` ferait échouer la migration.

REVOKE ALL ON FUNCTION insert_match_event(
  UUID, TEXT, INTEGER, INTEGER, UUID, JSONB, double precision, double precision, TEXT, BOOLEAN
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION insert_match_event(
  UUID, TEXT, INTEGER, INTEGER, UUID, JSONB, double precision, double precision, TEXT, BOOLEAN
) TO authenticated;


-- ── Vérification ─────────────────────────────────────────────────────────────
-- Échoue si la fonction n'est pas unique (surcharge résiduelle = appels
-- ambigus), si elle n'est plus SECURITY DEFINER, ou si `anon` peut l'exécuter.

DO $$
DECLARE
  v_nb          INTEGER;
  v_secdef      BOOLEAN;
  v_anon_execute BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO v_nb
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'insert_match_event';

  IF v_nb <> 1 THEN
    RAISE EXCEPTION
      'insert_match_event existe en % exemplaire(s). Une surcharge rendrait tous les appels ambigus.',
      v_nb;
  END IF;

  SELECT p.prosecdef INTO v_secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'insert_match_event';

  IF NOT v_secdef THEN
    RAISE EXCEPTION 'insert_match_event n''est plus SECURITY DEFINER.';
  END IF;

  SELECT has_function_privilege('anon', p.oid, 'EXECUTE') INTO v_anon_execute
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'insert_match_event';

  IF v_anon_execute THEN
    RAISE EXCEPTION 'insert_match_event est exécutable par anon. Le REVOKE n''a pas pris.';
  END IF;

  RAISE NOTICE 'insert_match_event : 1 exemplaire, SECURITY DEFINER, anon exclu. OK.';
END;
$$;
