/**
 * Agrégation des événements de match — miroir exact de
 * mobile/components/analytics/aggregate.ts. Mêmes calculs, même comportement,
 * y compris la sous-estimation connue de `totalShots` (voir sa doc ci-dessous) :
 * ce n'est pas corrigé ici, le problème est en amont dans ce que le tracker
 * écrit en base.
 */

import type { Match, MatchEvent, Player } from '@/types';
import type { PlayerStats } from './playerStats';

export function computePlayingTime(events: MatchEvent[]): Map<string, number> {
  const byPlayer = new Map<string, number>();

  const processHalf = (evs: MatchEvent[]) => {
    if (!evs.length) return;
    const maxT = Math.max(...evs.map((e) => e.match_time_seconds));

    evs.forEach((ev, i) => {
      const nextT = i + 1 < evs.length ? evs[i + 1].match_time_seconds : maxT;
      const dur = nextT - ev.match_time_seconds;
      if (dur <= 0) return;
      if (Array.isArray(ev.players_on_field)) {
        ev.players_on_field.forEach((pid) =>
          byPlayer.set(pid, (byPlayer.get(pid) ?? 0) + dur)
        );
      }
    });

    const first = evs[0];
    if (first.match_time_seconds > 0 && Array.isArray(first.players_on_field)) {
      first.players_on_field.forEach((pid) =>
        byPlayer.set(pid, (byPlayer.get(pid) ?? 0) + first.match_time_seconds)
      );
    }
  };

  const byTime = (a: MatchEvent, b: MatchEvent) => a.match_time_seconds - b.match_time_seconds;

  processHalf(events.filter((e) => e.half === 1).sort(byTime));
  processHalf(events.filter((e) => e.half === 2).sort(byTime));
  return byPlayer;
}

type MatchPlayerRow = {
  id: string;
  time_played?: number;
  goals?: number;
  assists?: number;
  yellow_cards?: number;
  red_cards?: number;
};

export function parseMatchPlayers(m: Match | undefined): MatchPlayerRow[] {
  if (!m?.players) return [];
  const raw = m.players;
  if (Array.isArray(raw)) return raw as unknown as MatchPlayerRow[];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? (arr as MatchPlayerRow[]) : [];
  } catch {
    return [];
  }
}

export interface BuildPlayerStatsInput {
  eventsByMatch: Record<string, MatchEvent[]>;
  matches: Match[];
  filteredMatchIds: Set<string>;
  players: Player[];
  clubPlayerIds: Set<string>;
  avgRatingByPlayer?: Map<string, number>;
}

