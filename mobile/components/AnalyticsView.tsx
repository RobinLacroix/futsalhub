import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, RefreshControl } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

type IoniconName = keyof typeof Ionicons.glyphMap;
import { useActiveTeam } from '../contexts/ActiveTeamContext';
import { useTheme, makeStyles } from '../contexts/ThemeContext';
import { dataColor, deltaColor, type Theme, type ThemeColors } from '../lib/design/tokens';
import { haptics } from '../lib/design/haptics';
import { fmPalette } from './players/fmPalette';
import { Text, Card, Stat, EmptyState, SkeletonStats } from './ui';
import { MatchMomentsView } from './MatchMomentsView';
import { PlayerStatsPanel } from './analytics/PlayerStatsPanel';
import { abbrevName, fmtTime, type PlayerStats } from './analytics/playerStats';
import { useMatchAnalytics } from './analytics/MatchAnalyticsContext';
import { buildPlayerStats, totalShots } from './analytics/aggregate';
import { useIsTablet } from '../hooks/useIsTablet';
import type { MatchEvent, Player } from '../types';

/**
 * Couleur d'une note /10. Le barème d'origine inventait cinq seuils et cinq
 * teintes propres à cet écran (`#059669`, `#16a34a`, `#64748b`, `#ea580c`,
 * `#dc2626`). `dataColor` est le point d'entrée unique pour toute mise en
 * couleur de métrique : trois niveaux, sur la rampe du thème, autour de la base
 * du barème (5) et d'une amplitude d'un point et demi.
 */
function ratingColor(theme: Theme, rating: number): string {
  return dataColor(theme, rating, 5, 1.5);
}

// ─── Types ────────────────────────────────────────────────────────────────────


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



const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ─── Coaching insights engine ─────────────────────────────────────────────────

type InsightLevel = 'positive' | 'warning' | 'alert' | 'info';
/**
 * Une analyse du coach adjoint.
 *
 * `icon` est un glyphe **Ionicons**, plus un emoji. Les emoji étaient rendus en
 * tofu (carré vide) sur l'iPad de test : la police emoji n'est pas garantie
 * dans le contexte de rendu de l'app, alors qu'Ionicons est embarquée avec le
 * bundle et rend partout. Le niveau (`level`) reste ce qui porte le sens — il
 * s'affiche en toutes lettres sur la carte (« Point fort », « Alerte »…), donc
 * même une icône absente ne fait perdre aucune information.
 */
