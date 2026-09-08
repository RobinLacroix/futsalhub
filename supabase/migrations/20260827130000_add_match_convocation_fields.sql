-- Demandes users sur la fiche match :
--   - adresse du gymnase (texte libre, distinct du chip Domicile/Extérieur `location`)
--   - une heure de rendez-vous distincte du coup d'envoi (`date`)
--   - un message libre multiligne du coach pour la convocation
-- Alimente aussi le format de partage de convocation (share_convocation_to_feed,
-- migration suivante) : ces 3 colonnes doivent exister avant.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS venue_address TEXT,
  ADD COLUMN IF NOT EXISTS meeting_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS convocation_message TEXT;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'venue_address'
  ) THEN
    RAISE EXCEPTION 'matches.venue_address aurait dû être créée par cette migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'meeting_time'
  ) THEN
    RAISE EXCEPTION 'matches.meeting_time aurait dû être créée par cette migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'convocation_message'
  ) THEN
    RAISE EXCEPTION 'matches.convocation_message aurait dû être créée par cette migration';
  END IF;
END;
$verify$;
