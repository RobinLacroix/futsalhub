/**
 * File d’attente persistée pour le tracker (match_events + update match),
 * synchronisée vers Supabase quand le réseau revient.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import type { GoalType, MatchEvent, MatchEventType } from '../../types';
import type { UpdateMatchInput } from '../services/matchUpdateTypes';
import { isDeviceOffline, shouldTreatAsOfflineError } from './networkReachability';

const STORAGE_KEY = '@futsalhub_match_recorder_outbox_v1';

type InsertPayload = {
  match_id: string;
  event_type: MatchEventType;
  match_time_seconds: number;
  half: 1 | 2;
  player_id?: string | null;
  players_on_field: string[];
  goal_type?: GoalType | null;
};

type OutboxRow =
  | { v: 1; op: 'ins'; qid: string; payload: InsertPayload; localEventId: string }
  | { v: 1; op: 'del'; qid: string; matchId: string; eventType: MatchEventType; playerId: string | null }
  | { v: 1; op: 'upd'; qid: string; matchId: string; input: UpdateMatchInput };

function newQueueId(): string {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizePlayersOnField(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim()))];
}

async function loadQueue(): Promise<OutboxRow[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as OutboxRow[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveQueue(rows: OutboxRow[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

let persistMutex = Promise.resolve();

function withPersist<T>(fn: () => Promise<T>): Promise<T> {
  const run = persistMutex.then(fn, fn);
  persistMutex = run.then(
    () => {},
    () => {}
  );
  return run;
}

function playerMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

/** Retire de la file le dernier insert encore non synchronisé qui correspond au delete. */
function stripOnePendingInsertForDelete(
  rows: OutboxRow[],
  matchId: string,
  eventType: MatchEventType,
  playerId: string | null
): OutboxRow[] | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.op !== 'ins') continue;
    const p = row.payload;
    if (p.match_id !== matchId || p.event_type !== eventType) continue;
    if (!playerMatch(p.player_id ?? null, playerId)) continue;
    return rows.slice(0, i).concat(rows.slice(i + 1));
  }
  return null;
}

async function rpcInsertMatchEvent(input: InsertPayload): Promise<void> {
  const playersOnField = sanitizePlayersOnField(input.players_on_field ?? []);
  const matchTimeSeconds = Math.max(0, Math.floor(Number(input.match_time_seconds)));
  const half: 1 | 2 = input.half === 2 ? 2 : 1;
  const goalType =
    input.event_type === 'goal' || input.event_type === 'opponent_goal'
      ? input.goal_type ?? null
      : null;
  const { error } = await supabase.rpc('insert_match_event', {
    p_match_id: input.match_id,
    p_event_type: input.event_type,
    p_match_time_seconds: matchTimeSeconds,
    p_half: half,
    p_player_id: input.player_id ?? null,
    p_players_on_field: playersOnField,
    p_location_x: null,
    p_location_y: null,
    p_goal_type: goalType,
  });
  if (error) throw new Error(error.message);
}

async function rpcDeleteLast(matchId: string, eventType: MatchEventType, playerId: string | null): Promise<void> {
  const { error } = await supabase.rpc('delete_last_event_by_type', {
    p_match_id: matchId,
    p_event_type: eventType,
    p_player_id: playerId,
  });
  if (error) throw new Error(error.message);
}

/** Corps de updateMatch côté serveur — aligné sur matches.ts */
async function rpcUpdateMatch(matchId: string, input: UpdateMatchInput): Promise<void> {
  const { buildRemoteMatchUpdatePayload } = await import('../services/matchesWritePayload');
  const updateData = await buildRemoteMatchUpdatePayload(matchId, input);
  const { error } = await supabase.from('matches').update(updateData).eq('id', matchId);
  if (error) throw new Error(error.message);
}

let flushing = false;

export async function getOutboxLength(): Promise<number> {
  const q = await loadQueue();
  return q.length;
}

