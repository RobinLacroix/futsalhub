-- Demande : les coachs doivent être notifiés quand un joueur répond au
-- questionnaire wellness d'un MATCH de leur équipe, comme ils le sont déjà
-- pour un entraînement.
--
-- `_notify_on_questionnaire_response` (trigger AFTER INSERT sur
-- `training_player_feedback`, cf. 20260730110000 puis dédup dans
-- 20260827100000) ne résolvait l'équipe/la date/le thème que via
-- `trainings WHERE id = NEW.training_id`. Pour une ligne de feedback liée à
-- un match (`match_id` renseigné, `training_id` NULL — cf. contrainte de
-- 20260827160000_match_feedback_questionnaire.sql), cette recherche ne
-- trouvait rien : `v_tid IS NULL` faisait sortir la fonction sans notifier
-- personne.
--
-- On branche simplement sur laquelle des deux colonnes est renseignée, et on
-- résout la même chose (équipe, date, libellé) depuis `matches` — même
-- libellé « Match vs <adversaire> » que dans `get_training_load`
-- (20260827200000), pour rester cohérent avec ce qui s'affiche déjà dans
-- Charge d'entraînement.
--
-- Trigger function non appelable via RPC (cf. CLAUDE.md, exception
-- documentée) : pas de REVOKE à ajouter, aucune migration précédente ne l'a
-- fait pour cette fonction.

CREATE OR REPLACE FUNCTION public._notify_on_questionnaire_response()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pname TEXT;
  v_tid   UUID;
  v_date  TEXT;
  v_theme TEXT;
  v_cuid  UUID;
  v_data  JSONB;
BEGIN
  SELECT first_name || ' ' || last_name INTO v_pname FROM players WHERE id = NEW.player_id;

  IF NEW.training_id IS NOT NULL THEN
    SELECT team_id,
           TO_CHAR(date AT TIME ZONE 'Europe/Paris', 'DD/MM'),
           COALESCE(theme, '')
    INTO v_tid, v_date, v_theme
    FROM trainings WHERE id = NEW.training_id;

    v_data := jsonb_build_object(
      'type', 'questionnaire_response',
      'training_id', NEW.training_id::text,
      'player_id', NEW.player_id::text
    );
  ELSIF NEW.match_id IS NOT NULL THEN
    SELECT team_id,
           TO_CHAR(date AT TIME ZONE 'Europe/Paris', 'DD/MM'),
           'Match' || COALESCE(' vs ' || opponent_team, '')
    INTO v_tid, v_date, v_theme
    FROM matches WHERE id = NEW.match_id;

    v_data := jsonb_build_object(
      'type', 'questionnaire_response',
      'match_id', NEW.match_id::text,
      'player_id', NEW.player_id::text
    );
  END IF;

  IF v_tid IS NULL THEN RETURN NEW; END IF;

  FOR v_cuid IN
    SELECT DISTINCT cm.user_id FROM club_members cm
    JOIN teams t ON t.club_id = cm.club_id
    WHERE t.id = v_tid
      AND cm.role IN ('admin','coach')
      AND (cm.role = 'admin' OR cm.team_id = v_tid)
  LOOP
    CONTINUE WHEN NOT _notif_enabled(v_cuid, 'questionnaire_response') OR NOT _notif_team_enabled(v_cuid, v_tid);
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_cuid, 'questionnaire_response',
      'Questionnaire · ' || COALESCE(v_pname, 'un joueur'),
      COALESCE(v_pname, 'Un joueur') || ' a répondu au questionnaire du ' || COALESCE(v_date, '?')
        || CASE WHEN v_theme <> '' THEN ' (' || v_theme || ')' ELSE '' END,
      v_data
    );
  END LOOP;
  RETURN NEW;
END;
$$;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_src TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src FROM pg_proc WHERE proname = '_notify_on_questionnaire_response';

  IF v_src NOT ILIKE '%NEW.match_id IS NOT NULL%' THEN
    RAISE EXCEPTION '_notify_on_questionnaire_response devrait notifier aussi sur les questionnaires de match après cette migration';
  END IF;

  IF has_function_privilege('public', (SELECT oid FROM pg_proc WHERE proname = '_notify_on_questionnaire_response'), 'EXECUTE') THEN
    RAISE EXCEPTION '_notify_on_questionnaire_response est exécutable par PUBLIC après cette migration (ne devrait pas l''être)';
  END IF;
END;
$verify$;
