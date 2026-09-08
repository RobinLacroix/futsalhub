/**
 * AnalyticsView — miroir de contenu de mobile/components/AnalyticsView.tsx.
 * Port fidèle : mêmes calculs (moteur d'insights, combinaisons de joueurs,
 * KPI, buts par type), même découpage en onglets Équipe / Joueurs / Tracker.
 * Réactif à la largeur d'écran via useIsTablet (768px, comme mobile).
 */
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Flame, AlertTriangle, TrendingUp, Goal, Target, Shield, ShieldCheck, Zap, RefreshCw,
  TrendingDown, AlertCircle, Search, Lightbulb, Triangle, Link2, BarChart3, Users, Video,
  Star, Share2, XCircle, Trophy, CircleDot, ChevronRight, Sparkles,
} from 'lucide-react';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { useTheme } from '../../contexts/ThemeContext';
import { dataColor, deltaColor, type Theme, type ThemeColors } from '@/lib/design/tokens';
import { fmPalette } from '@/lib/design/fmPalette';
import { Text, Card, Stat, EmptyState, SkeletonStats, Button } from './ui';
import { MatchMomentsView } from './MatchMomentsView';
import { PlayerStatsPanel } from './PlayerStatsPanel';
import { GoalsByTypeTrendChart } from './GoalsByTypeTrendChart';
import { PlayingTimeTrendChart } from './PlayingTimeTrendChart';
import { abbrevName, fmtTime, type PlayerStats } from './playerStats';
import { useMatchAnalytics } from './useMatchAnalytics';
import { buildPlayerStats, totalShots } from './aggregate';
import { useIsTablet } from '../../hooks/useIsTablet';
import type { MatchEvent, Player } from '@/types';

type IconType = typeof Flame;

function ratingColor(theme: Theme, rating: number): string {
  return dataColor(theme, rating, 5, 1.5);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ─── Coaching insights engine ─────────────────────────────────────────────────

type InsightLevel = 'positive' | 'warning' | 'alert' | 'info';
interface Insight { level: InsightLevel; Icon: IconType; title: string; body: string; }

function generateInsights(
  stats: PlayerStats[],
  ts: { played: number; wins: number; losses: number; goalsFor: number; goalsAgainst: number; cleanSheets: number; form: string[] },
  goalsByType: { key: string; label: string; scored: number; conceded: number }[],
): Insight[] {
  const out: Insight[] = [];
  if (ts.played < 2) return out;

  if (ts.form.length >= 3) {
    const r = ts.form.slice(0, 3);
    if (r.filter(x => x === 'W').length >= 3)
      out.push({ level: 'positive', Icon: Flame, title: 'Série de victoires', body: `3 victoires consécutives — momentum excellent. Profitez-en pour renforcer la rigueur défensive.` });
    else if (r.filter(x => x === 'L').length >= 3)
      out.push({ level: 'alert', Icon: AlertTriangle, title: 'Série difficile', body: `3 défaites consécutives. Recréez des situations de succès à l'entraînement pour restaurer la confiance.` });
    else if (r.filter(x => x === 'W').length >= 2)
      out.push({ level: 'positive', Icon: TrendingUp, title: 'Bonne dynamique', body: `2 victoires sur les 3 derniers matchs. Maintenez l'intensité à l'entraînement.` });
  }

  const avgFor = ts.goalsFor / ts.played;
  if (avgFor >= 3)
    out.push({ level: 'positive', Icon: Goal, title: 'Attaque prolifique', body: `${avgFor.toFixed(1)} buts par match en moyenne. Veillez à ne pas négliger l'équilibre défensif.` });
  else if (avgFor < 1 && ts.played >= 3)
    out.push({ level: 'alert', Icon: Target, title: 'Manque de réalisme', body: `Moins d'un but par match (${avgFor.toFixed(1)} moy.). Travaillez les situations de finition.` });

  const avgAgainst = ts.goalsAgainst / ts.played;
  if (avgAgainst >= 3)
    out.push({ level: 'alert', Icon: Shield, title: 'Défense à consolider', body: `${avgAgainst.toFixed(1)} buts encaissés/match. Analysez les transitions défensives et les CPA concédés.` });
  else if (ts.cleanSheets / ts.played >= 0.4)
    out.push({ level: 'positive', Icon: ShieldCheck, title: 'Solidité défensive', body: `${ts.cleanSheets} clean sheet(s) sur ${ts.played} matchs (${Math.round(ts.cleanSheets / ts.played * 100)}%). La défense est le socle de l'équipe.` });

  const withGoals = stats.filter(p => p.goals > 0);
  if (withGoals.length > 0 && ts.goalsFor >= 5) {
    const top = [...withGoals].sort((a, b) => b.goals - a.goals)[0];
    const share = Math.round((top.goals / ts.goalsFor) * 100);
    if (share >= 40)
      out.push({ level: 'warning', Icon: Zap, title: `Dépendance à ${abbrevName(top.playerName)}`, body: `${top.playerName} représente ${share}% des buts. Impliquez d'autres profils dans la finition.` });
  }

  const active = stats.filter(p => p.matchesPlayed >= 2 && p.totalTimeSeconds > 0);
  if (active.length > 0) {
    const top = [...active].sort((a, b) => (b.recovery / b.matchesPlayed) - (a.recovery / a.matchesPlayed))[0];
    const rpm = top.recovery / top.matchesPlayed;
    if (rpm >= 2)
      out.push({ level: 'info', Icon: RefreshCw, title: `${abbrevName(top.playerName)}, moteur du pressing`, body: `${top.recovery} récupérations en ${top.matchesPlayed} matchs (${rpm.toFixed(1)}/match). Construisez votre pressing autour de son activité.` });
  }

  if (active.length > 0) {
    const top = [...active].sort((a, b) => (b.ball_loss / b.matchesPlayed) - (a.ball_loss / a.matchesPlayed))[0];
    const lpm = top.ball_loss / top.matchesPlayed;
    if (lpm >= 3)
      out.push({ level: 'warning', Icon: TrendingDown, title: 'Pertes de balle à corriger', body: `${top.playerName} perd en moyenne ${lpm.toFixed(1)} ballons/match. Travaillez la conservation sous pression.` });
  }

  const totalGoals = stats.reduce((s, p) => s + p.goals, 0);
  const shotsTotal = stats.reduce((s, p) => s + totalShots(p), 0);
  if (shotsTotal >= 10) {
    const conv = Math.round((totalGoals / shotsTotal) * 100);
    if (conv >= 35)
      out.push({ level: 'positive', Icon: Target, title: 'Excellent taux de conversion', body: `${conv}% des tirs finissent au fond (${totalGoals}/${shotsTotal}). La finition est un point fort collectif.` });
    else if (conv < 15)
      out.push({ level: 'warning', Icon: AlertCircle, title: 'Taux de conversion faible', body: `${conv}% de conversion (${totalGoals}/${shotsTotal}). Priorisez la qualité des situations et le dernier geste.` });
  }

  const worst = [...goalsByType].sort((a, b) => b.conceded - a.conceded)[0];
  if (worst?.conceded >= 2)
    out.push({ level: 'warning', Icon: Search, title: `Vulnérabilité en ${worst.label}`, body: `${worst.conceded} buts encaissés en ${worst.label.toLowerCase()}. Point défensif à travailler en priorité.` });

  const underused = stats.filter(p => p.plusMinusGoals >= 2 && p.matchesPlayed >= 2 && p.totalTimeSeconds < 600 * p.matchesPlayed);
  if (underused.length > 0) {
    const p = underused[0];
    out.push({ level: 'info', Icon: Lightbulb, title: `${abbrevName(p.playerName)} à valoriser`, body: `+/- de +${p.plusMinusGoals} en ${p.matchesPlayed} matchs avec peu de temps de jeu. Sa présence sur le terrain est statistiquement bénéfique.` });
  }

  return out;
}

// ─── Combo analysis ───────────────────────────────────────────────────────────

function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...getCombinations(rest, k - 1).map(c => [first, ...c]),
    ...getCombinations(rest, k),
  ];
}

