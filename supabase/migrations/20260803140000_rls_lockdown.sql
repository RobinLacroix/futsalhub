-- ─────────────────────────────────────────────────────────────────────────────
-- RLS lockdown — rétablissement de l'isolation multi-clubs
--
-- CONSTAT (vérifié sur la base de prod le 2026-08-03, rôle claude_audit) :
-- l'isolation multi-clubs n'était PAS appliquée en production. Preuve obtenue
-- avec la seule clé anon publique du bundle front, sans aucun compte :
--     players 85 lignes, trainings 145, match_events 2598, schematics 14,
--     users 7  -> lisibles par n'importe qui sur Internet.
--
-- CAUSE : les policies générées par les templates de l'interface Supabase pendant
-- la phase prototype ("Enable read access for all users", "Les utilisateurs
-- authentifiés peuvent voir tous les joueurs", ...) n'ont jamais été supprimées.
-- En PostgreSQL les policies PERMISSIVES se combinent en OU : une seule policy
-- `USING (true)` annule TOUTES les autres policies de la table. Les bonnes
-- policies écrites en juillet (20260726120000) et le 30/07 (20260730100000)
-- étaient donc correctes et totalement inopérantes.
-- 33 policies ouvertes recensées, et 3 tables avec RLS purement désactivée.
--
-- Aucune de ces policies n'est dans les 88 migrations : créées à la main dans
-- l'interface, invisibles au repo. Même mécanisme que get_team_stats (§16 de
-- 20260803100000), à une autre échelle. Découvertes en interrogeant pg_policies,
-- pas en relisant du code.
--
-- /!\ RISQUE INVERSÉ par rapport à 20260803100000. Cette migration RESTREINT des
--     tables activement utilisées (matches 16 accès directs, players 9,
--     trainings 8). Certains écrans fonctionnent aujourd'hui PARCE QUE
--     l'isolation est cassée. À tester écran par écran après application.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- §1 — Helper anti-récursion pour les policies sur `users`
--
-- La policy de lecture de `users` doit interroger `club_members`, qui porte
-- elle-même de la RLS -> risque de récursion infinie (déjà rencontré, cf.
-- migration `fix_club_members_rls_recursion`). Un helper SECURITY DEFINER
-- contourne la RLS et casse le cycle. Pattern Supabase standard.
--
-- /!\ DEUX contraintes de nommage et de droits, non négociables :
--   1. `authenticated` DOIT avoir EXECUTE. Les expressions de policy RLS sont
--      évaluées sous l'identité de l'APPELANT, pas du propriétaire de la table :
--      sans ce GRANT, la lecture de `users` échoue pour tout le monde.
--   2. Pas de préfixe `_`. Le §1 de 20260803100000 ferme tous les helpers
--      préfixés `_` à `authenticated` — nommer cette fonction `_shares_club_with`
--      la ferait casser au premier rejeu de cette migration. Elle suit donc la
--      convention des autres primitives de policy (has_club_access, ...).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION shares_club_with(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM club_members me
    JOIN club_members other ON other.club_id = me.club_id
    WHERE me.user_id = auth.uid()
      AND other.user_id = p_user_id
  );
$$;

