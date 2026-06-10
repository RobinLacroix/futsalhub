'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Activity, AlertCircle, BarChart2, Calendar, CheckCircle2,
  Loader2, RefreshCw, Target, Trophy, User, Zap,
} from 'lucide-react';
import { usePlayerProfile } from '../../hooks/usePlayerProfile';
import { getMyPlayerTeamIds } from '@/lib/services/playerConvocationsService';
import { playersService } from '@/lib/services/playersService';
import { getPlayerTrainingFeedback, type PlayerTrainingFeedbackRow } from '@/lib/services/trainingFeedbackService';

const RadarChartWrapper = dynamic(() => import('../../components/RadarChartWrapper'), { ssr: false });

// ─── Theme FM light ───────────────────────────────────────────────────────────

const T = {
  pageBg:    '#EEF0F5',
  cardBg:    '#FFFFFF',
  cardBg2:   '#F8FAFC',
  border:    '#DDE1EA',
  divider:   '#E8EDF4',
  text:      '#0f172a',
  textMuted: '#475569',
  textFaint: '#94a3b8',
  navy:      '#1a2744',
  green:     '#059669',
  greenBg:   '#ecfdf5',
  amber:     '#d97706',
  amberBg:   '#fef3c7',
  red:       '#dc2626',
  redBg:     '#fef2f2',
  blue:      '#1e40af',
  blueBg:    '#eff6ff',
};

type MatchFilter = 'all' | 'Championnat' | 'Coupe' | 'Amical';

const MATCH_FILTERS: { key: MatchFilter; label: string }[] = [
  { key: 'all',         label: 'Tous'          },
  { key: 'Championnat', label: 'Championnat'   },
  { key: 'Coupe',       label: 'Coupe'         },
  { key: 'Amical',      label: 'Amical'        },
];

const RADAR_LABELS = ['Buts', 'Tirs cadrés', 'Passes D.', 'Récup.', 'Pertes', '+/-', 'Temps'];

function calcAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlayerProfilePage() {
  const { player } = usePlayerProfile();

  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const [teamId,      setTeamId]      = useState<string | null>(null);
  const [stats,       setStats]       = useState<Awaited<ReturnType<typeof playersService.getPlayerStats>> | null>(null);
  const [radarData,   setRadarData]   = useState<Awaited<ReturnType<typeof playersService.getPlayerRadarStats>> | null>(null);
  const [feedback,    setFeedback]    = useState<PlayerTrainingFeedbackRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Load base data (teamId + feedback) once
  const loadBase = useCallback(async () => {
    if (!player?.id) { setLoading(false); return; }
    setError(null);
    try {
      const teamIds = await getMyPlayerTeamIds();
      const tid = teamIds[0] ?? null;
      setTeamId(tid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au chargement');
    } finally {
      setLoading(false);
    }
  }, [player?.id]);

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

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { loadFeedback(); }, [loadFeedback]);

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
      backgroundColor: `rgba(26,39,68,0.15)`,
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
        grid: { color: '#E8EDF4' },
        pointLabels: { font: { size: 11 }, color: T.textMuted },
        angleLines: { color: '#DDE1EA' },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true },
    },
  };

  const initials = `${player.first_name?.[0] ?? ''}${player.last_name?.[0] ?? ''}`.toUpperCase();

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
        {stats && (
          <Section title="Assiduité entraînement" icon={<Calendar size={14} color={T.navy} />}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: T.greenBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${T.green}` }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: T.green }}>{stats.attendance_percentage}%</span>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0 }}>
                  {stats.training_attendance} séances{stats.training_attendance > 1 ? '' : ''} participées
                </p>
                <p style={{ fontSize: 12, color: T.textMuted, margin: '2px 0 0' }}>Présence et retards comptabilisés</p>
              </div>
            </div>
          </Section>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── FeedbackRow ──────────────────────────────────────────────────────────────

function FeedbackRow({ row }: { row: PlayerTrainingFeedbackRow }) {
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
  return (
    <div style={{ background: T.cardBg2, borderRadius: 10, padding: '12px 8px', textAlign: 'center', border: `1px solid ${T.divider}` }}>
      <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0 }}>{value}</p>
      <p style={{ fontSize: 11, color: T.textFaint, margin: '3px 0 0', fontWeight: 600 }}>{label}</p>
    </div>
  );
}

// ─── Tag ──────────────────────────────────────────────────────────────────────

function Tag({ text }: { text: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, background: T.cardBg2, border: `1px solid ${T.border}`, borderRadius: 6, padding: '2px 8px' }}>
      {text}
    </span>
  );
}
