-- Diagnostic LECTURE SEULE — vocabulaire réel de `players.status`
--
-- À jouer AVANT d'écrire la migration de normalisation. Aucun écrit, aucune
-- transaction nécessaire.
--
-- Ce qu'on cherche à savoir, et pourquoi :
--
-- 1. Web et mobile n'écrivent PAS le même vocabulaire dans cette colonne.
--    Le formulaire web propose 'Non-muté' / 'Muté' / 'Muté HP' / 'Blessé' /
--    'Suspendu' / 'left' (statut de mutation FFF, administratif).
--    Le formulaire mobile propose 'Actif' / 'Blessé' / 'Suspendu' / 'left'.
--    'Actif' n'existe pas dans la table de correspondance du web : un joueur
--    créé sur mobile s'affiche avec un badge gris sans libellé connu.
--    La colonne n'a AUCUNE contrainte CHECK, donc rien n'a jamais bloqué.
--
-- 2. Combien de joueurs portent 'Blessé' ou 'Suspendu'. Ce sont eux qui
--    deviendront des lignes `player_availability`, et surtout : leur statut de
--    mutation a été ÉCRASÉ le jour où on les a marqués blessés. Il est perdu.
--    La migration de normalisation devra donc choisir une valeur de repli, et
--    ce choix doit être fait en connaissant le nombre de joueurs concernés.

-- ── 1. Inventaire des valeurs présentes ─────────────────────────────────────
SELECT
  p.status,
  COUNT(*) AS joueurs,
  COUNT(*) FILTER (WHERE p.user_id IS NOT NULL) AS avec_compte,
  MIN(p.created_at)::date AS plus_ancien,
  MAX(p.created_at)::date AS plus_recent
FROM public.players p
GROUP BY p.status
ORDER BY joueurs DESC;

-- ── 2. Les joueurs à convertir, nommément ───────────────────────────────────
SELECT
  p.id,
  p.first_name,
  p.last_name,
  p.status,
  t.name AS equipe,
  c.name AS club,
  -- Un événement de blessure ouvert donne une date de départ crédible pour la
  -- ligne d'indisponibilité, plutôt que « depuis aujourd'hui ».
  (SELECT MAX(e.event_date) FROM public.player_events e
    WHERE e.player_id = p.id AND e.event_type = 'injury') AS derniere_blessure,
  (SELECT e.unavailability_days FROM public.player_events e
    WHERE e.player_id = p.id AND e.event_type = 'injury'
    ORDER BY e.event_date DESC LIMIT 1) AS jours_indispo_declares
FROM public.players p
LEFT JOIN public.teams t ON t.id = p.team_id
LEFT JOIN public.clubs c ON c.id = COALESCE(p.club_id, t.club_id)
WHERE p.status IN ('Blessé', 'Suspendu')
ORDER BY c.name, t.name, p.last_name;

-- ── 3. Joueurs sans club résolvable ─────────────────────────────────────────
-- Le trigger `player_availability_fill_club` lève une exception pour eux : ni
-- `players.club_id` ni l'équipe ne les rattachent. S'il y en a, ils bloqueront
-- la saisie de disponibilité et doivent être réparés d'abord.
SELECT p.id, p.first_name, p.last_name, p.status, p.team_id
FROM public.players p
LEFT JOIN public.teams t ON t.id = p.team_id
WHERE COALESCE(p.club_id, t.club_id) IS NULL;

-- ── 4. Volume de douleurs déclarées, pour calibrer les signaux précoces ─────
-- Le seuil par défaut est 3 signalements sur 21 jours. Si personne ne l'atteint
-- jamais, le panneau restera vide et la feature n'aura pas d'utilisateur.
SELECT
  COUNT(*) AS signalements_total,
  COUNT(DISTINCT r.player_id) AS joueurs_ayant_declare,
  MIN(r.reported_at)::date AS premier,
  MAX(r.reported_at)::date AS dernier,
  COUNT(*) FILTER (WHERE r.reported_at >= now() - interval '21 days') AS sur_21_jours
FROM public.pain_reports r;

-- Combien de couples (joueur, zone, côté) atteindraient le seuil aujourd'hui.
SELECT COUNT(*) AS signaux_au_seuil_3_sur_21j
FROM (
  SELECT r.player_id, r.zone, r.side
  FROM public.pain_reports r
  WHERE r.reported_at >= now() - interval '21 days'
  GROUP BY r.player_id, r.zone, r.side
  HAVING COUNT(*) >= 3
) s;