export function buildPlayerStats({
  eventsByMatch,
  matches,
  filteredMatchIds,
  players,
  clubPlayerIds,
  avgRatingByPlayer,
}: BuildPlayerStatsInput): PlayerStats[] {
  const map = new Map<string, PlayerStats>();
  const byId = new Map(players.map((p) => [p.id, p]));

  const ensure = (id: string): PlayerStats => {
    let cur = map.get(id);
    if (!cur) {
      const p = byId.get(id);
      cur = {
        playerId: id,
        playerName: p ? `${p.first_name} ${p.last_name}` : id.slice(0, 8),
        matchesPlayed: 0,
        goals: 0,
        shot_on_target: 0,
        shot: 0,
        ball_loss: 0,
        recovery: 0,
        assist: 0,
        yellow_cards: 0,
        red_cards: 0,
        plusMinusGoals: 0,
        plusMinusShots: 0,
        totalTimeSeconds: 0,
        avgRating: null,
      };
      map.set(id, cur);
    }
    return cur;
  };

  Object.entries(eventsByMatch).forEach(([matchId, events]) => {
    if (!filteredMatchIds.has(matchId)) return;

    if (events.length === 0) {
      // Match jamais suivi en direct (aucun match_events) : les buts, passes
      // décisives et cartons saisis à la main dans le calendrier
      // (matches.players) sont la seule donnée disponible pour ce match. Sans
      // ce repli, un match entièrement saisi à la main contribuerait zéro aux
      // stats, alors que la saisie existe bel et bien.
      parseMatchPlayers(matches.find((m) => m.id === matchId)).forEach((p) => {
        if (!p.id) return;
        const cur = ensure(p.id);
        cur.goals += p.goals ?? 0;
        cur.assist += p.assists ?? 0;
        cur.yellow_cards += p.yellow_cards ?? 0;
        cur.red_cards += p.red_cards ?? 0;
      });
      return;
    }

    events.forEach((ev) => {
      if (ev.player_id) {
        const cur = ensure(ev.player_id);
        switch (ev.event_type) {
          case 'goal':           cur.goals++; break;
          case 'shot_on_target': cur.shot_on_target++; break;
          case 'shot':           cur.shot++; break;
          case 'ball_loss':      cur.ball_loss++; break;
          case 'recovery':       cur.recovery++; break;
          case 'assist':         cur.assist++; break;
          case 'yellow_card':    cur.yellow_cards++; break;
          case 'red_card':       cur.red_cards++; break;
          default: break;
        }
      }

      if (Array.isArray(ev.players_on_field)) {
        ev.players_on_field.forEach((pid) => {
          const cur = ensure(pid);
          switch (ev.event_type) {
            case 'goal':                       cur.plusMinusGoals++; break;
            case 'opponent_goal':              cur.plusMinusGoals--; break;
            case 'shot':
            case 'shot_on_target':             cur.plusMinusShots++; break;
            case 'opponent_shot':
            case 'opponent_shot_on_target':    cur.plusMinusShots--; break;
            default: break;
          }
        });
      }
    });
  });

  Object.entries(eventsByMatch).forEach(([matchId, events]) => {
    if (!filteredMatchIds.has(matchId)) return;

    const sheet = parseMatchPlayers(matches.find((m) => m.id === matchId));

    if (events.length === 0) {
      // Idem : aucune mesure de temps de jeu possible sans événements, mais le
      // joueur a bien participé — compté dans matchesPlayed, pas dans le temps
      // de jeu (qui reste réservé aux matchs suivis en direct).
      sheet.forEach((p) => {
        if (!p.id) return;
        ensure(p.id).matchesPlayed++;
      });
      return;
    }

    const fromSheet = new Map(
      sheet
        .filter((p) => (p.time_played ?? 0) > 0)
        .map((p) => [p.id, p.time_played as number])
    );

    const timeMap = fromSheet.size > 0 ? fromSheet : computePlayingTime(events);
    timeMap.forEach((sec, pid) => {
      const cur = ensure(pid);
      cur.totalTimeSeconds += sec;
      cur.matchesPlayed++;
    });
  });

  return Array.from(map.values())
    .filter((s) => clubPlayerIds.has(s.playerId))
    .map((s) => ({
      ...s,
      avgRating: avgRatingByPlayer?.get(s.playerId) ?? null,
    }));
}

/**
 * Tirs tentés par un joueur — sous-estimé pour les matchs saisis par le
 * match recorder web (voir mobile/components/analytics/aggregate.ts pour le
 * détail). Non corrigé volontairement : le problème est dans ce que le
 * recorder écrit en base, pas dans ce calcul.
 */
export function totalShots(row: Pick<PlayerStats, 'shot' | 'shot_on_target'>): number {
  return row.shot + row.shot_on_target;
}

export interface PlayingTimeByMatchPoint {
  matchId: string;
  label: string;
  seconds: number;
}

/**
 * Temps de jeu d'un joueur, détaillé match par match — même résolution que
 * `buildPlayerStats` (feuille `time_played` en priorité, sinon reconstruction
 * depuis les events), mais sans accumuler : un point par match, pour tracer
 * une évolution. Un match sans `match_events` (jamais suivi au tracker) n'a
 * pas de temps mesurable et n'apparaît pas dans la série.
 */
export function computePlayingTimeByMatch(
  playerId: string,
  matches: Match[],
  eventsByMatch: Record<string, MatchEvent[]>,
  filteredMatchIds: Set<string>,
): PlayingTimeByMatchPoint[] {
  return matches
    .filter((m) => filteredMatchIds.has(m.id))
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((m): PlayingTimeByMatchPoint | null => {
      const events = eventsByMatch[m.id] ?? [];
      if (events.length === 0) return null;

      const fromSheet = new Map(
        parseMatchPlayers(m)
          .filter((p) => (p.time_played ?? 0) > 0)
          .map((p) => [p.id, p.time_played as number])
      );
      const timeMap = fromSheet.size > 0 ? fromSheet : computePlayingTime(events);
      const seconds = timeMap.get(playerId);
      if (!seconds) return null;

      return {
        matchId: m.id,
        label: new Date(String(m.date)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' }),
        seconds,
      };
    })
    .filter((p): p is PlayingTimeByMatchPoint => p !== null);
}