interface ComboStats {
  playerIds: string[];
  pmGoals: number;
  pmShots: number;
  sharedTimeSec: number;
  pmGoalsPerMin: number;
  pmShotsPerMin: number;
}

const MIN_COMBO_SEC = 300;

function buildLineupSegments(events: MatchEvent[], half: number): { players: string[]; duration: number }[] {
  const halfEvs = events
    .filter(e => e.half === half && Array.isArray(e.players_on_field) && (e.players_on_field as string[]).length > 0)
    .sort((a, b) => a.match_time_seconds - b.match_time_seconds);
  if (halfEvs.length < 2) return [];
  const segs: { players: string[]; duration: number }[] = [];
  let winStart = 0;
  let winPlayers = halfEvs[0].players_on_field as string[];
  let winKey = [...winPlayers].sort().join('|');
  for (let i = 1; i < halfEvs.length; i++) {
    const nextPl = halfEvs[i].players_on_field as string[];
    const nextKey = [...nextPl].sort().join('|');
    if (nextKey !== winKey) {
      const dur = halfEvs[i].match_time_seconds - winStart;
      if (dur > 0) segs.push({ players: winPlayers, duration: dur });
      winPlayers = nextPl; winKey = nextKey; winStart = halfEvs[i].match_time_seconds;
    }
  }
  return segs;
}

function computeAllComboStats(
  eventsByMatch: Record<string, MatchEvent[]>,
  filteredMatchIds: Set<string>,
  playerById: Map<string, Player>,
): Map<string, ComboStats> {
  const map = new Map<string, ComboStats>();
  const isOutfield = (pid: string) => {
    const p = playerById.get(pid);
    return !!p && (p.position ?? '').toLowerCase() !== 'gardien';
  };
  const ensure = (sorted: string[]): ComboStats => {
    const key = sorted.join('|');
    if (!map.has(key)) map.set(key, { playerIds: sorted, pmGoals: 0, pmShots: 0, sharedTimeSec: 0, pmGoalsPerMin: 0, pmShotsPerMin: 0 });
    return map.get(key)!;
  };
  const SCORING = new Set(['goal', 'opponent_goal', 'shot', 'shot_on_target', 'opponent_shot', 'opponent_shot_on_target']);

  Object.entries(eventsByMatch).forEach(([matchId, events]) => {
    if (!filteredMatchIds.has(matchId)) return;
    for (const half of [1, 2]) {
      for (const seg of buildLineupSegments(events, half)) {
        const outfield = seg.players.filter(isOutfield);
        for (const k of [2, 3, 4] as const)
          for (const combo of getCombinations(outfield, k))
            ensure([...combo].sort()).sharedTimeSec += seg.duration;
      }
    }
    events.forEach(ev => {
      if (!SCORING.has(ev.event_type) || !Array.isArray(ev.players_on_field)) return;
      const outfield = (ev.players_on_field as string[]).filter(isOutfield);
      const pmG = ev.event_type === 'goal' ? 1 : ev.event_type === 'opponent_goal' ? -1 : 0;
      const pmS = (ev.event_type === 'shot' || ev.event_type === 'shot_on_target') ? 1
        : (ev.event_type === 'opponent_shot' || ev.event_type === 'opponent_shot_on_target') ? -1 : 0;
      for (const k of [2, 3, 4] as const)
        for (const combo of getCombinations(outfield, k)) {
          const acc = ensure([...combo].sort());
          acc.pmGoals += pmG; acc.pmShots += pmS;
        }
    });
  });

  map.forEach(acc => {
    if (acc.sharedTimeSec > 0) {
      acc.pmGoalsPerMin = acc.pmGoals / (acc.sharedTimeSec / 60);
      acc.pmShotsPerMin = acc.pmShots / (acc.sharedTimeSec / 60);
    }
  });
  return map;
}

