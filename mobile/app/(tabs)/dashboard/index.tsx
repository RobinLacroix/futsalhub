/**
 * Dashboard — Intelligence Coach
 * Redesign complet : indicateurs décisionnels orientés coach futsal amateur/semi-pro.
 * 3 onglets : Semaine · Saison · Effectif
 */
import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, useWindowDimensions, Modal,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { format, isAfter, differenceInDays, parseISO, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { useActiveSeason } from '../../../contexts/ActiveSeasonContext';
import { getTrainingsByTeam } from '../../../lib/services/trainings';
import { getMatchesByTeam } from '../../../lib/services/matches';
import { getPlayersByTeam, getSquadBulkStats, type PlayerSquadStat } from '../../../lib/services/players';
import { getTeamFeedbackForLastSessions, type TeamFeedbackRow } from '../../../lib/services/feedback';
import type { Training, Match, Player } from '../../../types';
import Svg, { Polyline, Rect, Circle, Line as SvgLine, Text as SvgText } from 'react-native-svg';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  navy:    '#1e3a5f',
  navyLt:  '#2a4f7c',
  bg:      '#f1f5f9',
  card:    '#ffffff',
  border:  '#e2e8f0',
  green:   '#16a34a',
  greenBg: '#dcfce7',
  amber:   '#d97706',
  amberBg: '#fef3c7',
  red:     '#dc2626',
  redBg:   '#fee2e2',
  blue:    '#2563eb',
  blueBg:  '#dbeafe',
  purple:  '#7c3aed',
  purpleBg:'#ede9fe',
  text:    '#1e293b',
  muted:   '#64748b',
  light:   '#94a3b8',
};

