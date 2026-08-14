-- ═════════════════════════════════════════════════════════════════════════════
-- training_procedures : propriété, isolation en écriture, lien de partage
--
-- CONTEXTE. La migration 20260803140000 (lockdown RLS) a délibérément EXCLU
-- cette table de son balayage, en notant que sa policy d'écriture ouverte était
-- un vrai problème mais qu'il demandait une évolution de schéma, pas un
-- lockdown. C'est cette évolution.
--
-- ÉTAT AVANT (relevé sur la prod le 2026-08-13) :
--   training_procedures_read_policy   FOR SELECT  TO authenticated  USING (true)
--   training_procedures_write_policy  FOR ALL     TO authenticated  USING (true)
--                                                                 WITH CHECK (true)
--   Aucune colonne de propriété (ni club_id ni created_by).
--   GRANT : anon possède arwdDxt sur la table (défaut Supabase), aujourd'hui
--   neutralisé par l'absence de policy pour anon, mais c'est un filet unique.
--
-- CE QUE ÇA PERMET AUJOURD'HUI. Tout compte authentifié, de n'importe quel club,
-- peut MODIFIER et SUPPRIMER n'importe quel procédé de n'importe qui. `FOR ALL`
-- couvre DELETE. Tant qu'un seul club utilise la base, c'est théorique ; au
-- premier club externe, c'est une perte de données à un tap.
--
-- TROISIÈME DÉFAUT, TROUVÉ EN PASSANT. La page publique /p/[code] lit la table
-- avec la clé ANON. Aucune policy ne vise anon, donc la lecture renvoie zéro
-- ligne : le partage public d'un procédé ne fonctionne pas, et n'a probablement
-- jamais fonctionné. §5 le rétablit, restreint aux procédés explicitement
-- partagés et non archivés.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS. Elle ne rend rien public. `is_public`
-- vaut false partout après application : un club externe arrive donc sur une
-- bibliothèque VIDE. Ouvrir le catalogue de Robin aux autres clubs est une
-- décision commerciale, pas technique — la commande est donnée en §7, à jouer
-- à la main quand la décision est prise.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1. Colonnes de propriété
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.training_procedures
  ADD COLUMN IF NOT EXISTS club_id    uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_public  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.training_procedures.club_id IS
  'Club propriétaire. Porte l''isolation en écriture. Rempli par trigger si absent.';
COMMENT ON COLUMN public.training_procedures.is_public IS
  'true = visible en lecture par TOUS les clubs (catalogue partagé). Décision commerciale, false par défaut.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §2. Backfill du club propriétaire
--
-- ⚠️  CONSTANTE À REMPLIR — première tentative du 2026-08-13 arrêtée ici :
--     2 clubs en base, 14 procédés, propriétaire ambigu. La migration étant en
--     une seule transaction, rien n'a été appliqué.
--
--     Identifier le bon club avec :
--       supabase/diagnostics/20260813_identifier_club_bibliotheque.sql
--     puis coller son uuid ci-dessous, à la place de la chaîne vide.
--
--     Laissé vide ET un seul club en base => attribution automatique.
--     Laissé vide ET plusieurs clubs      => la migration s'arrête (à dessein).
--
--     La valeur reste écrite ici : c'est la trace de ce qui a été décidé.
-- ─────────────────────────────────────────────────────────────────────────────

DO $mig$
DECLARE
  -- ▼▼▼ COLLER L'UUID DU CLUB PROPRIÉTAIRE DE LA BIBLIOTHÈQUE ICI ▼▼▼
  v_target_club_id text := '';
  -- ▲▲▲                                                          ▲▲▲
  v_club_count int;
  v_club_id    uuid;
  v_orphans    int;
