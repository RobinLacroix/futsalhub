/**
 * NotificationPreferencesEditor — préférences d'alerte du coach (P0-7)
 *
 * Migré sur les primitives. Corrections au passage :
 *
 * - L'interrupteur en attente était seulement `disabled`, sans aucun retour
 *   visible : sur un réseau lent, l'utilisateur ne savait pas si son geste
 *   avait été pris. Il affiche maintenant l'état en cours.
 * - Le libellé de ligne n'était pas lié à l'interrupteur pour VoiceOver, qui
 *   annonçait « interrupteur, activé » sans dire de quoi.
 */

import { useEffect, useState } from 'react';
import { View, StyleSheet, Switch } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import { haptics } from '../lib/design/haptics';
import { Card, Text, SkeletonList } from './ui';
import {
  getNotificationPreferences,
  setNotificationPreference,
  getNotificationTeamPreferences,
  setNotificationTeamPreference,
  DEFAULT_NOTIF_PREFS,
  type CoachNotifType,
  type NotificationPreferences,
  type NotificationTeamPreference,
} from '../lib/services/notifications';

const ROWS: {
  key: CoachNotifType;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: 'absence_report',
    label: 'Présence et absence',
    hint: 'Un joueur se déclare absent ou en retard.',
    icon: 'calendar-outline',
  },
  {
    key: 'injury',
    label: 'Blessure',
    hint: 'Un joueur se déclare blessé.',
    icon: 'medkit-outline',
  },
  {
    key: 'questionnaire_response',
    label: 'Réponse au questionnaire',
    hint: 'Un joueur remplit son questionnaire de séance.',
    icon: 'clipboard-outline',
  },
  {
    key: 'feedback_comment',
    label: 'Commentaire',
    hint: 'Un joueur laisse un commentaire libre.',
    icon: 'chatbubble-ellipses-outline',
  },
  {
    key: 'pain_report',
    label: 'Douleur signalée',
    hint: 'Un joueur signale une douleur.',
    icon: 'body-outline',
  },
];

export function NotificationPreferencesEditor() {
  const { theme } = useTheme();
  const c = theme.colors;
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIF_PREFS);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<CoachNotifType | null>(null);
  const [teamPrefs, setTeamPrefs] = useState<NotificationTeamPreference[]>([]);
  const [pendingTeam, setPendingTeam] = useState<string | null>(null);

  useEffect(() => {
    getNotificationPreferences()
      .then(setPrefs)
      .catch(() => setPrefs(DEFAULT_NOTIF_PREFS))
      .finally(() => setLoading(false));
    // Renvoie [] pour un non-admin : la section équipes se masque d'elle-même.
    getNotificationTeamPreferences()
      .then(setTeamPrefs)
      .catch(() => setTeamPrefs([]));
  }, []);

  const toggleTeam = async (teamId: string, value: boolean) => {
    const previous = teamPrefs;
    haptics.select();
    setTeamPrefs((rows) => rows.map((r) => (r.team_id === teamId ? { ...r, enabled: value } : r)));
    setPendingTeam(teamId);
    try {
      await setNotificationTeamPreference(teamId, value);
    } catch {
      haptics.error();
      setTeamPrefs(previous);
    } finally {
      setPendingTeam(null);
    }
  };

  const toggle = async (key: CoachNotifType, value: boolean) => {
    const previous = prefs[key];
    haptics.select();
    setPrefs((p) => ({ ...p, [key]: value }));
    setPending(key);
    try {
      await setNotificationPreference(key, value);
    } catch {
      haptics.error();
      setPrefs((p) => ({ ...p, [key]: previous })); // rollback si échec
    } finally {
      setPending(null);
    }
  };

  return (
    <>
    <Card variant="raised" padding="lg" style={{ gap: theme.space.md }}>
      <View style={styles.header}>
        <Ionicons name="notifications-outline" size={18} color={c.text.secondary} />
        <Text variant="headline">Notifications</Text>
      </View>

      <Text variant="callout" tone="secondary">
        Choisis les alertes que tu veux recevoir pour tes équipes. Couper les tiennes n'affecte
        pas les autres coachs.
      </Text>

      {loading ? (
        <SkeletonList rows={4} />
      ) : (
        ROWS.map((row, i) => (
          <View
            key={row.key}
            style={[
              styles.row,
              { gap: theme.space.md },
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border.subtle },
            ]}
          >
            <Ionicons name={row.icon} size={19} color={c.text.tertiary} style={styles.icon} />
            <View style={styles.rowText}>
              <Text variant="body" weight="600">
                {row.label}
              </Text>
              <Text variant="caption" tone="tertiary">
                {row.hint}
              </Text>
            </View>
            <Switch
              value={prefs[row.key]}
              onValueChange={(v) => toggle(row.key, v)}
              disabled={pending === row.key}
              trackColor={{ true: c.accent.fill, false: c.bg.sunken }}
              thumbColor={c.text.onFill}
              accessibilityLabel={row.label}
              accessibilityHint={row.hint}
              style={pending === row.key ? styles.pending : undefined}
            />
          </View>
        ))
      )}
    </Card>

    {teamPrefs.length > 0 && (
      <Card variant="raised" padding="lg" style={{ gap: theme.space.md }}>
        <View style={styles.header}>
          <Ionicons name="shield-checkmark-outline" size={18} color={c.text.secondary} />
          <Text variant="headline">Notifications par équipe</Text>
        </View>
        <Text variant="callout" tone="secondary">
          Coupe les notifications d'une équipe précise, quel que soit le type d'alerte.
        </Text>
        {teamPrefs.map((row, i) => (
          <View
            key={row.team_id}
            style={[
              styles.row,
              { gap: theme.space.md },
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border.subtle },
            ]}
          >
            <Text variant="body" weight="600" style={styles.rowText}>
              {row.team_name}
            </Text>
            <Switch
              value={row.enabled}
              onValueChange={(v) => toggleTeam(row.team_id, v)}
              disabled={pendingTeam === row.team_id}
              trackColor={{ true: c.accent.fill, false: c.bg.sunken }}
              thumbColor={c.text.onFill}
              accessibilityLabel={row.team_name}
              style={pendingTeam === row.team_id ? styles.pending : undefined}
            />
          </View>
        ))}
      </Card>
    )}
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  icon: { marginTop: 1 },
  rowText: { flex: 1, gap: 2 },
  pending: { opacity: 0.5 },
});
