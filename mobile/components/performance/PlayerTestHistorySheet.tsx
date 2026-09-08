/**
 * Historique d'un joueur sur UN test — feuille ouverte depuis une cellule de
 * `TestOverviewSection`.
 *
 * Volontairement un seul test à la fois : la matrice montre déjà tout
 * l'effectif sur une catégorie, cette feuille répond à la question suivante,
 * « et lui, sur ce test précis, il progresse comment ? ». Mélanger plusieurs
 * tests ici referait la fiche joueur (`PlayerTestsSection.tsx`) en plus petit.
 *
 * Même calcul que `PlayerTestsSection.tsx` (tendance, `direction`),
 * présentation différente — c'est la palette qui diverge (thème de cet écran
 * vs palette FM de la fiche joueur), pas la logique : tout passe par
 * `progressDelta`/`carriesJudgement`, jamais une comparaison à la main.
 *
 * Courbe non plafonnée, volontairement, contrairement à `PlayerTestsSection`
 * (`MAX_POINTS = 8`) : cette feuille montre UN test à la fois, donc la densité
 * qui justifiait la limite là-bas (plusieurs courbes empilées sur un même
 * écran) ne s'applique pas ici. Demandé explicitement (2026-08) : tout
 * l'historique. `LineChart` espace déjà ses étiquettes d'axe tout seul
 * (`labelledIndexes`), donc rien à plafonner côté axe non plus.
 */

import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Text, Sheet, EmptyState } from '../ui';
import { LineChart } from '../charts/LineChart';
import {
  carriesJudgement,
  formatTestValue,
  formatTestValueWithUnit,
  progressDelta,
  rawDelta,
  testSecondaryReading,
  type PlayerTestSeries,
} from '../../lib/physicalTests';

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

const fmtLong = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export interface PlayerTestHistorySheetProps {
  visible: boolean;
  onClose: () => void;
  playerName: string;
  series: PlayerTestSeries | null;
}

export function PlayerTestHistorySheet({
  visible,
  onClose,
  playerName,
  series,
}: PlayerTestHistorySheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={playerName} subtitle={series?.type.label}>
      {!series ? (
        <EmptyState icon="stopwatch-outline" title="Aucune mesure disponible" compact />
      ) : (
        <HistoryBody series={series} />
      )}
    </Sheet>
  );
}

function HistoryBody({ series }: { series: PlayerTestSeries }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { type, points, latest, previous, best, delta } = series;
  const judges = carriesJudgement(type.direction);
  const secondary = testSecondaryReading(type, latest.value);

  const trend = (() => {
    if (!previous) return null;
    if (!judges) {
      const raw = rawDelta(previous.value, latest.value);
      if (raw === 0) return { text: `stable depuis le ${fmtShort(previous.date)}`, tone: 'tertiary' as const };
      const sign = raw > 0 ? '+' : '−';
      return {
        text: `${sign}${Math.abs(raw).toFixed(type.decimals)} ${type.unit} depuis le ${fmtShort(previous.date)}`,
        tone: 'tertiary' as const,
      };
    }
    if (delta === null || delta === 0) {
      return { text: `stable depuis le ${fmtShort(previous.date)}`, tone: 'tertiary' as const };
    }
    const amount = `${Math.abs(delta).toFixed(type.decimals)} ${type.unit}`;
    return delta > 0
      ? { text: `en progrès de ${amount} depuis le ${fmtShort(previous.date)}`, tone: 'positive' as const }
      : { text: `en recul de ${amount} depuis le ${fmtShort(previous.date)}`, tone: 'negative' as const };
  })();

  return (
    <View style={{ gap: theme.space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
        <Text variant="display" numeric>
          {formatTestValue(latest.value, type)}
        </Text>
        <Text variant="callout" tone="tertiary" style={{ marginBottom: 4 }}>
          {type.unit}
        </Text>
        {secondary && (
          <Text variant="callout" tone="tertiary" style={{ marginBottom: 4 }}>
            ({formatTestValue(secondary.value, { decimals: 1 })} {secondary.unit})
          </Text>
        )}
      </View>
      {trend && (
        <Text variant="caption" tone={trend.tone} weight="700">
          {trend.text}
        </Text>
      )}
      <Text variant="caption" tone="tertiary">
        le {fmtLong(latest.date)} · {points.length} mesure{points.length > 1 ? 's' : ''}
        {points.length > 1 && judges ? ` · meilleure ${formatTestValueWithUnit(best, type)}` : ''}
      </Text>

      {points.length > 1 && (
        <LineChart
          labels={points.map((pt) => fmtShort(pt.date))}
          series={[
            {
              key: type.id,
              label: type.label,
              color: c.accent.default,
              data: points.map((pt) => pt.value),
            },
          ]}
          height={140}
          smooth={false}
          accessibilityLabel={`Historique de ${type.label}`}
        />
      )}

      {type.protocol_note ? (
        <Text variant="caption" tone="tertiary">
          {type.protocol_note}
        </Text>
      ) : null}
    </View>
  );
}
