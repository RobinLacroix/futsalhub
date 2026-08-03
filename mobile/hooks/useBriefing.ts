/**
 * useBriefing — données de l'écran d'accueil (P0-4)
 *
 * L'accueil était un menu déguisé en dashboard : une grille de six boutons de
 * navigation et zéro donnée, sur le premier écran d'un produit vendu sur le
 * data-driven. Ce hook fournit de quoi en faire un briefing.
 *
 * Contrainte tenue : **rien de nouveau côté backend.** Tout est dérivé des deux
 * requêtes calendrier déjà utilisées ailleurs, plus les compteurs de
 * notifications déjà en contexte. L'écran doit donner l'impression d'être
 * instantané, donc on ne charge pas les événements de match ici.
 *
 * Passe par la couche service, jamais par `supabase` directement (pattern Batch 2).
 */

import { useCallback, useEffect, useState } from 'react';
import { getMatchesForCalendar } from '../lib/services/matches';
import { getTrainingsForCalendar } from '../lib/services/trainings';
import type { Match, Training } from '../types';

export type ResultLetter = 'V' | 'N' | 'D';

/** Prochaine échéance de l'équipe, match ou entraînement. */
export interface NextEvent {
  kind: 'match' | 'training';
  id: string;
  date: Date;
  title: string;
  location: string | null;
  /** Renseigné pour un match seulement. */
  competition?: string | null;
  /** Nombre de jours calendaires d'écart. 0 = aujourd'hui. */
  daysAway: number;
}

export interface TeamForm {
  /** Les 5 derniers résultats, du plus récent au plus ancien. */
  results: ResultLetter[];
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface BriefingData {
  next: NextEvent | null;
  form: TeamForm;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Un match est considéré comme joué s'il est daté dans le passé.
 * Un 0-0 dans le futur est une rencontre programmée, pas un nul.
 */
function isPlayed(m: Match, now: Date): boolean {
  return new Date(m.date).getTime() <= now.getTime();
}

function resultOf(m: Match): ResultLetter {
  if (m.score_team > m.score_opponent) return 'V';
  if (m.score_team < m.score_opponent) return 'D';
  return 'N';
}

/** Écart en jours calendaires, en ignorant l'heure. */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function useBriefing(teamId: string | null, season: string | undefined): BriefingData {
  const [next, setNext] = useState<NextEvent | null>(null);
  const [form, setForm] = useState<TeamForm>({
    results: [], played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) {
      setNext(null);
      setForm({ results: [], played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [matches, trainings] = await Promise.all([
        getMatchesForCalendar(teamId, season),
        getTrainingsForCalendar(teamId, season),
      ]);
      const now = new Date();

      // ── Prochaine échéance : le plus proche entre match et entraînement
      const upcomingMatches = matches
        .filter((m) => !isPlayed(m, now))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const upcomingTrainings = (trainings as Training[])
        .filter((t) => new Date(t.date).getTime() > now.getTime())
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const nm = upcomingMatches[0];
      const nt = upcomingTrainings[0];
      let picked: NextEvent | null = null;

      if (nm && (!nt || new Date(nm.date).getTime() <= new Date(nt.date).getTime())) {
        const d = new Date(nm.date);
        picked = {
          kind: 'match',
          id: nm.id,
          date: d,
          title: nm.title || 'Match',
          location: nm.location || null,
          competition: nm.competition || null,
          daysAway: daysBetween(now, d),
        };
      } else if (nt) {
        const d = new Date(nt.date);
        picked = {
          kind: 'training',
          id: nt.id,
          date: d,
          title: nt.theme ? `Séance ${nt.theme.toLowerCase()}` : 'Entraînement',
          location: nt.location || null,
          daysAway: daysBetween(now, d),
        };
      }
      setNext(picked);

      // ── Forme : les matchs joués, du plus récent au plus ancien
      const played = matches
        .filter((m) => isPlayed(m, now))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const results = played.slice(0, 5).map(resultOf);
      setForm({
        results,
        played: played.length,
        wins: played.filter((m) => resultOf(m) === 'V').length,
        draws: played.filter((m) => resultOf(m) === 'N').length,
        losses: played.filter((m) => resultOf(m) === 'D').length,
        goalsFor: played.reduce((s, m) => s + (m.score_team ?? 0), 0),
        goalsAgainst: played.reduce((s, m) => s + (m.score_opponent ?? 0), 0),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [teamId, season]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return { next, form, loading, error, refresh: load };
}

/** « Aujourd'hui », « Demain », « Dans 3 jours »... */
export function relativeDayLabel(daysAway: number): string {
  if (daysAway <= 0) return "Aujourd'hui";
  if (daysAway === 1) return 'Demain';
  if (daysAway < 7) return `Dans ${daysAway} jours`;
  if (daysAway < 14) return 'La semaine prochaine';
  return `Dans ${Math.round(daysAway / 7)} semaines`;
}
