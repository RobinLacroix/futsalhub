-- Système d'évaluation de match — Volet A (évaluation coach qualitative, match-level).
-- Spec : livrables/futsalhub/SPEC_EVALUATION_MATCH_2026-07.md
--
-- Note qualitative du match par le coach, 5 niveaux. NULL = pas encore évalué.
-- L'affichage (flèche directionnelle + couleur) est porté par le frontend ; la base ne stocke que l'enum.
--   bad     → Mauvais    (flèche bas,           rouge)
--   poor    → Médiocre   (flèche bas-droite,    orange)
--   neutral → Équilibré  (flèche horizontale,   gris)
--   good    → Bon        (flèche haut-droite,   vert clair)
--   great   → Très bon   (flèche haut,          vert foncé)

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS coach_evaluation TEXT
  CHECK (coach_evaluation IS NULL OR coach_evaluation IN ('bad', 'poor', 'neutral', 'good', 'great'));

COMMENT ON COLUMN matches.coach_evaluation IS
  'Évaluation qualitative du match par le coach (bad|poor|neutral|good|great), NULL si non évalué. Voir SPEC_EVALUATION_MATCH_2026-07.md.';
