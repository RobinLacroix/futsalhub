/**
 * Choix du match à suivre (P1-3)
 *
 * Identique dans les deux recorders, à la mise en forme près. Deux ajouts par
 * rapport aux versions précédentes :
 *
 * - **Le match du jour est mis en avant.** La liste était triée par date
 *   décroissante, donc un match programmé dans trois semaines passait devant
 *   celui de ce soir. Le coach ouvre cet écran au coup d'envoi.
 * - **Un match déjà enregistré est signalé.** Rien ne distinguait un match
 *   vierge d'un match dont le suivi avait déjà commencé : rouvrir le mauvais
 *   écrasait les temps de jeu.
 */

import { useMemo } from 'react';
import { View, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { haptics } from '../../lib/design/haptics';
import { Text, Card, EmptyState, Badge } from '../ui';
import { SkeletonList } from '../ui/Skeleton';
import type { Match } from '../../types';

export interface MatchPickerProps {
  matches: Match[];
  loading: boolean;
  onSelect: (id: string) => void;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function MatchPicker({ matches, loading, onSelect }: MatchPickerProps) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;

  const { today, others } = useMemo(() => {
    const now = dayKey(new Date());
    const sorted = [...matches].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return {
      today: sorted.filter((m) => m.date && dayKey(new Date(m.date)) === now),
      others: sorted.filter((m) => !m.date || dayKey(new Date(m.date)) !== now),
    };
  }, [matches]);

  if (loading) {
    return (
      <View style={s.list}>
        <SkeletonList rows={4} />
      </View>
    );
  }

  if (matches.length === 0) {
    return (
      <EmptyState
        icon="calendar-outline"
        title="Aucun match"
        description="Créez d'abord un match dans le calendrier pour pouvoir le suivre en direct."
      />
    );
  }

  const renderMatch = (m: Match, highlight: boolean) => {
    const played = (m.score_team ?? 0) > 0 || (m.score_opponent ?? 0) > 0;
    return (
      <Pressable
        key={m.id}
        onPress={() => {
          haptics.select();
          onSelect(m.id);
        }}
        style={({ pressed }) => [pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Suivre ${m.title || m.opponent_team || 'le match'}${
          played ? `, déjà enregistré ${m.score_team} à ${m.score_opponent}` : ''
        }`}
      >
        <Card variant={highlight ? 'raised' : 'flat'} padding="md" style={s.card}>
          <View style={s.cardMain}>
            <View style={s.titleRow}>
              <Text variant="headline" numberOfLines={1} style={s.flex}>
                {m.title || m.opponent_team || 'Match'}
              </Text>
              {played && <Badge label="Déjà saisi" tone="warning" size="sm" />}
            </View>
            <Text variant="callout" tone="secondary" numberOfLines={1}>
              {[m.competition, m.date ? new Date(m.date).toLocaleDateString('fr-FR') : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.text.tertiary} />
        </Card>
      </Pressable>
    );
  };

  return (
    <View style={s.list}>
      {today.length > 0 && (
        <>
          <Text variant="caption" tone="accent" weight="700">
            Aujourd'hui
          </Text>
          {today.map((m) => renderMatch(m, true))}
        </>
      )}
      {others.length > 0 && (
        <>
          {today.length > 0 && (
            <Text variant="caption" tone="secondary" weight="700" style={s.spacer}>
              Autres matchs
            </Text>
          )}
          {others.map((m) => renderMatch(m, false))}
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  list: { gap: t.space.sm },
  spacer: { marginTop: t.space.md },
  pressed: { opacity: 0.7 },
  card: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, minHeight: HIT_SLOP_MIN + 16 },
  cardMain: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
}));
