'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowLeft,
  User,
  Activity,
  Footprints,
  Trophy,
  Check,
  X,
  AlertTriangle,
  MessageSquare,
  Stethoscope,
  Ban,
  Plus,
  Trash2,
  Clock,
  Link2,
  Copy,
  Users,
  UserPlus,
  UserMinus,
  BarChart2,
} from 'lucide-react';
import { useActiveTeam } from '../../../hooks/useActiveTeam';
import { useUserClub } from '../../../hooks/useUserClub';
import { playersService } from '@/lib/services/playersService';
import type { PlayerRadarResult, RadarPerMatchStats } from '@/lib/services/playersService';
import { trainingsService } from '@/lib/services/trainingsService';
import { playerEventsService } from '@/lib/services/playerEventsService';
import { getPlayerTrainingFeedback, type PlayerTrainingFeedbackRow } from '@/lib/services/trainingFeedbackService';
import { createPlayerLinkCode } from '@/lib/services/playerConvocationsService';
import { supabase } from '@/lib/supabaseClient';
import type { Player, PlayerEvent, PlayerEventType, Team } from '@/types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';

// ─── Design tokens (FM light theme) ────────────────────────────────────────
const T = {
  pageBg:     '#EEF0F5',
  cardBg:     '#FFFFFF',
  border:     '#DDE1EA',
  text:       '#1A2332',
  textMuted:  '#697585',
  accent:     '#3B82F6',
  accentAmber:'#FFB020',
};

type TrainingSessionStatus = 'present' | 'late' | 'absent' | 'injured' | 'not_recorded';

const SESSION_COLORS: Record<TrainingSessionStatus, string> = {
  present:      '#16a34a',
  late:         '#f59e0b',
  absent:       '#dc2626',
  injured:      '#7c3aed',
  not_recorded: '#DDE1EA',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function calcAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function isGoalkeeper(position?: string): boolean {
  return (position ?? '').toLowerCase().startsWith('gardien');
}

function groupByMonth(sessions: { date: string; status: TrainingSessionStatus }[]) {
  const map = new Map<string, { date: string; status: TrainingSessionStatus }[]>();
  for (const s of sessions) {
    const key = new Date(s.date).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries()).map(([month, items]) => ({ month, items }));
}

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
  if (val >= 1)  return val.toFixed(1);
  return val.toFixed(2);
}

// ─── Radar axis definitions (normalized 0-100) ─────────────────────────────

const fmtPlusMinus = (v: number) => { const r = Math.round(v); return r >= 0 ? `+${r}` : String(r); };
const fmtPercent   = (v: number) => `${Math.round(v)} %`;

interface RadarAxisDef {
  normKey: keyof PlayerRadarResult['normalized'];
  rawKey:  keyof RadarPerMatchStats;
  label:   string;
  format:  (v: number) => string;
}

const FIELD_AXES: RadarAxisDef[] = [
  { normKey: 'avgPlaytime',           rawKey: 'avgPlaytimeSec',        label: 'Tps jeu',     format: fmtTimeSec     },
  { normKey: 'goalsPerMatch',         rawKey: 'goalsPerMatch',         label: 'Buts',        format: fmtPerMatch    },
  { normKey: 'shotsOnTargetPerMatch', rawKey: 'shotsOnTargetPerMatch', label: 'T.cadrés',   format: fmtPerMatch    },
  { normKey: 'totalShotsPerMatch',    rawKey: 'totalShotsPerMatch',    label: 'T.totaux',   format: fmtPerMatch    },
  { normKey: 'assistsPerMatch',       rawKey: 'assistsPerMatch',       label: 'Passes déc.', format: fmtPerMatch    },
  { normKey: 'recoveriesPerMatch',    rawKey: 'recoveriesPerMatch',    label: 'Récup.',      format: fmtPerMatch    },
  { normKey: 'ballLossPerMatch',      rawKey: 'ballLossPerMatch',      label: 'Pertes',      format: fmtPerMatch    },
  { normKey: 'plusMinus',             rawKey: 'plusMinus',             label: '+/-',         format: fmtPlusMinus   },
];

const GK_AXES: RadarAxisDef[] = [
  { normKey: 'avgPlaytime',           rawKey: 'avgPlaytimeSec',        label: 'Min/m',     format: fmtTimeSec   },
  { normKey: 'savesPerMatch',         rawKey: 'savesPerMatch',         label: 'Arrêts',    format: fmtPerMatch  },
  { normKey: 'savePercentage',        rawKey: 'savePercentage',        label: '% Arrêts',  format: fmtPercent   },
  { normKey: 'recoveriesPerMatch',    rawKey: 'recoveriesPerMatch',    label: 'Récup.',    format: fmtPerMatch  },
  { normKey: 'goalsConcededPerMatch', rawKey: 'goalsConcededPerMatch', label: 'Buts enc.', format: fmtPerMatch  },
];

// ─── Stat definitions for the performance grid ─────────────────────────────

type StatDefKey = keyof PlayerRadarResult['raw'];

interface StatDef {
  key: StatDefKey;
  label: string;
  sublabel: string;
  color: string;
  format: (v: number) => string;
}

