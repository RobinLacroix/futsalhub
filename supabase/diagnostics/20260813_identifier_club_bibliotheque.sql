-- ═════════════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC — LECTURE SEULE. Ce fichier n'est PAS une migration, il ne modifie
-- rien. Il répond à une seule question :
--
--   « Lequel des 2 clubs est le propriétaire des 14 procédés de la bibliothèque ? »
--
-- La migration 20260813100000 s'est arrêtée volontairement plutôt que de deviner.
-- Rien n'a été appliqué : elle est encadrée par BEGIN/COMMIT, donc l'échec du §2
-- a tout annulé, colonnes comprises.
--
-- MARCHE À SUIVRE
--   1. Jouer ce fichier dans le SQL Editor.
--   2. Repérer la ligne du vrai club (celui qui porte les équipes, les joueurs
--      et les séances). L'autre est très probablement un club de test.
--   3. Copier son `id`, le coller dans la constante v_target_club_id en tête de
--      supabase/migrations/20260813100000_training_procedures_ownership.sql
--   4. Rejouer la migration entière.
--
-- Ne pas jouer d'UPDATE à la main : la migration s'en charge une fois la
-- constante remplie, et c'est le fichier de migration qui doit garder la trace
-- de ce qui a été décidé.
-- ═════════════════════════════════════════════════════════════════════════════

SELECT
  c.id,
  c.name,
  c.created_at::date                                              AS cree_le,
  (SELECT count(*) FROM public.teams        t WHERE t.club_id = c.id) AS equipes,
  (SELECT count(*) FROM public.players      p WHERE p.club_id = c.id) AS joueurs,
  (SELECT count(*) FROM public.trainings    tr WHERE tr.club_id = c.id) AS seances,
  (SELECT count(*) FROM public.matches      m WHERE m.club_id = c.id) AS matchs,
  (SELECT count(*) FROM public.club_members cm WHERE cm.club_id = c.id) AS membres
FROM public.clubs c
ORDER BY equipes DESC, joueurs DESC, c.created_at;

-- Contrôle complémentaire : combien de procédés attendent un propriétaire.
-- (14 attendus d'après le message d'erreur de la migration.)
SELECT
  count(*)                                    AS procedes_total,
  count(*) FILTER (WHERE archived_at IS NULL) AS procedes_actifs,
  count(*) FILTER (WHERE share_code IS NOT NULL) AS avec_lien_de_partage,
  min(created_at)::date                       AS premier,
  max(created_at)::date                       AS dernier
FROM public.training_procedures;
