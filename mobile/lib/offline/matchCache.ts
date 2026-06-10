import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Match } from '../../types';

const KEY = '@futsalhub_match_cache_v1';

async function readAll(): Promise<Record<string, Match>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Match>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function rememberMatchFromServer(match: Match): Promise<void> {
  try {
    const map = await readAll();
    map[match.id] = match;
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export async function getCachedMatch(matchId: string): Promise<Match | null> {
  const map = await readAll();
  return map[matchId] ?? null;
}
