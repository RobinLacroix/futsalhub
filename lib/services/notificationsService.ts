import { supabase } from '../supabaseClient';

/** Types de notification staff activables/désactivables par le coach. */
export type CoachNotifType =
  | 'absence_report'
  | 'injury'
  | 'feedback_comment'
  | 'questionnaire_response';

export type NotificationPreferences = Record<CoachNotifType, boolean>;

export const DEFAULT_NOTIF_PREFS: NotificationPreferences = {
  absence_report: true,
  injury: true,
  feedback_comment: true,
  questionnaire_response: true,
};

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
};