REVOKE ALL   ON FUNCTION shares_club_with(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION shares_club_with(UUID) TO authenticated, service_role;


-- ═════════════════════════════════════════════════════════════════════════════
-- §2 — Suppression des policies ouvertes héritées du prototype
--
-- Cible : toute policy PERMISSIVE dont le prédicat est `true` ou le simple test
-- `auth.role() = 'authenticated'` — c'est-à-dire qui n'exprime aucune
-- appartenance à un club ou à une équipe.
--
-- Balayage dynamique plutôt que liste figée : il attrape aussi les policies
-- créées à la main que je n'ai pas vues. Chaque suppression est tracée.
--
-- EXCLUSION : `training_procedures` (bibliothèque d'exercices partagée). Sa
-- lecture ouverte est délibérée. Sa policy d'ÉCRITURE ouverte est un problème
-- réel — tout compte authentifié peut modifier ou supprimer n'importe quel
-- exercice de la bibliothèque — mais la table n'a AUCUNE colonne de propriété
-- (ni club_id ni created_by) : la corriger demande une évolution de schéma, pas
-- un lockdown. Traitée à part, volontairement laissée fonctionnelle ici.
-- ═════════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND permissive = 'PERMISSIVE'
      AND tablename <> 'training_procedures'
      AND (
           coalesce(qual, '')       IN ('true', '(auth.role() = ''authenticated''::text)')
        OR coalesce(with_check, '') IN ('true', '(auth.role() = ''authenticated''::text)')
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'policy ouverte supprimee: %.%', r.tablename, r.policyname;
    n := n + 1;
  END LOOP;
  RAISE NOTICE '--> % policies ouvertes supprimees', n;
END
$mig$;


-- ═════════════════════════════════════════════════════════════════════════════
-- §3 — CRITIQUE : `trainings` — RLS était purement DÉSACTIVÉE
--
-- `relrowsecurity = false` : aucune policy n'était évaluée, et `anon` disposant
-- du GRANT SELECT, les 145 séances étaient lisibles sans compte. `anon` avait
-- aussi le GRANT INSERT, donc l'écriture était ouverte.
-- Les bonnes policies existent déjà sur la table (lecture club + joueur convoqué,
-- écriture team-scopée) : il suffit d'activer la RLS pour qu'elles s'appliquent
-- enfin.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;


-- ═════════════════════════════════════════════════════════════════════════════
-- §4 — CRITIQUE : `users` — RLS désactivée sur des données personnelles
--
-- Table de profil : prénom, nom, email, téléphone, pays. RLS désactivée, GRANT
-- SELECT à anon : 7 profils complets lisibles sans authentification. C'est le
-- point le plus sensible du lot au regard du RGPD.
--
-- Usages réels du code, tous préservés :
--   - app/signup/page.tsx:67        -> INSERT de son propre profil
--   - mobile/lib/services/clubs.ts  -> lecture des profils des membres du club
--   - lib/services/clubsService.ts  -> listUserEmails(), qui lit tous les users
--     pour n'en mapper que les membres du club affiché : la restriction aux
--     co-membres ne change donc rien au résultat affiché.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_self_or_clubmate ON public.users;
CREATE POLICY users_select_self_or_clubmate ON public.users
  FOR SELECT USING (
    id = auth.uid() OR shares_club_with(id)
  );

DROP POLICY IF EXISTS users_insert_self ON public.users;
CREATE POLICY users_insert_self ON public.users
  FOR INSERT WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Pas de policy DELETE : la suppression de compte passe par auth, pas par l'app.


-- ═════════════════════════════════════════════════════════════════════════════
-- §5 — `schematics` — les 4 policies étaient `USING (true)`, y compris pour anon
--
-- La table porte un team_id : scoping direct. Lecture club-wide (has_team_access,
-- viewer inclus), écriture team-scopée (has_team_write_access), conformément à
-- la règle posée le 30/07.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.schematics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schematics_select ON public.schematics;
CREATE POLICY schematics_select ON public.schematics
  FOR SELECT USING (team_id IS NOT NULL AND has_team_access(team_id));

DROP POLICY IF EXISTS schematics_insert ON public.schematics;
CREATE POLICY schematics_insert ON public.schematics
  FOR INSERT WITH CHECK (team_id IS NOT NULL AND has_team_write_access(team_id));

DROP POLICY IF EXISTS schematics_update ON public.schematics;
CREATE POLICY schematics_update ON public.schematics
  FOR UPDATE USING (team_id IS NOT NULL AND has_team_write_access(team_id))
           WITH CHECK (team_id IS NOT NULL AND has_team_write_access(team_id));

DROP POLICY IF EXISTS schematics_delete ON public.schematics;
CREATE POLICY schematics_delete ON public.schematics
  FOR DELETE USING (team_id IS NOT NULL AND has_team_write_access(team_id));


-- ═════════════════════════════════════════════════════════════════════════════
-- §6 — `player_stats` — n'avait que des policies ouvertes
--
-- Rattachement par player_id : on réutilise has_player_access, corrigée le
-- 2026-08-03 (§7 de 20260803100000) pour couvrir players.team_id ET player_teams.
-- Utilisée par app/webapp/manager/calendar/page.tsx (5 accès directs).
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS player_stats_select ON public.player_stats;
CREATE POLICY player_stats_select ON public.player_stats
  FOR SELECT USING (has_player_access(player_id));

DROP POLICY IF EXISTS player_stats_write ON public.player_stats;
CREATE POLICY player_stats_write ON public.player_stats
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM players p WHERE p.id = player_stats.player_id
              AND p.team_id IS NOT NULL AND has_team_write_access(p.team_id))
    OR EXISTS (SELECT 1 FROM player_teams pt WHERE pt.player_id = player_stats.player_id
                 AND has_team_write_access(pt.team_id))
  );

DROP POLICY IF EXISTS player_stats_update ON public.player_stats;
CREATE POLICY player_stats_update ON public.player_stats
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM players p WHERE p.id = player_stats.player_id
              AND p.team_id IS NOT NULL AND has_team_write_access(p.team_id))
    OR EXISTS (SELECT 1 FROM player_teams pt WHERE pt.player_id = player_stats.player_id
                 AND has_team_write_access(pt.team_id))
  );