/** Événements encore dans la file (inserts non synchronisés), pour affichage / bilan hors ligne. */
export async function getPendingInsertEventsForMatch(matchId: string): Promise<MatchEvent[]> {
  const q = await loadQueue();
  return q
    .filter((r): r is Extract<OutboxRow, { op: 'ins' }> => r.op === 'ins' && r.payload.match_id === matchId)
    .map((r) => syntheticMatchEvent(r.payload, r.localEventId));
}

export async function flushMatchRecorderOutbox(): Promise<void> {
  if (await isDeviceOffline()) return;
  if (flushing) return;
  flushing = true;
  try {
    let q = await loadQueue();
    while (q.length > 0) {
      if (await isDeviceOffline()) break;
      const row = q[0];
      try {
        if (row.op === 'ins') await rpcInsertMatchEvent(row.payload);
        else if (row.op === 'del') await rpcDeleteLast(row.matchId, row.eventType, row.playerId);
        else await rpcUpdateMatch(row.matchId, row.input);
        q = q.slice(1);
        await saveQueue(q);
      } catch (e) {
        if (shouldTreatAsOfflineError(e)) break;
        console.warn('[Outbox] abandon après erreur définitive:', e);
        q = q.slice(1);
        await saveQueue(q);
      }
    }
  } finally {
    flushing = false;
  }
}

export function syntheticMatchEvent(input: InsertPayload, localEventId: string): MatchEvent {
  return {
    id: localEventId,
    match_id: input.match_id,
    event_type: input.event_type,
    match_time_seconds: Math.max(0, Math.floor(Number(input.match_time_seconds))),
    half: input.half === 2 ? 2 : 1,
    player_id: input.player_id ?? null,
    players_on_field: sanitizePlayersOnField(input.players_on_field ?? []),
    goal_type: input.goal_type ?? null,
    created_at: new Date().toISOString(),
  };
}

/** Enfile un insert ; appelé depuis createMatchEvent hors ligne. */
export async function enqueueMatchEventInsert(input: InsertPayload): Promise<MatchEvent> {
  const localEventId = `local-${newQueueId()}`;
  const row: OutboxRow = { v: 1, op: 'ins', qid: newQueueId(), payload: { ...input }, localEventId };
  await withPersist(async () => {
    const q = await loadQueue();
    q.push(row);
    await saveQueue(q);
  });
  Promise.resolve().then(() => {
    flushMatchRecorderOutbox().catch(() => {});
  });
  return syntheticMatchEvent(input, localEventId);
}

/** Si le dernier insert encore en file correspond à ce delete, on le retire (pas d’appel serveur). */
export async function tryStripOnePendingInsert(
  matchId: string,
  eventType: MatchEventType,
  playerId: string | null
): Promise<boolean> {
  return withPersist(async () => {
    const q = await loadQueue();
    const next = stripOnePendingInsertForDelete(q, matchId, eventType, playerId);
    if (!next) return false;
    await saveQueue(next);
    return true;
  });
}

export async function enqueuePendingDelete(
  matchId: string,
  eventType: MatchEventType,
  playerId: string | null
): Promise<void> {
  await withPersist(async () => {
    const q = await loadQueue();
    const row: OutboxRow = {
      v: 1,
      op: 'del',
      qid: newQueueId(),
      matchId,
      eventType,
      playerId,
    };
    q.push(row);
    await saveQueue(q);
  });
  Promise.resolve().then(() => {
    flushMatchRecorderOutbox().catch(() => {});
  });
}

export async function enqueueMatchUpdate(matchId: string, input: UpdateMatchInput): Promise<void> {
  await withPersist(async () => {
    const q = await loadQueue();
    q.push({ v: 1, op: 'upd', qid: newQueueId(), matchId, input });
    await saveQueue(q);
  });
  Promise.resolve().then(() => {
    flushMatchRecorderOutbox().catch(() => {});
  });
}
