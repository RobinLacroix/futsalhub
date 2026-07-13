import { supabase } from '../supabase';
import type { MatchEvent, MatchEventType, GoalType } from '../../types';
import { isDeviceOffline, shouldTreatAsOfflineError } from '../offline/networkReachability';
import { rememberMatchEventsFromServer, getCachedMatchEvents } from '../offline/matchEventsCache';
import { getPendingInsertEventsForMatch } from '../offline/matchRecorderOutbox';
import {
  enqueueMatchEventInsert,
  enqueuePendingDelete,
  tryStripOnePendingInsert,
} from '../offline/matchRecorderOutbox';

export type { GoalType };

/** Doit rester aligné sur la contrainte CHECK de `match_events.event_type` (Supabase). */
const MATCH_EVENT_TYPES_ALLOWED = new Set<MatchEventType>([
  'goal',
  'shot',
  'shot_on_target',
  'recovery',
  'yellow_card',
  'red_card',
  'assist',
  'ball_loss',
  'opponent_goal',
  'opponent_shot',
  'opponent_shot_on_target',
  'substitution',
]);

function sanitizePlayersOnField(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim()))];
}

function mergeEventsWithPending(base: MatchEvent[], pending: MatchEvent[]): MatchEvent[] {
  if (pending.length === 0) return base;
  const byId = new Map(base.map((ev) => [ev.id, ev]));
  for (const p of pending) {
    if (!byId.has(p.id)) byId.set(p.id, p);
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (a.half !== b.half) return a.half - b.half;
    if (a.match_time_seconds !== b.match_time_seconds) return a.match_time_seconds - b.match_time_seconds;
    return String(a.id).localeCompare(String(b.id));
  });
}

export async function getEventsByMatchId(matchId: string): Promise<MatchEvent[]> {
  let list: MatchEvent[] = [];
  try {
    if (await isDeviceOffline()) {
      list = await getCachedMatchEvents(matchId);
    } else {
      const { data, error } = await supabase
        .from('match_events')
        .select('*')
        .eq('match_id', matchId)
        .order('match_time_seconds', { ascending: true });
      if (error) throw error;
      list = (data ?? []) as MatchEvent[];
      await rememberMatchEventsFromServer(matchId, list);
    }
  } catch (e) {
    if (shouldTreatAsOfflineError(e)) {
      list = await getCachedMatchEvents(matchId);
    } else {
      throw e;
    }
  }
  const pending = await getPendingInsertEventsForMatch(matchId);
  return mergeEventsWithPending(list, pending);
}

export interface CreateMatchEventInput {
  match_id: string;
  event_type: MatchEventType;
  match_time_seconds: number;
  half: 1 | 2;
  player_id?: string | null;
  players_on_field: string[];
  goal_type?: GoalType | null;
}

