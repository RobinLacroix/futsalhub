/**
 * DefaultTeamEditor — équipe de landing par défaut (admin)
 *
 * Sans réglage, l'app retombe sur l'équipe mémorisée localement (dernière
 * consultée sur cet appareil), et à défaut sur un choix automatique (première
 * équipe encadrée). Ce composant fixe ce choix automatique plutôt que de le
 * subir — la mémorisation locale garde priorité quand elle existe déjà.
 *
 * RPC déjà en place : `get_my_default_team_id` / `set_my_default_team_id`
 * (`supabase/migrations/20260907120000_admin_default_team.sql`), écriture
 * restreinte aux admins du club côté serveur.
 */

import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import { Card, Text, ChipGroup, SkeletonList } from './ui';
import { getMyDefaultTeamId, setMyDefaultTeamId } from '../lib/services/teams';
import type { Team } from '../types';

const AUTO = '';

export function DefaultTeamEditor({ teams }: { teams: Team[] }) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [selected, setSelected] = useState<string>(AUTO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'positive' | 'negative'; text: string } | null>(
    null
  );

  useEffect(() => {
    getMyDefaultTeamId()
      .then((id) => setSelected(id ?? AUTO))
      .catch(() => setSelected(AUTO))
      .finally(() => setLoading(false));
  }, []);

  const options = [
    { value: AUTO, label: 'Automatique' },
    ...teams.map((t) => ({ value: t.id, label: t.name })),
  ];

  const save = async (teamId: string) => {
    const previous = selected;
    setSelected(teamId);
    setSaving(true);
    setFeedback(null);
    try {
      await setMyDefaultTeamId(teamId || null);
      setFeedback({
        tone: 'positive',
        text: teamId ? 'Équipe par défaut enregistrée.' : 'Retour au choix automatique.',
      });
    } catch {
      setSelected(previous);
      setFeedback({ tone: 'negative', text: "Échec de l'enregistrement." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="raised" padding="lg" style={{ gap: theme.space.md }}>
      <View style={styles.header}>
        <Ionicons name="home-outline" size={18} color={c.text.secondary} />
        <Text variant="headline" style={styles.flex}>
          Équipe par défaut à l&apos;ouverture
        </Text>
      </View>

      <Text variant="callout" tone="secondary">
        Équipe sur laquelle tu atterris quand l&apos;app ouvre sans équipe déjà mémorisée sur cet
        appareil (première connexion, nouvel appareil, cache vidé). Le reste du temps, l&apos;app
        rouvre là où tu l&apos;as laissée.
      </Text>

      {loading ? (
        <SkeletonList rows={1} />
      ) : (
        <>
          <ChipGroup
            label="Équipe par défaut"
            options={options}
            value={selected}
            onChange={save}
          />

          {feedback && (
            <View style={[styles.feedback, { gap: theme.space.sm }]}>
              <Ionicons
                name={feedback.tone === 'positive' ? 'checkmark-circle' : 'alert-circle'}
                size={15}
                color={feedback.tone === 'positive' ? c.positive.default : c.negative.default}
              />
              <Text variant="callout" tone={feedback.tone} style={styles.flex}>
                {feedback.text}
              </Text>
            </View>
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  feedback: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
});
