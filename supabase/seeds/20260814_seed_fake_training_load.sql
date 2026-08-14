-- ═════════════════════════════════════════════════════════════════════════════
-- DONNÉES DE TEST — 5 séances factices + réponses au questionnaire joueur
--
-- But : peupler l'onglet Performance > Charge d'entraînement (vue Équipe ET
-- vue Joueur) pour vérifier l'écran sans attendre 5 vraies séances.
--
-- Prérequis : les deux migrations suivantes doivent déjà être appliquées
-- (le bloc de garde ci-dessous le vérifie et arrête le script sinon) :
--   - 20260814120000_training_target_rpe.sql
--   - 20260814130000_player_training_load.sql
--
-- À FAIRE AVANT DE LANCER : remplacer l'UUID ci-dessous (section 1) par
-- l'UUID de l'équipe de test. Pour le retrouver :
--   SELECT id, name, club_id FROM teams ORDER BY name;
--
-- Encadrer l'exécution par BEGIN; / COMMIT; dans le SQL Editor.
--
-- Nettoyage après test : voir la requête commentée tout en bas du fichier.
-- Toutes les lignes créées sont identifiables par le tag [TEST] dans
-- `location` et `key_principle`, donc jamais confondues avec une vraie
-- séance dans le calendrier ou les listes.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 0. Garde-fou : prérequis présents ───────────────────────────────────────
DO $seed$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trainings' AND column_name = 'target_rpe_min'
  ) THEN
    RAISE EXCEPTION 'trainings.target_rpe_min absente : applique 20260814120000_training_target_rpe.sql avant ce script';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_player_training_load'
  ) THEN
    RAISE EXCEPTION 'get_player_training_load absente : applique 20260814130000_player_training_load.sql avant ce script';
  END IF;
END
$seed$;

-- ── 1. Paramètre : équipe de test ───────────────────────────────────────────
DROP TABLE IF EXISTS _seed_params;
CREATE TEMP TABLE _seed_params AS
SELECT 'REMPLACE_PAR_UUID_EQUIPE'::uuid AS team_id;

DO $seed$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM teams, _seed_params WHERE teams.id = _seed_params.team_id) THEN
    RAISE EXCEPTION 'Aucune équipe avec cet UUID. Vérifie _seed_params.team_id (section 1 du script).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM players, _seed_params WHERE players.team_id = _seed_params.team_id) THEN
    RAISE EXCEPTION 'Cette équipe n''a aucun joueur : impossible de générer des réponses.';
  END IF;
END
$seed$;

