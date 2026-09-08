-- Demande du kiné : une échelle 1-10 explicite plutôt que le cycle de clics
-- actuel (1 clic = modérée, 2 = assez intense, 3 = très intense — plafonné à 3,
-- pas 10). Élargit le contrat de données ; l'UI (BodyMap web/mobile) passe du
-- clic-cycle à un sélecteur explicite dans le même changement applicatif.

ALTER TABLE public.pain_reports DROP CONSTRAINT IF EXISTS pain_reports_intensity_check;
ALTER TABLE public.pain_reports ADD CONSTRAINT pain_reports_intensity_check
  CHECK (intensity BETWEEN 1 AND 10);

-- ── Clamp d'insertion : 3 → 10 ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _insert_pain_reports(
  p_player_id   UUID,
  p_zones       JSONB,   -- [{ "zone": "...", "side": "L", "intensity": 2, "mode": "zone" }, ...]
  p_source      TEXT,
  p_note        TEXT,
  p_onset       TEXT,
  p_training_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group      UUID := gen_random_uuid();
  v_elem       JSONB;
  v_count      INTEGER := 0;
  v_max        SMALLINT := 0;
  v_first_zone TEXT;
  v_int        SMALLINT;
BEGIN
  IF p_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_player');
  END IF;
  IF p_zones IS NULL OR jsonb_typeof(p_zones) <> 'array' OR jsonb_array_length(p_zones) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_zones');
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_zones)
  LOOP
    v_int := LEAST(10, GREATEST(1, COALESCE((v_elem->>'intensity')::SMALLINT, 1)));

    INSERT INTO public.pain_reports
      (player_id, report_group, zone, side, intensity, mode, source, note, onset, training_id)
    VALUES (
      p_player_id, v_group,
      v_elem->>'zone',
      COALESCE(NULLIF(v_elem->>'side',''), 'C'),
      v_int,
      COALESCE(NULLIF(v_elem->>'mode',''), 'zone'),
      p_source, p_note, p_onset, p_training_id
    );

    v_count := v_count + 1;
    v_max := GREATEST(v_max, v_int);
    IF v_first_zone IS NULL THEN v_first_zone := v_elem->>'zone'; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 'report_group', v_group,
    'zone_count', v_count, 'max_intensity', v_max, 'first_zone', v_first_zone
  );
END;
$$;

-- ── Libellés de sévérité : 3 paliers → 4 paliers sur 1-10 ─────────────────────
-- Reprend _notify_pain_report telle que corrigée par 20260827100000 (dédup
-- GROUP BY cm.user_id, déjà correcte) : seul le mapping p_max_int → v_sev change.
CREATE OR REPLACE FUNCTION public._notify_pain_report(
  p_player_id  UUID,
  p_max_int    SMALLINT,
  p_zone_count INTEGER,
  p_first_zone TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pname TEXT;
  v_cuid  UUID;
  v_sev   TEXT;
  v_body  TEXT;
BEGIN
  SELECT first_name || ' ' || last_name INTO v_pname FROM players WHERE id = p_player_id;

  v_sev := CASE
             WHEN p_max_int >= 9 THEN 'très intense'
             WHEN p_max_int >= 7 THEN 'intense'
             WHEN p_max_int >= 4 THEN 'modérée'
             ELSE 'légère'
           END || ' (' || p_max_int || '/10)';

  v_body := COALESCE(v_pname, 'Un joueur')
            || ' signale une douleur ' || v_sev
            || CASE WHEN p_zone_count > 1
                    THEN ' sur ' || p_zone_count || ' zones (' || COALESCE(p_first_zone,'?') || '…)'
                    ELSE ' : ' || COALESCE(p_first_zone,'?')
               END;

  FOR v_cuid IN
    SELECT cm.user_id
    FROM players p
    LEFT JOIN player_teams pt ON pt.player_id = p.id
    JOIN teams t ON t.id = COALESCE(pt.team_id, p.team_id)
    JOIN club_members cm ON cm.club_id = t.club_id
    WHERE p.id = p_player_id
      AND cm.role IN ('admin','coach')
      AND (cm.role = 'admin' OR cm.team_id = t.id)
      AND _notif_team_enabled(cm.user_id, t.id)
    GROUP BY cm.user_id
  LOOP
    CONTINUE WHEN NOT _notif_enabled(v_cuid, 'pain_report');
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_cuid, 'pain_report',
      COALESCE(v_pname, 'Un joueur') || ' · Douleur signalée',
      v_body,
      jsonb_build_object('type','pain_report','player_id',p_player_id::text,'max_intensity',p_max_int)
    );
  END LOOP;
END;
$$;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint WHERE conrelid = 'public.pain_reports'::regclass AND conname = 'pain_reports_intensity_check';
  IF v_def NOT ILIKE '%10%' THEN
    RAISE EXCEPTION 'pain_reports_intensity_check devrait autoriser jusqu''à 10 après cette migration';
  END IF;
END;
$verify$;
