/**
 * Tests physiques sur la fiche joueur — restitution du lot B.
 *
 * L'écran de saisie collective (`app/(tabs)/calendar/tests/[sessionId].tsx`) est
 * en écriture ; ce bloc est la première surface qui rend la donnée lisible. Sans
 * lui, un coach saisit dix-huit joueurs et n'a rien à montrer en retour.
 *
 * ## Trois règles de lecture, toutes issues de `direction`
 *
 * 1. **La courbe garde un axe littéral** : le haut du graphique, c'est le nombre
 *    le plus grand, pas la meilleure performance. Inverser l'axe pour les tests
 *    `lower_is_better` rendrait un sprint et une détente illisibles côte à côte,
 *    et personne ne pense à regarder la graduation. Le jugement est donc porté
 *    par le TEXTE et la COULEUR (« en progrès de 0,06 s »), jamais par la pente.
 * 2. **Aucune comparaison n'est faite à la main.** `progressDelta` oriente le
 *    signe, `compareValues` tranche le verdict face au groupe. Un `after > before`
 *    écrit ici afficherait la moitié du catalogue à l'envers.
 * 3. **Un test `neutral` (poids, taille) n'est jamais coloré ni jugé.** On
 *    affiche sa variation brute et on s'arrête là. Même famille de faute que le
 *    RPE coloré comme une note.
 *
 * ## Pourquoi le repère de groupe est réservé à l'encadrement
 *
 * RLS n'ouvre les résultats d'un joueur qu'à l'encadrement et au joueur
 * lui-même. Un joueur qui appelle `getSquadRetainedResults` ne reçoit donc que
 * ses propres lignes : la « moyenne du groupe » vaudrait exactement sa propre
 * valeur, et l'écran afficherait sereinement « pile dans la moyenne » à tout le
 * monde. La requête n'est pas fausse, c'est son interprétation qui le serait —
 * d'où la garde `showSquadReference`, posée ici et pas en base.
 *
 * ## Pourquoi aucun filtre de saison
 *
 * Le reste de la fiche est cadré sur la saison active. Pas ce bloc : la
 * progression physique est une histoire pluriannuelle, et filtrer viderait la
 * courbe chaque mois d'août — exactement quand le coach fait passer ses tests de
 * reprise et veut les comparer à ceux de l'an dernier.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Text, Badge, EmptyState, SkeletonList } from '../ui';
import { LineChart } from '../charts/LineChart';
import type { FMPalette } from './fmPalette';
import {
  getPlayerResults,
  getSquadRetainedResults,
  getTestTypesByIds,
} from '../../lib/services/physicalTests';
import {
  buildPlayerSeries,
  carriesJudgement,
  compareValues,
  formatTestValue,
  formatTestValueWithUnit,
  measureKey,
  rawDelta,
  squadAverages,
  CATEGORY_LABELS,
  MIN_SQUAD_REFERENCE,
  type PlayerTestSeries,
  type SquadReference,
} from '../../lib/physicalTests';

/** Nombre de campagnes affichées sur la courbe. Au-delà, les points se collent. */
const MAX_POINTS = 8;

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

const fmtLong = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export interface PlayerTestsSectionProps {
  playerId: string;
  /** Réservé à l'encadrement : voir la note d'en-tête sur RLS. */
  showSquadReference: boolean;
  p: FMPalette;
}

export function PlayerTestsSection({ playerId, showSquadReference, p }: PlayerTestsSectionProps) {
  const [series, setSeries] = useState<PlayerTestSeries[]>([]);
  const [squad, setSquad] = useState<Map<string, SquadReference>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const rows = await getPlayerResults(playerId);
        if (cancelled) return;

        if (rows.length === 0) {
          setSeries([]);
          setSquad(new Map());
          return;
        }

        const testTypeIds = [...new Set(rows.map((r) => r.test_type_id))];
        const types = await getTestTypesByIds(testTypeIds);
        if (cancelled) return;

        const measures = rows.map((r) => ({
          session_id: r.session_id,
          test_type_id: r.test_type_id,
          value: r.value,
          date: r.session.date,
        }));
        const built = buildPlayerSeries(measures, types);
        setSeries(built);

        if (!showSquadReference) {
          setSquad(new Map());
          return;
        }

        // Le repère ne sert que sur la dernière campagne de chaque test : c'est
        // la seule affichée en grand. Charger tout l'historique de l'effectif
        // pour l'ornement d'une courbe coûterait cher pour rien.
        const latestSessionIds = [...new Set(built.map((s) => s.latest.sessionId))];
        const squadRows = await getSquadRetainedResults(latestSessionIds, testTypeIds);
        if (cancelled) return;

        setSquad(
          squadAverages(
            squadRows.map((r) => ({
              session_id: r.session_id,
              test_type_id: r.test_type_id,
              player_id: r.player_id,
              value: r.value,
              date: '', // non utilisé par `squadAverages`
            })),
            types,
          ),
        );
      } catch {
        if (!cancelled) {
          setSeries([]);
          setSquad(new Map());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playerId, showSquadReference]);

  if (loading) return <SkeletonList rows={3} />;

  if (series.length === 0) {
    return (
      <EmptyState
        icon="stopwatch-outline"
        title="Aucun test physique"
        description="Les résultats apparaissent après une campagne de tests saisie depuis une séance."
        compact
      />
    );
  }

  return (
    <View style={styles.list}>
      {series.map((s, index) => (
        <TestBlock
          key={s.type.id}
          series={s}
          reference={squad.get(measureKey(s.latest.sessionId, s.type.id)) ?? null}
          isLast={index === series.length - 1}
          p={p}
        />
      ))}
    </View>
  );
}

