import { supabase } from '../supabase';

export interface RecruitData {
  id: string;
  name: string;
  position: string;
  notes: string;
}

export interface TeamPlanningState {
  hierarchyCount: number;
  slots: { [hierarchy: number]: string[] };
  hierarchyNames?: { [hierarchy: number]: string };
}

export interface SeasonSnapshot {
  playerStatuses: { [playerId: string]: string };
  playerTeams:    { [playerId: string]: string[] };
}

export interface PlanningData {
  teams:      { [teamId: string]: TeamPlanningState };
  departures: string[];
  unassigned: string[];
  recruits:   { [recruitId: string]: RecruitData };
  confirmed:  string[];
  appliedAt?: string;
  snapshot?:  SeasonSnapshot;
}

function isRealPlayer(id: string): boolean {
  return !id.startsWith('recruit|');
}

export async function loadSeasonPlanning(clubId: string, season: string): Promise<PlanningData | null> {
  const { data, error } = await supabase
    .from('season_planning')
    .select('data')
    .eq('club_id', clubId)
    .eq('season', season)
    .maybeSingle();
  if (error) throw error;
  return data ? (data.data as PlanningData) : null;
}

export async function saveSeasonPlanning(clubId: string, season: string, planningData: PlanningData): Promise<void> {
  const { error } = await supabase
    .from('season_planning')
    .upsert(
      { club_id: clubId, season, data: planningData, updated_at: new Date().toISOString() },
      { onConflict: 'club_id,season' }
    );
  if (error) throw error;
}

export async function listSeasons(clubId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('season_planning')
    .select('season')
    .eq('club_id', clubId)
    .order('season', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: { season: string }) => r.season);
}

export async function applySeasonPlan(
  clubId: string,
  season: string,
  planning: PlanningData
): Promise<PlanningData> {
  // Collect all real player IDs referenced in the plan
  const allPlayerIds = new Set<string>();
  for (const id of planning.departures) { if (isRealPlayer(id)) allPlayerIds.add(id); }
  for (const id of planning.unassigned) { if (isRealPlayer(id)) allPlayerIds.add(id); }
  for (const teamState of Object.values(planning.teams)) {
    for (const ids of Object.values(teamState.slots)) {
      for (const id of ids) { if (isRealPlayer(id)) allPlayerIds.add(id); }
    }
  }
  const playerIdList = Array.from(allPlayerIds);

  // 1. Snapshot current state
  const [playersRes, ptRes] = await Promise.all([
    supabase.from('players').select('id, status').in('id', playerIdList),
    supabase.from('player_teams').select('player_id, team_id').in('player_id', playerIdList),
  ]);
  if (playersRes.error) throw playersRes.error;
  if (ptRes.error) throw ptRes.error;

  const snapshot: SeasonSnapshot = { playerStatuses: {}, playerTeams: {} };
  for (const row of playersRes.data ?? []) {
    snapshot.playerStatuses[row.id] = row.status;
  }
  for (const row of ptRes.data ?? []) {
    if (!snapshot.playerTeams[row.player_id]) snapshot.playerTeams[row.player_id] = [];
    snapshot.playerTeams[row.player_id].push(row.team_id);
  }

  // 2. Apply departures
  const departureIds = planning.departures.filter(isRealPlayer);
  if (departureIds.length > 0) {
    const { error } = await supabase.from('players').update({ status: 'left' }).in('id', departureIds);
    if (error) throw error;
  }

  // 3. Reassign team memberships
  const targetTeams: { [playerId: string]: string[] } = {};
  for (const [teamId, teamState] of Object.entries(planning.teams)) {
    for (const ids of Object.values(teamState.slots)) {
      for (const id of ids) {
        if (!isRealPlayer(id)) continue;
        if (!targetTeams[id]) targetTeams[id] = [];
        if (!targetTeams[id].includes(teamId)) targetTeams[id].push(teamId);
      }
    }
  }

  const assignedPlayerIds = Object.keys(targetTeams);
  if (assignedPlayerIds.length > 0) {
    const { error: delError } = await supabase
      .from('player_teams')
      .delete()
      .in('player_id', assignedPlayerIds);
    if (delError) throw delError;

    const rows = assignedPlayerIds.flatMap(playerId =>
      targetTeams[playerId].map(teamId => ({ player_id: playerId, team_id: teamId }))
    );
    if (rows.length > 0) {
      const { error: insError } = await supabase.from('player_teams').insert(rows);
      if (insError) throw insError;
    }
  }

  return { ...planning, appliedAt: new Date().toISOString(), snapshot };
}

export async function revertSeasonPlan(planning: PlanningData): Promise<PlanningData> {
  if (!planning.snapshot) throw new Error('Aucun snapshot disponible pour annuler.');

  const { playerStatuses, playerTeams } = planning.snapshot;
  const playerIds = Object.keys(playerStatuses);

  if (playerIds.length > 0) {
    // Restore statuses (batch by status value)
    const byStatus: { [status: string]: string[] } = {};
    for (const [id, status] of Object.entries(playerStatuses)) {
      if (!byStatus[status]) byStatus[status] = [];
      byStatus[status].push(id);
    }
    for (const [status, ids] of Object.entries(byStatus)) {
      const { error } = await supabase.from('players').update({ status }).in('id', ids);
      if (error) throw error;
    }
  }

  // Restore team memberships
  const affectedPlayerIds = Object.keys(playerTeams);
  const allAssigned = new Set<string>();
  for (const teamState of Object.values(planning.teams)) {
    for (const ids of Object.values(teamState.slots)) {
      for (const id of ids) { if (isRealPlayer(id)) allAssigned.add(id); }
    }
  }
  const toClean = Array.from(new Set([...affectedPlayerIds, ...Array.from(allAssigned)]));

  if (toClean.length > 0) {
    const { error: delError } = await supabase.from('player_teams').delete().in('player_id', toClean);
    if (delError) throw delError;
  }

  const rows = Object.entries(playerTeams).flatMap(([playerId, teamIds]) =>
    teamIds.map(teamId => ({ player_id: playerId, team_id: teamId }))
  );
  if (rows.length > 0) {
    const { error: insError } = await supabase.from('player_teams').insert(rows);
    if (insError) throw insError;
  }

  const next = { ...planning };
  delete next.appliedAt;
  delete next.snapshot;
  return next;
}
