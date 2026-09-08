'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Activity, AlertCircle, BarChart2, Calendar, CheckCircle2,
  Loader2, Target, Trophy, User, Zap, Gauge, Clock3,
  Mic, Stethoscope, Ban, MessageSquare, Trash2, HeartPulse, Pencil, X,
} from 'lucide-react';
import { usePlayerProfile } from '../../hooks/usePlayerProfile';
import { useTheme } from '../../contexts/ThemeContext';
import { useActiveSeasonContext } from '../../contexts/ActiveSeasonContext';
import type { ThemeColors } from '@/lib/design/tokens';
import { getMyPlayerTeamIds } from '@/lib/services/playerConvocationsService';
import { playersService } from '@/lib/services/playersService';
import { matchesService } from '@/lib/services/matchesService';
import { matchRatingsService } from '@/lib/services/matchRatingsService';
import { trainingsService } from '@/lib/services/trainingsService';
import { playerEventsService } from '@/lib/services/playerEventsService';
import { getPlayerPainReports, deleteMyPainReport, updateMyPainReport } from '@/lib/services/painReportsService';
import { getPlayerTrainingFeedback, type PlayerTrainingFeedbackRow } from '@/lib/services/trainingFeedbackService';
import { INTENSITY_COLORS, INTENSITY_LABELS, zoneLabel, toPayload } from '@/lib/painMap';
import BodyMap, { type PainSelection } from '@/components/BodyMap';
import type { PlayerEvent, PlayerEventType, PainReportGroup, PlayerStatus } from '@/types';
import { PlayerTestsPanel } from './PlayerTestsPanel';

const RadarChartWrapper = dynamic(() => import('../../components/RadarChartWrapper'), { ssr: false });

// ─── Palette dérivée du thème actif (voir lib/design/tokens.ts) ───────────────

function paletteFrom(c: ThemeColors) {
  return {
    pageBg:    c.bg.canvas,
    cardBg:    c.bg.surface,
    cardBg2:   c.bg.sunken,
    border:    c.border.subtle,
    divider:   c.border.subtle,
    text:      c.text.primary,
    textMuted: c.text.secondary,
    textFaint: c.text.tertiary,
    navy:      c.accent.fill,
    green:     c.positive.default,
    greenBg:   c.positive.subtle,
    amber:     c.warning.default,
    amberBg:   c.warning.subtle,
    red:       c.negative.default,
    redBg:     c.negative.subtle,
    blue:      c.accent.default,
    blueBg:    c.accent.subtle,
  };
}
type Palette = ReturnType<typeof paletteFrom>;

type MatchFilter = 'all' | 'Championnat' | 'Coupe' | 'Amical';
type TrainingSessionStatus = PlayerStatus | 'not_recorded';

const MATCH_FILTERS: { key: MatchFilter; label: string }[] = [
  { key: 'all',         label: 'Tous'          },
  { key: 'Championnat', label: 'Championnat'   },
  { key: 'Coupe',       label: 'Coupe'         },
  { key: 'Amical',      label: 'Amical'        },
];

const RADAR_LABELS = ['Buts', 'Tirs cadrés', 'Passes D.', 'Récup.', 'Pertes', '+/-', 'Temps'];

// Miroir de mobile/components/PlayerDetailView.tsx (EVENT_TYPES) : même icône,
// même ordre, pour que le vocabulaire des événements reste identique.
const EVENT_TYPES: { key: PlayerEventType; label: string; icon: typeof Mic }[] = [
  { key: 'interview',   label: 'Entretien',   icon: Mic },
  { key: 'injury',      label: 'Blessure',    icon: Stethoscope },
  { key: 'suspension',  label: 'Suspension',  icon: Ban },
  { key: 'feedback',    label: 'Commentaire', icon: MessageSquare },
];
const eventMeta = (t: PlayerEventType) => EVENT_TYPES.find(e => e.key === t) ?? EVENT_TYPES[0];

function calcAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function fmtMonth(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

function groupByMonth(sessions: { date: string; status: TrainingSessionStatus }[]) {
  const map = new Map<string, { date: string; status: TrainingSessionStatus }[]>();
  for (const s of sessions) {
    const key = fmtMonth(s.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries()).map(([month, items]) => ({ month, items }));
}

function isGoalkeeper(position?: string) {
  return (position ?? '').toLowerCase().startsWith('gardien');
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlayerProfilePage() {
  const { player } = usePlayerProfile();
  const { theme } = useTheme();
  const T = paletteFrom(theme.colors);
  const { activeSeason } = useActiveSeasonContext();

  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const [teamId,      setTeamId]      = useState<string | null>(null);
  const [stats,       setStats]       = useState<Awaited<ReturnType<typeof playersService.getPlayerStats>> | null>(null);
  const [radarData,   setRadarData]   = useState<Awaited<ReturnType<typeof playersService.getPlayerRadarStats>> | null>(null);
  const [feedback,    setFeedback]    = useState<PlayerTrainingFeedbackRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const [allSessions, setAllSessions] = useState<{ date: string; status: TrainingSessionStatus }[]>([]);
  const [ratingSeries, setRatingSeries] = useState<{ date: string; rating: number }[]>([]);
  const [events,       setEvents]       = useState<PlayerEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [painReports,  setPainReports]  = useState<PainReportGroup[]>([]);
  const [painLoading,  setPainLoading]  = useState(true);

  // Load base data (teamId + attendance calendar) once
  const loadBase = useCallback(async () => {
    if (!player?.id) { setLoading(false); return; }
    setError(null);
    try {
      const teamIds = await getMyPlayerTeamIds();
      const tid = teamIds[0] ?? null;
      setTeamId(tid);
      if (tid) {
        const trainings = await trainingsService.getTrainingsByTeam(tid, activeSeason);
        const sorted = [...trainings].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setAllSessions(sorted.map(t => ({
          date: typeof t.date === 'string' ? t.date : (t.date as Date).toISOString(),
          status: ((t.attendance as Record<string, PlayerStatus>)?.[player.id] ?? 'not_recorded') as TrainingSessionStatus,
        })));
      } else {
        setAllSessions([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au chargement');
    } finally {
      setLoading(false);
    }
  }, [player?.id, activeSeason]);

  // Load feedback history separately (doesn't depend on filter)
  const loadFeedback = useCallback(async () => {
    if (!player?.id) return;
    setFeedbackLoading(true);
    try {
      const rows = await getPlayerTrainingFeedback(player.id);
      setFeedback(rows.slice().reverse().slice(0, 10)); // last 10, most recent first
    } catch { setFeedback([]); }
    finally { setFeedbackLoading(false); }
  }, [player?.id]);

  // Events (lecture seule côté joueur) et douleurs déclarées
  const loadEvents = useCallback(async () => {
    if (!player?.id) { setEventsLoading(false); return; }
    setEventsLoading(true);
    try { setEvents(await playerEventsService.getByPlayerId(player.id)); }
    catch { setEvents([]); }
    finally { setEventsLoading(false); }
  }, [player?.id]);

  const loadPain = useCallback(async () => {
    if (!player?.id) { setPainLoading(false); return; }
    setPainLoading(true);
    try { setPainReports(await getPlayerPainReports(player.id)); }
    catch { setPainReports([]); }
    finally { setPainLoading(false); }
  }, [player?.id]);

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { loadFeedback(); }, [loadFeedback]);
  useEffect(() => { loadEvents(); }, [loadEvents]);
  useEffect(() => { loadPain(); }, [loadPain]);

  // Reload stats+radar when teamId or filter changes
  useEffect(() => {
    if (!player?.id || !teamId) return;
    let cancelled = false;
    setStatsLoading(true);
    setStats(null); setRadarData(null);
    Promise.all([
      playersService.getPlayerStats(player.id, teamId, matchFilter),
      playersService.getPlayerRadarStats(player.id, teamId, matchFilter),
    ]).then(([s, r]) => {
      if (!cancelled) { setStats(s); setRadarData(r); }
    }).catch(() => {}).finally(() => {
      if (!cancelled) setStatsLoading(false);
    });
    return () => { cancelled = true; };
  }, [player?.id, teamId, matchFilter]);

  // Note de match — évolution, sur les matchs filtrés de la saison active
  useEffect(() => {
    if (!player?.id || !teamId) { setRatingSeries([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const teamMatches = await matchesService.getMatchesByTeam(teamId, activeSeason);
        const scoped = matchFilter === 'all' ? teamMatches : teamMatches.filter(m => m.competition === matchFilter);
        const rows = await matchRatingsService.getRatingsForMatches(scoped.map(m => m.id));
        if (cancelled) return;
        setRatingSeries(
          rows.filter(r => r.player_id === player.id)
            .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())
            .map(r => ({ date: r.match_date, rating: r.rating }))
        );
      } catch { if (!cancelled) setRatingSeries([]); }
    })();
    return () => { cancelled = true; };
  }, [player?.id, teamId, activeSeason, matchFilter]);

  const deletePain = useCallback(async (reportGroup: string) => {
    if (!confirm('Supprimer ce signalement ? Cette action est définitive.')) return;
    const res = await deleteMyPainReport(reportGroup);
    if (res.success) setPainReports(prev => prev.filter(g => g.report_group !== reportGroup));
  }, []);

  const [editingPain, setEditingPain] = useState<PainReportGroup | null>(null);

  if (!player) {
    return (
      <div style={{ background: T.pageBg, minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', height: 240 }}>
        <User size={48} color={T.textFaint} style={{ marginBottom: 14 }} />
        <p style={{ fontSize: 14, color: T.textMuted, textAlign: 'center', maxWidth: 280 }}>
          Profil joueur non disponible. Demandez à votre coach de lier votre compte à votre fiche joueur.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ background: T.pageBg, minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240 }}>
        <Loader2 size={24} color={T.textFaint} style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Build radar chart data
  const radarChartData = radarData ? {
    labels: RADAR_LABELS,
    datasets: [{
      label: `${player.first_name} ${player.last_name}`,
      data: [
        radarData.normalized.goalsPerMatch,
        radarData.normalized.shotsOnTargetPerMatch,
        radarData.normalized.assistsPerMatch,
        radarData.normalized.recoveriesPerMatch,
        100 - radarData.normalized.ballLossPerMatch, // inverted
        Math.max(0, Math.min(100, radarData.normalized.plusMinus + 50)),
        radarData.normalized.avgPlaytime,
      ],
      backgroundColor: `${T.navy}26`,
      borderColor: T.navy,
      borderWidth: 2,
      pointBackgroundColor: T.navy,
      pointRadius: 4,
    }],
  } : null;

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: true,
    scales: {
      r: {
        min: 0, max: 100, ticks: { display: false, stepSize: 25 },
        grid: { color: T.divider },
        pointLabels: { font: { size: 11 }, color: T.textMuted },
        angleLines: { color: T.border },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true },
    },
  };

  const initials = `${player.first_name?.[0] ?? ''}${player.last_name?.[0] ?? ''}`.toUpperCase();

  const attTotal    = allSessions.length;
  const attRecorded = allSessions.filter(s => s.status !== 'not_recorded').length;
  const attPresent  = allSessions.filter(s => s.status === 'present').length;
  const attLate     = allSessions.filter(s => s.status === 'late').length;
  const attAbsent   = allSessions.filter(s => s.status === 'absent').length;
  const attInjured  = allSessions.filter(s => s.status === 'injured').length;
  const attPct      = attRecorded > 0 ? Math.round(((attPresent + attLate) / attRecorded) * 100) : 0;
  const monthGroups = groupByMonth(allSessions);

  const sessionColor = (status: TrainingSessionStatus) => ({
    present: T.green, late: T.amber, absent: T.red, injured: T.blue, not_recorded: T.border,
  }[status]);

  return (
    <div style={{ background: T.pageBg, minHeight: '100%' }}>
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.redBg, padding: '10px 20px', borderBottom: '1px solid #fee2e2' }}>
          <AlertCircle size={15} color={T.red} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: T.red }}>{error}</span>
          <button onClick={loadBase} style={{ fontSize: 13, fontWeight: 700, color: T.red, background: 'none', border: 'none', cursor: 'pointer' }}>Réessayer</button>
        </div>
      )}

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px 48px' }}>
        {/* ── Player card ────────────────────────────────────────── */}
        <div style={{ background: T.cardBg, borderRadius: 14, border: `1px solid ${T.border}`, borderLeft: `4px solid ${T.navy}`, padding: '20px', marginBottom: 16, boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: T.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {player.number != null
                ? <span style={{ color: '#fff', fontWeight: 900, fontSize: 20 }}>#{player.number}</span>
                : <span style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>{initials}</span>
              }
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: T.text, margin: 0, letterSpacing: '-0.3px' }}>
                {player.first_name} {player.last_name}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 5 }}>
                {player.position && <Tag text={player.position} />}
                {player.strong_foot && <Tag text={`Pied ${player.strong_foot}`} />}
                {player.birth_date && <Tag text={`${calcAge(player.birth_date)} ans`} />}
              </div>
            </div>
          </div>
        </div>

        {/* ── Match filter ───────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {MATCH_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setMatchFilter(f.key)}
              style={{
                padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                border: `1.5px solid ${matchFilter === f.key ? T.navy : T.border}`,
                background: matchFilter === f.key ? T.navy : T.cardBg,
                color: matchFilter === f.key ? '#fff' : T.textMuted,
                transition: 'all 0.15s',
              }}
            >
              {f.label}
            </button>
          ))}
          {statsLoading && <Loader2 size={14} color={T.textFaint} style={{ animation: 'spin 1s linear infinite', marginLeft: 4, alignSelf: 'center' }} />}
        </div>

        {/* ── Stats grid ─────────────────────────────────────────── */}
        <Section title="Statistiques" icon={<BarChart2 size={14} color={T.navy} />}>
          {stats ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <StatCell value={stats.matches_played}                  label="Matchs"       color={T.navy}  />
              <StatCell value={stats.goals}                           label="Buts"         color={T.green} />
              <StatCell value={stats.assists}                         label="Passes déc."  color={T.green} />
              <StatCell value={stats.shots}                           label="Tirs"         color={T.navy}  />
              <StatCell value={stats.shot_efficiency != null ? `${stats.shot_efficiency}%` : '—'} label="Efficacité" color={T.amber} />
              <StatCell value={stats.victories}                       label="Victoires"    color={T.green} />
              <StatCell value={`${stats.attendance_percentage}%`}     label="Assiduité"    color={T.navy}  />
            </div>
          ) : statsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <Loader2 size={20} color={T.textFaint} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : (
            <p style={{ fontSize: 13, color: T.textFaint, textAlign: 'center', padding: '16px 0', margin: 0 }}>Aucune donnée disponible.</p>
          )}
        </Section>

        {/* ── Match record ───────────────────────────────────────── */}
        {stats && (stats.victories > 0 || stats.draws > 0 || stats.defeats > 0) && (
          <Section title="Bilan" icon={<Trophy size={14} color={T.navy} />}>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'V',  value: stats.victories, color: T.green, bg: T.greenBg },
                { label: 'N',  value: stats.draws,     color: T.amber, bg: T.amberBg },
                { label: 'D',  value: stats.defeats,   color: T.red,   bg: T.redBg   },
              ].map(({ label, value, color, bg }) => (
                <div key={label} style={{ flex: 1, background: bg, borderRadius: 10, padding: '12px 0', textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0 }}>{value}</p>
                  <p style={{ fontSize: 11, color: T.textMuted, margin: '3px 0 0', fontWeight: 600 }}>{label}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Radar chart ────────────────────────────────────────── */}
        <Section title="Profil de performance" icon={<Activity size={14} color={T.navy} />}>
          {radarChartData ? (
            <div style={{ maxWidth: 320, margin: '0 auto', paddingTop: 4 }}>
              <RadarChartWrapper data={radarChartData} options={radarOptions as any} />
            </div>
          ) : statsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <Loader2 size={20} color={T.textFaint} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : (
            <p style={{ fontSize: 13, color: T.textFaint, textAlign: 'center', padding: '16px 0', margin: 0 }}>
              Pas encore assez de données pour afficher le radar.
            </p>
          )}
        </Section>

        {/* ── Note de match ─────────────────────────────────────── */}
        {!isGoalkeeper(player.position) && ratingSeries.length > 0 && (
          <Section title="Note de match" icon={<Target size={14} color={T.navy} />}>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ratingSeries.map((r, i) => ({ match: format(new Date(r.date), 'd MMM', { locale: fr }), index: i + 1, rating: r.rating }))} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.divider} />
                  <XAxis dataKey="match" tick={{ fontSize: 10, fill: T.textFaint }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: T.textFaint }} allowDecimals={false} width={24} />
                  <Tooltip
                    formatter={(v: number) => [v.toFixed(1), 'Note']}
                    labelFormatter={l => `Match : ${l}`}
                    contentStyle={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="rating" stroke={T.green} strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Section>
        )}

        {/* ── Tests physiques ─────────────────────────────────────── */}
        <Section title="Tests physiques" icon={<Gauge size={14} color={T.navy} />}>
          <PlayerTestsPanel playerId={player.id} showSquadReference={false} />
        </Section>

        {/* ── Feedback history ───────────────────────────────────── */}
        <Section title="Ressenti après séance" icon={<Zap size={14} color={T.navy} />}>
          {feedbackLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <Loader2 size={20} color={T.textFaint} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : feedback.length === 0 ? (
            <p style={{ fontSize: 13, color: T.textFaint, textAlign: 'center', padding: '16px 0', margin: 0 }}>Aucun questionnaire rempli pour l&apos;instant.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {feedback.map(row => (
                <FeedbackRow key={row.training_id} row={row} />
              ))}
            </div>
          )}
        </Section>

        {/* ── Training attendance ────────────────────────────────── */}
        <Section title="Présence aux séances" icon={<Calendar size={14} color={T.navy} />}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: monthGroups.length > 0 ? 14 : 0 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: T.greenBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${T.green}`, flexShrink: 0 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: T.green }}>{attPct}%</span>
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0 }}>
                {attPresent + attLate} sur {attRecorded} séances
              </p>
              <p style={{ fontSize: 12, color: T.textMuted, margin: '2px 0 0' }}>Présence et retards comptabilisés</p>
            </div>
          </div>

          {monthGroups.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                {([
                  { label: 'Présent', color: T.green, value: attPresent },
                  { label: 'Retard',  color: T.amber, value: attLate },
                  { label: 'Absent',  color: T.red,   value: attAbsent },
                  { label: 'Blessé',  color: T.blue,  value: attInjured },
                ] as const).map(l => (
                  <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.textMuted }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: l.color }} />
                    {l.label} <strong style={{ color: T.text }}>{l.value}</strong>
                  </span>
                ))}
              </div>
              <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
                <div style={{ display: 'flex', gap: 16, minWidth: 'max-content' }}>
                  {monthGroups.map(group => (
                    <div key={group.month}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, textAlign: 'center', margin: '0 0 4px' }}>{group.month}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, maxWidth: 84 }}>
                        {group.items.map((s, i) => (
                          <div key={i} title={`${format(parseISO(s.date), 'd MMM', { locale: fr })} — ${s.status}`} style={{ width: 16, height: 16, borderRadius: 3, background: sessionColor(s.status) }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Section>

        {/* ── Événements ─────────────────────────────────────────── */}
        <Section title="Événements" icon={<Clock3 size={14} color={T.navy} />}>
          {eventsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <Loader2 size={20} color={T.textFaint} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : events.length === 0 ? (
            <p style={{ fontSize: 13, color: T.textFaint, textAlign: 'center', padding: '16px 0', margin: 0 }}>Aucun événement pour l&apos;instant.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {events.map(ev => <EventRow key={ev.id} event={ev} />)}
            </div>
          )}
        </Section>

        {/* ── Douleurs ───────────────────────────────────────────── */}
        <Section title="Suivi des douleurs" icon={<HeartPulse size={14} color={T.navy} />}>
          {painLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <Loader2 size={20} color={T.textFaint} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : painReports.length === 0 ? (
            <p style={{ fontSize: 13, color: T.textFaint, textAlign: 'center', padding: '16px 0', margin: 0 }}>Aucune douleur signalée.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {painReports.map(g => <PainReportRow key={g.report_group} group={g} onDelete={deletePain} onEdit={setEditingPain} />)}
            </div>
          )}
        </Section>
      </div>

      {editingPain && (
        <PainReportEditModal
          group={editingPain}
          onClose={() => setEditingPain(null)}
          onSaved={(updated) => {
            setPainReports(prev => prev.map(g => g.report_group === updated.report_group ? updated : g));
            setEditingPain(null);
          }}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── EventRow ───────────────────────────────────────────────────────────────

function EventRow({ event }: { event: PlayerEvent }) {
  const { theme } = useTheme();
  const T = paletteFrom(theme.colors);
  const meta = eventMeta(event.event_type);
  const Icon = meta.icon;
  const detail =
    event.event_type === 'injury' ? [event.injury_type, event.unavailability_days ? `${event.unavailability_days} j d'indispo` : null].filter(Boolean).join(' · ')
    : event.event_type === 'suspension' ? (event.matches_suspended ? `${event.matches_suspended} match${event.matches_suspended > 1 ? 's' : ''} suspendu${event.matches_suspended > 1 ? 's' : ''}` : null)
    : event.report;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: T.cardBg2, borderRadius: 10, border: `1px solid ${T.border}` }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: T.blueBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={14} color={T.blue} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{meta.label}</span>
          <span style={{ fontSize: 11, color: T.textFaint, marginLeft: 'auto' }}>
            {format(parseISO(event.event_date), 'd MMM yyyy', { locale: fr })}
          </span>
        </div>
        {detail && <p style={{ fontSize: 12, color: T.textMuted, margin: '3px 0 0' }}>{detail}</p>}
      </div>
    </div>
  );
}