BEGIN
  SELECT count(*) INTO v_club_count FROM public.clubs;
  SELECT count(*) INTO v_orphans
    FROM public.training_procedures WHERE club_id IS NULL;

  IF v_orphans = 0 THEN
    RAISE NOTICE '§2 : aucun procede sans club, rien a faire.';
    RETURN;
  END IF;

  IF v_club_count = 0 THEN
    RAISE EXCEPTION 'Aucun club en base mais % procedes a rattacher. Migration interrompue.', v_orphans;
  END IF;

  -- Cas 1 : club désigné explicitement.
  IF v_target_club_id <> '' THEN
    v_club_id := v_target_club_id::uuid;

    IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = v_club_id) THEN
      RAISE EXCEPTION 'Le club % n''existe pas. Verifier l''uuid colle en tete du §2.', v_club_id;
    END IF;

  -- Cas 2 : un seul club, aucune ambiguïté possible.
  ELSIF v_club_count = 1 THEN
    SELECT id INTO v_club_id FROM public.clubs;

  -- Cas 3 : plusieurs clubs et rien de désigné. On s'arrête.
  ELSE
    RAISE EXCEPTION E'% clubs en base : le club proprietaire des % procedes existants est ambigu.\n'
      'Marche a suivre :\n'
      '  1. jouer supabase/diagnostics/20260813_identifier_club_bibliotheque.sql\n'
      '  2. coller l''uuid du bon club dans v_target_club_id, en tete du §2 de ce fichier\n'
      '  3. rejouer la migration entiere', v_club_count, v_orphans;
  END IF;

  UPDATE public.training_procedures SET club_id = v_club_id WHERE club_id IS NULL;
  RAISE NOTICE '§2 : % procedes rattaches au club %.', v_orphans, v_club_id;
END
$mig$;

ALTER TABLE public.training_procedures ALTER COLUMN club_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS training_procedures_club_id_idx
  ON public.training_procedures (club_id);

-- Sert la policy de partage public, qui filtre sur share_code.
CREATE INDEX IF NOT EXISTS training_procedures_share_code_idx
  ON public.training_procedures (share_code) WHERE share_code IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- §3. Trigger de remplissage
--
-- Le front web n'envoie pas club_id aujourd'hui (app/webapp/library/page.tsx
-- construit son objet `base` sans lui). Sans ce trigger, la contrainte NOT NULL
-- casserait la création de procédé dès l'application de la migration.
--
-- Le trigger remplit aussi created_by. Il ÉCHOUE bruyamment si l'utilisateur
-- appartient à plusieurs clubs sans avoir précisé lequel : le jour où ce cas
-- existe, on veut une erreur explicite et pas un procédé rangé au hasard.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.training_procedures_fill_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER              -- volontaire : on veut l'identité de l'appelant
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_count int;
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  IF NEW.club_id IS NULL THEN
    SELECT count(DISTINCT club_id) INTO v_count
      FROM public.club_members
     WHERE user_id = auth.uid() AND role IN ('admin', 'coach');

    IF v_count = 0 THEN
      RAISE EXCEPTION 'Aucun club en ecriture pour cet utilisateur : impossible de creer un procede.'
        USING ERRCODE = '42501';
    ELSIF v_count > 1 THEN
      RAISE EXCEPTION 'Utilisateur rattache a % clubs : preciser club_id a la creation du procede.', v_count
        USING ERRCODE = '22023';
    END IF;

    SELECT DISTINCT club_id INTO NEW.club_id
      FROM public.club_members
     WHERE user_id = auth.uid() AND role IN ('admin', 'coach');
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS training_procedures_fill_ownership_trg ON public.training_procedures;
CREATE TRIGGER training_procedures_fill_ownership_trg
  BEFORE INSERT ON public.training_procedures
  FOR EACH ROW EXECUTE FUNCTION public.training_procedures_fill_ownership();

-- ─────────────────────────────────────────────────────────────────────────────
-- §4. Privilèges de table
--
-- anon avait arwdDxt (défaut Supabase). Seule l'absence de policy le bloquait.
-- On ramène le GRANT au strict nécessaire du lien de partage public.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE public.training_procedures FROM anon;
GRANT  SELECT ON TABLE public.training_procedures TO anon;

