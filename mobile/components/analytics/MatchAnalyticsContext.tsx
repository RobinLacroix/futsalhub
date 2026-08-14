/**
 * Données de l'onglet Analyse — chargement unique
 *
 * ## Le problème que ça règle
 *
 * `app/(tabs)/analyse.tsx` monte ses trois vues **en permanence** et masque
 * celles qui ne sont pas actives (`Pane`, en `absoluteFill` + opacité), pour
 * qu'un changement de segment garde le scroll, les filtres et les données sans
 * refetch. C'est le bon choix d'ergonomie, mais il a un corollaire : **les trois
 * vues chargent au montage, ensemble.**
 *
 * Or `AnalyticsView` et `TrackerAnalyticsView` faisaient exactement le même
 * chargement, chacune de son côté :
 *
 * ```
 * getMatchesByTeam(team, saison)          ×2
 * getPlayersByClubWithTeams(club)         ×2
 * getPlayersByTeam(team)                  ×2   ← résultat jamais lu (voir plus bas)
 * getEventsByMatchId(match)               ×2 par match
 * ```
 *
 * Sur une saison à 30 matchs, ouvrir l'onglet Analyse déclenchait donc **66
 * requêtes au lieu de 33**, dont 60 en N+1 sur les événements. Au bord d'un
 * terrain, en 4G, c'est la différence entre un écran qui s'affiche et un écran
 * qui « rame ».
 *
 * ## Les deux requêtes mortes
 *
 * `getPlayersByTeam` était appelée par les deux vues et lue par **aucune** :
 * `AnalyticsView` en jetait le résultat par un trou de tableau
 * (`const [matchData, , clubData] = await Promise.all(...)`), et
 * `TrackerAnalyticsView` le rangeait dans un `players` que rien ne relisait.
 * Les deux vues travaillent en réalité sur l'effectif **du club**
 * (`getPlayersByClubWithTeams`), parce qu'un match peut faire jouer un joueur
 * d'une autre équipe du club. L'appel est supprimé.
 *
 * ## Portée
 *
 * Ce provider ne porte que ce qui est **commun et coûteux**. Les filtres
 * (lieu, compétition), le tri et le segment d'affichage restent locaux à chaque
 * vue : ce sont des états d'interface, ils n'ont pas à être partagés, et deux
 * coachs peuvent légitimement vouloir filtrer différemment d'un segment à
 * l'autre.
 *
 * `TeamDashboardView` n'en dépend pas : il lit des entraînements et des retours
 * de questionnaire, pas des événements de match.
 *
 * Note d'architecture : déplacer cette agrégation en RPC / vues Postgres est
 * identifié et **arbitré hors scope** dans `AUDIT_ARCHITECTURE_2026-07.md`. Ce
 * fichier ne fait que cesser de faire le travail deux fois côté client.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';
import { useActiveSeason } from '../../contexts/ActiveSeasonContext';
import { getMatchesByTeam } from '../../lib/services/matches';
import { getEventsByMatchId } from '../../lib/services/matchEvents';
import { getPlayersByClubWithTeams } from '../../lib/services/players';
import { getMatchPlayerRatingsBulk } from '../../lib/services/matchRatings';
import type { Match, MatchEvent, Player, MatchPlayerRatingRow } from '../../types';

export interface MatchAnalyticsData {
  matches: Match[];
  eventsByMatch: Record<string, MatchEvent[]>;
  /** Effectif du club entier : un match peut faire jouer un joueur prêté. */
  clubPlayers: Player[];
  clubPlayerIds: Set<string>;
  /** Notes data par (match, joueur). Vide si le calcul a échoué. */
  ratingRows: MatchPlayerRatingRow[];
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
}

const EMPTY: MatchAnalyticsData = {
  matches: [],
  eventsByMatch: {},
  clubPlayers: [],
  clubPlayerIds: new Set(),
  ratingRows: [],
  loading: true,
  refreshing: false,
  refresh: () => {},
};

const MatchAnalyticsContext = createContext<MatchAnalyticsData>(EMPTY);

export function MatchAnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { activeTeamId, activeTeam } = useActiveTeam();
  const { activeSeason } = useActiveSeason();

  const [matches, setMatches] = useState<Match[]>([]);
  const [eventsByMatch, setEventsByMatch] = useState<Record<string, MatchEvent[]>>({});
  const [clubPlayers, setClubPlayers] = useState<Player[]>([]);
  const [clubPlayerIds, setClubPlayerIds] = useState<Set<string>>(new Set());
  const [ratingRows, setRatingRows] = useState<MatchPlayerRatingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const clubId = activeTeam?.club_id;

  const reset = useCallback(() => {
    setMatches([]);
    setEventsByMatch({});
    setClubPlayers([]);
    setClubPlayerIds(new Set());
    setRatingRows([]);
  }, []);

  const load = useCallback(async () => {
    if (!activeTeamId || !clubId) {
      reset();
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [matchData, clubData] = await Promise.all([
        getMatchesByTeam(activeTeamId, activeSeason),
        getPlayersByClubWithTeams(clubId),
      ]);
      setMatches(matchData);
      setClubPlayers(clubData.map(({ player }) => player));
      setClubPlayerIds(new Set(clubData.map(({ player }) => player.id)));

      const evMap: Record<string, MatchEvent[]> = {};
      await Promise.all(
        matchData.map(async (m) => {
          evMap[m.id] = await getEventsByMatchId(m.id);
        })
      );
      setEventsByMatch(evMap);

      // Les notes sont calculées en RPC. Leur échec ne doit pas vider l'écran :
      // tout le reste de l'analyse reste exploitable sans elles.
      try {
        setRatingRows(await getMatchPlayerRatingsBulk(matchData.map((m) => m.id)));
      } catch {
        setRatingRows([]);
      }
    } catch {
      reset();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTeamId, clubId, activeSeason, reset]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const value = useMemo<MatchAnalyticsData>(
    () => ({
      matches,
      eventsByMatch,
      clubPlayers,
      clubPlayerIds,
      ratingRows,
      loading,
      refreshing,
      refresh,
    }),
    [matches, eventsByMatch, clubPlayers, clubPlayerIds, ratingRows, loading, refreshing, refresh]
  );

  return (
    <MatchAnalyticsContext.Provider value={value}>{children}</MatchAnalyticsContext.Provider>
  );
}

export function useMatchAnalytics(): MatchAnalyticsData {
  return useContext(MatchAnalyticsContext);
}
