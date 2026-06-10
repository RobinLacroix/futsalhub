import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useActiveTeam } from '../contexts/ActiveTeamContext';
import { getMatchesByTeam } from '../lib/services/matches';
import { getEventsByMatchId } from '../lib/services/matchEvents';
import { getPlayersByTeam, getPlayersByClubWithTeams } from '../lib/services/players';
import { MatchMomentsView } from './MatchMomentsView';
import { useIsTablet } from '../hooks/useIsTablet';
import type { Match, MatchEvent, Player } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type PlayerStats = {
  playerId: string;
  playerName: string;
  matchesPlayed: number;
  goals: number;
  shot_on_target: number;
  shot: number;
  ball_loss: number;
  recovery: number;
  assist: number;
  yellow_cards: number;
  red_cards: number;
  plusMinusGoals: number;
  plusMinusShots: number;
  totalTimeSeconds: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computePlayingTime(events: MatchEvent[]): Map<string, number> {
  const byPlayer = new Map<string, number>();
  const processHalf = (evs: MatchEvent[]) => {
    if (!evs.length) return;
    const maxT = Math.max(...evs.map(e => e.match_time_seconds));
    evs.forEach((ev, i) => {
      const nextT = i + 1 < evs.length ? evs[i + 1].match_time_seconds : maxT;
      const dur   = nextT - ev.match_time_seconds;
      if (dur <= 0) return;
      if (Array.isArray(ev.players_on_field))
        ev.players_on_field.forEach(pid => byPlayer.set(pid, (byPlayer.get(pid) ?? 0) + dur));
    });
    const first = evs[0];
    if (first.match_time_seconds > 0 && Array.isArray(first.players_on_field))
      first.players_on_field.forEach(pid => byPlayer.set(pid, (byPlayer.get(pid) ?? 0) + first.match_time_seconds));
  };
  processHalf(events.filter(e => e.half === 1).sort((a, b) => a.match_time_seconds - b.match_time_seconds));
  processHalf(events.filter(e => e.half === 2).sort((a, b) => a.match_time_seconds - b.match_time_seconds));
  return byPlayer;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function abbrevName(full: string): string {
  const parts = full.trim().split(' ');
  if (parts.length < 2) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ─── Coaching insights engine ─────────────────────────────────────────────────

type InsightLevel = 'positive' | 'warning' | 'alert' | 'info';
interface Insight { level: InsightLevel; icon: string; title: string; body: string; }

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
      out.push({ level: 'positive', icon: '🔥', title: 'Série de victoires', body: `3 victoires consécutives — momentum excellent. Profitez-en pour renforcer la rigueur défensive.` });
    else if (r.filter(x => x === 'L').length >= 3)
      out.push({ level: 'alert', icon: '⚠️', title: 'Série difficile', body: `3 défaites consécutives. Recréez des situations de succès à l'entraînement pour restaurer la confiance.` });
    else if (r.filter(x => x === 'W').length >= 2)
      out.push({ level: 'positive', icon: '📈', title: 'Bonne dynamique', body: `2 victoires sur les 3 derniers matchs. Maintenez l'intensité à l'entraînement.` });
  }

  const avgFor = ts.goalsFor / ts.played;
  if (avgFor >= 3)
    out.push({ level: 'positive', icon: '⚽', title: 'Attaque prolifique', body: `${avgFor.toFixed(1)} buts par match en moyenne. Veillez à ne pas négliger l'équilibre défensif.` });
  else if (avgFor < 1 && ts.played >= 3)
    out.push({ level: 'alert', icon: '🎯', title: 'Manque de réalisme', body: `Moins d'un but par match (${avgFor.toFixed(1)} moy.). Travaillez les situations de finition.` });

  const avgAgainst = ts.goalsAgainst / ts.played;
  if (avgAgainst >= 3)
    out.push({ level: 'alert', icon: '🛡️', title: 'Défense à consolider', body: `${avgAgainst.toFixed(1)} buts encaissés/match. Analysez les transitions défensives et les CPA concédés.` });
  else if (ts.cleanSheets / ts.played >= 0.4)
    out.push({ level: 'positive', icon: '🧱', title: 'Solidité défensive', body: `${ts.cleanSheets} clean sheet(s) sur ${ts.played} matchs (${Math.round(ts.cleanSheets / ts.played * 100)}%). La défense est le socle de l'équipe.` });

  const withGoals = stats.filter(p => p.goals > 0);
  if (withGoals.length > 0 && ts.goalsFor >= 5) {
    const top = [...withGoals].sort((a, b) => b.goals - a.goals)[0];
    const share = Math.round((top.goals / ts.goalsFor) * 100);
    if (share >= 40)
      out.push({ level: 'warning', icon: '⚡', title: `Dépendance à ${abbrevName(top.playerName)}`, body: `${top.playerName} représente ${share}% des buts. Impliquez d'autres profils dans la finition.` });
  }

  const active = stats.filter(p => p.matchesPlayed >= 2 && p.totalTimeSeconds > 0);
  if (active.length > 0) {
    const top = [...active].sort((a, b) => (b.recovery / b.matchesPlayed) - (a.recovery / a.matchesPlayed))[0];
    const rpm = top.recovery / top.matchesPlayed;
    if (rpm >= 2)
      out.push({ level: 'info', icon: '🔄', title: `${abbrevName(top.playerName)}, moteur du pressing`, body: `${top.recovery} récupérations en ${top.matchesPlayed} matchs (${rpm.toFixed(1)}/match). Construisez votre pressing autour de son activité.` });
  }

  if (active.length > 0) {
    const top = [...active].sort((a, b) => (b.ball_loss / b.matchesPlayed) - (a.ball_loss / a.matchesPlayed))[0];
    const lpm = top.ball_loss / top.matchesPlayed;
    if (lpm >= 3)
      out.push({ level: 'warning', icon: '📉', title: 'Pertes de balle à corriger', body: `${top.playerName} perd en moyenne ${lpm.toFixed(1)} ballons/match. Travaillez la conservation sous pression.` });
  }

  const totalGoals = stats.reduce((s, p) => s + p.goals, 0);
  const totalShots = stats.reduce((s, p) => s + p.shot + p.shot_on_target + p.goals, 0);
  if (totalShots >= 10) {
    const conv = Math.round((totalGoals / totalShots) * 100);
    if (conv >= 35)
      out.push({ level: 'positive', icon: '🏹', title: 'Excellent taux de conversion', body: `${conv}% des tirs finissent au fond (${totalGoals}/${totalShots}). La finition est un point fort collectif.` });
    else if (conv < 15)
      out.push({ level: 'warning', icon: '😤', title: 'Taux de conversion faible', body: `${conv}% de conversion (${totalGoals}/${totalShots}). Priorisez la qualité des situations et le dernier geste.` });
  }

  const worst = [...goalsByType].sort((a, b) => b.conceded - a.conceded)[0];
  if (worst?.conceded >= 2)
    out.push({ level: 'warning', icon: '🔍', title: `Vulnérabilité en ${worst.label}`, body: `${worst.conceded} buts encaissés en ${worst.label.toLowerCase()}. Point défensif à travailler en priorité.` });

  const underused = stats.filter(p => p.plusMinusGoals >= 2 && p.matchesPlayed >= 2 && p.totalTimeSeconds < 600 * p.matchesPlayed);
  if (underused.length > 0) {
    const p = underused[0];
    out.push({ level: 'info', icon: '💡', title: `${abbrevName(p.playerName)} à valoriser`, body: `+/- de +${p.plusMinusGoals} en ${p.matchesPlayed} matchs avec peu de temps de jeu. Sa présence sur le terrain est statistiquement bénéfique.` });
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
  playerIds:     string[];
  pmGoals:       number;
  pmShots:       number;
  sharedTimeSec: number;
  pmGoalsPerMin:  number;
  pmShotsPerMin:  number;
}

const MIN_COMBO_SEC = 300; // 5 min minimum

function buildLineupSegments(events: MatchEvent[], half: number): { players: string[]; duration: number }[] {
  const halfEvs = events
    .filter(e => e.half === half && Array.isArray(e.players_on_field) && (e.players_on_field as string[]).length > 0)
    .sort((a, b) => a.match_time_seconds - b.match_time_seconds);
  if (halfEvs.length < 2) return [];
  const segs: { players: string[]; duration: number }[] = [];
  let winStart   = 0;
  let winPlayers = halfEvs[0].players_on_field as string[];
  let winKey     = [...winPlayers].sort().join('|');
  for (let i = 1; i < halfEvs.length; i++) {
    const nextPl  = halfEvs[i].players_on_field as string[];
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
  const SCORING = new Set(['goal','opponent_goal','shot','shot_on_target','opponent_shot','opponent_shot_on_target']);

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
  const ICON:  Record<number, string> = { 2: '⚡', 3: '🔺', 4: '🔗' };
  const out: Insight[] = [];
  for (const size of [4, 3, 2]) {
    const best = bySize(size)[0];
    if (!best) continue;
    if (best.pmGoalsPerMin >= 0.08) {
      const shotNote = best.pmShotsPerMin >= 0.1 ? ` · +/-T/min : +${best.pmShotsPerMin.toFixed(2)}` : '';
      out.push({ level: 'positive', icon: ICON[size],
        title: `${LABEL[size]} efficace : ${fmt(best.playerIds)}`,
        body: `+/-B/min de +${best.pmGoalsPerMin.toFixed(2)}${shotNote} — ${fmtTime(best.sharedTimeSec)} ensemble. Privilégiez cette combinaison.` });
    } else if (best.pmShotsPerMin >= 0.2 && best.pmGoalsPerMin >= 0) {
      out.push({ level: 'info', icon: '🎯',
        title: `${LABEL[size]} dominant au tir : ${fmt(best.playerIds)}`,
        body: `+/-T/min de +${best.pmShotsPerMin.toFixed(2)} — ${fmtTime(best.sharedTimeSec)} ensemble. Beaucoup de danger, la conversion suivra.` });
    }
  }
  const worst = Array.from(allStats.values())
    .filter(c => c.playerIds.length === 2 && c.sharedTimeSec >= MIN_COMBO_SEC && c.pmGoalsPerMin <= -0.1)
    .sort((a, b) => a.pmGoalsPerMin - b.pmGoalsPerMin)[0];
  if (worst) out.push({ level: 'warning', icon: '⚠️',
    title: `Duo à surveiller : ${fmt(worst.playerIds)}`,
    body: `+/-B/min de ${worst.pmGoalsPerMin.toFixed(2)} (${fmtTime(worst.sharedTimeSec)} partagées). Analysez les situations défensives.` });
  return out;
}

const LOCATION_FILTERS    = ['all', 'Domicile', 'Extérieur'] as const;
const COMPETITION_FILTERS = ['all', 'Championnat', 'Coupe', 'Amical']  as const;

// Table columns — flex-based, no horizontal scroll
const COLS = [
  { key: 'playerName',       label: 'Joueur', flex: 2.2  },
  { key: 'matchesPlayed',    label: 'M',      flex: 0.6  },
  { key: 'totalTimeSeconds', label: 'Tps',    flex: 0.85 },
  { key: 'goals',            label: 'B',      flex: 0.55 },
  { key: 'plusMinusGoals',   label: '+/-B',   flex: 0.7  },
  { key: 'shot_on_target',   label: 'TC',     flex: 0.55 },
  { key: 'totalShots',       label: 'TT',     flex: 0.55 },
  { key: 'recovery',         label: 'R',      flex: 0.6  },
  { key: 'ball_loss',        label: 'PdB',    flex: 0.6  },
  { key: 'assist',           label: 'Pdec',   flex: 0.6  },
  { key: 'yellow_cards',     label: '🟡',     flex: 0.55 },
  { key: 'red_cards',        label: '🔴',     flex: 0.55 },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function AnalyticsView() {
  const { activeTeamId, activeTeam } = useActiveTeam();
  const isTablet = useIsTablet();

  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [matches,       setMatches]       = useState<Match[]>([]);
  const [eventsByMatch, setEventsByMatch] = useState<Record<string, MatchEvent[]>>({});
  const [allPlayers,    setAllPlayers]    = useState<Player[]>([]);
  const [clubPlayerIds, setClubPlayerIds] = useState<Set<string>>(new Set());
  const [sortCol,       setSortCol]       = useState('playerName');
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('asc');
  const [filterLoc,     setFilterLoc]     = useState('all');
  const [filterComp,    setFilterComp]    = useState('all');
  const [activeTab,     setActiveTab]     = useState<'overview' | 'stats' | 'coach'>('overview');

  // ── Data loading ────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!activeTeamId || !activeTeam?.club_id) {
      setMatches([]); setEventsByMatch({}); setAllPlayers([]); setClubPlayerIds(new Set());
      setLoading(false); setRefreshing(false);
      return;
    }
    try {
      const [matchData, , clubData] = await Promise.all([
        getMatchesByTeam(activeTeamId),
        getPlayersByTeam(activeTeamId),
        getPlayersByClubWithTeams(activeTeam.club_id),
      ]);
      setMatches(matchData);
      setAllPlayers(clubData.map(({ player }) => player));
      setClubPlayerIds(new Set(clubData.map(({ player }) => player.id)));
      const evMap: Record<string, MatchEvent[]> = {};
      await Promise.all(matchData.map(async m => { evMap[m.id] = await getEventsByMatchId(m.id); }));
      setEventsByMatch(evMap);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [activeTeamId, activeTeam?.club_id]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // ── Filters ─────────────────────────────────────────────────────────────

  const filteredMatchIds = useMemo(() => {
    const ids = new Set<string>();
    matches.forEach(m => {
      const locOk  = filterLoc  === 'all' || norm(m.location    ?? '') === norm(filterLoc);
      const compOk = filterComp === 'all' || norm(m.competition ?? '') === norm(filterComp);
      if (locOk && compOk) ids.add(m.id);
    });
    return ids;
  }, [matches, filterLoc, filterComp]);

  const filteredMatches = useMemo(
    () => matches.filter(m => filteredMatchIds.has(m.id)),
    [matches, filteredMatchIds]
  );

  // ── Team stats ──────────────────────────────────────────────────────────

  const teamStats = useMemo(() => {
    const played  = filteredMatches.length;
    const withScore = filteredMatches.filter(m => m.score_team != null && m.score_opponent != null);
    const wins    = withScore.filter(m => (m.score_team as number) > (m.score_opponent as number)).length;
    const draws   = withScore.filter(m => (m.score_team as number) === (m.score_opponent as number)).length;
    const losses  = withScore.length - wins - draws;
    const goalsFor     = withScore.reduce((s, m) => s + ((m.score_team     as number) ?? 0), 0);
    const goalsAgainst = withScore.reduce((s, m) => s + ((m.score_opponent as number) ?? 0), 0);
    const cleanSheets  = withScore.filter(m => (m.score_opponent as number) === 0).length;
    const winRate      = withScore.length > 0 ? Math.round((wins / withScore.length) * 100) : 0;

    // Last 5 results (most recent first)
    const form = [...withScore]
      .sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime())
      .slice(0, 5)
      .map(m => {
        const t = m.score_team as number, o = m.score_opponent as number;
        return t > o ? 'W' : t < o ? 'L' : 'D';
      });

    return { played, wins, draws, losses, goalsFor, goalsAgainst, cleanSheets, winRate, form };
  }, [filteredMatches]);

  // ── Player stats ────────────────────────────────────────────────────────

  const playerStatsList = useMemo(() => {
    const map  = new Map<string, PlayerStats>();
    const byId = new Map(allPlayers.map(p => [p.id, p]));

    const ensure = (id: string): PlayerStats => {
      if (!map.has(id)) {
        const p = byId.get(id);
        const full = p ? `${p.first_name} ${p.last_name}` : id.slice(0, 8);
        map.set(id, {
          playerId: id, playerName: full, matchesPlayed: 0,
          goals: 0, shot_on_target: 0, shot: 0,
          ball_loss: 0, recovery: 0, assist: 0,
          yellow_cards: 0, red_cards: 0,
          plusMinusGoals: 0, plusMinusShots: 0, totalTimeSeconds: 0,
        });
      }
      return map.get(id)!;
    };

    // Event-based stats
    Object.entries(eventsByMatch).forEach(([matchId, events]) => {
      if (!filteredMatchIds.has(matchId)) return;
      events.forEach(ev => {
        if (ev.player_id) {
          const cur = ensure(ev.player_id);
          if (ev.event_type === 'goal')           cur.goals++;
          if (ev.event_type === 'shot_on_target') cur.shot_on_target++;
          if (ev.event_type === 'shot')           cur.shot++;
          if (ev.event_type === 'ball_loss')      cur.ball_loss++;
          if (ev.event_type === 'recovery')       cur.recovery++;
          if (ev.event_type === 'assist')         cur.assist++;
          if (ev.event_type === 'yellow_card')    cur.yellow_cards++;
          if (ev.event_type === 'red_card')       cur.red_cards++;
        }
        if (Array.isArray(ev.players_on_field)) {
          ev.players_on_field.forEach(pid => {
            const cur = ensure(pid);
            if (ev.event_type === 'goal')                         cur.plusMinusGoals++;
            if (ev.event_type === 'opponent_goal')                cur.plusMinusGoals--;
            if (ev.event_type === 'shot' || ev.event_type === 'shot_on_target')          cur.plusMinusShots++;
            if (ev.event_type === 'opponent_shot' || ev.event_type === 'opponent_shot_on_target') cur.plusMinusShots--;
          });
        }
      });
    });

    // Playing time + matchesPlayed
    Object.entries(eventsByMatch).forEach(([matchId, events]) => {
      if (!filteredMatchIds.has(matchId)) return;
      const m = matches.find(x => x.id === matchId);
      const mPlayers: any[] = (() => {
        if (!m?.players) return [];
        try { return Array.isArray(m.players) ? m.players : JSON.parse(m.players as any); }
        catch { return []; }
      })();
      const fromMatch = new Map(
        mPlayers.filter((p: any) => (p.time_played ?? 0) > 0)
                .map((p: any) => [p.id, p.time_played as number])
      );
      const timeMap = fromMatch.size > 0 ? fromMatch : computePlayingTime(events);
      timeMap.forEach((sec, pid) => {
        if (!clubPlayerIds.has(pid)) return;
        const cur = ensure(pid);
        cur.totalTimeSeconds += sec;
        cur.matchesPlayed++;
      });
    });

    return Array.from(map.values()).filter(s => clubPlayerIds.has(s.playerId));
  }, [eventsByMatch, matches, allPlayers, clubPlayerIds, filteredMatchIds]);

  // ── Sorting ─────────────────────────────────────────────────────────────

  const sortedStats = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...playerStatsList].sort((a, b) => {
      if (sortCol === 'playerName') return dir * a.playerName.localeCompare(b.playerName);
      const va = sortCol === 'totalShots' ? a.shot + a.shot_on_target : (a as any)[sortCol] ?? 0;
      const vb = sortCol === 'totalShots' ? b.shot + b.shot_on_target : (b as any)[sortCol] ?? 0;
      return dir * (va - vb);
    });
  }, [playerStatsList, sortCol, sortDir]);

  const handleSort = useCallback((key: string) => {
    setSortCol(prev => {
      setSortDir(d => prev === key ? (d === 'asc' ? 'desc' : 'asc') : 'desc');
      return key;
    });
  }, []);

  // ── Top performers ──────────────────────────────────────────────────────

  const tops = useMemo(() => {
    const topN = (key: string, n = 3) =>
      [...playerStatsList]
        .sort((a, b) => {
          const va = key === 'totalShots' ? a.shot + a.shot_on_target : (a as any)[key] ?? 0;
          const vb = key === 'totalShots' ? b.shot + b.shot_on_target : (b as any)[key] ?? 0;
          return vb - va;
        })
        .slice(0, n)
        .filter(p => {
          const v = key === 'totalShots' ? p.shot + p.shot_on_target : (p as any)[key] ?? 0;
          return v > 0;
        });
    return {
      scorers:    topN('goals'),
      recoveries: topN('recovery'),
      plusMinus:  topN('plusMinusGoals'),
    };
  }, [playerStatsList]);

  // ── Team event totals ────────────────────────────────────────────────────

  const totals = useMemo(() => ({
    shots:    playerStatsList.reduce((s, p) => s + p.shot + p.shot_on_target, 0),
    onTarget: playerStatsList.reduce((s, p) => s + p.shot_on_target, 0),
    recoveries: playerStatsList.reduce((s, p) => s + p.recovery, 0),
    ballLoss:   playerStatsList.reduce((s, p) => s + p.ball_loss, 0),
  }), [playerStatsList]);

  // ── Goals by type ───────────────────────────────────────────────────────

  const goalsByType = useMemo(() => {
    const types = ['offensive', 'transition', 'cpa', 'superiority'] as const;
    const labels: Record<string, string> = {
      offensive:   'Phase offensive',
      transition:  'Transition',
      cpa:         'CPA',
      superiority: 'Supériorité',
    };
    const scored:   Record<string, number> = Object.fromEntries(types.map(t => [t, 0]));
    const conceded: Record<string, number> = Object.fromEntries(types.map(t => [t, 0]));
    Object.entries(eventsByMatch).forEach(([matchId, events]) => {
      if (!filteredMatchIds.has(matchId)) return;
      events.forEach(ev => {
        const gt = (ev as any).goal_type as string | null;
        if (ev.event_type === 'goal'          && gt && scored[gt]   !== undefined) scored[gt]++;
        if (ev.event_type === 'opponent_goal' && gt && conceded[gt] !== undefined) conceded[gt]++;
      });
    });
    return types.map(t => ({ key: t, label: labels[t], scored: scored[t], conceded: conceded[t] }));
  }, [eventsByMatch, filteredMatchIds]);

  const maxGoalsByType = useMemo(
    () => Math.max(1, ...goalsByType.map(g => Math.max(g.scored, g.conceded))),
    [goalsByType],
  );

  // ── Coaching insights ────────────────────────────────────────────────────

  const insights = useMemo(
    () => generateInsights(playerStatsList, teamStats, goalsByType),
    [playerStatsList, teamStats, goalsByType],
  );

  const allComboStats = useMemo(() => {
    const playerById = new Map(allPlayers.map(p => [p.id, p]));
    return computeAllComboStats(eventsByMatch, filteredMatchIds, playerById);
  }, [eventsByMatch, filteredMatchIds, allPlayers]);

  const comboInsightCards = useMemo(() => {
    const playerById = new Map(allPlayers.map(p => [p.id, p]));
    return generateComboInsightCards(allComboStats, playerById);
  }, [allComboStats, allPlayers]);

  const playerByIdForRanking = useMemo(
    () => new Map(allPlayers.map(p => [p.id, p])),
    [allPlayers],
  );

  // ─── Empty states ──────────────────────────────────────────────────────────

  if (!activeTeamId || !activeTeam) {
    return (
      <View style={s.centered}>
        <Ionicons name="bar-chart-outline" size={44} color="#cbd5e1" />
        <Text style={s.emptyTitle}>Aucune équipe sélectionnée</Text>
        <Text style={s.emptyText}>Choisissez une équipe depuis l'accueil</Text>
      </View>
    );
  }
  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // ─── KPI items ─────────────────────────────────────────────────────────────

  const kpiCols = isTablet ? 4 : 2;
  const KPI_ITEMS = [
    { label: 'Matchs joués',   value: teamStats.played,        color: '#2563eb', icon: 'football-outline'         as const },
    { label: 'Victoires',      value: teamStats.wins,          color: '#16a34a', icon: 'trophy-outline'           as const },
    { label: 'Défaites',       value: teamStats.losses,        color: '#dc2626', icon: 'close-circle-outline'     as const },
    { label: '% victoires',    value: `${teamStats.winRate}%`, color: '#f59e0b', icon: 'stats-chart-outline'      as const },
    { label: 'Buts marqués',   value: teamStats.goalsFor,      color: '#16a34a', icon: 'trending-up-outline'      as const },
    { label: 'Buts encaissés', value: teamStats.goalsAgainst,  color: '#dc2626', icon: 'trending-down-outline'    as const },
    { label: 'Clean sheets',   value: teamStats.cleanSheets,   color: '#8b5cf6', icon: 'shield-checkmark-outline' as const },
    { label: 'Tirs cadrés',    value: totals.onTarget,         color: '#06b6d4', icon: 'radio-button-on-outline'  as const },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            colors={['#2563eb']} tintColor="#2563eb"
          />
        }
      >
        {/* ── Hero header ── */}
        <View style={s.hero}>
          <View style={s.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.heroSub}>ANALYTICS</Text>
              <Text style={s.heroTeam}>{activeTeam.name}</Text>
            </View>
            {teamStats.form.length > 0 && (
              <View style={s.formBlock}>
                <Text style={s.formLabel}>FORME</Text>
                <View style={s.formRow}>
                  {teamStats.form.map((r, i) => (
                    <View key={i} style={[s.formBadge,
                      r === 'W' && s.formW,
                      r === 'D' && s.formD,
                      r === 'L' && s.formL,
                    ]}>
                      <Text style={s.formBadgeTxt}>{r}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* W / D / L + buts */}
          <View style={s.recordBar}>
            <RecordPill value={teamStats.wins}   label="Victoires" color="#16a34a" />
            <View style={s.recordSep} />
            <RecordPill value={teamStats.draws}  label="Nuls"      color="#f59e0b" />
            <View style={s.recordSep} />
            <RecordPill value={teamStats.losses} label="Défaites"  color="#dc2626" />
            <View style={s.recordDivider} />
            <View style={s.goalsBlock}>
              <Text style={s.goalsText}>
                <Text style={{ color: '#86efac' }}>{teamStats.goalsFor}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.4)' }}> – </Text>
                <Text style={{ color: '#fca5a5' }}>{teamStats.goalsAgainst}</Text>
              </Text>
              <Text style={s.goalsLabel}>Buts P / C</Text>
            </View>
          </View>
        </View>

        {/* ── Filters ── */}
        <View style={s.filtersBlock}>
          <FilterRow
            label="LIEU"
            options={LOCATION_FILTERS as unknown as string[]}
            active={filterLoc}
            onSelect={setFilterLoc}
            allLabel="Tous"
          />
          <FilterRow
            label="COMPÉT."
            options={COMPETITION_FILTERS as unknown as string[]}
            active={filterComp}
            onSelect={setFilterComp}
            allLabel="Toutes"
          />
        </View>

        {matches.length === 0 ? (
          <View style={s.emptyBlock}>
            <Ionicons name="analytics-outline" size={40} color="#cbd5e1" />
            <Text style={s.emptyTitle}>Aucun match enregistré</Text>
            <Text style={s.emptyText}>Créez un match dans le Calendrier et utilisez le Tracker pour générer des statistiques.</Text>
          </View>
        ) : (
          <>
            {/* ── Main tabs ── */}
            <View style={s.mainTabBar}>
              <TouchableOpacity
                style={[s.mainTabItem, activeTab === 'overview' && s.mainTabItemActive]}
                onPress={() => setActiveTab('overview')}
                activeOpacity={0.7}
              >
                <Ionicons name="bar-chart-outline" size={14} color={activeTab === 'overview' ? '#2563eb' : '#64748b'} />
                <Text style={[s.mainTabText, activeTab === 'overview' && s.mainTabTextActive]}>Vue d'ensemble</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.mainTabItem, activeTab === 'stats' && s.mainTabItemActive]}
                onPress={() => setActiveTab('stats')}
                activeOpacity={0.7}
              >
                <Ionicons name="grid-outline" size={14} color={activeTab === 'stats' ? '#2563eb' : '#64748b'} />
                <Text style={[s.mainTabText, activeTab === 'stats' && s.mainTabTextActive]}>Stats détaillées</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.mainTabItem, activeTab === 'coach' && s.mainTabItemActive]}
                onPress={() => setActiveTab('coach')}
                activeOpacity={0.7}
              >
                <Ionicons name="sparkles-outline" size={14} color={activeTab === 'coach' ? '#2563eb' : '#64748b'} />
                <Text style={[s.mainTabText, activeTab === 'coach' && s.mainTabTextActive]}>Coach IA</Text>
              </TouchableOpacity>
            </View>

            {/* ── Tab: Vue d'ensemble ── */}
            {activeTab === 'overview' && (
              <>
                <SectionHeader label="VUE D'ENSEMBLE" />
                <View style={[s.kpiGrid, { paddingHorizontal: 14 }]}>
                  {KPI_ITEMS.map(k => (
                    <View key={k.label} style={[s.kpiCard, { width: `${100 / kpiCols - 2}%` as any }]}>
                      <View style={[s.kpiIconBox, { backgroundColor: k.color + '18' }]}>
                        <Ionicons name={k.icon} size={14} color={k.color} />
                      </View>
                      <Text style={[s.kpiValue, { color: k.color }]}>{k.value}</Text>
                      <Text style={s.kpiLabel}>{k.label}</Text>
                    </View>
                  ))}
                </View>

                {goalsByType.some(g => g.scored > 0 || g.conceded > 0) && (
                  <>
                    <SectionHeader label="BUTS PAR TYPE" />
                    <View style={s.goalsTypeBlock}>
                      <View style={s.goalsTypeCard}>
                        <Text style={[s.goalsTypeCardTitle, { color: '#16a34a' }]}>Buts marqués</Text>
                        {goalsByType.map(g => (
                          <View key={g.key} style={s.goalsTypeRow}>
                            <View style={s.goalsTypeRowTop}>
                              <Text style={s.goalsTypeLabel}>{g.label}</Text>
                              <Text style={[s.goalsTypeCount, { color: '#16a34a' }]}>{g.scored}</Text>
                            </View>
                            <View style={s.progressBg}>
                              <View style={[s.progressFill, { width: `${(g.scored / maxGoalsByType) * 100}%` as any, backgroundColor: '#16a34a' }]} />
                            </View>
                          </View>
                        ))}
                      </View>
                      <View style={s.goalsTypeCard}>
                        <Text style={[s.goalsTypeCardTitle, { color: '#dc2626' }]}>Buts encaissés</Text>
                        {goalsByType.map(g => (
                          <View key={g.key} style={s.goalsTypeRow}>
                            <View style={s.goalsTypeRowTop}>
                              <Text style={s.goalsTypeLabel}>{g.label}</Text>
                              <Text style={[s.goalsTypeCount, { color: '#dc2626' }]}>{g.conceded}</Text>
                            </View>
                            <View style={s.progressBg}>
                              <View style={[s.progressFill, { width: `${(g.conceded / maxGoalsByType) * 100}%` as any, backgroundColor: '#dc2626' }]} />
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  </>
                )}

                {playerStatsList.length > 0 && (
                  <>
                    <SectionHeader label="MEILLEURS JOUEURS" />
                    <View style={[s.topsRow, isTablet && s.topsRowTablet]}>
                      <TopList
                        title="Buteurs" icon="football" color="#16a34a"
                        items={tops.scorers.map(p => ({ name: abbrevName(p.playerName), value: String(p.goals) }))}
                      />
                      <TopList
                        title="Récupérations" icon="refresh" color="#2563eb"
                        items={tops.recoveries.map(p => ({ name: abbrevName(p.playerName), value: String(p.recovery) }))}
                      />
                      <TopList
                        title="+/- Buts" icon="trending-up" color="#8b5cf6"
                        items={tops.plusMinus.map(p => ({
                          name: abbrevName(p.playerName),
                          value: p.plusMinusGoals > 0 ? `+${p.plusMinusGoals}` : String(p.plusMinusGoals),
                        }))}
                      />
                    </View>
                  </>
                )}

                <SectionHeader label="MOMENTS DU MATCH" />
                <MatchMomentsView
                  matches={matches}
                  eventsByMatch={eventsByMatch}
                  filteredMatchIds={filteredMatchIds}
                />
              </>
            )}

            {/* ── Tab: Stats détaillées ── */}
            {activeTab === 'stats' && (
              <>
                <SectionHeader label="STATISTIQUES JOUEURS" />
                {playerStatsList.length > 0 ? (
                  <>
                    <StatsTable
                      rows={sortedStats}
                      sortCol={sortCol}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <Text style={s.legend}>
                      M = Matchs · Tps = Temps de jeu · B = Buts · +/-B = +/- buts · TC = Tirs cadrés · TT = Tirs totaux · R = Récup. · PdB = Pertes · Pdec = Passes déc.
                    </Text>
                  </>
                ) : (
                  <View style={s.emptyBlock}>
                    <Text style={s.emptyText}>
                      {filteredMatchIds.size === 0
                        ? 'Aucun match ne correspond aux filtres.'
                        : 'Aucun match enregistré avec le Tracker.'}
                    </Text>
                  </View>
                )}
                <ComboRankingTable allStats={allComboStats} playerById={playerByIdForRanking} />
              </>
            )}

            {/* ── Tab: AI Coach Adjoint ── */}
            {activeTab === 'coach' && (
              <>
                {(insights.length > 0 || comboInsightCards.length > 0) ? (
                  <>
                    <View style={s.coachHeader}>
                      <View style={ss.secAccent} />
                      <Text style={ss.secLabel}>ANALYSE DU COACH ADJOINT</Text>
                      <View style={s.algoBadge}>
                        <Text style={s.algoBadgeText}>ALGO</Text>
                      </View>
                    </View>
                    <View style={s.insightsBlock}>
                      {insights.map((ins, i) => (
                        <CoachInsightCard key={`g-${i}`} insight={ins} />
                      ))}
                    </View>
                    {comboInsightCards.length > 0 && (
                      <>
                        <View style={s.comboDividerRow}>
                          <View style={s.comboDividerLine} />
                          <Text style={s.comboDividerLabel}>COMBINAISONS — RÉSUMÉ</Text>
                          <View style={s.comboDividerLine} />
                        </View>
                        <View style={s.insightsBlock}>
                          {comboInsightCards.map((ins, i) => (
                            <CoachInsightCard key={`c-${i}`} insight={ins} />
                          ))}
                        </View>
                      </>
                    )}
                  </>
                ) : (
                  <View style={s.emptyBlock}>
                    <Ionicons name="sparkles-outline" size={36} color="#cbd5e1" />
                    <Text style={s.emptyTitle}>Pas assez de données</Text>
                    <Text style={s.emptyText}>Enregistrez davantage de matchs avec le Tracker pour que le coach adjoint puisse générer des analyses.</Text>
                  </View>
                )}
              </>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <View style={ss.secHeader}>
      <View style={ss.secAccent} />
      <Text style={ss.secLabel}>{label}</Text>
    </View>
  );
}

function RecordPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={ss.recPill}>
      <Text style={[ss.recValue, { color }]}>{value}</Text>
      <Text style={ss.recLabel}>{label}</Text>
    </View>
  );
}

function FilterRow({
  label, options, active, onSelect, allLabel,
}: {
  label: string; options: string[]; active: string;
  onSelect: (v: string) => void; allLabel: string;
}) {
  return (
    <View style={ss.filterRow}>
      <Text style={ss.filterTitle}>{label}</Text>
      <View style={ss.filterChips}>
        {options.map(v => (
          <TouchableOpacity
            key={v}
            style={[ss.fChip, active === v && ss.fChipActive]}
            onPress={() => onSelect(v)}
            activeOpacity={0.7}
          >
            <Text style={[ss.fChipText, active === v && ss.fChipTextActive]}>
              {v === 'all' ? allLabel : v}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function TopList({
  title, icon, color, items,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  items: { name: string; value: string }[];
}) {
  const RANK_COLORS = ['#f59e0b', '#94a3b8', '#b45309'];
  return (
    <View style={ss.topCard}>
      <View style={ss.topHeader}>
        <View style={[ss.topIconBox, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={12} color={color} />
        </View>
        <Text style={[ss.topTitle, { color }]}>{title}</Text>
      </View>
      {items.length === 0 ? (
        <Text style={ss.topEmpty}>Pas encore de données</Text>
      ) : (
        items.map((item, i) => (
          <View key={i} style={[ss.topRow, i === 0 && ss.topRowFirst]}>
            <Text style={[ss.topRank, { color: RANK_COLORS[i] ?? '#94a3b8' }]}>{i + 1}</Text>
            <Text style={ss.topName} numberOfLines={1}>{item.name}</Text>
            <Text style={[ss.topValue, { color }]}>{item.value}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const INSIGHT_STYLES: Record<InsightLevel, { bg: string; border: string; tag: string; tagColor: string }> = {
  positive: { bg: '#f0fdf4', border: '#86efac', tag: 'Point fort',  tagColor: '#16a34a' },
  warning:  { bg: '#fffbeb', border: '#fcd34d', tag: 'Attention',   tagColor: '#d97706' },
  alert:    { bg: '#fef2f2', border: '#fca5a5', tag: 'Alerte',      tagColor: '#dc2626' },
  info:     { bg: '#eff6ff', border: '#bfdbfe', tag: 'Observation', tagColor: '#2563eb' },
};

function CoachInsightCard({ insight }: { insight: Insight }) {
  const c = INSIGHT_STYLES[insight.level];
  return (
    <View style={[css.insightCard, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={css.insightIcon}>{insight.icon}</Text>
      <View style={{ flex: 1 }}>
        <View style={css.insightTagRow}>
          <View style={[css.insightTag, { borderColor: c.border }]}>
            <Text style={[css.insightTagText, { color: c.tagColor }]}>{c.tag}</Text>
          </View>
          <Text style={css.insightTitle} numberOfLines={2}>{insight.title}</Text>
        </View>
        <Text style={css.insightBody}>{insight.body}</Text>
      </View>
    </View>
  );
}

type ComboSortKey = 'sharedTimeSec' | 'pmGoals' | 'pmShots' | 'pmGoalsPerMin' | 'pmShotsPerMin';

function ComboRankingTable({
  allStats,
  playerById,
}: {
  allStats: Map<string, ComboStats>;
  playerById: Map<string, Player>;
}) {
  const [activeSize, setActiveSize] = useState<2 | 3 | 4>(3);
  const [sortKey, setSortKey]       = useState<ComboSortKey>('pmGoalsPerMin');
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: ComboSortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const getName = (id: string) => {
    const p = playerById.get(id);
    return p ? abbrevName(`${p.first_name} ${p.last_name}`) : id.slice(0, 6);
  };

  const combosFor = (size: 2 | 3 | 4) =>
    Array.from(allStats.values())
      .filter(c => c.playerIds.length === size && c.sharedTimeSec >= MIN_COMBO_SEC);

  const SIZES: { size: 2 | 3 | 4; label: string; icon: string }[] = [
    { size: 4, label: 'Lignes', icon: '🔗' },
    { size: 3, label: 'Trios',  icon: '🔺' },
    { size: 2, label: 'Duos',   icon: '⚡' },
  ];

  const hasAny = SIZES.some(s => combosFor(s.size).length > 0);
  if (!hasAny) return null;

  const dir  = sortDir === 'asc' ? 1 : -1;
  const rows = combosFor(activeSize)
    .sort((a, b) => dir * ((a[sortKey] as number) - (b[sortKey] as number)))
    .slice(0, 10);

  const RANK_COLORS = ['#f59e0b', '#94a3b8', '#b45309'];
  const pmColor  = (v: number) => v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : '#94a3b8';
  const fmtPm    = (v: number) => `${v > 0 ? '+' : ''}${v}`;
  const fmtPerMin = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`;

  // Sortable header cell
  const SortTh = ({ label, sk, flex, left }: { label: string; sk?: ComboSortKey; flex?: number; left?: boolean }) => {
    const active = sk === sortKey;
    return (
      <TouchableOpacity
        style={[cr.thCell, flex ? { flex } : undefined]}
        onPress={() => sk && handleSort(sk)}
        activeOpacity={sk ? 0.6 : 1}
        disabled={!sk}
      >
        <Text style={[cr.th, left && { textAlign: 'left' }, active && { color: '#2563eb' }]}>
          {label}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <View style={cr.header}>
        <View style={[ss.secAccent, { backgroundColor: '#f59e0b' }]} />
        <Text style={ss.secLabel}>CLASSEMENT DES COMBINAISONS</Text>
      </View>

      <View style={cr.card}>
        {/* Tabs */}
        <View style={cr.tabs}>
          {SIZES.map(s => {
            const count = combosFor(s.size).length;
            const active = activeSize === s.size;
            return (
              <TouchableOpacity key={s.size} style={[cr.tab, active && cr.tabActive]}
                onPress={() => setActiveSize(s.size)} activeOpacity={0.7}>
                <Text style={[cr.tabText, active && cr.tabTextActive]}>
                  {s.icon} {s.label}{count > 0 ? ` (${count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {rows.length === 0 ? (
          <Text style={cr.empty}>Pas assez de données — min. 5 min ensemble.</Text>
        ) : (
          <>
            {/* Sortable column headers */}
            <View style={cr.thead}>
              <View style={{ width: 20, marginRight: 4 }} />
              <SortTh label="Joueurs" flex={2} left />
              <SortTh label="Tps"    sk="sharedTimeSec" />
              <SortTh label="+/-B"   sk="pmGoals" />
              <SortTh label="+/-T"   sk="pmShots" />
              <SortTh label="B/min"  sk="pmGoalsPerMin" />
              <SortTh label="T/min"  sk="pmShotsPerMin" />
            </View>

            {rows.map((c, i) => (
              <View key={c.playerIds.join('|')} style={[cr.row, i % 2 === 1 && cr.rowAlt]}>
                <Text style={[cr.rank, { color: RANK_COLORS[i] ?? '#94a3b8', width: 16, textAlign: 'center' }]}>{i + 1}</Text>
                <View style={cr.nameCol}>
                  {c.playerIds.map(pid => (
                    <Text key={pid} style={cr.nameLine} numberOfLines={1}>{getName(pid)}</Text>
                  ))}
                </View>
                <Text style={[cr.cell, sortKey === 'sharedTimeSec' && cr.cellActive]}>{fmtTime(c.sharedTimeSec)}</Text>
                <Text style={[cr.cell, { color: sortKey === 'pmGoals' ? '#2563eb' : pmColor(c.pmGoals), fontWeight: '700' }]}>{fmtPm(c.pmGoals)}</Text>
                <Text style={[cr.cell, { color: sortKey === 'pmShots' ? '#2563eb' : pmColor(c.pmShots), fontWeight: '700' }]}>{fmtPm(c.pmShots)}</Text>
                <Text style={[cr.cell, { color: sortKey === 'pmGoalsPerMin' ? '#2563eb' : pmColor(c.pmGoalsPerMin), fontWeight: '900', fontSize: 12 }]}>{fmtPerMin(c.pmGoalsPerMin)}</Text>
                <Text style={[cr.cell, { color: sortKey === 'pmShotsPerMin' ? '#2563eb' : pmColor(c.pmShotsPerMin), fontWeight: '700' }]}>{fmtPerMin(c.pmShotsPerMin)}</Text>
              </View>
            ))}

            <Text style={cr.legend}>
              B/min = buts par minute · T/min = tirs par minute · min. 5 min ensemble · gardien exclu
            </Text>
          </>
        )}
      </View>
    </>
  );
}

function StatsTable({
  rows, sortCol, sortDir, onSort,
}: {
  rows: PlayerStats[];
  sortCol: string;
  sortDir: 'asc' | 'desc';
  onSort: (k: string) => void;
}) {
  return (
    <View style={ss.tableWrap}>
      {/* Header */}
      <View style={ss.tableHeader}>
        {COLS.map(col => {
          const active = sortCol === col.key;
          const isName = col.key === 'playerName';
          return (
            <TouchableOpacity
              key={col.key}
              style={[ss.thCell, { flex: col.flex }]}
              onPress={() => onSort(col.key)}
              activeOpacity={0.7}
            >
              <Text style={[ss.thText, !isName && ss.thTextCenter, active && ss.thTextActive]}>
                {col.label}
              </Text>
              {active && (
                <Ionicons
                  name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'}
                  size={9}
                  color="#2563eb"
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Rows */}
      {rows.map((row, i) => {
        const totalShots = row.shot + row.shot_on_target;
        const isEven     = i % 2 === 0;
        return (
          <View key={row.playerId} style={[ss.tRow, isEven && ss.tRowAlt]}>
            {COLS.map(col => {
              const isName = col.key === 'playerName';
              let content: string;
              let cellColor: string | undefined;

              switch (col.key) {
                case 'playerName':
                  content   = abbrevName(row.playerName);
                  break;
                case 'totalTimeSeconds':
                  content   = fmtTime(row.totalTimeSeconds);
                  break;
                case 'totalShots':
                  content   = String(totalShots);
                  break;
                case 'plusMinusGoals':
                  content   = row.plusMinusGoals > 0 ? `+${row.plusMinusGoals}` : String(row.plusMinusGoals);
                  cellColor = row.plusMinusGoals > 0 ? '#16a34a' : row.plusMinusGoals < 0 ? '#dc2626' : undefined;
                  break;
                case 'plusMinusShots':
                  content   = row.plusMinusShots > 0 ? `+${row.plusMinusShots}` : String(row.plusMinusShots);
                  cellColor = row.plusMinusShots > 0 ? '#16a34a' : row.plusMinusShots < 0 ? '#dc2626' : undefined;
                  break;
                case 'goals':
                  content   = String(row.goals);
                  cellColor = row.goals > 0 ? '#16a34a' : undefined;
                  break;
                case 'recovery':
                  content   = String(row.recovery);
                  cellColor = row.recovery > 0 ? '#2563eb' : undefined;
                  break;
                case 'ball_loss':
                  content   = String(row.ball_loss);
                  cellColor = row.ball_loss > 0 ? '#dc2626' : undefined;
                  break;
                case 'yellow_cards':
                  content   = String(row.yellow_cards);
                  cellColor = row.yellow_cards > 0 ? '#f59e0b' : undefined;
                  break;
                case 'red_cards':
                  content   = String(row.red_cards);
                  cellColor = row.red_cards > 0 ? '#dc2626' : undefined;
                  break;
                default:
                  content   = String((row as any)[col.key] ?? 0);
              }

              return (
                <Text
                  key={col.key}
                  numberOfLines={1}
                  style={[
                    isName ? ss.tdName : ss.td,
                    { flex: col.flex },
                    cellColor ? { color: cellColor, fontWeight: '700' } : undefined,
                  ]}
                >
                  {content}
                </Text>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f1f5f9' },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155', textAlign: 'center' },
  emptyText:  { fontSize: 13, color: '#64748b',  textAlign: 'center', lineHeight: 18 },

  // Hero
  hero: {
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
    gap: 14,
  },
  heroTop:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroSub:  { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.45)', letterSpacing: 1.5, marginBottom: 4 },
  heroTeam: { fontSize: 21, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },

  formBlock: { alignItems: 'flex-end', gap: 4 },
  formLabel: { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 1 },
  formRow:   { flexDirection: 'row', gap: 3 },
  formBadge: { width: 20, height: 20, borderRadius: 3, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  formW:     { backgroundColor: '#15803d' },
  formD:     { backgroundColor: '#b45309' },
  formL:     { backgroundColor: '#b91c1c' },
  formBadgeTxt: { fontSize: 9, fontWeight: '800', color: '#fff' },

  recordBar:     { flexDirection: 'row', alignItems: 'center' },
  recordSep:     { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 14 },
  recordDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 14 },

  goalsBlock: { gap: 1 },
  goalsText:  { fontSize: 18, fontWeight: '800' },
  goalsLabel: { fontSize: 8, fontWeight: '600', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Filters
  filtersBlock: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    gap: 6,
  },

  // KPI
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 4,
  },
  kpiCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    margin: '1%' as any,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiIconBox: { width: 24, height: 24, borderRadius: 6, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  kpiValue:   { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  kpiLabel:   { fontSize: 9, color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },

  // Top performers
  topsRow:       { paddingHorizontal: 14, gap: 8 },
  topsRowTablet: { flexDirection: 'row' },

  // View tabs
  mainTabBar:       { flexDirection: 'row', marginHorizontal: 14, marginTop: 6, marginBottom: 2, backgroundColor: '#f1f5f9', borderRadius: 12, padding: 3, gap: 2 },
  mainTabItem:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 9 },
  mainTabItemActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3, elevation: 2 },
  mainTabText:      { fontSize: 11, fontWeight: '600', color: '#64748b' },
  mainTabTextActive: { color: '#2563eb' },
  viewTabs: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 3,
  },
  viewTab:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8 },
  viewTabActive:     { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
  viewTabText:       { fontSize: 12, fontWeight: '600', color: '#64748b' },
  viewTabTextActive: { color: '#1e293b' },

  emptyBlock: {
    margin: 16,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  legend: {
    fontSize: 10,
    color: '#94a3b8',
    marginHorizontal: 14,
    marginTop: 8,
    lineHeight: 15,
  },

  // Coach insights
  coachHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 18, paddingBottom: 10 },
  algoBadge: { backgroundColor: '#ede9fe', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#c4b5fd' },
  algoBadgeText: { fontSize: 8, fontWeight: '800', color: '#7c3aed', letterSpacing: 0.8, textTransform: 'uppercase' },
  insightsBlock: { paddingHorizontal: 14, gap: 8 },

  // Combo divider
  comboDividerRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginTop: 14, marginBottom: 8, gap: 8 },
  comboDividerLine:  { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  comboDividerLabel: { fontSize: 8, fontWeight: '800', color: '#7c3aed', letterSpacing: 1, textTransform: 'uppercase' },

  // Goals by type
  goalsTypeBlock: { paddingHorizontal: 14, gap: 8 },
  goalsTypeCard:  { backgroundColor: '#fff', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', gap: 10 },
  goalsTypeCardTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  goalsTypeRow:    { gap: 4 },
  goalsTypeRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalsTypeLabel:  { fontSize: 12, color: '#374151', fontWeight: '500' },
  goalsTypeCount:  { fontSize: 13, fontWeight: '800' },
  progressBg:      { height: 5, borderRadius: 3, backgroundColor: '#f1f5f9', overflow: 'hidden' },
  progressFill:    { height: '100%', borderRadius: 3 },
});

const cr = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 18, paddingBottom: 10 },
  card:   { marginHorizontal: 14, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden', marginBottom: 8 },

  tabs:        { flexDirection: 'row', padding: 10, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  tab:         { flex: 1, paddingVertical: 6, borderRadius: 7, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  tabActive:   { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  tabText:     { fontSize: 11, fontWeight: '600', color: '#64748b' },
  tabTextActive: { color: '#2563eb' },

  empty: { padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 },

  thead:  { flexDirection: 'row', backgroundColor: '#f8fafc', paddingVertical: 7, paddingHorizontal: 10,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0', alignItems: 'center' },
  thCell: { flex: 1, alignItems: 'center' },
  th:     { flex: 1, fontSize: 8, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase',
    letterSpacing: 0.3, textAlign: 'center' },

  row:    { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10, alignItems: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9' },
  rowAlt: { backgroundColor: '#f8fafc' },

  rank:    { fontSize: 11, fontWeight: '800', paddingTop: 2, marginRight: 4 },
  nameCol: { flex: 2, paddingRight: 4, gap: 1 },
  nameLine:{ fontSize: 9, color: '#1e293b', fontWeight: '500', lineHeight: 13 },
  cell:       { flex: 1, fontSize: 10, color: '#475569', textAlign: 'center', fontWeight: '500', paddingTop: 2 },
  cellActive: { color: '#2563eb', fontWeight: '700' },

  legend: { fontSize: 9, color: '#94a3b8', padding: 8, paddingHorizontal: 10, lineHeight: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0' },
});

const css = StyleSheet.create({
  insightCard: { flexDirection: 'row', gap: 10, borderRadius: 10, padding: 12, borderWidth: 1, marginBottom: 4 },
  insightIcon: { fontSize: 18, lineHeight: 22, flexShrink: 0 },
  insightTagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  insightTag: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1 },
  insightTagText: { fontSize: 8, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  insightTitle: { fontSize: 12, fontWeight: '700', color: '#1a2332', flex: 1 },
  insightBody: { fontSize: 11, color: '#374151', lineHeight: 17 },
});

const ss = StyleSheet.create({
  // Section header
  secHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 18, paddingBottom: 10 },
  secAccent: { width: 3, height: 12, backgroundColor: '#2563eb', borderRadius: 2 },
  secLabel:  { fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.2 },

  // Record pills
  recPill:  { alignItems: 'center', gap: 1 },
  recValue: { fontSize: 22, fontWeight: '900', lineHeight: 24 },
  recLabel: { fontSize: 8, fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Filters
  filterRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filterTitle: { fontSize: 8, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.8, textTransform: 'uppercase', minWidth: 48 },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, flex: 1 },
  fChip:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  fChipActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  fChipText:   { fontSize: 11, color: '#64748b', fontWeight: '600' },
  fChipTextActive: { color: '#2563eb' },

  // Top performers
  topCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  topHeader:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  topIconBox: { width: 22, height: 22, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  topTitle:   { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  topEmpty:   { fontSize: 12, color: '#94a3b8', textAlign: 'center', paddingVertical: 6, fontStyle: 'italic' },
  topRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f1f5f9' },
  topRowFirst:{ borderTopWidth: 0 },
  topRank:    { fontSize: 11, fontWeight: '800', width: 14, textAlign: 'center' },
  topName:    { flex: 1, fontSize: 12, color: '#334155', fontWeight: '500' },
  topValue:   { fontSize: 14, fontWeight: '800' },

  // Stats table — full width, no horizontal scroll
  tableWrap: {
    marginHorizontal: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  thCell:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1, paddingHorizontal: 1 },
  thText:        { fontSize: 8, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 },
  thTextCenter:  { textAlign: 'center' },
  thTextActive:  { color: '#2563eb' },

  tRow:    { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9' },
  tRowAlt: { backgroundColor: '#f8fafc' },

  tdName: { fontSize: 10, color: '#0f172a', fontWeight: '600', paddingRight: 2 },
  td:     { fontSize: 10, color: '#475569', textAlign: 'center', fontWeight: '500' },
});
