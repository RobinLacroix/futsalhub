/**
 * Matrice individuelle de charge — joueurs × dernières séances, section mobile.
 *
 * Jumelle web : `app/webapp/manager/performance/components/LoadMatrixPanel.tsx`.
 *
 * Colonne joueur fixe à gauche, séances défilantes à droite : deux `View`
 * empilées côte à côte plutôt qu'un vrai tableau avec colonne collante (RN n'a
 * pas d'équivalent CSS `position: sticky` simple ici) — les deux parties
 * partagent les mêmes hauteurs de ligne fixes (`HEADER_H`, `ROW_H`) donc
 * restent alignées sans synchronisation de scroll.
 *
 * Voir l'en-tête du jumeau web pour les trois états de case (absent/repos,
 * convoqué sans réponse, donnée) et pourquoi le RPE se colore ici (écran
 * staff uniquement, jamais vu par le joueur qui répond).
 */

import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Text, Card, ChipGroup, EmptyState, type ChipOption } from '../ui';
import {
  MATRIX_METRIC_LABELS,
  buildPlayerMatrix,
  formatDelta,
  rpeAbsoluteBand,
  teamAverageRow,
  type MatrixCell,
  type MatrixMetric,
  type MatrixRow,
  type RpeAbsoluteBand,
} from '../../lib/trainingLoad';
import type { ThemeColors } from '../../lib/design/tokens';

export interface LoadMatrixSectionProps {
  rows: MatrixRow[];
  /** Bascule vers la vue individuelle de ce joueur au tap sur son nom. */
  onSelectPlayer?: (playerId: string) => void;
}

const METRIC_CHIPS: readonly ChipOption<MatrixMetric>[] = (
  ['rpe', 'physical_form', 'pleasure', 'auto_evaluation'] as const
).map((value) => ({ value, label: MATRIX_METRIC_LABELS[value] }));

const NAME_WIDTH = 100;
/** Plancher sous lequel une colonne ne rétrécit plus — le tableau défile à la place. */
const MIN_CELL_WIDTH = 52;
const HEADER_H = 34;
const ROW_H = 44;

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/** Verte/ambre/rouge : mêmes tons que `wellnessBand` dans `LoadSection`, métriques de jugement uniquement. */
function judgementColor(value: number, c: ThemeColors): string {
  if (value >= 7) return c.positive.default;
  if (value >= 5) return c.warning.default;
  return c.negative.default;
}

/** Couleurs de `rpeAbsoluteBand` : mêmes tons que la heatmap de `TeamDashboardView` (`metricColor`). */
function rpeAbsoluteColor(band: RpeAbsoluteBand, c: ThemeColors): string {
  if (band === 'faible') return c.accent.default;
  if (band === 'optimal') return c.positive.default;
  if (band === 'eleve') return c.warning.default;
  return c.negative.default;
}

const RPE_LEGEND: readonly { label: string; band: RpeAbsoluteBand }[] = [
  { label: '<4 Faible', band: 'faible' },
  { label: '4-7 Optimal', band: 'optimal' },
  { label: '>7 Élevé', band: 'eleve' },
  { label: '>8.5 Surm.', band: 'surmenage' },
];

