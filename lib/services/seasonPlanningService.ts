import { supabase } from '../supabaseClient';

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
  // Status of each real player before application
  playerStatuses: { [playerId: string]: string };
  // Team IDs of each real player before application
  playerTeams: { [playerId: string]: string[] };
}

export interface PlanningData {
  teams: { [teamId: string]: TeamPlanningState };
  departures: string[];
  unassigned: string[];
  recruits: { [recruitId: string]: RecruitData };
  confirmed: string[]; // card IDs whose placement is validated
  // Set when the plan has been applied to real data
  appliedAt?: string;
  snapshot?: SeasonSnapshot;
}

function isRealPlayer(id: string): boolean {
  return !id.startsWith('recruit|');
}

export const seasonPlanningService = {
  async load(clubId: string, season: string): Promise<PlanningData | null> {
    const { data, error } = await supabase
      .from('season_planning')
      .select('data')
      .eq('club_id', clubId)
      .eq('season', season)
      .maybeSingle();
    if (error) throw error;
    return data ? (data.data as PlanningData) : null;
  },

  async save(clubId: string, season: string, planningData: PlanningData): Promise<void> {
    const { error } = await supabase
      .from('season_planning')
      .upsert(
        { club_id: clubId, season, data: planningData, updated_at: new Date().toISOString() },
        { onConflict: 'club_id,season' }
      );
    if (error) throw error;
  },

  async listSeasons(clubId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('season_planning')
      .select('season')
      .eq('club_id', clubId)
      .order('season', { ascending: false });
    if (error) throw error;
    return (data || []).map((r: { season: string }) => r.season);
  },

  /**
   * Applies the season plan to real data:
   * 1. Snapshots current player statuses + team memberships
   * 2. Marks departed players as status='left'
   * 3. Reassigns player_teams according to team slots in the plan
   * Returns the updated PlanningData (with appliedAt + snapshot) to be saved by the caller.
   */
  async applySeasonPlan(
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

    // ── 1. Snapshot current state ────────────────────────────────────────────
    const [playersRes, ptRes] = await Promise.all([
      supabase.from('players').select('id, status').in('id', playerIdList),
      supabase.from('player_teams').select('player_id, team_id').in('player_id', playerIdList),
    ]);
    if (playersRes.error) throw playersRes.error;
    if (ptRes.error) throw ptRes.error;

    const snapshot: SeasonSnapshot = {
      playerStatuses: {},
      playerTeams: {},
    };
    for (const row of playersRes.data ?? []) {
      snapshot.playerStatuses[row.id] = row.status;
    }
    for (const row of ptRes.data ?? []) {
      if (!snapshot.playerTeams[row.player_id]) snapshot.playerTeams[row.player_id] = [];
      snapshot.playerTeams[row.player_id].push(row.team_id);
    }

    // ── 2. Apply departures ──────────────────────────────────────────────────
    const departureIds = planning.departures.filter(isRealPlayer);
    if (departureIds.length > 0) {
      const { error } = await supabase
        .from('players')
        .update({ status: 'left' })
        .in('id', departureIds);
      if (error) throw error;
    }

    // ── 3. Reassign team memberships ─────────────────────────────────────────
    // Build the target map: playerId → [teamId, ...]
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

    // Only touch players that have team assignments in the plan (not unassigned/departed)
    const assignedPlayerIds = Object.keys(targetTeams);
    if (assignedPlayerIds.length > 0) {
      // Delete existing memberships for these players
      const { error: delError } = await supabase
        .from('player_teams')
        .delete()
        .in('player_id', assignedPlayerIds);
      if (delError) throw delError;

      // Insert new memberships
      const rows = assignedPlayerIds.flatMap((playerId) =>
        targetTeams[playerId].map((teamId) => ({ player_id: playerId, team_id: teamId }))
      );
      if (rows.length > 0) {
        const { error: insError } = await supabase.from('player_teams').insert(rows);
        if (insError) throw insError;
      }
    }

    // ── 4. Return updated planning with snapshot ─────────────────────────────
    return { ...planning, appliedAt: new Date().toISOString(), snapshot };
  },

  /**
   * Reverts a previously applied plan:
   * 1. Restores player statuses from snapshot
   * 2. Restores player_teams from snapshot
   * Returns the updated PlanningData (without appliedAt/snapshot) to be saved by the caller.
   */
  async revertSeasonPlan(planning: PlanningData): Promise<PlanningData> {
    if (!planning.snapshot) throw new Error('Aucun snapshot disponible pour annuler.');

    const { playerStatuses, playerTeams } = planning.snapshot;
    const playerIds = Object.keys(playerStatuses);

    if (playerIds.length === 0) {
      const next = { ...planning };
      delete next.appliedAt;
      delete next.snapshot;
      return next;
    }

    // ── 1. Restore statuses ──────────────────────────────────────────────────
    // Group players by status to batch updates
    const byStatus: { [status: string]: string[] } = {};
    for (const [id, status] of Object.entries(playerStatuses)) {
      if (!byStatus[status]) byStatus[status] = [];
      byStatus[status].push(id);
    }
    for (const [status, ids] of Object.entries(byStatus)) {
      const { error } = await supabase.from('players').update({ status }).in('id', ids);
      if (error) throw error;
    }

    // ── 2. Restore team memberships ──────────────────────────────────────────
    const affectedPlayerIds = Object.keys(playerTeams);

    // Also clear players that were in teams in the plan (may not be in snapshot.playerTeams
    // if they had no team before)
    const allAssigned = new Set<string>();
    for (const teamState of Object.values(planning.teams)) {
      for (const ids of Object.values(teamState.slots)) {
        for (const id of ids) { if (isRealPlayer(id)) allAssigned.add(id); }
      }
    }
    const toClean = Array.from(new Set([...affectedPlayerIds, ...Array.from(allAssigned)]));

    if (toClean.length > 0) {
      const { error: delError } = await supabase
        .from('player_teams')
        .delete()
        .in('player_id', toClean);
      if (delError) throw delError;
    }

    const rows = Object.entries(playerTeams).flatMap(([playerId, teamIds]) =>
      teamIds.map((teamId) => ({ player_id: playerId, team_id: teamId }))
    );
    if (rows.length > 0) {
      const { error: insError } = await supabase.from('player_teams').insert(rows);
      if (insError) throw insError;
    }

    // ── 3. Return cleaned planning ───────────────────────────────────────────
    const next = { ...planning };
    delete next.appliedAt;
    delete next.snapshot;
    return next;
  },
};
