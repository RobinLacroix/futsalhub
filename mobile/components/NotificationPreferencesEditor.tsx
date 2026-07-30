import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  getNotificationPreferences,
  setNotificationPreference,
  DEFAULT_NOTIF_PREFS,
  type CoachNotifType,
  type NotificationPreferences,
} from '../lib/services/notifications';

const ROWS: { key: CoachNotifType; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'absence_report',         label: 'Présence / absence',      hint: 'Un joueur se déclare absent ou en retard.', icon: 'calendar-outline' },
  { key: 'injury',                 label: 'Blessure',                hint: 'Un joueur se déclare blessé.',              icon: 'medkit-outline' },
  { key: 'questionnaire_response', label: 'Réponse au questionnaire', hint: 'Un joueur remplit son questionnaire de séance.', icon: 'clipboard-outline' },
  { key: 'feedback_comment',       label: 'Commentaire',             hint: 'Un joueur laisse un commentaire libre.',    icon: 'chatbubble-ellipses-outline' },
];

export function NotificationPreferencesEditor() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIF_PREFS);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<CoachNotifType | null>(null);

  useEffect(() => {
    getNotificationPreferences()
      .then(setPrefs)
      .catch(() => setPrefs(DEFAULT_NOTIF_PREFS))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (key: CoachNotifType, value: boolean) => {
    const previous = prefs[key];
    setPrefs((p) => ({ ...p, [key]: value }));
    setPending(key);
    try {
      await setNotificationPreference(key, value);
    } catch {
      setPrefs((p) => ({ ...p, [key]: previous })); // rollback si échec
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.accent} />
        <Ionicons name="notifications-outline" size={18} color="#0ea5e9" />
        <Text style={styles.cardTitle}>Notifications</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.intro}>
          Choisis les alertes que tu veux recevoir pour tes équipes. Coupe celles qui te
          surchargent, sans impacter les autres coachs.
        </Text>
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 16 }} color="#0ea5e9" />
        ) : (
          ROWS.map((row, idx) => (
            <View key={row.key} style={[styles.row, idx === ROWS.length - 1 && styles.rowLast]}>
              <Ionicons name={row.icon} size={18} color="#64748b" style={{ marginTop: 2 }} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowHint}>{row.hint}</Text>
              </View>
              <Switch
                value={prefs[row.key]}
                onValueChange={(v) => toggle(row.key, v)}
                disabled={pending === row.key}
                trackColor={{ true: '#0ea5e9', false: '#cbd5e1' }}
              />
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  accent: { width: 4, height: 20, borderRadius: 3, backgroundColor: '#0ea5e9' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  cardBody: { padding: 16 },
  intro: { fontSize: 13, color: '#64748b', lineHeight: 18, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  rowHint: { fontSize: 12, color: '#94a3b8', lineHeight: 16, marginTop: 2 },
});