const FIELD_STAT_DEFS: StatDef[] = [
  { key: 'avgPlaytimeSec',        label: 'Tps de jeu',      sublabel: 'par match',  color: '#2563eb', format: fmtTimeSec },
  { key: 'goalsPerMatch',         label: 'Buts',            sublabel: 'par match',  color: '#f59e0b', format: fmtPerMatch },
  { key: 'shotsOnTargetPerMatch', label: 'Tirs cadrés',     sublabel: 'par match',  color: '#0891b2', format: fmtPerMatch },
  { key: 'totalShotsPerMatch',    label: 'Tirs totaux',     sublabel: 'par match',  color: '#6366f1', format: fmtPerMatch },
  { key: 'assistsPerMatch',       label: 'Passes déc.',     sublabel: 'par match',  color: '#a855f7', format: fmtPerMatch },
  { key: 'recoveriesPerMatch',    label: 'Récupérations',   sublabel: 'par match',  color: '#16a34a', format: fmtPerMatch },
  { key: 'ballLossPerMatch',      label: 'Pertes de balle', sublabel: 'par match',  color: '#dc2626', format: fmtPerMatch },
  { key: 'plusMinus',             label: '+/-',             sublabel: 'cette saison', color: '#7c3aed', format: (v) => { const r = Math.round(v); return r >= 0 ? `+${r}` : String(r); } },
];

const GK_STAT_DEFS: StatDef[] = [
  { key: 'avgPlaytimeSec',           label: 'Tps de jeu',       sublabel: 'par match',   color: '#2563eb', format: fmtTimeSec },
  { key: 'savesPerMatch',            label: 'Arrêts',           sublabel: 'par match',   color: '#16a34a', format: fmtPerMatch },
  { key: 'savePercentage',           label: '% Arrêts',         sublabel: 'cette saison', color: '#0891b2', format: (v) => `${Math.round(v)}%` },
  { key: 'recoveriesPerMatch',       label: 'Récupérations',    sublabel: 'par match',   color: '#d97706', format: fmtPerMatch },
  { key: 'goalsConcededPerMatch',    label: 'Buts encaissés',   sublabel: 'par match',   color: '#dc2626', format: fmtPerMatch },
];

// ─── Main component ─────────────────────────────────────────────────────────

