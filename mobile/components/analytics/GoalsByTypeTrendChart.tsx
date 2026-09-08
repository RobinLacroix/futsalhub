/**
 * Analyse > Matchs > Équipe — Évolution des buts par type, match par match.
 *
 * Complète « Buts par type » (agrégat saison) par une lecture chronologique :
 * quel match a fait basculer le total. Source événements du tracker
 * (`match_events.goal_type`), la même que le reste de l'onglet Matchs — pas le
 * JSON manuel `matches.goals_by_type`, qui vivait dans Analyse > Équipe côté
 * Séance et pouvait diverger du tracker sur un match saisi à la main.
 */

import { ScrollView, View } from 'react-native';
import Svg, { Rect, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../lib/design/tokens';
import { Text, EmptyState } from '../ui';
import type { Match, MatchEvent } from '../../types';

type GoalType = 'offensive' | 'transition' | 'cpa' | 'superiority';
const TYPES: readonly GoalType[] = ['offensive', 'transition', 'cpa', 'superiority'];

const TYPE_LABELS: Record<GoalType, string> = {
  offensive:   'Phase off.',
  transition:  'Transition',
  cpa:         'CPA',
  superiority: 'Supériorité',
};

function typeColors(c: ThemeColors): Record<GoalType, string> {
  return {
    offensive:   c.chartSeries[0] ?? c.accent.default,
    transition:  c.chartSeries[5] ?? c.accent.default,
    cpa:         c.chartSeries[2] ?? c.warning.default,
    superiority: c.chartSeries[1] ?? c.positive.default,
  };
}

type MatchBreakdown = {
  matchId: string;
  label: string;
  scored: number;
  conceded: number;
  result: 'W' | 'D' | 'L';
  scoredByType:   Record<GoalType, number>;
  concededByType: Record<GoalType, number>;
};

function buildBreakdown(
  matches: Match[],
  eventsByMatch: Record<string, MatchEvent[]>,
  filteredMatchIds: Set<string>,
): MatchBreakdown[] {
  return matches
    .filter(m => filteredMatchIds.has(m.id) && m.score_team != null && m.score_opponent != null)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string))
    .map(m => {
      const scoredByType:   Record<GoalType, number> = { offensive: 0, transition: 0, cpa: 0, superiority: 0 };
      const concededByType: Record<GoalType, number> = { offensive: 0, transition: 0, cpa: 0, superiority: 0 };
      (eventsByMatch[m.id] ?? []).forEach(ev => {
        const gt = (ev as any).goal_type as GoalType | null;
        if (!gt) return;
        if (ev.event_type === 'goal'          && scoredByType[gt]   !== undefined) scoredByType[gt]++;
        if (ev.event_type === 'opponent_goal' && concededByType[gt] !== undefined) concededByType[gt]++;
      });
      const s = m.score_team as number, o = m.score_opponent as number;
      const dateLabel = new Date(m.date as string).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' });
      return {
        matchId: m.id,
        label: dateLabel,
        scored: s,
        conceded: o,
        result: s > o ? 'W' : s < o ? 'L' : 'D',
        scoredByType,
        concededByType,
      } as MatchBreakdown;
    });
}

