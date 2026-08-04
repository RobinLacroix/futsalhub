-- ─────────────────────────────────────────────────────────────────────────────
-- teams : la lecture passe de « ses équipes » à « son club »
--
-- SYMPTÔME (signalé par Robin le 2026-08-04, mobile ET web)
--   1. Impossible de convoquer un joueur d'une autre équipe du club.
--   2. Un coach non-admin ne voit pas les autres équipes de son club.
--
-- CAUSE — une seule, pour les deux.
--
-- La policy SELECT de `teams` s'appelle « Users can view their club teams »
-- mais elle est gardée par `has_team_access(id)`, qui est TEAM-scopée :
--
--     cm.role = 'admin'                              -> toutes les équipes
--     cm.role = 'coach' AND cm.team_id = p_team_id   -> UNIQUEMENT ses équipes
--
-- Ses deux tables sœurs sont pourtant déjà club-scopées :
--     players       SELECT -> has_club_access(t.club_id)
--     player_teams  SELECT -> has_club_access(club_id)
--
-- C'est `teams` qui est l'exception, et elle contredit son propre nom.
--
-- Pourquoi ça casse la convocation cross-équipe : `getPlayersByClubWithTeams`
-- (identique en `mobile/lib/services/players.ts` et `lib/services/playersService.ts`)
-- commence par `SELECT id, name FROM teams WHERE club_id = ...` puis filtre
-- `player_teams` sur les ids obtenus. Un coach ne récupérant que ses propres
-- équipes, la liste des candidats se réduit à ses propres joueurs — alors que
-- les policies de `players` et `player_teams`, elles, auraient laissé passer
-- tout le club.
--
-- CE QUE ÇA OUVRE, ET CE QUE ÇA N'OUVRE PAS
--
-- Ouvert : la LECTURE des équipes du club (id, nom, catégorie, niveau,
-- couleur) à tout membre du club — admin, coach, viewer. Strictement aligné
-- sur ce que `players` et `player_teams` autorisent déjà, donc aucune donnée
-- nouvelle n'est atteignable : on pouvait déjà lire les joueurs de tout le
-- club, mais pas le nom de leur équipe.
--
-- NON ouvert : l'écriture. UPDATE et DELETE restent sur
-- `has_team_write_access(id)`, INSERT reste inchangé. Un coach voit les autres
-- équipes, il ne peut pas les modifier. C'est exactement la demande.
--
-- L'isolation inter-clubs n'est pas affectée : `has_club_access` scope sur
-- `auth.uid()` via `club_members`.
--
-- Le garde `club_id IS NOT NULL` reprend la forme de la policy de
-- `player_teams`. Sans lui, une équipe orpheline serait évaluée par
-- `has_club_access(NULL)` : le comportement resterait FALSE, mais l'intention
-- doit être lisible dans la policy et non déduite.
--
-- IDEMPOTENTE. Le §2 échoue si l'invariant n'est pas tenu après application.
--
-- À EXÉCUTER dans le SQL Editor, encadré par BEGIN; / COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────


-- ── §1 — Remplacement de la policy de lecture ────────────────────────────────

DROP POLICY IF EXISTS "Users can view their club teams" ON teams;

CREATE POLICY "Users can view their club teams"
  ON teams
  FOR SELECT
  USING (club_id IS NOT NULL AND has_club_access(club_id));


-- ── §2 — Garde-fou ───────────────────────────────────────────────────────────
-- Vérifie que la lecture est bien club-scopée et que l'écriture ne l'est PAS.
-- Une migration future qui reviendrait sur l'un ou l'autre échouera ici.

DO $$
DECLARE
  v_select_qual TEXT;
  v_bad_write   INT;
BEGIN
  SELECT qual INTO v_select_qual
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'teams' AND cmd = 'SELECT'
  LIMIT 1;

  IF v_select_qual IS NULL THEN
    RAISE EXCEPTION 'teams : aucune policy SELECT trouvée après migration.';
  END IF;

  IF v_select_qual NOT LIKE '%has_club_access%' THEN
    RAISE EXCEPTION
      'teams : la policy SELECT n''est pas club-scopée (qual = %). La convocation cross-équipe restera cassée.',
      v_select_qual;
  END IF;

  -- L'écriture doit rester team-scopée. Si une policy d'écriture passait sur
  -- has_club_access, n'importe quel viewer pourrait modifier les équipes.
  SELECT COUNT(*) INTO v_bad_write
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'teams'
    AND cmd IN ('UPDATE', 'DELETE')
    AND coalesce(qual, '') NOT LIKE '%has_team_write_access%';

  IF v_bad_write > 0 THEN
    RAISE EXCEPTION
      'teams : % policy(ies) d''écriture ne passent pas par has_team_write_access. L''écriture ne doit jamais être club-scopée.',
      v_bad_write;
  END IF;

  RAISE NOTICE 'teams : lecture club-scopée, écriture team-scopée. Invariant tenu.';
END;
$$;


-- ── §3 — Photo des policies, pour vérification à l'œil ───────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE 'Policies sur teams :';
  FOR r IN
    SELECT cmd, policyname, coalesce(qual, '(aucune)') AS q
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'teams'
    ORDER BY cmd, policyname
  LOOP
    RAISE NOTICE '  [%] % -> %', r.cmd, r.policyname, r.q;
  END LOOP;
END;
$$;
