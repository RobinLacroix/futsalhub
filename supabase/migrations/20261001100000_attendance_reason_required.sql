-- Motif obligatoire quand un joueur se déclare lui-même absent, demandé par Robin.
-- Le coach qui marque un joueur absent (updateTrainingAttendance, écriture directe sur
-- trainings) n'est pas concerné : seule la RPC self-scopée set_my_training_attendance
-- (auth.uid() -> son propre player_id) est la porte d'entrée de la déclaration joueur.
--
-- Stocké en JSONB map player_id -> texte, même forme que attendance_excused
-- (20260822160000) : une séance peut avoir plusieurs joueurs absents, chacun son motif.
ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS attendance_reason JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.trainings.attendance_reason IS
  'Motif texte libre saisi par le joueur quand il se déclare absent lui-même (set_my_training_attendance). Absent de la map = pas de motif (marqué par le coach, ou statut non-absent).';

-- La fonction change de signature (ajout de p_reason) : CREATE OR REPLACE ne remplace
-- pas une fonction dont la liste d'arguments diffère, il crée une surcharge. Sans ce
-- DROP, l'ancienne signature (uuid, text) resterait appelable et laisserait un moyen de
-- se déclarer absent sans motif.
DROP FUNCTION IF EXISTS public.set_my_training_attendance(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.set_my_training_attendance(
  p_training_id UUID,
  p_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_team_id UUID;
  v_in_team BOOLEAN;
  v_convoqued BOOLEAN;
  v_attendance JSONB;
  v_attendance_excused JSONB;
  v_attendance_reason JSONB;
  v_reason TEXT;
  v_training_date TIMESTAMPTZ;
  v_deadline TIMESTAMPTZ;
  v_absence_notice_minutes INT;
  v_late_notice_minutes INT;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('present', 'absent', 'late', 'injured') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  -- Motif obligatoire pour une absence auto-déclarée. Le coach ne passe jamais par
  -- cette RPC (il écrit directement trainings.attendance via updateTrainingAttendance),
  -- donc cette garde ne s'applique qu'à la déclaration du joueur lui-même.
  IF p_status = 'absent' THEN
    v_reason := NULLIF(TRIM(p_reason), '');
    IF v_reason IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
    END IF;
    v_reason := LEFT(v_reason, 300);
  END IF;

  SELECT id INTO v_player_id
  FROM players
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_player');
  END IF;

  SELECT tr.team_id, tr.date INTO v_team_id, v_training_date
  FROM trainings tr
  WHERE tr.id = p_training_id;

  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'training_not_found');
  END IF;

  SELECT absence_notice_minutes, late_notice_minutes
  INTO v_absence_notice_minutes, v_late_notice_minutes
  FROM teams WHERE id = v_team_id;

  v_deadline := CASE WHEN p_status = 'absent'
                      THEN v_training_date - (COALESCE(v_absence_notice_minutes, 360) || ' minutes')::INTERVAL
                      ELSE v_training_date - (COALESCE(v_late_notice_minutes, 15) || ' minutes')::INTERVAL
                 END;
  IF NOW() > v_deadline THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM player_teams pt
    WHERE pt.player_id = v_player_id AND pt.team_id = v_team_id
  ) INTO v_in_team;
  IF NOT v_in_team THEN
    SELECT (SELECT p.team_id FROM players p WHERE p.id = v_player_id LIMIT 1) = v_team_id INTO v_in_team;
  END IF;
  IF NOT v_in_team THEN
    SELECT EXISTS (
      SELECT 1 FROM trainings tr2
      WHERE tr2.id = p_training_id
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(tr2.convoked_players, '[]'::jsonb)) AS elem
          WHERE elem->>'id' = v_player_id::text
        )
    ) INTO v_convoqued;
    IF NOT v_convoqued THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_in_team');
    END IF;
  END IF;

  SELECT COALESCE(tr.attendance, '{}'::jsonb),
         COALESCE(tr.attendance_excused, '{}'::jsonb),
         COALESCE(tr.attendance_reason, '{}'::jsonb)
  INTO v_attendance, v_attendance_excused, v_attendance_reason
  FROM trainings tr
  WHERE tr.id = p_training_id;

  v_attendance := jsonb_set(v_attendance, ARRAY[v_player_id::text], to_jsonb(p_status::text), true);
  IF p_status IN ('absent', 'late') THEN
    v_attendance_excused := jsonb_set(v_attendance_excused, ARRAY[v_player_id::text], 'true'::jsonb, true);
  END IF;
  IF p_status = 'absent' THEN
    v_attendance_reason := jsonb_set(v_attendance_reason, ARRAY[v_player_id::text], to_jsonb(v_reason), true);
  ELSE
    v_attendance_reason := v_attendance_reason - v_player_id::text;
  END IF;

  UPDATE trainings
  SET attendance = v_attendance,
      attendance_excused = v_attendance_excused,
      attendance_reason = v_attendance_reason
  WHERE id = p_training_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- FROM PUBLIC ne suffit pas : Supabase accorde EXECUTE à anon par défaut à la création
-- (ALTER DEFAULT PRIVILEGES), séparément de PUBLIC. Cf. AUDIT_SECURITE_RPC_2026-08 et le
-- pattern `REVOKE ... FROM PUBLIC, anon` utilisé partout dans 20260803100000.
REVOKE ALL ON FUNCTION public.set_my_training_attendance(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_training_attendance(UUID, TEXT, TEXT) TO authenticated;

-- ── Vérification ────────────────────────────────────────────────────────────
-- Échoue la migration si l'ancienne signature a survécu, ou si la nouvelle reste
-- exécutable par PUBLIC/anon (cf. protocole de migration, garde-fou §15 de
-- 20260803100000_rpc_security_hardening_v2.sql).
DO $mig$
DECLARE
  v_old_exists BOOLEAN;
  v_new_oid OID;
  v_public_leak BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_my_training_attendance'
      AND pg_get_function_identity_arguments(p.oid) = 'p_training_id uuid, p_status text'
  ) INTO v_old_exists;

  IF v_old_exists THEN
    RAISE EXCEPTION 'set_my_training_attendance(uuid, text) existe encore : l''ancienne signature aurait dû être supprimée';
  END IF;

  SELECT p.oid INTO v_new_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'set_my_training_attendance'
    AND pg_get_function_identity_arguments(p.oid) = 'p_training_id uuid, p_status text, p_reason text';

  IF v_new_oid IS NULL THEN
    RAISE EXCEPTION 'set_my_training_attendance(uuid, text, text) introuvable après la migration';
  END IF;

  SELECT (
    p.proacl IS NULL
    OR EXISTS (
      SELECT 1 FROM aclexplode(p.proacl) a
      LEFT JOIN pg_roles gr ON gr.oid = a.grantee
      WHERE a.privilege_type = 'EXECUTE'
        AND (a.grantee = 0 OR gr.rolname IN ('anon', 'public'))
    )
  ) INTO v_public_leak
  FROM pg_proc p WHERE p.oid = v_new_oid;

  IF v_public_leak THEN
    RAISE EXCEPTION 'set_my_training_attendance(uuid, text, text) reste exécutable par PUBLIC/anon';
  END IF;
END;
$mig$;