// ─── PainReportRow ────────────────────────────────────────────────────────────

function PainReportRow({ group, onDelete, onEdit }: { group: PainReportGroup; onDelete: (reportGroup: string) => void; onEdit: (group: PainReportGroup) => void }) {
  const { theme } = useTheme();
  const T = paletteFrom(theme.colors);
  return (
    <div style={{ padding: '10px 12px', background: T.cardBg2, borderRadius: 10, border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1 }}>
          {format(parseISO(group.reported_at), 'd MMM yyyy', { locale: fr })}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: INTENSITY_COLORS[group.max_intensity] }}>
          {INTENSITY_LABELS[group.max_intensity]}
        </span>
        <button
          onClick={() => onEdit(group)}
          title="Modifier ce signalement"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: T.textMuted }}
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => onDelete(group.report_group)}
          title="Supprimer ce signalement"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: T.red }}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 5, padding: '2px 7px' }}>
          {group.source === 'questionnaire' ? (group.match_id ? 'Fin de match' : 'Fin de séance') : 'Spontané'}
        </span>
        {group.onset && (
          <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 5, padding: '2px 7px' }}>
            {group.onset === 'aigu' ? 'Aigu' : 'Chronique'}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {group.zones.map((z, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: INTENSITY_COLORS[z.intensity], border: `1px solid ${INTENSITY_COLORS[z.intensity]}`, borderRadius: 20, padding: '2px 8px' }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: INTENSITY_COLORS[z.intensity] }} />
            {zoneLabel(z.zone)}
          </span>
        ))}
      </div>
      {group.note && <p style={{ fontSize: 12, color: T.textMuted, margin: 0 }}>{group.note}</p>}
    </div>
  );
}

