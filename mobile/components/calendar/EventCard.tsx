/**
 * EventCard — ligne d'événement de l'agenda (P0-7)
 *
 * Extraite de `app/(tabs)/calendar/index.tsx` avant restylage.
 *
 * Trois corrections de fond :
 *
 * 1. **`opacity: 0.6` sur les événements passés supprimée.** Elle s'appliquait
 *    à toute la carte, y compris à des textes déjà en gris clair : le lieu d'un
 *    match passé tombait sous 2:1. Un événement passé se signale maintenant par
 *    une pastille d'icône neutre plutôt que par une opacité qui détruit le
 *    contraste de tout ce qu'elle couvre.
 *
 * 2. **Score en couleur sémantique.** Vert/rouge remplacés par la rampe
 *    `positive` / `negative` du thème, dont le pôle haut est en teal
 *    précisément pour rester lisible en deutéranopie.
 *
 * 3. **Émoji 📍 remplacé par une icône.** Un émoji ne suit ni la couleur du
 *    thème ni la taille du texte, et se lit « épingle ronde » à VoiceOver.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../contexts/ThemeContext';
import { Card, Text, Badge } from '../ui';
import { eventCategoryStyle, type EventCategory } from './eventCategory';
import type { Training, Match } from '../../types';

export type CalendarEvent =
  | { type: 'training'; id: string; date: string; data: Training }
  | { type: 'match'; id: string; date: string; data: Match };

export interface EventCardProps {
  event: CalendarEvent;
  onPress: () => void;
  /** Une absence non lue a été signalée sur cet entraînement. */
  hasAbsenceBadge?: boolean;
  isPast?: boolean;
}

function timeOf(iso: string): string | null {
  return iso.length > 10 && iso.includes('T') ? format(parseISO(iso), 'HH:mm') : null;
}

export function EventCard({ event, onPress, hasAbsenceBadge = false, isPast = false }: EventCardProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const cat = eventCategoryStyle(event.type as EventCategory, c);
  const glyphColor = isPast ? c.text.tertiary : cat.color;
  const time = timeOf(event.date);

  const isTraining = event.type === 'training';
  const t = isTraining ? (event.data as Training) : null;
  const m = isTraining ? null : (event.data as Match);

  const title = isTraining
    ? t!.theme
    : (m as unknown as { title?: string; opponent_team?: string }).title ||
      (m as unknown as { opponent_team?: string }).opponent_team ||
      'Match';

  const competition = isTraining
    ? null
    : (m as unknown as { competition?: string }).competition || null;

  const location = isTraining ? t!.location : m!.location;

  const hasScore = !isTraining && m!.score_team != null && m!.score_opponent != null;
  const diff = hasScore ? (m!.score_team as number) - (m!.score_opponent as number) : 0;
  const scoreTone = !hasScore ? 'secondary' : diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'secondary';

  const a11y = [
    cat.label,
    title,
    time ?? undefined,
    hasScore ? `score ${m!.score_team} à ${m!.score_opponent}` : undefined,
    hasAbsenceBadge ? 'absence signalée' : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Card
      variant="flat"
      padding="sm"
      onPress={onPress}
      accessibilityLabel={a11y}
      style={[styles.card, { gap: theme.space.md }]}
    >
      <View style={[styles.rule, { backgroundColor: glyphColor }]} />

      <View style={[styles.iconBox, { backgroundColor: c.bg.sunken, borderRadius: theme.radius.sm }]}>
        <Ionicons name={cat.icon} size={17} color={glyphColor} />
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text variant="headline" numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {time && (
            <Text variant="callout" tone="secondary" numeric>
              {time}
            </Text>
          )}
        </View>

        {hasScore ? (
          <View style={[styles.scoreRow, { gap: theme.space.sm }]}>
            <Text variant="title" tone={scoreTone} numeric>
              {m!.score_team} – {m!.score_opponent}
            </Text>
            {competition && <Badge label={competition} size="sm" />}
          </View>
        ) : isTraining && t!.key_principle ? (
          <Text variant="callout" tone="secondary" numberOfLines={1}>
            {t!.key_principle}
          </Text>
        ) : competition ? (
          <Badge label={competition} size="sm" />
        ) : null}

        {location ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={12} color={c.text.tertiary} />
            <Text variant="caption" tone="tertiary" numberOfLines={1} style={styles.title}>
              {location}
            </Text>
          </View>
        ) : null}
      </View>

      {hasAbsenceBadge && <View style={[styles.absenceDot, { backgroundColor: c.negative.default }]} />}
      <Ionicons name="chevron-forward" size={14} color={c.text.tertiary} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  rule: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  iconBox: { width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },
  body: { flex: 1, gap: 3 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1 },
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  absenceDot: { width: 8, height: 8, borderRadius: 4 },
});