type TabId = 'week' | 'season' | 'squad';
type RankSortKey = 'name' | 'matches' | 'victories' | 'draws' | 'defeats' | 'goals' | 'att' | 'form';
type CompFilter = 'all' | 'Championnat' | 'Coupe' | 'Amical';
const COMP_FILTERS: { label: string; value: CompFilter }[] = [
  { label: 'Tous',         value: 'all'          },
  { label: 'Champ.',       value: 'Championnat'  },
  { label: 'Coupe',        value: 'Coupe'        },
  { label: 'Amical',       value: 'Amical'       },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function abbrev(p: Player) {
  return `${p.first_name[0] ?? '?'}.${p.last_name?.[0] ?? ''}`;
}

function wellnessScore(rows: TeamFeedbackRow[]): number | null {
  const vals = rows
    .map((r) => {
      const v: number[] = [];
      if (r.physical_form != null) v.push(r.physical_form);
      if (r.pleasure      != null) v.push(r.pleasure);
      return v;
    })
    .flat();
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function wellnessColor(score: number | null): string {
  if (score === null) return '#e2e8f0';
  if (score >= 7) return C.green;
  if (score >= 5) return C.amber;
  return C.red;
}

function wellnessBg(score: number | null): string {
  if (score === null) return '#f8fafc';
  if (score >= 7) return C.greenBg;
  if (score >= 5) return C.amberBg;
  return C.redBg;
}

const HEATMAP_METRICS = [
  { key: 'auto_evaluation' as const, label: 'Auto-éval.' },
  { key: 'rpe'             as const, label: 'Intensité'  },
  { key: 'physical_form'   as const, label: 'Forme'      },
  { key: 'pleasure'        as const, label: 'Plaisir'    },
] as const;
type HeatmapMetricKey = typeof HEATMAP_METRICS[number]['key'];

function metricColor(key: HeatmapMetricKey, val: number | null): string {
  if (val === null) return '#e2e8f0';
  if (key === 'rpe') {
    if (val < 4)    return C.blue;
    if (val <= 7)   return C.green;
    if (val <= 8.5) return C.amber;
    return C.red;
  }
  return wellnessColor(val);
}

function metricBg(key: HeatmapMetricKey, val: number | null): string {
  if (val === null) return '#f8fafc';
  if (key === 'rpe') {
    if (val < 4)    return C.blueBg;
    if (val <= 7)   return C.greenBg;
    if (val <= 8.5) return C.amberBg;
    return C.redBg;
  }
  return wellnessBg(val);
}

function rpeLabel(avg: number): { label: string; color: string; advice: string } {
  if (avg < 4) return { label: 'Trop faible', color: C.blue,  advice: 'Séance peu stimulante — Intensifier les prochaines' };
  if (avg <= 7) return { label: 'Zone optimale', color: C.green, advice: 'Charge idéale — Équipe prête pour le match' };
  if (avg <= 8.5) return { label: 'Charge élevée', color: C.amber, advice: 'Surveiller la récupération avant vendredi' };
  return { label: 'Surcharge', color: C.red, advice: 'Réduire l\'intensité — Risque de surmenage' };
}

function matchResult(m: Match): 'W' | 'D' | 'L' {
  const s = m.score_team, o = m.score_opponent;
  if (s == null || o == null) return 'D';
  return s > o ? 'W' : s < o ? 'L' : 'D';
}

function weekDayContext(): { phase: string; advice: string; icon: string } {
  const day = getDay(new Date()); // 0=dim, 1=lun, 2=mar, 3=mer, 4=jeu, 5=ven, 6=sam
  if (day === 1) return { phase: 'Début de cycle — Lundi', icon: '🔥', advice: 'Séance haute intensité · Nouveau principe' };
  if (day === 3) return { phase: 'Mi-semaine — Mercredi', icon: '⚡', advice: 'Consolidation · Intensité moyenne-haute' };
  if (day === 5) return { phase: 'Pré-match — Vendredi', icon: '🎯', advice: 'Séance légère · Confiance et plaisir' };
  if (day === 6 || day === 0) return { phase: 'Jour de match', icon: '⚽', advice: 'Concentration · Échauffement ciblé' };
  return { phase: 'Hors séance', icon: '📊', advice: 'Analyse & préparation de la prochaine séance' };
}

const POS_MAP: Record<string, { abbr: string; color: string; bg: string }> = {
  Gardien:   { abbr: 'GB',  color: '#d97706', bg: 'rgba(217,119,6,0.12)'  },
  Ailier:    { abbr: 'AIL', color: '#2563eb', bg: 'rgba(37,99,235,0.10)'  },
  Meneur:    { abbr: 'MEN', color: '#059669', bg: 'rgba(5,150,105,0.10)'  },
  Pivot:     { abbr: 'PIV', color: '#ea580c', bg: 'rgba(234,88,12,0.10)'  },
};
function getPos(position?: string) {
  if (!position) return { abbr: '—', color: '#94a3b8', bg: 'rgba(148,163,184,0.10)' };
  const key = Object.keys(POS_MAP).find(k => position.toLowerCase().startsWith(k.toLowerCase()));
  return key ? POS_MAP[key] : { abbr: position.slice(0, 3).toUpperCase(), color: '#94a3b8', bg: 'rgba(148,163,184,0.10)' };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const router  = useRouter();
  const { width } = useWindowDimensions();
  const { activeTeamId, activeTeam } = useActiveTeam();
  const { activeSeason, clubSeason, availableSeasons, changeActiveSeason } = useActiveSeason();
  const [seasonPickerOpen, setSeasonPickerOpen] = useState(false);
  const isTablet = width >= 768;

  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]               = useState<TabId>('week');

  const [trainings,   setTrainings]   = useState<Training[]>([]);
  const [matches,     setMatches]     = useState<Match[]>([]);
  const [players,     setPlayers]     = useState<Player[]>([]);
  const [feedback,    setFeedback]    = useState<TeamFeedbackRow[]>([]);
  const [squadStats,  setSquadStats]  = useState<Record<string, PlayerSquadStat>>({});
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetricKey>('physical_form');
  const [rankCompFilter, setRankCompFilter] = useState<CompFilter>('all');
  const [rankSort, setRankSort] = useState<{ key: RankSortKey; dir: 'asc' | 'desc' }>({ key: 'goals', dir: 'desc' });

  const handleRankSort = (key: RankSortKey) =>
    setRankSort(prev => ({
      key,
      dir: prev.key === key ? (prev.dir === 'asc' ? 'desc' : 'asc') : (key === 'name' ? 'asc' : 'desc'),
    }));

  const now = new Date();

  // ── Data loading ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!activeTeamId) {
      setTrainings([]); setMatches([]); setPlayers([]); setFeedback([]);
      setLoading(false); setRefreshing(false);
      return;
    }
    try {
      const [tr, ma, pl, fb, ss] = await Promise.all([
        getTrainingsByTeam(activeTeamId, activeSeason),
        getMatchesByTeam(activeTeamId, activeSeason),
        getPlayersByTeam(activeTeamId),
        getTeamFeedbackForLastSessions(activeTeamId, 5),
        getSquadBulkStats(activeTeamId, 'all'),
      ]);
      setTrainings(tr); setMatches(ma); setPlayers(pl); setFeedback(fb); setSquadStats(ss);
    } catch {
      // silent — keep previous state
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [activeTeamId, activeSeason]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const data = useMemo(() => {
    const today = now.toISOString().slice(0, 10);

    // Upcoming
    const futureTrainings = trainings
      .filter((t) => t.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const futureMatches = matches
      .filter((m) => m.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const nextTraining = futureTrainings[0] ?? null;
    const nextMatch    = futureMatches[0]   ?? null;

    // Past (for stats)
    const pastMatches = matches
      .filter((m) => m.date < today && m.score_team != null && m.score_opponent != null)
      .sort((a, b) => b.date.localeCompare(a.date));
    const last5 = pastMatches.slice(0, 5);

    // Season bilan
    const wins   = pastMatches.filter((m) => m.score_team! > m.score_opponent!).length;
    const draws  = pastMatches.filter((m) => m.score_team! === m.score_opponent!).length;
    const losses = pastMatches.filter((m) => m.score_team! < m.score_opponent!).length;
    const gf = pastMatches.reduce((s, m) => s + (m.score_team ?? 0), 0);
    const ga = pastMatches.reduce((s, m) => s + (m.score_opponent ?? 0), 0);

    // Win rate
    const winRate = pastMatches.length > 0 ? Math.round((wins / pastMatches.length) * 100) : 0;

    // Goal DNA
    const dna = { off: [0, 0], trans: [0, 0], cpa: [0, 0], sup: [0, 0] }; // [scored, conceded]
    pastMatches.forEach((m) => {
      const gb = (m as any).goals_by_type    ?? {};
      const cb = (m as any).conceded_by_type ?? {};
      dna.off[0]   += gb.offensive ?? 0; dna.off[1]   += cb.offensive ?? 0;
      dna.trans[0] += gb.transition ?? 0; dna.trans[1] += cb.transition ?? 0;
      dna.cpa[0]   += gb.cpa ?? 0;       dna.cpa[1]   += cb.cpa ?? 0;
      dna.sup[0]   += gb.superiority ?? 0; dna.sup[1]  += cb.superiority ?? 0;
    });
    const dnaMax = Math.max(
      dna.off[0], dna.off[1], dna.trans[0], dna.trans[1],
      dna.cpa[0], dna.cpa[1], dna.sup[0],   dna.sup[1], 1
    );

    // Shots efficiency — inferred from score + goals_by_type
    const totalGoals     = gf;
    const matchCount     = pastMatches.length;
    const goalsPerMatch  = matchCount ? +(gf / matchCount).toFixed(1) : 0;
    const concededPerM   = matchCount ? +(ga / matchCount).toFixed(1) : 0;

    // Recent trainings (last 5 sorted desc)
    const recentTrainings = [...trainings]
      .filter((t) => t.date <= today)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);

    // Last 5 training IDs (for heatmap ordering, oldest → newest)
    const last5TrainingIds = [...recentTrainings].reverse().map((t) => t.id);
    const trainingDateById = Object.fromEntries(trainings.map((t) => [t.id, t.date]));

    // Attendance per session (for recent training cards)
    const attendanceBySession = recentTrainings.map((t) => {
      const att = t.attendance ?? {};
      const present = Object.values(att).filter((v) => v === 'present' || v === 'late').length;
      return { training: t, present, total: Object.keys(att).length };
    });

    // Training themes (for season tab)
    const themeCount: Record<string, number> = {};
    trainings.forEach((t) => {
      if (t.theme) themeCount[t.theme] = (themeCount[t.theme] ?? 0) + 1;
    });
    const themes = Object.entries(themeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Attendance rate per player: (present + late) / sessions where player was convoked
    const convokedCount: Record<string, number> = {};
    const presentCount: Record<string, number> = {};
    trainings.filter((t) => t.date <= today).forEach((t) => {
      const att = t.attendance ?? {};
      Object.entries(att).forEach(([pid, status]) => {
        convokedCount[pid] = (convokedCount[pid] ?? 0) + 1;
        if (status === 'present' || status === 'late') {
          presentCount[pid] = (presentCount[pid] ?? 0) + 1;
        }
      });
    });
    const attendanceRate: Record<string, number> = {};
    players.forEach((p) => {
      const convoked = convokedCount[p.id] ?? 0;
      attendanceRate[p.id] = convoked > 0
        ? Math.round(((presentCount[p.id] ?? 0) / convoked) * 100)
        : 0;
    });

    // Feedback per player per session
    const feedbackMap: Record<string, Record<string, TeamFeedbackRow>> = {};
    feedback.forEach((f) => {
      if (!feedbackMap[f.player_id]) feedbackMap[f.player_id] = {};
      feedbackMap[f.player_id][f.training_id] = f;
    });

    // RPE + Form avg (last 5 sessions)
    const rpeVals  = feedback
      .filter((f) => last5TrainingIds.includes(f.training_id) && f.rpe != null)
      .map((f) => f.rpe as number);
    const rpeAvg = rpeVals.length ? +(rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length).toFixed(1) : null;
    const formVals = feedback
      .filter((f) => last5TrainingIds.includes(f.training_id) && f.physical_form != null)
      .map((f) => f.physical_form as number);
    const formAvg = formVals.length ? +(formVals.reduce((a, b) => a + b, 0) / formVals.length).toFixed(1) : null;

    // Player form scores (avg wellbeing across last 5 sessions)
    const playerForm: Record<string, number | null> = {};
    players.forEach((p) => {
      const rows = Object.values(feedbackMap[p.id] ?? {});
      playerForm[p.id] = wellnessScore(rows);
    });

    // Squad availability
    const squadStatus: Record<string, 'green' | 'amber' | 'red'> = {};
    players.forEach((p) => {
      const form = playerForm[p.id];
      const att  = attendanceRate[p.id] ?? 0;
      if (form !== null && form < 5)  { squadStatus[p.id] = 'red';   return; }
      if (form !== null && form < 7)  { squadStatus[p.id] = 'amber'; return; }
      if (att < 50)                   { squadStatus[p.id] = 'amber'; return; }
      squadStatus[p.id] = 'green';
    });
    const greenCount = Object.values(squadStatus).filter((s) => s === 'green').length;
    const amberCount = Object.values(squadStatus).filter((s) => s === 'amber').length;
    const redCount   = Object.values(squadStatus).filter((s) => s === 'red').length;

    // Players sorted by form (best first)
    const playersSortedByForm = [...players].sort((a, b) => {
      const fa = playerForm[a.id] ?? -1;
      const fb = playerForm[b.id] ?? -1;
      return fb - fa;
    });

    // Home/away split
    const home = pastMatches.filter((m) => (m.location ?? '').toLowerCase().includes('dom'));
    const away = pastMatches.filter((m) => !((m.location ?? '').toLowerCase().includes('dom')));
    const homeWR = home.length ? Math.round((home.filter((m) => m.score_team! > m.score_opponent!).length / home.length) * 100) : null;
    const awayWR = away.length ? Math.round((away.filter((m) => m.score_team! > m.score_opponent!).length / away.length) * 100) : null;

    // Current streak
    let streak = { count: 0, type: '' as 'V' | 'N' | 'D' | '' };
    for (const m of last5) {
      const r = matchResult(m);
      const type = r === 'W' ? 'V' : r === 'D' ? 'N' : 'D';
      if (!streak.type) { streak = { count: 1, type }; }
      else if (streak.type === type) { streak.count++; }
      else break;
    }

    // ── Attendance evolution (all sessions, chronological) ────────────────
    // Includes players from all teams present in the attendance record
    const sessionAttHistory = [...trainings]
      .filter((t) => t.date <= today && t.attendance && Object.keys(t.attendance).length > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => ({
        date:  t.date,
        label: format(parseISO(t.date), 'd/MM'),
        count: Object.values(t.attendance ?? {}).filter((v) => v === 'present' || v === 'late').length,
      }));

    // ── Goals per match, chronological (for stacked bar) ─────────────────
    const matchGoalsHistory = [...pastMatches]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((m) => {
        const gb = (m as any).goals_by_type    ?? {};
        const cb = (m as any).conceded_by_type ?? {};
        return {
          label:    format(parseISO(m.date), 'd/MM'),
          scored:   m.score_team    ?? 0,
          conceded: m.score_opponent ?? 0,
          result:   matchResult(m),
          scoredByType: {
            offensive:   gb.offensive   ?? 0,
            transition:  gb.transition  ?? 0,
            cpa:         gb.cpa         ?? 0,
            superiority: gb.superiority ?? 0,
          },
          concededByType: {
            offensive:   cb.offensive   ?? 0,
            transition:  cb.transition  ?? 0,
            cpa:         cb.cpa         ?? 0,
            superiority: cb.superiority ?? 0,
          },
        };
      });

    return {
      nextTraining, nextMatch,
      last5, last5TrainingIds, trainingDateById,
      wins, draws, losses, gf, ga, winRate, matchCount,
      goalsPerMatch, concededPerM, totalGoals,
      dna, dnaMax,
      recentTrainings, attendanceBySession,
      themes, themeCount,
      attendanceRate, feedbackMap,
      playerForm, playersSortedByForm, squadStatus,
      greenCount, amberCount, redCount,
      rpeAvg, formAvg,
      homeWR, awayWR,
      streak,
      futureTrainings, futureMatches,
      sessionAttHistory,
      matchGoalsHistory,
    };
  }, [trainings, matches, players, feedback]);

  // ── Ranking stats (M/V/N/D/Buts/Présence/Forme) with competition filter ───
  const rankData = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const filtered = matches
      .filter(m => m.date < today && m.score_team != null && m.score_opponent != null)
      .filter(m => rankCompFilter === 'all' || (m.competition ?? '') === rankCompFilter);

    return players.map(p => {
      let matchesPlayed = 0, victories = 0, draws = 0, defeats = 0, goals = 0;
      for (const m of filtered) {
        try {
          const arr: { id: string; goals?: number }[] = Array.isArray(m.players)
            ? (m.players as { id: string; goals?: number }[])
            : JSON.parse((m.players as string | undefined) ?? '[]');
          const entry = arr.find(pm => pm.id === p.id);
          if (!entry) continue;
          matchesPlayed++;
          goals += entry.goals ?? 0;
          if (m.score_team! > m.score_opponent!) victories++;
          else if (m.score_team! === m.score_opponent!) draws++;
          else defeats++;
        } catch { /* JSON malformé */ }
      }
      return { player: p, matches: matchesPlayed, victories, draws, defeats, goals, att: data.attendanceRate[p.id] ?? 0, form: data.playerForm[p.id] ?? null };
    });
  }, [players, matches, rankCompFilter, data.attendanceRate, data.playerForm]);

  const rankSortedData = useMemo(() => {
    return [...rankData].sort((a, b) => {
      const dir = rankSort.dir === 'asc' ? 1 : -1;
      if (rankSort.key === 'name')
        return dir * `${a.player.last_name} ${a.player.first_name}`.localeCompare(`${b.player.last_name} ${b.player.first_name}`, 'fr');
      const map: Record<RankSortKey, number> = {
        name: 0, matches: a.matches - b.matches, victories: a.victories - b.victories,
        draws: a.draws - b.draws, defeats: a.defeats - b.defeats,
        goals: a.goals - b.goals, att: a.att - b.att,
        form: (a.form ?? -1) - (b.form ?? -1),
      };
      return dir * (map[rankSort.key] ?? 0);
    });
  }, [rankData, rankSort]);

  // ── Empty / loading states ────────────────────────────────────────────────
  if (!activeTeamId || !activeTeam) {
    return (
      <View style={s.centered}>
        <Ionicons name="trophy-outline" size={48} color={C.light} />
        <Text style={s.noTeamTitle}>Aucune équipe sélectionnée</Text>
        <Text style={s.noTeamText}>Choisissez une équipe pour voir votre Intelligence Coach.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={C.blue} />
        <Text style={[s.noTeamText, { marginTop: 12 }]}>Chargement du dashboard…</Text>
      </View>
    );
  }

  const ctx = weekDayContext();

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue} />}
    >
      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <View style={s.hero}>
        <View style={{ flex: 1 }}>
          <Text style={s.heroTeam}>{activeTeam.name}</Text>
          <Text style={s.heroDate}>
            {format(now, "EEEE d MMMM yyyy", { locale: fr })}
          </Text>
          <TouchableOpacity
            onPress={() => availableSeasons.length > 1 && setSeasonPickerOpen(true)}
            style={[s.seasonPill, activeSeason !== clubSeason && s.seasonPillPast]}
          >
            <Ionicons name="calendar-outline" size={11} color={activeSeason !== clubSeason ? '#fbbf24' : 'rgba(255,255,255,0.8)'} />
            <Text style={s.seasonPillText}>Saison {activeSeason}</Text>
            {availableSeasons.length > 1 && (
              <Ionicons name="chevron-down" size={10} color="rgba(255,255,255,0.6)" />
            )}
          </TouchableOpacity>
          <View style={s.heroCtxRow}>
            <Text style={s.heroCtxIcon}>{ctx.icon}</Text>
            <View>
              <Text style={s.heroCtxPhase}>{ctx.phase}</Text>
              <Text style={s.heroCtxAdvice}>{ctx.advice}</Text>
            </View>
          </View>
        </View>
        <View style={s.heroBilan}>
          <Text style={s.heroBilanVal}>{data.wins}V</Text>
          <Text style={s.heroBilanSep}>·</Text>
          <Text style={[s.heroBilanVal, { color: '#fbbf24' }]}>{data.draws}N</Text>
          <Text style={s.heroBilanSep}>·</Text>
          <Text style={[s.heroBilanVal, { color: '#f87171' }]}>{data.losses}D</Text>
        </View>
      </View>

      {/* ── Season picker ─────────────────────────────────────────────────── */}
      <Modal visible={seasonPickerOpen} transparent animationType="fade" onRequestClose={() => setSeasonPickerOpen(false)}>
        <TouchableOpacity style={s.seasonModalOverlay} activeOpacity={1} onPress={() => setSeasonPickerOpen(false)}>
          <View style={s.seasonModalBox}>
            <Text style={s.seasonModalTitle}>Choisir une saison</Text>
            {availableSeasons.map((sn) => (
              <TouchableOpacity
                key={sn}
                onPress={() => { changeActiveSeason(sn); setSeasonPickerOpen(false); }}
                style={[s.seasonModalRow, sn === activeSeason && s.seasonModalRowActive]}
              >
                <Text style={[s.seasonModalRowText, sn === activeSeason && { color: C.blue, fontWeight: '700' }]}>{sn}</Text>
                {sn === clubSeason && <Text style={s.seasonModalActiveTag}>ACTIVE</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Next events strip ────────────────────────────────────────────── */}
      <View style={s.nextRow}>
        {data.nextTraining && (
          <TouchableOpacity
            style={[s.nextCard, { borderLeftColor: C.blue }]}
            onPress={() => router.push(`/calendar/training/${data.nextTraining!.id}` as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="barbell-outline" size={16} color={C.blue} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={s.nextCardTitle} numberOfLines={1}>
                {data.nextTraining.theme || 'Entraînement'}
              </Text>
              <Text style={s.nextCardMeta}>
                {format(parseISO(data.nextTraining.date), 'EEE d MMM', { locale: fr })}
                {data.nextTraining.date === now.toISOString().slice(0, 10) ? ' · Aujourd\'hui' :
                  ` · J-${differenceInDays(parseISO(data.nextTraining.date), now)}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={C.light} />
          </TouchableOpacity>
        )}
        {data.nextMatch && (
          <TouchableOpacity
            style={[s.nextCard, { borderLeftColor: C.amber }]}
            onPress={() => router.push(`/calendar/matchDetail/${data.nextMatch!.id}` as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="football-outline" size={16} color={C.amber} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={s.nextCardTitle} numberOfLines={1}>
                vs {data.nextMatch.opponent_team || data.nextMatch.title || 'Adversaire'}
              </Text>
              <Text style={s.nextCardMeta}>
                {format(parseISO(data.nextMatch.date), 'EEE d MMM', { locale: fr })}
                {data.nextMatch.date === now.toISOString().slice(0, 10) ? ' · Aujourd\'hui' :
                  ` · J-${differenceInDays(parseISO(data.nextMatch.date), now)}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={C.light} />
          </TouchableOpacity>
        )}
        {!data.nextTraining && !data.nextMatch && (
          <View style={[s.nextCard, { borderLeftColor: C.light, flex: 1 }]}>
            <Text style={[s.nextCardMeta, { color: C.muted }]}>Aucun événement à venir</Text>
          </View>
        )}
      </View>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <View style={s.tabBar}>
        {([['week', 'Semaine'], ['season', 'Saison'], ['squad', 'Effectif']] as [TabId, string][]).map(([id, label]) => (
          <TouchableOpacity
            key={id}
            style={[s.tabBtn, tab === id && s.tabBtnActive]}
            onPress={() => setTab(id)}
            activeOpacity={0.8}
          >
            <Text style={[s.tabLabel, tab === id && s.tabLabelActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ════════════════════════════════════════════════════════════════════
          TAB — SEMAINE
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'week' && (
        <>
          {/* ── Squad availability ─────────────────────────────────── */}
          <SectionCard title="Disponibilité effectif" icon="people">
            <View style={s.availRow}>
              <AvailChip count={data.greenCount} label="Disponibles" color={C.green}   bg={C.greenBg}  />
              <AvailChip count={data.amberCount} label="Surveillance" color={C.amber}  bg={C.amberBg}  />
              <AvailChip count={data.redCount}   label="Alertes"     color={C.red}     bg={C.redBg}    />
            </View>
            {data.redCount > 0 && (
              <View style={s.alertBanner}>
                <Ionicons name="warning" size={14} color={C.red} />
                <Text style={s.alertBannerText}>
                  {data.playersSortedByForm
                    .filter((p) => data.squadStatus[p.id] === 'red')
                    .map((p) => `${p.first_name} ${p.last_name}`)
                    .join(', ')} — État critique signalé
                </Text>
              </View>
            )}
          </SectionCard>

          {/* ── Questionnaires heatmap ─────────────────────────────── */}
          {data.last5TrainingIds.length > 0 && (
            <SectionCard title="Questionnaires — 5 dernières séances" icon="heart-outline">
              {/* Metric filter chips */}
              <View style={s.heatmapFilterRow}>
                {HEATMAP_METRICS.map(({ key, label }) => (
                  <TouchableOpacity
                    key={key}
                    style={[s.heatmapFilterChip, heatmapMetric === key && s.heatmapFilterChipActive]}
                    onPress={() => setHeatmapMetric(key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.heatmapFilterLabel, heatmapMetric === key && s.heatmapFilterLabelActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Column headers */}
              <View style={s.heatmapHeader}>
                <View style={{ width: 60 }} />
                {data.last5TrainingIds.map((tid) => (
                  <View key={tid} style={s.heatmapColHeader}>
                    <Text style={s.heatmapColLabel}>
                      {data.trainingDateById[tid]
                        ? format(parseISO(data.trainingDateById[tid]), 'd/MM')
                        : '—'}
                    </Text>
                  </View>
                ))}
                <View style={{ width: 36 }} />
              </View>

              {/* Player rows */}
              {players.map((p) => {
                const metricRows = Object.values(data.feedbackMap[p.id] ?? {});
                const metricVals = metricRows
                  .map(r => r[heatmapMetric])
                  .filter((v): v is number => v != null);
                const avgScore = metricVals.length
                  ? +(metricVals.reduce((a, b) => a + b, 0) / metricVals.length).toFixed(1)
                  : null;
                return (
                  <View key={p.id} style={s.heatmapRow}>
                    <Text style={s.heatmapPlayerLabel} numberOfLines={1}>{abbrev(p)} {p.last_name}</Text>
                    {data.last5TrainingIds.map((tid) => {
                      const row = data.feedbackMap[p.id]?.[tid] ?? null;
                      const val = row ? (row[heatmapMetric] ?? null) : null;
                      return (
                        <View key={tid} style={[s.heatmapCell, { backgroundColor: metricBg(heatmapMetric, val) }]}>
                          <Text style={[s.heatmapCellText, { color: metricColor(heatmapMetric, val) }]}>
                            {val !== null ? String(val) : '—'}
                          </Text>
                        </View>
                      );
                    })}
                    <View style={[s.heatmapAvgPill, { borderColor: metricColor(heatmapMetric, avgScore) }]}>
                      <Text style={[s.heatmapAvgText, { color: metricColor(heatmapMetric, avgScore) }]}>
                        {avgScore !== null ? avgScore.toFixed(1) : '—'}
                      </Text>
                    </View>
                  </View>
                );
              })}

              {/* Legend */}
              <View style={s.heatmapLegendRow}>
                {(heatmapMetric === 'rpe'
                  ? [
                      { label: '<4 Faible',   color: C.blue,  bg: C.blueBg  },
                      { label: '4-7 Optimal', color: C.green, bg: C.greenBg },
                      { label: '>7 Élevé',    color: C.amber, bg: C.amberBg },
                      { label: '>8.5 Surm.',  color: C.red,   bg: C.redBg   },
                    ]
                  : [
                      { label: '≥7 Bien',    color: C.green, bg: C.greenBg },
                      { label: '5-6 Moyen',  color: C.amber, bg: C.amberBg },
                      { label: '<5 Alerte',  color: C.red,   bg: C.redBg   },
                      { label: 'N/A',        color: C.light, bg: '#f8fafc' },
                    ]
                ).map((l) => (
                  <View key={l.label} style={[s.heatmapLegendItem, { backgroundColor: l.bg }]}>
                    <Text style={[s.heatmapLegendText, { color: l.color }]}>{l.label}</Text>
                  </View>
                ))}
              </View>
            </SectionCard>
          )}

          {/* ── RPE charge gauge ───────────────────────────────────── */}
          <SectionCard title="Charge de travail — 5 dernières séances" icon="fitness-outline">
            {(data.rpeAvg !== null || data.formAvg !== null) ? (
              <>
                {/* Two KPI blocks */}
                <View style={s.workloadRow}>
                  <View style={s.workloadBlock}>
                    <Text style={s.workloadLabel}>RPE MOYEN</Text>
                    <View style={s.workloadValRow}>
                      <Text style={[s.workloadVal, { color: metricColor('rpe', data.rpeAvg) }]}>
                        {data.rpeAvg ?? '—'}
                      </Text>
                      {data.rpeAvg !== null && <Text style={s.workloadUnit}>/10</Text>}
                    </View>
                    {data.rpeAvg !== null && (
                      <View style={[s.workloadBadge, { backgroundColor: metricBg('rpe', data.rpeAvg) }]}>
                        <Text style={[s.workloadBadgeText, { color: metricColor('rpe', data.rpeAvg) }]}>
                          {rpeLabel(data.rpeAvg).label}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={s.workloadDivider} />

                  <View style={s.workloadBlock}>
                    <Text style={s.workloadLabel}>FORME MOYENNE</Text>
                    <View style={s.workloadValRow}>
                      <Text style={[s.workloadVal, { color: wellnessColor(data.formAvg) }]}>
                        {data.formAvg ?? '—'}
                      </Text>
                      {data.formAvg !== null && <Text style={s.workloadUnit}>/10</Text>}
                    </View>
                    {data.formAvg !== null && (
                      <View style={[s.workloadBadge, { backgroundColor: wellnessBg(data.formAvg) }]}>
                        <Text style={[s.workloadBadgeText, { color: wellnessColor(data.formAvg) }]}>
                          {data.formAvg >= 7 ? 'Bonne forme' : data.formAvg >= 5 ? 'Forme correcte' : 'Fatigue'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

              </>
            ) : (
              <Text style={s.emptyCard}>Aucune donnée de questionnaire disponible</Text>
            )}
          </SectionCard>

          {/* ── Recent sessions ────────────────────────────────────── */}
          <SectionCard title="Séances récentes" icon="calendar-outline">
            {data.attendanceBySession.length === 0 && (
              <Text style={s.emptyCard}>Aucune séance passée</Text>
            )}
            {data.attendanceBySession.map(({ training: t, present, total }) => (
              <TouchableOpacity
                key={t.id}
                style={s.sessionRow}
                onPress={() => router.push(`/calendar/training/${t.id}` as any)}
                activeOpacity={0.8}
              >
                <View style={s.sessionDate}>
                  <Text style={s.sessionDay}>{format(parseISO(t.date), 'd', { locale: fr })}</Text>
                  <Text style={s.sessionMonth}>{format(parseISO(t.date), 'MMM', { locale: fr })}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sessionTheme} numberOfLines={1}>{t.theme || '—'}</Text>
                  {t.key_principle && (
                    <Text style={s.sessionPrinciple} numberOfLines={1}>↳ {t.key_principle}</Text>
                  )}
                </View>
                <View style={[s.sessionAttBadge, {
                  backgroundColor: present >= total * 0.8 ? C.greenBg : present >= total * 0.6 ? C.amberBg : C.redBg
                }]}>
                  <Text style={[s.sessionAttText, {
                    color: present >= total * 0.8 ? C.green : present >= total * 0.6 ? C.amber : C.red
                  }]}>
                    {present}/{total}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </SectionCard>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB — SAISON
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'season' && (
        <>
          {/* ── Form guide ─────────────────────────────────────────── */}
          <SectionCard title="Forme récente" icon="trending-up-outline">
            {data.last5.length === 0 ? (
              <Text style={s.emptyCard}>Aucun match joué</Text>
            ) : (
              <>
                <View style={s.formRow}>
                  {data.last5.map((m) => {
                    const r = matchResult(m);
                    const bg   = r === 'W' ? C.green  : r === 'D' ? C.amber  : C.red;
                    const bgLt = r === 'W' ? C.greenBg: r === 'D' ? C.amberBg: C.redBg;
                    return (
                      <View key={m.id} style={s.formItem}>
                        <View style={[s.formDot, { backgroundColor: bgLt, borderColor: bg }]}>
                          <Text style={[s.formDotLabel, { color: bg }]}>{r === 'W' ? 'V' : r}</Text>
                        </View>
                        <Text style={s.formScore}>{m.score_team}–{m.score_opponent}</Text>
                        <Text style={s.formOpp} numberOfLines={1}>
                          {(m.opponent_team || m.title || '').slice(0, 8)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                {data.streak.count >= 2 && (
                  <View style={s.streakBanner}>
                    <Text style={s.streakText}>
                      🔥 Série de {data.streak.count} {data.streak.type === 'V' ? 'victoires' : data.streak.type === 'N' ? 'nuls' : 'défaites'} consécutive{data.streak.count > 1 ? 's' : ''}
                    </Text>
                  </View>
                )}
              </>
            )}
          </SectionCard>

          {/* ── Season bilan ───────────────────────────────────────── */}
          <SectionCard title="Bilan de saison" icon="trophy-outline">
            <View style={s.bilanGrid}>
              <BilanCard value={data.matchCount} label="Matchs"    color={C.blue}   />
              <BilanCard value={`${data.winRate}%`} label="% Victoires" color={C.green} />
              <BilanCard value={`${data.gf}`}    label="Buts marqués" color={C.navy}   />
              <BilanCard value={`${data.ga}`}    label="Buts encaissés" color={C.red}  />
              <BilanCard value={`${data.gf - data.ga > 0 ? '+' : ''}${data.gf - data.ga}`} label="Différentiel" color={(data.gf - data.ga) >= 0 ? C.green : C.red} />
              <BilanCard value={`${data.goalsPerMatch}`} label="Buts/match" color={C.purple} />
            </View>
            {/* Home/Away split */}
            {(data.homeWR !== null || data.awayWR !== null) && (
              <View style={s.locationRow}>
                {data.homeWR !== null && (
                  <View style={[s.locationChip, { backgroundColor: C.greenBg }]}>
                    <Text style={[s.locationChipLabel, { color: C.green }]}>🏠 Domicile</Text>
                    <Text style={[s.locationChipVal, { color: C.green }]}>{data.homeWR}% W</Text>
                  </View>
                )}
                {data.awayWR !== null && (
                  <View style={[s.locationChip, { backgroundColor: C.amberBg }]}>
                    <Text style={[s.locationChipLabel, { color: C.amber }]}>✈️ Extérieur</Text>
                    <Text style={[s.locationChipVal, { color: C.amber }]}>{data.awayWR}% W</Text>
                  </View>
                )}
              </View>
            )}
          </SectionCard>

          {/* ── Attendance evolution ───────────────────────────────── */}
          <SectionCard title="Présence en séance — Saison" icon="people-outline">
            <Text style={s.heatmapLegend}>
              Nombre de joueurs présents par séance (équipe + invités)
            </Text>
            <AttendanceLineChart data={data.sessionAttHistory} />
          </SectionCard>

          {/* ── Goals per match ────────────────────────────────────── */}
          <SectionCard title="Buts par match — Saison" icon="football-outline">
            {/* Type legend */}
            <View style={s.chartLegendRow}>
              {[
                { color: '#2563eb', label: 'Phase Off.' },
                { color: '#7c3aed', label: 'Transition' },
                { color: '#d97706', label: 'CPA' },
                { color: '#16a34a', label: 'Supériorité' },
                { color: '#94a3b8', label: 'N/C' },
              ].map((t) => (
                <View key={t.label} style={s.chartTypeLegendItem}>
                  <View style={[s.chartLegendDot, { backgroundColor: t.color }]} />
                  <Text style={s.chartLegendText}>{t.label}</Text>
                </View>
              ))}
            </View>
            <Text style={[s.heatmapLegend, { marginBottom: 8 }]}>
              Couleurs vives = marqués · Estompés = encaissés
            </Text>
            <GoalsStackedBarChart data={data.matchGoalsHistory} />
          </SectionCard>

          {/* ── Goal DNA ───────────────────────────────────────────── */}
          <SectionCard title="DNA des buts" icon="analytics-outline">
            <Text style={s.heatmapLegend}>Comment on marque et comment on encaisse</Text>
            {[
              { label: 'Phase Offens.', scored: data.dna.off[0],   conceded: data.dna.off[1],   color: C.blue   },
              { label: 'Transition',   scored: data.dna.trans[0],  conceded: data.dna.trans[1],  color: C.purple },
              { label: 'CPA',          scored: data.dna.cpa[0],    conceded: data.dna.cpa[1],    color: C.amber  },
              { label: 'Supériorité',  scored: data.dna.sup[0],    conceded: data.dna.sup[1],    color: C.green  },
            ].map((row) => (
              <View key={row.label} style={s.dnaRow}>
                <Text style={s.dnaLabel}>{row.label}</Text>
                <View style={s.dnaBars}>
                  {/* Scored bar */}
                  <View style={s.dnaBarTrack}>
                    <View style={[s.dnaBarFill, {
                      width: `${(row.scored / data.dnaMax) * 100}%` as any,
                      backgroundColor: row.color,
                    }]} />
                  </View>
                  <Text style={[s.dnaCount, { color: row.color }]}>{row.scored}</Text>
                  <Text style={s.dnaSep}>·</Text>
                  {/* Conceded bar */}
                  <View style={s.dnaBarTrack}>
                    <View style={[s.dnaBarFill, {
                      width: `${(row.conceded / data.dnaMax) * 100}%` as any,
                      backgroundColor: C.red,
                    }]} />
                  </View>
                  <Text style={[s.dnaCount, { color: C.red }]}>{row.conceded}</Text>
                </View>
              </View>
            ))}
            <View style={s.dnaLegendRow}>
              <View style={[s.dnaLegendDot, { backgroundColor: C.blue }]} />
              <Text style={s.dnaLegendText}>Buts marqués</Text>
              <View style={[s.dnaLegendDot, { backgroundColor: C.red, marginLeft: 12 }]} />
              <Text style={s.dnaLegendText}>Buts encaissés</Text>
            </View>
          </SectionCard>

          {/* ── Training themes ────────────────────────────────────── */}
          {data.themes.length > 0 && (
            <SectionCard title="Thèmes travaillés" icon="school-outline">
              <Text style={s.heatmapLegend}>Principes les plus répétés en entraînement</Text>
              {data.themes.map(([theme, count], i) => (
                <View key={theme} style={s.themeRow}>
                  <Text style={s.themeRank}>#{i + 1}</Text>
                  <Text style={s.themeLabel} numberOfLines={1}>{theme}</Text>
                  <View style={s.themeBarTrack}>
                    <View style={[s.themeBarFill, {
                      width: `${(count / data.themes[0][1]) * 100}%` as any,
                    }]} />
                  </View>
                  <Text style={s.themeCount}>{count}×</Text>
                </View>
              ))}
            </SectionCard>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB — EFFECTIF
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'squad' && (
        <>
          {/* ── Alerts first ───────────────────────────────────────── */}
          {data.playersSortedByForm.filter((p) => data.squadStatus[p.id] === 'red').length > 0 && (
            <SectionCard title="Alertes joueurs" icon="warning-outline">
              {data.playersSortedByForm
                .filter((p) => data.squadStatus[p.id] === 'red')
                .map((p) => {
                  const fb = Object.values(data.feedbackMap[p.id] ?? {}).slice(-1)[0];
                  return (
                    <View key={p.id} style={s.alertRow}>
                      <View style={s.alertDot} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.alertName}>{p.first_name} {p.last_name}</Text>
                        <Text style={s.alertDetail}>
                          {fb?.rpe != null ? `RPE ${fb.rpe}/10` : ''}
                          {fb?.pleasure != null ? ` · Plaisir ${fb.pleasure}/10` : ''}
                          {fb?.physical_form != null ? ` · Forme ${fb.physical_form}/10` : ''}
                          {!fb ? 'Aucune réponse au questionnaire' : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })}
            </SectionCard>
          )}

          {/* ── Classement Matchs et Forme ────────────────────────── */}
          <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
            <View style={[s.cardHeader, { marginHorizontal: 16, marginTop: 16, marginBottom: 8 }]}>
              <View style={s.cardAccent} />
              <Ionicons name="stats-chart-outline" size={16} color={C.navy} />
              <Text style={s.cardTitle}>Classement Matchs et Forme</Text>
            </View>

            {/* Competition filter */}
            <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 8, flexWrap: 'wrap' }}>
              {COMP_FILTERS.map(f => (
                <TouchableOpacity
                  key={f.value}
                  onPress={() => setRankCompFilter(f.value)}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1,
                    backgroundColor: rankCompFilter === f.value ? C.navy : '#f8fafc',
                    borderColor: rankCompFilter === f.value ? C.navy : C.border,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: rankCompFilter === f.value ? '#fff' : C.muted }}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Table header */}
            {(() => {
              const cols: { key: RankSortKey; label: string; flex?: number; width?: number; align?: 'center' | 'left' }[] = [
                { key: 'name',      label: 'NOM',   flex: 1, align: 'left'   },
                { key: 'form',      label: 'Forme', width: 46, align: 'center' },
                { key: 'matches',   label: 'M',     align: 'center' },
                { key: 'victories', label: 'V',     align: 'center' },
                { key: 'draws',     label: 'N',     align: 'center' },
                { key: 'defeats',   label: 'D',     align: 'center' },
                { key: 'goals',     label: 'Buts',  align: 'center' },
                { key: 'att',       label: 'Prés.', align: 'center' },
              ];
              return (
                <>
                  <View style={[s.fmHead, { paddingHorizontal: 0 }]}>
                    <View style={{ width: 3 }} />
                    <View style={s.fmColRank}><Text style={s.fmHeadTxt}>#</Text></View>
                    {cols.map(col => (
                      <TouchableOpacity
                        key={col.key}
                        style={col.flex ? { flex: col.flex, paddingRight: 4 } : { width: col.width ?? 38 }}
                        onPress={() => handleRankSort(col.key)}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          s.fmHeadTxt,
                          col.align === 'center' && { textAlign: 'center' },
                          rankSort.key === col.key && s.fmHeadTxtActive,
                        ]}>
                          {col.label}{rankSort.key === col.key ? (rankSort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {rankSortedData.map((row, i) => {
                    const attColor = row.att >= 80 ? C.green : row.att >= 60 ? C.amber : C.red;
                    return (
                      <TouchableOpacity
                        key={row.player.id}
                        style={[s.fmRow, { backgroundColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' }]}
                        onPress={() => router.push(`/squad/${row.player.id}` as any)}
                        activeOpacity={0.6}
                      >
                        <View style={[s.fmStripe, { backgroundColor: C.navy }]} />
                        <View style={s.fmColRank}>
                          <Text style={s.fmRankTxt}>{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1, paddingRight: 4 }}>
                          <Text style={s.fmLastName} numberOfLines={1}>{row.player.last_name.toUpperCase()}</Text>
                          <Text style={s.fmFirstName} numberOfLines={1}>{row.player.first_name}</Text>
                        </View>
                        <View style={[s.fmColForme, { width: 46 }]}>
                          <View style={[s.fmFormPill, { backgroundColor: wellnessBg(row.form) }]}>
                            <Text style={[s.fmFormVal, { color: wellnessColor(row.form) }]}>
                              {row.form !== null ? row.form.toFixed(1) : '—'}
                            </Text>
                          </View>
                        </View>
                        <View style={{ width: 38, alignItems: 'center' }}>
                          <Text style={s.fmStatNum}>{row.matches}</Text>
                        </View>
                        <View style={{ width: 38, alignItems: 'center' }}>
                          <Text style={[s.fmStatNum, row.victories > 0 && { color: C.green, fontWeight: '700' }]}>{row.victories}</Text>
                        </View>
                        <View style={{ width: 38, alignItems: 'center' }}>
                          <Text style={[s.fmStatNum, { color: C.amber }]}>{row.draws}</Text>
                        </View>
                        <View style={{ width: 38, alignItems: 'center' }}>
                          <Text style={[s.fmStatNum, row.defeats > 0 && { color: C.red }]}>{row.defeats}</Text>
                        </View>
                        <View style={{ width: 38, alignItems: 'center' }}>
                          <Text style={[s.fmStatNum, row.goals > 0 && { color: C.navy, fontWeight: '700' }]}>{row.goals}</Text>
                        </View>
                        <View style={{ width: 38, alignItems: 'center' }}>
                          <Text style={[s.fmStatNum, { color: attColor, fontWeight: '700', fontSize: 9 }]}>{row.att}%</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              );
            })()}
          </View>

          {/* ── Attendance summary ─────────────────────────────────── */}
          <SectionCard title="Fidélité à l'entraînement" icon="people-circle-outline">
            {[
              { label: '≥ 80% — Piliers', color: C.green, bg: C.greenBg,
                list: players.filter((p) => (data.attendanceRate[p.id] ?? 0) >= 80) },
              { label: '60–79% — Irréguliers', color: C.amber, bg: C.amberBg,
                list: players.filter((p) => { const a = data.attendanceRate[p.id] ?? 0; return a >= 60 && a < 80; }) },
              { label: '< 60% — Absents fréquents', color: C.red, bg: C.redBg,
                list: players.filter((p) => (data.attendanceRate[p.id] ?? 0) < 60) },
            ].map((group) => group.list.length > 0 && (
              <View key={group.label} style={{ marginBottom: 12 }}>
                <View style={[s.attendGroupHeader, { backgroundColor: group.bg }]}>
                  <Text style={[s.attendGroupLabel, { color: group.color }]}>{group.label}</Text>
                  <Text style={[s.attendGroupCount, { color: group.color }]}>{group.list.length}</Text>
                </View>
                <View style={s.attendPlayerRow}>
                  {group.list.map((p) => (
                    <View key={p.id} style={[s.attendPlayerChip, { borderColor: group.color }]}>
                      <Text style={[s.attendPlayerName, { color: group.color }]} numberOfLines={1}>
                        {p.first_name[0]}. {p.last_name}
                      </Text>
                      <Text style={[s.attendPlayerPct, { color: group.color }]}>
                        {data.attendanceRate[p.id] ?? 0}%
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </SectionCard>
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: {
  title: string; icon: string; children: React.ReactNode;
}) {
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={s.cardAccent} />
        <Ionicons name={icon as any} size={16} color={C.navy} />
        <Text style={s.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function AvailChip({ count, label, color, bg }: {
  count: number; label: string; color: string; bg: string;
}) {
  return (
    <View style={[s.availChip, { backgroundColor: bg, borderColor: color }]}>
      <Text style={[s.availCount, { color }]}>{count}</Text>
      <Text style={[s.availLabel, { color }]}>{label}</Text>
    </View>
  );
}

function BilanCard({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <View style={s.bilanCard}>
      <Text style={[s.bilanVal, { color }]}>{value}</Text>
      <Text style={s.bilanLabel}>{label}</Text>
    </View>
  );
}

// ─── SVG chart: attendance line ────────────────────────────────────────────────
function AttendanceLineChart({ data }: {
  data: { date: string; label: string; count: number }[];
}) {
  if (data.length === 0) {
    return <Text style={s.emptyCard}>Aucune séance enregistrée avec présences</Text>;
  }

  const CHART_H  = 110;
  const PAD_TOP  = 26;
  const PAD_BOT  = 26;
  const PAD_LEFT = 30;
  const PAD_RIGHT = 12;
  const SPACING  = 52;

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const totalW   = Math.max(data.length * SPACING + PAD_LEFT + PAD_RIGHT, 280);
  const svgH     = CHART_H + PAD_TOP + PAD_BOT;

  const toX = (i: number) => PAD_LEFT + i * SPACING + SPACING / 2;
  const toY = (v: number) => PAD_TOP + CHART_H - (v / maxCount) * CHART_H;

  const points = data.map((d, i) => `${toX(i)},${toY(d.count)}`).join(' ');

  const gridVals = [0, Math.round(maxCount * 0.5), maxCount].filter(
    (v, idx, arr) => arr.indexOf(v) === idx
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <Svg width={totalW} height={svgH}>
        {/* Grid lines */}
        {gridVals.map((val) => {
          const y = toY(val);
          return (
            <SvgLine key={`gl${val}`}
              x1={PAD_LEFT} y1={y} x2={totalW - PAD_RIGHT} y2={y}
              stroke="#e2e8f0" strokeWidth={1} />
          );
        })}
        {/* Y labels */}
        {gridVals.map((val) => (
          <SvgText key={`yl${val}`}
            x={PAD_LEFT - 4} y={toY(val) + 4}
            fontSize={9} fill="#94a3b8" textAnchor="end">
            {val}
          </SvgText>
        ))}
        {/* Polyline */}
        <Polyline
          points={points}
          fill="none"
          stroke={C.blue}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dots (outer) */}
        {data.map((d, i) => (
          <Circle key={`do${i}`} cx={toX(i)} cy={toY(d.count)} r={6} fill={C.navy} />
        ))}
        {/* Dots (inner white) */}
        {data.map((d, i) => (
          <Circle key={`di${i}`} cx={toX(i)} cy={toY(d.count)} r={3} fill="#ffffff" />
        ))}
        {/* Count labels above dots */}
        {data.map((d, i) => (
          <SvgText key={`cl${i}`}
            x={toX(i)} y={toY(d.count) - 11}
            fontSize={11} fill={C.navy} textAnchor="middle" fontWeight="bold">
            {d.count}
          </SvgText>
        ))}
        {/* Date labels */}
        {data.map((d, i) => (
          <SvgText key={`dl${i}`}
            x={toX(i)} y={svgH - 4}
            fontSize={9} fill="#64748b" textAnchor="middle">
            {d.label}
          </SvgText>
        ))}
      </Svg>
    </ScrollView>
  );
}

// ─── Goal-type colors (same palette for scored/conceded, opacity distinguishes) ─
const GOAL_TYPE_COLORS: Record<string, string> = {
  offensive:   '#2563eb',
  transition:  '#7c3aed',
  cpa:         '#d97706',
  superiority: '#16a34a',
  other:       '#94a3b8',
};
const GOAL_TYPE_ORDER = ['offensive', 'transition', 'cpa', 'superiority', 'other'] as const;

// ─── SVG chart: goals stacked bars with type breakdown ────────────────────────
function GoalsStackedBarChart({ data }: {
  data: {
    label: string;
    scored: number;
    conceded: number;
    result: 'W' | 'D' | 'L';
    scoredByType:   { offensive: number; transition: number; cpa: number; superiority: number };
    concededByType: { offensive: number; transition: number; cpa: number; superiority: number };
  }[];
}) {
  if (data.length === 0) {
    return <Text style={s.emptyCard}>Aucun match joué avec score enregistré</Text>;
  }

  const BAR_W     = 30;
  const CHART_H   = 120;
  const PAD_TOP   = 28;
  const PAD_BOT   = 26;
  const PAD_LEFT  = 30;
  const PAD_RIGHT = 12;
  const SPACING   = 52;

  const maxGoals = Math.max(...data.map((d) => d.scored + d.conceded), 1);
  const totalW   = Math.max(data.length * SPACING + PAD_LEFT + PAD_RIGHT, 280);
  const svgH     = CHART_H + PAD_TOP + PAD_BOT;
  const baseY    = PAD_TOP + CHART_H;

  const toH    = (v: number) => (v / maxGoals) * CHART_H;
  const barX   = (i: number) => PAD_LEFT + i * SPACING + (SPACING - BAR_W) / 2;
  const rColor = (r: 'W' | 'D' | 'L') => r === 'W' ? C.green : r === 'D' ? C.amber : C.red;

  const gridVals = [0, Math.round(maxGoals * 0.5), maxGoals].filter(
    (v, idx, arr) => arr.indexOf(v) === idx
  );

  // ── Pre-compute all rect data imperatively (avoids JSX fragment typing) ──
  type SegRect = { key: string; x: number; y: number; w: number; h: number; fill: string; opacity: number };
  type BarLabel = { key: string; x: number; y: number; text: string; fill: string };

  const rects:  SegRect[]  = [];
  const scLabels: BarLabel[] = [];
  const dtLabels: BarLabel[] = [];

  data.forEach((d, i) => {
    const bx  = barX(i);
    const cx  = bx + BAR_W / 2;

    // Helper: stack type segments from a starting Y upward
    const stackTypes = (
      total:  number,
      byType: { offensive: number; transition: number; cpa: number; superiority: number },
      startY: number,
      prefix: string,
      opacity: number,
      fallbackFill: string,
    ) => {
      const known =
        byType.offensive + byType.transition + byType.cpa + byType.superiority;
      const other = Math.max(total - known, 0);
      const counts: Record<string, number> = {
        offensive:   byType.offensive,
        transition:  byType.transition,
        cpa:         byType.cpa,
        superiority: byType.superiority,
        other,
      };

      let curY     = startY;
      let hadAny   = false;

      for (const type of GOAL_TYPE_ORDER) {
        const count = counts[type] ?? 0;
        if (count <= 0) continue;
        const h = toH(count);
        rects.push({
          key:     `${prefix}${type}${i}`,
          x:       bx,
          y:       curY - h,
          w:       BAR_W,
          h,
          fill:    GOAL_TYPE_COLORS[type],
          opacity,
        });
        curY   -= h;
        hadAny  = true;
      }

      // No type data → solid fallback bar
      if (!hadAny && total > 0) {
        const h = toH(total);
        rects.push({ key: `${prefix}solid${i}`, x: bx, y: startY - h, w: BAR_W, h, fill: fallbackFill, opacity: 1 });
      }
    };

    // Scored (bright, bottom)
    stackTypes(d.scored,   d.scoredByType,   baseY,                  'sc', 1.0,  C.blue);
    // Conceded (dimmed, stacked on top of scored)
    stackTypes(d.conceded, d.concededByType, baseY - toH(d.scored),  'co', 0.42, C.red);

    // Separator line between scored and conceded
    if (d.scored > 0 && d.conceded > 0) {
      rects.push({
        key: `sep${i}`, x: bx, y: baseY - toH(d.scored) - 1,
        w: BAR_W, h: 1.5, fill: '#ffffff', opacity: 1,
      });
    }

    const totalH = toH(d.scored + d.conceded);
    scLabels.push({ key: `sl${i}`, x: cx, y: baseY - totalH - 6, text: `${d.scored}-${d.conceded}`, fill: rColor(d.result) });
    dtLabels.push({ key: `dl${i}`, x: cx, y: svgH - 4, text: d.label, fill: '#64748b' });
  });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <Svg width={totalW} height={svgH}>
        {/* Grid lines */}
        {gridVals.map((val) => (
          <SvgLine key={`gl${val}`}
            x1={PAD_LEFT} y1={baseY - toH(val)} x2={totalW - PAD_RIGHT} y2={baseY - toH(val)}
            stroke="#e2e8f0" strokeWidth={1} />
        ))}
        {/* Y axis labels */}
        {gridVals.map((val) => (
          <SvgText key={`gy${val}`}
            x={PAD_LEFT - 4} y={baseY - toH(val) + 4}
            fontSize={9} fill="#94a3b8" textAnchor="end">
            {val}
          </SvgText>
        ))}
        {/* Coloured type segments */}
        {rects.map((r) => (
          <Rect key={r.key} x={r.x} y={r.y} width={r.w} height={r.h}
            fill={r.fill} fillOpacity={r.opacity} rx={2} />
        ))}
        {/* Score labels */}
        {scLabels.map((l) => (
          <SvgText key={l.key} x={l.x} y={l.y}
            fontSize={10} fill={l.fill} textAnchor="middle" fontWeight="bold">
            {l.text}
          </SvgText>
        ))}
        {/* Date labels */}
        {dtLabels.map((l) => (
          <SvgText key={l.key} x={l.x} y={l.y}
            fontSize={9} fill={l.fill} textAnchor="middle">
            {l.text}
          </SvgText>
        ))}
      </Svg>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 24 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: C.bg },
  noTeamTitle: { fontSize: 18, fontWeight: '600', color: C.text, marginTop: 12 },
  noTeamText: { fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 8 },

  // Hero
  hero: {
    backgroundColor: C.navy, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  heroTeam: { fontSize: 20, fontWeight: '800', color: '#ffffff', letterSpacing: 0.2 },
  heroDate: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  seasonPill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  seasonPillPast: { backgroundColor: 'rgba(251,191,36,0.18)' },
  seasonPillText: { fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  seasonModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  seasonModalBox: { backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '100%', maxWidth: 320 },
  seasonModalTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 10 },
  seasonModalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, paddingHorizontal: 12, borderRadius: 8 },
  seasonModalRowActive: { backgroundColor: '#eff6ff' },
  seasonModalRowText: { fontSize: 14, color: '#0f172a', fontWeight: '500' },
  seasonModalActiveTag: { fontSize: 9, fontWeight: '700', color: '#3b82f6', letterSpacing: 0.5 },
  heroCtxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  heroCtxIcon: { fontSize: 20 },
  heroCtxPhase: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  heroCtxAdvice: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  heroBilan: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  heroBilanVal: { fontSize: 15, fontWeight: '800', color: '#4ade80' },
  heroBilanSep: { fontSize: 12, color: 'rgba(255,255,255,0.3)' },

  // Next events
  nextRow: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 10 },
  nextCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border,
    borderLeftWidth: 3, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  nextCardTitle: { fontSize: 13, fontWeight: '600', color: C.text },
  nextCardMeta:  { fontSize: 11, color: C.muted, marginTop: 2 },

  // Tab bar
  tabBar: {
    flexDirection: 'row', backgroundColor: C.card, marginHorizontal: 12, marginTop: 12,
    borderRadius: 10, borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: C.navy },
  tabLabel: { fontSize: 13, fontWeight: '600', color: C.muted },
  tabLabelActive: { color: '#ffffff' },

  // Cards
  card: {
    backgroundColor: C.card, marginHorizontal: 12, marginTop: 12,
    borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14,
  },
  cardAccent: { width: 3, height: 16, backgroundColor: C.navy, borderRadius: 2 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  emptyCard: { fontSize: 13, color: C.muted, textAlign: 'center', paddingVertical: 8 },

  // Availability
  availRow: { flexDirection: 'row', gap: 8 },
  availChip: {
    flex: 1, borderRadius: 10, borderWidth: 1.5, padding: 10, alignItems: 'center',
  },
  availCount: { fontSize: 22, fontWeight: '800' },
  availLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.redBg, borderRadius: 8, padding: 10, marginTop: 12,
  },
  alertBannerText: { fontSize: 12, color: C.red, flex: 1 },

  // Heatmap filter chips
  heatmapFilterRow:         { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  heatmapFilterChip:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card },
  heatmapFilterChipActive:  { backgroundColor: C.amberBg, borderColor: C.amber },
  heatmapFilterLabel:       { fontSize: 11, fontWeight: '600', color: C.muted },
  heatmapFilterLabelActive: { color: C.amber, fontWeight: '800' },

  // Heatmap
  heatmapLegend: { fontSize: 11, color: C.muted, marginBottom: 12 },
  heatmapHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  heatmapColHeader: { flex: 1, alignItems: 'center' },
  heatmapColLabel: { fontSize: 10, color: C.muted, fontWeight: '600' },
  heatmapRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  heatmapPlayerLabel: { width: 60, fontSize: 11, color: C.text, fontWeight: '500' },
  heatmapCell: {
    flex: 1, marginHorizontal: 2, height: 32, borderRadius: 6,
    justifyContent: 'center', alignItems: 'center',
  },
  heatmapCellText: { fontSize: 11, fontWeight: '700' },
  heatmapAvgPill: {
    width: 36, height: 28, borderRadius: 6, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  heatmapAvgText: { fontSize: 11, fontWeight: '800' },
  heatmapLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  heatmapLegendItem: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  heatmapLegendText: { fontSize: 10, fontWeight: '600' },

  // RPE gauge
  // Workload two-KPI block
  workloadRow:       { flexDirection: 'row', borderWidth: 1, borderColor: C.border, borderRadius: 10, overflow: 'hidden' },
  workloadBlock:     { flex: 1, padding: 14, alignItems: 'center', gap: 5 },
  workloadDivider:   { width: 1, backgroundColor: C.border },
  workloadLabel:     { fontSize: 9, fontWeight: '800', color: C.muted, letterSpacing: 0.8 },
  workloadValRow:    { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  workloadVal:       { fontSize: 30, fontWeight: '900', lineHeight: 34 },
  workloadUnit:      { fontSize: 13, fontWeight: '600', color: C.muted, marginBottom: 3 },
  workloadBadge:     { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99 },
  workloadBadgeText: { fontSize: 10, fontWeight: '700' },

  rpeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  rpeValue: { fontSize: 36, fontWeight: '800', color: C.text },
  rpeUnit: { fontSize: 18, color: C.muted },
  rpePill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  rpePillText: { fontSize: 13, fontWeight: '700' },
  rpeGaugeTrack: {
    height: 14, borderRadius: 7, overflow: 'hidden',
    flexDirection: 'row', position: 'relative', marginBottom: 4,
    backgroundColor: C.bg,
  },
  rpeGaugeZone: { height: '100%' },
  rpeGaugeCursor: {
    position: 'absolute', top: -3, width: 20, height: 20, borderRadius: 10,
    backgroundColor: C.card, borderWidth: 3, marginLeft: -10,
  },
  rpeGaugeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  rpeGaugeLabel: { fontSize: 10, color: C.muted },
  rpeAdviceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  rpeAdvice: { fontSize: 12, fontWeight: '500', flex: 1 },

  // Form guide
  formRow: { flexDirection: 'row', justifyContent: 'space-around' },
  formItem: { alignItems: 'center', gap: 4 },
  formDot: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },
  formDotLabel: { fontSize: 15, fontWeight: '800' },
  formScore: { fontSize: 11, fontWeight: '600', color: C.text },
  formOpp: { fontSize: 10, color: C.muted, maxWidth: 56, textAlign: 'center' },
  streakBanner: {
    marginTop: 14, backgroundColor: '#fef9c3', borderRadius: 8, padding: 10, alignItems: 'center',
  },
  streakText: { fontSize: 13, fontWeight: '600', color: '#854d0e' },

  // Bilan
  bilanGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bilanCard: {
    minWidth: '30%', flex: 1, backgroundColor: C.bg, borderRadius: 10, borderWidth: 1,
    borderColor: C.border, padding: 12, alignItems: 'center',
  },
  bilanVal: { fontSize: 22, fontWeight: '800' },
  bilanLabel: { fontSize: 10, color: C.muted, marginTop: 4, textAlign: 'center' },
  locationRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  locationChip: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  locationChipLabel: { fontSize: 12, fontWeight: '600' },
  locationChipVal:   { fontSize: 16, fontWeight: '800', marginTop: 2 },

  // DNA bars
  dnaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  dnaLabel: { width: 90, fontSize: 11, color: C.text, fontWeight: '500' },
  dnaBars: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  dnaBarTrack: { flex: 1, height: 10, backgroundColor: C.bg, borderRadius: 5, overflow: 'hidden' },
  dnaBarFill: { height: '100%', borderRadius: 5 },
  dnaCount: { width: 22, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  dnaSep: { fontSize: 11, color: C.light },
  dnaLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  dnaLegendDot: { width: 10, height: 10, borderRadius: 5 },
  dnaLegendText: { fontSize: 11, color: C.muted },

  // Session rows
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  sessionDate: { width: 36, alignItems: 'center' },
  sessionDay: { fontSize: 18, fontWeight: '700', color: C.text },
  sessionMonth: { fontSize: 10, color: C.muted },
  sessionTheme: { fontSize: 13, fontWeight: '600', color: C.text },
  sessionPrinciple: { fontSize: 11, color: C.blue, marginTop: 2 },
  sessionAttBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  sessionAttText: { fontSize: 12, fontWeight: '700' },

  // Theme bars
  themeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  themeRank: { width: 22, fontSize: 11, color: C.muted, fontWeight: '600' },
  themeLabel: { flex: 1, fontSize: 12, color: C.text, fontWeight: '500' },
  themeBarTrack: { width: 80, height: 8, backgroundColor: C.bg, borderRadius: 4, overflow: 'hidden' },
  themeBarFill: { height: '100%', backgroundColor: C.navy, borderRadius: 4 },
  themeCount: { width: 28, fontSize: 11, color: C.navy, fontWeight: '700', textAlign: 'right' },

  // Player rows
  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  playerRank: { width: 22, fontSize: 11, color: C.muted, fontWeight: '600' },
  playerAvatar: {
    width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center',
  },
  playerAvatarText: { fontSize: 13, fontWeight: '800' },
  playerName: { fontSize: 13, fontWeight: '600', color: C.text },
  playerPos:  { fontSize: 11, color: C.muted, marginTop: 1 },
  playerStats: { flexDirection: 'row', gap: 6 },
  playerStatPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
  },
  playerStatText: { fontSize: 10, fontWeight: '700' },

  // Alerts
  alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  alertDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.red, marginTop: 3 },
  alertName: { fontSize: 13, fontWeight: '700', color: C.text },
  alertDetail: { fontSize: 12, color: C.muted, marginTop: 2 },

  // Chart legend
  chartLegendRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  chartTypeLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chartLegendDot: { width: 9, height: 9, borderRadius: 4.5 },
  chartLegendText: { fontSize: 10, color: C.muted },

  // Attendance groups
  attendGroupHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8,
  },
  attendGroupLabel: { fontSize: 12, fontWeight: '700' },
  attendGroupCount: { fontSize: 14, fontWeight: '800' },
  attendPlayerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  attendPlayerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 4,
  },
  attendPlayerName: { fontSize: 11, fontWeight: '600' },
  attendPlayerPct:  { fontSize: 11, fontWeight: '800' },

  // FM Table — Classement Forme
  fmHead: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1, borderTopColor: '#e2e8f0',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    paddingVertical: 7, paddingRight: 8,
  },
  fmRow: {
    flexDirection: 'row', alignItems: 'center',
    height: 50,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0',
  },
  fmStripe:   { width: 3, alignSelf: 'stretch' },
  fmColRank:  { width: 28, alignItems: 'center' },
  fmColPos:   { width: 52, alignItems: 'center' },
  fmColForme: { width: 52, alignItems: 'center' },
  fmColStat:  { width: 46, alignItems: 'center' },
  fmColSm:    { width: 36, alignItems: 'center' },
  fmHeadTxt: {
    fontSize: 10, fontWeight: '700', color: '#64748b',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  fmHeadTxtActive: { color: '#1e3a5f' },
  fmRankTxt:  { fontSize: 12, fontWeight: '700', color: '#94a3b8', textAlign: 'center' },
  fmPosBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  fmPosAbbr:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  fmLastName: { fontSize: 12, fontWeight: '700', color: '#0f172a', letterSpacing: 0.2 },
  fmFirstName:{ fontSize: 10, color: '#64748b', marginTop: 1 },
  fmFormPill: {
    borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2,
    minWidth: 38, alignItems: 'center',
  },
  fmFormVal:  { fontSize: 11, fontWeight: '800' },
  fmStatNum:  { fontSize: 13, fontWeight: '600', color: '#64748b', textAlign: 'center' },
});
