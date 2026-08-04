/**
 * PlayerCharts — radar, courbe de note, courbe de questionnaire (P0-7)
 *
 * Extraits de `PlayerDetailView.tsx` (1 330 lignes) avant restylage, selon la
 * règle du repo : décomposer d'abord. Les trois graphiques sont de la pure
 * présentation, ils n'avaient aucune raison de vivre dans l'écran.
 *
 * Corrections apportées au passage :
 *
 * - **Toutes les teintes viennent du thème.** Les grilles étaient tracées en
 *   `rgba(26,39,68,0.06)`, une valeur calculée pour un fond clair : sur canvas
 *   anthracite, les lignes de grille disparaissaient purement et simplement.
 * - **Le radar avait des libellés d'axe à 9 px et des valeurs de grille à 8 px**,
 *   très en dessous du plancher de lisibilité. Remontés à 11 et 12.
 * - **Le radar n'était pas annonçable.** Les axes tactiles étaient des `Circle`
 *   SVG transparents sans rôle ni libellé : VoiceOver ne voyait rien du tout.
 *   Un résumé textuel accessible double désormais le graphique.
 * - La courbe de note utilisait cinq teintes en dur (`#059669`, `#16a34a`,
 *   `#6b7280`, `#f97316`, `#dc2626`) : une échelle rouge-vert continue, donc
 *   illisible en deutéranopie. Elle passe sur la rampe sémantique à trois pôles.
 */

import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText, Path } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { useIsTablet } from '../../hooks/useIsTablet';
import { Text } from '../ui';
import { fmPalette, type FMPalette } from './fmPalette';
// Tracé et étiquetage partagés avec `components/charts/LineChart` : ces deux
// aides étaient dupliquées, une troisième copie serait née avec le graphique suivant.
import { smoothPath, labelledIndexes } from '../charts/LineChart';
import type { PlayerRadarResult, RadarPerMatchStats } from '../../lib/services/players';
import type { PlayerFeedbackRow } from '../../lib/services/feedback';

// ─── Axes du radar ────────────────────────────────────────────────────────────

type RadarNormKey = keyof PlayerRadarResult['normalized'];

export interface RadarAxis {
  normKey: RadarNormKey;
  rawKey: keyof RadarPerMatchStats;
  label: string;
  fullLabel: string;
  gridLabel: string;
}

export const FIELD_AXES: readonly RadarAxis[] = [
  { normKey: 'avgPlaytime', rawKey: 'avgPlaytimeSec', label: 'Tps/m', fullLabel: 'Temps/match', gridLabel: 'Tps/match' },
  { normKey: 'goalsPerMatch', rawKey: 'goalsPerMatch', label: 'Buts/m', fullLabel: 'Buts/match', gridLabel: 'Buts' },
  { normKey: 'shotsOnTargetPerMatch', rawKey: 'shotsOnTargetPerMatch', label: 'T.cad/m', fullLabel: 'Tirs cadrés/match', gridLabel: 'T.cadrés' },
  { normKey: 'totalShotsPerMatch', rawKey: 'totalShotsPerMatch', label: 'T.tot/m', fullLabel: 'Tirs totaux/match', gridLabel: 'T.totaux' },
  { normKey: 'assistsPerMatch', rawKey: 'assistsPerMatch', label: 'Pdéc/m', fullLabel: 'Passes déc./match', gridLabel: 'Passes déc.' },
  { normKey: 'recoveriesPerMatch', rawKey: 'recoveriesPerMatch', label: 'Récup/m', fullLabel: 'Récup./match', gridLabel: 'Récup.' },
  { normKey: 'ballLossPerMatch', rawKey: 'ballLossPerMatch', label: 'Pertes/m', fullLabel: 'Pertes/match', gridLabel: 'Pertes' },
  { normKey: 'plusMinus', rawKey: 'plusMinus', label: '+/-', fullLabel: '+/- saison', gridLabel: '+/-' },
];

export const GK_AXES: readonly RadarAxis[] = [
  { normKey: 'avgPlaytime', rawKey: 'avgPlaytimeSec', label: 'Min/m', fullLabel: 'Minutes/match', gridLabel: 'Tps/match' },
  { normKey: 'savesPerMatch', rawKey: 'savesPerMatch', label: 'Arrêts/m', fullLabel: 'Arrêts/match', gridLabel: 'Arrêts' },
  { normKey: 'savePercentage', rawKey: 'savePercentage', label: '% Arrêts', fullLabel: '% Arrêts saison', gridLabel: '% Arrêts' },
  { normKey: 'recoveriesPerMatch', rawKey: 'recoveriesPerMatch', label: 'Récup/m', fullLabel: 'Récup./match', gridLabel: 'Récup.' },
  { normKey: 'goalsConcededPerMatch', rawKey: 'goalsConcededPerMatch', label: 'Buts enc/m', fullLabel: 'Buts encaissés/match', gridLabel: 'Buts enc.' },
];

