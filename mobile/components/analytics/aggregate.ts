/**
 * Agrégation des événements de match — implémentation unique
 *
 * ## Pourquoi ce fichier existe
 *
 * `AnalyticsView` et `TrackerAnalyticsView` sont deux segments du **même
 * onglet** (« Analyse » → Joueurs et Matchs). Chacun reconstruisait de son côté
 * les statistiques joueur à partir des mêmes lignes de `match_events` :
 * ~180 lignes de calcul recopiées, deux fois le même `computePlayingTime`, deux
 * fois le même parcours d'événements.
 *
 * Elles n'avaient pas encore divergé sur les compteurs — vérifié ligne à ligne
 * avant extraction. La seule différence portait sur `matchesPlayed`, absent
 * côté tracker. Le reste était identique, jusqu'aux commentaires. C'est
 * exactement l'état dans lequel étaient les deux match recorders un mois avant
 * de diverger sur le chrono, les fautes et la persistance.
 *
 * ## Équivalence de l'extraction
 *
 * Les deux versions filtraient sur `clubPlayerIds` **en sortie**. `AnalyticsView`
 * filtrait en plus dans sa boucle de temps de jeu, ce qui ne change rien au
 * résultat : les joueurs hors club sont retirés à la fin dans les deux cas. La
 * fonction ci-dessous reprend donc la sémantique d'`AnalyticsView` (surensemble),
 * et le tracker ignore simplement `matchesPlayed` et `avgRating`.
 *
 * ## Ce que ce fichier ne corrige PAS, volontairement
 *
 * Le total de tirs a **quatre définitions** dans l'application, dont deux
 * comptent les buts deux fois (voir `totalShots` plus bas). La cause est en
 * amont, dans ce que les deux recorders écrivent en base — un correctif ici
 * masquerait le problème sans le régler. Aucun chiffre n'est modifié par cette
 * extraction : c'est un déplacement de code, pas un changement de calcul.
 */

import type { Match, MatchEvent, Player } from '../../types';
import type { PlayerStats } from './playerStats';

// ─────────────────────────────────────────────────────────────────────────────
// Temps de jeu
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Temps de jeu par joueur, en secondes, reconstruit depuis les événements.
 *
 * Entre deux événements consécutifs, les joueurs listés dans `players_on_field`
 * du premier sont réputés sur le terrain. Les deux mi-temps sont traitées
 * séparément : leurs horodatages repartent de zéro, les mélanger produirait des
 * durées négatives à la bascule.
 *
 * Le segment initial (de 0 à la première action) est rattrapé à la fin : sans
 * lui, les joueurs qui commencent le match perdent leurs premières minutes.
 */
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

  const byTime = (a: MatchEvent, b: MatchEvent) =>
    a.match_time_seconds - b.match_time_seconds;

  processHalf(events.filter((e) => e.half === 1).sort(byTime));
  processHalf(events.filter((e) => e.half === 2).sort(byTime));
  return byPlayer;
}

/** Temps de jeu saisi sur la feuille de match, quand il existe. */
type MatchPlayerRow = { id: string; time_played?: number };

/**
 * La colonne `matches.players` est tantôt un tableau, tantôt du JSON sérialisé
 * selon l'écran qui l'a écrite. Les deux vues avaient chacune leur parseur
 * tolérant ; il n'y en a plus qu'un.
 */
export function parseMatchPlayers(m: Match | undefined): MatchPlayerRow[] {
  if (!m?.players) return [];
  const raw = m.players;
  if (Array.isArray(raw)) return raw as MatchPlayerRow[];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? (arr as MatchPlayerRow[]) : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Statistiques joueur
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildPlayerStatsInput {
  /** Événements indexés par match. */
  eventsByMatch: Record<string, MatchEvent[]>;
  /** Matchs de la saison, pour retrouver la feuille de match. */
  matches: Match[];
  /** Matchs retenus par les filtres lieu / compétition. */
  filteredMatchIds: Set<string>;
  /** Joueurs du club, pour nommer les lignes. */
  players: Player[];
  /** Restriction finale : un joueur hors club n'apparaît pas. */
  clubPlayerIds: Set<string>;
  /** Note data moyenne par joueur. Absent côté tracker, qui ne l'affiche pas. */
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
        // Un `player_id` inconnu du club reste lisible en debug plutôt que
        // d'afficher « undefined undefined » : il est de toute façon filtré
        // en sortie.
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

  // ── Compteurs d'action, et +/- pour tous les joueurs présents ─────────────

  Object.entries(eventsByMatch).forEach(([matchId, events]) => {
    if (!filteredMatchIds.has(matchId)) return;

    events.forEach((ev) => {
      // `player_id` = auteur de l'action.
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

      // Le +/- se distribue à tous les joueurs sur le terrain à cet instant,
      // auteur de l'action compris.
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

  // ── Temps de jeu et matchs joués ─────────────────────────────────────────
  //
  // La feuille de match fait foi quand elle porte des temps de jeu : c'est la
  // saisie du coach. À défaut, on reconstruit depuis `players_on_field`.
  // `matchesPlayed` se déduit de la même source : un joueur a joué un match
  // s'il y a du temps à lui attribuer dessus.

  Object.entries(eventsByMatch).forEach(([matchId, events]) => {
    if (!filteredMatchIds.has(matchId)) return;

    const sheet = parseMatchPlayers(matches.find((m) => m.id === matchId));
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

// ─────────────────────────────────────────────────────────────────────────────
// Tirs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tirs tentés par un joueur.
 *
 * ## Attention : cette valeur est fausse pour une partie des matchs
 *
 * Un but est nécessairement cadré, donc « tirs totaux » vaut `shot +
 * shot_on_target` **à condition que le but ait écrit son tir cadré**. Or les
 * deux recorders ne se comportent pas pareil :
 *
 * - **mobile** — `PAIRED_EVENT` (`components/recorder/recorderModel.ts`) écrit
 *   deux lignes par but : `goal` **et** `shot_on_target`. Les buts sont donc
 *   déjà dans `shot_on_target`, et cette fonction est juste.
 * - **web** — `app/webapp/tracker/matchrecorder/page.tsx` n'écrit qu'une seule
 *   ligne, de type `goal` ; le compteur de tirs cadrés n'est incrémenté que
 *   dans l'état local de l'écran, jamais persisté. Les buts **manquent** donc
 *   dans `shot_on_target`, et cette fonction les oublie.
 *
 * Les deux populations cohabitent dans `match_events` sans marqueur permettant
 * de les distinguer côté client. Aucune formule ne peut donc être juste pour
 * les deux, et c'est la raison pour laquelle il en existait quatre versions
 * différentes dans l'application :
 *
 * | Emplacement                        | Formule                        |
 * |------------------------------------|--------------------------------|
 * | `playerStats.rawMetric`            | `shot + shot_on_target`        |
 * | tri de `TrackerAnalyticsView`      | `shot + shot_on_target`        |
 * | insights de `AnalyticsView`        | `+ goals` — buts comptés 2×    |
 * | rapport de match                   | `+ score_team` — buts 2×       |
 *
 * Cette fonction retient la première, qui est celle qu'affichent déjà le
 * tableau et le tri — de sorte qu'un chiffre cité dans un texte corresponde à
 * la colonne juste en dessous. **Le fond du problème est en base**, il se règle
 * en amont, pas ici.
 */
export function totalShots(row: Pick<PlayerStats, 'shot' | 'shot_on_target'>): number {
  return row.shot + row.shot_on_target;
}
