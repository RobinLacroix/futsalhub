-- ─────────────────────────────────────────────────────────────────────────────
-- Édition d'une déclaration de douleur par le joueur, demandée par plusieurs
-- joueurs (retour terrain, 2026-08-23). Jusqu'ici : create + delete seulement
-- (delete_my_pain_report, 20260729131000) ; corriger une zone/intensité/note
-- après coup imposait de supprimer puis resaisir — perd reported_at et change
-- report_group, sans bénéfice pour le joueur ni pour le staff qui relit
-- l'historique.
--
-- Modèle : report_group est l'unité atomique (1 ligne par zone). Éditer =
-- remplacer toutes les lignes du groupe par le nouveau jeu de zones, en
-- conservant report_group et le reported_at d'origine (MIN des lignes
-- existantes, même convention que get_player_pain_reports). source et
-- training_id ne sont pas éditables : une déclaration reste rattachée à son
-- contexte d'origine (spontané ou fin de séance X), seul le contenu change.
--
-- Même validation que _insert_pain_reports (20260803100000 §5) : regex de
-- zone, ≤ 20 zones, note ≤ 500 car. — mais en deux passes (valider avant
-- d'écrire) pour ne jamais supprimer une déclaration existante sur une entrée
-- invalide.
--
-- _notify_pain_report gagne un 5e paramètre optionnel (p_edited, défaut
-- FALSE) : re-notifie le staff sur une édition, avec un libellé distinct
-- ("Déclaration modifiée" vs "Douleur signalée") pour qu'il ne la confonde
-- pas avec un nouveau signalement. CREATE OR REPLACE avec paramètre ajouté en
-- fin de liste + DEFAULT : signature compatible, les appels existants à 4
-- arguments (report_my_pain, report_pain_by_token) continuent de résoudre.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._notify_pain_report(
  p_player_id  UUID,
  p_max_int    SMALLINT,
  p_zone_count INTEGER,
  p_first_zone TEXT,
  p_edited     BOOLEAN DEFAULT FALSE
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
  v_verb  TEXT;
  v_body  TEXT;
BEGIN
  SELECT first_name || ' ' || last_name INTO v_pname FROM players WHERE id = p_player_id;

  v_sev := CASE p_max_int
             WHEN 3 THEN 'très intense'
             WHEN 2 THEN 'assez intense'
             ELSE 'modérée'
           END;
  v_verb := CASE WHEN p_edited THEN 'a mis à jour sa déclaration : douleur' ELSE 'signale une douleur' END;

  v_body := COALESCE(v_pname, 'Un joueur')
            || ' ' || v_verb || ' ' || v_sev
            || CASE WHEN p_zone_count > 1
                    THEN ' sur ' || p_zone_count || ' zones (' || COALESCE(p_first_zone,'?') || '…)'
                    ELSE ' : ' || COALESCE(p_first_zone,'?')
               END;

  FOR v_cuid IN
    SELECT DISTINCT cm.user_id
    FROM players p
    LEFT JOIN player_teams pt ON pt.player_id = p.id
    JOIN teams t ON t.id = COALESCE(pt.team_id, p.team_id)
    JOIN club_members cm ON cm.club_id = t.club_id
    WHERE p.id = p_player_id
      AND cm.role IN ('admin','coach')
      AND (cm.role = 'admin' OR cm.team_id = t.id)
  LOOP
    CONTINUE WHEN NOT _notif_enabled(v_cuid, 'pain_report');
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_cuid, 'pain_report',
      COALESCE(v_pname, 'Un joueur') || ' · ' || CASE WHEN p_edited THEN 'Déclaration modifiée' ELSE 'Douleur signalée' END,
      v_body,
      jsonb_build_object('type','pain_report','player_id',p_player_id::text,'max_intensity',p_max_int,'edited',p_edited)
    );
  END LOOP;
END;
$$;

-- ── RPC : le joueur édite une déclaration existante ────────────────────────────
CREATE OR REPLACE FUNCTION update_my_pain_report(
  p_report_group UUID,
  p_zones        JSONB,
  p_note         TEXT DEFAULT NULL,
  p_onset        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id   UUID;
  v_source      TEXT;
  v_training_id UUID;
  v_reported_at TIMESTAMPTZ;
  v_elem        JSONB;
  v_count       INTEGER := 0;
  v_max         SMALLINT := 0;
  v_first_zone  TEXT;
  v_int         SMALLINT;
  v_zone        TEXT;
BEGIN
  SELECT id INTO v_player_id FROM players WHERE user_id = auth.uid() LIMIT 1;
  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_player');
  END IF;

  SELECT MAX(source), MAX(training_id::text)::UUID, MIN(reported_at)
  INTO v_source, v_training_id, v_reported_at
  FROM public.pain_reports
  WHERE report_group = p_report_group AND player_id = v_player_id;

  IF v_reported_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF p_zones IS NULL OR jsonb_typeof(p_zones) <> 'array' OR jsonb_array_length(p_zones) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_zones');
  END IF;
  IF jsonb_array_length(p_zones) > 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'too_many_zones');
  END IF;
  IF p_onset IS NOT NULL AND p_onset NOT IN ('aigu','chronique') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_onset');
  END IF;

  -- Passe de validation seule (aucune écriture) : une entrée invalide ne doit
  -- jamais effacer la déclaration existante.
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_zones)
  LOOP
    v_zone := left(COALESCE(v_elem->>'zone', ''), 40);
    IF v_zone !~ '^[A-Za-z0-9_-]{1,40}$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_zone');
    END IF;
  END LOOP;

  DELETE FROM public.pain_reports
  WHERE report_group = p_report_group AND player_id = v_player_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_zones)
  LOOP
    v_int  := LEAST(3, GREATEST(1, COALESCE((v_elem->>'intensity')::SMALLINT, 1)));
    v_zone := left(COALESCE(v_elem->>'zone', ''), 40);

    INSERT INTO public.pain_reports
      (player_id, report_group, zone, side, intensity, mode, source, note, onset, training_id, reported_at)
    VALUES (
      v_player_id, p_report_group,
      v_zone,
      COALESCE(NULLIF(v_elem->>'side',''), 'C'),
      v_int,
      COALESCE(NULLIF(v_elem->>'mode',''), 'zone'),
      v_source,
      NULLIF(left(trim(COALESCE(p_note,'')), 500), ''),
      NULLIF(p_onset,''),
      v_training_id,
      v_reported_at
    );

    v_count := v_count + 1;
    IF v_int > v_max THEN v_max := v_int; END IF;
    IF v_first_zone IS NULL THEN v_first_zone := v_zone; END IF;
  END LOOP;

  PERFORM _notify_pain_report(v_player_id, v_max, v_count, v_first_zone, true);

  RETURN jsonb_build_object('success', true, 'report_group', p_report_group, 'count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION update_my_pain_report(UUID, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_my_pain_report(UUID, JSONB, TEXT, TEXT) TO authenticated;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $mig$
BEGIN
  IF has_function_privilege('public', 'update_my_pain_report(uuid, jsonb, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'update_my_pain_report encore exécutable par PUBLIC après migration.';
  END IF;
  RAISE NOTICE 'OK : update_my_pain_report en place, _notify_pain_report distingue édition et création.';
END
$mig$;
