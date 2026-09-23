import { supabase } from '../supabase';

export type TimerMode = 'continu' | 'series';

export interface TrainingSquad {
  id: string;
  training_id: string;
  club_id: string;
  label: string;
  color_token: string;
  sort_order: number;
  created_at: string;
}

export interface TrainingGame {
  id: string;
  training_id: string;
  club_id: string;
  sequence: number;
  part_index: number | null;
  procedure_id: string | null;
  label: string | null;
  score_unit_label: string | null;
  /** Valeur ajoutée au score à chaque tap — 1 par défaut, fixe pour toute la durée du jeu. */
  points_per_tap: number;
  timer_mode: TimerMode;
  series_count: number | null;
  series_duration_seconds: number | null;
  rest_duration_seconds: number | null;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface TrainingGamePlayer {
  game_id: string;
  player_id: string;
  squad_id: string;
  club_id: string;
}

/** Une équipe participant à un jeu, et son score — un jeu à N équipes a N lignes, pas juste domicile/extérieur. */
export interface TrainingGameSquad {
  game_id: string;
  squad_id: string;
  club_id: string;
  score: number;
  sort_order: number;
}

/** Plateaux d'une séance, dans l'ordre d'affichage. */
export async function getSquadsForTraining(trainingId: string): Promise<TrainingSquad[]> {
  const { data, error } = await supabase
    .from('training_squads')
    .select('*')
    .eq('training_id', trainingId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Remplace l'ensemble des plateaux d'une séance : supprime ceux retirés,
 * met à jour ceux qui existent, insère les nouveaux. `club_id` n'est jamais
 * envoyé — dérivé par trigger depuis `training_id` (voir migration).
 */
export async function saveSquadsForTraining(
  trainingId: string,
  squads: { id?: string; label: string; color_token: string; sort_order: number }[],
): Promise<TrainingSquad[]> {
  const existing = await getSquadsForTraining(trainingId);
  const keepIds = new Set(squads.filter((s) => s.id).map((s) => s.id as string));
  const toDelete = existing.filter((s) => !keepIds.has(s.id));

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('training_squads')
      .delete()
      .in('id', toDelete.map((s) => s.id));
    if (error) throw error;
  }

  const toUpdate = squads.filter((s) => s.id);
  for (const s of toUpdate) {
    const { error } = await supabase
      .from('training_squads')
      .update({ label: s.label, color_token: s.color_token, sort_order: s.sort_order })
      .eq('id', s.id as string);
    if (error) throw error;
  }

  const toInsert = squads.filter((s) => !s.id);
  if (toInsert.length > 0) {
    const { error } = await supabase.from('training_squads').insert(
      toInsert.map((s) => ({ training_id: trainingId, label: s.label, color_token: s.color_token, sort_order: s.sort_order })),
    );
    if (error) throw error;
  }

  return getSquadsForTraining(trainingId);
}

/** Tous les jeux d'une séance, dans l'ordre de jeu — utilisé par le récap. */
export async function getGamesForTraining(trainingId: string): Promise<TrainingGame[]> {
  const { data, error } = await supabase
    .from('training_games')
    .select('*')
    .eq('training_id', trainingId)
    .order('sequence', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Le jeu non clos le plus récent d'une séance, s'il y en a un — propose la reprise. */
export async function getOpenGameForTraining(trainingId: string): Promise<TrainingGame | null> {
  const { data, error } = await supabase
    .from('training_games')
    .select('*')
    .eq('training_id', trainingId)
    .is('ended_at', null)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getGamePlayers(gameId: string): Promise<TrainingGamePlayer[]> {
  const { data, error } = await supabase.from('training_game_players').select('*').eq('game_id', gameId);
  if (error) throw error;
  return data ?? [];
}

/** Équipes participantes d'un jeu et leur score courant, dans l'ordre d'affichage. */
export async function getGameSquads(gameId: string): Promise<TrainingGameSquad[]> {
  const { data, error } = await supabase
    .from('training_game_squads')
    .select('*')
    .eq('game_id', gameId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Équipes participantes de plusieurs jeux en un aller-retour — utilisé par le récap et les classements live. */
export async function getGameSquadsForGames(gameIds: string[]): Promise<TrainingGameSquad[]> {
  if (gameIds.length === 0) return [];
  const { data, error } = await supabase.from('training_game_squads').select('*').in('game_id', gameIds);
  if (error) throw error;
  return data ?? [];
}

export interface StartGameInput {
  trainingId: string;
  /** 2 équipes minimum, pas de maximum imposé côté service (le nombre de plateaux constitués le borne déjà). */
  squadIds: string[];
  timerMode: TimerMode;
  seriesCount?: number;
  seriesDurationSeconds?: number;
  restDurationSeconds?: number;
  procedureId?: string | null;
  label?: string | null;
  scoreUnitLabel?: string | null;
  /** Valeur ajoutée au score à chaque tap — défaut 1 côté base si omis. */
  pointsPerTap?: number;
  /** joueur → plateau, au moment du lancement — figé pour ce jeu (voir migration §1). */
  composition: { playerId: string; squadId: string }[];
}

/** Crée le jeu suivant (sequence = max+1), ses N équipes participantes (score 0) et fige la composition courante. */
export async function startTrainingGame(input: StartGameInput): Promise<TrainingGame> {
  if (input.squadIds.length < 2) throw new Error('Il faut au moins deux équipes pour lancer un jeu.');

  const existing = await getGamesForTraining(input.trainingId);
  const nextSequence = existing.reduce((max, g) => Math.max(max, g.sequence), 0) + 1;

  const { data: game, error } = await supabase
    .from('training_games')
    .insert({
      training_id: input.trainingId,
      sequence: nextSequence,
      procedure_id: input.procedureId ?? null,
      label: input.label ?? null,
      score_unit_label: input.scoreUnitLabel ?? null,
      points_per_tap: input.pointsPerTap ?? 1,
      timer_mode: input.timerMode,
      series_count: input.timerMode === 'series' ? input.seriesCount : null,
      series_duration_seconds: input.timerMode === 'series' ? input.seriesDurationSeconds : null,
      rest_duration_seconds: input.timerMode === 'series' ? input.restDurationSeconds : null,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;

  const { error: squadsError } = await supabase.from('training_game_squads').insert(
    input.squadIds.map((squadId, i) => ({ game_id: game.id, squad_id: squadId, score: 0, sort_order: i })),
  );
  if (squadsError) throw squadsError;

  if (input.composition.length > 0) {
    const { error: playersError } = await supabase.from('training_game_players').insert(
      input.composition.map((c) => ({ game_id: game.id, player_id: c.playerId, squad_id: c.squadId })),
    );
    if (playersError) throw playersError;
  }

  return game;
}

/** Upsert du score courant d'UNE équipe d'un jeu — appelée à chaque +1/annulation, et par l'outbox offline. */
export async function updateGameSquadScore(gameId: string, squadId: string, score: number): Promise<void> {
  const { error } = await supabase
    .from('training_game_squads')
    .update({ score })
    .eq('game_id', gameId)
    .eq('squad_id', squadId);
  if (error) throw error;
}

export async function endTrainingGame(gameId: string, durationSeconds: number): Promise<void> {
  const { error } = await supabase
    .from('training_games')
    .update({ ended_at: new Date().toISOString(), duration_seconds: durationSeconds })
    .eq('id', gameId);
  if (error) throw error;
}