DROP POLICY IF EXISTS player_stats_delete ON public.player_stats;
CREATE POLICY player_stats_delete ON public.player_stats
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM players p WHERE p.id = player_stats.player_id
              AND p.team_id IS NOT NULL AND has_team_write_access(p.team_id))
    OR EXISTS (SELECT 1 FROM player_teams pt WHERE pt.player_id = player_stats.player_id
                 AND has_team_write_access(pt.team_id))
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- §7 — Tables mortes : fermeture complète
--
-- Vérifié par grep sur l'intégralité du code TS/TSX (hors node_modules) :
--   - `events`                     : 0 référence. Table du prototype, sans
--                                    team_id ni club_id, non rattachable.
--   - `training_attendance`        : 0 accès `.from()`. L'assiduité réelle vit
--                                    dans `trainings.attendance` (jsonb).
--   - `player_link_code_attempts`  : 0 référence. Journal de rate-limit, lu et
--                                    écrit uniquement par des fonctions
--                                    SECURITY DEFINER, qui contournent la RLS.
--
-- RLS activée sans aucune policy = refus par défaut pour tout le monde, et les
-- GRANT sont retirés en plus (ceinture et bretelles). Les tables et leurs données
-- sont CONSERVÉES : supprimer une table est une décision produit, pas un
-- correctif de sécurité.
-- ═════════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['events', 'training_attendance', 'player_link_code_attempts']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
      RAISE NOTICE 'table morte verrouillee: %', t;
    END IF;
  END LOOP;
END
$mig$;


-- ═════════════════════════════════════════════════════════════════════════════
-- §8 — Filet : aucune table exposée à anon ne doit tourner sans RLS
--
-- Active la RLS sur toute table du schéma `public` qui n'en a pas alors que anon
-- ou authenticated dispose d'un GRANT. Les tables ayant déjà de bonnes policies
-- ne sont pas affectées ; celles sans policy basculent en refus par défaut, ce
-- qui est le comportement voulu avant un beta multi-clubs (mieux vaut un écran
-- vide qu'une fuite).
-- ═════════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
      AND (has_table_privilege('anon', c.oid, 'SELECT')
        OR has_table_privilege('authenticated', c.oid, 'SELECT'))
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    RAISE NOTICE 'RLS activee: %', r.relname;
  END LOOP;
END
$mig$;


-- ═════════════════════════════════════════════════════════════════════════════
-- §9 — Garde-fou permanent
--
-- Fait ÉCHOUER la migration — et toute migration future — si :
--   (a) une table exposée à anon/authenticated tourne sans RLS ;
--   (b) une policy PERMISSIVE sans condition d'appartenance réapparaît.
--
-- C'est le seul contrôle qui aurait détecté cette faille : elle était invisible
-- au repo et invisible à la relecture des migrations. Ne jamais le neutraliser —
-- lire la liste qu'il affiche et arbitrer table par table.
--
-- Doit rester la DERNIÈRE section du fichier.
-- ═════════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  v_no_rls  TEXT;
  v_open    TEXT;
BEGIN
  SELECT string_agg(relname, ', ' ORDER BY relname) INTO v_no_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity
    AND (has_table_privilege('anon', c.oid, 'SELECT')
      OR has_table_privilege('authenticated', c.oid, 'SELECT'));

  IF v_no_rls IS NOT NULL THEN
    RAISE EXCEPTION E'Tables exposees SANS RLS :\n  %', v_no_rls;
  END IF;

  SELECT string_agg(tablename || '.' || policyname, E'\n  ' ORDER BY tablename, policyname) INTO v_open
  FROM pg_policies
  WHERE schemaname = 'public'
    AND permissive = 'PERMISSIVE'
    AND tablename <> 'training_procedures'   -- bibliothèque partagée, cf. §2
    AND (
         coalesce(qual, '')       IN ('true', '(auth.role() = ''authenticated''::text)')
      OR coalesce(with_check, '') IN ('true', '(auth.role() = ''authenticated''::text)')
    );

  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION E'Policies permissives sans condition d''appartenance :\n  %', v_open;
  END IF;

  RAISE NOTICE 'OK : aucune table exposee sans RLS, aucune policy ouverte.';
END
$mig$;
