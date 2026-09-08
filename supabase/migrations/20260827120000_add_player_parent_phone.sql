-- Demande d'un coach : pouvoir noter le téléphone du joueur et/ou d'un parent
-- (contact d'urgence pour les mineurs). Aucun champ de ce type n'existait sur
-- `players`. Colonnes simples, pas de RPC à toucher : les deux services
-- (web lib/services/playersService.ts, mobile mobile/lib/services/players.ts)
-- écrivent directement sur la table, gardée par has_team_write_access
-- (20260730100000, garde row-scoped, pas column-scoped : rien à changer côté RLS).

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS parent_name TEXT,
  ADD COLUMN IF NOT EXISTS parent_phone TEXT;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'phone'
  ) THEN
    RAISE EXCEPTION 'players.phone aurait dû être créée par cette migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'parent_phone'
  ) THEN
    RAISE EXCEPTION 'players.parent_phone aurait dû être créée par cette migration';
  END IF;
END;
$verify$;
