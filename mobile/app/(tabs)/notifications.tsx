/**
 * Notifications — liste complète (voir tout)
 *
 * Avant cet écran, l'accueil ne montrait que des compteurs agrégés par type et
 * renvoyait toujours vers un écran générique (calendrier ou effectif), jamais
 * vers l'info précise. Ici, chaque ligne route directement vers sa cible
 * (séance, joueur, post du fil) à partir de `data`, et se marque lue au tap.
 */

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTheme } from '../../contexts/ThemeContext';
import { useNotifications } from '../../contexts/NotificationContext';
import {
  getMyNotifications,
  markNotificationRead,
  type NotificationItem,
} from '../../lib/services/notifications';
import { Screen, Section, Card, Text, EmptyState, SkeletonStats } from '../../components/ui';

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  absence_report: 'person-remove-outline',
  injury: 'medkit-outline',
  feedback_comment: 'chatbubble-ellipses-outline',
  questionnaire_response: 'clipboard-outline',
  pain_report: 'medkit-outline',
  convocation: 'megaphone-outline',
  planning_published: 'calendar-outline',
};

const TYPE_LABEL: Record<string, string> = {
  absence_report: 'Absence',
  injury: 'Blessure',
  feedback_comment: 'Commentaire',
  questionnaire_response: 'Questionnaire',
  pain_report: 'Douleur',
  convocation: 'Convocation',
  planning_published: 'Planning',
};

function resolveTarget(item: NotificationItem): string | null {
  const data = item.data || {};
  const trainingId = data.training_id ? String(data.training_id) : null;
  const playerId = data.player_id ? String(data.player_id) : null;
  const postId = data.post_id ? String(data.post_id) : null;

  switch (item.type) {
    case 'absence_report':
    case 'injury':
    case 'convocation':
      return trainingId ? `/(tabs)/calendar/training/${trainingId}` : null;
    case 'feedback_comment':
    case 'questionnaire_response':
    case 'pain_report':
      return playerId ? `/(tabs)/squad/${playerId}` : null;
    case 'planning_published':
      return postId ? `/(tabs)/feed/${postId}` : '/(tabs)/feed';
    default:
      return null;
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const { type: typeFilter } = useLocalSearchParams<{ type?: string }>();
  const { refresh: refreshCounts } = useNotifications();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await getMyNotifications(100, 0);
      setItems(rows);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onOpen = useCallback(async (item: NotificationItem) => {
    if (!item.read_at) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)));
      markNotificationRead(item.id).catch(() => {});
      void refreshCounts();
    }
    const target = resolveTarget(item);
    if (target) router.push(target as never);
  }, [router, refreshCounts]);

  const filtered = typeFilter ? items.filter((n) => n.type === typeFilter) : items;

  if (loading) {
    return (
      <Screen>
        <SkeletonStats />
      </Screen>
    );
  }

  if (filtered.length === 0) {
    return (
      <Screen onRefresh={load} refreshing={loading}>
        <EmptyState
          icon="notifications-outline"
          title="Aucune notification"
          description={typeFilter ? "Rien de ce type pour l'instant." : 'Tu es à jour.'}
        />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <Section title={typeFilter ? TYPE_LABEL[typeFilter] ?? 'Notifications' : 'Toutes les notifications'}>
        <View style={{ gap: theme.space.sm }}>
          {filtered.map((item) => {
            const target = resolveTarget(item);
            const unread = !item.read_at;
            return (
              <Card
                key={item.id}
                variant="flat"
                padding="md"
                onPress={target ? () => onOpen(item) : undefined}
                accessibilityLabel={item.title}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.md }}
              >
                <Ionicons
                  name={TYPE_ICON[item.type] ?? 'notifications-outline'}
                  size={20}
                  color={unread ? c.warning.default : c.text.tertiary}
                  style={{ marginTop: 2 }}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="body" weight={unread ? '600' : '400'}>{item.title}</Text>
                  <Text variant="callout" tone="secondary">{item.body}</Text>
                  <Text variant="caption" tone="tertiary">
                    {format(parseISO(item.created_at), "d MMM 'à' HH:mm", { locale: fr })}
                  </Text>
                </View>
                {unread ? (
                  <View
                    style={{
                      width: 8, height: 8, borderRadius: 4,
                      backgroundColor: c.warning.default, marginTop: 6,
                    }}
                  />
                ) : null}
                {target ? (
                  <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
                ) : null}
              </Card>
            );
          })}
        </View>
      </Section>
    </Screen>
  );
}