// ─── PainReportEditModal ───────────────────────────────────────────────────────
// report_group est l'unité atomique côté RPC (update_my_pain_report remplace
// toutes les lignes du groupe) : on réédite l'ensemble zones/note/onset d'une
// même déclaration, pas une zone isolée.

function PainReportEditModal({ group, onClose, onSaved }: {
  group: PainReportGroup;
  onClose: () => void;
  onSaved: (updated: PainReportGroup) => void;
}) {
  const { theme } = useTheme();
  const T = paletteFrom(theme.colors);

  const [pain, setPain] = useState<PainSelection>(
    () => Object.fromEntries(group.zones.map(z => [z.zone, z.intensity]))
  );
  const [onset, setOnset] = useState<'aigu' | 'chronique' | null>(group.onset);
  const [note, setNote] = useState(group.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSelection = Object.keys(pain).length > 0;

  const save = async () => {
    const zones = toPayload(pain);
    if (zones.length === 0) return;
    setSaving(true);
    setError(null);
    const res = await updateMyPainReport(group.report_group, zones, note.trim() || null, onset);
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Impossible d'enregistrer les modifications.");
      return;
    }
    onSaved({
      ...group,
      zones,
      note: note.trim() || null,
      onset,
      max_intensity: Math.max(...zones.map(z => z.intensity)) as PainReportGroup['max_intensity'],
    });
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: T.cardBg, borderRadius: 18, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(15,23,42,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 16px', borderBottom: `1px solid ${T.divider}` }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>Modifier ta déclaration</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={18} color={T.textFaint} />
          </button>
        </div>

        <div style={{ padding: '20px 22px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <BodyMap value={pain} onChange={setPain} />

          {hasSelection && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 6px' }}>Depuis quand ?</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {([['aigu', 'Récent / aigu'], ['chronique', 'Qui traîne']] as const).map(([v, lbl]) => (
                  <button key={v} type="button" onClick={() => setOnset(o => (o === v ? null : v))}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: `1.5px solid ${onset === v ? T.navy : T.border}`, background: onset === v ? T.navy : T.cardBg2, color: onset === v ? '#fff' : T.textMuted }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 6px' }}>Précision (optionnel)</p>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Contexte, type de douleur, à l'effort ou au repos."
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
                border: `1px solid ${T.border}`, background: T.cardBg2, fontSize: 13, color: T.text,
                resize: 'vertical', fontFamily: 'inherit', outline: 'none', lineHeight: 1.5,
              }}
            />
          </div>

          {error && (
            <div style={{ padding: '12px 14px', borderRadius: 10, background: T.redBg, border: '1px solid #fca5a5' }}>
              <p style={{ fontSize: 13, color: T.red, margin: 0 }}>{error}</p>
            </div>
          )}

          <button
            onClick={save}
            disabled={!hasSelection || saving}
            style={{
              padding: '12px', borderRadius: 12, border: 'none', cursor: hasSelection ? 'pointer' : 'not-allowed',
              background: T.navy, color: '#fff', fontSize: 14, fontWeight: 700,
              opacity: (!hasSelection || saving) ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {saving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            Enregistrer les modifications
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── FeedbackRow ──────────────────────────────────────────────────────────────

function FeedbackRow({ row }: { row: PlayerTrainingFeedbackRow }) {
  const { theme } = useTheme();
  const T = paletteFrom(theme.colors);
  const date = row.date ? format(parseISO(row.date), 'd MMM yyyy', { locale: fr }) : '—';
  const metrics: { key: keyof PlayerTrainingFeedbackRow; label: string }[] = [
    { key: 'auto_evaluation', label: 'Perf.' },
    { key: 'rpe',             label: 'RPE'   },
    { key: 'physical_form',   label: 'Forme' },
    { key: 'pleasure',        label: 'Plaisir' },
  ];

  const dotColor = (val: number | null) =>
    val == null ? T.textFaint : val >= 7 ? T.green : val >= 4 ? T.amber : T.red;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: T.cardBg2, borderRadius: 10, border: `1px solid ${T.border}` }}>
      <CheckCircle2 size={14} color={T.green} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: T.textMuted, flexShrink: 0, minWidth: 76 }}>{date}</span>
      <div style={{ display: 'flex', gap: 10, flex: 1, flexWrap: 'wrap' }}>
        {metrics.map(m => {
          const val = row[m.key] as number | null;
          return (
            <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: T.textFaint }}>{m.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: dotColor(val) }}>
                {val ?? '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const { theme } = useTheme();
  const T = paletteFrom(theme.colors);
  return (
    <div style={{ background: T.cardBg, borderRadius: 12, border: `1px solid ${T.border}`, padding: '16px', marginBottom: 12, boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 800, color: T.navy, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── StatCell ─────────────────────────────────────────────────────────────────

function StatCell({ value, label, color }: { value: number | string; label: string; color: string }) {
  const { theme } = useTheme();
  const T = paletteFrom(theme.colors);
  return (
    <div style={{ background: T.cardBg2, borderRadius: 10, padding: '12px 8px', textAlign: 'center', border: `1px solid ${T.divider}` }}>
      <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0 }}>{value}</p>
      <p style={{ fontSize: 11, color: T.textFaint, margin: '3px 0 0', fontWeight: 600 }}>{label}</p>
    </div>
  );
}

// ─── Tag ──────────────────────────────────────────────────────────────────────

function Tag({ text }: { text: string }) {
  const { theme } = useTheme();
  const T = paletteFrom(theme.colors);
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, background: T.cardBg2, border: `1px solid ${T.border}`, borderRadius: 6, padding: '2px 8px' }}>
      {text}
    </span>
  );
}
