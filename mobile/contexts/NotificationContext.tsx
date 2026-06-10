import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase';
import {
  getNotificationCounts,
  markNotificationsRead,
  EMPTY_COUNTS,
  type NotificationCounts,
} from '../lib/services/notifications';

interface NotificationContextValue {
  counts: NotificationCounts;
  refresh: () => Promise<void>;
  markRead: (types?: string[]) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  counts: EMPTY_COUNTS,
  refresh: async () => {},
  markRead: async () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<NotificationCounts>(EMPTY_COUNTS);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const c = await getNotificationCounts();
      setCounts(c ?? EMPTY_COUNTS);
    } catch {
      // utilisateur pas encore connecté
    }
  }, []);

  const markRead = useCallback(async (types?: string[]) => {
    try {
      await markNotificationsRead(types);
      await refresh();
    } catch {}
  }, [refresh]);

  useEffect(() => {
    void refresh();

    const channel = supabase
      .channel('notif-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => { void refresh(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, () => { void refresh(); })
      .subscribe();

    channelRef.current = channel;

    const appSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void refresh();
    });

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      appSub.remove();
    };
  }, [refresh]);

  return (
    <NotificationContext.Provider value={{ counts, refresh, markRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
