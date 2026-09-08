'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  AlertCircle, Calendar, CheckCircle2, Clock, Loader2,
  MapPin, RefreshCw, Users, Swords, Dumbbell, FileText, ChevronRight,
} from 'lucide-react';
import {
  getMyCalendarEvents,
  setMyTrainingAttendance,
  type MyConvolutionRow,
  type MyUpcomingMatchRow,
} from '@/lib/services/playerConvocationsService';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '@/lib/design/tokens';

// ─── Palette dérivée du thème actif (voir lib/design/tokens.ts) ───────────────

function paletteFrom(c: ThemeColors) {
  const purple = c.chartSeries[5] ?? c.accent.default;
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
    purple,
    purpleBg:  `${purple}22`,
  };
}
type Palette = ReturnType<typeof paletteFrom>;

type AttendanceStatus = 'present' | 'absent' | 'late' | 'injured';
type CalendarItem =
  | { type: 'training'; data: MyConvolutionRow }
  | { type: 'match'; data: MyUpcomingMatchRow };

function sortItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort((a, b) => {
    const dA = a.type === 'training' ? a.data.training_date : a.data.match_date;
    const dB = b.type === 'training' ? b.data.training_date : b.data.match_date;
    return new Date(dA).getTime() - new Date(dB).getTime();
  });
}

/**
 * Délai avant la séance au-delà duquel la RPC refuse la réponse — différencié par statut ET
 * réglable par équipe (teams.absence_notice_minutes / late_notice_minutes, coach de
 * l'équipe). Chaque ligne porte ses propres minutes (voir formatNotice / c.absence_notice_minutes).
 */