function generateComboInsightCards(
  allStats: Map<string, ComboStats>,
  playerById: Map<string, Player>,
): Insight[] {
  const getName = (id: string) => {
    const p = playerById.get(id);
    return p ? abbrevName(`${p.first_name} ${p.last_name}`) : id.slice(0, 6);
  };
  const fmt = (ids: string[]) => ids.map(getName).join(' · ');
  const bySize = (size: number) =>
    Array.from(allStats.values())
      .filter(c => c.playerIds.length === size && c.sharedTimeSec >= MIN_COMBO_SEC)
      .sort((a, b) => b.pmGoalsPerMin - a.pmGoalsPerMin);
  const LABEL: Record<number, string> = { 2: 'Duo', 3: 'Trio', 4: 'Ligne' };
  const ICON: Record<number, IconType> = { 2: Zap, 3: Triangle, 4: Link2 };
  const out: Insight[] = [];
  for (const size of [4, 3, 2]) {
    const best = bySize(size)[0];
    if (!best) continue;
    if (best.pmGoalsPerMin >= 0.08) {
      const shotNote = best.pmShotsPerMin >= 0.1 ? ` · +/-T/min : +${best.pmShotsPerMin.toFixed(2)}` : '';
      out.push({ level: 'positive', Icon: ICON[size],
        title: `${LABEL[size]} efficace : ${fmt(best.playerIds)}`,
        body: `+/-B/min de +${best.pmGoalsPerMin.toFixed(2)}${shotNote} — ${fmtTime(best.sharedTimeSec)} ensemble. Privilégiez cette combinaison.` });
    } else if (best.pmShotsPerMin >= 0.2 && best.pmGoalsPerMin >= 0) {
      out.push({ level: 'info', Icon: Target,
        title: `${LABEL[size]} dominant au tir : ${fmt(best.playerIds)}`,
        body: `+/-T/min de +${best.pmShotsPerMin.toFixed(2)} — ${fmtTime(best.sharedTimeSec)} ensemble. Beaucoup de danger, la conversion suivra.` });
    }
  }
  const worst = Array.from(allStats.values())
    .filter(c => c.playerIds.length === 2 && c.sharedTimeSec >= MIN_COMBO_SEC && c.pmGoalsPerMin <= -0.1)
    .sort((a, b) => a.pmGoalsPerMin - b.pmGoalsPerMin)[0];
  if (worst) out.push({ level: 'warning', Icon: AlertTriangle,
    title: `Duo à surveiller : ${fmt(worst.playerIds)}`,
    body: `+/-B/min de ${worst.pmGoalsPerMin.toFixed(2)} (${fmtTime(worst.sharedTimeSec)} partagées). Analysez les situations défensives.` });
  return out;
}