export default function PlayerProfilePage() {
  const params = useParams();
  const { activeTeam } = useActiveTeam();
  const { club } = useUserClub();
  const playerId = params.playerId as string;

  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clubTeams, setClubTeams] = useState<Team[]>([]);
  const [playerTeamIds, setPlayerTeamIds] = useState<string[]>([]);
  const [loadingPlayerTeams, setLoadingPlayerTeams] = useState(false);
  const [teamActionError, setTeamActionError] = useState<string | null>(null);
  const [teamActionLoading, setTeamActionLoading] = useState(false);
  const [associateTeamId, setAssociateTeamId] = useState<string>('');

  // All training sessions (ascending date) for the full-year calendar
  const [allSessions, setAllSessions] = useState<{ date: string; status: TrainingSessionStatus }[]>([]);
  const [events, setEvents] = useState<PlayerEvent[]>([]);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventFormType, setEventFormType] = useState<PlayerEventType>('interview');
  const [eventForm, setEventForm] = useState({
    event_date: format(new Date(), 'yyyy-MM-dd'),
    report: '',
    injury_type: '',
    unavailability_days: '',
    matches_suspended: ''
  });
  const [savingEvent, setSavingEvent] = useState(false);

  const [stats, setStats] = useState<{
    matches_played: number;
    goals: number;
    training_attendance: number;
    attendance_percentage: number;
    victories: number;
    draws: number;
    defeats: number;
  } | null>(null);

  const [feedbackHistory, setFeedbackHistory] = useState<PlayerTrainingFeedbackRow[]>([]);
  const [feedbackMetric, setFeedbackMetric] = useState<'auto_evaluation' | 'rpe' | 'physical_form' | 'pleasure'>('auto_evaluation');
  const [matchTypeFilter, setMatchTypeFilter] = useState<'all' | 'Championnat' | 'Coupe' | 'Amical'>('all');

  const [radarData, setRadarData] = useState<PlayerRadarResult | null>(null);
  const [radarLoading, setRadarLoading] = useState(false);

  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeLoading, setLinkCodeLoading] = useState(false);
  const [linkCodeError, setLinkCodeError] = useState<string | null>(null);
  const [linkCodeCopied, setLinkCodeCopied] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);

  // ── Initial data load ────────────────────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      if (!playerId || !activeTeam) {
        if (!activeTeam) setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const playerData = await playersService.getPlayerById(playerId);

        if (!playerData) {
          setError('Joueur introuvable');
          setLoading(false);
          return;
        }

        setPlayer(playerData);

        const [trainingsData, eventsData] = await Promise.all([
          trainingsService.getTrainingsByTeam(activeTeam.id),
          playerEventsService.getByPlayerId(playerId)
        ]);

        setEvents(eventsData);

        // Sort ascending (oldest first) for the calendar view
        const sortedAsc = [...(trainingsData || [])].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        setAllSessions(
          sortedAsc.map(t => ({
            date: t.date,
            status: ((t.attendance as Record<string, string>)?.[playerId] || 'not_recorded') as TrainingSessionStatus,
          }))
        );

        try {
          const feedback = await getPlayerTrainingFeedback(playerId);
          setFeedbackHistory(feedback);
        } catch {
          setFeedbackHistory([]);
        }
      } catch (err) {
        console.error('Erreur chargement profil joueur:', err);
        setError(err instanceof Error ? err.message : 'Erreur lors du chargement');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [playerId, activeTeam]);

  // ── Reload match stats when filter changes ───────────────────────────────
  useEffect(() => {
    const loadMatchStats = async () => {
      if (!playerId || !activeTeam) return;
      try {
        const playerStats = await playersService.getPlayerStats(playerId, activeTeam.id, matchTypeFilter);
        setStats(playerStats);
      } catch {
        // keep previous stats on transient error
      }
    };
    loadMatchStats();
  }, [playerId, activeTeam, matchTypeFilter]);

  // ── Reload radar/real stats when filter changes ──────────────────────────
  useEffect(() => {
    const loadRadar = async () => {
      if (!playerId || !activeTeam) return;
      setRadarLoading(true);
      try {
        const result = await playersService.getPlayerRadarStats(playerId, activeTeam.id, matchTypeFilter);
        setRadarData(result);
      } catch {
        setRadarData(null);
      } finally {
        setRadarLoading(false);
      }
    };
    loadRadar();
  }, [playerId, activeTeam, matchTypeFilter]);

  // ── Club teams ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!club?.id) { setClubTeams([]); return; }
    (async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name, category, level, color, club_id')
        .eq('club_id', club.id)
        .order('name');
      if (!error) setClubTeams(data || []);
    })();
  }, [club?.id]);

  // ── Player teams ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playerId) { setPlayerTeamIds([]); setLoadingPlayerTeams(false); return; }
    setLoadingPlayerTeams(true);
    playersService.getPlayerTeamIds(playerId)
      .then(setPlayerTeamIds)
      .catch(() => setPlayerTeamIds([]))
      .finally(() => setLoadingPlayerTeams(false));
  }, [playerId]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAddPlayerToTeam = async (teamId: string) => {
    if (!playerId || !teamId) return;
    setTeamActionError(null);
    setTeamActionLoading(true);
    try {
      await playersService.addPlayerToTeam(playerId, teamId);
      setPlayerTeamIds(prev => [...prev, teamId]);
      setAssociateTeamId('');
    } catch (err) {
      setTeamActionError(err instanceof Error ? err.message : "Erreur lors de l'association");
    } finally {
      setTeamActionLoading(false);
    }
  };

  const handleRemovePlayerFromTeam = async (teamId: string) => {
    if (!playerId || !teamId) return;
    setTeamActionError(null);
    setTeamActionLoading(true);
    try {
      await playersService.removePlayerFromTeam(playerId, teamId);
      setPlayerTeamIds(prev => prev.filter(id => id !== teamId));
    } catch (err) {
      setTeamActionError(err instanceof Error ? err.message : 'Erreur lors de la dissociation');
    } finally {
      setTeamActionLoading(false);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerId) return;
    setSavingEvent(true);
    try {
      const newEvent = await playerEventsService.create({
        player_id: playerId,
        event_type: eventFormType,
        event_date: eventForm.event_date,
        report: eventFormType === 'interview' ? eventForm.report || null : null,
        injury_type: eventFormType === 'injury' ? eventForm.injury_type || null : null,
        unavailability_days: eventFormType === 'injury' && eventForm.unavailability_days ? parseInt(eventForm.unavailability_days, 10) : null,
        matches_suspended: eventFormType === 'suspension' && eventForm.matches_suspended ? parseInt(eventForm.matches_suspended, 10) : null,
      });
      setEvents(prev => [newEvent, ...prev]);
      setShowEventForm(false);
      setEventForm({ event_date: format(new Date(), 'yyyy-MM-dd'), report: '', injury_type: '', unavailability_days: '', matches_suspended: '' });
    } catch (err) {
      console.error('Erreur création événement:', err);
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      await playerEventsService.delete(id);
      setEvents(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      console.error('Erreur suppression événement:', err);
    }
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]" style={{ background: T.pageBg }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: T.accent }} />
      </div>
    );
  }

  if (!activeTeam) {
    return (
      <div className="p-8" style={{ background: T.pageBg }}>
        <Link href="/webapp/manager/squad" className="inline-flex items-center gap-2 mb-4" style={{ color: T.accent }}>
          <ArrowLeft className="h-4 w-4" />Retour à l&apos;effectif
        </Link>
        <div className="rounded-lg p-6 text-center" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <p className="font-medium" style={{ color: '#92400E' }}>Veuillez sélectionner une équipe pour voir le profil du joueur.</p>
        </div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="p-8" style={{ background: T.pageBg }}>
        <Link href="/webapp/manager/squad" className="inline-flex items-center gap-2 mb-4" style={{ color: T.accent }}>
          <ArrowLeft className="h-4 w-4" />Retour à l&apos;effectif
        </Link>
        <div className="rounded-lg p-6 text-center" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <p className="font-medium" style={{ color: '#991B1B' }}>{error || 'Joueur introuvable'}</p>
        </div>
      </div>
    );
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const initials = `${player.first_name?.[0] || ''}${player.last_name?.[0] || ''}`.toUpperCase();
  const isGK = isGoalkeeper(player.position);
  const statDefs = isGK ? GK_STAT_DEFS : FIELD_STAT_DEFS;
  const radarAxes = isGK ? GK_AXES : FIELD_AXES;
  const hasRealStats = radarData !== null && radarData.raw.matchCount > 0;

  const normAvg = (rawKey: keyof RadarPerMatchStats) => {
    if (!radarData) return 0;
    const max = radarData.squadMax[rawKey];
    return max > 0 ? Math.round(Math.max(0, radarData.squadAvg[rawKey] / max) * 100) : 0;
  };

  const radarChartData = radarAxes.map(axis => ({
    subject:     axis.label,
    value:       radarData ? radarData.normalized[axis.normKey] : 0,
    avgValue:    normAvg(axis.rawKey),
    rawValue:    radarData ? (radarData.raw[axis.rawKey] as number) : 0,
    rawAvgValue: radarData ? radarData.squadAvg[axis.rawKey] : 0,
    rawMaxValue: radarData ? radarData.squadMax[axis.rawKey] : 0,
    fmt:         axis.format,
    fullMark:    100,
  }));

  // Attendance from allSessions
  const totalSessions = allSessions.length;
  const recordedCount = allSessions.filter(s => s.status !== 'not_recorded').length;
  const presentCount  = allSessions.filter(s => s.status === 'present').length;
  const lateCount     = allSessions.filter(s => s.status === 'late').length;
  const absentCount   = allSessions.filter(s => s.status === 'absent').length;
  const injuredCount  = allSessions.filter(s => s.status === 'injured').length;
  const attendedCount = presentCount + lateCount;
  const attPct        = recordedCount > 0 ? Math.round((attendedCount / recordedCount) * 100) : 0;
  const monthGroups   = groupByMonth(allSessions);

  // Match VND bar
  const totalMatches = stats ? stats.victories + stats.draws + stats.defeats : 0;

  const MATCH_TYPE_TABS: { value: 'all' | 'Championnat' | 'Coupe' | 'Amical'; label: string }[] = [
    { value: 'all',          label: 'Tous' },
    { value: 'Championnat',  label: 'Championnat' },
    { value: 'Coupe',        label: 'Coupe' },
    { value: 'Amical',       label: 'Amical' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-0 w-full" style={{ background: T.pageBg }}>

      {/* Back link */}
      <Link
        href="/webapp/manager/squad"
        className="inline-flex items-center gap-2 mb-6 text-sm font-medium"
        style={{ color: T.accent }}
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à l&apos;effectif
      </Link>

      {/* ── Player card (FM style header) ─────────────────────────────── */}
      <div className="rounded-xl overflow-hidden mb-6" style={{ background: '#1B2F52', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
        <div className="flex flex-col md:flex-row items-center md:items-stretch">
          {/* Number badge */}
          <div className="md:w-28 flex items-center justify-center p-6 md:border-r" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black border-4"
              style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.08)' }}
            >
              {player.number ?? <User className="h-7 w-7 text-slate-300" />}
            </div>
          </div>

          {/* Name + position */}
          <div className="flex-1 px-6 py-5 flex flex-col justify-center">
            <p className="text-2xl font-black text-white tracking-wide leading-none">
              {player.last_name.toUpperCase()}
            </p>
            <p className="text-base font-medium mt-1" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {player.first_name}
            </p>
          </div>

          {/* Right meta */}
          <div className="flex flex-row md:flex-col items-center justify-center gap-3 px-6 py-5">
            {/* Position badge */}
            {(() => {
              const POSITION_MAP: Record<string, { abbr: string; color: string }> = {
                Gardien:   { abbr: 'GB',  color: '#d97706' },
                Ailier:    { abbr: 'AIL', color: '#2563eb' },
                Meneur:    { abbr: 'MEN', color: '#059669' },
                Pivot:     { abbr: 'PIV', color: '#ea580c' },
              };
              const key = Object.keys(POSITION_MAP).find(k =>
                (player.position || '').toLowerCase().startsWith(k.toLowerCase())
              );
              const pos = key ? POSITION_MAP[key] : { abbr: (player.position || '?').slice(0, 3).toUpperCase(), color: '#64748b' };
              return (
                <span
                  className="px-3 py-1 rounded-full text-sm font-bold text-white"
                  style={{ background: pos.color }}
                >
                  {pos.abbr}
                </span>
              );
            })()}
            <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {player.birth_date ? `${calcAge(player.birth_date)} ans · ` : ''}{player.strong_foot || '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Match type filter tabs ─────────────────────────────────────── */}
      <div className="mb-6 flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: T.cardBg, border: `1px solid ${T.border}` }}>
        {MATCH_TYPE_TABS.map(tab => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setMatchTypeFilter(tab.value)}
            className="px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={
              matchTypeFilter === tab.value
                ? { background: T.accent, color: '#fff' }
                : { color: T.textMuted, background: 'transparent' }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Stats hero bar ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Matchs joués', value: stats?.matches_played ?? '—', color: T.text },
          { label: 'Buts',         value: stats?.goals          ?? '—', color: '#d97706' },
          { label: 'Victoires',    value: stats?.victories       ?? '—', color: '#16a34a' },
          { label: 'Nuls',         value: stats?.draws           ?? '—', color: '#64748b' },
          { label: 'Défaites',     value: stats?.defeats         ?? '—', color: '#dc2626' },
        ].map(kpi => (
          <div
            key={kpi.label}
            className="rounded-xl p-4 text-center"
            style={{ background: T.cardBg, border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
          >
            <p className="text-3xl font-black leading-none mb-1" style={{ color: kpi.color }}>{kpi.value}</p>
            <p className="text-xs font-medium" style={{ color: T.textMuted }}>{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* VND progress bar */}
      {totalMatches > 0 && (
        <div className="mb-6 rounded-xl overflow-hidden" style={{ background: T.cardBg, border: `1px solid ${T.border}` }}>
          <div className="flex h-8 rounded-xl overflow-hidden">
            {(stats?.victories ?? 0) > 0 && (
              <div
                className="flex items-center justify-center text-white text-xs font-bold"
                style={{ flex: stats!.victories, background: '#16a34a' }}
              >
                {stats!.victories}V
              </div>
            )}
            {(stats?.draws ?? 0) > 0 && (
              <div
                className="flex items-center justify-center text-white text-xs font-bold"
                style={{ flex: stats!.draws, background: '#94a3b8' }}
              >
                {stats!.draws}N
              </div>
            )}
            {(stats?.defeats ?? 0) > 0 && (
              <div
                className="flex items-center justify-center text-white text-xs font-bold"
                style={{ flex: stats!.defeats, background: '#dc2626' }}
              >
                {stats!.defeats}D
              </div>
            )}
          </div>
          <p className="text-xs text-center py-1.5" style={{ color: T.textMuted }}>
            {totalMatches > 0 ? `${Math.round((stats!.victories / totalMatches) * 100)}% de victoires` : ''}
          </p>
        </div>
      )}

      {/* ── Stats de performance (vraies valeurs) ─────────────────────── */}
      <div className="rounded-xl overflow-hidden mb-6" style={{ background: T.cardBg, border: `1px solid ${T.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: T.border, background: '#F8F9FB' }}>
          <BarChart2 className="h-5 w-5" style={{ color: T.accent }} />
          <div>
            <h3 className="text-lg font-semibold" style={{ color: T.text }}>Stats de performance</h3>
            <p className="text-sm" style={{ color: T.textMuted }}>
              {isGK ? 'Axes gardien (5 stats)' : 'Joueur de champ (8 stats)'} · basé sur les événements match recorder
            </p>
          </div>
        </div>
        <div className="p-6">
          {radarLoading ? (
            <div className="h-60 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: T.accent }} />
            </div>
          ) : !hasRealStats ? (
            <div className="py-10 text-center">
              <BarChart2 className="h-10 w-10 mx-auto mb-3" style={{ color: T.border }} />
              <p className="text-sm font-medium" style={{ color: T.textMuted }}>Aucune donnée du match recorder disponible</p>
              <p className="text-xs mt-1 max-w-xs mx-auto" style={{ color: T.textMuted }}>
                Les stats apparaissent dès que le joueur a participé à au moins un match avec des événements enregistrés.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs mb-5" style={{ color: T.textMuted }}>
                Basé sur {radarData!.raw.matchCount} match{radarData!.raw.matchCount > 1 ? 's' : ''} joué{radarData!.raw.matchCount > 1 ? 's' : ''}
                {isGK ? ' · Axes gardien (5 axes)' : ' · Joueur de champ (8 axes)'}
              </p>

              {/* Radar + stats grid side by side */}
              <div className="flex flex-col lg:flex-row gap-6 items-start">

                {/* Radar chart */}
                <div className="w-full lg:w-80 shrink-0 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="68%" data={radarChartData}>
                      <PolarGrid stroke={T.border} />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fill: T.textMuted, fontSize: 11, fontWeight: 500 }}
                      />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 100]}
                        tick={{ fill: T.textMuted, fontSize: 9 }}
                        tickCount={4}
                      />
                      <Radar
                        name="Moy. effectif"
                        dataKey="avgValue"
                        stroke="#94a3b8"
                        fill="#94a3b8"
                        fillOpacity={0.12}
                        strokeDasharray="5 3"
                        dot={false}
                      />
                      <Radar
                        name="Joueur"
                        dataKey="value"
                        stroke={T.accent}
                        fill={T.accent}
                        fillOpacity={0.18}
                        dot={{ r: 3, fill: T.accent }}
                      />
                      <Legend
                        iconSize={8}
                        wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                        formatter={(name) => <span style={{ color: T.textMuted }}>{name}</span>}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const pt = payload[0]?.payload as typeof radarChartData[0];
                          if (!pt) return null;
                          const rows = [
                            { label: 'Joueur',        value: pt.fmt(pt.rawValue),    color: T.accent  },
                            { label: 'Moy. effectif', value: pt.fmt(pt.rawAvgValue), color: '#94a3b8' },
                            { label: 'Max effectif',  value: pt.fmt(pt.rawMaxValue), color: T.textMuted },
                          ];
                          return (
                            <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, lineHeight: 1.7 }}>
                              <p style={{ fontWeight: 700, color: T.text, marginBottom: 4 }}>{pt.subject}</p>
                              {rows.map(r => (
                                <p key={r.label} style={{ color: T.textMuted }}>
                                  <span style={{ color: r.color, fontWeight: 700 }}>{r.value}</span>
                                  {' '}{r.label}
                                </p>
                              ))}
                            </div>
                          );
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* Real stats grid */}
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
                  {statDefs.map(def => {
                    const val = radarData!.raw[def.key] as number;
                    return (
                      <div
                        key={def.key}
                        className="rounded-xl p-3.5 flex flex-col gap-0.5"
                        style={{ background: T.pageBg, border: `1px solid ${T.border}` }}
                      >
                        <p className="text-xl font-black leading-none" style={{ color: def.color }}>
                          {def.format(val)}
                        </p>
                        <p className="text-sm font-semibold leading-tight mt-1" style={{ color: T.text }}>{def.label}</p>
                        <p className="text-xs" style={{ color: T.textMuted }}>{def.sublabel}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Présence aux séances (style mobile) ───────────────────────── */}
      <div className="rounded-xl overflow-hidden mb-6" style={{ background: T.cardBg, border: `1px solid ${T.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div className="p-4 border-b" style={{ borderColor: T.border, background: '#F8F9FB' }}>
          <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: T.text }}>
            <Activity className="h-5 w-5" style={{ color: T.accent }} />
            Présence aux séances
          </h3>
        </div>
        <div className="p-6">

          {/* KPI row */}
          <div className="flex flex-col sm:flex-row items-start gap-6 mb-4">
            {/* Big percentage */}
            <div className="shrink-0">
              <p className="text-5xl font-black leading-none" style={{ color: T.text }}>{attPct}%</p>
              <p className="text-xs font-semibold uppercase tracking-wide mt-1" style={{ color: T.textMuted }}>présence</p>
              <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>{attendedCount} / {recordedCount} séances</p>
            </div>
            {/* Counters grid */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 flex-1">
              {[
                { color: '#16a34a', label: 'Présent',  value: presentCount  },
                { color: '#f59e0b', label: 'Retard',   value: lateCount     },
                { color: '#dc2626', label: 'Absent',   value: absentCount   },
                { color: '#7c3aed', label: 'Blessé',   value: injuredCount  },
              ].map(c => (
                <div key={c.label} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
                  <span className="text-sm" style={{ color: T.textMuted }}>{c.label}</span>
                  <span className="ml-auto font-bold text-sm" style={{ color: c.color }}>{c.value}</span>
                  <span className="text-xs w-8 text-right" style={{ color: T.textMuted }}>
                    {totalSessions > 0 ? `${Math.round((c.value / totalSessions) * 100)}%` : '0%'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Total séances */}
          <p className="text-xs mb-5" style={{ color: T.textMuted }}>
            {totalSessions} séances au total cette saison
            {totalSessions - recordedCount > 0 ? ` · ${totalSessions - recordedCount} non enregistrées` : ''}
          </p>

          {/* Month-by-month dot grid */}
          {allSessions.length > 0 && (
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-5" style={{ minWidth: 'max-content' }}>
                {monthGroups.map(group => (
                  <div key={group.month} className="shrink-0">
                    <p
                      className="text-[10px] font-semibold uppercase tracking-wide mb-2"
                      style={{ color: T.textMuted }}
                    >
                      {group.month}
                    </p>
                    <div className="flex flex-wrap gap-1" style={{ maxWidth: 112 }}>
                      {group.items.map((s, i) => (
                        <div
                          key={i}
                          className="w-5 h-5 rounded-sm"
                          style={{ background: SESSION_COLORS[s.status] }}
                          title={`${new Date(s.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} — ${{
                            present: 'Présent',
                            late: 'Retard',
                            absent: 'Absent',
                            injured: 'Blessé',
                            not_recorded: 'Non enregistré',
                          }[s.status]}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full-season progress bar */}
          {allSessions.length > 0 && (
            <div className="flex gap-px h-3 rounded-full overflow-hidden mt-4">
              {allSessions.map((s, i) => (
                <div
                  key={i}
                  className="flex-1"
                  style={{ background: SESSION_COLORS[s.status], minWidth: 2 }}
                />
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-3 text-xs" style={{ color: T.textMuted }}>
            {[
              { key: 'present',      label: 'Présent',        color: '#16a34a' },
              { key: 'late',         label: 'Retard',         color: '#f59e0b' },
              { key: 'absent',       label: 'Absent',         color: '#dc2626' },
              { key: 'injured',      label: 'Blessé',         color: '#7c3aed' },
              { key: 'not_recorded', label: 'N/E',            color: '#DDE1EA' },
            ].map(l => (
              <span key={l.key} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Feedback questionnaire line chart ──────────────────────────── */}
      <div className="rounded-xl overflow-hidden mb-6" style={{ background: T.cardBg, border: `1px solid ${T.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div className="p-4 border-b flex flex-wrap items-center gap-3" style={{ borderColor: T.border, background: '#F8F9FB' }}>
          <h3 className="text-lg font-semibold" style={{ color: T.text }}>Questionnaire — Évolution</h3>
          <select
            value={feedbackMetric}
            onChange={e => setFeedbackMetric(e.target.value as typeof feedbackMetric)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium"
            style={{ border: `1px solid ${T.border}`, color: T.text, background: T.cardBg }}
          >
            <option value="auto_evaluation">Auto-évaluation globale</option>
            <option value="pleasure">Plaisir</option>
            <option value="rpe">RPE (intensité perçue)</option>
            <option value="physical_form">Forme physique ressentie</option>
          </select>
        </div>
        <div className="p-6">
          {feedbackHistory.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: T.textMuted }}>
              Aucun questionnaire rempli pour ce joueur
            </p>
          ) : feedbackHistory.length < 2 ? (
            <p className="text-center py-12 text-sm" style={{ color: T.textMuted }}>
              Pas assez de données (minimum 2 séances)
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={feedbackHistory.map((row, i) => ({
                    session: format(new Date(row.date), 'd MMM yy', { locale: fr }),
                    index: i + 1,
                    value: row[feedbackMetric] ?? 0,
                  }))}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="session" tick={{ fontSize: 11, fill: T.textMuted }} />
                  <YAxis domain={[1, 10]} tick={{ fontSize: 11, fill: T.textMuted }} allowDecimals={false} />
                  <Tooltip
                    formatter={(value: number) => [value, { auto_evaluation: 'Auto-éval.', rpe: 'RPE', physical_form: 'Forme', pleasure: 'Plaisir' }[feedbackMetric]]}
                    labelFormatter={label => `Séance : ${label}`}
                    contentStyle={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="value" stroke={T.accent} strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Team management ────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden mb-6" style={{ background: T.cardBg, border: `1px solid ${T.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div className="p-4 border-b" style={{ borderColor: T.border, background: '#F8F9FB' }}>
          <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: T.text }}>
            <Users className="h-5 w-5" style={{ color: T.accent }} />
            Équipes
          </h3>
          <p className="text-sm mt-1" style={{ color: T.textMuted }}>Associer ou dissocier ce joueur des équipes du club.</p>
        </div>
        <div className="p-4">
          {teamActionError && (
            <div className="mb-4 p-3 rounded-lg text-sm flex items-center justify-between" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }}>
              {teamActionError}
              <button type="button" onClick={() => setTeamActionError(null)} className="hover:opacity-70">×</button>
            </div>
          )}
          {loadingPlayerTeams ? (
            <p className="text-sm" style={{ color: T.textMuted }}>Chargement des équipes…</p>
          ) : (
            <>
              <div className="space-y-2 mb-4">
                <p className="text-sm font-medium" style={{ color: T.text }}>Équipes actuelles</p>
                {clubTeams.filter(t => playerTeamIds.includes(t.id)).length === 0 ? (
                  <p className="text-sm" style={{ color: T.textMuted }}>Ce joueur n&apos;est associé à aucune équipe du club.</p>
                ) : (
                  <ul className="space-y-2">
                    {clubTeams.filter(t => playerTeamIds.includes(t.id)).map(team => (
                      <li key={team.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg" style={{ background: T.pageBg, border: `1px solid ${T.border}` }}>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                          <span className="font-medium text-sm" style={{ color: T.text }}>{team.name}</span>
                          {(team.category || team.level) && (
                            <span className="text-sm" style={{ color: T.textMuted }}>{[team.category, team.level].filter(Boolean).join(' · ')}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePlayerFromTeam(team.id)}
                          disabled={teamActionLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md disabled:opacity-50"
                          style={{ color: '#dc2626', background: '#FEF2F2', border: '1px solid #FECACA' }}
                        >
                          <UserMinus className="h-4 w-4" />Retirer
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="pt-4" style={{ borderTop: `1px solid ${T.border}` }}>
                <p className="text-sm font-medium mb-2" style={{ color: T.text }}>Associer à une équipe</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={associateTeamId}
                    onChange={e => setAssociateTeamId(e.target.value)}
                    className="rounded-md px-3 py-2 text-sm"
                    style={{ border: `1px solid ${T.border}`, color: T.text, background: T.cardBg }}
                  >
                    <option value="">Choisir une équipe</option>
                    {clubTeams.filter(t => !playerTeamIds.includes(t.id)).map(team => (
                      <option key={team.id} value={team.id}>
                        {team.name}{team.category ? ` (${team.category}${team.level ? ` - ${team.level}` : ''})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => associateTeamId && handleAddPlayerToTeam(associateTeamId)}
                    disabled={!associateTeamId || teamActionLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md disabled:opacity-50 disabled:pointer-events-none"
                    style={{ background: T.accent, color: '#fff' }}
                  >
                    <UserPlus className="h-4 w-4" />Associer
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Link code ───────────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden mb-6" style={{ background: T.cardBg, border: `1px solid ${T.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div className="p-4 border-b" style={{ borderColor: T.border, background: '#F8F9FB' }}>
          <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: T.text }}>
            <Link2 className="h-5 w-5" style={{ color: T.accent }} />
            Compte joueur
          </h3>
          <p className="text-sm mt-1" style={{ color: T.textMuted }}>
            Permet au joueur d&apos;accéder au calendrier (présences) et aux questionnaires depuis son compte.
          </p>
        </div>
        <div className="p-6">
          {linkCodeError && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }}>
              {linkCodeError}
            </div>
          )}
          {player.user_id ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: '#DCFCE7', color: '#166534' }}>
                <Check className="h-4 w-4" />Compte lié
              </span>
              <button
                type="button"
                disabled={unlinkLoading}
                onClick={async () => {
                  setLinkCodeError(null);
                  setUnlinkLoading(true);
                  const { error } = await supabase.from('players').update({ user_id: null }).eq('id', playerId);
                  setUnlinkLoading(false);
                  if (error) { setLinkCodeError(error.message); return; }
                  setPlayer((p: Player | null) => p ? { ...p, user_id: undefined } : null);
                }}
                className="text-sm font-medium disabled:opacity-50"
                style={{ color: T.accentAmber }}
              >
                {unlinkLoading ? 'Déliage...' : 'Délier le compte'}
              </button>
            </div>
          ) : linkCode ? (
            <div className="space-y-3">
              <p className="text-sm font-medium" style={{ color: T.text }}>Code à transmettre au joueur (valide 24 h) :</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="px-4 py-2 rounded-lg text-lg font-mono tracking-wider" style={{ background: T.pageBg, border: `1px solid ${T.border}`, color: T.text }}>
                  {linkCode}
                </code>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(linkCode); setLinkCodeCopied(true); setTimeout(() => setLinkCodeCopied(false), 2000); }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ background: T.pageBg, border: `1px solid ${T.border}`, color: T.text }}
                >
                  {linkCodeCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  {linkCodeCopied ? 'Copié' : 'Copier'}
                </button>
              </div>
              <p className="text-sm" style={{ color: T.textMuted }}>
                Le joueur doit se connecter puis aller dans <strong>Paramètres</strong> → <strong>Lier mon compte joueur</strong> et saisir ce code.
              </p>
              <button type="button" onClick={() => { setLinkCode(null); setLinkCodeError(null); }} className="text-sm" style={{ color: T.textMuted }}>Fermer</button>
            </div>
          ) : (
            <div>
              <p className="text-sm mb-3" style={{ color: T.textMuted }}>Aucun compte lié. Générez un code que le joueur saisira dans Paramètres.</p>
              <button
                type="button"
                disabled={linkCodeLoading}
                onClick={async () => {
                  setLinkCodeError(null);
                  setLinkCodeLoading(true);
                  const result = await createPlayerLinkCode(playerId);
                  setLinkCodeLoading(false);
                  if (result.ok && result.code) { setLinkCode(result.code); }
                  else { setLinkCodeError(result.error ?? 'Erreur'); }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: T.accent, color: '#fff' }}
              >
                {linkCodeLoading ? 'Génération...' : 'Générer un code de liaison'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Events ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden" style={{ background: T.cardBg, border: `1px solid ${T.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: T.border, background: '#F8F9FB' }}>
          <h3 className="text-lg font-semibold" style={{ color: T.text }}>
            Événements marquants
            {events.length > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: T.pageBg, color: T.textMuted }}>
                {events.length}
              </span>
            )}
          </h3>
          <button
            type="button"
            onClick={() => {
              setShowEventForm(!showEventForm);
              setEventFormType('interview');
              setEventForm({ event_date: format(new Date(), 'yyyy-MM-dd'), report: '', injury_type: '', unavailability_days: '', matches_suspended: '' });
            }}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg"
            style={{ color: T.accent }}
          >
            <Plus className="h-4 w-4" />
            Ajouter un événement
          </button>
        </div>

        {showEventForm && (
          <form onSubmit={handleAddEvent} className="p-4 border-b" style={{ background: '#F0F5FF', borderColor: T.border }}>
            <div className="flex flex-wrap gap-2 mb-4">
              {(['interview', 'injury', 'suspension'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEventFormType(t)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={
                    eventFormType === t
                      ? { background: T.accent, color: '#fff' }
                      : { background: T.cardBg, color: T.text, border: `1px solid ${T.border}` }
                  }
                >
                  {t === 'interview' && <MessageSquare className="h-4 w-4" />}
                  {t === 'injury' && <Stethoscope className="h-4 w-4" />}
                  {t === 'suspension' && <Ban className="h-4 w-4" />}
                  {t === 'interview' ? 'Entretien individuel' : t === 'injury' ? 'Blessure' : 'Suspension'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Date *</label>
                <input
                  type="date" required
                  value={eventForm.event_date}
                  onChange={e => setEventForm(f => ({ ...f, event_date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ border: `1px solid ${T.border}`, color: T.text, background: T.cardBg }}
                />
              </div>
              {eventFormType === 'interview' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Compte rendu</label>
                  <textarea
                    value={eventForm.report}
                    onChange={e => setEventForm(f => ({ ...f, report: e.target.value }))}
                    rows={3} placeholder="Résumé de l'entretien..."
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ border: `1px solid ${T.border}`, color: T.text, background: T.cardBg }}
                  />
                </div>
              )}
              {eventFormType === 'injury' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Type de blessure</label>
                    <input type="text" value={eventForm.injury_type} onChange={e => setEventForm(f => ({ ...f, injury_type: e.target.value }))} placeholder="Ex: entorse cheville..." className="w-full px-3 py-2 rounded-lg text-sm" style={{ border: `1px solid ${T.border}`, color: T.text, background: T.cardBg }} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Durée indisponibilité (jours)</label>
                    <input type="number" min="1" value={eventForm.unavailability_days} onChange={e => setEventForm(f => ({ ...f, unavailability_days: e.target.value }))} placeholder="Ex: 14" className="w-full px-3 py-2 rounded-lg text-sm" style={{ border: `1px solid ${T.border}`, color: T.text, background: T.cardBg }} />
                  </div>
                </>
              )}
              {eventFormType === 'suspension' && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Nombre de matchs</label>
                  <input type="number" min="1" value={eventForm.matches_suspended} onChange={e => setEventForm(f => ({ ...f, matches_suspended: e.target.value }))} placeholder="Ex: 2" className="w-full px-3 py-2 rounded-lg text-sm" style={{ border: `1px solid ${T.border}`, color: T.text, background: T.cardBg }} />
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button type="submit" disabled={savingEvent} className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: T.accent, color: '#fff' }}>
                {savingEvent ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button type="button" onClick={() => setShowEventForm(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: T.pageBg, color: T.text, border: `1px solid ${T.border}` }}>
                Annuler
              </button>
            </div>
          </form>
        )}

        <div className="p-4">
          {events.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: T.textMuted }}>
              Aucun événement enregistré. Ajoutez un entretien, une blessure ou une suspension.
            </p>
          ) : (
            <ul className="space-y-3">
              {events.map(ev => (
                <li key={ev.id} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: T.pageBg, border: `1px solid ${T.border}` }}>
                  <div className="flex-shrink-0 mt-0.5">
                    {ev.event_type === 'interview'  && <MessageSquare className="h-5 w-5" style={{ color: T.accent }} />}
                    {ev.event_type === 'injury'     && <Stethoscope className="h-5 w-5 text-red-600" />}
                    {ev.event_type === 'suspension' && <Ban className="h-5 w-5" style={{ color: T.accentAmber }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm" style={{ color: T.text }}>
                      {ev.event_type === 'interview'  && 'Entretien individuel'}
                      {ev.event_type === 'injury'     && `Blessure${ev.injury_type ? ` - ${ev.injury_type}` : ''}`}
                      {ev.event_type === 'suspension' && `Suspension - ${ev.matches_suspended} match${ev.matches_suspended && ev.matches_suspended > 1 ? 's' : ''}`}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>
                      {format(new Date(ev.event_date), 'd MMMM yyyy', { locale: fr })}
                    </p>
                    {ev.report && <p className="text-sm mt-1" style={{ color: T.text }}>{ev.report}</p>}
                    {ev.event_type === 'injury' && ev.unavailability_days && (
                      <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>
                        Indisponible {ev.unavailability_days} jour{ev.unavailability_days > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(ev.id)}
                    className="p-1.5 rounded hover:opacity-70 transition-opacity"
                    title="Supprimer"
                    style={{ color: '#dc2626' }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
