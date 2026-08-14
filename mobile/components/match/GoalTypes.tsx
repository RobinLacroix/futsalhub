/**
 * GoalTypes — répartition des buts marqués et encaissés (P0-7)
 *
 * Extrait de `matchDetail/[matchId].tsx`. Deux vues du même modèle :
 * `GoalTypesEditor` en édition, `GoalTypesSummary` en lecture.
 *
 * Correction de fond côté lecture : le résumé était une chaîne concaténée
 * (`Phase offensive 2 · CPA 1`) qu'il fallait lire mot à mot pour comparer
 * marqués et encaissés. Or c'est exactement la donnée qu'un coach compare.
 * Le résumé passe donc en tableau à deux colonnes alignées, chiffres tabulaires,
 * et signale l'écart par la rampe sémantique.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Text, Card } from '../ui';
import { Stepper } from './Stepper';
import type { GoalsByTypeRecord } from '../../types';

export const GOAL_TYPE_KEYS = ['offensive', 'transition', 'cpa', 'superiority'] as const;

export type GoalTypeKey = (typeof GOAL_TYPE_KEYS)[number];

export const GOAL_TYPE_LABELS: Record<GoalTypeKey, string> = {
  offensive: 'Phase offensive',
  transition: 'Transition',
  cpa: 'CPA',
  superiority: 'Supériorité',
};

export const emptyGoalsByType = (): GoalsByTypeRecord => ({
  offensive: 0,
  transition: 0,
  cpa: 0,
  superiority: 0,
});

// ─── Édition ──────────────────────────────────────────────────────────────────

export interface GoalTypesEditorProps {
  scored: GoalsByTypeRecord;
  conceded: GoalsByTypeRecord;
  onChange: (which: 'scored' | 'conceded', key: GoalTypeKey, delta: number) => void;
  compact?: boolean;
}

export function GoalTypesEditor({ scored, conceded, onChange, compact }: GoalTypesEditorProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <Card variant="flat" padding="sm">
      <View style={[styles.headerRow, { borderBottomColor: c.border.subtle }]}>
        <Text variant="tableHeader" tone="secondary" style={styles.colLabel}>
          TYPE
        </Text>
        <Text variant="tableHeader" tone="secondary" style={styles.colValue}>
          MARQUÉS
        </Text>
        <Text variant="tableHeader" tone="secondary" style={styles.colValue}>
          ENCAISSÉS
        </Text>
      </View>

      {GOAL_TYPE_KEYS.map((key, i) => (
        <View
          key={key}
          style={[
            styles.row,
            i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border.subtle },
          ]}
        >
          <Text variant="body" style={styles.colLabel}>
            {GOAL_TYPE_LABELS[key]}
          </Text>
          <Stepper
            value={scored[key] ?? 0}
            onChange={(d) => onChange('scored', key, d)}
            label={`buts marqués en ${GOAL_TYPE_LABELS[key]}`}
            compact={compact}
            style={styles.colValue}
          />
          <Stepper
            value={conceded[key] ?? 0}
            onChange={(d) => onChange('conceded', key, d)}
            label={`buts encaissés en ${GOAL_TYPE_LABELS[key]}`}
            compact={compact}
            style={styles.colValue}
          />
        </View>
      ))}
    </Card>
  );
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

export interface GoalTypesSummaryProps {
  scored: GoalsByTypeRecord;
  conceded: GoalsByTypeRecord;
}

export function GoalTypesSummary({ scored, conceded }: GoalTypesSummaryProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const rows = GOAL_TYPE_KEYS.filter((k) => (scored[k] ?? 0) > 0 || (conceded[k] ?? 0) > 0);
  if (rows.length === 0) return null;

  return (
    <Card variant="flat" padding="sm">
      <View style={[styles.headerRow, { borderBottomColor: c.border.subtle }]}>
        <Text variant="tableHeader" tone="secondary" style={styles.colLabel}>
          TYPE
        </Text>
        <Text variant="tableHeader" tone="secondary" style={styles.colNarrow}>
          POUR
        </Text>
        <Text variant="tableHeader" tone="secondary" style={styles.colNarrow}>
          CONTRE
        </Text>
      </View>

      {rows.map((key, i) => {
        const s = scored[key] ?? 0;
        const cd = conceded[key] ?? 0;
        return (
          <View
            key={key}
            style={[
              styles.row,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border.subtle },
            ]}
          >
            <Text variant="body" style={styles.colLabel}>
              {GOAL_TYPE_LABELS[key]}
            </Text>
            <Text
              variant="headline"
              tone={s > cd ? 'positive' : 'primary'}
              numeric
              style={styles.colNarrow}
            >
              {s}
            </Text>
            <Text
              variant="headline"
              tone={cd > s ? 'negative' : 'primary'}
              numeric
              style={styles.colNarrow}
            >
              {cd}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  colLabel: { flex: 1.6 },
  colValue: { flex: 1 },
  colNarrow: { flex: 1, textAlign: 'center' },
});
