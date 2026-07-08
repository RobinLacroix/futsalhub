import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppRole } from '../../contexts/AppRoleContext';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';
import { useActiveSeason } from '../../contexts/ActiveSeasonContext';
import {
  getPlayerStats,
  getPlayerRadarStats,
  type MatchTypeFilter,
  type PlayerRadarResult,
} from '../../lib/services/players';
import { getTrainingsByTeam } from '../../lib/services/trainings';
import { getMyOwnFeedbackHistory, type PlayerFeedbackRow } from '../../lib/services/feedback';
import { getMyPlayerTeamIds } from '../../lib/services/playerConvocations';
import { supabase } from '../../lib/supabase';
import type { PlayerEvent } from '../../types';
import { PlayerDetailView, type TrainingSession, type PlayerStats } from '../../components/PlayerDetailView';

export default function PlayerProfileScreen() {
  const { player } = useAppRole();
  const { teams: allTeams } = useActiveTeam();
  const { activeSeason } = useActiveSeason();

  const [teamId, setTeamId]               = useState<string | null>(null);
  const [stats, setStats]                 = useState<PlayerStats | null>(null);
  const [radarData, setRadarData]         = useState<PlayerRadarResult | null>(null);
  const [radarLoading, setRadarLoading]   = useState(false);
  const [feedbackRows, setFeedbackRows]   = useState<PlayerFeedbackRow[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [allSessions, setAllSessions]     = useState<TrainingSession[]>([]);
  const [initialEvents, setInitialEvents] = useState<PlayerEvent[]>([]);
  const [matchFilter, setMatchFilter]     = useState<MatchTypeFilter>('all');
  const [loading, setLoading]             = useState(true);

  const loadBaseData = useCallback(async () => {
    if (!player?.id) { setLoading(false); return; }
    try {
      const [teamIds, eventsRes] = await Promise.all([
        getMyPlayerTeamIds(),
        supabase.from('player_events').select('*').eq('player_id', player.id).order('event_date', { ascending: false }),
      ]);
      const tid = teamIds[0] ?? null;
      setTeamId(tid);
      setInitialEvents((eventsRes.data ?? []) as PlayerEvent[]);

      if (tid) {
        const trainings = await getTrainingsByTeam(tid, activeSeason);
        const sorted = [...(trainings ?? [])].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        setAllSessions(
          sorted.map(t => ({
            date: t.date,
            status: (t.attendance?.[player.id] ?? 'not_recorded') as TrainingSession['status'],
          }))
        );
      }
    } catch {
      // silently degrade — stats still load below
    } finally {
      setLoading(false);
    }
  }, [player?.id, activeSeason]);

  useEffect(() => { loadBaseData(); }, [loadBaseData]);

  useEffect(() => {
    if (!player?.id || !teamId) return;
    setStats(null);
    getPlayerStats(player.id, teamId, matchFilter).then(setStats).catch(() => setStats(null));
    setRadarLoading(true);
    getPlayerRadarStats(player.id, teamId, matchFilter)
      .then(setRadarData)
      .catch(() => setRadarData(null))
      .finally(() => setRadarLoading(false));
  }, [player?.id, teamId, matchFilter]);

  useEffect(() => {
    if (!player?.id) return;
    setFeedbackLoading(true);
    getMyOwnFeedbackHistory()
      .then(setFeedbackRows)
      .catch(() => setFeedbackRows([]))
      .finally(() => setFeedbackLoading(false));
  }, [player?.id]);

  if (!player) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Profil joueur non disponible</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  // Équipes auxquelles appartient le joueur (lecture seule)
  const playerTeams = allTeams.filter(t => t.id === teamId);

  return (
    <PlayerDetailView
      player={player}
      playerTeams={playerTeams}
      availableTeams={[]}
      stats={stats}
      radarData={radarData}
      radarLoading={radarLoading}
      feedbackRows={feedbackRows}
      feedbackLoading={feedbackLoading}
      allSessions={allSessions}
      initialEvents={initialEvents}
      matchFilter={matchFilter}
      updatingTeamId={null}
      isManager={false}
      onMatchFilterChange={setMatchFilter}
    />
  );
}

const styles = StyleSheet.create({
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, color: '#6b7280' },
});
