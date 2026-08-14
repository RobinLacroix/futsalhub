import { supabase } from '../supabase';
import {
  retainedAttemptIndexes,
  type PhysicalTestResult,
  type PhysicalTestSession,
  type PhysicalTestType,
} from '../physicalTests';

/**
 * Tests physiques — couche service mobile.
 *
 * Jumeau web : `lib/services/physicalTestsService.ts`. Même API, style d'export
 * de la brique mobile (fonctions nommées). Toute règle métier ajoutée d'un côté
 * doit l'être de l'autre : c'est la divergence silencieuse des paires de
 * services qui a produit les cinq bugs de données des match recorders.
 */

/** Un essai saisi, avant écriture. `value === null` = essai non réalisé. */
export interface AttemptInput {
  attempt: number;
  value: number | null;
}

export interface ResultInput {
  playerId: string;
  testTypeId: string;
  attempts: AttemptInput[];
  note?: string | null;
}

export interface SessionInput {
  clubId: string;
  teamId?: string | null;
  trainingId?: string | null;
  date: string;
  label?: string | null;
  season?: string | null;
  conditions?: string | null;
}

// ── Catalogue ───────────────────────────────────────────────────────────────

/**
 * Catalogue visible par le club : tests système (club_id null) + tests du club,
 * moins ceux que le club a masqués. Un club ne peut pas modifier un test
 * système, seulement le cacher.
 */
export async function getTestTypes(clubId: string): Promise<PhysicalTestType[]> {
  const [typesRes, prefsRes] = await Promise.all([
    supabase
      .from('physical_test_types')
      .select('*')
      .or(`club_id.is.null,club_id.eq.${clubId}`)
      .eq('is_active', true),
    supabase
      .from('physical_test_type_prefs')
      .select('test_type_id, is_hidden')
      .eq('club_id', clubId),
  ]);

  if (typesRes.error) throw typesRes.error;
  if (prefsRes.error) throw prefsRes.error;

  const hidden = new Set(
    (prefsRes.data || [])
      .filter((p: { is_hidden: boolean }) => p.is_hidden)
      .map((p: { test_type_id: string }) => p.test_type_id),
  );

  return ((typesRes.data || []) as PhysicalTestType[]).filter((t) => !hidden.has(t.id));
}

/**
 * Charge des tests par identifiant, pour NOMMER des résultats déjà enregistrés.
 *
 * Volontairement sans filtre `is_active` ni exclusion des tests masqués, à la
 * différence de `getTestTypes` : un club qui retire le Yo-Yo de son catalogue
 * n'efface pas les Yo-Yo déjà courus. Les filtrer ici afficherait un historique
 * amputé, ou pire des résultats sans libellé.
 */
export async function getTestTypesByIds(ids: string[]): Promise<PhysicalTestType[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('physical_test_types')
    .select('*')
    .in('id', ids);
  if (error) throw error;
  return (data || []) as PhysicalTestType[];
}

export async function setTestTypeHidden(
  clubId: string,
  testTypeId: string,
  hidden: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('physical_test_type_prefs')
    .upsert(
      { club_id: clubId, test_type_id: testTypeId, is_hidden: hidden },
      { onConflict: 'club_id,test_type_id' },
    );
  if (error) throw error;
}

// ── Campagnes ───────────────────────────────────────────────────────────────

export async function getSessions(
  clubId: string,
  options: { teamId?: string | null; season?: string | null } = {},
): Promise<PhysicalTestSession[]> {
  let query = supabase
    .from('physical_test_sessions')
    .select('*')
    .eq('club_id', clubId)
    .order('date', { ascending: false });

  if (options.teamId) query = query.eq('team_id', options.teamId);
  if (options.season) query = query.eq('season', options.season);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as PhysicalTestSession[];
}

