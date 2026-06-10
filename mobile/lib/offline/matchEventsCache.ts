import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MatchEvent } from '../../types';

const KEY = '@futsalhub_match_events_cache_v1';

async function readAll(): Promise<Record<string, MatchEvent[]>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, MatchEvent[]>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function rememberMatchEventsFromServer(matchId: string, events: MatchEvent[]): Promise<void> {
  try {
    const map = await readAll();
    map[matchId] = events;
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export async function getCachedMatchEvents(matchId: string): Promise<MatchEvent[]> {
  const map = await readAll();
  return map[matchId] ?? [];
}
