/**
 * MonthGrid — panneau mois du calendrier (P0-7)
 *
 * Extrait de `app/(tabs)/calendar/index.tsx` (873 lignes) avant restylage,
 * conformément à la règle du repo : décomposer d'abord, restyler ensuite.
 *
 * Deux corrections de fond au passage :
 *
 * 1. **Sélection lisible.** Trois états se disputaient la même pastille de
 *    26 pt avec quatre bleus différents (`#2563eb`, `#1e3a5f`, `#1d4ed8`,
 *    `#93c5fd`) : impossible de dire au premier coup d'œil si un jour était
 *    « aujourd'hui », « sélectionné », ou les deux. Convention iOS reprise
 *    ici : aujourd'hui = anneau, sélectionné = aplat, les deux = aplat + anneau.
 *
 * 2. **Cible tactile.** Les cellules faisaient 44 pt de haut mais la zone
 *    réellement pressable suivait la pastille. Toute la cellule est tactile,
 *    et chaque jour annonce son contenu à VoiceOver.
 */

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isToday as fnsIsToday,
  format,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTheme } from '../../contexts/ThemeContext';
import { Text, IconButton } from '../ui';
import { eventCategoryStyle } from './eventCategory';

export interface DayEvents {
  training: boolean;
  match: boolean;
}

export interface MonthGridProps {
  month: Date;
  selectedDay: string | null;
  /** dateKey `yyyy-MM-dd` → présence d'un entraînement / d'un match ce jour-là. */
  eventsByDate: Record<string, DayEvents>;
  onSelectDay: (dateKey: string) => void;
  onChangeMonth: (next: Date) => void;
  /** Retour au mois courant, filtre remis à zéro. */
  onToday: () => void;
  compact?: boolean;
}

const WEEK_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAY_CIRCLE = 30;

export function buildMonthGrid(month: Date): (Date | null)[][] {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7).map((d) => (isSameMonth(d, month) ? d : null)));
  }
  return weeks;
}

export function MonthGrid({
  month,
  selectedDay,
  eventsByDate,
  onSelectDay,
  onChangeMonth,
  onToday,
  compact = false,
}: MonthGridProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const weeks = React.useMemo(() => buildMonthGrid(month), [month]);
  const trainingStyle = eventCategoryStyle('training', c);
  const matchStyle = eventCategoryStyle('match', c);

  const monthLabel = React.useMemo(() => {
    const raw = format(month, 'MMMM yyyy', { locale: fr });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [month]);

  const shift = (delta: number) => {
    const next = new Date(month);
    next.setMonth(next.getMonth() + delta);
    onChangeMonth(startOfMonth(next));
  };

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: c.bg.surface,
          paddingHorizontal: compact ? theme.space.xl : theme.space.md,
          paddingBottom: theme.space.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: c.border.subtle,
        },
      ]}
    >
      <View style={styles.monthNav}>
        <IconButton icon="chevron-back" label="Mois précédent" onPress={() => shift(-1)} size="sm" />
        <Pressable
          onPress={onToday}
          accessibilityRole="button"
          accessibilityLabel={`${monthLabel}. Revenir au mois courant`}
          style={styles.monthLabelBtn}
        >
          <Text variant="title">{monthLabel}</Text>
        </Pressable>
        <IconButton icon="chevron-forward" label="Mois suivant" onPress={() => shift(1)} size="sm" />
      </View>

      <View style={styles.weekRow}>
        {WEEK_LABELS.map((d, i) => (
          <Text
            key={i}
            variant="caption"
            tone={i >= 5 ? 'tertiary' : 'secondary'}
            style={styles.weekLabel}
          >
            {d}
          </Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.gridRow}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={styles.cell} />;

            const dk = format(day, 'yyyy-MM-dd');
            const isSelected = selectedDay === dk;
            const isToday = fnsIsToday(day);
            const dots = eventsByDate[dk];
            const isWeekend = di >= 5;

            // Aplat quand sélectionné, anneau quand c'est aujourd'hui. Les deux
            // se cumulent sans se masquer, contrairement aux 4 bleus d'avant.
            const circleStyle = {
              backgroundColor: isSelected ? c.accent.fill : 'transparent',
              borderWidth: isToday ? 2 : 0,
              borderColor: isToday ? c.accent.default : 'transparent',
            };
            const numberTone = isSelected
              ? 'onFill'
              : isToday
                ? 'accent'
                : isWeekend
                  ? 'tertiary'
                  : 'primary';

            const parts: string[] = [];
            if (dots?.training) parts.push('entraînement');
            if (dots?.match) parts.push('match');

            return (
              <Pressable
                key={di}
                onPress={() => onSelectDay(dk)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={
                  format(day, 'EEEE d MMMM', { locale: fr }) +
                  (parts.length ? `, ${parts.join(' et ')}` : ', aucun événement')
                }
                style={({ pressed }) => [styles.cell, pressed && { opacity: 0.5 }]}
              >
                <View style={[styles.dayCircle, circleStyle]}>
                  <Text variant="caption" tone={numberTone} weight="600" numeric>
                    {format(day, 'd')}
                  </Text>
                </View>
                <View style={styles.dots}>
                  {dots?.training && (
                    <View style={[styles.dot, { backgroundColor: trainingStyle.color }]} />
                  )}
                  {dots?.match && (
                    <View style={[styles.dot, { backgroundColor: matchStyle.color }]} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={[styles.legend, { borderTopColor: c.border.subtle, gap: theme.space.lg }]}>
        {[trainingStyle, matchStyle].map((cat) => (
          <View key={cat.label} style={styles.legendItem}>
            <Ionicons name={cat.icon} size={12} color={cat.color} />
            <Text variant="caption" tone="secondary">
              {cat.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {},
  monthNav: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  monthLabelBtn: { flex: 1, alignItems: 'center' },
  weekRow: { flexDirection: 'row', marginBottom: 2 },
  weekLabel: { flex: 1, textAlign: 'center', paddingBottom: 4 },
  gridRow: { flexDirection: 'row' },
  cell: { flex: 1, height: 48, alignItems: 'center', paddingTop: 2 },
  dayCircle: {
    width: DAY_CIRCLE,
    height: DAY_CIRCLE,
    borderRadius: DAY_CIRCLE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