interface Insight { level: InsightLevel; icon: IoniconName; title: string; body: string; }

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
      out.push({ level: 'positive', icon: 'flame-outline', title: 'Série de victoires', body: `3 victoires consécutives — momentum excellent. Profitez-en pour renforcer la rigueur défensive.` });
    else if (r.filter(x => x === 'L').length >= 3)
      out.push({ level: 'alert', icon: 'warning-outline', title: 'Série difficile', body: `3 défaites consécutives. Recréez des situations de succès à l'entraînement pour restaurer la confiance.` });
    else if (r.filter(x => x === 'W').length >= 2)
      out.push({ level: 'positive', icon: 'trending-up-outline', title: 'Bonne dynamique', body: `2 victoires sur les 3 derniers matchs. Maintenez l'intensité à l'entraînement.` });
  }

  const avgFor = ts.goalsFor / ts.played;
  if (avgFor >= 3)
    out.push({ level: 'positive', icon: 'football-outline', title: 'Attaque prolifique', body: `${avgFor.toFixed(1)} buts par match en moyenne. Veillez à ne pas négliger l'équilibre défensif.` });
  else if (avgFor < 1 && ts.played >= 3)
    out.push({ level: 'alert', icon: 'locate-outline', title: 'Manque de réalisme', body: `Moins d'un but par match (${avgFor.toFixed(1)} moy.). Travaillez les situations de finition.` });

  const avgAgainst = ts.goalsAgainst / ts.played;
  if (avgAgainst >= 3)
    out.push({ level: 'alert', icon: 'shield-outline', title: 'Défense à consolider', body: `${avgAgainst.toFixed(1)} buts encaissés/match. Analysez les transitions défensives et les CPA concédés.` });
  else if (ts.cleanSheets / ts.played >= 0.4)
    out.push({ level: 'positive', icon: 'shield-checkmark-outline', title: 'Solidité défensive', body: `${ts.cleanSheets} clean sheet(s) sur ${ts.played} matchs (${Math.round(ts.cleanSheets / ts.played * 100)}%). La défense est le socle de l'équipe.` });

  const withGoals = stats.filter(p => p.goals > 0);
  if (withGoals.length > 0 && ts.goalsFor >= 5) {
    const top = [...withGoals].sort((a, b) => b.goals - a.goals)[0];
    const share = Math.round((top.goals / ts.goalsFor) * 100);
    if (share >= 40)
      out.push({ level: 'warning', icon: 'flash-outline', title: `Dépendance à ${abbrevName(top.playerName)}`, body: `${top.playerName} représente ${share}% des buts. Impliquez d'autres profils dans la finition.` });
  }

  const active = stats.filter(p => p.matchesPlayed >= 2 && p.totalTimeSeconds > 0);
  if (active.length > 0) {
    const top = [...active].sort((a, b) => (b.recovery / b.matchesPlayed) - (a.recovery / a.matchesPlayed))[0];
    const rpm = top.recovery / top.matchesPlayed;
    if (rpm >= 2)
      out.push({ level: 'info', icon: 'refresh-outline', title: `${abbrevName(top.playerName)}, moteur du pressing`, body: `${top.recovery} récupérations en ${top.matchesPlayed} matchs (${rpm.toFixed(1)}/match). Construisez votre pressing autour de son activité.` });
  }

  if (active.length > 0) {
    const top = [...active].sort((a, b) => (b.ball_loss / b.matchesPlayed) - (a.ball_loss / a.matchesPlayed))[0];
    const lpm = top.ball_loss / top.matchesPlayed;
    if (lpm >= 3)
      out.push({ level: 'warning', icon: 'trending-down-outline', title: 'Pertes de balle à corriger', body: `${top.playerName} perd en moyenne ${lpm.toFixed(1)} ballons/match. Travaillez la conservation sous pression.` });
  }

  const totalGoals = stats.reduce((s, p) => s + p.goals, 0);
  // Était `shot + shot_on_target + goals`, alors que le tableau juste en dessous
  // affiche `shot + shot_on_target` : le texte citait un total de tirs supérieur
  // à la somme de la colonne TT, et le taux de conversion s'en trouvait
  // sous-estimé — donc l'alerte « conversion faible » déclenchée à tort. Un but
  // écrit déjà son tir cadré (`PAIRED_EVENT`), il n'a pas à être recompté.
  // Voir la mise en garde de `totalShots` sur les matchs saisis côté web.
  const shotsTotal = stats.reduce((s, p) => s + totalShots(p), 0);
  if (shotsTotal >= 10) {
    const conv = Math.round((totalGoals / shotsTotal) * 100);
    if (conv >= 35)
      out.push({ level: 'positive', icon: 'golf-outline', title: 'Excellent taux de conversion', body: `${conv}% des tirs finissent au fond (${totalGoals}/${shotsTotal}). La finition est un point fort collectif.` });
    else if (conv < 15)
      out.push({ level: 'warning', icon: 'alert-circle-outline', title: 'Taux de conversion faible', body: `${conv}% de conversion (${totalGoals}/${shotsTotal}). Priorisez la qualité des situations et le dernier geste.` });
  }

  const worst = [...goalsByType].sort((a, b) => b.conceded - a.conceded)[0];
  if (worst?.conceded >= 2)
    out.push({ level: 'warning', icon: 'search-outline', title: `Vulnérabilité en ${worst.label}`, body: `${worst.conceded} buts encaissés en ${worst.label.toLowerCase()}. Point défensif à travailler en priorité.` });

  const underused = stats.filter(p => p.plusMinusGoals >= 2 && p.matchesPlayed >= 2 && p.totalTimeSeconds < 600 * p.matchesPlayed);
  if (underused.length > 0) {
    const p = underused[0];
    out.push({ level: 'info', icon: 'bulb-outline', title: `${abbrevName(p.playerName)} à valoriser`, body: `+/- de +${p.plusMinusGoals} en ${p.matchesPlayed} matchs avec peu de temps de jeu. Sa présence sur le terrain est statistiquement bénéfique.` });
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
  const ICON:  Record<number, IoniconName> = { 2: 'flash-outline', 3: 'triangle-outline', 4: 'link-outline' };
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
      out.push({ level: 'info', icon: 'locate-outline',
        title: `${LABEL[size]} dominant au tir : ${fmt(best.playerIds)}`,
        body: `+/-T/min de +${best.pmShotsPerMin.toFixed(2)} — ${fmtTime(best.sharedTimeSec)} ensemble. Beaucoup de danger, la conversion suivra.` });
    }
  }
  const worst = Array.from(allStats.values())
    .filter(c => c.playerIds.length === 2 && c.sharedTimeSec >= MIN_COMBO_SEC && c.pmGoalsPerMin <= -0.1)
    .sort((a, b) => a.pmGoalsPerMin - b.pmGoalsPerMin)[0];
  if (worst) out.push({ level: 'warning', icon: 'warning-outline',
    title: `Duo à surveiller : ${fmt(worst.playerIds)}`,
    body: `+/-B/min de ${worst.pmGoalsPerMin.toFixed(2)} (${fmtTime(worst.sharedTimeSec)} partagées). Analysez les situations défensives.` });
  return out;
}

const LOCATION_FILTERS    = ['all', 'Domicile', 'Extérieur'] as const;
const COMPETITION_FILTERS = ['all', 'Championnat', 'Coupe', 'Amical']  as const;


// ─── Component ────────────────────────────────────────────────────────────────

