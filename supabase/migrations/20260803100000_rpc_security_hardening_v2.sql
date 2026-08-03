-- ─────────────────────────────────────────────────────────────────────────────
-- Durcissement RPC v2 — pré-requis beta externe multi-clubs
-- Suite de 20260726120000 (fuites inter-clubs) et 20260726130000 (set_team_main_coach).
--
-- Périmètre : ce que l'audit AUDIT_SECURITE_RPC_2026-07.md n'avait PAS couvert.
--   (a) les 9 migrations postérieures au 26/07 (pain_reports, ratings, notifications,
--       invitations code court) ;
--   (b) l'hypothèse « REVOKE PUBLIC propre » de l'audit, qui est FAUSSE : seules
--       5 fonctions sur 53 SECURITY DEFINER ont un REVOKE ... FROM PUBLIC. Postgres
--       accorde EXECUTE à PUBLIC par défaut, et sous Supabase anon ET authenticated
--       sont membres de PUBLIC => toute fonction DEFINER non revoquée est appelable
--       par un utilisateur NON AUTHENTIFIÉ via /rest/v1/rpc/<nom>.
--   (c) la confusion garde de LECTURE / opération d'ÉCRITURE (has_club_access inclut
--       le rôle 'viewer').
--
-- Ordre des sections = ordre de criticité.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- §1 — CRITIQUE : fermer les helpers internes exposés à anon
--
-- _insert_pain_reports(p_player_id, ...) et _notify_pain_report(p_player_id, ...)
-- sont SECURITY DEFINER, prennent un player_id arbitraire, n'ont AUCUNE garde
-- d'accès (par design : ce sont des helpers appelés depuis report_my_pain /
-- report_pain_by_token qui, eux, résolvent l'identité), et n'ont jamais été
-- revoqués. Conséquence : n'importe qui, sans compte, peut
--   - écrire de faux signalements de douleur (donnée de santé) sur n'importe quel
--     joueur de n'importe quel club ;
--   - déclencher une notification + push à TOUT le staff du club ciblé, avec un
--     corps de message partiellement contrôlé par l'attaquant.
--
-- Un appel interne depuis une fonction SECURITY DEFINER s'exécute sous l'identité
-- du propriétaire de cette fonction : le REVOKE ci-dessous ne casse donc AUCUN
-- appel légitime. Idem pour les fonctions de trigger (Postgres ne vérifie pas
-- EXECUTE au déclenchement d'un trigger).
-- ═════════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname LIKE E'\\_%'                      -- convention : helpers internes préfixés _
        OR p.prorettype = 'trigger'::regtype        -- fonctions de trigger
        OR p.proname IN (
          'gen_link_code',
          'prune_link_code_attempts',
          'sync_match_goals_by_type_from_events'
        )
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    RAISE NOTICE 'revoked (interne): %', r.sig;
  END LOOP;
END
$mig$;


-- ═════════════════════════════════════════════════════════════════════════════
-- §2 — HAUT : retirer anon de TOUTE la surface RPC applicative
--
-- Deux mécanismes distincts donnent l'accès à un appelant non authentifié, et il
-- faut fermer les DEUX :
--   (1) le défaut Postgres : EXECUTE à PUBLIC à la création, et anon est membre
--       de PUBLIC ;
--   (2) le défaut SUPABASE, plus direct : le projet pose un
--         ALTER DEFAULT PRIVILEGES IN SCHEMA public
--           GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
--       => chaque fonction créée dans `public` reçoit un GRANT **nominatif** à
--       `anon`, qui survit à un simple `REVOKE ... FROM PUBLIC`.
--
-- C'est (2) qui a fait échouer la première version de cette section : elle ne
-- revoquait que PUBLIC et laissait l'entrée `anon=X` en place. Le garde-fou §15
-- a correctement bloqué le déploiement.
--
-- On balaie donc TOUTES les fonctions SECURITY DEFINER de `public`, sauf :
--   - les helpers internes (préfixe `_` et liste explicite), déjà fermés en §1 —
--     surtout ne pas leur re-GRANT `authenticated` ici ;
--   - les fonctions de trigger, hors surface d'appel RPC ;
--   - les 3 RPC à token volontairement ouvertes à anon.
--
-- `authenticated` et `service_role` sont (re)grantés : l'accès des utilisateurs
-- connectés et des jobs serveur est préservé à l'identique, seul l'accès non
-- authentifié disparaît. Les gardes has_*/is_* internes continuent de faire le
-- travail d'isolation pour les appelants connectés.
-- ═════════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef                                 -- SECURITY DEFINER uniquement
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname NOT LIKE E'\\_%'                  -- helpers internes : traités en §1
      AND p.proname NOT IN (
        'gen_link_code',                              -- helpers internes (suite)
        'prune_link_code_attempts',
        'sync_match_goals_by_type_from_events',
        'get_feedback_session_by_token',              -- surface anon assumée (token 128 bits)
        'submit_training_feedback',                   -- idem
        'report_pain_by_token'                        -- idem
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    RAISE NOTICE 'anon retire: %', r.sig;
  END LOOP;
END
$mig$;


-- ═════════════════════════════════════════════════════════════════════════════
-- §3 — HAUT : élévation de privilège 'viewer' -> création de code de liaison
--
-- create_player_link_code génère un code qui permet à quiconque le détient de
-- RATTACHER SON COMPTE au joueur (claim_player_link_code). Il était gardé par
-- has_club_access(), qui inclut le rôle 'viewer' (lecture seule) et n'est pas
-- team-scopé. Un viewer pouvait donc fabriquer un accès compte joueur.
-- Correctif : has_team_write_access() sur l'équipe du joueur (admin du club, ou
-- coach rattaché à cette équipe) — aligné sur 20260730100000.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION create_player_link_code(p_player_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code       TEXT;
  v_expires_at TIMESTAMPTZ;
  v_has_access BOOLEAN;
BEGIN
  -- Droit d'ÉCRITURE sur au moins une équipe du joueur (team_id direct OU player_teams)
  SELECT EXISTS (
    SELECT 1 FROM players p
    LEFT JOIN player_teams pt ON pt.player_id = p.id
    WHERE p.id = p_player_id
      AND (
        (p.team_id  IS NOT NULL AND has_team_write_access(p.team_id))
        OR (pt.team_id IS NOT NULL AND has_team_write_access(pt.team_id))
      )
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_access');
  END IF;

  DELETE FROM player_link_codes WHERE player_id = p_player_id;

  v_code       := gen_link_code();
  v_expires_at := NOW() + INTERVAL '24 hours';

  INSERT INTO player_link_codes (player_id, code, expires_at)
  VALUES (p_player_id, v_code, v_expires_at);

  RETURN jsonb_build_object('ok', true, 'code', v_code, 'expires_at', v_expires_at);
END;
$$;

REVOKE ALL   ON FUNCTION create_player_link_code(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_player_link_code(UUID) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- §4 — MOYEN : écritures gardées par une primitive de LECTURE
--
-- has_club_access() renvoie TRUE pour le rôle 'viewer'. Toute opération d'écriture
-- gardée par cette primitive est donc ouverte au lecteur seul.
--   - set_rating_weights / reset_rating_weights : un viewer pouvait réécrire le
--     barème de notation du club (impacte toutes les notes de tous les matchs) ;
--   - create_feedback_tokens_for_training : un viewer pouvait (re)générer les
--     tokens de questionnaire, ce qui INVALIDE les tokens déjà distribués
--     (ON CONFLICT DO UPDATE SET token = ...) et permet de collecter les réponses.
-- ═════════════════════════════════════════════════════════════════════════════

-- 4.a — barème de notation : écriture réservée admin/coach du club
CREATE OR REPLACE FUNCTION set_rating_weights(
  p_w_goal NUMERIC, p_w_assist NUMERIC, p_w_recovery NUMERIC, p_w_shot_on_target NUMERIC,
  p_w_shot NUMERIC, p_w_ball_loss NUMERIC, p_w_yellow_card NUMERIC, p_w_red_card NUMERIC,
  p_cw_goal NUMERIC, p_cw_shot NUMERIC, p_cw_opponent_shot NUMERIC, p_cw_opponent_goal NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID := get_user_club_id();
BEGIN
  IF v_club_id IS NULL OR NOT has_club_write_access(v_club_id) THEN
    RAISE EXCEPTION 'Accès refusé: droits d''écriture requis sur le club';
  END IF;

  INSERT INTO match_rating_weights (
    club_id, w_goal, w_assist, w_recovery, w_shot_on_target, w_shot, w_ball_loss,
    w_yellow_card, w_red_card, cw_goal, cw_shot, cw_opponent_shot, cw_opponent_goal, updated_at
  ) VALUES (
    v_club_id, p_w_goal, p_w_assist, p_w_recovery, p_w_shot_on_target, p_w_shot, p_w_ball_loss,
    p_w_yellow_card, p_w_red_card, p_cw_goal, p_cw_shot, p_cw_opponent_shot, p_cw_opponent_goal, now()
  )
  ON CONFLICT (club_id) DO UPDATE SET
    w_goal = EXCLUDED.w_goal, w_assist = EXCLUDED.w_assist, w_recovery = EXCLUDED.w_recovery,
    w_shot_on_target = EXCLUDED.w_shot_on_target, w_shot = EXCLUDED.w_shot, w_ball_loss = EXCLUDED.w_ball_loss,
    w_yellow_card = EXCLUDED.w_yellow_card, w_red_card = EXCLUDED.w_red_card,
    cw_goal = EXCLUDED.cw_goal, cw_shot = EXCLUDED.cw_shot,
    cw_opponent_shot = EXCLUDED.cw_opponent_shot, cw_opponent_goal = EXCLUDED.cw_opponent_goal,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION reset_rating_weights()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID := get_user_club_id();
BEGIN
  IF v_club_id IS NULL OR NOT has_club_write_access(v_club_id) THEN
    RAISE EXCEPTION 'Accès refusé: droits d''écriture requis sur le club';
  END IF;
  DELETE FROM match_rating_weights WHERE club_id = v_club_id;
END;
$$;

-- La table match_rating_weights doit suivre la même règle côté RLS
DROP POLICY IF EXISTS match_rating_weights_insert ON match_rating_weights;
DROP POLICY IF EXISTS match_rating_weights_update ON match_rating_weights;
CREATE POLICY match_rating_weights_insert ON match_rating_weights
  FOR INSERT WITH CHECK (has_club_write_access(club_id));
CREATE POLICY match_rating_weights_update ON match_rating_weights
  FOR UPDATE USING (has_club_write_access(club_id)) WITH CHECK (has_club_write_access(club_id));

-- 4.b — tokens de questionnaire : écriture réservée à l'équipe de la séance
CREATE OR REPLACE FUNCTION create_feedback_tokens_for_training(p_training_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training_id UUID;
  v_team_id     UUID;
  v_inserted    INT := 0;
  v_player_id   TEXT;
  v_status      TEXT;
  v_token       TEXT;
  v_expires     TIMESTAMPTZ;
BEGIN
  SELECT tr.id, tr.team_id INTO v_training_id, v_team_id
  FROM trainings tr
  WHERE tr.id = p_training_id;

  IF v_training_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'training_not_found');
  END IF;

  IF v_team_id IS NULL OR NOT has_team_write_access(v_team_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_expires := NOW() + INTERVAL '7 days';

  FOR v_player_id, v_status IN
    SELECT key, value
    FROM jsonb_each_text((
      SELECT COALESCE(attendance, '{}'::jsonb) FROM trainings WHERE id = p_training_id
    ))
  LOOP
    IF v_status IN ('present', 'late') THEN
      v_token := gen_random_uuid()::text;
      INSERT INTO training_feedback_tokens (training_id, player_id, token, expires_at)
      VALUES (p_training_id, v_player_id::uuid, v_token, v_expires)
      ON CONFLICT (training_id, player_id) DO UPDATE
        SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, used_at = NULL;
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'count', v_inserted);
END;
$$;

REVOKE ALL   ON FUNCTION create_feedback_tokens_for_training(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_feedback_tokens_for_training(UUID) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- §5 — MOYEN : injection de contenu dans les notifications staff + flood
--
-- _insert_pain_reports concatène `zone` (texte libre client) dans le corps de la
-- notification envoyée au staff (et poussée en push APNs). Sans borne ni
-- validation : texte de phishing arbitraire dans une notif de confiance, et
-- volume de zones non borné => flood de notifications.
-- Correctif : zone contrainte à un identifiant court [A-Za-z0-9_-], max 40 car.,
-- et max 20 zones par soumission.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _insert_pain_reports(
  p_player_id   UUID,
  p_zones       JSONB,
  p_source      TEXT,
  p_note        TEXT,
  p_onset       TEXT,
  p_training_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group      UUID := gen_random_uuid();
  v_elem       JSONB;
  v_count      INTEGER := 0;
  v_max        SMALLINT := 0;
  v_first_zone TEXT;
  v_int        SMALLINT;
  v_zone       TEXT;
BEGIN
  IF p_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_player');
  END IF;
  IF p_zones IS NULL OR jsonb_typeof(p_zones) <> 'array' OR jsonb_array_length(p_zones) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_zones');
  END IF;
  IF jsonb_array_length(p_zones) > 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'too_many_zones');
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_zones)
  LOOP
    v_int  := LEAST(3, GREATEST(1, COALESCE((v_elem->>'intensity')::SMALLINT, 1)));
    v_zone := left(COALESCE(v_elem->>'zone', ''), 40);

    -- Identifiant de zone attendu par le BodyMap : pas de texte libre.
    IF v_zone !~ '^[A-Za-z0-9_-]{1,40}$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_zone');
    END IF;

    INSERT INTO public.pain_reports
      (player_id, report_group, zone, side, intensity, mode, source, note, onset, training_id)
    VALUES (
      p_player_id, v_group,
      v_zone,
      COALESCE(NULLIF(v_elem->>'side',''), 'C'),
      v_int,
      COALESCE(NULLIF(v_elem->>'mode',''), 'zone'),
      p_source,
      NULLIF(left(trim(COALESCE(p_note,'')), 500), ''),
      NULLIF(p_onset,''),
      p_training_id
    );

    v_count := v_count + 1;
    IF v_int > v_max THEN v_max := v_int; END IF;
    IF v_first_zone IS NULL THEN v_first_zone := v_zone; END IF;
  END LOOP;

  PERFORM _notify_pain_report(p_player_id, v_max, v_count, v_first_zone);

  RETURN jsonb_build_object('success', true, 'report_group', v_group, 'count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION _insert_pain_reports(UUID, JSONB, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- §6 — MOYEN : report_pain_by_token — token réutilisable sans limite
--
-- Le token de questionnaire est valable 7 jours et n'est pas consommé par le
-- signalement de douleur (il ne doit pas l'être : submit_training_feedback s'en
-- sert aussi). Sans borne, le porteur du lien peut générer un volume illimité de
-- signalements et de notifications staff. Plafond : 3 soumissions par
-- (joueur, séance).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION report_pain_by_token(
  p_token TEXT,
  p_zones JSONB,
  p_note  TEXT DEFAULT NULL,
  p_onset TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id   UUID;
  v_training_id UUID;
  v_expires_at  TIMESTAMPTZ;
  v_groups      INTEGER;
BEGIN
  SELECT tft.player_id, tft.training_id, tft.expires_at
    INTO v_player_id, v_training_id, v_expires_at
  FROM training_feedback_tokens tft
  WHERE tft.token = p_token;

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF v_expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  SELECT COUNT(DISTINCT report_group) INTO v_groups
  FROM public.pain_reports
  WHERE player_id = v_player_id AND training_id = v_training_id;

  IF v_groups >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'rate_limited');
  END IF;

  RETURN _insert_pain_reports(v_player_id, p_zones, 'questionnaire', p_note, p_onset, v_training_id);
END;
$$;

REVOKE ALL   ON FUNCTION report_pain_by_token(TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION report_pain_by_token(TEXT, JSONB, TEXT, TEXT) TO anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- §7 — MOYEN : has_player_access ignore players.team_id
--
-- has_player_access ne regarde que la table de jonction player_teams. Un joueur
-- rattaché uniquement par players.team_id (cas courant, cf. _notify_pain_report
-- et create_player_link_code qui gèrent LES DEUX) est invisible pour son propre
-- staff. Fail-closed, donc pas une fuite — mais ça CASSE l'accès staff aux
-- pain_reports et player_events pour ces joueurs.
--
-- /!\ Ce correctif ÉLARGIT l'accès. Il aligne has_player_access sur le modèle de
--     données réel (deux rattachements possibles), pas au-delà : has_team_access
--     reste la seule autorité. À valider sur staging.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION has_player_access(p_player_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM players p
    WHERE p.id = p_player_id
      AND p.team_id IS NOT NULL
      AND has_team_access(p.team_id)
  ) OR EXISTS (
    SELECT 1 FROM player_teams pt
    WHERE pt.player_id = p_player_id
      AND has_team_access(pt.team_id)
  );
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- §8 — BAS : log_shared_content_view ne vérifie pas l'accès au contenu
--
-- Un joueur authentifié peut logguer une vue sur n'importe quel content_id, y
-- compris d'un autre club : pollution des analytics de partage d'un club tiers
-- (et apparition de son nom dans leur dashboard). Correctif : le contenu doit
-- appartenir à une équipe du joueur.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_shared_content_view(p_content_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_team_id   UUID;
BEGIN
  SELECT id INTO v_player_id FROM players WHERE user_id = auth.uid() LIMIT 1;
  IF v_player_id IS NULL THEN RETURN; END IF;

  SELECT team_id INTO v_team_id FROM shared_content WHERE id = p_content_id LIMIT 1;
  IF v_team_id IS NULL THEN RETURN; END IF;

  -- Le contenu doit relever d'une équipe du joueur (team_id direct ou player_teams)
  IF NOT EXISTS (
    SELECT 1 FROM players p WHERE p.id = v_player_id AND p.team_id = v_team_id
    UNION ALL
    SELECT 1 FROM player_teams pt WHERE pt.player_id = v_player_id AND pt.team_id = v_team_id
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM shared_content_views
    WHERE content_id = p_content_id
      AND player_id  = v_player_id
      AND viewed_at  > now() - INTERVAL '5 minutes'
  ) THEN RETURN; END IF;

  INSERT INTO shared_content_views(content_id, player_id, team_id)
  VALUES (p_content_id, v_player_id, v_team_id);
END;
$$;

REVOKE ALL   ON FUNCTION public.log_shared_content_view(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_shared_content_view(UUID) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- §9 — BAS : policy RLS morte sur shared_content_views
-- has_club_access(auth.uid()) passait un user_id là où un club_id est attendu :
-- la condition ne matche jamais. Documenté dans l'audit de juillet, non corrigé.
-- ═════════════════════════════════════════════════════════════════════════════

-- Supprime toute policy de cette table passant un user_id à has_club_access,
-- quel que soit son nom (la policy d'origine s'appelle "Coaches can read content views").
DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'shared_content_views'
      AND COALESCE(qual, '') ILIKE '%has_club_access%uid%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.shared_content_views', r.policyname);
    RAISE NOTICE 'policy morte supprimee: %', r.policyname;
  END LOOP;
END
$mig$;

DROP POLICY IF EXISTS "Staff can view team shared_content_views" ON shared_content_views;
CREATE POLICY "Staff can view team shared_content_views" ON shared_content_views
  FOR SELECT USING (has_team_access(team_id));

DROP POLICY IF EXISTS "Player can view own shared_content_views" ON shared_content_views;
CREATE POLICY "Player can view own shared_content_views" ON shared_content_views
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM players p WHERE p.id = shared_content_views.player_id AND p.user_id = auth.uid())
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- §10 — INFO : codes courts générés avec random() (PRNG non cryptographique)
--
-- gen_link_code() et _gen_invitation_code() utilisent random(), un PRNG
-- déterministe : la séquence est prédictible pour qui connaît l'état de la
-- session. Espace de 32^8 ≈ 1.1e12, donc pas brute-forçable, mais le code de
-- liaison joueur donne un accès compte : il doit être imprévisible.
-- Correctif : dérivation depuis gen_random_uuid() (CSPRNG en PG13+), 8 groupes
-- de 2 caractères hex -> 0..255 -> modulo 32 (256/32 = 8 exact, aucun biais).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _gen_secure_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars  TEXT  := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32 car., sans 0/O/1/I
  raw    BYTEA := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');  -- 16 octets
  result TEXT  := '';
  i      INT;
BEGIN
  FOR i IN 0..7 LOOP
    -- get_byte -> 0..255 ; 256 / 32 = 8 exactement, donc modulo sans biais
    result := result || substr(chars, (get_byte(raw, i) % 32) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION _gen_secure_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION gen_link_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN _gen_secure_code();
END;
$$;

REVOKE ALL ON FUNCTION gen_link_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION _gen_invitation_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  result TEXT;
BEGIN
  LOOP
    result := _gen_secure_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM club_invitations WHERE code = result);
  END LOOP;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION _gen_invitation_code() FROM PUBLIC, anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- §11 — Filet : fonctions DEFINER restées sans ACL du tout
--
-- Cas résiduel où `proacl IS NULL` (aucun GRANT/REVOKE n'a jamais été appliqué) :
-- les privilèges par défaut Postgres donnent alors EXECUTE à PUBLIC. Sur un projet
-- Supabase standard ce cas est rare — l'ALTER DEFAULT PRIVILEGES du projet pose
-- une ACL explicite dès la création (cf. §2) — mais il apparaît sur les fonctions
-- créées hors de ce cadre (schéma restauré, fonction créée par un autre rôle).
--
-- Même règle que §2 : anon dehors, authenticated/service_role préservés. Les
-- helpers internes fermés en §1 ont désormais une ACL explicite, donc
-- `proacl IS NULL` ne les sélectionne pas : aucun risque de les rouvrir.
--
-- Les primitives d'accès (has_club_access, has_team_access, ...) doivent rester
-- exécutables par authenticated : les expressions de policy RLS sont évaluées
-- sous l'identité de l'appelant, pas du propriétaire.
-- ═════════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND p.proacl IS NULL                       -- défaut Postgres : PUBLIC a EXECUTE
      AND p.proname NOT IN (
        'get_feedback_session_by_token',
        'submit_training_feedback',
        'report_pain_by_token'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    RAISE NOTICE 'ferme a anon: %', r.sig;
  END LOOP;
END
$mig$;


-- ═════════════════════════════════════════════════════════════════════════════
-- §12 — HAUT : garde d'identité contournable quand auth.uid() est NULL
--
-- accept_club_invitation et accept_club_invitation_by_code protègent l'appel par
--   IF auth.uid() <> p_user_id THEN RAISE ...
-- En SQL, NULL <> 'valeur' vaut NULL, pas TRUE : la condition du IF n'est jamais
-- vraie pour un appelant NON AUTHENTIFIÉ (auth.uid() = NULL) et la garde est
-- simplement sautée. Ces deux fonctions étant joignables par anon (§2/§11 ferment
-- l'accès, mais la logique doit être correcte indépendamment), un appelant anon
-- pouvait faire accepter une invitation au nom d'un tiers dont il connaît le
-- user_id (le contrôle d'email est alors satisfait par construction).
--
-- Correctif : rendre la comparaison NULL-safe (IS DISTINCT FROM + rejet explicite
-- de auth.uid() IS NULL).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION accept_club_invitation(p_token UUID, p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation club_invitations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas accepter une invitation au nom d''un autre utilisateur';
  END IF;

  SELECT * INTO v_invitation
  FROM club_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > NOW();

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'Invitation invalide ou expirée';
  END IF;

  IF LOWER((SELECT email FROM auth.users WHERE id = p_user_id)) IS DISTINCT FROM LOWER(v_invitation.email) THEN
    RAISE EXCEPTION 'Cette invitation est destinée à un autre email';
  END IF;

  INSERT INTO club_members (user_id, club_id, role, team_id)
  SELECT p_user_id, v_invitation.club_id, v_invitation.role, v_invitation.team_id
  WHERE NOT EXISTS (
    SELECT 1 FROM club_members WHERE user_id = p_user_id AND club_id = v_invitation.club_id
  );

  UPDATE club_invitations SET status = 'accepted' WHERE id = v_invitation.id;

  RETURN v_invitation.club_id;
END;
$$;

REVOKE ALL   ON FUNCTION accept_club_invitation(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION accept_club_invitation(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION accept_club_invitation_by_code(p_code TEXT, p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation club_invitations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas accepter une invitation au nom d''un autre utilisateur';
  END IF;

  SELECT * INTO v_invitation
  FROM club_invitations
  WHERE code = upper(trim(p_code))
    AND status = 'pending'
    AND expires_at > NOW();

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'Code invalide ou expiré';
  END IF;

  IF LOWER((SELECT email FROM auth.users WHERE id = p_user_id)) IS DISTINCT FROM LOWER(v_invitation.email) THEN
    RAISE EXCEPTION 'Cette invitation est destinée à une autre adresse email';
  END IF;

  INSERT INTO club_members (user_id, club_id, role, team_id)
  SELECT p_user_id, v_invitation.club_id, v_invitation.role, v_invitation.team_id
  WHERE NOT EXISTS (
    SELECT 1 FROM club_members WHERE user_id = p_user_id AND club_id = v_invitation.club_id
  );

  UPDATE club_invitations SET status = 'accepted' WHERE id = v_invitation.id;

  RETURN v_invitation.club_id;
END;
$$;

REVOKE ALL   ON FUNCTION accept_club_invitation_by_code(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION accept_club_invitation_by_code(TEXT, UUID) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- §13 — MOYEN : create_user_club ne vérifie pas p_user_id = auth.uid()
--
-- Reporté de l'audit de juillet (documenté, non corrigé faute de test du flux
-- d'inscription). Un appelant peut créer des clubs en désignant un user_id
-- arbitraire comme admin (spam / squat d'admin).
--
-- /!\ Le test `auth.uid() IS NOT NULL` est VOLONTAIRE : il préserve les appels
--     service_role / trigger au signup, où auth.uid() est NULL. À valider sur le
--     flux d'inscription en staging avant prod (cf. actions du rapport).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION create_user_club(p_user_id UUID, p_user_email TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_club_id UUID;
  user_email  TEXT;
BEGIN
  -- Un appelant authentifié ne peut créer un club que pour lui-même.
  -- auth.uid() NULL => appel serveur (service_role / trigger de signup) : autorisé.
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas créer un club au nom d''un autre utilisateur';
  END IF;

  IF p_user_email IS NULL THEN
    SELECT email INTO user_email FROM auth.users WHERE id = p_user_id;
  ELSE
    user_email := p_user_email;
  END IF;

  SELECT club_id INTO new_club_id
  FROM club_members
  WHERE user_id = p_user_id
  LIMIT 1;

  IF new_club_id IS NULL THEN
    INSERT INTO clubs (id, name, description, created_at)
    VALUES (
      gen_random_uuid(),
      COALESCE(split_part(user_email, '@', 1), 'Nouveau') || ' - Club',
      'Club créé automatiquement pour ' || COALESCE(user_email, 'nouvel utilisateur'),
      NOW()
    )
    RETURNING id INTO new_club_id;

    INSERT INTO club_members (user_id, club_id, role, created_at)
    VALUES (p_user_id, new_club_id, 'admin', NOW());
  END IF;

  RETURN new_club_id;
END;
$$;

REVOKE ALL   ON FUNCTION create_user_club(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_user_club(UUID, TEXT) TO authenticated, service_role;


-- ═════════════════════════════════════════════════════════════════════════════
-- §14 — BAS : search_path non figé sur les fonctions SECURITY DEFINER
--
-- 11 fonctions (dont TOUTES les primitives d'isolation : has_club_access,
-- has_team_access, is_club_admin, is_team_coach, get_user_club_id, ...) sont
-- SECURITY DEFINER sans `SET search_path`. Elles résolvent donc leurs noms de
-- tables via le search_path de l'APPELANT : détournement possible si un rôle peut
-- créer des objets dans un schéma qui précède `public`. C'est aussi l'avertissement
-- `function_search_path_mutable` du linter Supabase.
--
-- On fige le search_path sur toutes les fonctions DEFINER du schéma public qui
-- n'en ont pas (ALTER, sans redéfinir le corps : aucun risque de régression
-- fonctionnelle).
-- ═════════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND (p.proconfig IS NULL
           OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search\_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    RAISE NOTICE 'search_path fige: %', r.sig;
  END LOOP;
END
$mig$;


-- ═════════════════════════════════════════════════════════════════════════════
-- §16 — MOYEN : get_team_stats — fuite inter-clubs + dérive de schéma
--
-- Fonction trouvée par le garde-fou §15, PAS par l'audit : elle n'existe dans
-- AUCUNE des 88 migrations. Créée à la main dans le dashboard, donc absente du
-- repo, donc invisible à toute relecture de code. Son paramètre s'appelle
-- `team_uuid` et non `p_team_id` : elle échappait aussi au grep de convention.
--
-- SECURITY DEFINER, prend un identifiant d'équipe, aucune garde d'accès : tout
-- compte authentifié lisait les agrégats (effectif, matchs, séances, buts) de
-- n'importe quelle équipe de n'importe quel club, et pouvait énumérer les
-- team_id existants. Pas de donnée nominative, d'où MOYEN et non HAUT.
--
-- On la rapatrie ici pour qu'elle soit enfin versionnée, avec has_team_access
-- (garde de LECTURE : viewer inclus, ce qui est correct pour un affichage de
-- stats). Signature, nom de paramètre et type de retour strictement inchangés —
-- app/webapp/manager/teams/page.tsx:96 l'appelle avec { team_uuid }.
--
-- /!\ Deux bugs de calcul PRÉEXISTANTS sont conservés tels quels, volontairement :
--     une migration de sécurité ne doit pas changer des chiffres affichés.
--     (1) total_attendance = COUNT(DISTINCT t.id), soit exactement total_trainings ;
--     (2) total_goals utilise un COUNT non-DISTINCT sur un produit cartésien
--         (players × matches × trainings × match_events) : la valeur est gonflée.
--     À traiter dans un correctif fonctionnel séparé.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_team_stats(team_uuid uuid)
RETURNS TABLE(
  total_players    integer,
  total_matches    integer,
  total_trainings  integer,
  total_goals      integer,
  total_attendance integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT has_team_access(team_uuid) THEN
    RAISE EXCEPTION 'Accès refusé: vous n''avez pas accès à cette équipe';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(DISTINCT p.id)::INTEGER,
    COUNT(DISTINCT m.id)::INTEGER,
    COUNT(DISTINCT t.id)::INTEGER,
    COUNT(CASE WHEN me.event_type = 'goal' THEN 1 END)::INTEGER,
    COUNT(DISTINCT t.id)::INTEGER
  FROM teams tm
  LEFT JOIN players p     ON p.team_id  = tm.id
  LEFT JOIN matches m     ON m.team_id  = tm.id
  LEFT JOIN trainings t   ON t.team_id  = tm.id
  LEFT JOIN match_events me ON me.match_id = m.id
  WHERE tm.id = team_uuid
  GROUP BY tm.id;
END;
$$;

REVOKE ALL   ON FUNCTION public.get_team_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_stats(uuid) TO authenticated, service_role;


-- ═════════════════════════════════════════════════════════════════════════════
-- §15 — Garde-fou permanent : échouer si une RPC DEFINER reste joignable par anon
--
-- Bloque cette migration, et toute future, si la régression réapparaît.
-- Doit rester la DERNIÈRE section du fichier.
-- ═════════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  v_leaks TEXT;
BEGIN
  SELECT string_agg(sig, E'\n  ') INTO v_leaks
  FROM (
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname NOT IN (
        'get_feedback_session_by_token',   -- anon assumé (token 128 bits)
        'submit_training_feedback',        -- anon assumé (token 128 bits)
        'report_pain_by_token'             -- anon assumé (token 128 bits)
      )
      AND (
        p.proacl IS NULL                                       -- défaut Postgres = PUBLIC
        OR EXISTS (
          SELECT 1 FROM aclexplode(p.proacl) a
          LEFT JOIN pg_roles gr ON gr.oid = a.grantee
          WHERE a.privilege_type = 'EXECUTE'
            AND (a.grantee = 0 OR gr.rolname = 'anon')
        )
      )
  ) s;

  IF v_leaks IS NOT NULL THEN
    RAISE EXCEPTION E'RPC SECURITY DEFINER encore joignables sans authentification :\n  %', v_leaks;
  END IF;
END
$mig$;
