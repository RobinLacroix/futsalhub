-- _notify_pain_report a deux signatures en base : la version à 4 arguments
-- (20260729120000) est correctement verrouillée (PUBLIC ne peut pas l'exécuter),
-- mais la version à 5 arguments (avec p_edited, ajoutée par
-- 20260823150000_pain_report_edit.sql pour distinguer une modification d'un
-- nouveau signalement) n'a jamais reçu son propre REVOKE ALL FROM PUBLIC —
-- chaque signature a sa propre ACL, l'une n'hérite pas du verrouillage de
-- l'autre. Trouvé en interrogeant pg_proc sur la base réelle (rôle claude_audit),
-- pas en supposant depuis le repo, cf. CLAUDE.md.
--
-- C'est un helper interne (préfixe `_`), jamais appelé directement par l'app :
-- uniquement par d'autres fonctions SECURITY DEFINER du module pain_reports.
-- Aucun GRANT à recréer après le REVOKE.

REVOKE ALL ON FUNCTION _notify_pain_report(UUID, SMALLINT, INTEGER, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = '_notify_pain_report'
      AND has_function_privilege('public', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION '_notify_pain_report a encore au moins une signature exécutable par PUBLIC';
  END IF;
END;
$verify$;
