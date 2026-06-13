import { supabase } from '../supabase';

export interface NotificationCounts {
  convocation: number;
  questionnaire: number;
  absence_report: number;
  feedback_comment: number;
  total: number;
}

export const EMPTY_COUNTS: NotificationCounts = {
  convocation: 0,
  questionnaire: 0,
  absence_report: 0,
  feedback_comment: 0,
  total: 0,
};

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