function formatNotice(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}`;
}

const statusLabel = (s: AttendanceStatus) =>
  s === 'present' ? 'présent' : s === 'absent' ? 'absent' : s === 'late' ? 'en retard' : 'blessé';

function attendanceOptions(T: Palette) {
  return [
    { status: 'present' as const, label: 'Présent',    color: T.green,  bg: T.greenBg,  icon: CheckCircle2 },
    { status: 'late'    as const, label: 'En retard',  color: T.amber,  bg: T.amberBg,  icon: Clock        },
    { status: 'absent'  as const, label: 'Absent',     color: T.red,    bg: T.redBg,    icon: AlertCircle  },
    { status: 'injured' as const, label: 'Blessé',     color: T.purple, bg: T.purpleBg, icon: Loader2      },
  ];
}

export default function PlayerCalendarPage() {
  const { theme } = useTheme();
  const T = paletteFrom(theme.colors);
  const [trainings, setTrainings]   = useState<MyConvolutionRow[]>([]);
  const [matches,   setMatches]     = useState<MyUpcomingMatchRow[]>([]);
  const [loading,   setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error,     setError]       = useState<string | null>(null);

  const calendarItems = useMemo(
    () => sortItems([
      ...trainings.map(c => ({ type: 'training' as const, data: c })),
      ...matches.map(m => ({ type: 'match' as const, data: m })),
    ]),
    [trainings, matches]
  );

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const { trainings: t, matches: m } = await getMyCalendarEvents();
      setTrainings(t);
      setMatches(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au chargement');
      setTrainings([]); setMatches([]);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => { setRefreshing(true); load(true); };

  const handleSetAttendance = async (trainingId: string, status: AttendanceStatus) => {
    setUpdatingId(trainingId);
    setError(null);
    const result = await setMyTrainingAttendance(trainingId, status);
    setUpdatingId(null);
    if (result.ok) {
      setTrainings(prev => prev.map(c => c.training_id === trainingId ? { ...c, my_status: status } : c));
    } else if (result.error === 'too_late') {
      const c = trainings.find(x => x.training_id === trainingId);
      const minutes = status === 'absent' ? (c?.absence_notice_minutes ?? 360) : (c?.late_notice_minutes ?? 15);
      setError(status === 'absent'
        ? `Trop tard pour se déclarer absent : ferme ${formatNotice(minutes)} avant la séance.`
        : `Trop tard pour répondre : ferme ${formatNotice(minutes)} avant la séance.`);
    } else {
      setError(result.error ?? 'Erreur');
    }
  };

  if (loading) {
    return (
      <div style={{ background: T.pageBg, minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240 }}>
        <Loader2 size={24} color={T.textFaint} style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ background: T.pageBg, minHeight: '100%' }}>
      {/* ── Error banner ─────────────────────────────────────────── */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.redBg, padding: '10px 20px', borderBottom: '1px solid #fee2e2' }}>
          <AlertCircle size={15} color={T.red} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: T.red }}>{error}</span>
          <button onClick={() => load()} style={{ fontSize: 13, fontWeight: 700, color: T.red, background: 'none', border: 'none', cursor: 'pointer' }}>
            Réessayer
          </button>
        </div>
      )}

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px 40px' }}>
        {/* ── Header ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: T.navy, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={17} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 800, color: T.text, margin: 0, letterSpacing: '-0.2px' }}>Calendrier</h1>
              <p style={{ fontSize: 12, color: T.textFaint, margin: 0, marginTop: 1 }}>
                {calendarItems.length > 0 ? `${calendarItems.length} événement${calendarItems.length > 1 ? 's' : ''} à venir` : 'Convocations et matchs'}
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${T.border}`, background: T.cardBg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <RefreshCw size={14} color={T.textMuted} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
          </button>
        </div>

        {/* ── Empty ────────────────────────────────────────────────── */}
        {calendarItems.length === 0 ? (
          <div style={{ background: T.cardBg, borderRadius: 14, border: `1px solid ${T.border}`, padding: '48px 24px', textAlign: 'center' }}>
            <Calendar size={40} color={T.textFaint} style={{ marginBottom: 14 }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0, marginBottom: 6 }}>
              Aucune convocation à venir
            </p>
            <p style={{ fontSize: 13, color: T.textMuted, margin: 0, lineHeight: 1.6 }}>
              Vos séances et matchs apparaîtront ici lorsque vous serez convoqué.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {calendarItems.map(item =>
              item.type === 'match'
                ? <MatchCard key={`m-${item.data.match_id}`} m={item.data} />
                : <TrainingCard
                    key={`t-${item.data.training_id}`}
                    c={item.data}
                    isUpdating={updatingId === item.data.training_id}
                    onSetAttendance={handleSetAttendance}
                  />
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── MatchCard ────────────────────────────────────────────────────────────────

function MatchCard({ m }: { m: MyUpcomingMatchRow }) {
  const { theme } = useTheme();
  const T = paletteFrom(theme.colors);
  const date = m.match_date ? parseISO(m.match_date) : new Date();
  const other = !!m.is_other_team;
  const accentColor = other ? T.purple : T.blue;
  const badgeBg     = other ? T.purpleBg : T.blueBg;

  return (
    <div style={{
      background: T.cardBg, borderRadius: 12, border: `1px solid ${T.border}`,
      borderLeft: `4px solid ${accentColor}`, padding: 16,
      boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 6, background: badgeBg, border: `1px solid ${accentColor}33` }}>
          <Swords size={11} color={accentColor} />
          <span style={{ fontSize: 11, fontWeight: 700, color: accentColor }}>
            Match{other ? ' · autre équipe' : ''}
          </span>
        </div>
        {m.competition && <span style={{ fontSize: 11, color: T.textFaint, fontStyle: 'italic' }}>{m.competition}</span>}
        {!m.is_convoked && (
          <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, padding: '2px 8px', borderRadius: 6, background: T.pageBg, border: `1px solid ${T.border}` }}>
            Non convoqué
          </span>
        )}
      </div>

      <p style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 4px 0' }}>{m.title || 'Match'}</p>
      {m.opponent_team && (
        <p style={{ fontSize: 13, color: T.textMuted, margin: '0 0 10px 0' }}>
          vs <strong style={{ color: T.text }}>{m.opponent_team}</strong>
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <MetaItem icon={<Calendar size={12} color={T.textFaint} />} text={format(date, 'EEEE d MMMM', { locale: fr })} />
        <MetaItem icon={<Clock size={12} color={T.textFaint} />} text={format(date, 'HH:mm', { locale: fr })} />
        {m.team_name && <MetaItem icon={<Users size={12} color={T.textFaint} />} text={m.team_name} />}
        {m.location && <MetaItem icon={<MapPin size={12} color={T.textFaint} />} text={m.location} />}
      </div>
    </div>
  );
}

// ─── TrainingCard ─────────────────────────────────────────────────────────────

function TrainingCard({ c, isUpdating, onSetAttendance }: {
  c: MyConvolutionRow;
  isUpdating: boolean;
  onSetAttendance: (id: string, s: AttendanceStatus) => void;
}) {
  const { theme } = useTheme();
  const T = paletteFrom(theme.colors);
  const ATTENDANCE = attendanceOptions(T);
  const date   = c.training_date ? parseISO(c.training_date) : new Date();
  const status = (c.my_status as AttendanceStatus) || null;
  const other  = !!c.is_other_team;
  const answerCutoffMs = Math.min(c.absence_notice_minutes, c.late_notice_minutes) * 60 * 1000;
  const absentCutoffMs = c.absence_notice_minutes * 60 * 1000;
  const closed = c.training_date ? new Date(c.training_date).getTime() - Date.now() < answerCutoffMs : false;
  const absentClosed = c.training_date ? new Date(c.training_date).getTime() - Date.now() < absentCutoffMs : false;
  const accentColor = other ? T.purple : T.green;
  const badgeBg     = other ? T.purpleBg : T.greenBg;

  const feedbackUrl = c.feedback_url
    ? (typeof window !== 'undefined' ? window.location.origin + c.feedback_url : c.feedback_url)
    : null;

  return (
    <div style={{
      background: T.cardBg, borderRadius: 12, border: `1px solid ${T.border}`,
      borderLeft: `4px solid ${accentColor}`, padding: 16,
      boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 6, background: badgeBg, border: `1px solid ${accentColor}33` }}>
          <Dumbbell size={11} color={accentColor} />
          <span style={{ fontSize: 11, fontWeight: 700, color: accentColor }}>
            Entraînement{other ? ' · autre équipe' : ''}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <MetaItem icon={<Calendar size={12} color={T.textFaint} />} text={format(date, 'EEEE d MMMM', { locale: fr })} />
        <MetaItem icon={<Clock size={12} color={T.textFaint} />} text={format(date, 'HH:mm', { locale: fr })} />
        {c.team_name && <MetaItem icon={<Users size={12} color={T.textFaint} />} text={c.team_name} />}
        {c.location && <MetaItem icon={<MapPin size={12} color={T.textFaint} />} text={c.location} />}
      </div>

      {/* ── Attendance ────────────────── */}
      <div style={{ borderTop: `1px solid ${T.divider}`, paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.7px', margin: 0 }}>
            Ma présence
          </p>
          {closed && <span style={{ fontSize: 10, color: T.textFaint }}>Réponses closes</span>}
        </div>
        {closed ? (
          <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>
            {status ? `Tu avais répondu : ${statusLabel(status)}.` : `Les réponses ferment ${formatNotice(c.late_notice_minutes)} avant la séance (${formatNotice(c.absence_notice_minutes)} pour une absence).`}
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ATTENDANCE.map(btn => {
                const active = status === btn.status;
                const disabled = isUpdating || (btn.status === 'absent' && absentClosed);
                const Icon = btn.icon;
                return (
                  <button
                    key={btn.status}
                    onClick={() => onSetAttendance(c.training_id, btn.status)}
                    disabled={disabled}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 12px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
                      fontSize: 12, fontWeight: active ? 700 : 600,
                      border: `1.5px solid ${active ? btn.color : T.border}`,
                      background: active ? btn.bg : T.cardBg2,
                      color: active ? btn.color : T.textMuted,
                      opacity: isUpdating ? 0.6 : disabled ? 0.4 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    {isUpdating && active
                      ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                      : <Icon size={13} />
                    }
                    {btn.label}
                  </button>
                );
              })}
            </div>
            {absentClosed && (
              <p style={{ fontSize: 11, color: T.textFaint, margin: '6px 0 0' }}>
                Se déclarer absent ferme {formatNotice(c.absence_notice_minutes)} avant la séance.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Feedback link ─────────────── */}
      {feedbackUrl && c.feedback_token && !other && (
        <a
          href={feedbackUrl}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.divider}`,
            fontSize: 13, fontWeight: 600, color: T.navy, textDecoration: 'none',
          }}
        >
          <FileText size={14} color={T.navy} />
          <span style={{ flex: 1 }}>Remplir le questionnaire de la séance</span>
          <ChevronRight size={13} color={T.navy} />
        </a>
      )}
    </div>
  );
}

// ─── MetaItem ─────────────────────────────────────────────────────────────────

function MetaItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  const { theme } = useTheme();
  const T = paletteFrom(theme.colors);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {icon}
      <span style={{ fontSize: 12, color: T.textMuted }}>{text}</span>
    </div>
  );
}
