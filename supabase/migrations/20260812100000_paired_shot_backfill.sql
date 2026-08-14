-- =============================================================================
-- Reprise des tirs cadrés appariés aux buts
--
-- ÉTAPE 1 SUR 3. Celle-ci ne change AUCUN comportement applicatif : elle ajoute
-- une colonne de provenance et rattrape des lignes manquantes. Les étapes 2
-- (client mobile) et 3 (RPC) suivent, dans cet ordre — voir la note de
-- séquencement en fin de fichier.
--
-- ── LE PROBLÈME ──────────────────────────────────────────────────────────────
--
-- Un but est nécessairement cadré. Le recorder mobile écrit donc DEUX lignes
-- par but (`goal` + `shot_on_target`, même seconde, même mi-temps, même joueur),
-- le recorder web n'en écrit qu'une. Les deux populations cohabitent dans
-- `match_events` sans marqueur, et aucune formule de « tirs totaux » ne peut
-- être juste pour les deux.
--
-- Mesuré le 2026-08-12 (`supabase/diagnostics/20260812_tirs_appariement.sql`) :
--
--   162 buts au total, 50 appariés, 112 non appariés (69,1 %)
--     • 22 matchs 25/26 saisis sur le web  → 110 buts sans tir cadré
--     •  2 buts isolés dans des matchs mobile → insertions ratées (voir plus bas)
--
-- La bascule d'outil n'est PAS saisonnière : la saison 25/26 contient 22 matchs
-- web et 9 matchs mobile. Deux matchs voisins de la même saison ne sont donc pas
-- comparables entre eux. C'est ce qui justifie de reprendre l'historique plutôt
-- que de repartir propre.
--
-- ── CE QUE CETTE MIGRATION FAIT ──────────────────────────────────────────────
--
-- Pour chaque but sans tir cadré à sa coordonnée exacte, elle insère le tir
-- cadré manquant, en recopiant du but : `team_id`, `club_id`, `players_on_field`
-- et `created_at`. Recopier `players_on_field` est délibéré : c'est ce qui rend
-- le `+/-T` cohérent entre matchs web et mobile. **Les `+/-T` affichés sur les
-- 22 matchs web vont donc changer** — ils étaient faux, ils deviennent justes.
-- Arbitrage validé par Robin le 2026-08-12.
--
-- ── POURQUOI UNE COLONNE DE PROVENANCE ───────────────────────────────────────
--
-- Ces 112 lignes n'ont pas été observées : elles sont déduites. `backfill_reason`
-- les rend identifiables pour toujours, rend la reprise exactement réversible
-- (`DELETE ... WHERE backfill_reason IS NOT NULL`) et évite qu'un lecteur futur
-- les prenne pour de la saisie terrain. C'est la seule façon honnête d'écrire de
-- la donnée dérivée dans une table d'événements.
--
-- ── IDEMPOTENCE ──────────────────────────────────────────────────────────────
--
-- Le jeu à insérer est recalculé depuis l'état courant. Après un premier
-- passage, il n'y a plus de but non apparié : un second passage insère 0 ligne.
-- La migration est donc rejouable sans risque — et c'est utile, voir la note de
-- séquencement.
--
-- À exécuter encadrée de BEGIN; / COMMIT; dans le SQL Editor.
-- =============================================================================


-- ─── §1 · Colonne de provenance ──────────────────────────────────────────────

ALTER TABLE match_events
  ADD COLUMN IF NOT EXISTS backfill_reason TEXT;

COMMENT ON COLUMN match_events.backfill_reason IS
  'NULL = événement saisi par un coach. Non NULL = ligne déduite par une '
  'migration de reprise, jamais observée sur le terrain. Voir '
  'supabase/migrations/20260812100000_paired_shot_backfill.sql.';


-- ─── §2 · Reprise ────────────────────────────────────────────────────────────