const LOCATION_FILTERS = ['all', 'Domicile', 'Extérieur'] as const;
const COMPETITION_FILTERS = ['all', 'Championnat', 'Coupe', 'Amical'] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function AnalyticsView() {
  const { theme } = useTheme();
  const c = theme.colors;
  const bp = fmPalette(theme.colors, theme.scheme);
  const series = c.chartSeries;
  const { activeTeamId, activeTeam } = useActiveTeam();
  const isTablet = useIsTablet();
  const router = useRouter();

  const {
    matches, eventsByMatch, clubPlayers: allPlayers, clubPlayerIds, ratingRows,
    loading, refresh: onRefresh,
  } = useMatchAnalytics();

  const [filterLoc, setFilterLoc] = useState('all');
  const [filterComp, setFilterComp] = useState('all');
  const [activeTab, setActiveTab] = useState<'equipe' | 'joueurs' | 'tracker'>('equipe');
  const [playingTimePlayerId, setPlayingTimePlayerId] = useState('');

  const filteredMatchIds = useMemo(() => {
    const ids = new Set<string>();
    matches.forEach(m => {
      const locOk = filterLoc === 'all' || norm(m.location ?? '') === norm(filterLoc);
      const compOk = filterComp === 'all' || norm(m.competition ?? '') === norm(filterComp);
      if (locOk && compOk) ids.add(m.id);
    });
    return ids;
  }, [matches, filterLoc, filterComp]);

  const filteredMatches = useMemo(() => matches.filter(m => filteredMatchIds.has(m.id)), [matches, filteredMatchIds]);

  const matchesWithEventCount = useMemo(
    () => [...matches].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((m) => ({ ...m, eventCount: (eventsByMatch[m.id] ?? []).length })),
    [matches, eventsByMatch]
  );

  const homeAway = useMemo(() => {
    const withScore = filteredMatches.filter(m => m.score_team != null && m.score_opponent != null);
    const home = withScore.filter(m => (m.location ?? '').toLowerCase().includes('dom'));
    const away = withScore.filter(m => !(m.location ?? '').toLowerCase().includes('dom'));
    const wr = (arr: typeof withScore) =>
      arr.length ? Math.round((arr.filter(m => (m.score_team as number) > (m.score_opponent as number)).length / arr.length) * 100) : null;
    return { homeWR: wr(home), awayWR: wr(away) };
  }, [filteredMatches]);

  const teamStats = useMemo(() => {
    const played = filteredMatches.length;
    const withScore = filteredMatches.filter(m => m.score_team != null && m.score_opponent != null);
    const wins = withScore.filter(m => (m.score_team as number) > (m.score_opponent as number)).length;
    const draws = withScore.filter(m => (m.score_team as number) === (m.score_opponent as number)).length;
    const losses = withScore.length - wins - draws;
    const goalsFor = withScore.reduce((s, m) => s + ((m.score_team as number) ?? 0), 0);
    const goalsAgainst = withScore.reduce((s, m) => s + ((m.score_opponent as number) ?? 0), 0);
    const cleanSheets = withScore.filter(m => (m.score_opponent as number) === 0).length;
    const winRate = withScore.length > 0 ? Math.round((wins / withScore.length) * 100) : 0;

    const form = [...withScore]
      .sort((a, b) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime())
      .slice(0, 5)
      .map(m => {
        const t = m.score_team as number, o = m.score_opponent as number;
        return t > o ? 'W' : t < o ? 'L' : 'D';
      });

    return { played, wins, draws, losses, goalsFor, goalsAgainst, cleanSheets, winRate, form };
  }, [filteredMatches]);

  const avgRatingByPlayer = useMemo(() => {
    const acc = new Map<string, { sum: number; n: number }>();
    ratingRows.forEach(r => {
      if (!filteredMatchIds.has(r.match_id)) return;
      const cur = acc.get(r.player_id) ?? { sum: 0, n: 0 };
      cur.sum += r.rating;
      cur.n += 1;
      acc.set(r.player_id, cur);
    });
    const out = new Map<string, number>();
    acc.forEach((v, k) => out.set(k, v.sum / v.n));
    return out;
  }, [ratingRows, filteredMatchIds]);

  const playerStatsList = useMemo(
    () => buildPlayerStats({ eventsByMatch, matches, filteredMatchIds, players: allPlayers, clubPlayerIds, avgRatingByPlayer }),
    [eventsByMatch, matches, filteredMatchIds, allPlayers, clubPlayerIds, avgRatingByPlayer]
  );

  const tops = useMemo(() => {
    const topN = (key: string, n = 3) =>
      [...playerStatsList]
        .sort((a, b) => {
          const va = key === 'totalShots' ? totalShots(a) : (a as unknown as Record<string, number>)[key] ?? 0;
          const vb = key === 'totalShots' ? totalShots(b) : (b as unknown as Record<string, number>)[key] ?? 0;
          return vb - va;
        })
        .slice(0, n)
        .filter(p => {
          const v = key === 'totalShots' ? totalShots(p) : (p as unknown as Record<string, number>)[key] ?? 0;
          return v > 0;
        });
    const shooterEff = [...playerStatsList]
      .map(p => {
        const attempts = totalShots(p);
        const eff = attempts > 0 ? Math.round((p.goals / attempts) * 100) : 0;
        return { ...p, shotEff: eff, totalShotsAll: attempts };
      })
      .filter(p => p.totalShotsAll >= 3)
      .sort((a, b) => b.shotEff - a.shotEff)
      .slice(0, 3);
    const ratings = [...playerStatsList]
      .filter(p => p.avgRating != null)
      .sort((a, b) => (b.avgRating as number) - (a.avgRating as number))
      .slice(0, 3);
    return {
      scorers: topN('goals'),
      assists: topN('assist'),
      recoveries: topN('recovery'),
      plusMinus: topN('plusMinusGoals'),
      shooterEff,
      ratings,
    };
  }, [playerStatsList]);

  const totals = useMemo(() => ({
    onTarget: playerStatsList.reduce((s, p) => s + p.shot_on_target, 0),
  }), [playerStatsList]);

  const goalsByType = useMemo(() => {
    const types = ['offensive', 'transition', 'cpa', 'superiority'] as const;
    const labels: Record<string, string> = { offensive: 'Phase offensive', transition: 'Transition', cpa: 'CPA', superiority: 'Supériorité' };
    const scored: Record<string, number> = Object.fromEntries(types.map(t => [t, 0]));
    const conceded: Record<string, number> = Object.fromEntries(types.map(t => [t, 0]));
    Object.entries(eventsByMatch).forEach(([matchId, events]) => {
      if (!filteredMatchIds.has(matchId)) return;
      events.forEach(ev => {
        const gt = (ev as unknown as { goal_type?: string | null }).goal_type;
        if (ev.event_type === 'goal' && gt && scored[gt] !== undefined) scored[gt]++;
        if (ev.event_type === 'opponent_goal' && gt && conceded[gt] !== undefined) conceded[gt]++;
      });
    });
    return types.map(t => ({ key: t, label: labels[t], scored: scored[t], conceded: conceded[t] }));
  }, [eventsByMatch, filteredMatchIds]);

  const maxGoalsByType = useMemo(() => Math.max(1, ...goalsByType.map(g => Math.max(g.scored, g.conceded))), [goalsByType]);

  const insights = useMemo(() => generateInsights(playerStatsList, teamStats, goalsByType), [playerStatsList, teamStats, goalsByType]);

  const allComboStats = useMemo(() => {
    const playerById = new Map(allPlayers.map(p => [p.id, p]));
    return computeAllComboStats(eventsByMatch, filteredMatchIds, playerById);
  }, [eventsByMatch, filteredMatchIds, allPlayers]);

  const comboInsightCards = useMemo(() => {
    const playerById = new Map(allPlayers.map(p => [p.id, p]));
    return generateComboInsightCards(allComboStats, playerById);
  }, [allComboStats, allPlayers]);

  const playerByIdForRanking = useMemo(() => new Map(allPlayers.map(p => [p.id, p])), [allPlayers]);

  // ─── Empty states ────────────────────────────────────────────────────────

  if (!activeTeamId || !activeTeam) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <EmptyState icon={BarChart3} title="Aucune équipe sélectionnée" description="Choisissez une équipe depuis la sidebar." />
      </div>
    );
  }
  if (loading) {
    return (
      <div style={{ padding: theme.space.lg }}>
        <SkeletonStats />
      </div>
    );
  }

  const kpiCols = isTablet ? 4 : 2;

  const KPI_ITEMS = [
    { label: 'Matchs joués', value: teamStats.played, color: c.text.primary, Icon: Goal },
    { label: 'Victoires', value: teamStats.wins, color: c.positive.default, Icon: Trophy },
    { label: 'Défaites', value: teamStats.losses, color: c.negative.default, Icon: XCircle },
    { label: '% victoires', value: `${teamStats.winRate}%`, color: c.text.primary, Icon: BarChart3 },
    { label: 'Buts marqués', value: teamStats.goalsFor, color: c.positive.default, Icon: TrendingUp },
    { label: 'Buts encaissés', value: teamStats.goalsAgainst, color: c.negative.default, Icon: TrendingDown },
    { label: 'Clean sheets', value: teamStats.cleanSheets, color: c.text.primary, Icon: ShieldCheck },
    { label: 'Tirs cadrés', value: totals.onTarget, color: c.text.primary, Icon: CircleDot },
  ];

  return (
    <div>
      {/* ── Hero header ── */}
      <div style={{ backgroundColor: bp.brand, borderRadius: 12, padding: `${theme.space.xl}px ${theme.space.xl}px ${theme.space.lg}px`, display: 'flex', flexDirection: 'column', gap: theme.space.lg }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: theme.space.md }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <Text variant="caption" color={bp.onBrandMuted}>Analyse</Text>
            <Text variant="title" color={bp.onBrand}>{activeTeam.name}</Text>
          </div>
          {teamStats.form.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: theme.space.xs }}>
              <Text variant="caption" color={bp.onBrandMuted}>Forme</Text>
              <div style={{ display: 'flex', gap: 3 }}>
                {teamStats.form.map((r, i) => (
                  <div key={i} style={{
                    minWidth: 22, height: 22, borderRadius: theme.radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                    backgroundColor: r === 'W' ? c.positive.fill : r === 'D' ? c.warning.fill : c.negative.fill,
                  }}>
                    <Text variant="caption" weight={700} color={c.text.onFill}>{r === 'W' ? 'V' : r === 'D' ? 'N' : 'D'}</Text>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <RecordPill value={teamStats.wins} label="Victoires" color={c.positive.default} labelColor={bp.onBrandMuted} />
          <div style={{ width: 1, height: 24, marginLeft: theme.space.lg, marginRight: theme.space.lg, backgroundColor: bp.onBrandBorder }} />
          <RecordPill value={teamStats.draws} label="Nuls" color={c.warning.default} labelColor={bp.onBrandMuted} />
          <div style={{ width: 1, height: 24, marginLeft: theme.space.lg, marginRight: theme.space.lg, backgroundColor: bp.onBrandBorder }} />
          <RecordPill value={teamStats.losses} label="Défaites" color={c.negative.default} labelColor={bp.onBrandMuted} />
          <div style={{ width: 1, height: 24, marginLeft: theme.space.lg, marginRight: theme.space.lg, backgroundColor: bp.onBrandBorder }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Text variant="title" numeric>
              <span style={{ color: c.positive.default }}>{teamStats.goalsFor}</span>
              <span style={{ color: bp.onBrandMuted }}> – </span>
              <span style={{ color: c.negative.default }}>{teamStats.goalsAgainst}</span>
            </Text>
            <Text variant="caption" color={bp.onBrandMuted}>Buts pour / contre</Text>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ backgroundColor: c.bg.surface, borderBottom: `1px solid ${c.border.subtle}`, padding: `${theme.space.md}px ${theme.space.lg}px`, display: 'flex', flexDirection: 'column', gap: theme.space.sm, marginTop: theme.space.sm }}>
        <FilterRow label="Lieu" options={LOCATION_FILTERS as unknown as string[]} active={filterLoc} onSelect={setFilterLoc} allLabel="Tous" />
        <FilterRow label="Compétition" options={COMPETITION_FILTERS as unknown as string[]} active={filterComp} onSelect={setFilterComp} allLabel="Toutes" />
      </div>

      {matches.length === 0 ? (
        <div style={{ margin: theme.space.lg, padding: theme.space.xxl, borderRadius: theme.radius.md, border: `1px solid ${c.border.subtle}`, backgroundColor: c.bg.surface }}>
          <EmptyState icon={BarChart3} title="Aucun match enregistré" description="Créez un match dans le Calendrier, puis suivez-le en direct pour générer des statistiques." compact />
        </div>
      ) : (
        <>
          {/* ── Main tabs ── */}
          <div role="tablist" style={{ display: 'flex', marginTop: theme.space.sm, marginBottom: theme.space.xs, borderRadius: theme.radius.md, padding: 3, gap: 2, backgroundColor: c.bg.sunken }}>
            {([
              { key: 'equipe', label: 'Équipe', Icon: BarChart3 },
              { key: 'joueurs', label: 'Joueurs', Icon: Users },
              { key: 'tracker', label: 'Tracker', Icon: Video },
            ] as const).map(tab => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: theme.space.xs,
                    minHeight: 40, borderRadius: theme.radius.sm, border: `1px solid ${active ? c.border.subtle : 'transparent'}`,
                    backgroundColor: active ? c.bg.surface : 'transparent', cursor: 'pointer',
                  }}
                >
                  <tab.Icon size={15} color={active ? c.accent.default : c.text.secondary} />
                  <Text variant="caption" weight={600} tone={active ? 'accent' : 'secondary'}>{tab.label}</Text>
                </button>
              );
            })}
          </div>

          {/* ── Tab: Équipe ── */}
          {activeTab === 'equipe' && (
            <>
              <SectionHeader label="Vue d'ensemble" />
              <div style={{ display: 'flex', flexWrap: 'wrap', paddingTop: theme.space.xs, paddingBottom: theme.space.xs, paddingLeft: 14, paddingRight: 14 }}>
                {KPI_ITEMS.map(k => (
                  <Card key={k.label} padding="sm" style={{ width: `${100 / kpiCols - 2}%`, margin: '1%', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ width: 26, height: 26, borderRadius: theme.radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2, backgroundColor: c.bg.sunken }}>
                      <k.Icon size={15} color={k.color} />
                    </div>
                    <Stat value={String(k.value)} label={k.label} size="compact" valueColor={k.color} />
                  </Card>
                ))}
              </div>

              {(homeAway.homeWR !== null || homeAway.awayWR !== null) && (
                <>
                  <SectionHeader label="Domicile / Extérieur" />
                  <div style={{ display: 'flex', gap: theme.space.sm, paddingLeft: theme.space.lg, paddingRight: theme.space.lg, marginBottom: theme.space.xs }}>
                    {homeAway.homeWR !== null && (
                      <div style={{ flex: 1, borderRadius: theme.radius.md, padding: theme.space.md, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, backgroundColor: c.positive.subtle }}>
                        <Text variant="caption" weight={600} color={c.positive.default}>Domicile</Text>
                        <Text variant="headline" weight={800} color={c.positive.default}>{homeAway.homeWR}% V</Text>
                      </div>
                    )}
                    {homeAway.awayWR !== null && (
                      <div style={{ flex: 1, borderRadius: theme.radius.md, padding: theme.space.md, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, backgroundColor: c.warning.subtle }}>
                        <Text variant="caption" weight={600} color={c.warning.default}>Extérieur</Text>
                        <Text variant="headline" weight={800} color={c.warning.default}>{homeAway.awayWR}% V</Text>
                      </div>
                    )}
                  </div>
                </>
              )}

              {goalsByType.some(g => g.scored > 0 || g.conceded > 0) && (
                <>
                  <SectionHeader label="Buts par type" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.sm, paddingLeft: theme.space.lg, paddingRight: theme.space.lg }}>
                    {([
                      { title: 'Buts marqués', ramp: c.positive, pick: (g: typeof goalsByType[number]) => g.scored },
                      { title: 'Buts encaissés', ramp: c.negative, pick: (g: typeof goalsByType[number]) => g.conceded },
                    ] as const).map(block => (
                      <Card key={block.title} style={{ display: 'flex', flexDirection: 'column', gap: theme.space.md }}>
                        <Text variant="headline" color={block.ramp.default}>{block.title}</Text>
                        {goalsByType.map(g => {
                          const value = block.pick(g);
                          return (
                            <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: theme.space.xs }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text variant="callout" tone="secondary">{g.label}</Text>
                                <Text variant="headline" color={block.ramp.default} numeric>{value}</Text>
                              </div>
                              <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: c.bg.sunken }}>
                                <div style={{ width: `${(value / maxGoalsByType) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: block.ramp.default }} />
                              </div>
                            </div>
                          );
                        })}
                      </Card>
                    ))}
                  </div>
                </>
              )}

              <SectionHeader label="Évolution des buts par type" />
              <GoalsByTypeTrendChart matches={filteredMatches} eventsByMatch={eventsByMatch} filteredMatchIds={filteredMatchIds} />

              <SectionHeader label="Moments du match" />
              <div style={{ paddingLeft: theme.space.lg, paddingRight: theme.space.lg }}>
                <MatchMomentsView matches={matches} eventsByMatch={eventsByMatch} filteredMatchIds={filteredMatchIds} />
              </div>

              <ComboRankingTable allStats={allComboStats} playerById={playerByIdForRanking} />

              <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm, paddingLeft: theme.space.lg, paddingTop: theme.space.lg, paddingBottom: theme.space.md }}>
                <div style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: c.accent.default }} />
                <Text variant="caption" tone="secondary" weight={700}>Analyse du coach adjoint</Text>
                <div style={{ borderRadius: theme.radius.sm, padding: '2px 6px', border: `1px solid ${c.accent.border}`, backgroundColor: c.accent.subtle }}>
                  <Text variant="caption" weight={700} tone="accent">Algo</Text>
                </div>
              </div>
              {(insights.length > 0 || comboInsightCards.length > 0) ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.sm, paddingLeft: theme.space.lg, paddingRight: theme.space.lg }}>
                    {insights.map((ins, i) => <CoachInsightCard key={`g-${i}`} insight={ins} />)}
                  </div>
                  {comboInsightCards.length > 0 && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', paddingLeft: theme.space.lg, paddingRight: theme.space.lg, marginTop: theme.space.lg, marginBottom: theme.space.sm, gap: theme.space.sm }}>
                        <div style={{ flex: 1, height: 1, backgroundColor: c.border.subtle }} />
                        <Text variant="caption" tone="accent" weight={700}>Combinaisons — résumé</Text>
                        <div style={{ flex: 1, height: 1, backgroundColor: c.border.subtle }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.sm, paddingLeft: theme.space.lg, paddingRight: theme.space.lg }}>
                        {comboInsightCards.map((ins, i) => <CoachInsightCard key={`c-${i}`} insight={ins} />)}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div style={{ margin: theme.space.lg, padding: theme.space.xxl, borderRadius: theme.radius.md, border: `1px solid ${c.border.subtle}`, backgroundColor: c.bg.surface }}>
                  <EmptyState icon={Sparkles} title="Pas assez de données" description="Suivez davantage de matchs en direct pour que le coach adjoint puisse générer des analyses." compact />
                </div>
              )}
            </>
          )}

          {/* ── Tab: Joueurs ── */}
          {activeTab === 'joueurs' && (
            <>
              {playerStatsList.length > 0 && (
                <>
                  <SectionHeader label="Meilleurs joueurs" />
                  <div style={{ display: 'flex', flexDirection: isTablet ? 'row' : 'column', gap: theme.space.sm, paddingLeft: theme.space.lg, paddingRight: theme.space.lg }}>
                    {tops.ratings.length > 0 && (
                      <TopList title="Meilleures notes" Icon={Star} color={series[0]}
                        items={tops.ratings.map(p => ({ name: abbrevName(p.playerName), value: (p.avgRating as number).toFixed(1), valueColor: ratingColor(theme, p.avgRating as number) }))} />
                    )}
                    <TopList title="Buteurs" Icon={Goal} color={series[1]} items={tops.scorers.map(p => ({ name: abbrevName(p.playerName), value: String(p.goals) }))} />
                    {tops.assists.length > 0 && (
                      <TopList title="Passes déc." Icon={Share2} color={series[2]} items={tops.assists.map(p => ({ name: abbrevName(p.playerName), value: String(p.assist) }))} />
                    )}
                    <TopList title="Récupérations" Icon={RefreshCw} color={series[3]} items={tops.recoveries.map(p => ({ name: abbrevName(p.playerName), value: String(p.recovery) }))} />
                    <TopList title="+/- Buts" Icon={TrendingUp} color={series[4]}
                      items={tops.plusMinus.map(p => ({ name: abbrevName(p.playerName), value: p.plusMinusGoals > 0 ? `+${p.plusMinusGoals}` : String(p.plusMinusGoals) }))} />
                    {tops.shooterEff.length > 0 && (
                      <TopList title="Efficacité au tir" Icon={Target} color={series[5]}
                        items={tops.shooterEff.map(p => ({
                          name: abbrevName(p.playerName), value: `${p.shotEff}%`, sub: `${p.goals}B/${p.totalShotsAll}T`,
                          valueColor: p.shotEff >= 40 ? c.positive.default : p.shotEff >= 20 ? c.warning.default : c.negative.default,
                        }))} />
                    )}
                  </div>
                </>
              )}

              <SectionHeader label="Statistiques joueurs" />
              <div style={{ paddingLeft: theme.space.lg, paddingRight: theme.space.lg }}>
                <PlayerStatsPanel rows={playerStatsList} emptyDescription={filteredMatchIds.size === 0 ? 'Aucun match ne correspond aux filtres.' : 'Aucun match enregistré avec le Tracker.'} />
              </div>

              <SectionHeader label="Temps de jeu" />
              <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.md, paddingLeft: theme.space.lg, paddingRight: theme.space.lg, marginBottom: theme.space.sm }}>
                <Text variant="caption" tone="tertiary" weight={600}>Joueur</Text>
                <select
                  value={playingTimePlayerId}
                  onChange={(e) => setPlayingTimePlayerId(e.target.value)}
                  style={{
                    minHeight: 32, padding: `0 ${theme.space.sm}px`, borderRadius: theme.radius.sm,
                    border: `1px solid ${c.border.subtle}`, backgroundColor: c.bg.sunken, color: c.text.primary,
                  }}
                >
                  <option value="">— Choisir un joueur —</option>
                  {playerStatsList
                    .filter((p) => p.totalTimeSeconds > 0)
                    .sort((a, b) => a.playerName.localeCompare(b.playerName))
                    .map((p) => (
                      <option key={p.playerId} value={p.playerId}>{p.playerName}</option>
                    ))}
                </select>
              </div>
              {playingTimePlayerId && (
                <PlayingTimeTrendChart
                  matches={filteredMatches}
                  eventsByMatch={eventsByMatch}
                  filteredMatchIds={filteredMatchIds}
                  playerId={playingTimePlayerId}
                />
              )}
            </>
          )}

          {/* ── Tab: Tracker ── */}
          {activeTab === 'tracker' && (
            <>
              <div style={{ paddingLeft: theme.space.lg, paddingRight: theme.space.lg, paddingTop: theme.space.md, marginBottom: theme.space.sm }}>
                <Button label="Enregistrer un match" icon={Video} onPress={() => router.push('/webapp/tracker/matchrecorder')} block />
              </div>
              <SectionHeader label="Matchs suivis" />
              {matchesWithEventCount.length === 0 ? (
                <div style={{ margin: theme.space.lg, padding: theme.space.xxl, borderRadius: theme.radius.md, border: `1px solid ${c.border.subtle}`, backgroundColor: c.bg.surface }}>
                  <EmptyState icon={Video} title="Aucun match" description="Créez un match dans le Calendrier pour pouvoir le suivre en direct." compact />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.sm, paddingLeft: theme.space.lg, paddingRight: theme.space.lg, marginBottom: theme.space.xxl }}>
                  {matchesWithEventCount.slice(0, 15).map(m => (
                    <Card key={m.id} onPress={() => router.push(`/webapp/tracker/matchrecorder?matchId=${m.id}`)} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="headline" numberOfLines={1}>{m.title || m.opponent_team || 'Match'}</Text>
                        <Text variant="caption" tone="tertiary">{m.competition} · {m.eventCount} événement{m.eventCount !== 1 ? 's' : ''}</Text>
                      </div>
                      <Text variant="headline" tone="accent" numeric style={{ marginRight: theme.space.sm } as React.CSSProperties}>{m.score_team} - {m.score_opponent}</Text>
                      <ChevronRight size={20} color={c.text.tertiary} />
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ label, tone = 'accent' }: { label: string; tone?: 'accent' | 'warning' }) {
  const { theme } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm, paddingLeft: theme.space.lg, paddingTop: theme.space.lg, paddingBottom: theme.space.md }}>
      <div style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: tone === 'warning' ? theme.colors.warning.default : theme.colors.accent.default }} />
      <Text variant="caption" tone="secondary" weight={700}>{label}</Text>
    </div>
  );
}

function RecordPill({ value, label, color, labelColor }: { value: number; label: string; color: string; labelColor: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <Text variant="display" color={color} numeric>{value}</Text>
      <Text variant="caption" color={labelColor}>{label}</Text>
    </div>
  );
}

function FilterRow({ label, options, active, onSelect, allLabel }: {
  label: string; options: string[]; active: string; onSelect: (v: string) => void; allLabel: string;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.md, flexWrap: 'wrap' }}>
      <Text variant="caption" tone="tertiary" weight={600} style={{ minWidth: 76 } as React.CSSProperties}>{label}</Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, flex: 1 }}>
        {options.map(v => {
          const isActive = active === v;
          const chipLabel = v === 'all' ? allLabel : v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onSelect(v)}
              style={{
                minHeight: 32, padding: `${theme.space.xs}px ${theme.space.md}px`, borderRadius: theme.radius.sm,
                border: `1px solid ${isActive ? c.accent.default : c.border.subtle}`,
                backgroundColor: isActive ? c.accent.subtle : c.bg.sunken, cursor: 'pointer',
              }}
            >
              <Text variant="caption" tone={isActive ? 'accent' : 'secondary'} weight={600}>{chipLabel}</Text>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function rankTone(index: number): 'warning' | 'tertiary' {
  return index === 0 ? 'warning' : 'tertiary';
}

function TopList({ title, Icon, color, items }: {
  title: string; Icon: IconType; color: string;
  items: { name: string; value: string; sub?: string; valueColor?: string }[];
}) {
  const { theme } = useTheme();
  return (
    <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: theme.space.sm, marginBottom: theme.space.xs }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm }}>
        <div style={{ width: 24, height: 24, borderRadius: theme.radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accent.subtle }}>
          <Icon size={13} color={color} />
        </div>
        <Text variant="caption" weight={700} color={color}>{title}</Text>
      </div>
      {items.length === 0 ? (
        <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' } as React.CSSProperties}>Pas encore de données</Text>
      ) : (
        items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm, minHeight: 32, paddingTop: i === 0 ? 0 : 5, paddingBottom: 5, borderTop: i === 0 ? 'none' : `1px solid ${theme.colors.border.subtle}` }}>
            <Text variant="caption" weight={700} tone={rankTone(i)} numeric style={{ width: 16, textAlign: 'center' } as React.CSSProperties}>{i + 1}</Text>
            <Text variant="callout" numberOfLines={1} style={{ flex: 1 } as React.CSSProperties}>{item.name}</Text>
            {item.sub && <Text variant="caption" tone="tertiary" numberOfLines={1}>{item.sub}</Text>}
            <Text variant="headline" color={item.valueColor ?? color} numeric>{item.value}</Text>
          </div>
        ))
      )}
    </Card>
  );
}

function insightTone(level: InsightLevel, c: ThemeColors) {
  switch (level) {
    case 'positive': return { ramp: c.positive, tag: 'Point fort' as const };
    case 'warning': return { ramp: c.warning, tag: 'Attention' as const };
    case 'alert': return { ramp: c.negative, tag: 'Alerte' as const };
    default: return { ramp: { default: c.accent.default, subtle: c.accent.subtle }, tag: 'Observation' as const };
  }
}

function CoachInsightCard({ insight }: { insight: Insight }) {
  const { theme } = useTheme();
  const { ramp, tag } = insightTone(insight.level, theme.colors);
  return (
    <div style={{ display: 'flex', gap: theme.space.md, borderRadius: theme.radius.md, padding: theme.space.md, border: `1px solid ${ramp.default}`, backgroundColor: ramp.subtle, marginBottom: theme.space.xs }}>
      <insight.Icon size={20} color={ramp.default} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm, marginBottom: theme.space.xs, flexWrap: 'wrap' }}>
          <div style={{ borderRadius: theme.radius.sm, padding: '2px 6px', border: `1px solid ${ramp.default}` }}>
            <Text variant="caption" weight={700} color={ramp.default}>{tag}</Text>
          </div>
          <Text variant="callout" weight={700} numberOfLines={2} style={{ flex: 1 } as React.CSSProperties}>{insight.title}</Text>
        </div>
        <Text variant="callout" tone="secondary">{insight.body}</Text>
      </div>
    </div>
  );
}

type ComboSortKey = 'sharedTimeSec' | 'pmGoals' | 'pmShots' | 'pmGoalsPerMin' | 'pmShotsPerMin';

function ComboRankingTable({ allStats, playerById }: { allStats: Map<string, ComboStats>; playerById: Map<string, Player> }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [activeSize, setActiveSize] = useState<2 | 3 | 4>(3);
  const [sortKey, setSortKey] = useState<ComboSortKey>('pmGoalsPerMin');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: ComboSortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const getName = (id: string) => {
    const p = playerById.get(id);
    return p ? abbrevName(`${p.first_name} ${p.last_name}`) : id.slice(0, 6);
  };

  const combosFor = (size: 2 | 3 | 4) =>
    Array.from(allStats.values()).filter(x => x.playerIds.length === size && x.sharedTimeSec >= MIN_COMBO_SEC);

  const SIZES: { size: 2 | 3 | 4; label: string }[] = [
    { size: 4, label: 'Lignes' },
    { size: 3, label: 'Trios' },
    { size: 2, label: 'Duos' },
  ];

  const hasAny = SIZES.some(x => combosFor(x.size).length > 0);
  if (!hasAny) return null;

  const dir = sortDir === 'asc' ? 1 : -1;
  const rows = combosFor(activeSize)
    .sort((a, b) => dir * ((a[sortKey] as number) - (b[sortKey] as number)))
    .slice(0, 10);

  const fmtPm = (v: number) => `${v > 0 ? '+' : ''}${v}`;
  const fmtPerMin = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`;

  const SortTh = ({ label, sk, flex, left }: { label: string; sk?: ComboSortKey; flex?: number; left?: boolean }) => {
    const active = sk === sortKey;
    return (
      <button
        type="button"
        disabled={!sk}
        onClick={() => sk && handleSort(sk)}
        style={{ flex: flex ?? undefined, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: left ? 'flex-start' : 'center', background: 'none', border: 'none', cursor: sk ? 'pointer' : 'default', padding: 0 }}
      >
        <Text variant="tableHeader" tone={active ? 'accent' : 'tertiary'} style={left ? undefined : ({ textAlign: 'center' } as React.CSSProperties)}>
          {label}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
        </Text>
      </button>
    );
  };

  return (
    <>
      <SectionHeader label="Classement des combinaisons" tone="warning" />

      <div style={{ marginLeft: theme.space.lg, marginRight: theme.space.lg, borderRadius: theme.radius.md, border: `1px solid ${c.border.subtle}`, overflow: 'hidden', marginBottom: theme.space.sm, backgroundColor: c.bg.surface }}>
        <div role="tablist" style={{ display: 'flex', padding: theme.space.md, gap: 6, borderBottom: `1px solid ${c.border.subtle}` }}>
          {SIZES.map(x => {
            const count = combosFor(x.size).length;
            const active = activeSize === x.size;
            return (
              <button
                key={x.size}
                type="button"
                onClick={() => setActiveSize(x.size)}
                style={{
                  flex: 1, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.sm,
                  border: `1px solid ${active ? c.accent.default : c.border.subtle}`, backgroundColor: active ? c.accent.subtle : c.bg.sunken, cursor: 'pointer',
                }}
              >
                <Text variant="caption" weight={600} tone={active ? 'accent' : 'secondary'}>{x.label}{count > 0 ? ` (${count})` : ''}</Text>
              </button>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <Text variant="callout" tone="tertiary" style={{ padding: theme.space.xl, textAlign: 'center' } as React.CSSProperties}>
            Pas assez de données — min. 5 min ensemble.
          </Text>
        ) : (
          <>
            <div style={{ display: 'flex', padding: `${theme.space.sm}px ${theme.space.md}px`, borderBottom: `1px solid ${c.border.subtle}`, alignItems: 'center', backgroundColor: c.bg.sunken }}>
              <div style={{ width: 20, marginRight: 4 }} />
              <SortTh label="Joueurs" flex={2} left />
              <SortTh label="Tps" sk="sharedTimeSec" />
              <SortTh label="+/-B" sk="pmGoals" />
              <SortTh label="+/-T" sk="pmShots" />
              <SortTh label="B/min" sk="pmGoalsPerMin" />
              <SortTh label="T/min" sk="pmShotsPerMin" />
            </div>

            {rows.map((combo, i) => (
              <div key={combo.playerIds.join('|')} style={{ display: 'flex', padding: '6px 12px', alignItems: 'flex-start', borderBottom: `1px solid ${c.border.subtle}`, backgroundColor: i % 2 === 1 ? c.bg.stripe : 'transparent' }}>
                <Text variant="caption" weight={700} tone={rankTone(i)} numeric style={{ width: 16, textAlign: 'center', paddingTop: 2, marginRight: theme.space.xs } as React.CSSProperties}>{i + 1}</Text>
                <div style={{ flex: 2, paddingRight: theme.space.xs, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {combo.playerIds.map(pid => <Text key={pid} variant="caption" numberOfLines={1}>{getName(pid)}</Text>)}
                </div>
                <Text variant="tableCell" tone={sortKey === 'sharedTimeSec' ? 'accent' : 'secondary'} style={{ flex: 1, textAlign: 'center', paddingTop: 2 } as React.CSSProperties}>{fmtTime(combo.sharedTimeSec)}</Text>
                <Text variant="tableCell" color={deltaColor(theme, combo.pmGoals)} style={{ flex: 1, textAlign: 'center', paddingTop: 2 } as React.CSSProperties}>{fmtPm(combo.pmGoals)}</Text>
                <Text variant="tableCell" color={deltaColor(theme, combo.pmShots)} style={{ flex: 1, textAlign: 'center', paddingTop: 2 } as React.CSSProperties}>{fmtPm(combo.pmShots)}</Text>
                <Text variant="tableCell" color={deltaColor(theme, combo.pmGoalsPerMin)} style={{ flex: 1, textAlign: 'center', paddingTop: 2 } as React.CSSProperties}>{fmtPerMin(combo.pmGoalsPerMin)}</Text>
                <Text variant="tableCell" color={deltaColor(theme, combo.pmShotsPerMin)} style={{ flex: 1, textAlign: 'center', paddingTop: 2 } as React.CSSProperties}>{fmtPerMin(combo.pmShotsPerMin)}</Text>
              </div>
            ))}

            <Text variant="caption" tone="tertiary" style={{ padding: theme.space.sm, paddingLeft: theme.space.md, paddingRight: theme.space.md, borderTop: `1px solid ${c.border.subtle}` } as React.CSSProperties}>
              B/min = buts par minute · T/min = tirs par minute · min. 5 min ensemble · gardien exclu
            </Text>
          </>
        )}
      </div>
    </>
  );
}
