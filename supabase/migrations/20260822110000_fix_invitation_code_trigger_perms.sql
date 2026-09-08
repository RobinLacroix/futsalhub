-- Fix : création d'invitation staff cassée depuis le 3 août 2026.
--
-- Diagnostic (vérifié en base via pg_proc / pg_policies, claude_audit) : le §11 « filet »
-- de 20260803100000 a fait `REVOKE ALL ON FUNCTION _gen_invitation_code() FROM PUBLIC,
-- anon, authenticated` — correct dans son intention (un helper de génération n'a rien à
-- faire appelable en RPC direct), mais `_gen_invitation_code()` n'est pas seulement un
-- helper interne d'une RPC SECURITY DEFINER : elle est aussi appelée par le trigger BEFORE
-- INSERT `set_invitation_code` (fonction `_set_invitation_code`, 20260730120000), qui se
-- déclenche sur l'INSERT direct client dans `club_invitations`
-- (`createClubInvitation`/`createInvitation`, web ET mobile — aucune des deux ne passe par
-- une RPC pour créer l'invitation).
--
-- `_set_invitation_code` n'était pas SECURITY DEFINER : son corps s'exécutait donc sous le
-- rôle `authenticated` de l'appelant, qui vient de perdre le droit d'exécuter
-- `_gen_invitation_code()`. Résultat : tout INSERT dans `club_invitations` par un admin
-- authentifié échoue avec « permission denied for function _gen_invitation_code », remonté
-- côté client comme « Impossible de créer l'invitation. » — reproductible sur web comme sur
-- mobile, pas un bug spécifique à l'app.
--
-- Correctif : le trigger passe en SECURITY DEFINER (propriétaire `postgres`, qui a
-- toujours l'EXECUTE sur `_gen_invitation_code`), sans toucher aux GRANT/REVOKE de
-- `_gen_invitation_code` elle-même — elle reste fermée à `authenticated`/`anon` en appel
-- direct, conformément à l'intention du §11 d'août. Un trigger n'a de toute façon jamais
-- besoin d'EXECUTE explicite pour se déclencher ; c'est uniquement l'appel interne à
-- `_gen_invitation_code()` dans son corps qui requiert ce privilège.
CREATE OR REPLACE FUNCTION _set_invitation_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.code IS NULL OR trim(NEW.code) = '' THEN
    NEW.code := _gen_invitation_code();
  ELSE
    NEW.code := upper(trim(NEW.code));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION _set_invitation_code() FROM PUBLIC, anon, authenticated;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_secdef BOOLEAN;
BEGIN
  SELECT prosecdef INTO v_secdef FROM pg_proc WHERE proname = '_set_invitation_code';
  IF NOT v_secdef THEN
    RAISE EXCEPTION '_set_invitation_code devrait être SECURITY DEFINER après cette migration';
  END IF;
END;
$verify$;
