-- =============================================================================
-- DIAGNOSTIC — appariement but / tir cadré
--
-- ⚠️ PAS UNE MIGRATION. Lecture seule, aucun BEGIN/COMMIT nécessaire, rejouable.
--
-- UNE SEULE REQUÊTE, UN SEUL TABLEAU. Le SQL Editor de Supabase n'affiche que
-- le résultat de la dernière instruction : ce fichier n'en contient donc qu'une.
--
-- POURQUOI
--   Les deux match recorders n'écrivent pas la même chose pour un but :
--     • mobile — `PAIRED_EVENT` écrit DEUX lignes, `goal` ET `shot_on_target`,
--       à la même seconde, la même mi-temps et pour le même joueur
--       (`mobile/components/recorder/useMatchRecorder.ts`, objet `base` partagé) ;
--     • web — n'écrit QUE la ligne `goal` ; le compteur de tirs cadrés reste
--       dans l'état local de l'écran, jamais persisté.
--   Donc « tirs totaux » = `shot + shot_on_target` est juste sur mobile et faux
--   sur web, et aucune formule ne peut être correcte pour les deux.
--
-- COMMENT LIRE LE RÉSULTAT
--   • La ligne « TOTAL » en tête donne la décision : `pct_non_apparies`.
--       ≈ 0 %   → tout vient du mobile, rien à reprendre.
--       ≈ 100 % → tout vient du web, ne pas réécrire l'historique.
--       entre   → migration de rattrapage justifiée.
--   • Les lignes suivantes ventilent par saison et par origine.
--
-- SCHÉMA — vérifié sur `pg_attribute`, pas supposé.
--   La colonne de date de `matches` s'appelle `date`, PAS `match_date`.
--
-- DÉJÀ RÉPONDU (exécution du 2026-08-12) : les matchs MIXTES.
--   Deux seulement, « R1 J17 - Champigny » (7 buts appariés sur 8) et « KB »
--   (2 sur 3). Un seul but manquant à chaque fois, dans un match par ailleurs
--   apparié : ce sont des insertions ratées, pas des changements d'outil — les
--   deux `await createMatchEvent()` du recorder ne sont pas transactionnels et
--   un échec du second n'affiche qu'une alerte. Aucun vrai match mixte, donc
--   aucun obstacle à une correction en masse. La requête de détail est
--   conservée en fin de fichier, en commentaire.
-- =============================================================================

WITH coord AS (
  SELECT
    match_id,
    COUNT(*) FILTER (WHERE event_type = 'goal')           AS nb_buts,
    COUNT(*) FILTER (WHERE event_type = 'shot_on_target') AS nb_cadres
  FROM match_events
  WHERE event_type IN ('goal', 'shot_on_target')
  GROUP BY match_id, half, match_time_seconds, player_id
),
par_match AS (
  SELECT
    match_id,
    SUM(nb_buts)                   AS buts,
    SUM(LEAST(nb_buts, nb_cadres)) AS apparies
  FROM coord
  GROUP BY match_id
),
classe AS (
  SELECT
    p.buts,
    p.apparies,
    COALESCE(m.season, '(sans saison)') AS saison,
    CASE
      WHEN p.buts = 0          THEN 'sans but (indeterminable)'
      WHEN p.apparies = p.buts THEN 'mobile - tous apparies'
      WHEN p.apparies = 0      THEN 'web - aucun apparie'
      ELSE                          'mixte'
    END AS origine
  FROM par_match p
  JOIN matches m ON m.id = p.match_id
)
SELECT
  1                                                  AS ordre,
  'TOTAL'                                            AS saison,
  'toutes origines'                                  AS origine,
  COUNT(*)                                           AS matchs,
  SUM(buts)                                          AS buts,
  SUM(apparies)                                      AS buts_apparies,
  SUM(buts - apparies)                               AS buts_non_apparies,
  ROUND(100.0 * SUM(buts - apparies) / NULLIF(SUM(buts), 0), 1) AS pct_non_apparies
FROM classe

UNION ALL

SELECT
  2,
  saison,
  origine,
  COUNT(*),
  SUM(buts),
  SUM(apparies),
  SUM(buts - apparies),
  ROUND(100.0 * SUM(buts - apparies) / NULLIF(SUM(buts), 0), 1)
FROM classe
GROUP BY saison, origine

ORDER BY ordre, saison DESC, matchs DESC;


-- =============================================================================
-- ARCHIVE — détail des matchs mixtes. Déjà exécutée le 2026-08-12, résultat en
-- tête de fichier. Décommenter seulement pour rejouer.
-- =============================================================================
-- WITH coord AS (
--   SELECT match_id,
--          COUNT(*) FILTER (WHERE event_type = 'goal')           AS nb_buts,
--          COUNT(*) FILTER (WHERE event_type = 'shot_on_target') AS nb_cadres
--   FROM match_events
--   WHERE event_type IN ('goal', 'shot_on_target')
--   GROUP BY match_id, half, match_time_seconds, player_id
-- ),
-- par_match AS (
--   SELECT match_id, SUM(nb_buts) AS buts, SUM(LEAST(nb_buts, nb_cadres)) AS apparies
--   FROM coord GROUP BY match_id
-- )
-- SELECT m.date::date AS date, COALESCE(m.season,'(sans saison)') AS saison,
--        m.title, m.competition, p.buts, p.apparies AS buts_apparies,
--        p.buts - p.apparies AS buts_non_apparies
-- FROM par_match p JOIN matches m ON m.id = p.match_id
-- WHERE p.buts > 0 AND p.apparies > 0 AND p.apparies < p.buts
-- ORDER BY m.date DESC;