-- ── 2. Effectif de l'équipe, numéroté déterministe (rn) ─────────────────────
-- L'ordre par `id` n'a pas de sens métier : il sert uniquement à répartir les
-- joueurs en groupes reproductibles (« un tiers de l'effectif », etc.) sans
-- dépendre d'une colonne comme `created_at` qui n'est pas garantie exister.
DROP TABLE IF EXISTS _seed_players;
CREATE TEMP TABLE _seed_players AS
SELECT players.id AS player_id, ROW_NUMBER() OVER (ORDER BY players.id) AS rn
FROM players, _seed_params
WHERE players.team_id = _seed_params.team_id;

-- ── 3. Convocation : effectif complet, présent, sur les 5 séances ──────────
DROP TABLE IF EXISTS _seed_attendance;
CREATE TEMP TABLE _seed_attendance AS
SELECT
  jsonb_object_agg(player_id::text, 'present') AS attendance,
  jsonb_agg(jsonb_build_object('id', player_id)) AS convoked_players
FROM _seed_players;

-- ── 4. Les 5 séances ─────────────────────────────────────────────────────────
-- Étalées sur 5 semaines ISO distinctes (pas de 7 jours), pour peupler
-- l'histogramme hebdomadaire. Cible RPE et durée choisies pour couvrir les
-- 3 statuts (en dessous / dans la cible / au-dessus) et déclencher un pic de
-- charge sur la dernière séance (charge > 1,5 × moyenne des 4 précédentes).
DROP TABLE IF EXISTS _seed_trainings;
CREATE TEMP TABLE _seed_trainings (session_no int PRIMARY KEY, training_id uuid);

WITH ins AS (
  INSERT INTO trainings (date, location, theme, key_principle, attendance, convoked_players, team_id, session_duration, target_rpe_min, target_rpe_max)
  SELECT
    (CURRENT_DATE - 28)::timestamptz + INTERVAL '19 hours',
    '[TEST] Gymnase',
    'Défensif',
    '[TEST] Séance factice — à supprimer après test (charge/wellness)',
    a.attendance, a.convoked_players, p.team_id, 90, 5, 6
  FROM _seed_attendance a, _seed_params p
  RETURNING id
)
INSERT INTO _seed_trainings (session_no, training_id) SELECT 1, id FROM ins;

WITH ins AS (
  INSERT INTO trainings (date, location, theme, key_principle, attendance, convoked_players, team_id, session_duration, target_rpe_min, target_rpe_max)
  SELECT
    (CURRENT_DATE - 21)::timestamptz + INTERVAL '19 hours',
    '[TEST] Gymnase',
    'Offensif',
    '[TEST] Séance factice — à supprimer après test (charge/wellness)',
    a.attendance, a.convoked_players, p.team_id, 75, 6, 7
  FROM _seed_attendance a, _seed_params p
  RETURNING id
)
INSERT INTO _seed_trainings (session_no, training_id) SELECT 2, id FROM ins;

WITH ins AS (
  INSERT INTO trainings (date, location, theme, key_principle, attendance, convoked_players, team_id, session_duration, target_rpe_min, target_rpe_max)
  SELECT
    (CURRENT_DATE - 14)::timestamptz + INTERVAL '19 hours',
    '[TEST] Gymnase',
    'Transition',
    '[TEST] Séance factice — à supprimer après test (charge/wellness)',
    a.attendance, a.convoked_players, p.team_id, 90, 6, 8
  FROM _seed_attendance a, _seed_params p
  RETURNING id
)
INSERT INTO _seed_trainings (session_no, training_id) SELECT 3, id FROM ins;

WITH ins AS (
  INSERT INTO trainings (date, location, theme, key_principle, attendance, convoked_players, team_id, session_duration, target_rpe_min, target_rpe_max)
  SELECT
    (CURRENT_DATE - 7)::timestamptz + INTERVAL '19 hours',
    '[TEST] Gymnase',
    'Supériorité',
    '[TEST] Séance factice — à supprimer après test (charge/wellness)',
    a.attendance, a.convoked_players, p.team_id, 60, 4, 5
  FROM _seed_attendance a, _seed_params p
  RETURNING id
)
INSERT INTO _seed_trainings (session_no, training_id) SELECT 4, id FROM ins;

WITH ins AS (
  INSERT INTO trainings (date, location, theme, key_principle, attendance, convoked_players, team_id, session_duration, target_rpe_min, target_rpe_max)
  SELECT
    (CURRENT_DATE)::timestamptz + INTERVAL '19 hours',
    '[TEST] Gymnase',
    'Offensif',
    '[TEST] Séance factice — à supprimer après test (charge/wellness)',
    a.attendance, a.convoked_players, p.team_id, 105, 7, 9
  FROM _seed_attendance a, _seed_params p
  RETURNING id
)
INSERT INTO _seed_trainings (session_no, training_id) SELECT 5, id FROM ins;

-- ── 5. Réponses au questionnaire, une ligne par séance ──────────────────────
--
-- Séance 1 (J-28, Défensif, 90') — couverture 100 %, RPE 5-6 : DANS la cible.
INSERT INTO training_player_feedback (training_id, player_id, rpe, physical_form, pleasure, auto_evaluation)
SELECT t.training_id, sp.player_id, 5 + (sp.rn % 2), 7, 7, 7
FROM _seed_players sp CROSS JOIN (SELECT training_id FROM _seed_trainings WHERE session_no = 1) t;

-- Séance 2 (J-21, Offensif, 75') — un tiers seulement répond (couverture
-- < 60 %, teste le grisage). RPE 8, cible 6-7 : AU-DESSUS.
INSERT INTO training_player_feedback (training_id, player_id, rpe, physical_form, pleasure, auto_evaluation)
SELECT t.training_id, sp.player_id, 8, 5, 5, 5
FROM _seed_players sp CROSS JOIN (SELECT training_id FROM _seed_trainings WHERE session_no = 2) t
WHERE sp.rn % 3 = 0;

-- Séance 3 (J-14, Transition, 90') — deux tiers répondent (couverture
-- fiable). RPE 7, cible 6-8 : DANS la cible.
INSERT INTO training_player_feedback (training_id, player_id, rpe, physical_form, pleasure, auto_evaluation)
SELECT t.training_id, sp.player_id, 7, 6, 6, 6
FROM _seed_players sp CROSS JOIN (SELECT training_id FROM _seed_trainings WHERE session_no = 3) t
WHERE sp.rn % 3 != 0;

-- Séance 4 (J-7, Supériorité, 60') — couverture 100 %, RPE 3, cible 4-5 :
-- EN DESSOUS (séance plus légère que prévu).
INSERT INTO training_player_feedback (training_id, player_id, rpe, physical_form, pleasure, auto_evaluation)
SELECT t.training_id, sp.player_id, 3, 8, 8, 8
FROM _seed_players sp CROSS JOIN (SELECT training_id FROM _seed_trainings WHERE session_no = 4) t;

-- Séance 5 (aujourd'hui, Offensif, 105') — couverture 100 %, RPE 9, cible 7-9 :
-- DANS la cible mais très chargée → charge (9×105=945) > 1,5 × moyenne des
-- 4 semaines précédentes → doit déclencher le badge « pic de charge ».
INSERT INTO training_player_feedback (training_id, player_id, rpe, physical_form, pleasure, auto_evaluation)
SELECT t.training_id, sp.player_id, 9, 4, 4, 4
FROM _seed_players sp CROSS JOIN (SELECT training_id FROM _seed_trainings WHERE session_no = 5) t;

-- ── 6. Récapitulatif ─────────────────────────────────────────────────────────
SELECT
  st.session_no,
  tr.date::date AS session_date,
  tr.theme,
  tr.session_duration,
  tr.target_rpe_min,
  tr.target_rpe_max,
  COUNT(f.id) AS reponses,
  (SELECT COUNT(*) FROM _seed_players) AS effectif,
  ROUND(AVG(f.rpe)::numeric, 1) AS rpe_moyen
FROM _seed_trainings st
JOIN trainings tr ON tr.id = st.training_id
LEFT JOIN training_player_feedback f ON f.training_id = st.training_id
GROUP BY st.session_no, tr.date, tr.theme, tr.session_duration, tr.target_rpe_min, tr.target_rpe_max
ORDER BY st.session_no;

-- ═════════════════════════════════════════════════════════════════════════════
-- NETTOYAGE — à lancer une fois les tests terminés.
-- `training_player_feedback` a ON DELETE CASCADE sur training_id : supprimer
-- les séances suffit, pas besoin de supprimer les réponses séparément.
-- ═════════════════════════════════════════════════════════════════════════════
-- DELETE FROM trainings
-- WHERE key_principle = '[TEST] Séance factice — à supprimer après test (charge/wellness)';
