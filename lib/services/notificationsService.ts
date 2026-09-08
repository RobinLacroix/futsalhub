import { supabase } from '../supabaseClient';

/** Types de notification staff activables/désactivables par le coach. */
export type CoachNotifType =
  | 'absence_report'
  | 'injury'
  | 'feedback_comment'
  | 'questionnaire_response'
  | 'pain_report';

export type NotificationPreferences = Record<CoachNotifType, boolean>;

export const DEFAULT_NOTIF_PREFS: NotificationPreferences = {
  absence_report: true,
  injury: true,
  feedback_comment: true,
  questionnaire_response: true,
  pain_report: true,
};

export interface NotificationTeamPreference {
  team_id: string;
  team_name: string;
  enabled: boolean;
}

export const notificationsService = {
  async getPreferences(): Promise<NotificationPreferences> {
    const { data, error } = await supabase.rpc('get_my_notification_preferences');
    if (error) throw error;
    return { ...DEFAULT_NOTIF_PREFS, ...(data ?? {}) } as NotificationPreferences;
  },

  async setPreference(type: CoachNotifType, enabled: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_my_notification_preference', {
      p_type: type,
      p_enabled: enabled,
    });
    if (error) throw error;
  },

  /** Réglage admin : couper les notifications d'une équipe précise, indépendamment du type. */
  async getTeamPreferences(): Promise<NotificationTeamPreference[]> {
    const { data, error } = await supabase.rpc('get_my_notification_team_preferences');
    if (error) throw error;
    return ((data ?? []) as any[]).map((row) => ({
      team_id: row.team_id,
      team_name: row.team_name ?? 'Équipe',
      enabled: row.enabled !== false,
    }));
  },

  async setTeamPreference(teamId: string, enabled: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_my_notification_team_preference', {
      p_team_id: teamId,
      p_enabled: enabled,
    });
    if (error) throw error;
  },
};
