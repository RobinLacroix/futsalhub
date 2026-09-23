import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TimerMode } from '../services/trainingGames';

const KEY_PREFIX = '@futsalhub_live_session_v1_';

/**
 * État complet d'une session live en cours, un training à la fois. Sert deux
 * besoins avec un seul mécanisme : faire voyager la composition des plateaux
 * de l'écran Plateaux vers l'écran Jeu (deux routes Expo Router distinctes,
 * pas de Context partagé entre elles), et le snapshot crash-safe 5s pendant
 * un jeu (design doc §6).
 */
export interface LiveSessionSnapshot {
  trainingId: string;
  squads: { id: string; label: string; color_token: string }[];
  /** playerId -> squadId ; absent = non assigné (banc, ou gardien non affecté). */
  composition: Record<string, string>;
  activeGameId: string | null;
  timerMode: TimerMode | null;
  /** Dernier réglage séries utilisé — proposé par défaut au prochain lancement. */
  lastSeriesConfig: { seriesCount: number; seriesDurationSeconds: number; restDurationSeconds: number } | null;
  /** Timestamp epoch ms du début de la phase courante (série ou repos) — recalculé au retour au premier plan, jamais décrémenté. */
  phaseStartedAtMs: number | null;
  phaseKind: 'serie' | 'repos' | null;
  currentSeriesIndex: number | null;
  scoreHome: number;
  scoreAway: number;
  updatedAtMs: number;
}

export async function readLiveSessionSnapshot(trainingId: string): Promise<LiveSessionSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + trainingId);
    return raw ? (JSON.parse(raw) as LiveSessionSnapshot) : null;
  } catch {
    return null;
  }
}

export async function writeLiveSessionSnapshot(snapshot: LiveSessionSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + snapshot.trainingId, JSON.stringify({ ...snapshot, updatedAtMs: Date.now() }));
  } catch {
    // best-effort — un échec d'écriture locale ne doit jamais bloquer la saisie du coach.
  }
}

export async function clearLiveSessionSnapshot(trainingId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + trainingId);
  } catch {
    // idem
  }
}
