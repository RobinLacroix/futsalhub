-- Correction : récursion infinie dans les politiques RLS de club_members
-- Les politiques qui font SELECT sur club_members provoquent une récursion.
-- On utilise is_club_admin() qui est SECURITY DEFINER et bypass RLS.

DROP POLICY IF EXISTS "Admins can view club members" ON club_members;
DROP POLICY IF EXISTS "Admins can modify club members" ON club_members;

-- Utiliser is_club_admin() au lieu d'une sous-requête sur club_members
CREATE POLICY "Admins can view club members" ON club_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_club_admin(club_id)
  );

CREATE POLICY "Admins can modify club members" ON club_members
  FOR ALL USING (is_club_admin(club_id));