export async function getSessionById(sessionId: string): Promise<PhysicalTestSession | null> {
  const { data, error } = await supabase
    .from('physical_test_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return (data as PhysicalTestSession) ?? null;
}

/** Campagne rattachée à une séance, s'il y en a une. */
export async function getSessionByTraining(
  trainingId: string,
): Promise<PhysicalTestSession | null> {
  const { data, error } = await supabase
    .from('physical_test_sessions')
    .select('*')
    .eq('training_id', trainingId)
    .maybeSingle();
  if (error) throw error;
  return (data as PhysicalTestSession) ?? null;
}

export async function createSession(input: SessionInput): Promise<PhysicalTestSession> {
  const { data, error } = await supabase
    .from('physical_test_sessions')
    .insert({
      club_id: input.clubId,
      team_id: input.teamId ?? null,
      training_id: input.trainingId ?? null,
      date: input.date,
      label: input.label ?? null,
      season: input.season ?? null,
      conditions: input.conditions ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as PhysicalTestSession;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('physical_test_sessions')
    .delete()
    .eq('id', sessionId);
  if (error) throw error;
}

// ── Résultats ───────────────────────────────────────────────────────────────

export async function getSessionResults(sessionId: string): Promise<PhysicalTestResult[]> {
  const { data, error } = await supabase
    .from('physical_test_results')
    .select('*')
    .eq('session_id', sessionId)
    .order('attempt', { ascending: true });
  if (error) throw error;
  return (data || []) as PhysicalTestResult[];
}

export async function getPlayerResults(
  playerId: string,
  options: { season?: string | null } = {},
): Promise<(PhysicalTestResult & { session: PhysicalTestSession })[]> {
  let query = supabase
    .from('physical_test_results')
    .select('*, session:physical_test_sessions!inner(*)')
    .eq('player_id', playerId)
    .eq('is_retained', true);

  if (options.season) query = query.eq('session.season', options.season);

  const { data, error } = await query;
  if (error) throw error;

  return ((data || []) as (PhysicalTestResult & { session: PhysicalTestSession })[]).sort(
    (a, b) => b.session.date.localeCompare(a.session.date),
  );
}

/**
 * Essais retenus de TOUT l'effectif sur des campagnes données, pour calculer le
 * repère de groupe d'un joueur.
 *
 * Ce que RLS renvoie ici dépend de qui appelle, et ça change le sens du
 * résultat : `has_player_health_access` n'ouvre les résultats d'un joueur qu'à
 * l'encadrement et au joueur lui-même. Appelée par un joueur, cette fonction ne
 * ramène donc que ses propres lignes, et la « moyenne du groupe » vaudrait
 * exactement sa propre valeur. L'appelant DOIT réserver l'affichage du repère à
 * l'encadrement : la garde est dans l'écran, pas dans la requête.
 */
export async function getSquadRetainedResults(
  sessionIds: string[],
  testTypeIds: string[],
): Promise<PhysicalTestResult[]> {
  if (sessionIds.length === 0 || testTypeIds.length === 0) return [];
  const { data, error } = await supabase
    .from('physical_test_results')
    .select('*')
    .in('session_id', sessionIds)
    .in('test_type_id', testTypeIds)
    .eq('is_retained', true);
  if (error) throw error;
  return (data || []) as PhysicalTestResult[];
}

/**
 * Écrit la saisie d'un ou plusieurs joueurs sur un test.
 *
 * `is_retained` est calculé ICI, jamais dans un écran : la règle dépend de
 * `aggregation` ET de `direction`. Le meilleur sprint est le plus COURT, le
 * meilleur saut est le plus HAUT — un écran qui décide seul se trompera sur la
 * moitié du catalogue.
 *
 * Un essai vidé est supprimé plutôt qu'écrit à zéro : sur un chrono, un zéro
 * ferait du joueur non testé le plus rapide du club.
 */
export async function saveResults(
  sessionId: string,
  inputs: ResultInput[],
  testTypes: PhysicalTestType[],
): Promise<void> {
  const typeById = new Map(testTypes.map((t) => [t.id, t]));
  const rows: Array<Record<string, unknown>> = [];
  const toDelete: Array<{ playerId: string; testTypeId: string; attempts: number[] }> = [];

  for (const input of inputs) {
    const type = typeById.get(input.testTypeId);
    if (!type) continue;

    const filled = input.attempts.filter((a) => a.value !== null);
    const emptied = input.attempts.filter((a) => a.value === null).map((a) => a.attempt);
    if (emptied.length > 0) {
      toDelete.push({
        playerId: input.playerId,
        testTypeId: input.testTypeId,
        attempts: emptied,
      });
    }
    if (filled.length === 0) continue;

    const values = filled.map((a) => a.value as number);
    const retained = new Set(retainedAttemptIndexes(values, type.aggregation, type.direction));

    filled.forEach((attemptInput, index) => {
      rows.push({
        session_id: sessionId,
        player_id: input.playerId,
        test_type_id: input.testTypeId,
        attempt: attemptInput.attempt,
        value: attemptInput.value,
        is_retained: retained.has(index),
        note: input.note ?? null,
      });
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from('physical_test_results')
      .upsert(rows, { onConflict: 'session_id,player_id,test_type_id,attempt' });
    if (error) throw error;
  }

  for (const entry of toDelete) {
    const { error } = await supabase
      .from('physical_test_results')
      .delete()
      .eq('session_id', sessionId)
      .eq('player_id', entry.playerId)
      .eq('test_type_id', entry.testTypeId)
      .in('attempt', entry.attempts);
    if (error) throw error;
  }
}