/** Supprime le dernier événement du type donné (même joueur si `playerId` défini). */
export async function deleteLastMatchEventByType(
  matchId: string,
  eventType: MatchEventType,
  playerId: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (await tryStripOnePendingInsert(matchId, eventType, playerId)) {
    return { ok: true };
  }
  if (await isDeviceOffline()) {
    await enqueuePendingDelete(matchId, eventType, playerId);
    return { ok: true };
  }
  try {
    const { error } = await supabase.rpc('delete_last_event_by_type', {
      p_match_id: matchId,
      p_event_type: eventType,
      p_player_id: playerId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    if (shouldTreatAsOfflineError(e)) {
      await enqueuePendingDelete(matchId, eventType, playerId);
      return { ok: true };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

async function insertMatchEventRemote(input: CreateMatchEventInput): Promise<MatchEvent> {
  const playersOnField = sanitizePlayersOnField(input.players_on_field ?? []);
  const matchTimeSeconds = Math.max(0, Math.floor(Number(input.match_time_seconds)));
  const half: 1 | 2 = input.half === 2 ? 2 : 1;
  const goalType =
    input.event_type === 'goal' || input.event_type === 'opponent_goal'
      ? input.goal_type ?? null
      : null;

  const { data, error } = await supabase.rpc('insert_match_event', {
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
  if (error) {
    const errMsg = typeof error === 'object' && error !== null && 'message' in error
      ? (error as { message?: string; details?: string }).message
      : String(error);
    const errDetails = typeof error === 'object' && error !== null && 'details' in error
      ? (error as { details?: string }).details
      : '';
    throw new Error(errDetails ? `${errMsg} (${errDetails})` : errMsg);
  }
  if (data == null) {
    throw new Error("insert_match_event n'a retourné aucune ligne (vérifiez la RPC Supabase).");
  }
  return data as MatchEvent;
}

export async function createMatchEvent(input: CreateMatchEventInput): Promise<MatchEvent> {
  if (!MATCH_EVENT_TYPES_ALLOWED.has(input.event_type)) {
    throw new Error(`Type d'événement non reconnu par Supabase: ${input.event_type}`);
  }

  const payload: CreateMatchEventInput = {
    ...input,
    players_on_field: sanitizePlayersOnField(input.players_on_field ?? []),
  };

  if (await isDeviceOffline()) {
    return enqueueMatchEventInsert(payload);
  }
  try {
    return await insertMatchEventRemote(input);
  } catch (e) {
    if (shouldTreatAsOfflineError(e)) {
      return enqueueMatchEventInsert(payload);
    }
    throw e;
  }
}


/** Agrège goals_by_type et conceded_by_type à partir des événements. */
export async function getGoalsByTypeForMatches(
  matchIds: string[]
): Promise<Record<string, { goals_by_type: Record<string, number>; conceded_by_type: Record<string, number> }>> {
  if (matchIds.length === 0) return {};
  const { data, error } = await supabase
    .from('match_events')
    .select('match_id, event_type, goal_type')
    .in('match_id', matchIds)
    .in('event_type', ['goal', 'opponent_goal']);
  if (error) throw error;
  const types = ['offensive', 'transition', 'cpa', 'superiority'] as const;
  const result: Record<string, { goals_by_type: Record<string, number>; conceded_by_type: Record<string, number> }> = {};
  for (const id of matchIds) {
    result[id] = {
      goals_by_type: { offensive: 0, transition: 0, cpa: 0, superiority: 0 },
      conceded_by_type: { offensive: 0, transition: 0, cpa: 0, superiority: 0 },
    };
  }
  for (const row of data ?? []) {
    const m = row as { match_id: string; event_type: string; goal_type?: string | null };
    const key = m.goal_type && types.includes(m.goal_type as any) ? m.goal_type : 'offensive';
    if (m.event_type === 'goal') {
      result[m.match_id].goals_by_type[key]++;
    } else if (m.event_type === 'opponent_goal') {
      result[m.match_id].conceded_by_type[key]++;
    }
  }
  return result;
}

export async function hasMatchEvents(matchId: string): Promise<boolean> {
  const ev = await getEventsByMatchId(matchId);
  return ev.length > 0;
}

export interface MatchEventsAggregateRow {
  player_id: string;
  goals: number;
  yellow_cards: number;
  red_cards: number;
}

export async function getMatchEventsAggregate(matchId: string): Promise<MatchEventsAggregateRow[]> {
  const events = await getEventsByMatchId(matchId);
  const byPlayer = new Map<string, { goals: number; yellow_cards: number; red_cards: number }>();
  events.forEach((ev) => {
    if (!ev.player_id) return;
    const cur = byPlayer.get(ev.player_id) ?? { goals: 0, yellow_cards: 0, red_cards: 0 };
    if (ev.event_type === 'goal') cur.goals++;
    if (ev.event_type === 'yellow_card') cur.yellow_cards++;
    if (ev.event_type === 'red_card') cur.red_cards++;
    byPlayer.set(ev.player_id, cur);
  });
  return Array.from(byPlayer.entries()).map(([player_id, v]) => ({
    player_id,
    goals: v.goals,
    yellow_cards: v.yellow_cards,
    red_cards: v.red_cards,
  }));
}