REVOKE ALL ON TABLE public.training_procedures FROM authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_procedures TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- §5. Policies
--
-- Rappel PostgreSQL : les policies permissives se combinent en OU. Les trois
-- policies de lecture s'additionnent donc, c'est voulu et c'est pourquoi
-- chacune doit porter sa propre condition d'appartenance.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.training_procedures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_procedures_read_policy  ON public.training_procedures;
DROP POLICY IF EXISTS training_procedures_write_policy ON public.training_procedures;

-- Lecture 1 : sa propre bibliothèque de club (inclut les archivés, la page
-- library filtre elle-même sur archived_at).
CREATE POLICY training_procedures_select_own_club
  ON public.training_procedures FOR SELECT TO authenticated
  USING (public.has_club_access(club_id));

-- Lecture 2 : catalogue ouvert aux autres clubs. Vide tant que §7 n'est pas joué.
CREATE POLICY training_procedures_select_public_catalog
  ON public.training_procedures FOR SELECT TO authenticated
  USING (is_public AND archived_at IS NULL);

-- Lecture 3 : lien de partage /p/[code], sans compte. Strictement limité aux
-- procédés qui portent un share_code et ne sont pas archivés.
CREATE POLICY training_procedures_select_shared_link
  ON public.training_procedures FOR SELECT TO anon
  USING (share_code IS NOT NULL AND archived_at IS NULL);

-- Écriture : club propriétaire uniquement, et rôle admin ou coach
-- (has_club_write_access exclut 'viewer', contrairement à has_club_access).
CREATE POLICY training_procedures_insert
  ON public.training_procedures FOR INSERT TO authenticated
  WITH CHECK (public.has_club_write_access(club_id));

CREATE POLICY training_procedures_update
  ON public.training_procedures FOR UPDATE TO authenticated
  USING      (public.has_club_write_access(club_id))
  WITH CHECK (public.has_club_write_access(club_id));

CREATE POLICY training_procedures_delete
  ON public.training_procedures FOR DELETE TO authenticated
  USING (public.has_club_write_access(club_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- §6. Garde-fou permanent
--
-- La migration 20260803140000 exclut nommément training_procedures de son
-- contrôle final. Ce contrôle-ci prend le relais pour cette table : toute
-- migration future qui y remettrait une policy sans condition d'appartenance
-- fera échouer le déploiement.
-- ─────────────────────────────────────────────────────────────────────────────

DO $mig$
DECLARE
  v_open text;
  v_anon text;
BEGIN
  SELECT string_agg(policyname, ', ') INTO v_open
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename  = 'training_procedures'
     AND permissive = 'PERMISSIVE'
     AND (
          coalesce(qual, '')       IN ('true', '(auth.role() = ''authenticated''::text)')
       OR coalesce(with_check, '') IN ('true', '(auth.role() = ''authenticated''::text)')
     );

  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'Policy sans condition d''appartenance sur training_procedures : %', v_open;
  END IF;

  -- anon ne doit joindre la table qu'en lecture, et seulement via share_code.
  SELECT string_agg(policyname, ', ') INTO v_anon
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename  = 'training_procedures'
     AND 'anon' = ANY (roles::text[])
     AND cmd <> 'SELECT';

  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION 'anon dispose d''une policy d''ecriture sur training_procedures : %', v_anon;
  END IF;

  RAISE NOTICE 'OK : training_procedures isolee en ecriture, anon en lecture partagee seule.';
END
$mig$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- §7. NON JOUÉ ICI — ouverture du catalogue aux autres clubs
--
-- Après cette migration, un club externe voit une bibliothèque VIDE. Rendre le
-- catalogue de Paris XIV lisible par tous les clubs se fait par la commande
-- ci-dessous, à jouer à la main QUAND la décision commerciale est prise
-- (c'est l'expertise de Robin : cadeau d'onboarding ou levier de paywall).
--
--   UPDATE public.training_procedures
--      SET is_public = true
--    WHERE club_id = '<uuid-du-club-Paris-XIV>'
--      AND archived_at IS NULL;
--
-- Retour arrière : SET is_public = false sur les mêmes lignes.
-- ═════════════════════════════════════════════════════════════════════════════
