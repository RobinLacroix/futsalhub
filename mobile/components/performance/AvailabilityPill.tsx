/**
 * Pastille de disponibilité, posée en ligne dans une liste de convocation.
 *
 * ## Elle ne s'affiche PAS pour un joueur disponible
 *
 * C'est la décision qui fait tenir le composant. Sur un effectif de dix-huit,
 * dix-huit pastilles vertes n'apprennent rien et repoussent le nom du joueur ;
 * deux pastilles ambre se lisent d'un coup d'oeil. Une information qui apparaît
 * partout cesse d'être une information.
 *
 * `amenage` s'affiche quand même, alors que le joueur est apte : le coach doit
 * savoir qu'il vient avec une charge adaptée, même si rien ne l'empêche de le
 * convoquer.
 */

import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui';
import {
  AVAILABILITY_META,
  returnLabel,
  type AvailabilityRow,
  type AvailabilityStatus,
  type AvailabilityTone,
} from '../../lib/availability';
import type { ThemeColors } from '../../lib/design/tokens';

/**
 * `injury` prend la teinte de `sessionColor('injured')` et non `negative` :
 * `components/training/attendance.ts` a tranché, un joueur blessé est « une
 * information à traiter et non une erreur ». Seule la suspension est en rouge.
 */
export function availabilityColor(tone: AvailabilityTone, c: ThemeColors): string {
  switch (tone) {
    case 'positive':
      return c.positive.default;
    case 'warning':
      return c.warning.default;
    case 'injury':
      return c.chartSeries[5] ?? c.warning.default;
    case 'negative':
      return c.negative.default;
    default:
      return c.neutralData;
  }
}

export interface AvailabilityPillProps {
  status: AvailabilityStatus;
  /** Ligne complète, pour annoncer l'échéance à VoiceOver. */
  row?: AvailabilityRow | null;
  /** Ajoute l'échéance de retour sous le libellé. Pour les listes aérées. */
  showReturn?: boolean;
}

export function AvailabilityPill({ status, row = null, showReturn = false }: AvailabilityPillProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  if (status === 'disponible') return null;

  const meta = AVAILABILITY_META[status];
  const color = availabilityColor(meta.tone, c);

  return (
    <View
      accessible
      accessibilityLabel={
        row ? `${meta.label}. ${returnLabel(row)}` : meta.label
      }
      style={{ alignItems: 'flex-end', gap: 2 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.xs,
          paddingHorizontal: theme.space.sm,
          paddingVertical: 2,
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          borderColor: color,
        }}
      >
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
        <Text variant="caption" color={color} weight="700">
          {meta.label}
        </Text>
      </View>
      {showReturn && row?.expected_return_date ? (
        <Text variant="caption" tone="tertiary">
          {returnLabel(row)}
        </Text>
      ) : null}
    </View>
  );
}
