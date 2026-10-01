import type { TrainingGame, TrainingGameSquad } from '../services/trainingGames';
import { computeSquadStandings, type SquadLike } from './standings';

/**
 * Les trois niveaux du mode Live :
 *  - séquence : un jeu (`training_games`) ;
 *  - procédé  : les jeux qui partagent le même `part_index` (un procédé peut ne compter qu'une séquence) ;
 *  - séance   : tous les jeux de l'entraînement.
 */

/** Clé de regroupement en procédé. Les jeux antérieurs à `part_index` se rangent par fiche de procédé. */
export function procedureKey(g: Pick<TrainingGame, 'part_index' | 'procedure_id'>): string {
  return g.part_index != null ? `p${g.part_index}` : `l${g.procedure_id ?? 'libre'}`;
}

/** Prochain `part_index` libre : un nouveau procédé démarre toujours sur un indice inédit. */
export function nextPartIndex(games: TrainingGame[]): number {
  return games.reduce((max, g) => Math.max(max, g.part_index ?? -1), -1) + 1;
}

export interface SquadLevels {
  squadId: string;
  label: string;
  /** Token de couleur de chasuble (voir bibColors.ts). */
  colorToken: string;
  /** Score de la séquence en cours. */
  sequence: number;
  /** Cumul des points sur toutes les séquences du procédé (même unité de score, donc additionnable). */
  procedure: number;
  /** Bilan de la séance en séquences gagnées / nulles / perdues — jamais un cumul de points entre unités différentes. */
  wins: number;
  draws: number;
  losses: number;
}

export interface LiveLevels {
  squads: SquadLevels[];
  /** Rang de la séquence courante dans son procédé (1-based) et nombre de séquences déjà créées. */
  sequenceIndex: number;
  sequenceCount: number;
  procedureStartedAtMs: number | null;
  sessionStartedAtMs: number | null;
}

const startMs = (games: TrainingGame[]): number | null => {
  const times = games.map((g) => (g.started_at ? new Date(g.started_at).getTime() : NaN)).filter((t) => !Number.isNaN(t));
  return times.length ? Math.min(...times) : null;
};

/**
 * Calcule les trois niveaux pour les équipes qui jouent la séquence courante.
 * `gameSquads` doit déjà contenir les scores live du jeu ouvert. Une séquence
 * ouverte n'entre dans le bilan de séance qu'une fois qu'un point est tombé :
 * un 0-0 de début de jeu ne doit pas compter comme un nul.
 */
export function computeLiveLevels(params: {
  squads: SquadLike[];
  games: TrainingGame[];
  gameSquads: TrainingGameSquad[];
  current: TrainingGame;
  /** Séquences remises à zéro : ne comptent pas dans le bilan de séance. */
  excludedGameIds?: string[];
}): LiveLevels {
  const { squads, games, gameSquads, current, excludedGameIds = [] } = params;

  const key = procedureKey(current);
  const procedureGames = games.filter((g) => procedureKey(g) === key).sort((a, b) => a.sequence - b.sequence);
  const procedureGameIds = new Set(procedureGames.map((g) => g.id));

  const currentRows = gameSquads.filter((gs) => gs.game_id === current.id).sort((a, b) => a.sort_order - b.sort_order);
  const currentHasPoints = currentRows.some((r) => r.score > 0);

  const gamesForStandings = games
    .filter((g) => !excludedGameIds.includes(g.id))
    .filter((g) => g.ended_at || (g.id === current.id && currentHasPoints))
    .map((g) => (g.ended_at ? g : { ...g, ended_at: new Date().toISOString() }));
  const standings = new Map(computeSquadStandings(squads, gamesForStandings, gameSquads).map((s) => [s.squadId, s]));

  const levels: SquadLevels[] = currentRows.map((row) => {
    const sq = squads.find((x) => x.id === row.squad_id);
    const st = standings.get(row.squad_id);
    const procedureTotal = gameSquads
      .filter((gs) => gs.squad_id === row.squad_id && procedureGameIds.has(gs.game_id))
      .reduce((sum, gs) => sum + gs.score, 0);
    return {
      squadId: row.squad_id,
      label: sq?.label ?? '—',
      colorToken: sq?.color_token ?? '0',
      sequence: row.score,
      procedure: procedureTotal,
      wins: st?.wins ?? 0,
      draws: st?.draws ?? 0,
      losses: st?.losses ?? 0,
    };
  });

  return {
    squads: levels,
    sequenceIndex: Math.max(1, procedureGames.findIndex((g) => g.id === current.id) + 1),
    sequenceCount: procedureGames.length,
    procedureStartedAtMs: startMs(procedureGames),
    sessionStartedAtMs: startMs(games),
  };
}

export function formatClock(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Couleur de texte lisible (contraste WCAG le plus haut) sur un aplat d'équipe — le blanc fixe échoue sur l'ambre et le teal. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const onWhite = 1.05 / (lum + 0.05);
  const onDark = (lum + 0.05) / 0.05;
  return onWhite >= onDark ? '#FFFFFF' : '#101014';
}