export function AnalyticsView() {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  const bp = fmPalette(theme.colors, theme.scheme);
  const series = c.chartSeries;
  const { activeTeamId, activeTeam } = useActiveTeam();
  const isTablet = useIsTablet();

  // ── Données ─────────────────────────────────────────────────────────────
  //
  // Le chargement vivait ici, à l'identique de celui de `TrackerAnalyticsView`
  // — soit deux fois les mêmes requêtes, dont deux fois le N+1 sur les
  // événements, puisque les deux segments de l'onglet sont montés ensemble.
  // Il est remonté dans `MatchAnalyticsProvider`, qui charge une seule fois.

  const {
    matches,
    eventsByMatch,
    clubPlayers: allPlayers,
    clubPlayerIds,
    ratingRows,
    loading,
    refreshing,
    refresh: onRefresh,
  } = useMatchAnalytics();

  const [filterLoc,  setFilterLoc]  = useState('all');
  const [filterComp, setFilterComp] = useState('all');
  const [activeTab,  setActiveTab]  = useState<'overview' | 'stats' | 'coach'>('overview');

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

  // ── Note data moyenne par joueur (Volet B) ───────────────────────────────
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

  // ── Player stats ────────────────────────────────────────────────────────
  //
  // Le calcul vivait ici, recopié à l'identique dans `TrackerAnalyticsView`.
  // Une seule implémentation désormais, dans `analytics/aggregate.ts`.

  const playerStatsList = useMemo(
    () =>
      buildPlayerStats({
        eventsByMatch,
        matches,
        filteredMatchIds,
        players: allPlayers,
        clubPlayerIds,
        avgRatingByPlayer,
      }),
    [eventsByMatch, matches, filteredMatchIds, allPlayers, clubPlayerIds, avgRatingByPlayer]
  );

  // ── Sorting ─────────────────────────────────────────────────────────────

  // Le tri et la normalisation du classement joueurs vivent désormais dans
  // `PlayerStatsPanel`, qui est seul responsable de cet affichage.

  // ── Top performers ──────────────────────────────────────────────────────

  const tops = useMemo(() => {
    const topN = (key: string, n = 3) =>
      [...playerStatsList]
        .sort((a, b) => {
          const va = key === 'totalShots' ? totalShots(a) : (a as any)[key] ?? 0;
          const vb = key === 'totalShots' ? totalShots(b) : (b as any)[key] ?? 0;
          return vb - va;
        })
        .slice(0, n)
        .filter(p => {
          const v = key === 'totalShots' ? totalShots(p) : (p as any)[key] ?? 0;
          return v > 0;
        });
    // Efficacité au tir : goals / (shot + shot_on_target + goals) × 100
    const shooterEff = [...playerStatsList]
      .map(p => {
        // Cinquième variante du total de tirs trouvée dans l'app, et la
        // deuxième dans ce fichier : elle recomptait les buts, déjà présents
        // dans `shot_on_target`. L'efficacité affichée était donc minorée.
        const attempts = totalShots(p);
        const eff = attempts > 0 ? Math.round((p.goals / attempts) * 100) : 0;
        return { ...p, shotEff: eff, totalShotsAll: attempts };
      })
      .filter(p => p.totalShotsAll >= 3)   // au moins 3 tirs pour être pertinent
      .sort((a, b) => b.shotEff - a.shotEff)
      .slice(0, 3);
    const ratings = [...playerStatsList]
      .filter(p => p.avgRating != null)
      .sort((a, b) => (b.avgRating as number) - (a.avgRating as number))
      .slice(0, 3);
    return {
      scorers:    topN('goals'),
      assists:    topN('assist'),
      recoveries: topN('recovery'),
      plusMinus:  topN('plusMinusGoals'),
      shooterEff,
      ratings,
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
        <EmptyState
          icon="bar-chart-outline"
          title="Aucune équipe sélectionnée"
          description="Choisissez une équipe depuis l'accueil."
        />
      </View>
    );
  }
  if (loading) {
    return (
      <View style={[s.root, { padding: theme.space.lg }]}>
        <SkeletonStats />
      </View>
    );
  }

  // ─── KPI items ─────────────────────────────────────────────────────────────

  const kpiCols = isTablet ? 4 : 2;

  // Six teintes décoratives couvraient les huit KPI, dont un violet et un cyan
  // qui ne signifiaient rien. La couleur est réservée au signal : ce qui est
  // bon pour l'équipe, ce qui ne l'est pas, et le reste en neutre.
  const KPI_ITEMS = [
    { label: 'Matchs joués',   value: teamStats.played,        color: c.text.primary,      icon: 'football-outline'         as const },
    { label: 'Victoires',      value: teamStats.wins,          color: c.positive.default,  icon: 'trophy-outline'           as const },
    { label: 'Défaites',       value: teamStats.losses,        color: c.negative.default,  icon: 'close-circle-outline'     as const },
    { label: '% victoires',    value: `${teamStats.winRate}%`, color: c.text.primary,      icon: 'stats-chart-outline'      as const },
    { label: 'Buts marqués',   value: teamStats.goalsFor,      color: c.positive.default,  icon: 'trending-up-outline'      as const },
    { label: 'Buts encaissés', value: teamStats.goalsAgainst,  color: c.negative.default,  icon: 'trending-down-outline'    as const },
    { label: 'Clean sheets',   value: teamStats.cleanSheets,   color: c.text.primary,      icon: 'shield-checkmark-outline' as const },
    { label: 'Tirs cadrés',    value: totals.onTarget,         color: c.text.primary,      icon: 'radio-button-on-outline'  as const },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[c.accent.default]}
            tintColor={c.accent.default}
            progressBackgroundColor={c.bg.surface}
          />
        }
      >
        {/* ── Hero header ── */}
        <View style={[s.hero, { backgroundColor: bp.brand }]}>
          <View style={s.heroTop}>
            <View style={s.flex1}>
              <Text variant="caption" color={bp.onBrandMuted}>
                Analyse
              </Text>
              <Text variant="title" color={bp.onBrand}>
                {activeTeam.name}
              </Text>
            </View>
            {teamStats.form.length > 0 && (
              <View style={s.formBlock}>
                <Text variant="caption" color={bp.onBrandMuted}>
                  Forme
                </Text>
                {/* Les cinq derniers résultats, du plus récent au plus ancien.
                    La lettre porte l'information, la couleur ne fait que la
                    doubler — un daltonien lit la série sans la couleur. */}
                <View
                  style={s.formRow}
                  accessibilityLabel={`Forme sur les ${teamStats.form.length} derniers matchs : ${teamStats.form
                    .map(r => (r === 'W' ? 'victoire' : r === 'D' ? 'nul' : 'défaite'))
                    .join(', ')}`}
                >
                  {teamStats.form.map((r, i) => (
                    <View
                      key={i}
                      style={[
                        s.formBadge,
                        {
                          backgroundColor:
                            r === 'W' ? c.positive.fill : r === 'D' ? c.warning.fill : c.negative.fill,
                        },
                      ]}
                    >
                      <Text variant="caption" weight="700" color={c.text.onFill}>
                        {r === 'W' ? 'V' : r === 'D' ? 'N' : 'D'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* W / D / L + buts */}
          <View style={s.recordBar}>
            <RecordPill value={teamStats.wins}   label="Victoires" color={c.positive.default} labelColor={bp.onBrandMuted} />
            <View style={[s.recordSep, { backgroundColor: bp.onBrandBorder }]} />
            <RecordPill value={teamStats.draws}  label="Nuls"      color={c.warning.default} labelColor={bp.onBrandMuted} />
            <View style={[s.recordSep, { backgroundColor: bp.onBrandBorder }]} />
            <RecordPill value={teamStats.losses} label="Défaites"  color={c.negative.default} labelColor={bp.onBrandMuted} />
            <View style={[s.recordSep, { backgroundColor: bp.onBrandBorder }]} />
            <View style={s.goalsBlock}>
              <Text variant="title" numeric>
                <Text variant="title" color={c.positive.default}>{teamStats.goalsFor}</Text>
                <Text variant="title" color={bp.onBrandMuted}> – </Text>
                <Text variant="title" color={c.negative.default}>{teamStats.goalsAgainst}</Text>
              </Text>
              <Text variant="caption" color={bp.onBrandMuted}>
                Buts pour / contre
              </Text>
            </View>
          </View>
        </View>

        {/* ── Filters ── */}
        <View style={[s.filtersBlock, { backgroundColor: c.bg.surface, borderBottomColor: c.border.subtle }]}>
          <FilterRow
            label="Lieu"
            options={LOCATION_FILTERS as unknown as string[]}
            active={filterLoc}
            onSelect={setFilterLoc}
            allLabel="Tous"
          />
          <FilterRow
            label="Compétition"
            options={COMPETITION_FILTERS as unknown as string[]}
            active={filterComp}
            onSelect={setFilterComp}
            allLabel="Toutes"
          />
        </View>

        {matches.length === 0 ? (
          <View style={[s.emptyBlock, { backgroundColor: c.bg.surface, borderColor: c.border.subtle }]}>
            <EmptyState
              icon="analytics-outline"
              title="Aucun match enregistré"
              description="Créez un match dans le Calendrier, puis suivez-le en direct pour générer des statistiques."
              compact
            />
          </View>
        ) : (
          <>
            {/* ── Main tabs ── */}
            <View
              style={[s.mainTabBar, { backgroundColor: c.bg.sunken }]}
              accessibilityRole="tablist"
            >
              {(
                [
                  { key: 'overview', label: "Vue d'ensemble", icon: 'bar-chart-outline' },
                  { key: 'stats',    label: 'Stats détaillées', icon: 'grid-outline' },
                  { key: 'coach',    label: 'Coach IA',         icon: 'sparkles-outline' },
                ] as const
              ).map(tab => {
                const active = activeTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => {
                      if (active) return;
                      haptics.select();
                      setActiveTab(tab.key);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={tab.label}
                    style={[
                      s.mainTabItem,
                      active && { backgroundColor: c.bg.surface, borderColor: c.border.subtle },
                    ]}
                  >
                    <Ionicons
                      name={tab.icon}
                      size={15}
                      color={active ? c.accent.default : c.text.secondary}
                    />
                    <Text variant="caption" weight="600" tone={active ? 'accent' : 'secondary'}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ── Tab: Vue d'ensemble ── */}
            {activeTab === 'overview' && (
              <>
                <SectionHeader label="Vue d'ensemble" />
                <View style={[s.kpiGrid, { paddingHorizontal: 14 }]}>
                  {KPI_ITEMS.map(k => (
                    <Card
                      key={k.label}
                      padding="sm"
                      style={[s.kpiCard, { width: `${100 / kpiCols - 2}%` as never }]}
                    >
                      <View style={[s.kpiIconBox, { backgroundColor: c.bg.sunken }]}>
                        <Ionicons name={k.icon} size={15} color={k.color} />
                      </View>
                      {/* `Stat` porte la règle « le chiffre est le héros » :
                          valeur en grand, libellé en casse normale à 12 px.
                          C'était l'inverse ici — libellé à 9 px en capitales. */}
                      <Stat
                        value={String(k.value)}
                        label={k.label}
                        size="compact"
                        valueColor={k.color}
                      />
                    </Card>
                  ))}
                </View>

                {goalsByType.some(g => g.scored > 0 || g.conceded > 0) && (
                  <>
                    <SectionHeader label="Buts par type" />
                    <View style={s.goalsTypeBlock}>
                      {(
                        [
                          { title: 'Buts marqués',   ramp: c.positive, pick: (g: typeof goalsByType[number]) => g.scored },
                          { title: 'Buts encaissés', ramp: c.negative, pick: (g: typeof goalsByType[number]) => g.conceded },
                        ] as const
                      ).map(block => (
                        <Card key={block.title} style={s.goalsTypeCard}>
                          <Text variant="headline" color={block.ramp.default}>
                            {block.title}
                          </Text>
                          {goalsByType.map(g => {
                            const value = block.pick(g);
                            return (
                              <View
                                key={g.key}
                                style={s.goalsTypeRow}
                                accessibilityLabel={`${g.label} : ${value}`}
                              >
                                <View style={s.goalsTypeRowTop}>
                                  <Text variant="callout" tone="secondary">
                                    {g.label}
                                  </Text>
                                  <Text variant="headline" color={block.ramp.default} numeric>
                                    {value}
                                  </Text>
                                </View>
                                <View style={[s.progressBg, { backgroundColor: c.bg.sunken }]}>
                                  <View
                                    style={[
                                      s.progressFill,
                                      {
                                        width: `${(value / maxGoalsByType) * 100}%` as never,
                                        backgroundColor: block.ramp.default,
                                      },
                                    ]}
                                  />
                                </View>
                              </View>
                            );
                          })}
                        </Card>
                      ))}
                    </View>
                  </>
                )}

                {playerStatsList.length > 0 && (
                  <>
                    <SectionHeader label="Meilleurs joueurs" />
                    <View style={[s.topsRow, isTablet && s.topsRowTablet]}>
                      {tops.ratings.length > 0 && (
                        <TopList
                          title="Meilleures notes" icon="star" color={series[0]}
                          items={tops.ratings.map(p => ({
                            name: abbrevName(p.playerName),
                            value: (p.avgRating as number).toFixed(1),
                            valueColor: ratingColor(theme, p.avgRating as number),
                          }))}
                        />
                      )}
                      <TopList
                        title="Buteurs" icon="football" color={series[1]}
                        items={tops.scorers.map(p => ({ name: abbrevName(p.playerName), value: String(p.goals) }))}
                      />
                      {tops.assists.length > 0 && (
                        <TopList
                          title="Passes déc." icon="share-social" color={series[2]}
                          items={tops.assists.map(p => ({ name: abbrevName(p.playerName), value: String(p.assist) }))}
                        />
                      )}
                      <TopList
                        title="Récupérations" icon="refresh" color={series[3]}
                        items={tops.recoveries.map(p => ({ name: abbrevName(p.playerName), value: String(p.recovery) }))}
                      />
                      <TopList
                        title="+/- Buts" icon="trending-up" color={series[4]}
                        items={tops.plusMinus.map(p => ({
                          name: abbrevName(p.playerName),
                          value: p.plusMinusGoals > 0 ? `+${p.plusMinusGoals}` : String(p.plusMinusGoals),
                        }))}
                      />
                      {tops.shooterEff.length > 0 && (
                        <TopList
                          title="Efficacité au tir" icon="locate" color={series[5]}
                          items={tops.shooterEff.map(p => ({
                            name: abbrevName(p.playerName),
                            value: `${p.shotEff}%`,
                            sub: `${p.goals}B/${p.totalShotsAll}T`,
                            valueColor:
                              p.shotEff >= 40
                                ? c.positive.default
                                : p.shotEff >= 20
                                  ? c.warning.default
                                  : c.negative.default,
                          }))}
                        />
                      )}
                    </View>
                  </>
                )}

                <SectionHeader label="Moments du match" />
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
                <SectionHeader label="Statistiques joueurs" />
                <PlayerStatsPanel
                  rows={playerStatsList}
                  emptyDescription={
                    filteredMatchIds.size === 0
                      ? 'Aucun match ne correspond aux filtres.'
                      : 'Aucun match enregistré avec le Tracker.'
                  }
                />
                <ComboRankingTable allStats={allComboStats} playerById={playerByIdForRanking} />
              </>
            )}

            {/* ── Tab: AI Coach Adjoint ── */}
            {activeTab === 'coach' && (
              <>
                {(insights.length > 0 || comboInsightCards.length > 0) ? (
                  <>
                    <View style={s.coachHeader} accessibilityRole="header">
                      <View style={[s.secAccent, { backgroundColor: c.accent.default }]} />
                      <Text variant="caption" tone="secondary" weight="700">
                        Analyse du coach adjoint
                      </Text>
                      <View
                        style={[s.algoBadge, { backgroundColor: c.accent.subtle, borderColor: c.accent.border }]}
                      >
                        <Text variant="caption" weight="700" tone="accent">
                          Algo
                        </Text>
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
                          <View style={[s.comboDividerLine, { backgroundColor: c.border.subtle }]} />
                          <Text variant="caption" tone="accent" weight="700">
                            Combinaisons — résumé
                          </Text>
                          <View style={[s.comboDividerLine, { backgroundColor: c.border.subtle }]} />
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
                  <View style={[s.emptyBlock, { backgroundColor: c.bg.surface, borderColor: c.border.subtle }]}>
                    <EmptyState
                      icon="sparkles-outline"
                      title="Pas assez de données"
                      description="Suivez davantage de matchs en direct pour que le coach adjoint puisse générer des analyses."
                      compact
                    />
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

function SectionHeader({ label, tone = 'accent' }: { label: string; tone?: 'accent' | 'warning' }) {
  const s = useStyles();
  const { theme } = useTheme();
  return (
    <View style={s.secHeader} accessibilityRole="header">
      <View
        style={[
          s.secAccent,
          { backgroundColor: tone === 'warning' ? theme.colors.warning.default : theme.colors.accent.default },
        ]}
      />
      {/* Était en capitales espacées à 10 px. L'échelle typographique proscrit
          les deux : la casse normale se lit plus vite, et 12 px est le plancher. */}
      <Text variant="caption" tone="secondary" weight="700">
        {label}
      </Text>
    </View>
  );
}

function RecordPill({
  value, label, color, labelColor,
}: {
  value: number; label: string; color: string; labelColor: string;
}) {
  const s = useStyles();
  return (
    <View style={s.recPill} accessibilityLabel={`${value} ${label}`}>
      <Text variant="display" color={color} numeric>
        {value}
      </Text>
      <Text variant="caption" color={labelColor}>
        {label}
      </Text>
    </View>
  );
}

function FilterRow({
  label, options, active, onSelect, allLabel,
}: {
  label: string; options: string[]; active: string;
  onSelect: (v: string) => void; allLabel: string;
}) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={s.filterRow} accessibilityRole="radiogroup" accessibilityLabel={`Filtrer par ${label}`}>
      <Text variant="caption" tone="tertiary" weight="600" style={s.filterTitle}>
        {label}
      </Text>
      <View style={s.filterChips}>
        {options.map(v => {
          const isActive = active === v;
          const chipLabel = v === 'all' ? allLabel : v;
          return (
            <Pressable
              key={v}
              onPress={() => { haptics.select(); onSelect(v); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive, checked: isActive }}
              accessibilityLabel={chipLabel}
              style={({ pressed }) => [
                s.fChip,
                {
                  backgroundColor: isActive ? c.accent.subtle : c.bg.sunken,
                  borderColor: isActive ? c.accent.default : c.border.subtle,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text variant="caption" tone={isActive ? 'accent' : 'secondary'} weight="600">
                {chipLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Couleur de rang. L'or / argent / bronze d'origine (`#f59e0b` / `#94a3b8` /
 * `#b45309`) tenait 2,5:1 pour l'argent : illisible. Le rang se lit d'abord
 * dans l'ordre des lignes — seul le premier est mis en avant, le reste est
 * secondaire.
 */
function rankTone(index: number): 'warning' | 'tertiary' {
  return index === 0 ? 'warning' : 'tertiary';
}

function TopList({
  title, icon, color, items,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  items: { name: string; value: string; sub?: string; valueColor?: string }[];
}) {
  const s = useStyles();
  const { theme } = useTheme();
  return (
    <Card style={s.topCard}>
      <View style={s.topHeader}>
        <View style={[s.topIconBox, { backgroundColor: theme.colors.accent.subtle }]}>
          <Ionicons name={icon} size={13} color={color} />
        </View>
        <Text variant="caption" weight="700" color={color}>
          {title}
        </Text>
      </View>
      {items.length === 0 ? (
        <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
          Pas encore de données
        </Text>
      ) : (
        items.map((item, i) => (
          <View
            key={i}
            style={[s.topRow, { borderTopColor: theme.colors.border.subtle }, i === 0 && s.topRowFirst]}
          >
            <Text variant="caption" weight="700" tone={rankTone(i)} style={s.topRank} numeric>
              {i + 1}
            </Text>
            <Text variant="callout" style={s.topName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.sub ? (
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {item.sub}
              </Text>
            ) : null}
            <Text variant="headline" color={item.valueColor ?? color} numeric>
              {item.value}
            </Text>
          </View>
        ))
      )}
    </Card>
  );
}

/**
 * Habillage d'une carte d'analyse. Les quatre niveaux passent sur la rampe
 * sémantique : le pôle positif était en vert `#16a34a`, que la deutéranopie
 * confond avec le rouge d'alerte — soit précisément les deux niveaux qu'il faut
 * distinguer. Le tag texte (« Point fort », « Alerte ») porte de toute façon
 * l'information, la couleur ne fait que la doubler.
 */
function insightTone(level: InsightLevel, c: ThemeColors) {
  switch (level) {
    case 'positive': return { ramp: c.positive, tag: 'Point fort' as const };
    case 'warning':  return { ramp: c.warning,  tag: 'Attention' as const };
    case 'alert':    return { ramp: c.negative, tag: 'Alerte' as const };
    default:         return { ramp: { default: c.accent.default, subtle: c.accent.subtle }, tag: 'Observation' as const };
  }
}

function CoachInsightCard({ insight }: { insight: Insight }) {
  const s = useStyles();
  const { theme } = useTheme();
  const { ramp, tag } = insightTone(insight.level, theme.colors);
  return (
    <View
      style={[s.insightCard, { backgroundColor: ramp.subtle, borderColor: ramp.default }]}
      accessibilityLabel={`${tag}. ${insight.title}. ${insight.body}`}
    >
      <Ionicons name={insight.icon} size={20} color={ramp.default} style={s.insightIcon} />
      <View style={s.flex1}>
        <View style={s.insightTagRow}>
          <View style={[s.insightTag, { borderColor: ramp.default }]}>
            <Text variant="caption" weight="700" color={ramp.default}>
              {tag}
            </Text>
          </View>
          <Text variant="callout" weight="700" style={s.flex1} numberOfLines={2}>
            {insight.title}
          </Text>
        </View>
        <Text variant="callout" tone="secondary">
          {insight.body}
        </Text>
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
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  const [activeSize, setActiveSize] = useState<2 | 3 | 4>(3);
  const [sortKey, setSortKey]       = useState<ComboSortKey>('pmGoalsPerMin');
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: ComboSortKey) => {
    haptics.select();
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const getName = (id: string) => {
    const p = playerById.get(id);
    return p ? abbrevName(`${p.first_name} ${p.last_name}`) : id.slice(0, 6);
  };

  const combosFor = (size: 2 | 3 | 4) =>
    Array.from(allStats.values())
      .filter(x => x.playerIds.length === size && x.sharedTimeSec >= MIN_COMBO_SEC);

  const SIZES: { size: 2 | 3 | 4; label: string }[] = [
    { size: 4, label: 'Lignes' },
    { size: 3, label: 'Trios' },
    { size: 2, label: 'Duos' },
  ];

  const hasAny = SIZES.some(x => combosFor(x.size).length > 0);
  if (!hasAny) return null;

  const dir  = sortDir === 'asc' ? 1 : -1;
  const rows = combosFor(activeSize)
    .sort((a, b) => dir * ((a[sortKey] as number) - (b[sortKey] as number)))
    .slice(0, 10);

  const fmtPm     = (v: number) => `${v > 0 ? '+' : ''}${v}`;
  const fmtPerMin = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`;

  const SortTh = ({ label, sk, flex, left }: { label: string; sk?: ComboSortKey; flex?: number; left?: boolean }) => {
    const active = sk === sortKey;
    return (
      <Pressable
        style={[s.crThCell, flex ? { flex } : undefined]}
        onPress={() => sk && handleSort(sk)}
        disabled={!sk}
        accessibilityRole={sk ? 'button' : undefined}
        accessibilityLabel={
          sk
            ? active
              ? `${label}, trié ${sortDir === 'asc' ? 'par ordre croissant' : 'par ordre décroissant'}`
              : `${label}, trier`
            : label
        }
      >
        <Text
          variant="tableHeader"
          tone={active ? 'accent' : 'tertiary'}
          style={left ? undefined : { textAlign: 'center' }}
        >
          {label}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      <SectionHeader label="Classement des combinaisons" tone="warning" />

      <View style={[s.crCard, { backgroundColor: c.bg.surface, borderColor: c.border.subtle }]}>
        <View style={[s.crTabs, { borderBottomColor: c.border.subtle }]} accessibilityRole="tablist">
          {SIZES.map(x => {
            const count = combosFor(x.size).length;
            const active = activeSize === x.size;
            return (
              <Pressable
                key={x.size}
                onPress={() => { haptics.select(); setActiveSize(x.size); }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${x.label}, ${count} combinaison${count > 1 ? 's' : ''}`}
                style={[
                  s.crTab,
                  {
                    backgroundColor: active ? c.accent.subtle : c.bg.sunken,
                    borderColor: active ? c.accent.default : c.border.subtle,
                  },
                ]}
              >
                <Text variant="caption" weight="600" tone={active ? 'accent' : 'secondary'}>
                  {x.label}{count > 0 ? ` (${count})` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {rows.length === 0 ? (
          <Text variant="callout" tone="tertiary" style={s.crEmpty}>
            Pas assez de données — min. 5 min ensemble.
          </Text>
        ) : (
          <>
            <View style={[s.crThead, { backgroundColor: c.bg.sunken, borderBottomColor: c.border.subtle }]}>
              <View style={{ width: 20, marginRight: 4 }} />
              <SortTh label="Joueurs" flex={2} left />
              <SortTh label="Tps"    sk="sharedTimeSec" />
              <SortTh label="+/-B"   sk="pmGoals" />
              <SortTh label="+/-T"   sk="pmShots" />
              <SortTh label="B/min"  sk="pmGoalsPerMin" />
              <SortTh label="T/min"  sk="pmShotsPerMin" />
            </View>

            {rows.map((combo, i) => (
              <View
                key={combo.playerIds.join('|')}
                style={[
                  s.crRow,
                  { borderBottomColor: c.border.subtle },
                  i % 2 === 1 && { backgroundColor: c.bg.stripe },
                ]}
              >
                <Text variant="caption" weight="700" tone={rankTone(i)} style={s.crRank} numeric>
                  {i + 1}
                </Text>
                <View style={s.crNameCol}>
                  {combo.playerIds.map(pid => (
                    <Text key={pid} variant="caption" numberOfLines={1}>
                      {getName(pid)}
                    </Text>
                  ))}
                </View>
                <Text
                  variant="tableCell"
                  tone={sortKey === 'sharedTimeSec' ? 'accent' : 'secondary'}
                  style={s.crCell}
                >
                  {fmtTime(combo.sharedTimeSec)}
                </Text>
                <Text variant="tableCell" color={deltaColor(theme, combo.pmGoals)} style={s.crCell}>
                  {fmtPm(combo.pmGoals)}
                </Text>
                <Text variant="tableCell" color={deltaColor(theme, combo.pmShots)} style={s.crCell}>
                  {fmtPm(combo.pmShots)}
                </Text>
                <Text variant="tableCell" color={deltaColor(theme, combo.pmGoalsPerMin)} style={s.crCell}>
                  {fmtPerMin(combo.pmGoalsPerMin)}
                </Text>
                <Text variant="tableCell" color={deltaColor(theme, combo.pmShotsPerMin)} style={s.crCell}>
                  {fmtPerMin(combo.pmShotsPerMin)}
                </Text>
              </View>
            ))}

            <Text variant="caption" tone="tertiary" style={[s.crLegend, { borderTopColor: c.border.subtle }]}>
              B/min = buts par minute · T/min = tirs par minute · min. 5 min ensemble · gardien exclu
            </Text>
          </>
        )}
      </View>
    </>
  );
}


// ─── Styles ───────────────────────────────────────────────────────────────────
//
// Quatre `StyleSheet` figés cohabitaient ici (`s`, `cr`, `css`, `ss`), pour
// 167 valeurs de couleur en dur. Ils sont ramenés à un seul `makeStyles`, donc
// dérivé du thème.
//
// Trois problèmes de fond réglés au passage, au-delà du remapping :
//
// 1. **Le plancher typographique.** L'écran descendait à 8 px sur dix-huit
//    styles distincts (libellés de KPI, en-têtes de colonne, légendes, tag des
//    cartes d'analyse). L'échelle s'arrête à 12 px, et c'est le seul écran de
//    l'app qui passait sous cette limite.
// 2. **Le sixième bleu.** `#2563eb` servait d'accent local — onglets actifs,
//    puces de filtre, colonne triée — sans être aucun des cinq autres bleus de
//    l'inventaire, ni l'accent du système.
// 3. **Seize clés mortes** (`tableWrap`, `thCell`, `td`, `viewTab`…), restes du
//    tableau de statistiques parti dans `PlayerStatsPanel`. Supprimées.

const useStyles = makeStyles((t) => ({
  flex1: { flex: 1 },
  root: { flex: 1, backgroundColor: t.colors.bg.canvas },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: t.space.xxxl },

  // ── Bandeau de marque ────────────────────────────────────────────────────
  // Même aplat que la fiche joueur (`fmPalette.brand`) : c'était un cinquième
  // bleu nuit, proche mais distinct, sur deux écrans qui se ressemblent.
  hero: {
    paddingHorizontal: t.space.xl,
    paddingTop: t.space.xl,
    paddingBottom: t.space.lg,
    gap: t.space.lg,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.md },

  formBlock: { alignItems: 'flex-end', gap: t.space.xs },
  formRow: { flexDirection: 'row', gap: 3 },
  formBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: t.radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },

  recordBar: { flexDirection: 'row', alignItems: 'center' },
  recordSep: { width: 1, height: 24, marginHorizontal: t.space.lg },

  goalsBlock: { gap: 1 },

  // ── Filtres ──────────────────────────────────────────────────────────────
  filtersBlock: {
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.md,
    borderBottomWidth: 1,
    gap: t.space.sm,
  },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  filterTitle: { minWidth: 76 },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, flex: 1 },
  fChip: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: t.space.md,
    paddingVertical: t.space.xs,
    borderRadius: t.radius.sm,
    borderWidth: 1,
  },

  // ── Onglets ──────────────────────────────────────────────────────────────
  mainTabBar: {
    flexDirection: 'row',
    marginHorizontal: t.space.lg,
    marginTop: t.space.sm,
    marginBottom: t.space.xs,
    borderRadius: t.radius.md,
    padding: 3,
    gap: 2,
  },
  mainTabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    minHeight: 40,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },

  // ── KPI ──────────────────────────────────────────────────────────────────
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: t.space.xs },
  kpiCard: {
    borderRadius: t.radius.md,
    padding: t.space.md,
    margin: '1%' as never,
    gap: 3,
  },
  kpiIconBox: {
    width: 26,
    height: 26,
    borderRadius: t.radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },

  emptyBlock: {
    margin: t.space.lg,
    padding: t.space.xxl,
    borderRadius: t.radius.md,
    alignItems: 'center',
    gap: t.space.sm,
    borderWidth: 1,
  },

  // ── Analyses du coach ────────────────────────────────────────────────────
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.lg,
    paddingBottom: t.space.md,
  },
  algoBadge: {
    borderRadius: t.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  insightsBlock: { paddingHorizontal: t.space.lg, gap: t.space.sm },

  comboDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.space.lg,
    marginTop: t.space.lg,
    marginBottom: t.space.sm,
    gap: t.space.sm,
  },
  comboDividerLine: { flex: 1, height: 1 },

  // ── Buts par type ────────────────────────────────────────────────────────
  goalsTypeBlock: { paddingHorizontal: t.space.lg, gap: t.space.sm },
  goalsTypeCard: { gap: t.space.md },
  goalsTypeRow: { gap: t.space.xs },
  goalsTypeRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },

  // ── Meilleurs joueurs ────────────────────────────────────────────────────
  topsRow: { paddingHorizontal: t.space.lg, gap: t.space.sm },
  topsRowTablet: { flexDirection: 'row' },
  topCard: { flex: 1, gap: t.space.sm, marginBottom: t.space.xs },
  topHeader: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  topIconBox: {
    width: 24,
    height: 24,
    borderRadius: t.radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    minHeight: 32,
    paddingVertical: 5,
    borderTopWidth: 1,
  },
  topRowFirst: { borderTopWidth: 0 },
  topRank: { width: 16, textAlign: 'center' },
  topName: { flex: 1 },

  // ── En-tête de section ───────────────────────────────────────────────────
  secHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.lg,
    paddingBottom: t.space.md,
  },
  secAccent: { width: 3, height: 14, borderRadius: 2 },

  recPill: { alignItems: 'center', gap: 1 },

  // ── Carte d'analyse ──────────────────────────────────────────────────────
  insightCard: {
    flexDirection: 'row',
    gap: t.space.md,
    borderRadius: t.radius.md,
    padding: t.space.md,
    borderWidth: 1,
    marginBottom: t.space.xs,
  },
  insightIcon: { fontSize: 18, lineHeight: 22, flexShrink: 0 },
  insightTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    marginBottom: t.space.xs,
    flexWrap: 'wrap',
  },
  insightTag: { borderRadius: t.radius.sm, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },

  // ── Classement des combinaisons ──────────────────────────────────────────
  crCard: { marginHorizontal: t.space.lg, borderRadius: t.radius.md, borderWidth: 1, overflow: 'hidden', marginBottom: t.space.sm },
  crTabs: { flexDirection: 'row', padding: t.space.md, gap: 6, borderBottomWidth: 1 },
  crTab: {
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: t.radius.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  crEmpty: { padding: t.space.xl, textAlign: 'center' },
  crThead: {
    flexDirection: 'row',
    paddingVertical: t.space.sm,
    paddingHorizontal: t.space.md,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  crThCell: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  crRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: t.space.md,
    alignItems: 'flex-start',
    borderBottomWidth: 1,
  },
  crRank: { width: 16, textAlign: 'center', paddingTop: 2, marginRight: t.space.xs },
  crNameCol: { flex: 2, paddingRight: t.space.xs, gap: 1 },
  crCell: { flex: 1, textAlign: 'center', paddingTop: 2 },
  crLegend: { padding: t.space.sm, paddingHorizontal: t.space.md, borderTopWidth: 1 },
}));
