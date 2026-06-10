/**
 * Dashboard — Intelligence Coach (Webapp)
 * Redesign complet : indicateurs décisionnels, visualisations orientées coach futsal.
 */
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { useDashboardData } from './hooks/useDashboardData';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, ReferenceLine,
} from 'recharts';
import { format, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabase } from '@/lib/supabaseClient';
import { Trophy, Minus, TrendingDown, Zap, BarChart2, Users, Activity } from 'lucide-react';
// ─── Types ────────────────────────────────────────────────────────────────────
interface PlayerFilterState      { position: string; strongFoot: string; status: string; selectedPlayers: string[] }
interface PerformanceFilterState { matchLocationFilter: string; selectedMatches: string[] }

interface TeamFeedbackEntry {
  training_id: string;
  player_id: string;
  auto_evaluation: number | null;
  rpe: number | null;
  physical_form: number | null;
  pleasure: number | null;
}

const QUESTIONNAIRE_METRICS = [
  { key: 'auto_evaluation' as const, label: 'Auto-éval.' },
  { key: 'rpe'             as const, label: 'Intensité'  },
  { key: 'physical_form'   as const, label: 'Forme'      },
  { key: 'pleasure'        as const, label: 'Plaisir'    },
] as const;
type QuestionnaireMetricKey = 'auto_evaluation' | 'rpe' | 'physical_form' | 'pleasure';

function metricCellCls(metric: QuestionnaireMetricKey, val: number | null): string {
  if (val === null) return 'bg-slate-50 text-slate-300';
  if (metric === 'rpe') {
    if (val < 4)    return 'bg-blue-50 text-blue-700';
    if (val <= 7)   return 'bg-green-50 text-green-700';
    if (val <= 8.5) return 'bg-amber-50 text-amber-700';
    return 'bg-red-50 text-red-700';
  }
  if (val >= 7) return 'bg-green-50 text-green-700';
  if (val >= 5) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}