WITH coord AS (
  SELECT
    match_id,
    half,
    match_time_seconds,
    player_id,
    COUNT(*) FILTER (WHERE event_type = 'goal')           AS nb_buts,
    COUNT(*) FILTER (WHERE event_type = 'shot_on_target') AS nb_cadres
  FROM match_events
  WHERE event_type IN ('goal', 'shot_on_target')
  GROUP BY match_id, half, match_time_seconds, player_id
),
manquants AS (
  -- Combien de tirs cadrés il manque à cette coordonnée. Le GREATEST couvre le
  -- cas d'une coordonnée portant plusieurs buts.
  SELECT
    c.match_id,
    c.half,
    c.match_time_seconds,
    c.player_id,
    GREATEST(c.nb_buts - c.nb_cadres, 0) AS a_creer
  FROM coord c
  WHERE c.nb_buts > c.nb_cadres
),
modele AS (
  -- Une ligne de but par coordonnée, dont on recopie le contexte.
  SELECT DISTINCT ON (e.match_id, e.half, e.match_time_seconds, e.player_id)
    e.match_id,
    e.team_id,
    e.club_id,
    e.half,
    e.match_time_seconds,
    e.player_id,
    e.players_on_field,
    e.created_at
  FROM match_events e
  JOIN manquants m
    ON  m.match_id           = e.match_id
    AND m.half               = e.half
    AND m.match_time_seconds = e.match_time_seconds
    AND m.player_id IS NOT DISTINCT FROM e.player_id
  WHERE e.event_type = 'goal'
  ORDER BY e.match_id, e.half, e.match_time_seconds, e.player_id, e.created_at
)
INSERT INTO match_events (
  match_id, team_id, club_id, event_type, match_time_seconds, half,
  player_id, players_on_field, created_at, backfill_reason
)
SELECT
  mo.match_id,
  mo.team_id,
  mo.club_id,
  'shot_on_target',
  mo.match_time_seconds,
  mo.half,
  mo.player_id,
  mo.players_on_field,
  mo.created_at,
  'goal_paired_shot_2026_08'
FROM modele mo
JOIN manquants ma
  ON  ma.match_id           = mo.match_id
  AND ma.half               = mo.half
  AND ma.match_time_seconds = mo.match_time_seconds
  AND ma.player_id IS NOT DISTINCT FROM mo.player_id
CROSS JOIN LATERAL generate_series(1, ma.a_creer);


-- ─── §3 · Vérification — échoue si l'invariant n'est pas tenu ────────────────
--
-- Un contrôle qui interroge la base attrape ce qu'aucune relecture de SQL ne
-- voit. Si ce bloc lève, le COMMIT n'a pas lieu et rien n'est écrit.

DO $$
DECLARE
  v_restants   INTEGER;
  v_inseres    INTEGER;
  v_total_buts INTEGER;
BEGIN
  SELECT COALESCE(SUM(GREATEST(nb_buts - nb_cadres, 0)), 0)
  INTO v_restants
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'goal')           AS nb_buts,
      COUNT(*) FILTER (WHERE event_type = 'shot_on_target') AS nb_cadres
    FROM match_events
    WHERE event_type IN ('goal', 'shot_on_target')
    GROUP BY match_id, half, match_time_seconds, player_id
  ) c;

  SELECT COUNT(*) INTO v_inseres
  FROM match_events WHERE backfill_reason = 'goal_paired_shot_2026_08';

  SELECT COUNT(*) INTO v_total_buts
  FROM match_events WHERE event_type = 'goal';

  RAISE NOTICE 'Buts au total          : %', v_total_buts;
  RAISE NOTICE 'Tirs cadrés recréés    : %', v_inseres;
  RAISE NOTICE 'Buts encore non appariés: %', v_restants;

  IF v_restants > 0 THEN
    RAISE EXCEPTION
      'Reprise incomplète : % but(s) restent sans tir cadré apparié. Rien n''est écrit.',
      v_restants;
  END IF;
END;
$$;


-- =============================================================================
-- SÉQUENCEMENT — lire avant de passer à la suite
--
--   ÉTAPE 1  ce fichier. Aucun changement de comportement. À passer maintenant.
--
--   ÉTAPE 2  client mobile : retirer l'insertion explicite du tir apparié dans
--            `mobile/components/recorder/useMatchRecorder.ts`, puis DÉPLOYER.
--            Tant que l'étape 3 n'est pas passée, les nouveaux buts mobiles
--            seront non appariés — comme le web l'est aujourd'hui.
--
--   ÉTAPE 3  RPC `insert_match_event` : lui faire écrire l'apparié elle-même.
--            À ne passer QU'UNE FOIS l'étape 2 déployée sur les appareils,
--            sinon les anciens clients écriront deux tirs cadrés par but.
--            Deux bénéfices : l'appariement devient un invariant de la base que
--            ni le web ni le mobile ne peuvent contourner, et l'insertion
--            devient ATOMIQUE — ce qui règle aussi les 2 pertes réseau
--            constatées (les deux `await createMatchEvent()` du client ne sont
--            pas dans une transaction, un échec du second n'affiche qu'une
--            alerte et le but reste seul).
--
--   ENTRE 2 ET 3, ou après : rejouer CE fichier rattrape les buts de la
--   fenêtre. Il est idempotent, c'est fait pour.
--
-- ROLLBACK de l'étape 1 :
--   DELETE FROM match_events WHERE backfill_reason = 'goal_paired_shot_2026_08';
-- =============================================================================