export function GoalsByTypeTrendChart({
  matches, eventsByMatch, filteredMatchIds,
}: {
  matches: Match[];
  eventsByMatch: Record<string, MatchEvent[]>;
  filteredMatchIds: Set<string>;
}) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  const TYPE_COLORS = typeColors(c);

  const data = buildBreakdown(matches, eventsByMatch, filteredMatchIds);

  if (data.length === 0) {
    return (
      <EmptyState
        icon="trending-up-outline"
        title="Aucune donnée"
        description="Suivez des matchs au tracker avec le type de but renseigné."
        compact
      />
    );
  }

  const BAR_W = 30, CHART_H = 120, PAD_TOP = 28, PAD_BOT = 26, PAD_LEFT = 30, PAD_RIGHT = 12, SPACING = 52;
  const maxGoals = Math.max(...data.map(d => d.scored + d.conceded), 1);
  const totalW = Math.max(data.length * SPACING + PAD_LEFT + PAD_RIGHT, 280);
  const svgH = CHART_H + PAD_TOP + PAD_BOT;
  const baseY = PAD_TOP + CHART_H;
  const toH = (v: number) => (v / maxGoals) * CHART_H;
  const barX = (i: number) => PAD_LEFT + i * SPACING + (SPACING - BAR_W) / 2;
  const resultColor = (r: 'W' | 'D' | 'L') => r === 'W' ? c.positive.default : r === 'D' ? c.warning.default : c.negative.default;
  const gridVals = [0, Math.round(maxGoals * 0.5), maxGoals].filter((v, i, arr) => arr.indexOf(v) === i);

  type SegRect = { key: string; x: number; y: number; w: number; h: number; fill: string; opacity: number };
  type BarLabel = { key: string; x: number; y: number; text: string; fill: string };
  const rects: SegRect[] = [];
  const scLabels: BarLabel[] = [];
  const dtLabels: BarLabel[] = [];

  data.forEach((d, i) => {
    const bx = barX(i);
    const cx = bx + BAR_W / 2;

    const stackTypes = (
      total: number,
      byType: Record<GoalType, number>,
      startY: number,
      prefix: string,
      opacity: number,
      fallbackFill: string,
    ) => {
      let curY = startY, hadAny = false;
      for (const type of TYPES) {
        const count = byType[type];
        if (count <= 0) continue;
        const h = toH(count);
        rects.push({ key: `${prefix}${type}${i}`, x: bx, y: curY - h, w: BAR_W, h, fill: TYPE_COLORS[type], opacity });
        curY -= h;
        hadAny = true;
      }
      if (!hadAny && total > 0) {
        const h = toH(total);
        rects.push({ key: `${prefix}solid${i}`, x: bx, y: startY - h, w: BAR_W, h, fill: fallbackFill, opacity: 1 });
      }
    };

    stackTypes(d.scored,   d.scoredByType,   baseY,                 'sc', 1.0,  c.positive.default);
    stackTypes(d.conceded, d.concededByType, baseY - toH(d.scored), 'co', 0.42, c.negative.default);

    if (d.scored > 0 && d.conceded > 0) {
      rects.push({ key: `sep${i}`, x: bx, y: baseY - toH(d.scored) - 1, w: BAR_W, h: 1.5, fill: c.bg.surface, opacity: 1 });
    }

    const totalH = toH(d.scored + d.conceded);
    scLabels.push({ key: `sl${i}`, x: cx, y: baseY - totalH - 6, text: `${d.scored}-${d.conceded}`, fill: resultColor(d.result) });
    dtLabels.push({ key: `dl${i}`, x: cx, y: svgH - 4, text: d.label, fill: c.text.tertiary });
  });

  return (
    <View>
      <View style={s.legendRow}>
        {TYPES.map(t => (
          <View key={t} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: TYPE_COLORS[t] }]} />
            <Text variant="caption" tone="tertiary">{TYPE_LABELS[t]}</Text>
          </View>
        ))}
      </View>
      <Text variant="caption" tone="tertiary" style={s.legendNote}>
        Couleurs vives = marqués · Estompés = encaissés
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={totalW} height={svgH}>
          {gridVals.map(val => (
            <SvgLine key={`gl${val}`} x1={PAD_LEFT} y1={baseY - toH(val)} x2={totalW - PAD_RIGHT} y2={baseY - toH(val)}
              stroke={c.border.subtle} strokeWidth={1} />
          ))}
          {gridVals.map(val => (
            <SvgText key={`gy${val}`} x={PAD_LEFT - 4} y={baseY - toH(val) + 4}
              fontSize={11} fill={c.text.tertiary} textAnchor="end">{val}</SvgText>
          ))}
          {rects.map(r => (
            <Rect key={r.key} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} fillOpacity={r.opacity} rx={2} />
          ))}
          {scLabels.map(l => (
            <SvgText key={l.key} x={l.x} y={l.y} fontSize={10} fill={l.fill} textAnchor="middle" fontWeight="bold">{l.text}</SvgText>
          ))}
          {dtLabels.map(l => (
            <SvgText key={l.key} x={l.x} y={l.y} fontSize={9} fill={l.fill} textAnchor="middle">{l.text}</SvgText>
          ))}
        </Svg>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md, paddingHorizontal: t.space.lg, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendNote: { paddingHorizontal: t.space.lg, marginBottom: t.space.sm },
}));