function metricBorderCls(metric: QuestionnaireMetricKey, val: number | null): string {
  if (val === null) return 'border-slate-200';
  if (metric === 'rpe') {
    if (val < 4)    return 'border-blue-300';
    if (val <= 7)   return 'border-green-300';
    if (val <= 8.5) return 'border-amber-300';
    return 'border-red-300';
  }
  if (val >= 7) return 'border-green-300';
  if (val >= 5) return 'border-amber-300';
  return 'border-red-300';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Parse dd/MM/yyyy → timestamp pour tri chronologique fiable */
function parseFrDate(d: string): number {
  const [day, month, year] = d.split('/');
  return new Date(+year, +month - 1, +day).getTime();
}

function weekDayContext() {
  const day = getDay(new Date());
  if (day === 1) return { phase: 'Lundi — Début de cycle', icon: '🔥', advice: 'Séance haute intensité · Nouveau principe à travailler', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' };
  if (day === 3) return { phase: 'Mercredi — Mi-semaine', icon: '⚡', advice: 'Consolidation · Intensité moyenne-haute · Approfondissement', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' };
  if (day === 5) return { phase: 'Vendredi — Pré-match', icon: '🎯', advice: 'Séance légère · Confiance et plaisir · Match demain !', color: 'text-green-700', bg: 'bg-green-50 border-green-200' };
  if (day === 6) return { phase: 'Samedi — Jour de match', icon: '⚽', advice: 'Échauffement ciblé · Concentration maximale', color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-200' };
  if (day === 0) return { phase: 'Dimanche — Jour de match', icon: '⚽', advice: 'Récupération active · Analyse post-match à prévoir', color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-200' };
  return { phase: 'Hors séance', icon: '📊', advice: 'Analyse et préparation de la prochaine séance', color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200' };
}

function rpeZone(val: number) {
  if (val < 4)  return { label: 'Faible', color: 'text-blue-600',  bg: 'bg-blue-50',  bar: 'bg-blue-400' };
  if (val <= 7) return { label: 'Optimal', color: 'text-green-700', bg: 'bg-green-50', bar: 'bg-green-500' };
  if (val <= 8.5) return { label: 'Élevé', color: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500' };
  return { label: 'Surcharge', color: 'text-red-600', bg: 'bg-red-50', bar: 'bg-red-500' };
}

function attColor(rate: number) {
  if (rate >= 80) return 'bg-green-100 text-green-800 border-green-300';
  if (rate >= 60) return 'bg-amber-100 text-amber-800 border-amber-300';
  return 'bg-red-100 text-red-800 border-red-300';
}

function resultBadge(r: string) {
  if (r === 'Victoire') return 'bg-green-100 text-green-800 border-green-300';
  if (r === 'Nul')      return 'bg-amber-100 text-amber-800 border-amber-300';
  return 'bg-red-100 text-red-800 border-red-300';
}
function resultLetter(r: string) {
  if (r === 'Victoire') return 'V';
  if (r === 'Nul')      return 'N';
  return 'D';
}

const DNA_COLORS = {
  offensive:  { label: 'Phase Offensive', scored: '#2563eb', conceded: '#ef4444' },
  transition: { label: 'Transition',      scored: '#7c3aed', conceded: '#f97316' },
  cpa:        { label: 'CPA',             scored: '#0891b2', conceded: '#dc2626' },
  superiority:{ label: 'Supériorité',     scored: '#16a34a', conceded: '#b91c1c' },
};

// ─── Component ────────────────────────────────────────────────────────────────
type CompetitionFilter = 'all' | 'Championnat' | 'Coupe' | 'Amical';
const COMPETITION_FILTERS: { label: string; value: CompetitionFilter }[] = [
  { label: 'Tous', value: 'all' },
  { label: 'Championnat', value: 'Championnat' },
  { label: 'Coupe', value: 'Coupe' },
  { label: 'Amical', value: 'Amical' },
];

const emptyFilters: PlayerFilterState     = { position: '', strongFoot: '', status: '', selectedPlayers: [] };
const emptyPerfFilters: PerformanceFilterState = { matchLocationFilter: 'Tous', selectedMatches: [] };

export default function DashboardPage() {
  const { activeTeam } = useActiveTeam();
  const [playerCompetitionFilter, setPlayerCompetitionFilter] = useState<CompetitionFilter>('all');
  const [playerSort, setPlayerSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'goals', dir: 'desc' });

  const handlePlayerSort = (col: string) =>
    setPlayerSort(prev => ({
      col,
      dir: prev.col === col ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'desc',
    }));

  const {
    players, matchStats, trainingStats, attendanceStats, performanceData, loading,
  } = useDashboardData({
    teamId: activeTeam?.id,
    filters: emptyFilters,
    performanceFilters: emptyPerfFilters,
    playerCompetitionFilter,
  });

  const [dashTab, setDashTab]   = useState<'overview' | 'pilotage'>('overview');
  const [qMetric, setQMetric]   = useState<QuestionnaireMetricKey>('physical_form');
  const [teamFeedback, setTeamFeedback] = useState<TeamFeedbackEntry[]>([]);
  const [last5Trainings, setLast5Trainings] = useState<{ id: string; date: string }[]>([]);

  useEffect(() => {
    if (!activeTeam?.id) return;
    (async () => {
      const { data: trs } = await supabase
        .from('trainings')
        .select('id, date')
        .eq('team_id', activeTeam.id)
        .order('date', { ascending: false })
        .limit(5);
      if (!trs?.length) return;
      setLast5Trainings([...(trs as { id: string; date: string }[])].reverse());
      const ids = (trs as { id: string; date: string }[]).map((t) => t.id);
      const { data: fb } = await supabase
        .from('training_player_feedback')
        .select('training_id, player_id, auto_evaluation, rpe, physical_form, pleasure')
        .in('training_id', ids);
      if (fb) setTeamFeedback(fb as TeamFeedbackEntry[]);
    })();
  }, [activeTeam?.id]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const derived = useMemo(() => {
    const ms   = matchStats;
    const wins = ms.filter((m) => m.result === 'Victoire').length;
    const draws= ms.filter((m) => m.result === 'Nul').length;
    const losses= ms.filter((m) => m.result === 'Défaite').length;
    const total = ms.length || 1;
    const gf   = ms.reduce((s, m) => s + m.goals_scored, 0);
    const ga   = ms.reduce((s, m) => s + m.goals_conceded, 0);
    const winRate = Math.round((wins / total) * 100);
    const avgGf = +(gf / total).toFixed(1);
    const avgGa = +(ga / total).toFixed(1);

    // Last 5 results — tri du plus récent au plus ancien, on prend 5, puis on inverse (chronologique)
    const last5 = [...ms].sort((a, b) => parseFrDate(b.date) - parseFrDate(a.date)).slice(0, 5).reverse();

    // Streak — du plus récent au plus ancien
    const sorted = [...ms].sort((a, b) => parseFrDate(b.date) - parseFrDate(a.date));
    let streak = { count: 0, type: '' as string };
    for (const m of sorted) {
      const t = resultLetter(m.result);
      if (!streak.type) streak = { count: 1, type: t };
      else if (streak.type === t) streak.count++;
      else break;
    }

    // DNA
    const dnaTypes = ['offensive', 'transition', 'cpa', 'superiority'] as const;
    const dna = dnaTypes.map((key) => ({
      name: DNA_COLORS[key].label,
      marqués:   ms.reduce((s, m) => s + (m.goals_by_type[key]    ?? 0), 0),
      encaissés: ms.reduce((s, m) => s + (m.conceded_by_type[key] ?? 0), 0),
    }));

    // Momentum — score diff per match (chronological)
    const momentum = [...ms]
      .sort((a, b) => parseFrDate(a.date) - parseFrDate(b.date))
      .map((m, i) => ({
        match: `M${i + 1}`,
        diff: m.goals_scored - m.goals_conceded,
        label: m.title || `M${i + 1}`,
        result: m.result,
      }));

    // Cumulative for area chart
    let cum = 0;
    const momentumCum = momentum.map((m) => {
      cum += m.diff;
      return { ...m, cumul: cum };
    });

    // Feedback map [player_id][training_id]
    const feedbackMap: Record<string, Record<string, TeamFeedbackEntry>> = {};
    teamFeedback.forEach((f) => {
      if (!feedbackMap[f.player_id]) feedbackMap[f.player_id] = {};
      feedbackMap[f.player_id][f.training_id] = f;
    });

    // RPE + Form avg (last 5 sessions)
    const rpeVals  = teamFeedback.map((f) => f.rpe).filter((v): v is number => v != null);
    const rpeAvg   = rpeVals.length ? +(rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length).toFixed(1) : null;
    const formVals = teamFeedback.map((f) => f.physical_form).filter((v): v is number => v != null);
    const formAvg  = formVals.length ? +(formVals.reduce((a, b) => a + b, 0) / formVals.length).toFixed(1) : null;

    // Training themes
    const themeAcc: Record<string, number> = {};
    trainingStats.forEach((t) => {
      const th = t.theme || 'Non spécifié';
      themeAcc[th] = (themeAcc[th] ?? 0) + 1;
    });
    const themes = Object.entries(themeAcc).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Attendance distribution
    const attGroups = {
      high:  attendanceStats.filter((a) => a.attendance_rate >= 80),
      mid:   attendanceStats.filter((a) => a.attendance_rate >= 60 && a.attendance_rate < 80),
      low:   attendanceStats.filter((a) => a.attendance_rate < 60),
    };

    return {
      wins, draws, losses, gf, ga, winRate, avgGf, avgGa,
      last5, streak, dna, momentum, momentumCum,
      rpeAvg, formAvg, feedbackMap,
      themes, attGroups,
    };
  }, [matchStats, trainingStats, attendanceStats, teamFeedback, last5Trainings]);

  const ctx = weekDayContext();

  // ── Loading / empty ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Chargement de l'intelligence coach…</p>
        </div>
      </div>
    );
  }

  if (!activeTeam) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center p-8 max-w-sm">
          <div className="text-5xl mb-4">⚽</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Aucune équipe sélectionnée</h2>
          <p className="text-slate-500 text-sm">Choisissez une équipe dans la sidebar pour accéder à votre tableau de bord.</p>
        </div>
      </div>
    );
  }

  const diff = derived.gf - derived.ga;

  return (
    <div className="space-y-5 w-full">

      {/* ── Hero header ────────────────────────────────────────────────────── */}
      <div className="rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4"
        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2a4f7c 100%)', boxShadow: '0 4px 20px rgba(30,58,95,0.18)' }}>
        <div className="flex-1">
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>
            Intelligence Coach
          </p>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>{activeTeam.name}</h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', marginTop: 4 }}>
            {activeTeam.category} · {activeTeam.level} · {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
          </p>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl max-w-xs"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
          <span className="text-xl">{ctx.icon}</span>
          <div>
            <p style={{ fontWeight: 700, fontSize: '0.8rem', color: '#fff' }}>{ctx.phase}</p>
            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{ctx.advice}</p>
          </div>
        </div>
      </div>

      {/* ── Tab navigation ── */}
      <div className="flex border-b border-slate-200">
        {([{ id: 'overview', label: "Vue d'ensemble" }, { id: 'pilotage', label: 'Pilotage équipe' }] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setDashTab(t.id)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              dashTab === t.id
                ? 'border-[#1e3a5f] text-[#1e3a5f]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {dashTab === 'overview' && <div className="space-y-5">

        {/* ── KPI strip ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { value: derived.wins,    label: 'Victoires',     Icon: Trophy,        color: '#16A34A', bg: '#DCFCE7', border: '#86EFAC' },
            { value: derived.draws,   label: 'Nuls',          Icon: Minus,         color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
            { value: derived.losses,  label: 'Défaites',      Icon: TrendingDown,  color: '#DC2626', bg: '#FEE2E2', border: '#FCA5A5' },
            { value: `${diff >= 0 ? '+' : ''}${diff}`, label: 'Différentiel', Icon: Zap, color: diff >= 0 ? '#16A34A' : '#DC2626', bg: diff >= 0 ? '#DCFCE7' : '#FEE2E2', border: diff >= 0 ? '#86EFAC' : '#FCA5A5' },
            { value: `${derived.winRate}%`, label: 'Win rate', Icon: BarChart2,    color: '#2563EB', bg: '#DBEAFE', border: '#93C5FD' },
            { value: players.length,  label: 'Joueurs',       Icon: Users,         color: '#1e3a5f', bg: '#EFF6FF', border: '#BFDBFE' },
          ].map(({ value, label, Icon, color, bg, border }) => (
            <div key={label} className="rounded-xl p-4 text-center flex flex-col items-center gap-2"
              style={{ backgroundColor: bg, border: `1px solid ${border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: color + '20' }}>
                <Icon size={15} style={{ color }} />
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '0.65rem', color: '#697585', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Row: Form guide + DNA ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Forme récente */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-5 bg-[#1e3a5f] rounded-full" />
              <h2 className="font-bold text-slate-800">Forme récente</h2>
              <span className="ml-auto text-xs text-slate-400">5 derniers matchs</span>
            </div>

            {derived.last5.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-6">Aucun match joué</p>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  {derived.last5.map((m, i) => (
                    <div key={i} className="flex-1 text-center">
                      <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center mx-auto mb-1 font-black text-sm ${resultBadge(m.result)}`}>
                        {resultLetter(m.result)}
                      </div>
                      <div className="text-xs text-slate-500 font-medium">{m.goals_scored}–{m.goals_conceded}</div>
                      <div className="text-xs text-slate-400 truncate" title={m.title}>{m.title?.slice(0, 8)}</div>
                    </div>
                  ))}
                </div>
                {derived.streak.count >= 2 && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
                    <span className="text-sm font-semibold text-yellow-800">
                      🔥 Série de {derived.streak.count} {derived.streak.type === 'V' ? 'victoires' : derived.streak.type === 'N' ? 'nuls' : 'défaites'} consécutives
                    </span>
                  </div>
                )}
                <div className="mt-4 grid grid-cols-3 gap-3 text-center border-t border-slate-100 pt-4">
                  <div><div className="font-bold text-slate-800">{derived.avgGf}</div><div className="text-xs text-slate-400">Buts/match</div></div>
                  <div><div className="font-bold text-slate-800">{derived.avgGa}</div><div className="text-xs text-slate-400">Encaissés/match</div></div>
                  <div><div className={`font-bold ${derived.winRate >= 50 ? 'text-green-700' : 'text-red-600'}`}>{derived.winRate}%</div><div className="text-xs text-slate-400">Win rate</div></div>
                </div>
              </>
            )}
          </div>

          {/* DNA des buts */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-5 bg-[#1e3a5f] rounded-full" />
              <h2 className="font-bold text-slate-800">DNA des buts</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4 ml-3">Comment on marque vs comment on encaisse</p>

            {derived.dna.every((d) => d.marqués === 0 && d.encaissés === 0) ? (
              <p className="text-slate-400 text-sm text-center py-6">Aucun match enregistré</p>
            ) : (
              <>
                {derived.dna.map((row) => {
                  const max = Math.max(...derived.dna.flatMap((d) => [d.marqués, d.encaissés]), 1);
                  return (
                    <div key={row.name} className="mb-3">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span className="font-medium">{row.name}</span>
                        <span className="text-slate-400">{row.marqués} marqués · {row.encaissés} encaissés</span>
                      </div>
                      <div className="flex gap-2 items-center">
                        {/* Scored */}
                        <div className="flex-1 flex items-center gap-1.5">
                          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${(row.marqués / max) * 100}%` }}
                            />
                          </div>
                          <span className="w-5 text-xs font-bold text-blue-600 text-right">{row.marqués}</span>
                        </div>
                        {/* Separator */}
                        <div className="text-slate-300 text-xs">·</div>
                        {/* Conceded */}
                        <div className="flex-1 flex items-center gap-1.5">
                          <span className="w-5 text-xs font-bold text-red-500 text-left">{row.encaissés}</span>
                          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-400 rounded-full transition-all"
                              style={{ width: `${(row.encaissés / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-center gap-6 mt-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-500" /><span className="text-xs text-slate-500">Buts marqués</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-400" /><span className="text-xs text-slate-500">Buts encaissés</span></div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Momentum chart ─────────────────────────────────────────────────── */}
        {derived.momentum.length > 1 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-5 bg-[#1e3a5f] rounded-full" />
              <h2 className="font-bold text-slate-800">Momentum saison</h2>
              <span className="ml-auto text-xs text-slate-400">Différentiel de buts cumulé par match</span>
            </div>
            <p className="text-xs text-slate-400 mb-4 ml-3">
              Tendance haussière = progression · Chute = série difficile
            </p>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={derived.momentumCum} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="match" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 4" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg text-xs">
                          <p className="font-bold text-slate-800 mb-1">{d.label}</p>
                          <p className="text-slate-500">Diff match: <span className={`font-bold ${d.diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>{d.diff >= 0 ? '+' : ''}{d.diff}</span></p>
                          <p className="text-slate-500">Cumulé: <span className={`font-bold ${d.cumul >= 0 ? 'text-green-600' : 'text-red-500'}`}>{d.cumul >= 0 ? '+' : ''}{d.cumul}</span></p>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumul"
                    stroke="#1e3a5f"
                    strokeWidth={2.5}
                    dot={({ cx, cy, payload }: any) => (
                      <circle
                        key={`dot-${payload.match}`}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={payload.result === 'Victoire' ? '#16a34a' : payload.result === 'Nul' ? '#d97706' : '#dc2626'}
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    )}
                    activeDot={{ r: 6, stroke: '#1e3a5f', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-5 mt-2">
              {[['#16a34a', 'Victoire'], ['#d97706', 'Nul'], ['#dc2626', 'Défaite']].map(([color, label]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-xs text-slate-400">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Row: Squad availability + RPE ────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Squad availability */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-5 bg-[#1e3a5f] rounded-full" />
              <h2 className="font-bold text-slate-800">Fidélité effectif</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4 ml-3">Taux de présence aux entraînements</p>

            {/* 3 groups */}
            {[
              { label: '≥80% — Piliers', list: derived.attGroups.high, color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
              { label: '60–79% — Irréguliers', list: derived.attGroups.mid, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
              { label: '<60% — Absents', list: derived.attGroups.low, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
            ].map((grp) => grp.list.length > 0 && (
              <div key={grp.label} className="mb-4">
                <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg mb-2 ${grp.bg} border ${grp.border}`}>
                  <span className={`text-xs font-bold ${grp.color}`}>{grp.label}</span>
                  <span className={`text-xs font-black ${grp.color}`}>{grp.list.length} joueurs</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {grp.list.map((a) => {
                    const pl = players.find((p) => p.id === a.player_id);
                    if (!pl) return null;
                    return (
                      <div key={a.player_id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${attColor(a.attendance_rate)}`}>
                        <span>{pl.first_name[0]}.{pl.last_name?.[0] ?? ''} {pl.last_name}</span>
                        <span className="font-black">{a.attendance_rate.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {attendanceStats.length === 0 && (
              <p className="text-slate-400 text-sm text-center py-6">Aucune donnée de présence disponible</p>
            )}
          </div>

          {/* RPE load + Training themes */}
          <div className="flex flex-col gap-6">
            {/* RPE */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-5 bg-[#1e3a5f] rounded-full" />
                <h2 className="font-bold text-slate-800">Charge de la semaine</h2>
                <span className="ml-auto text-xs text-slate-400">RPE moyen (3 séances)</span>
              </div>
              {derived.rpeAvg !== null ? (
                <>
                  <div className="flex items-center gap-4 mb-3">
                    <span className={`text-4xl font-black ${rpeZone(derived.rpeAvg).color}`}>{derived.rpeAvg}</span>
                    <div>
                      <span className={`text-sm font-bold px-2 py-1 rounded-lg ${rpeZone(derived.rpeAvg).bg} ${rpeZone(derived.rpeAvg).color}`}>
                        {rpeZone(derived.rpeAvg).label}
                      </span>
                      <p className="text-xs text-slate-400 mt-1">
                        {derived.rpeAvg <= 7 ? '✅ Équipe prête pour le match' :
                         derived.rpeAvg <= 8.5 ? '⚠️ Surveiller la récupération' :
                         '🔴 Réduire l\'intensité cette semaine'}
                      </p>
                    </div>
                  </div>
                  {/* Gauge */}
                  <div className="relative h-4 rounded-full overflow-hidden flex">
                    <div className="flex-[4] bg-blue-100" />
                    <div className="flex-[3] bg-green-100" />
                    <div className="flex-[1.5] bg-amber-100" />
                    <div className="flex-[1.5] bg-red-100" />
                  </div>
                  <div className="absolute" style={{
                    // approximate cursor position via inline
                  }} />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    {['1', '4', '7', '8.5', '10'].map((l) => <span key={l}>{l}</span>)}
                  </div>
                </>
              ) : (
                <p className="text-slate-400 text-sm text-center py-4">
                  Aucune réponse au questionnaire disponible
                </p>
              )}
            </div>

            {/* Training themes */}
            {derived.themes.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-5 bg-[#1e3a5f] rounded-full" />
                  <h2 className="font-bold text-slate-800">Thèmes entraînement</h2>
                </div>
                <div className="space-y-2">
                  {derived.themes.map(([theme, count], i) => (
                    <div key={theme} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-4">#{i + 1}</span>
                      <span className="text-sm text-slate-700 flex-1 font-medium truncate">{theme}</span>
                      <div className="flex-[2] h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#1e3a5f] rounded-full"
                          style={{ width: `${(count / derived.themes[0][1]) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-[#1e3a5f] w-6 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Goal DNA bar chart (Recharts) ─────────────────────────────────── */}
        {derived.dna.some((d) => d.marqués > 0 || d.encaissés > 0) && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-5 bg-[#1e3a5f] rounded-full" />
              <h2 className="font-bold text-slate-800">Analyse typologique des buts</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4 ml-3">Répartition des buts marqués et encaissés par type de situation</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={derived.dna} margin={{ top: 8, right: 24, left: 0, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(val: number, name: string) => [val, name === 'marqués' ? 'Buts marqués' : 'Buts encaissés']}
                  />
                  <Bar dataKey="marqués"   fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="encaissés" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-600" /><span className="text-xs text-slate-400">Buts marqués</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-500" /><span className="text-xs text-slate-400">Buts encaissés</span></div>
            </div>
          </div>
        )}

        {/* ── Player performance ranking ────────────────────────────────────── */}
        {players.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <div className="w-1 h-5 bg-[#1e3a5f] rounded-full" />
              <h2 className="font-bold text-slate-800">Classement joueurs</h2>
              {/* Competition filter pills */}
              <div className="ml-auto flex gap-1.5 flex-wrap">
                {COMPETITION_FILTERS.map(f => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setPlayerCompetitionFilter(f.value)}
                    className="px-3 py-1 rounded-md text-xs font-semibold transition-all"
                    style={{
                      backgroundColor: playerCompetitionFilter === f.value ? '#1e3a5f' : '#F8FAFC',
                      color: playerCompetitionFilter === f.value ? '#fff' : '#697585',
                      border: `1px solid ${playerCompetitionFilter === f.value ? '#1e3a5f' : '#DDE1EA'}`,
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
                <div className="w-3 h-3 rounded-full border border-slate-300 border-t-slate-600 animate-spin" />
                Calcul des stats…
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-slate-400">#</th>
                    {([
                      { label: 'Joueur', col: 'name'          },
                      { label: 'M',      col: 'matches_played' },
                      { label: 'V',      col: 'victories'      },
                      { label: 'N',      col: 'draws'          },
                      { label: 'D',      col: 'defeats'        },
                      { label: 'Buts',   col: 'goals'          },
                      { label: 'Présence', col: 'att'          },
                    ] as const).map(({ label, col }) => (
                      <th key={col} className="py-2 px-2 text-xs font-semibold text-left">
                        <button
                          onClick={() => handlePlayerSort(col)}
                          className="flex items-center gap-0.5 hover:text-slate-700 transition-colors"
                          style={{ color: playerSort.col === col ? '#1e3a5f' : '#94a3b8' }}
                        >
                          {label}
                          {playerSort.col === col
                            ? (playerSort.dir === 'asc' ? ' ↑' : ' ↓')
                            : <span className="text-slate-200"> ↕</span>}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...players]
                    .sort((a, b) => {
                      const dir = playerSort.dir === 'asc' ? 1 : -1;
                      if (playerSort.col === 'name') {
                        const na = `${(a as any).last_name ?? ''} ${(a as any).first_name ?? ''}`;
                        const nb = `${(b as any).last_name ?? ''} ${(b as any).first_name ?? ''}`;
                        return dir * na.localeCompare(nb, 'fr');
                      }
                      if (playerSort.col === 'att') {
                        const aa = attendanceStats.find(s => s.player_id === a.id)?.attendance_rate ?? 0;
                        const ab = attendanceStats.find(s => s.player_id === b.id)?.attendance_rate ?? 0;
                        return dir * (aa - ab);
                      }
                      const va = (a as any)[playerSort.col] ?? 0;
                      const vb = (b as any)[playerSort.col] ?? 0;
                      return dir * (va - vb);
                    })
                    .slice(0, 12)
                    .map((p, i) => {
                      const att = attendanceStats.find((a) => a.player_id === p.id);
                      return (
                        <tr key={p.id} className={`border-b border-slate-50 ${i % 2 === 0 ? '' : 'bg-slate-50/50'} hover:bg-blue-50/40 transition-colors`}>
                          <td className="py-2 px-2 text-slate-400 font-medium">{i + 1}</td>
                          <td className="py-2 px-2 font-semibold text-slate-800">
                            {p.first_name} {p.last_name}
                            {p.position && <span className="ml-1 text-xs text-slate-400">({p.position})</span>}
                          </td>
                          <td className="py-2 px-2 text-slate-600">{(p as any).matches_played ?? 0}</td>
                          <td className="py-2 px-2 font-bold text-green-700">{(p as any).victories ?? 0}</td>
                          <td className="py-2 px-2 text-amber-600">{(p as any).draws ?? 0}</td>
                          <td className="py-2 px-2 text-red-500">{(p as any).defeats ?? 0}</td>
                          <td className="py-2 px-2 font-black text-blue-700">{(p as any).goals ?? 0}</td>
                          <td className="py-2 px-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${attColor(att?.attendance_rate ?? 0)}`}>
                              {att ? `${att.attendance_rate.toFixed(0)}%` : '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>}

      {dashTab === 'pilotage' && (
        <div className="space-y-5">

          {/* ── Questionnaire heatmap ── */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-5 bg-[#1e3a5f] rounded-full" />
              <h2 className="font-bold text-slate-800">Questionnaires — 5 dernières séances</h2>
            </div>

            {/* Metric chips */}
            <div className="flex gap-2 flex-wrap mt-3 mb-4">
              {QUESTIONNAIRE_METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setQMetric(m.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    qMetric === m.key
                      ? 'bg-amber-50 border-amber-400 text-amber-700'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {last5Trainings.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-6">Aucune séance enregistrée</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-1 px-2 text-[10px] font-semibold text-slate-400 w-28">Joueur</th>
                      {last5Trainings.map((t) => (
                        <th key={t.id} className="text-center py-1 px-2 text-[10px] font-semibold text-slate-400">
                          {format(new Date(t.date), 'd/MM', { locale: fr })}
                        </th>
                      ))}
                      <th className="text-center py-1 px-2 text-[10px] font-semibold text-slate-400">Moy.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => {
                      const pFb = derived.feedbackMap[p.id] ?? {};
                      const vals = last5Trainings.map((t) => pFb[t.id]?.[qMetric] ?? null).filter((v): v is number => v !== null);
                      const avg  = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
                      return (
                        <tr key={p.id} className="border-t border-slate-50 hover:bg-slate-50/60 transition-colors">
                          <td className="py-0.5 px-2 text-[11px] font-semibold text-slate-700 truncate max-w-[7rem]">
                            {p.first_name[0]}. {p.last_name}
                          </td>
                          {last5Trainings.map((t) => {
                            const val = pFb[t.id]?.[qMetric] ?? null;
                            return (
                              <td key={t.id} className="py-0.5 px-2 text-center">
                                <span className={`inline-flex w-6 h-6 rounded text-[10px] font-bold items-center justify-center ${metricCellCls(qMetric, val)}`}>
                                  {val !== null ? val : '—'}
                                </span>
                              </td>
                            );
                          })}
                          <td className="py-0.5 px-2 text-center">
                            <span className={`inline-block px-1.5 py-0 rounded-full text-[10px] font-bold border leading-5 ${metricCellCls(qMetric, avg)} ${metricBorderCls(qMetric, avg)}`}>
                              {avg !== null ? avg.toFixed(1) : '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Legend */}
            <div className="flex gap-2 flex-wrap mt-4 pt-3 border-t border-slate-100">
              {(qMetric === 'rpe' ? [
                { label: '<4 Faible',   cls: 'bg-blue-50 text-blue-700'  },
                { label: '4–7 Optimal', cls: 'bg-green-50 text-green-700' },
                { label: '>7 Élevé',    cls: 'bg-amber-50 text-amber-700' },
                { label: '>8.5 Surm.',  cls: 'bg-red-50 text-red-700'    },
              ] : [
                { label: '≥7 Bien',    cls: 'bg-green-50 text-green-700' },
                { label: '5–6 Moyen',  cls: 'bg-amber-50 text-amber-700' },
                { label: '<5 Alerte',  cls: 'bg-red-50 text-red-700'     },
                { label: 'N/A',        cls: 'bg-slate-50 text-slate-400'  },
              ]).map((l) => (
                <span key={l.label} className={`px-2 py-1 rounded text-xs font-semibold ${l.cls}`}>{l.label}</span>
              ))}
            </div>
          </div>

          {/* ── Charge de travail ── */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-5 bg-[#1e3a5f] rounded-full" />
              <h2 className="font-bold text-slate-800">Charge de travail — 5 dernières séances</h2>
            </div>

            {(derived.rpeAvg !== null || derived.formAvg !== null) ? (
              <div className="grid grid-cols-2 gap-4">
                {/* RPE */}
                <div className="border border-slate-200 rounded-xl p-5 text-center flex flex-col items-center gap-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">RPE Moyen</p>
                  <p className={`text-5xl font-black leading-none ${derived.rpeAvg !== null ? rpeZone(derived.rpeAvg).color : 'text-slate-300'}`}>
                    {derived.rpeAvg ?? '—'}
                    {derived.rpeAvg !== null && <span className="text-lg font-semibold text-slate-400">/10</span>}
                  </p>
                  {derived.rpeAvg !== null && (
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${rpeZone(derived.rpeAvg).bg} ${rpeZone(derived.rpeAvg).color}`}>
                      {rpeZone(derived.rpeAvg).label}
                    </span>
                  )}
                </div>
                {/* Forme */}
                <div className="border border-slate-200 rounded-xl p-5 text-center flex flex-col items-center gap-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Forme Moyenne</p>
                  <p className={`text-5xl font-black leading-none ${
                    derived.formAvg === null ? 'text-slate-300' :
                    derived.formAvg >= 7 ? 'text-green-700' :
                    derived.formAvg >= 5 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {derived.formAvg ?? '—'}
                    {derived.formAvg !== null && <span className="text-lg font-semibold text-slate-400">/10</span>}
                  </p>
                  {derived.formAvg !== null && (
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                      derived.formAvg >= 7 ? 'bg-green-50 text-green-700' :
                      derived.formAvg >= 5 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {derived.formAvg >= 7 ? 'Bonne forme' : derived.formAvg >= 5 ? 'Forme correcte' : 'Fatigue'}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-slate-400 text-sm text-center py-6">Aucune réponse au questionnaire disponible</p>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
