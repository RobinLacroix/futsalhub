-- ═════════════════════════════════════════════════════════════════════════════
-- Fix : upload de fichiers refusé sur le bucket `shared-content`
--
-- Symptôme signalé par Robin (2026-08-20) : un .mp4 valide, sélectionné via
-- le formulaire "Nouvelle ressource" (qui restreint déjà le picker à
-- .pdf/image/video via l'attribut `accept`), est rejeté par Supabase Storage
-- avec l'erreur "mime type text/plain is not supported" — persistant même
-- après avoir corrigé le client pour envoyer un Content-Type dérivé de
-- l'extension du fichier plutôt que du `File.type` du navigateur (lib/
-- services/sharedContentService.ts, `resolveContentType`).
--
-- Le fait que l'erreur reste identique au mot près après ce correctif client
-- indique que Supabase Storage ne se fie pas au Content-Type envoyé par le
-- client pour vérifier `allowed_mime_types` : il détecte lui-même le type à
-- partir des octets reçus. Le vrai verrou est donc côté configuration du
-- bucket, pas côté application — `storage.buckets` a été créé/configuré à la
-- main dans le dashboard (comme `get_team_stats`, cf. CLAUDE.md), donc sa
-- valeur `allowed_mime_types` n'existe dans aucune migration à ce jour.
--
-- Fix : aligner `allowed_mime_types` sur exactement ce que le formulaire
-- autorise déjà côté client (pas d'ouverture au-delà : pas de SVG/HTML, qui
-- seraient un vecteur XSS si jamais servis inline).
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $mig$
DECLARE
  v_before text[];
  v_after  text[];
BEGIN
  SELECT allowed_mime_types INTO v_before FROM storage.buckets WHERE id = 'shared-content';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bucket shared-content introuvable : rien a corriger.';
  END IF;

  UPDATE storage.buckets
     SET allowed_mime_types = ARRAY[
           'application/pdf',
           'image/jpeg',
           'image/png',
           'image/gif',
           'image/webp',
           'image/heic',
           'image/heif',
           'video/mp4',
           'video/quicktime'
         ]
   WHERE id = 'shared-content';

  SELECT allowed_mime_types INTO v_after FROM storage.buckets WHERE id = 'shared-content';

  IF NOT ('video/mp4' = ANY(v_after)) THEN
    RAISE EXCEPTION 'video/mp4 toujours absent de allowed_mime_types apres correction.';
  END IF;

  RAISE NOTICE 'OK : shared-content.allowed_mime_types % -> %', v_before, v_after;
END
$mig$;

COMMIT;
