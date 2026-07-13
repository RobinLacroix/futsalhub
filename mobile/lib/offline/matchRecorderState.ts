/**
 * Persistance locale de l'état du match recorder.
 * Sauvegardé à chaque événement et toutes les 5s (throttle chrono).
 * Restauré au rechargement si le matchId correspond.
 * Nettoyé après saveAndExit.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = '@futsalhub_recorder_state_v1_';

export interface PersistedRecorderState {
  matchId: string;
  half: 1 | 2;
  seconds: number;
  scoreUs: number;
  scoreOpponent: number;
  foulsUs: number;
  foulsOpponent: number;
  playersOnField: string[];
  playerStates: Record<string, {
    id: string;
    totalTime: number;
    currentSequenceTime: number;
    sequenceTimeLimit: number;
    yellowCards: number;
    redCards: number;
    stats: Record<string, number>;
  }>;
  savedAt: number;
}

export async function saveRecorderState(state: PersistedRecorderState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + state.matchId, JSON.stringify(state));
  } catch {
    // Non-fatal : la persistance est best-effort
  }
}

export async function loadRecorderState(matchId: string): Promise<PersistedRecorderState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + matchId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedRecorderState;
    if (parsed.matchId !== matchId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearRecorderState(matchId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + matchId);
  } catch {
    // Non-fatal
  }
}
