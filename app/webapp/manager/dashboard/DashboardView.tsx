/**
 * DashboardView — miroir de contenu de mobile/components/TeamDashboardView.tsx
 *
 * Port fidèle : mêmes sections, mêmes données, mêmes calculs. Réactif à la
 * largeur d'écran (flex-wrap / colonnes qui s'ajustent) plutôt qu'un
 * `isTablet` figé — le fichier mobile source ne branche d'ailleurs plus sur
 * `isTablet` dans son rendu visible, seul l'agencement flexible compte.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, differenceInDays, parseISO, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Trophy, Flame, Zap, Target, Goal, BarChart3, Dumbbell, ChevronRight,
  Users, TrendingUp, GraduationCap, Stethoscope, UsersRound,
} from 'lucide-react';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { useActiveSeasonContext } from '../../contexts/ActiveSeasonContext';
import { useTheme } from '../../contexts/ThemeContext';
import { trainingsService, matchesService, playersService, getTeamFeedbackForLastSessions, type TeamFeedbackRow } from '@/lib/services';
import type { Training, Match, Player } from '@/types';
import { deltaColor, type Theme } from '@/lib/design/tokens';
import { fmPalette } from '@/lib/design/fmPalette';

// ─── Palette de l'écran — dérivée du thème, miroir de dashColors() mobile ────
function dashColors(theme: Theme) {
  const c = theme.colors;
  const brand = fmPalette(c, theme.scheme);
  return {
    navy: brand.brand,
    bg: c.bg.canvas,
    card: c.bg.surface,
    stripe: c.bg.stripe,
    sunken: c.bg.sunken,
    border: c.border.subtle,
    green: c.positive.default,
    greenBg: c.positive.subtle,
    amber: c.warning.default,
    amberBg: c.warning.subtle,
    red: c.negative.default,
    redBg: c.negative.subtle,
    blue: c.accent.default,
    blueBg: c.accent.subtle,
    text: c.text.primary,
    muted: c.text.secondary,
    light: c.text.tertiary,
    onBrand: brand.onBrand,
    onBrandMuted: brand.onBrandMuted,
  };
}
type DashColors = ReturnType<typeof dashColors>;

type TabId = 'season' | 'squad';
type RankSortKey = 'name' | 'formRecent' | 'formDelta' | 'sessions' | 'att' | 'injured' | 'late' | 'absent';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wellnessColor(C: DashColors, score: number | null): string {
  if (score === null) return C.border;
  if (score >= 7) return C.green;
  if (score >= 5) return C.amber;
  return C.red;
}

function wellnessBg(C: DashColors, score: number | null): string {
  if (score === null) return C.sunken;
  if (score >= 7) return C.greenBg;
  if (score >= 5) return C.amberBg;
  return C.redBg;
}

function weekDayContext(): { phase: string; advice: string; Icon: typeof Flame } {
  const day = getDay(new Date()); // 0=dim, 1=lun, 2=mar, 3=mer, 4=jeu, 5=ven, 6=sam
  if (day === 1) return { phase: 'Début de cycle — Lundi', Icon: Flame, advice: 'Séance haute intensité · Nouveau principe' };
  if (day === 3) return { phase: 'Mi-semaine — Mercredi', Icon: Zap, advice: 'Consolidation · Intensité moyenne-haute' };
  if (day === 5) return { phase: 'Pré-match — Vendredi', Icon: Target, advice: 'Séance légère · Confiance et plaisir' };
  if (day === 6 || day === 0) return { phase: 'Jour de match', Icon: Goal, advice: 'Concentration · Échauffement ciblé' };
  return { phase: 'Hors séance', Icon: BarChart3, advice: 'Analyse & préparation de la prochaine séance' };
}

// ─── Component ────────────────────────────────────────────────────────────────
export function DashboardView() {
  const { theme } = useTheme();
  const C = dashColors(theme);
  const router = useRouter();
  const { activeTeamId, activeTeam } = useActiveTeam();
  const { activeSeason } = useActiveSeasonContext();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('season');

  const [trainings, setTrainings] = useState<Training[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [feedback, setFeedback] = useState<TeamFeedbackRow[]>([]);
  const [rankSort, setRankSort] = useState<{ key: RankSortKey; dir: 'asc' | 'desc' }>({ key: 'formRecent', dir: 'desc' });

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
      setLoading(false);
      return;
    }
    try {
      const [tr, ma, pl, fb] = await Promise.all([
        trainingsService.getTrainingsByTeam(activeTeamId, activeSeason),
        matchesService.getMatchesByTeam(activeTeamId, activeSeason),
        playersService.getPlayersByTeam(activeTeamId),
        getTeamFeedbackForLastSessions(activeTeamId, 10),
      ]);
      setTrainings(tr); setMatches(ma); setPlayers(pl); setFeedback(fb);
    } catch {
      // silencieux — on garde l'état précédent
    } finally {
      setLoading(false);
    }
  }, [activeTeamId, activeSeason]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const data = useMemo(() => {
    const today = now.toISOString().slice(0, 10);

    const futureTrainings = trainings
      .filter((t) => (typeof t.date === 'string' ? t.date : t.date.toISOString()) >= today)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const futureMatches = matches
      .filter((m) => (typeof m.date === 'string' ? m.date : m.date.toISOString()) >= today)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const nextTraining = futureTrainings[0] ?? null;
    const nextMatch = futureMatches[0] ?? null;

    const pastMatches = matches
      .filter((m) => String(m.date) < today && m.score_team != null && m.score_opponent != null)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const wins = pastMatches.filter((m) => m.score_team! > m.score_opponent!).length;
    const draws = pastMatches.filter((m) => m.score_team! === m.score_opponent!).length;
    const losses = pastMatches.filter((m) => m.score_team! < m.score_opponent!).length;

    const themeCount: Record<string, number> = {};
    trainings.forEach((t) => {
      if (t.theme) themeCount[t.theme] = (themeCount[t.theme] ?? 0) + 1;
    });
    const themes = Object.entries(themeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const convokedCount: Record<string, number> = {};
    const presentCount: Record<string, number> = {};
    const injuredCount: Record<string, number> = {};
    const lateCount: Record<string, number> = {};
    const absentCount: Record<string, number> = {};
    trainings.filter((t) => String(t.date) <= today).forEach((t) => {
      const att = t.attendance ?? {};
      Object.entries(att).forEach(([pid, status]) => {
        convokedCount[pid] = (convokedCount[pid] ?? 0) + 1;
        if (status === 'present' || status === 'late') presentCount[pid] = (presentCount[pid] ?? 0) + 1;
        if (status === 'injured') injuredCount[pid] = (injuredCount[pid] ?? 0) + 1;
        if (status === 'late') lateCount[pid] = (lateCount[pid] ?? 0) + 1;
        if (status === 'absent') absentCount[pid] = (absentCount[pid] ?? 0) + 1;
      });
    });
    const attendanceRate: Record<string, number> = {};
    players.forEach((p) => {
      const convoked = convokedCount[p.id] ?? 0;
      attendanceRate[p.id] = convoked > 0
        ? Math.round(((presentCount[p.id] ?? 0) / convoked) * 100)
        : 0;
    });

    const recentTrainings = [...trainings]
      .filter((t) => String(t.date) <= today)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const last5Ids = new Set(recentTrainings.slice(0, 5).map((t) => t.id));
    const prev5Ids = new Set(recentTrainings.slice(5, 10).map((t) => t.id));
    const physicalFormAvg = (ids: Set<string>, playerId: string): number | null => {
      const vals = feedback
        .filter((f) => f.player_id === playerId && ids.has(f.training_id) && f.physical_form != null)
        .map((f) => f.physical_form as number);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const formRecent: Record<string, number | null> = {};
    const formDelta: Record<string, number | null> = {};
    players.forEach((p) => {
      const recent = physicalFormAvg(last5Ids, p.id);
      const prev = physicalFormAvg(prev5Ids, p.id);
      formRecent[p.id] = recent;
      formDelta[p.id] = recent != null && prev != null ? recent - prev : null;
    });

    const sessionAttHistory = [...trainings]
      .filter((t) => String(t.date) <= today && t.attendance && Object.keys(t.attendance).length > 0)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((t) => ({
        date: String(t.date),
        label: format(parseISO(String(t.date)), 'd/MM'),
        count: Object.values(t.attendance ?? {}).filter((v) => v === 'present' || v === 'late').length,
      }));

    return {
      nextTraining, nextMatch,
      wins, draws, losses,
      themes,
      presentCount, attendanceRate, injuredCount, lateCount, absentCount,
      formRecent, formDelta,
      sessionAttHistory,
    };
  }, [trainings, matches, players, feedback]);

  const rankData = useMemo(() => {
    return players.map(p => ({
      player: p,
      formRecent: data.formRecent[p.id] ?? null,
      formDelta: data.formDelta[p.id] ?? null,
      sessions: data.presentCount[p.id] ?? 0,
      att: data.attendanceRate[p.id] ?? 0,
      injured: data.injuredCount[p.id] ?? 0,
      late: data.lateCount[p.id] ?? 0,
      absent: data.absentCount[p.id] ?? 0,
    }));
  }, [players, data]);

  const rankSortedData = useMemo(() => {
    return [...rankData].sort((a, b) => {
      const dir = rankSort.dir === 'asc' ? 1 : -1;
      if (rankSort.key === 'name')
        return dir * `${a.player.last_name} ${a.player.first_name}`.localeCompare(`${b.player.last_name} ${b.player.first_name}`, 'fr');
      const map: Record<RankSortKey, number> = {
        name: 0,
        formRecent: (a.formRecent ?? -1) - (b.formRecent ?? -1),
        formDelta: (a.formDelta ?? -99) - (b.formDelta ?? -99),
        sessions: a.sessions - b.sessions,
        att: a.att - b.att,
        injured: a.injured - b.injured,
        late: a.late - b.late,
        absent: a.absent - b.absent,
      };
      return dir * (map[rankSort.key] ?? 0);
    });
  }, [rankData, rankSort]);

  // ── Empty / loading states ────────────────────────────────────────────────
  if (!activeTeamId || !activeTeam) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, minHeight: 320 }}>
        <Trophy size={44} color={C.light} />
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 12 }}>Aucune équipe sélectionnée</div>
        <div style={{ fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 8 }}>Choisissez une équipe pour voir votre Intelligence Coach.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, minHeight: 320 }}>
        <div className="animate-spin rounded-full h-9 w-9 border-b-2" style={{ borderColor: C.blue }} />
        <div style={{ fontSize: 14, color: C.muted, marginTop: 12 }}>Chargement du dashboard…</div>
      </div>
    );
  }

  const ctx = weekDayContext();

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div style={{
        backgroundColor: C.navy, padding: '20px 20px 16px',
        display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12,
        borderRadius: 12,
      }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.onBrand, letterSpacing: 0.2 }}>{activeTeam.name}</div>
          <div style={{ fontSize: 12, color: C.onBrandMuted, marginTop: 2 }}>
            {format(now, "EEEE d MMMM yyyy", { locale: fr })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <ctx.Icon size={20} color={C.onBrand} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.onBrand }}>{ctx.phase}</div>
              <div style={{ fontSize: 11, color: C.onBrandMuted, marginTop: 1 }}>{ctx.advice}</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: theme.colors.positive.default }}>{data.wins}V</span>
          <span style={{ fontSize: 12, color: C.onBrandMuted }}>·</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.amber }}>{data.draws}N</span>
          <span style={{ fontSize: 12, color: C.onBrandMuted }}>·</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.red }}>{data.losses}D</span>
        </div>
      </div>

      {/* ── Next events strip ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {data.nextTraining && (
          <button
            type="button"
            onClick={() => router.push('/webapp/manager/calendar')}
            style={{
              flex: '1 1 220px', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
              backgroundColor: C.card, borderRadius: 10, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.blue}`,
              padding: 10, cursor: 'pointer',
            }}
          >
            <Dumbbell size={16} color={C.blue} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {data.nextTraining.theme || 'Entraînement'}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {format(parseISO(String(data.nextTraining.date)), 'EEE d MMM', { locale: fr })}
                {String(data.nextTraining.date) === now.toISOString().slice(0, 10) ? " · Aujourd'hui" :
                  ` · J-${differenceInDays(parseISO(String(data.nextTraining.date)), now)}`}
              </div>
            </div>
            <ChevronRight size={14} color={C.light} />
          </button>
        )}
        {data.nextMatch && (
          <button
            type="button"
            onClick={() => router.push('/webapp/manager/calendar')}
            style={{
              flex: '1 1 220px', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
              backgroundColor: C.card, borderRadius: 10, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.amber}`,
              padding: 10, cursor: 'pointer',
            }}
          >
            <Goal size={16} color={C.amber} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                vs {data.nextMatch.opponent_team || data.nextMatch.title || 'Adversaire'}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {format(parseISO(String(data.nextMatch.date)), 'EEE d MMM', { locale: fr })}
                {String(data.nextMatch.date) === now.toISOString().slice(0, 10) ? " · Aujourd'hui" :
                  ` · J-${differenceInDays(parseISO(String(data.nextMatch.date)), now)}`}
              </div>
            </div>
            <ChevronRight size={14} color={C.light} />
          </button>
        )}
        {!data.nextTraining && !data.nextMatch && (
          <div style={{ flex: 1, backgroundColor: C.card, borderRadius: 10, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.light}`, padding: 10 }}>
            <span style={{ fontSize: 11, color: C.muted }}>Aucun événement à venir</span>
          </div>
        )}
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', backgroundColor: C.card, marginTop: 12, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {([['season', 'Saison'], ['squad', 'Effectif']] as [TabId, string][]).map(([id, label]) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                flex: 1, padding: '10px 0', textAlign: 'center', cursor: 'pointer',
                backgroundColor: active ? C.blueBg : 'transparent',
                borderBottom: active ? `2px solid ${C.blue}` : '2px solid transparent',
                fontSize: 13, fontWeight: 600, color: active ? C.blue : C.muted,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB — SAISON
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'season' && (
        <>
          <SectionCard title="Présence en séance — Saison" Icon={Users} C={C}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
              Nombre de joueurs présents par séance (équipe + invités)
            </div>
            <AttendanceLineChart data={data.sessionAttHistory} C={C} />
          </SectionCard>

          <button
            type="button"
            onClick={() => router.push('/webapp/manager/performance')}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer',
              backgroundColor: C.card, marginTop: 12, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, width: '100%',
            }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: C.blueBg, flexShrink: 0 }}>
              <TrendingUp size={18} color={C.blue} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Charge d&apos;entraînement</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>Cible vs avérée, par équipe ou par joueur</div>
            </div>
            <ChevronRight size={16} color={C.light} />
          </button>

          {data.themes.length > 0 && (
            <SectionCard title="Thèmes travaillés" Icon={GraduationCap} C={C}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Principes les plus répétés en entraînement</div>
              {data.themes.map(([themeLabel, count], i) => (
                <div key={themeLabel} style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                  <span style={{ width: 22, fontSize: 11, color: C.muted, fontWeight: 600 }}>#{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 12, color: C.text, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{themeLabel}</span>
                  <div style={{ width: 80, height: 8, backgroundColor: C.bg, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', backgroundColor: C.blue, borderRadius: 4, width: `${(count / data.themes[0][1]) * 100}%` }} />
                  </div>
                  <span style={{ width: 28, fontSize: 11, color: C.blue, fontWeight: 700, textAlign: 'right' }}>{count}×</span>
                </div>
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
          <button
            type="button"
            onClick={() => router.push('/webapp/manager/performance')}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer',
              backgroundColor: C.card, marginTop: 12, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, width: '100%',
            }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: C.redBg, flexShrink: 0 }}>
              <Stethoscope size={18} color={C.red} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Infirmerie</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>Blessures, signaux précoces, retours</div>
            </div>
            <ChevronRight size={16} color={C.light} />
          </button>

          {/* ── Forme et présence ────────────────────────────────────────── */}
          <div style={{ backgroundColor: C.card, marginTop: 12, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 16px 8px' }}>
              <div style={{ width: 3, height: 16, backgroundColor: C.blue, borderRadius: 2 }} />
              <Users size={16} color={C.blue} />
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Forme et présence</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: C.sunken, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                    <RankHeaderCell label="#" width={28} />
                    <RankHeaderSortable label="NOM" col="name" rankSort={rankSort} onSort={handleRankSort} C={C} align="left" />
                    <RankHeaderSortable label="Forme" col="formRecent" rankSort={rankSort} onSort={handleRankSort} C={C} width={48} />
                    <RankHeaderSortable label="Évol." col="formDelta" rankSort={rankSort} onSort={handleRankSort} C={C} width={42} />
                    <RankHeaderSortable label="Prés." col="sessions" rankSort={rankSort} onSort={handleRankSort} C={C} width={38} />
                    <RankHeaderSortable label="%" col="att" rankSort={rankSort} onSort={handleRankSort} C={C} width={38} />
                    <RankHeaderSortable label="Bles." col="injured" rankSort={rankSort} onSort={handleRankSort} C={C} width={38} />
                    <RankHeaderSortable label="Ret." col="late" rankSort={rankSort} onSort={handleRankSort} C={C} width={38} />
                    <RankHeaderSortable label="Abs." col="absent" rankSort={rankSort} onSort={handleRankSort} C={C} width={38} />
                  </tr>
                </thead>
                <tbody>
                  {rankSortedData.map((row, i) => {
                    const attColor = row.att >= 80 ? C.green : row.att >= 60 ? C.amber : C.red;
                    return (
                      <tr
                        key={row.player.id}
                        onClick={() => router.push(`/webapp/manager/squad/${row.player.id}`)}
                        style={{ backgroundColor: i % 2 === 0 ? C.card : C.stripe, cursor: 'pointer', height: 50, borderBottom: `1px solid ${C.border}` }}
                      >
                        <td style={{ padding: 0, position: 'relative', width: 28 }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.blue }} />
                          <span style={{ display: 'block', textAlign: 'center', fontSize: 12, fontWeight: 700, color: C.light }}>{i + 1}</span>
                        </td>
                        <td style={{ padding: '4px 4px 4px 0' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: 0.2 }}>{row.player.last_name.toUpperCase()}</div>
                          <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{row.player.first_name}</div>
                        </td>
                        <td style={{ textAlign: 'center', width: 48 }}>
                          <span style={{
                            display: 'inline-block', borderRadius: 5, padding: '2px 6px', minWidth: 38,
                            backgroundColor: wellnessBg(C, row.formRecent), color: wellnessColor(C, row.formRecent),
                            fontSize: 11, fontWeight: 800,
                          }}>
                            {row.formRecent !== null ? row.formRecent.toFixed(1) : '—'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', width: 42, fontSize: 11, fontWeight: 600, color: row.formDelta == null ? C.light : deltaColor(theme, row.formDelta) }}>
                          {row.formDelta == null ? '—' : `${row.formDelta > 0 ? '+' : ''}${row.formDelta.toFixed(1)}`}
                        </td>
                        <td style={{ textAlign: 'center', width: 38, fontSize: 11, fontWeight: 600, color: C.muted }}>{row.sessions}</td>
                        <td style={{ textAlign: 'center', width: 38, fontSize: 9, fontWeight: 700, color: attColor }}>{row.att}%</td>
                        <td style={{ textAlign: 'center', width: 38, fontSize: 11, fontWeight: row.injured > 0 ? 700 : 600, color: row.injured > 0 ? C.amber : C.muted }}>{row.injured}</td>
                        <td style={{ textAlign: 'center', width: 38, fontSize: 11, fontWeight: row.late > 0 ? 700 : 600, color: row.late > 0 ? C.amber : C.muted }}>{row.late}</td>
                        <td style={{ textAlign: 'center', width: 38, fontSize: 11, fontWeight: row.absent > 0 ? 700 : 600, color: row.absent > 0 ? C.red : C.muted }}>{row.absent}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Fidélité à l'entraînement ──────────────────────────────────── */}
          <SectionCard title="Fidélité à l'entraînement" Icon={UsersRound} C={C}>
            {[
              { label: '≥ 80% — Piliers', color: C.green, bg: C.greenBg,
                list: players.filter((p) => (data.attendanceRate[p.id] ?? 0) >= 80) },
              { label: '60–79% — Irréguliers', color: C.amber, bg: C.amberBg,
                list: players.filter((p) => { const a = data.attendanceRate[p.id] ?? 0; return a >= 60 && a < 80; }) },
              { label: '< 60% — Absents fréquents', color: C.red, bg: C.redBg,
                list: players.filter((p) => (data.attendanceRate[p.id] ?? 0) < 60) },
            ].map((group) => group.list.length > 0 && (
              <div key={group.label} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: group.bg, borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: group.color }}>{group.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: group.color }}>{group.list.length}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {group.list.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, borderRadius: 8, border: `1.5px solid ${group.color}`, padding: '4px 8px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: group.color, whiteSpace: 'nowrap' }}>{p.first_name[0]}. {p.last_name}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: group.color }}>{data.attendanceRate[p.id] ?? 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ title, Icon, C, children }: {
  title: string; Icon: typeof Users; C: DashColors; children: React.ReactNode;
}) {
  return (
    <div style={{ backgroundColor: C.card, marginTop: 12, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 3, height: 16, backgroundColor: C.blue, borderRadius: 2 }} />
        <Icon size={16} color={C.blue} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function RankHeaderCell({ label, width }: { label: string; width?: number }) {
  return (
    <th style={{ width, padding: '7px 0', fontSize: 10, fontWeight: 700, color: 'inherit', letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</th>
  );
}

function RankHeaderSortable({ label, col, rankSort, onSort, C, width, align = 'center' }: {
  label: string; col: RankSortKey;
  rankSort: { key: RankSortKey; dir: 'asc' | 'desc' };
  onSort: (key: RankSortKey) => void;
  C: DashColors; width?: number; align?: 'left' | 'center';
}) {
  const active = rankSort.key === col;
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        width, padding: '7px 4px', cursor: 'pointer', userSelect: 'none', textAlign: align,
        fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
        color: active ? C.blue : C.muted,
      }}
    >
      {label}{active ? (rankSort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );
}

// ─── SVG chart: attendance line ────────────────────────────────────────────────
function AttendanceLineChart({ data, C }: {
  data: { date: string; label: string; count: number }[]; C: DashColors;
}) {
  if (data.length === 0) {
    return <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '8px 0' }}>Aucune séance enregistrée avec présences</div>;
  }

  const CHART_H = 110;
  const PAD_TOP = 26;
  const PAD_BOT = 26;
  const PAD_LEFT = 30;
  const PAD_RIGHT = 12;
  const SPACING = 52;

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const totalW = Math.max(data.length * SPACING + PAD_LEFT + PAD_RIGHT, 280);
  const svgH = CHART_H + PAD_TOP + PAD_BOT;

  const toX = (i: number) => PAD_LEFT + i * SPACING + SPACING / 2;
  const toY = (v: number) => PAD_TOP + CHART_H - (v / maxCount) * CHART_H;

  const points = data.map((d, i) => `${toX(i)},${toY(d.count)}`).join(' ');

  const gridVals = [0, Math.round(maxCount * 0.5), maxCount].filter(
    (v, idx, arr) => arr.indexOf(v) === idx
  );

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={totalW} height={svgH}>
        {gridVals.map((val) => {
          const y = toY(val);
          return <line key={`gl${val}`} x1={PAD_LEFT} y1={y} x2={totalW - PAD_RIGHT} y2={y} stroke={C.border} strokeWidth={1} />;
        })}
        {gridVals.map((val) => (
          <text key={`yl${val}`} x={PAD_LEFT - 4} y={toY(val) + 4} fontSize={11} fill={C.light} textAnchor="end">{val}</text>
        ))}
        <polyline points={points} fill="none" stroke={C.blue} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => <circle key={`do${i}`} cx={toX(i)} cy={toY(d.count)} r={6} fill={C.blue} />)}
        {data.map((d, i) => <circle key={`di${i}`} cx={toX(i)} cy={toY(d.count)} r={3} fill={C.card} />)}
        {data.map((d, i) => (
          <text key={`cl${i}`} x={toX(i)} y={toY(d.count) - 11} fontSize={11} fill={C.blue} textAnchor="middle" fontWeight="bold">{d.count}</text>
        ))}
        {data.map((d, i) => (
          <text key={`dl${i}`} x={toX(i)} y={svgH - 4} fontSize={11} fill={C.muted} textAnchor="middle">{d.label}</text>
        ))}
      </svg>
    </div>
  );
}
