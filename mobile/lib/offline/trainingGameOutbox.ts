import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateGameSquadScore } from '../services/trainingGames';
import { isDeviceOffline, shouldTreatAsOfflineError } from './networkReachability';

const STORAGE_KEY = '@futsalhub_training_game_outbox_v2';

/** Une seule opération par (jeu, équipe) en file à la fois : le dernier score tapé gagne, pas la peine de rejouer un historique de taps. */
type OutboxMap = Record<string, number>;

function key(gameId: string, squadId: string): string {
  return `${gameId}:${squadId}`;
}

async function readOutbox(): Promise<OutboxMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OutboxMap) : {};
  } catch {
    return {};
  }
}

async function writeOutbox(map: OutboxMap): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

let flushing = false;

/** Met à jour la file locale (remplace toute entrée en attente pour cette équipe de ce jeu) puis tente un flush en tâche de fond. */
export async function enqueueTrainingGameScoreUpdate(gameId: string, squadId: string, score: number): Promise<void> {
  const map = await readOutbox();
  map[key(gameId, squadId)] = score;
  await writeOutbox(map);
  void flushTrainingGameOutbox();
}

/** Rejoue la file — no-op si hors ligne ou déjà en cours. Un score par (jeu, équipe), donc pas d'ordre à préserver entre entrées. */
export async function flushTrainingGameOutbox(): Promise<void> {
  if (flushing) return;
  if (await isDeviceOffline()) return;
  flushing = true;
  try {
    const map = await readOutbox();
    const entries = Object.entries(map);
    for (const [k, score] of entries) {
      const [gameId, squadId] = k.split(':');
      try {
        await updateGameSquadScore(gameId, squadId, score);
        const current = await readOutbox();
        if (current[k] === score) {
          delete current[k];
          await writeOutbox(current);
        }
      } catch (err) {
        if (shouldTreatAsOfflineError(err)) return; // réessaiera au prochain enqueue/flush
        // erreur non liée au réseau (ex: jeu supprimé) — on abandonne cette entrée pour ne pas bloquer les autres.
        const current = await readOutbox();
        delete current[k];
        await writeOutbox(current);
      }
    }
  } finally {
    flushing = false;
  }
}
