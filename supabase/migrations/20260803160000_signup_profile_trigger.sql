-- ─────────────────────────────────────────────────────────────────────────────
-- Création du profil `public.users` côté serveur, par trigger sur auth.users
--
-- CONTEXTE. Deux problèmes convergent ici.
--
-- 1. RÉGRESSION introduite par 20260803140000 (§4). Le projet exige la
--    confirmation d'email (`mailer_autoconfirm: false`) : `supabase.auth.signUp()`
--    renvoie donc un `user` mais AUCUNE session. L'insert de profil fait juste
--    après par app/signup/page.tsx:67 s'exécute alors en tant qu'`anon`, et la
--    policy `users_insert_self` (`WITH CHECK (id = auth.uid())`) le rejette,
--    `auth.uid()` étant NULL. Vérifié en conditions réelles le 2026-08-03 :
--        {"code":"42501","message":"new row violates row-level security policy
--         for table \"users\""}
--    => l'inscription web était cassée.
--
-- 2. FAILLE PRÉEXISTANTE que cette régression a révélée. Si cet insert
--    fonctionnait avant, c'est précisément parce que la RLS était DÉSACTIVÉE sur
--    `users` : n'importe qui pouvait donc y écrire des profils arbitraires. Il ne
--    faut pas rouvrir l'écriture, il faut déplacer la création du profil.
--
-- 3. INCOHÉRENCE mobile. mobile/app/sign-up.tsx n'insère jamais dans `users` :
--    les comptes créés depuis le mobile n'ont tout simplement jamais eu de profil.
--
-- CORRECTIF. Pattern officiel Supabase : un trigger `SECURITY DEFINER` sur
-- `auth.users` crée la ligne `public.users`. Il s'exécute sous l'identité du
-- propriétaire, donc indépendamment de la session, et le client ne peut plus
-- fabriquer de profil — il ne fait que transmettre ses métadonnées à signUp().
-- Web et mobile deviennent cohérents.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- §1 — Trigger de création de profil
--
-- Les champs viennent de `raw_user_meta_data`, alimenté par l'option `data` de
-- `supabase.auth.signUp()`. Absents (cas mobile actuel) => NULL, la ligne existe
-- quand même et pourra être complétée par l'utilisateur via `users_update_self`.
--
-- ON CONFLICT DO NOTHING : rend le trigger idempotent et sans effet sur les
-- profils déjà créés par l'ancien flux client.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (id, first_name, last_name, email, phone, country, created_at)
  VALUES (
    NEW.id,
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'first_name', '')), ''),
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'last_name',  '')), ''),
    NEW.email,
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'phone',      '')), ''),
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'country',    '')), ''),
    COALESCE(NEW.created_at, NOW())
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ═════════════════════════════════════════════════════════════════════════════
-- §2 — Rattrapage des comptes existants sans profil
--
-- Comptes créés depuis le mobile (qui n'insérait jamais dans `users`) ou dont
-- l'insert client a échoué. On ne touche à aucun profil existant.
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO public.users (id, email, created_at)
SELECT au.id, au.email, COALESCE(au.created_at, NOW())
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = au.id)
ON CONFLICT (id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════════════
-- §3 — Fermeture de l'écriture cliente sur `users`
--
-- Le profil étant désormais créé côté serveur, la policy d'INSERT n'a plus de
-- raison d'exister : la supprimer retire une surface d'écriture au client.
-- `users_select_self_or_clubmate` et `users_update_self` (posées en §4 de
-- 20260803140000) restent en place : l'utilisateur lit et met à jour son profil.
-- ═════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS users_insert_self ON public.users;


-- ═════════════════════════════════════════════════════════════════════════════
-- §4 — Vérification
-- ═════════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  v_missing INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' AND c.relname = 'users' AND t.tgname = 'on_auth_user_created'
  ) THEN
    RAISE EXCEPTION 'Trigger on_auth_user_created absent : la creation de profil ne fonctionnera pas.';
  END IF;

  SELECT count(*) INTO v_missing
  FROM auth.users au
  WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = au.id);

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Il reste % compte(s) auth sans profil public.users.', v_missing;
  END IF;

  RAISE NOTICE 'OK : trigger en place, tous les comptes auth ont un profil.';
END
$mig$;
