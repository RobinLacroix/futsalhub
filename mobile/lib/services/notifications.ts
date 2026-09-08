import { supabase } from '../supabase';

export interface NotificationCounts {
  convocation: number;
  questionnaire: number;
  absence_report: number;
  injury: number;
  feedback_comment: number;
  questionnaire_response: number;
  post_tag: number;
  post_comment: number;
  total: number;
}

export const EMPTY_COUNTS: NotificationCounts = {
  convocation: 0,
  questionnaire: 0,
  absence_report: 0,
  injury: 0,
  feedback_comment: 0,
  questionnaire_response: 0,
  post_tag: 0,
  post_comment: 0,
  total: 0,
};

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

export const COACH_NOTIF_TYPE_LABELS: Record<CoachNotifType, string> = {
  absence_report: 'Absences et retards',
  injury: 'Blessures signalées en présence',
  feedback_comment: 'Commentaires libres du questionnaire',
  questionnaire_response: 'Réponses au questionnaire',
  pain_report: 'Douleurs signalées',
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

/** Réglage admin : couper les notifications d'une équipe précise, indépendamment du type. */
export interface NotificationTeamPreference {
  team_id: string;
  team_name: string;
  enabled: boolean;
}

export async function getNotificationTeamPreferences(): Promise<NotificationTeamPreference[]> {
  const { data, error } = await supabase.rpc('get_my_notification_team_preferences');
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    team_id: row.team_id,
    team_name: row.team_name ?? 'Équipe',
    enabled: row.enabled !== false,
  }));
}

export async function setNotificationTeamPreference(teamId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_my_notification_team_preference', {
    p_team_id: teamId,
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

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string | number | null | undefined>;
  read_at: string | null;
  created_at: string;
}

export async function getMyNotifications(limit = 50, offset = 0): Promise<NotificationItem[]> {
  const { data, error } = await supabase.rpc('get_my_notifications', {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as NotificationItem[];
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await supabase.rpc('mark_notification_read', { p_notification_id: notificationId });
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
