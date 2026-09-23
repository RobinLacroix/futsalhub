import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateTrainingGameScore } from '../services/trainingGames';
import { isDeviceOffline, shouldTreatAsOfflineError } from './networkReachability';

const STORAGE_KEY = '@futsalhub_training_game_outbox_v1';

/** Une seule opération par jeu en file à la fois : la plus récente écrase la précédente (dernier score gagne), pas la peine de rejouer un historique de taps. */
type OutboxMap = Record<string, { scoreHome: number; scoreAway: number }>;

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

/** Met à jour la file locale (remplace toute entrée en attente pour ce jeu) puis tente un flush en tâche de fond. */
export async function enqueueTrainingGameScoreUpdate(gameId: string, scoreHome: number, scoreAway: number): Promise<void> {
  const map = await readOutbox();
  map[gameId] = { scoreHome, scoreAway };
  await writeOutbox(map);
  void flushTrainingGameOutbox();
}

/** Rejoue la file — no-op si hors ligne ou déjà en cours. Un score par jeu, donc pas d'ordre à préserver entre jeux différents. */
export async function flushTrainingGameOutbox(): Promise<void> {
  if (flushing) return;
  if (await isDeviceOffline()) return;
  flushing = true;
  try {
    const map = await readOutbox();
    const entries = Object.entries(map);
    for (const [gameId, { scoreHome, scoreAway }] of entries) {
      try {
        await updateTrainingGameScore(gameId, scoreHome, scoreAway);
        const current = await readOutbox();
        if (current[gameId]?.scoreHome === scoreHome && current[gameId]?.scoreAway === scoreAway) {
          delete current[gameId];
          await writeOutbox(current);
        }
      } catch (err) {
        if (shouldTreatAsOfflineError(err)) return; // réessaiera au prochain enqueue/flush
        // erreur non liée au réseau (ex: jeu supprimé) — on abandonne cette entrée pour ne pas bloquer les autres.
        const current = await readOutbox();
        delete current[gameId];
        await writeOutbox(current);
      }
    }
  } finally {
    flushing = false;
  }
}