export function LoadMatrixSection({ rows, onSelectPlayer }: LoadMatrixSectionProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [metric, setMetric] = useState<MatrixMetric>('rpe');
  const matrix = useMemo(() => buildPlayerMatrix(rows, metric), [rows, metric]);
  const team = useMemo(() => (matrix.sessions.length > 0 ? teamAverageRow(matrix, metric) : null), [matrix, metric]);

  // Sur un écran large (iPad), des colonnes figées à 52px laissent le tableau
  // flotter à gauche avec du vide à droite. On mesure la largeur réellement
  // disponible et on étale les colonnes dedans ; sous le plancher, le
  // `ScrollView` horizontal reprend la main comme sur téléphone.
  const [containerWidth, setContainerWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width);
  const columnCount = matrix.sessions.length + 1;
  const cellWidth =
    containerWidth > 0
      ? Math.max(MIN_CELL_WIDTH, (containerWidth - NAME_WIDTH) / columnCount)
      : MIN_CELL_WIDTH;

  if (matrix.sessions.length === 0) {
    return (
      <EmptyState
        icon="grid-outline"
        title="Aucune séance récente"
        description="La matrice se peuple avec les 5 dernières séances de l'équipe."
        compact
      />
    );
  }

  return (
    <View style={{ gap: theme.space.sm }}>
      <ChipGroup label="Indicateur" options={METRIC_CHIPS} value={metric} onChange={setMetric} />

      <Card variant="raised" padding="sm" style={{ flexDirection: 'row' }} onLayout={onLayout}>
        {/* ── Colonne fixe : joueurs ────────────────────────────────────── */}
        <View style={{ width: NAME_WIDTH }}>
          <View style={{ height: HEADER_H }} />
          {matrix.players.map((player) => (
            <Pressable
              key={player.player_id}
              onPress={onSelectPlayer ? () => onSelectPlayer(player.player_id) : undefined}
              style={{ height: ROW_H, justifyContent: 'center' }}
              accessibilityLabel={
                onSelectPlayer
                  ? `Voir la charge individuelle de ${player.first_name} ${player.last_name}`
                  : undefined
              }
            >
              <Text
                variant="caption"
                weight="600"
                numberOfLines={1}
                style={onSelectPlayer ? { textDecorationLine: 'underline' } : undefined}
              >
                {player.first_name} {player.last_name}
              </Text>
            </Pressable>
          ))}
          {team && (
            <View
              style={{
                height: ROW_H,
                justifyContent: 'center',
                borderTopWidth: 1,
                borderTopColor: c.border.subtle,
              }}
            >
              <Text variant="caption" weight="700" numberOfLines={1}>
                Moyenne équipe
              </Text>
            </View>
          )}
        </View>

        {/* ── Partie défilante : séances + moyenne ─────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={{ flexDirection: 'row', height: HEADER_H }}>
              {matrix.sessions.map((session) => (
                <View key={session.training_id} style={{ width: cellWidth, alignItems: 'center' }}>
                  <Text variant="caption" tone="tertiary" numberOfLines={1}>
                    {shortDate(session.session_date)}
                  </Text>
                  {metric === 'rpe' && session.target_rpe_min !== null && session.target_rpe_max !== null && (
                    <Text variant="caption" tone="tertiary" style={{ fontSize: 9 }} numberOfLines={1}>
                      cible {session.target_rpe_min}-{session.target_rpe_max}
                    </Text>
                  )}
                </View>
              ))}
              <View
                style={{
                  width: cellWidth,
                  alignItems: 'center',
                  borderLeftWidth: 1,
                  borderLeftColor: c.border.subtle,
                }}
              >
                <Text variant="caption" weight="600" numberOfLines={1}>
                  Moy.
                </Text>
              </View>
            </View>

            {matrix.players.map((player) => (
              <View key={player.player_id} style={{ flexDirection: 'row', height: ROW_H }}>
                {player.cells.map((cell, i) => (
                  <View key={matrix.sessions[i].training_id} style={{ width: cellWidth, alignItems: 'center', justifyContent: 'center' }}>
                    <MatrixCellView cell={cell} metric={metric} digits={0} c={c} />
                  </View>
                ))}
                <View
                  style={{
                    width: cellWidth,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderLeftWidth: 1,
                    borderLeftColor: c.border.subtle,
                  }}
                >
                  <MatrixCellView cell={player.average} metric={metric} digits={1} c={c} />
                </View>
              </View>
            ))}

            {team && (
              <View
                style={{
                  flexDirection: 'row',
                  height: ROW_H,
                  borderTopWidth: 1,
                  borderTopColor: c.border.subtle,
                }}
              >
                {team.cells.map((cell, i) => (
                  <View key={matrix.sessions[i].training_id} style={{ width: cellWidth, alignItems: 'center', justifyContent: 'center' }}>
                    <MatrixCellView cell={cell} metric={metric} digits={0} c={c} />
                  </View>
                ))}
                <View
                  style={{
                    width: cellWidth,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderLeftWidth: 1,
                    borderLeftColor: c.border.subtle,
                  }}
                >
                  <MatrixCellView cell={team.average} metric={metric} digits={1} c={c} />
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(metric === 'rpe'
          ? RPE_LEGEND.map((l) => ({ label: l.label, color: rpeAbsoluteColor(l.band, c) }))
          : [
              { label: '≥7 Bien', color: c.positive.default },
              { label: '5-6 Moyen', color: c.warning.default },
              { label: '<5 Alerte', color: c.negative.default },
              { label: 'N/A', color: c.text.tertiary },
            ]
        ).map((l) => (
          <View
            key={l.label}
            style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: `${l.color}1a` }}
          >
            <Text variant="caption" weight="600" style={{ color: l.color, fontSize: 10 }}>
              {l.label}
            </Text>
          </View>
        ))}
      </View>

      <Text variant="caption" tone="tertiary">
        Case grise = absent ou repos. Case claire avec un tiret = convoqué mais questionnaire non
        répondu.{metric === 'rpe' ? ' Le petit chiffre est l’écart au RPE cible de la séance.' : ''}
      </Text>
    </View>
  );
}

function MatrixCellView({
  cell,
  metric,
  digits,
  c,
}: {
  cell: MatrixCell;
  metric: MatrixMetric;
  digits: number;
  c: ThemeColors;
}) {
  const boxStyle = {
    width: 40,
    height: 32,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  if (!cell.convoked) {
    return <View style={[boxStyle, { backgroundColor: c.bg.sunken }]} accessibilityLabel="Absent ou repos" />;
  }

  if (cell.value === null) {
    return (
      <View style={boxStyle} accessibilityLabel="Convoqué, questionnaire non répondu">
        <Text variant="caption" tone="tertiary">
          —
        </Text>
      </View>
    );
  }

  if (metric === 'rpe') {
    const color = rpeAbsoluteColor(rpeAbsoluteBand(cell.value), c);
    return (
      <View style={[boxStyle, { backgroundColor: `${color}26` }]}>
        <Text variant="caption" weight="700" style={{ color, fontSize: 15, lineHeight: 17 }} numeric>
          {digits === 1 ? cell.value.toFixed(1) : cell.value}
        </Text>
        {cell.delta !== null && (
          <Text variant="caption" tone="tertiary" style={{ fontSize: 9, lineHeight: 11 }} numeric>
            {formatDelta(cell.delta, digits === 1 ? 1 : 0)}
          </Text>
        )}
      </View>
    );
  }

  const color = judgementColor(cell.value, c);
  return (
    <View style={[boxStyle, { backgroundColor: `${color}1a` }]}>
      <Text variant="caption" weight="700" style={{ color }} numeric>
        {digits === 1 ? cell.value.toFixed(1) : cell.value}
      </Text>
    </View>
  );
}
