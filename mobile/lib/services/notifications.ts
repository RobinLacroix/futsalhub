import { supabase } from '../supabase';

export interface NotificationCounts {
  convocation: number;
  questionnaire: number;
  absence_report: number;
  injury: number;
  feedback_comment: number;
  questionnaire_response: number;
  total: number;
}

export const EMPTY_COUNTS: NotificationCounts = {
  convocation: 0,
  questionnaire: 0,
  absence_report: 0,
  injury: 0,
  feedback_comment: 0,
  questionnaire_response: 0,
  total: 0,
};

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

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const { data, error } = await supabase.rpc('get_my_notification_preferences');
  if (error) throw error;
  return { ...DEFAULT_NOTIF_PREFS, ...(data ?? {}) } as NotificationPreferences;
}

export async function setNotificationPreference(
  type: CoachNotifType,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('set_my_notification_preference', {
    p_type: type,
    p_enabled: enabled,
  });
  if (error) throw error;
}

export async function getNotificationCounts(): Promise<NotificationCounts> {
  const { data, error } = await supabase.rpc('get_my_notification_counts');
  if (error) throw error;
  return (data ?? EMPTY_COUNTS) as NotificationCounts;
}

export async function markNotificationsRead(types?: string[]): Promise<void> {
  await supabase.rpc('mark_notifications_read', { p_types: types ?? null });
}

export async function getAbsenceTrainingIds(): Promise<string[]> {
  const { data } = await supabase.rpc('get_unread_absence_training_ids');
  return (data ?? []) as string[];
}

export async function getFeedbackPlayerIds(): Promise<string[]> {
  const { data } = await supabase.rpc('get_unread_feedback_player_ids');
  return (data ?? []) as string[];
}

export async function markTrainingAbsenceRead(trainingId: string): Promise<void> {
  await supabase.rpc('mark_training_absence_read', { p_training_id: trainingId });
}

export async function markPlayerFeedbackRead(playerId: string): Promise<void> {
  await supabase.rpc('mark_player_feedback_read', { p_player_id: playerId });
}

/** Envoie un push aux coaches du joueur connecté (fire & forget depuis l'app). */
export async function pushToMyCoaches(params: {
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  try {
    const { data: coachIds, error } = await supabase.rpc('get_my_coaches_user_ids');
    if (error || !coachIds?.length) return;

    await supabase.functions.invoke('send-push-notification', {
      body: {
        userIds: coachIds,
        title: params.title,
        body: params.body,
        data: params.data ?? {},
      },
    });
  } catch {
    // non-critique
  }
}