// ─── Un test ─────────────────────────────────────────────────────────────────

function TestBlock({
  series,
  reference,
  isLast,
  p,
}: {
  series: PlayerTestSeries;
  reference: SquadReference | null;
  isLast: boolean;
  p: FMPalette;
}) {
  const { theme } = useTheme();
  const { type, points, latest, previous, best, delta } = series;
  const judges = carriesJudgement(type.direction);

  const trend = useMemo(() => {
    if (!previous) return null;

    // Métrique neutre : on montre la variation, on ne la qualifie pas.
    if (!judges) {
      const raw = rawDelta(previous.value, latest.value);
      if (raw === 0) return { text: `stable depuis le ${fmtShort(previous.date)}`, color: p.text3 };
      const sign = raw > 0 ? '+' : '−';
      return {
        text: `${sign}${Math.abs(raw).toFixed(type.decimals)} ${type.unit} depuis le ${fmtShort(previous.date)}`,
        color: p.text3,
      };
    }

    if (delta === null || delta === 0) {
      return { text: `stable depuis le ${fmtShort(previous.date)}`, color: p.text3 };
    }

    // `progressDelta` a déjà orienté le signe : positif = a progressé, quel que
    // soit le test. Le mot est donc obligatoire, le nombre seul se lirait à
    // l'envers sur un chrono.
    const amount = `${Math.abs(delta).toFixed(type.decimals)} ${type.unit}`;
    return delta > 0
      ? { text: `en progrès de ${amount} depuis le ${fmtShort(previous.date)}`, color: p.positive }
      : { text: `en recul de ${amount} depuis le ${fmtShort(previous.date)}`, color: p.negative };
  }, [previous, latest, delta, judges, type, p]);

  const groupLine = useMemo(() => {
    if (!reference || reference.count < MIN_SQUAD_REFERENCE) return null;
    const value = `Groupe ${formatTestValueWithUnit(reference.mean, type)} · ${reference.count} joueurs`;
    if (!judges) return { text: value, color: p.text3 };

    switch (compareValues(latest.value, reference.mean, type.direction)) {
      case 'better':
        return { text: `${value} · au-dessus du groupe`, color: p.positive };
      case 'worse':
        return { text: `${value} · en dessous du groupe`, color: p.negative };
      default:
        return { text: `${value} · dans la moyenne`, color: p.text3 };
    }
  }, [reference, latest, judges, type, p]);

  const chartPoints = points.slice(-MAX_POINTS);

  const summary = [
    `${type.label} : ${formatTestValueWithUnit(latest.value, type)} le ${fmtLong(latest.date)}`,
    trend?.text,
    groupLine?.text,
    points.length > 1 ? `meilleure mesure ${formatTestValueWithUnit(best, type)}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      style={[
        styles.block,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.divider },
      ]}
      accessible
      accessibilityLabel={summary}
    >
      <View style={styles.head}>
        <Text variant="callout" weight="700" style={styles.flex} numberOfLines={1}>
          {type.label}
        </Text>
        <Badge label={CATEGORY_LABELS[type.category]} tone="neutral" size="sm" />
      </View>

      <View style={styles.valueRow}>
        <Text variant="display" color={p.text1} numeric>
          {formatTestValue(latest.value, type)}
        </Text>
        <Text variant="callout" tone="tertiary" style={styles.unit}>
          {type.unit}
        </Text>
        {trend && (
          <Text variant="caption" color={trend.color} weight="700" style={styles.trend}>
            {trend.text}
          </Text>
        )}
      </View>

      {groupLine && (
        <Text variant="caption" color={groupLine.color} weight="600">
          {groupLine.text}
        </Text>
      )}

      {chartPoints.length > 1 && (
        <View style={styles.chart}>
          <LineChart
            labels={chartPoints.map((pt) => fmtShort(pt.date))}
            series={[
              {
                key: type.id,
                label: type.label,
                color: p.accent,
                data: chartPoints.map((pt) => pt.value),
              },
            ]}
            height={110}
            /* Pas de lissage : entre deux campagnes espacées de trois mois, une
               courbe lissée dessine une trajectoire que personne n'a mesurée. */
            smooth={false}
            accessibilityLabel={summary}
          />
        </View>
      )}

      <Text variant="caption" tone="tertiary">
        {points.length} mesure{points.length > 1 ? 's' : ''} depuis le {fmtShort(points[0].date)}
        {points.length > 1 && judges
          ? ` · meilleure ${formatTestValueWithUnit(best, type)}`
          : ''}
      </Text>

      {type.protocol_note ? (
        <Text variant="caption" tone="tertiary" style={{ marginTop: theme.space.xs }}>
          {type.protocol_note}
        </Text>
      ) : null}
    </View>
  );
}

/* Valeurs prises sur l'échelle base 4 de `lib/design/tokens.ts`. */
const styles = StyleSheet.create({
  list: { gap: 4 },
  flex: { flex: 1, minWidth: 0 },
  block: { paddingVertical: 12, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  unit: { marginBottom: 4 },
  trend: { flex: 1, textAlign: 'right', marginBottom: 4 },
  chart: { marginTop: 4 },
});
