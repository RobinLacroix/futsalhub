-- ─────────────────────────────────────────────────────────────────────────────
-- Normalisation de players.strong_foot
--
-- CONTEXTE
--
-- `strong_foot` est une colonne texte libre, écrite depuis quatre endroits qui
-- ne se sont jamais accordés sur le vocabulaire :
--
--   mobile new-player          -> 'Droit et gauche'
--   mobile modale d'édition    -> 'Les deux'        (corrigé 2026-08-03)
--   web création / édition     -> 'Ambidextre'      (corrigé 2026-08-04)
--   les deux imports CSV       -> 'Ambidextre'      (corrigé 2026-08-04)
--
-- Conséquences observées avant correction du code :
--   - les filtres « pied fort » du web n'affichaient qu'une partie des joueurs,
--     ceux créés depuis l'autre plateforme étant absents de tous les choix ;
--   - `footDistribution` du tableau de bord comptait la même réalité dans
--     plusieurs parts ;
--   - l'import CSV rejetait « Droit et gauche », valeur pourtant produite par
--     l'application elle-même.
--
-- Le code est corrigé et normalise désormais à l'écriture. Cette migration
-- rattrape les lignes déjà en base.
--
-- VALEUR CANONIQUE : 'Droit', 'Gauche', 'Droit et gauche'.
-- (« Droit et gauche » est la plus ancienne, donc la plus représentée ; le
-- libellé affiché reste « Les deux », valeur stockée et libellé sont deux
-- choses distinctes.)
--
-- IDEMPOTENTE : rejouable sans effet de bord. Le §3 échoue si une valeur non
-- canonique subsiste, afin qu'une orthographe inconnue soit vue et non
-- silencieusement ignorée.
--
-- À EXÉCUTER dans le SQL Editor, encadré par BEGIN; / COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────


-- ── §1 — Photo avant/après, affichée dans la sortie ──────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE 'strong_foot AVANT normalisation :';
  FOR r IN
    SELECT COALESCE(strong_foot, '(null)') AS valeur, COUNT(*) AS n
    FROM players
    GROUP BY 1
    ORDER BY 2 DESC
  LOOP
    RAISE NOTICE '  % -> % joueur(s)', r.valeur, r.n;
  END LOOP;
END;
$$;


-- ── §2 — Normalisation ───────────────────────────────────────────────────────
-- Insensible à la casse et aux espaces de bord. Les valeurs déjà canoniques ne
-- sont pas réécrites (la clause WHERE les exclut), donc `updated_at` des
-- lignes saines n'est pas touché s'il venait à exister.

UPDATE players
SET strong_foot = 'Droit'
WHERE strong_foot IS NOT NULL
  AND lower(btrim(strong_foot)) IN ('droit', 'pied droit', 'd')
  AND strong_foot <> 'Droit';

UPDATE players
SET strong_foot = 'Gauche'
WHERE strong_foot IS NOT NULL
  AND lower(btrim(strong_foot)) IN ('gauche', 'pied gauche', 'g')
  AND strong_foot <> 'Gauche';

UPDATE players
SET strong_foot = 'Droit et gauche'
WHERE strong_foot IS NOT NULL
  AND lower(btrim(strong_foot)) IN ('ambidextre', 'les deux', 'droit et gauche', 'deux pieds')
  AND strong_foot <> 'Droit et gauche';

-- Une chaîne vide n'est pas une information : elle devient NULL, ce que les
-- écrans savent déjà afficher (« Pied non renseigné »).
UPDATE players
SET strong_foot = NULL
WHERE strong_foot IS NOT NULL AND btrim(strong_foot) = '';


-- ── §3 — Garde-fou ───────────────────────────────────────────────────────────
-- Fait échouer la migration si une valeur non prévue subsiste. Mieux vaut
-- refuser de terminer que laisser croire que la colonne est propre.
DO $$
DECLARE
  v_restant INT;
  r RECORD;
BEGIN
  SELECT COUNT(*) INTO v_restant
  FROM players
  WHERE strong_foot IS NOT NULL
    AND strong_foot NOT IN ('Droit', 'Gauche', 'Droit et gauche');

  IF v_restant > 0 THEN
    FOR r IN
      SELECT DISTINCT strong_foot AS valeur
      FROM players
      WHERE strong_foot IS NOT NULL
        AND strong_foot NOT IN ('Droit', 'Gauche', 'Droit et gauche')
    LOOP
      RAISE WARNING 'Valeur non reconnue : %', r.valeur;
    END LOOP;
    RAISE EXCEPTION
      '% joueur(s) conservent une valeur strong_foot hors vocabulaire. Ajouter l''orthographe aux alias (lib/playerVocabulary.ts, mobile/components/players/positions.ts et §2 ci-dessus) avant de rejouer.',
      v_restant;
  END IF;

  RAISE NOTICE 'strong_foot : vocabulaire unique confirmé.';
END;
$$;


-- ── §4 — Photo après ─────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE 'strong_foot APRÈS normalisation :';
  FOR r IN
    SELECT COALESCE(strong_foot, '(null)') AS valeur, COUNT(*) AS n
    FROM players
    GROUP BY 1
    ORDER BY 2 DESC
  LOOP
    RAISE NOTICE '  % -> % joueur(s)', r.valeur, r.n;
  END LOOP;
END;
$$;