// ─── Formatage ────────────────────────────────────────────────────────────────

function fmtTimeSec(sec: number): string {
  const min = Math.round(sec / 60);
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h${m}` : `${h}h`;
  }
  return `${min}min`;
}

function fmtPerMatch(val: number): string {
  if (val === 0) return '0';
  if (val >= 10) return Math.round(val).toString();
  if (val >= 1) return val.toFixed(1);
  return val.toFixed(2);
}

export function fmtAxisValue(val: number, rawKey: keyof RadarPerMatchStats): string {
  if (rawKey === 'avgPlaytimeSec') return fmtTimeSec(val);
  if (rawKey === 'plusMinus') {
    const r = Math.round(val);
    return r >= 0 ? `+${r}` : String(r);
  }
  if (rawKey === 'savePercentage') return `${Math.round(val)}%`;
  return fmtPerMatch(val);
}

function radarGridTotal(data: PlayerRadarResult, rawKey: keyof RadarPerMatchStats): string {
  const raw = data.raw;
  switch (rawKey) {
    case 'avgPlaytimeSec':
      return fmtTimeSec(raw.avgPlaytimeSec);
    case 'plusMinus':
      return raw.plusMinus >= 0 ? `+${raw.plusMinus}` : String(raw.plusMinus);
    case 'savePercentage':
      return `${Math.round(raw.savePercentage)}%`;
    case 'goalsConcededPerMatch':
      return fmtPerMatch(raw.goalsConcededPerMatch);
    default:
      return String(Math.round((raw[rawKey] as number) * raw.matchCount));
  }
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

// ─── Radar ────────────────────────────────────────────────────────────────────

export function RadarChart({ data, axes }: { data: PlayerRadarResult; axes: readonly RadarAxis[] }) {
  const { theme } = useTheme();
  const p = useMemo(() => fmPalette(theme.colors, theme.scheme), [theme]);
  const [selected, setSelected] = useState<number | null>(null);

  // `Dimensions.get()` était lu une fois au rendu, sans s'abonner aux
  // changements : le radar gardait sa taille portrait après rotation. Et
  // `width >= 768` prenait un iPhone en paysage pour une tablette, alors que
  // `useIsTablet` compare la plus PETITE dimension — c'est la définition du
  // dépôt, il n'en faut qu'une.
  const { width: screenW } = useWindowDimensions();
  const isTablet = useIsTablet();

  // Le radar occupait 80 % de la largeur utile, dont 76 pt de marge de libellé
  // de chaque côté : la toile réelle tombait à ~73 pt de rayon, soit un
  // graphique minuscule au milieu d'une carte pleine largeur. On reprend la
  // quasi-totalité de la largeur et on resserre la marge à ce dont les
  // libellés ont réellement besoin.
  const svgW = (screenW - 44) * (isTablet ? 0.5 : 0.95);
  const cx = svgW / 2;
  const cy = svgW / 2;
  const maxR = cx - 70;
  const lblR = maxR + 24;
  const svgH = svgW + 16;
  const step = (2 * Math.PI) / axes.length;
  const start = -Math.PI / 2;

  const pt = (i: number, r: number) => ({
    x: cx + r * Math.cos(start + i * step),
    y: cy + r * Math.sin(start + i * step),
  });

  const polygon = (fn: (i: number) => number) =>
    axes
      .map((_, i) => {
        const { x, y } = pt(i, fn(i));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const dataPoints = polygon((i) => (data.normalized[axes[i].normKey] / 100) * maxR);
  const avgPoints = polygon((i) => {
    const max = data.squadMax[axes[i].rawKey];
    const avg = data.squadAvg[axes[i].rawKey];
    return (max > 0 ? Math.min(1, Math.max(0, avg / max)) : 0) * maxR;
  });

  const sel = selected !== null ? axes[selected] : null;

  // Le SVG est invisible pour un lecteur d'écran : ce résumé porte la donnée.
  const a11ySummary = axes
    .map((a) => `${a.fullLabel} : ${fmtAxisValue(data.raw[a.rawKey], a.rawKey)}`)
    .join('. ');

  return (
    <View>
      <View accessible accessibilityLabel={`Radar de performance. ${a11ySummary}`}>
        <Svg width={svgW} height={svgH} style={styles.centerSelf}>
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <Polygon
              key={pct}
              points={polygon(() => pct * maxR)}
              fill={pct === 1 ? p.surface2 : 'none'}
              stroke={p.grid}
              strokeWidth={pct === 1 ? 1.5 : 1}
            />
          ))}
          {axes.map((_, i) => {
            const { x, y } = pt(i, maxR);
            return (
              <Line
                key={i}
                x1={cx.toFixed(1)}
                y1={cy.toFixed(1)}
                x2={x.toFixed(1)}
                y2={y.toFixed(1)}
                stroke={selected === i ? p.accent : p.grid}
                strokeWidth={selected === i ? 1.5 : 1}
              />
            );
          })}
          <Polygon
            points={avgPoints}
            fill="none"
            stroke={p.neutral}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeLinejoin="round"
          />
          <Polygon
            points={dataPoints}
            fill={p.accentSubtle}
            stroke={p.accent}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {axes.map((a, i) => {
            const { x, y } = pt(i, (data.normalized[a.normKey] / 100) * maxR);
            return (
              <Circle
                key={i}
                cx={x}
                cy={y}
                r={selected === i ? 5 : 3.5}
                fill={selected === i ? p.text1 : p.accent}
              />
            );
          })}
          {axes.map((a, i) => {
            const angle = start + i * step;
            const ca = Math.cos(angle);
            const sa = Math.sin(angle);
            const anchor: 'start' | 'end' | 'middle' = ca > 0.2 ? 'start' : ca < -0.2 ? 'end' : 'middle';
            const dy = sa > 0.2 ? 13 : sa < -0.2 ? -3 : 4;
            return (
              <SvgText
                key={i}
                x={cx + lblR * ca}
                y={cy + lblR * sa + dy}
                textAnchor={anchor}
                fontSize={11}
                fontWeight="700"
                fill={selected === i ? p.accent : p.text2}
                onPress={() => setSelected((prev) => (prev === i ? null : i))}
              >
                {a.label}
              </SvgText>
            );
          })}
          {axes.map((_, i) => {
            const angle = start + i * step;
            return (
              <Circle
                key={`hit-${i}`}
                cx={cx + lblR * Math.cos(angle)}
                cy={cy + lblR * Math.sin(angle)}
                r={20}
                fill="transparent"
                onPress={() => setSelected((prev) => (prev === i ? null : i))}
              />
            );
          })}
        </Svg>
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: p.accent }]} />
          <Text variant="caption" tone="tertiary" weight="600">
            Joueur
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDash, { borderColor: p.neutral }]} />
          <Text variant="caption" tone="tertiary" weight="600">
            Moyenne effectif
          </Text>
        </View>
      </View>

      {sel && (
        <View style={[styles.tooltip, { backgroundColor: p.surface2, borderColor: p.border }]}>
          <View style={styles.tooltipHead}>
            <Text variant="callout" weight="700" style={styles.flex}>
              {sel.fullLabel}
            </Text>
            <Pressable
              onPress={() => setSelected(null)}
              accessibilityRole="button"
              accessibilityLabel="Fermer le détail de l'axe"
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            >
              <Ionicons name="close" size={15} color={p.text3} />
            </Pressable>
          </View>
          <View style={styles.tooltipRow}>
            {[
              { val: fmtAxisValue(data.raw[sel.rawKey], sel.rawKey), label: 'Joueur', color: p.accent },
              { val: fmtAxisValue(data.squadMax[sel.rawKey], sel.rawKey), label: 'Meilleur', color: p.positive },
              { val: fmtAxisValue(data.squadAvg[sel.rawKey], sel.rawKey), label: 'Moyenne', color: p.text2 },
            ].map((col, i) => (
              <React.Fragment key={col.label}>
                {i > 0 && <View style={[styles.tooltipDiv, { backgroundColor: p.border }]} />}
                <View style={styles.tooltipCol}>
                  <Text variant="title" color={col.color} numeric>
                    {col.val}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {col.label}
                  </Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>
      )}

      <View style={[styles.statGrid, { borderTopColor: p.divider }]}>
        {axes.map((a) => {
          const isPM = a.rawKey === 'plusMinus';
          const pm = data.raw.plusMinus;
          const color = !isPM ? p.text1 : pm > 0 ? p.positive : pm < 0 ? p.negative : p.text1;
          const width = `${100 / (axes.length <= 6 ? 3 : 4)}%` as const;
          return (
            <View
              key={a.normKey}
              style={[styles.statItem, { width }]}
              accessible
              accessibilityLabel={`${a.gridLabel} : ${radarGridTotal(data, a.rawKey)}`}
            >
              <Text variant="headline" color={color} numeric>
                {radarGridTotal(data, a.rawKey)}
              </Text>
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {a.gridLabel}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Courbe de questionnaire ──────────────────────────────────────────────────

type FeedbackKey = 'auto_evaluation' | 'rpe' | 'physical_form' | 'pleasure';

const FEEDBACK_LINES: { key: FeedbackKey; label: string; seriesIndex: number }[] = [
  { key: 'auto_evaluation', label: 'Auto-évaluation', seriesIndex: 0 },
  { key: 'rpe', label: 'Intensité', seriesIndex: 3 },
  { key: 'physical_form', label: 'Forme', seriesIndex: 1 },
  { key: 'pleasure', label: 'Plaisir', seriesIndex: 2 },
];

export function FeedbackLineChart({ rows }: { rows: PlayerFeedbackRow[] }) {
  const { theme } = useTheme();
  const p = useMemo(() => fmPalette(theme.colors, theme.scheme), [theme]);
  const [active, setActive] = useState<Set<FeedbackKey>>(
    () => new Set(FEEDBACK_LINES.map((l) => l.key))
  );
  const [width, setWidth] = useState(0);

  const data = rows.slice(-20);
  const n = data.length;
  const PAD_L = 28;
  const PAD_R = 8;
  const PAD_T = 10;
  const PAD_B = 34;
  const plotW = Math.max(0, width - PAD_L - PAD_R);
  const plotH = 130;
  const svgH = PAD_T + plotH + PAD_B;
  const toY = (v: number) => PAD_T + plotH - ((v - 1) / 9) * plotH;
  const toX = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);

  const toggle = (k: FeedbackKey) =>
    setActive((prev) => {
      if (prev.has(k) && prev.size === 1) return prev; // au moins une courbe visible
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const last = data[data.length - 1];
  const activeLines = FEEDBACK_LINES.filter((l) => active.has(l.key));

  return (
    <View>
      <View style={styles.filterRow}>
        {FEEDBACK_LINES.map(({ key, label, seriesIndex }) => {
          const on = active.has(key);
          const color = p.series[seriesIndex] ?? p.accent;
          return (
            <Pressable
              key={key}
              onPress={() => toggle(key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={label}
              style={[
                styles.filterChip,
                {
                  borderColor: on ? color : p.border,
                  backgroundColor: on ? p.surface2 : 'transparent',
                },
              ]}
            >
              <View style={[styles.filterDot, { backgroundColor: on ? color : p.border }]} />
              <Text variant="caption" color={on ? color : p.text3} weight="700">
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.full}>
        {width > 0 && (
          <Svg width={width} height={svgH}>
            {[2, 4, 6, 8, 10].map((v) => (
              <React.Fragment key={v}>
                <Line x1={PAD_L} y1={toY(v)} x2={PAD_L + plotW} y2={toY(v)} stroke={p.grid} strokeWidth={1} />
                <SvgText x={PAD_L - 5} y={toY(v) + 4} textAnchor="end" fontSize={11} fill={p.text3}>
                  {v}
                </SvgText>
              </React.Fragment>
            ))}
            <Line
              x1={PAD_L}
              y1={PAD_T + plotH}
              x2={PAD_L + plotW}
              y2={PAD_T + plotH}
              stroke={p.border}
              strokeWidth={1}
            />
            {activeLines.map(({ key, seriesIndex }) => {
              const color = p.series[seriesIndex] ?? p.accent;
              const pts = data.reduce<{ x: number; y: number }[]>((acc, row, i) => {
                const v = row[key];
                if (v != null) acc.push({ x: toX(i), y: toY(v as number) });
                return acc;
              }, []);
              const d = smoothPath(pts);
              return d ? (
                <Path key={key} d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
              ) : null;
            })}
            {activeLines.map(({ key, seriesIndex }) =>
              data.map((row, i) => {
                const v = row[key];
                return v == null ? null : (
                  <Circle
                    key={`${key}-${i}`}
                    cx={toX(i)}
                    cy={toY(v as number)}
                    r={3}
                    fill={p.series[seriesIndex] ?? p.accent}
                  />
                );
              })
            )}
            {labelledIndexes(n).map((i) => (
              <SvgText
                key={i}
                x={toX(i)}
                y={PAD_T + plotH + 16}
                textAnchor="middle"
                fontSize={11}
                fill={p.text3}
              >
                {shortDate(data[i].date)}
              </SvgText>
            ))}
          </Svg>
        )}
      </View>

      {last && activeLines.some((l) => last[l.key] != null) && (
        <View style={[styles.lastRow, { borderTopColor: p.divider }]}>
          <Text variant="caption" tone="tertiary" weight="700">
            Dernière séance
          </Text>
          <View style={styles.lastVals}>
            {activeLines.map(({ key, label, seriesIndex }) =>
              last[key] == null ? null : (
                <View
                  key={key}
                  style={[styles.lastItem, { backgroundColor: p.surface2, borderColor: p.border }]}
                  accessible
                  accessibilityLabel={`${label} : ${last[key]} sur 10`}
                >
                  <Text variant="title" color={p.series[seriesIndex] ?? p.accent} numeric>
                    {String(last[key])}
                  </Text>
                  <Text variant="caption" tone="tertiary" numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              )
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Courbe de note de match ──────────────────────────────────────────────────

/**
 * Trois pôles au lieu d'une échelle rouge-vert continue à cinq crans. Une
 * échelle continue rouge → orange → gris → vert clair → vert foncé est
 * indistinguable en deutéranopie : elle ne portait donc aucune information pour
 * environ 8 % du public visé.
 */
function ratingColor(rating: number, p: FMPalette): string {
  if (rating >= 6) return p.positive;
  if (rating >= 4.5) return p.neutral;
  return p.negative;
}

export function RatingLineChart({ series }: { series: { date: string; rating: number }[] }) {
  const { theme } = useTheme();
  const p = useMemo(() => fmPalette(theme.colors, theme.scheme), [theme]);
  const [width, setWidth] = useState(0);

  const data = series.slice(-20);
  const n = data.length;
  const avg = n > 0 ? data.reduce((s, r) => s + r.rating, 0) / n : 0;

  const PAD_L = 24;
  const PAD_R = 8;
  const PAD_T = 10;
  const PAD_B = 34;
  const plotW = Math.max(0, width - PAD_L - PAD_R);
  const plotH = 130;
  const svgH = PAD_T + plotH + PAD_B;
  const toY = (v: number) => PAD_T + plotH - (v / 10) * plotH;
  const toX = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);

  return (
    <View>
      <View style={styles.summaryRow}>
        <Text variant="callout" tone="tertiary" weight="700">
          Moyenne
        </Text>
        <View style={[styles.summaryBadge, { backgroundColor: ratingColor(avg, p) }]}>
          <Text variant="headline" color={p.onFill} numeric>
            {avg.toFixed(1)}
          </Text>
        </View>
        <Text variant="callout" tone="tertiary">
          sur {n} match{n > 1 ? 's' : ''}
        </Text>
      </View>

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.full}>
        {width > 0 && (
          <Svg width={width} height={svgH}>
            {[0, 2, 4, 6, 8, 10].map((v) => (
              <React.Fragment key={v}>
                <Line x1={PAD_L} y1={toY(v)} x2={PAD_L + plotW} y2={toY(v)} stroke={p.grid} strokeWidth={1} />
                <SvgText x={PAD_L - 5} y={toY(v) + 4} textAnchor="end" fontSize={11} fill={p.text3}>
                  {v}
                </SvgText>
              </React.Fragment>
            ))}
            {(() => {
              const d = smoothPath(data.map((r, i) => ({ x: toX(i), y: toY(r.rating) })));
              return d ? <Path d={d} fill="none" stroke={p.accent} strokeWidth={2} strokeLinecap="round" /> : null;
            })()}
            {data.map((r, i) => (
              <Circle key={i} cx={toX(i)} cy={toY(r.rating)} r={3.5} fill={ratingColor(r.rating, p)} />
            ))}
            {labelledIndexes(n).map((i) => (
              <SvgText
                key={i}
                x={toX(i)}
                y={PAD_T + plotH + 16}
                textAnchor="middle"
                fontSize={11}
                fill={p.text3}
              >
                {shortDate(data[i].date)}
              </SvgText>
            ))}
          </Svg>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  full: { width: '100%' },
  centerSelf: { alignSelf: 'center' },

  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 14, height: 2, borderRadius: 1 },
  legendDash: { width: 14, height: 0, borderTopWidth: 2, borderStyle: 'dashed' },

  tooltip: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginTop: 12 },
  tooltipHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  tooltipRow: { flexDirection: 'row', alignItems: 'center' },
  tooltipCol: { flex: 1, alignItems: 'center', gap: 2 },
  tooltipDiv: { width: StyleSheet.hairlineWidth, height: 36 },

  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statItem: { alignItems: 'center', paddingVertical: 6, gap: 1 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  filterDot: { width: 8, height: 8, borderRadius: 4 },

  lastRow: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  lastVals: { flexDirection: 'row', gap: 8 },
  lastItem: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 1,
  },

  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  summaryBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
});
