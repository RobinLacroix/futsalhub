-- ─────────────────────────────────────────────────────────────────────────────
-- DIAGNOSTIC — lecture seule, aucun UPDATE, aucun DELETE
--
-- Ce fichier n'est PAS une migration : il ne vit pas dans supabase/migrations/
-- et ne doit pas y être déplacé. Il se lance dans le SQL Editor, il répond à
-- deux questions que le code seul ne permet pas de trancher.
--
-- Sans BEGIN/COMMIT : il n'écrit rien.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- §1 — Événements « tir cadré » orphelins laissés par une annulation de but
--
-- CE QUE JE PEUX ET NE PEUX PAS DIRE
--
-- Le recorder insérait un `goal` ET un `shot_on_target` appairé. L'annulation
-- supprimait le but, pas le tir. Le tir restait donc en base pour toujours,
-- gonflant les rapports de match et les analytics.
--
-- Le code est corrigé. Mais les lignes déjà écrites ne sont PAS identifiables
-- avec certitude : un `shot_on_target` sans `goal` au même instant est aussi
-- exactement la signature d'un tir cadré normal, qui est le cas majoritaire.
-- Il n'existe aucune colonne de corrélation entre les deux lignes.
--
-- Conclusion honnête : ces événements ne sont pas réparables rétroactivement.
-- Ce qui suit mesure ce qui EST identifiable, et sert à décider s'il y a lieu
-- de s'en préoccuper.
-- ═════════════════════════════════════════════════════════════════════════════

-- §1.a — Doublons exacts : même match, même joueur, même mi-temps, même seconde.
-- Ceux-là sont un artefact certain (but enregistré, annulé, ré-enregistré) et
-- peuvent être supprimés sans risque. S'il n'y en a aucun, le sujet est clos.
SELECT
  'doublons exacts' AS controle,
  match_id,
  player_id,
  half,
  match_time_seconds,
  event_type,
  COUNT(*) AS occurrences
FROM match_events
WHERE event_type IN ('shot_on_target', 'shot', 'goal', 'assist', 'recovery', 'ball_loss')
GROUP BY match_id, player_id, half, match_time_seconds, event_type
HAVING COUNT(*) > 1
ORDER BY occurrences DESC, match_id
LIMIT 100;

-- §1.b — Rapport tirs cadrés / buts par match. Un ratio anormalement haut sur
-- un match précis oriente vers une session d'enregistrement mouvementée.
-- Repère : au futsal, environ 2 à 5 tirs cadrés par but est ordinaire.
SELECT
  'ratio tirs cadres / buts' AS controle,
  match_id,
  COUNT(*) FILTER (WHERE event_type = 'shot_on_target') AS tirs_cadres,
  COUNT(*) FILTER (WHERE event_type = 'goal')           AS buts,
  ROUND(
    COUNT(*) FILTER (WHERE event_type = 'shot_on_target')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE event_type = 'goal'), 0),
    1
  ) AS ratio
FROM match_events
GROUP BY match_id
HAVING COUNT(*) FILTER (WHERE event_type = 'goal') > 0
ORDER BY ratio DESC NULLS LAST
LIMIT 30;

-- §1.c — Volume total, pour situer l'enjeu.
SELECT
  'volume' AS controle,
  event_type,
  COUNT(*) AS n
FROM match_events
GROUP BY event_type
ORDER BY n DESC;


-- ═════════════════════════════════════════════════════════════════════════════
-- §2 — Poids de notation mis à zéro par le bug de la virgule
--
-- `parseFloat("0,5")` vaut 0. Les deux éditeurs repliaient silencieusement
-- toute saisie illisible sur 0 : le coach croyait pondérer un événement, la
-- note ne bougeait pas. Corrigé sur mobile le 2026-08-03, sur le web le
-- 2026-08-04.
--
-- Un 0 délibéré et un 0 accidentel sont indiscernables en base. C'est donc une
-- LECTURE, pas une réparation : regarde les valeurs et dis si elles sont bien
-- celles que tu as voulues. `w_goal = 0` en particulier n'a aucun sens
-- volontaire — un but qui ne pèse rien.
--
-- La correction se fait dans l'écran Paramètres > Échelle de notation, qui
-- accepte maintenant la virgule et refuse d'enregistrer une valeur illisible.
-- Aucune migration : c'est un réglage, pas une donnée à réparer.
-- ═════════════════════════════════════════════════════════════════════════════

SELECT
  'poids de notation' AS controle,
  club_id,
  w_goal, w_assist, w_recovery, w_shot_on_target, w_shot, w_ball_loss,
  w_yellow_card, w_red_card,
  cw_goal, cw_shot, cw_opponent_shot, cw_opponent_goal,
  updated_at
FROM match_rating_weights
ORDER BY updated_at DESC;

-- Compte des poids à zéro par club, pour repérer d'un coup d'œil.
SELECT
  'poids a zero' AS controle,
  club_id,
  (w_goal = 0)::int + (w_assist = 0)::int + (w_recovery = 0)::int
  + (w_shot_on_target = 0)::int + (w_shot = 0)::int + (w_ball_loss = 0)::int
  + (w_yellow_card = 0)::int + (w_red_card = 0)::int
  + (cw_goal = 0)::int + (cw_shot = 0)::int
  + (cw_opponent_shot = 0)::int + (cw_opponent_goal = 0)::int AS nb_poids_nuls,
  (w_goal = 0) AS but_a_zero
FROM match_rating_weights;


-- ═════════════════════════════════════════════════════════════════════════════
-- §3 — Contrôle de la normalisation strong_foot
--
-- À lancer AVANT `20260804100000_normalize_strong_foot.sql` pour voir l'ampleur,
-- et APRÈS pour vérifier qu'il ne reste qu'une valeur par réalité.
-- ═════════════════════════════════════════════════════════════════════════════

SELECT
  'strong_foot' AS controle,
  COALESCE(strong_foot, '(null)') AS valeur,
  COUNT(*) AS joueurs
FROM players
GROUP BY 1, 2
ORDER BY joueurs DESC;
