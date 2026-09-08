/**
 * TeamDashboardView — vue d'ensemble équipe (extrait en P0-5)
 *
 * Corps de l'ancien écran `app/(tabs)/dashboard/index.tsx`, extrait tel quel en
 * composant pour pouvoir être monté sous l'onglet « Analyse » aux côtés de
 * `AnalyticsView` et `TrackerAnalyticsView`, qui étaient déjà des composants.
 *
 * Extraction strictement mécanique : aucun changement de logique, seuls le nom
 * de l'export et les chemins d'import relatifs ont bougé. Le fichier de route
 * subsiste en enveloppe fine pour ne casser aucun lien profond existant.
 *
 * Ce fichier fait plus de 1 600 lignes et garde ses couleurs en dur : sa
 * migration vers les tokens est un chantier à part, à faire en le décomposant
 * (règle du Batch 2), pas en même temps que la navigation.
 */
/**
 * Dashboard — Intelligence Coach
 * Redesign complet : indicateurs décisionnels orientés coach futsal amateur/semi-pro.
 * 3 onglets : Semaine · Saison · Effectif
 */
import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { format, isAfter, differenceInDays, parseISO, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useIsTablet } from '../hooks/useIsTablet';
import { useActiveTeam } from '../contexts/ActiveTeamContext';
import { useActiveSeason } from '../contexts/ActiveSeasonContext';
import { getTrainingsByTeam } from '../lib/services/trainings';
import { getMatchesByTeam } from '../lib/services/matches';
import { getPlayersByTeam, getSquadBulkStats, type PlayerSquadStat } from '../lib/services/players';
import { getTeamFeedbackForLastSessions, type TeamFeedbackRow } from '../lib/services/feedback';
import type { Training, Match, Player } from '../types';
import Svg, { Polyline, Circle, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { useTheme, makeStyles } from '../contexts/ThemeContext';
import { deltaColor, type ThemeColors } from '../lib/design/tokens';
import { fmPalette } from './players/fmPalette';
import { positionStyle } from './players/positions';

// ─── Palette de l'écran ───────────────────────────────────────────────────────

/**
 * Ce fichier portait un objet `C` de dix-huit couleurs figées, calibrées pour un
 * fond clair, et se déclarait « design tokens » en commentaire. C'en était
 * l'inverse : une table locale de plus, la troisième après `fmPalette` et la
 * table des postes.
 *
 * Les clés sont conservées — elles sont lues 177 fois dans le fichier — mais
 * elles dérivent maintenant du thème. Deux corrections de fond au passage :
 *
 * - le bleu nuit du bandeau était `#1e3a5f`, encore un autre que celui de la
 *   fiche joueur et que celui d'`AnalyticsView`. Les trois lisent désormais
 *   `fmPalette.brand` ;
 * - `purple` ne signifiait rien : c'était une teinte catégorielle isolée. Elle
 *   passe sur la rampe catégorielle du thème.
 */
function dashColors(c: ThemeColors, scheme: 'light' | 'dark') {
  const brand = fmPalette(c, scheme);
  return {
    navy: brand.brand,
    navyLt: c.bg.elevated,
    bg: c.bg.canvas,
    card: c.bg.surface,
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
    purple: c.chartSeries[5] ?? c.accent.default,
    purpleBg: c.accent.subtle,
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

function abbrev(p: Player) {
  return `${p.first_name[0] ?? '?'}.${p.last_name?.[0] ?? ''}`;
}

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

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Les icônes étaient des emoji (🔥 ⚡ 🎯 ⚽ 📊), rendus en tofu sur l'iPad de
 * test comme celles d'`AnalyticsView`. Ionicons est embarquée avec le bundle.
 */
function weekDayContext(): { phase: string; advice: string; icon: IoniconName } {
  const day = getDay(new Date()); // 0=dim, 1=lun, 2=mar, 3=mer, 4=jeu, 5=ven, 6=sam
  if (day === 1) return { phase: 'Début de cycle — Lundi', icon: 'flame-outline', advice: 'Séance haute intensité · Nouveau principe' };
  if (day === 3) return { phase: 'Mi-semaine — Mercredi', icon: 'flash-outline', advice: 'Consolidation · Intensité moyenne-haute' };
  if (day === 5) return { phase: 'Pré-match — Vendredi', icon: 'locate-outline', advice: 'Séance légère · Confiance et plaisir' };
  if (day === 6 || day === 0) return { phase: 'Jour de match', icon: 'football-outline', advice: 'Concentration · Échauffement ciblé' };
  return { phase: 'Hors séance', icon: 'bar-chart-outline', advice: 'Analyse & préparation de la prochaine séance' };
}

/**
 * Cinquième copie de la table des postes trouvée dans ce dépôt, après celles de
 * `squad/index`, `PlayerDetailView`, `season-planning` et la feuille de présence.
 * Le catalogue unique vit dans `components/players/positions.ts`.
 */
function getPos(c: ThemeColors, position?: string) {
  const st = positionStyle(position, c);
  return { abbr: st.abbr, color: st.color, bg: st.color + '1A' };
}

// ─── Component ────────────────────────────────────────────────────────────────
export function TeamDashboardView() {
  const s = useStyles();
  const { theme } = useTheme();
  const C = dashColors(theme.colors, theme.scheme);
  const router  = useRouter();
  const { activeTeamId, activeTeam } = useActiveTeam();
  const { activeSeason } = useActiveSeason();
  // `width >= 768` prenait un iPhone en paysage (l'app autorise la rotation)
  // pour une tablette, et affichait des grilles de densité iPad sur 390 pt de
  // haut. `useIsTablet` compare la plus petite dimension : une seule définition
  // de « tablette » dans le dépôt.
  const isTablet = useIsTablet();

  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]               = useState<TabId>('season');

  const [trainings,   setTrainings]   = useState<Training[]>([]);
  const [matches,     setMatches]     = useState<Match[]>([]);
  const [players,     setPlayers]     = useState<Player[]>([]);
  const [feedback,    setFeedback]    = useState<TeamFeedbackRow[]>([]);
  const [squadStats,  setSquadStats]  = useState<Record<string, PlayerSquadStat>>({});
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
      setLoading(false); setRefreshing(false);
      return;
    }
    try {
      const [tr, ma, pl, fb, ss] = await Promise.all([
        getTrainingsByTeam(activeTeamId, activeSeason),
        getMatchesByTeam(activeTeamId, activeSeason),
        getPlayersByTeam(activeTeamId),
        getTeamFeedbackForLastSessions(activeTeamId, 10),
        getSquadBulkStats(activeTeamId, 'all', activeSeason),
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

    // Season bilan
    const wins   = pastMatches.filter((m) => m.score_team! > m.score_opponent!).length;
    const draws  = pastMatches.filter((m) => m.score_team! === m.score_opponent!).length;
    const losses = pastMatches.filter((m) => m.score_team! < m.score_opponent!).length;

    // Training themes (for season tab)
    const themeCount: Record<string, number> = {};
    trainings.forEach((t) => {
      if (t.theme) themeCount[t.theme] = (themeCount[t.theme] ?? 0) + 1;
    });
    const themes = Object.entries(themeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Attendance & availability tallies per player (saison, tous les entraînements passés)
    const convokedCount: Record<string, number> = {};
    const presentCount:  Record<string, number> = {};
    const injuredCount:  Record<string, number> = {};
    const lateCount:     Record<string, number> = {};
    const absentCount:   Record<string, number> = {};
    trainings.filter((t) => t.date <= today).forEach((t) => {
      const att = t.attendance ?? {};
      Object.entries(att).forEach(([pid, status]) => {
        convokedCount[pid] = (convokedCount[pid] ?? 0) + 1;
        if (status === 'present' || status === 'late') presentCount[pid] = (presentCount[pid] ?? 0) + 1;
        if (status === 'injured') injuredCount[pid] = (injuredCount[pid] ?? 0) + 1;
        if (status === 'late')    lateCount[pid]    = (lateCount[pid]    ?? 0) + 1;
        if (status === 'absent')  absentCount[pid]  = (absentCount[pid]  ?? 0) + 1;
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

    /**
     * Forme physique : moyenne sur les 5 dernières séances, et évolution vs
     * le bloc des 5 séances précédentes. `physical_form` seul, pas mélangé à
     * `pleasure` (ce que faisait l'ancien `wellnessScore`) — la question
     * posée ici est physique, pas le ressenti global.
     */
    const recentTrainings = [...trainings]
      .filter((t) => t.date <= today)
      .sort((a, b) => b.date.localeCompare(a.date));
    const last5Ids = new Set(recentTrainings.slice(0, 5).map((t) => t.id));
    const prev5Ids  = new Set(recentTrainings.slice(5, 10).map((t) => t.id));
    const physicalFormAvg = (ids: Set<string>, playerId: string): number | null => {
      const vals = feedback
        .filter((f) => f.player_id === playerId && ids.has(f.training_id) && f.physical_form != null)
        .map((f) => f.physical_form as number);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const formRecent: Record<string, number | null> = {};
    const formDelta:  Record<string, number | null> = {};
    players.forEach((p) => {
      const recent = physicalFormAvg(last5Ids, p.id);
      const prev   = physicalFormAvg(prev5Ids, p.id);
      formRecent[p.id] = recent;
      formDelta[p.id]  = recent != null && prev != null ? recent - prev : null;
    });

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

    return {
      nextTraining, nextMatch,
      wins, draws, losses,
      themes, themeCount,
      presentCount, attendanceRate, injuredCount, lateCount, absentCount,
      feedbackMap, formRecent, formDelta,
      futureTrainings, futureMatches,
      sessionAttHistory,
    };
  }, [trainings, matches, players, feedback]);

  /**
   * Forme et présence uniquement : M/V/N/D/Buts vivent désormais dans le
   * segment « Matchs » de l'onglet Analyse (Statistiques joueurs, source
   * tracker) — cette table n'a plus vocation à les recalculer depuis le JSON
   * manuel du match, une deuxième source pour la même donnée. Domicile /
   * Extérieur a suivi le même chemin : c'est un résultat de match, pas de
   * séance.
   */
  const rankData = useMemo(() => {
    return players.map(p => ({
      player:     p,
      formRecent: data.formRecent[p.id] ?? null,
      formDelta:  data.formDelta[p.id]  ?? null,
      // « Nombre de présence » = présent + en retard, pas le total convoqué.
      sessions:   data.presentCount[p.id] ?? 0,
      att:        data.attendanceRate[p.id] ?? 0,
      injured:    data.injuredCount[p.id] ?? 0,
      late:       data.lateCount[p.id] ?? 0,
      absent:     data.absentCount[p.id] ?? 0,
    }));
  }, [players, data.formRecent, data.formDelta, data.presentCount, data.attendanceRate, data.injuredCount, data.lateCount, data.absentCount]);

  const rankSortedData = useMemo(() => {
    return [...rankData].sort((a, b) => {
      const dir = rankSort.dir === 'asc' ? 1 : -1;
      if (rankSort.key === 'name')
        return dir * `${a.player.last_name} ${a.player.first_name}`.localeCompare(`${b.player.last_name} ${b.player.first_name}`, 'fr');
      const map: Record<RankSortKey, number> = {
        name: 0,
        formRecent: (a.formRecent ?? -1) - (b.formRecent ?? -1),
        formDelta:  (a.formDelta  ?? -99) - (b.formDelta  ?? -99),
        sessions: a.sessions - b.sessions,
        att:      a.att - b.att,
        injured:  a.injured - b.injured,
        late:     a.late - b.late,
        absent:   a.absent - b.absent,
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
          <View style={s.heroCtxRow}>
            <Ionicons name={ctx.icon} size={20} color={C.onBrand} />
            <View>
              <Text style={s.heroCtxPhase}>{ctx.phase}</Text>
              <Text style={s.heroCtxAdvice}>{ctx.advice}</Text>
            </View>
          </View>
        </View>
        <View style={s.heroBilan}>
          <Text style={s.heroBilanVal}>{data.wins}V</Text>
          <Text style={s.heroBilanSep}>·</Text>
          <Text style={[s.heroBilanVal, { color: C.amber }]}>{data.draws}N</Text>
          <Text style={s.heroBilanSep}>·</Text>
          <Text style={[s.heroBilanVal, { color: C.red }]}>{data.losses}D</Text>
        </View>
      </View>


      {/* ── Next events strip ────────────────────────────────────────────── */}
      <View style={s.nextRow}>
        {data.nextTraining && (
          <TouchableOpacity
            style={[s.nextCard, { borderLeftColor: C.blue }]}
            onPress={() => router.push(`/(tabs)/calendar/training/${data.nextTraining!.id}` as never)}
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
            onPress={() => router.push(`/(tabs)/calendar/matchDetail/${data.nextMatch!.id}` as never)}
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
        {([['season', 'Saison'], ['squad', 'Effectif']] as [TabId, string][]).map(([id, label]) => (
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
          TAB — SAISON
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'season' && (
        <>
          {/* ── Attendance evolution ───────────────────────────────── */}
          <SectionCard title="Présence en séance — Saison" icon="people-outline">
            <Text style={s.heatmapLegend}>
              Nombre de joueurs présents par séance (équipe + invités)
            </Text>
            <AttendanceLineChart data={data.sessionAttHistory} />
          </SectionCard>

          {/* ── Charge — raccourci ───────────────────────────────────
              La charge d'entraînement (cible vs avérée) vit dans l'onglet
              Performance, pas ici : les segments d'Analyse restent tous
              montés, une charge lourde de plus la ralentirait pour un écran
              consulté deux fois par semaine. Ce raccourci évite de la
              dupliquer tout en gardant l'accès à une intention près. */}
          <TouchableOpacity
            style={[s.card, s.chargeShortcut]}
            onPress={() => router.push('/(tabs)/performance?tab=charge' as any)}
            activeOpacity={0.8}
          >
            <View style={[s.chargeShortcutIcon, { backgroundColor: C.blueBg }]}>
              <Ionicons name="trending-up-outline" size={18} color={C.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Charge d'entraînement</Text>
              <Text style={s.noTeamText}>Cible vs avérée, par équipe ou par joueur</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.light} />
          </TouchableOpacity>

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
          {/* ── Infirmerie — raccourci ────────────────────────────────
              Les alertes joueurs (blessures, signaux précoces) vivent dans
              Performance. Les reconstruire ici depuis le questionnaire de
              fin de séance aurait fait un deuxième mécanisme d'alerte pour
              la même préoccupation, avec une source différente et donc un
              risque de désaccord entre les deux écrans. */}
          <TouchableOpacity
            style={[s.card, s.chargeShortcut]}
            onPress={() => router.push('/(tabs)/performance?tab=infirmerie' as any)}
            activeOpacity={0.8}
          >
            <View style={[s.chargeShortcutIcon, { backgroundColor: C.redBg }]}>
              <Ionicons name="medkit-outline" size={18} color={C.red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Infirmerie</Text>
              <Text style={s.noTeamText}>Blessures, signaux précoces, retours</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.light} />
          </TouchableOpacity>

          {/* ── Forme et présence ──────────────────────────────────
              M/V/N/D/Buts vivent dans Analyse > Matchs > Joueurs (source
              tracker) — cette table ne garde que ce qui est propre à la
              séance : forme déclarée et assiduité à l'entraînement. */}
          <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
            <View style={[s.cardHeader, { marginHorizontal: 16, marginTop: 16, marginBottom: 8 }]}>
              <View style={s.cardAccent} />
              <Ionicons name="people-outline" size={16} color={C.blue} />
              <Text style={s.cardTitle}>Forme et présence</Text>
            </View>

            {/* Table pleine largeur : nom en flex, colonnes de données à
                largeur fixe étroite — même gabarit que l'ancienne table à
                7 colonnes de stats, qui tenait déjà sans défilement. */}
            {(() => {
              const dataCols: { key: RankSortKey; label: string; width: number }[] = [
                { key: 'formRecent', label: 'Forme',  width: 44 },
                { key: 'formDelta',  label: 'Évol.',  width: 38 },
                { key: 'sessions',   label: 'Prés.',  width: 34 },
                { key: 'att',        label: '%',      width: 34 },
                { key: 'injured',    label: 'Bles.',  width: 34 },
                { key: 'late',       label: 'Ret.',   width: 34 },
                { key: 'absent',     label: 'Abs.',   width: 34 },
              ];
              return (
                <>
                  <View style={[s.fmHead, { paddingHorizontal: 0 }]}>
                    <View style={{ width: 3 }} />
                    <View style={s.fmColRank}><Text style={s.fmHeadTxt}>#</Text></View>
                    <TouchableOpacity style={s.fmColNameFlex} onPress={() => handleRankSort('name')} activeOpacity={0.7}>
                      <Text style={[s.fmHeadTxt, rankSort.key === 'name' && s.fmHeadTxtActive]}>
                        NOM{rankSort.key === 'name' ? (rankSort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                      </Text>
                    </TouchableOpacity>
                    {dataCols.map(col => (
                      <TouchableOpacity
                        key={col.key}
                        style={{ width: col.width, alignItems: 'center' }}
                        onPress={() => handleRankSort(col.key)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.fmHeadTxt, { textAlign: 'center' }, rankSort.key === col.key && s.fmHeadTxtActive]}>
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
                        style={[s.fmRow, { backgroundColor: i % 2 === 0 ? C.card : theme.colors.bg.stripe }]}
                        onPress={() => router.push(`/squad/${row.player.id}` as any)}
                        activeOpacity={0.6}
                      >
                        <View style={[s.fmStripe, { backgroundColor: C.blue }]} />
                        <View style={s.fmColRank}>
                          <Text style={s.fmRankTxt}>{i + 1}</Text>
                        </View>
                        <View style={s.fmColNameFlex}>
                          <Text style={s.fmLastName} numberOfLines={1}>{row.player.last_name.toUpperCase()}</Text>
                          <Text style={s.fmFirstName} numberOfLines={1}>{row.player.first_name}</Text>
                        </View>
                        <View style={{ width: 44, alignItems: 'center' }}>
                          <View style={[s.fmFormPill, { backgroundColor: wellnessBg(C, row.formRecent) }]}>
                            <Text style={[s.fmFormVal, { color: wellnessColor(C, row.formRecent) }]}>
                              {row.formRecent !== null ? row.formRecent.toFixed(1) : '—'}
                            </Text>
                          </View>
                        </View>
                        <View style={{ width: 38, alignItems: 'center' }}>
                          <Text style={[s.fmStatNum, { fontSize: 11, color: row.formDelta == null ? C.light : deltaColor(theme, row.formDelta) }]}>
                            {row.formDelta == null ? '—' : `${row.formDelta > 0 ? '+' : ''}${row.formDelta.toFixed(1)}`}
                          </Text>
                        </View>
                        <View style={{ width: 34, alignItems: 'center' }}>
                          <Text style={[s.fmStatNum, { fontSize: 11 }]}>{row.sessions}</Text>
                        </View>
                        <View style={{ width: 34, alignItems: 'center' }}>
                          <Text style={[s.fmStatNum, { color: attColor, fontWeight: '700', fontSize: 9 }]}>{row.att}%</Text>
                        </View>
                        <View style={{ width: 34, alignItems: 'center' }}>
                          <Text style={[s.fmStatNum, { fontSize: 11 }, row.injured > 0 && { color: C.amber, fontWeight: '700' }]}>{row.injured}</Text>
                        </View>
                        <View style={{ width: 34, alignItems: 'center' }}>
                          <Text style={[s.fmStatNum, { fontSize: 11 }, row.late > 0 && { color: C.amber, fontWeight: '700' }]}>{row.late}</Text>
                        </View>
                        <View style={{ width: 34, alignItems: 'center' }}>
                          <Text style={[s.fmStatNum, { fontSize: 11 }, row.absent > 0 && { color: C.red, fontWeight: '700' }]}>{row.absent}</Text>
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
  title: string; icon: IoniconName; children: React.ReactNode;
}) {
  const s = useStyles();
  const { theme } = useTheme();
  const C = dashColors(theme.colors, theme.scheme);
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={s.cardAccent} />
        <Ionicons name={icon} size={16} color={C.blue} />
        <Text style={s.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// ─── SVG chart: attendance line ────────────────────────────────────────────────
function AttendanceLineChart({ data }: {
  data: { date: string; label: string; count: number }[];
}) {
  const s = useStyles();
  const { theme } = useTheme();
  const C = dashColors(theme.colors, theme.scheme);
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
              stroke={C.border} strokeWidth={1} />
          );
        })}
        {/* Y labels */}
        {gridVals.map((val) => (
          <SvgText key={`yl${val}`}
            x={PAD_LEFT - 4} y={toY(val) + 4}
            fontSize={11} fill={C.light} textAnchor="end">
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
          <Circle key={`do${i}`} cx={toX(i)} cy={toY(d.count)} r={6} fill={C.blue} />
        ))}
        {/* Dots (inner white) */}
        {data.map((d, i) => (
          <Circle key={`di${i}`} cx={toX(i)} cy={toY(d.count)} r={3} fill={C.card} />
        ))}
        {/* Count labels above dots */}
        {data.map((d, i) => (
          <SvgText key={`cl${i}`}
            x={toX(i)} y={toY(d.count) - 11}
            fontSize={11} fill={C.blue} textAnchor="middle" fontWeight="bold">
            {d.count}
          </SvgText>
        ))}
        {/* Date labels */}
        {data.map((d, i) => (
          <SvgText key={`dl${i}`}
            x={toX(i)} y={svgH - 4}
            fontSize={11} fill={C.muted} textAnchor="middle">
            {d.label}
          </SvgText>
        ))}
      </Svg>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const useStyles = makeStyles((t) => {
  const C = dashColors(t.colors, t.scheme);
  return {
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
  heroTeam: { fontSize: 20, fontWeight: '800', color: C.onBrand, letterSpacing: 0.2 },
  heroDate: { fontSize: 12, color: C.onBrandMuted, marginTop: 2 },
  heroCtxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  heroCtxIcon: { fontSize: 20 },
  heroCtxPhase: { fontSize: 12, fontWeight: '700', color: C.onBrand },
  heroCtxAdvice: { fontSize: 11, color: C.onBrandMuted, marginTop: 1 },
  heroBilan: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  heroBilanVal: { fontSize: 15, fontWeight: '800', color: t.colors.positive.default },
  heroBilanSep: { fontSize: 12, color: C.onBrandMuted },

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
  tabBtnActive: { backgroundColor: C.blueBg, borderBottomWidth: 2, borderBottomColor: C.blue },
  tabLabel: { fontSize: 13, fontWeight: '600', color: C.muted },
  tabLabelActive: { color: C.blue },

  // Cards
  card: {
    backgroundColor: C.card, marginHorizontal: 12, marginTop: 12,
    borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14,
  },
  cardAccent: { width: 3, height: 16, backgroundColor: C.blue, borderRadius: 2 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  emptyCard: { fontSize: 13, color: C.muted, textAlign: 'center', paddingVertical: 8 },

  chargeShortcut: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chargeShortcutIcon: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },

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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 14, backgroundColor: t.colors.warning.subtle, borderRadius: 8, padding: 10,
  },
  streakText: { fontSize: 13, fontWeight: '600', color: t.colors.warning.default },

  // Bilan
  bilanGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bilanCard: {
    minWidth: '30%', flex: 1, backgroundColor: C.bg, borderRadius: 10, borderWidth: 1,
    borderColor: C.border, padding: 12, alignItems: 'center',
  },
  bilanVal: { fontSize: 22, fontWeight: '800' },
  bilanLabel: { fontSize: 10, color: C.muted, marginTop: 4, textAlign: 'center' },

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
  themeBarFill: { height: '100%', backgroundColor: C.blue, borderRadius: 4 },
  themeCount: { width: 28, fontSize: 11, color: C.blue, fontWeight: '700', textAlign: 'right' },

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
    backgroundColor: C.sunken,
    borderTopWidth: 1, borderTopColor: C.border,
    borderBottomWidth: 1, borderBottomColor: C.border,
    paddingVertical: 7, paddingRight: 8,
  },
  fmRow: {
    flexDirection: 'row', alignItems: 'center',
    height: 50,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  fmStripe:   { width: 3, alignSelf: 'stretch' },
  fmColRank:  { width: 28, alignItems: 'center' },
  fmColNameFlex: { flex: 1, paddingRight: 4, minWidth: 60 },
  fmColPos:   { width: 52, alignItems: 'center' },
  fmColForme: { width: 52, alignItems: 'center' },
  fmColStat:  { width: 46, alignItems: 'center' },
  fmColSm:    { width: 36, alignItems: 'center' },
  fmHeadTxt: {
    fontSize: 10, fontWeight: '700', color: C.muted,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  fmHeadTxtActive: { color: C.blue },
  fmRankTxt:  { fontSize: 12, fontWeight: '700', color: C.light, textAlign: 'center' },
  fmPosBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  fmPosAbbr:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  fmLastName: { fontSize: 12, fontWeight: '700', color: C.text, letterSpacing: 0.2 },
  fmFirstName:{ fontSize: 10, color: C.muted, marginTop: 1 },
  fmFormPill: {
    borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2,
    minWidth: 38, alignItems: 'center',
  },
  fmFormVal:  { fontSize: 11, fontWeight: '800' },
  fmStatNum:  { fontSize: 13, fontWeight: '600', color: C.muted, textAlign: 'center' },
  };
});
