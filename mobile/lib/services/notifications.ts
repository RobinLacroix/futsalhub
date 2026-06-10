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
