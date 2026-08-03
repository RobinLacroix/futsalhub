import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { format, isValid, parse } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTheme } from '../../../contexts/ThemeContext';
import { useIsTablet } from '../../../hooks/useIsTablet';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { useActiveSeason } from '../../../contexts/ActiveSeasonContext';
import {
  getPlayerById,
  getPlayerStats,
  getPlayerTeams,
  getPlayerRadarStats,
  updatePlayer,
  addPlayerToTeam,
  removePlayerFromTeam,
  type MatchTypeFilter,
  type PlayerRadarResult,
} from '../../../lib/services/players';
import { getTrainingsByTeam } from '../../../lib/services/trainings';
import { getMatchesByTeam } from '../../../lib/services/matches';
import { getMatchPlayerRatingsBulk } from '../../../lib/services/matchRatings';
import { getPlayerFeedbackHistory, type PlayerFeedbackRow } from '../../../lib/services/feedback';
import { supabase } from '../../../lib/supabase';
import type { Player, Team, PlayerEvent } from '../../../types';
import { PlayerDetailView, type TrainingSession, type PlayerStats } from '../../../components/PlayerDetailView';
import {
  Button,
  Field,
  Input,
  ChipGroup,
  Sheet,
  EmptyState,
  SkeletonDetail,
  type ChipOption,
} from '../../../components/ui';
import {
  POSITIONS,
  STRONG_FOOT_OPTIONS,
  PLAYER_STATUS_OPTIONS,
} from '../../../components/players/positions';

const POSITION_CHIPS: readonly ChipOption<string>[] = POSITIONS.map(p => ({ value: p.key, label: p.label }));
const FOOT_CHIPS: readonly ChipOption<string>[] = STRONG_FOOT_OPTIONS.map(o => ({ value: o.value, label: o.label }));
const STATUS_CHIPS: readonly ChipOption<string>[] = PLAYER_STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label }));

/**
 * La date de naissance était saisie et affichée en ISO `AAAA-MM-JJ`, comme sur
 * l'écran de création. Elle passe en JJ/MM/AAAA à la saisie, la conversion vers
 * l'ISO attendu par le service se fait ici.
 */
function isoToDisplay(iso?: string | null): string {
  if (!iso) return '';
  const d = parse(iso.slice(0, 10), 'yyyy-MM-dd', new Date());
  return isValid(d) ? format(d, 'dd/MM/yyyy', { locale: fr }) : '';
}

function displayToIso(input: string): { iso?: string; error?: string } {
  const raw = input.trim();
  if (!raw) return {};
  const d = parse(raw, 'dd/MM/yyyy', new Date(), { locale: fr });
  if (!isValid(d)) return { error: 'Format attendu : JJ/MM/AAAA.' };
  if (d.getFullYear() < 1900 || d > new Date()) return { error: 'Cette date est impossible.' };
  return { iso: format(d, 'yyyy-MM-dd') };
}

/** Action d'édition, posée dans le header natif du Stack. */
function HeaderEditButton({ onPress }: { onPress: () => void }) {
  return <Button label="Modifier" icon="create-outline" variant="ghost" size="sm" onPress={onPress} />;
}

export default function PlayerDetailScreen() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const isTablet = useIsTablet();
  const { activeTeamId, teams: allTeams } = useActiveTeam();
  const { activeSeason } = useActiveSeason();

  const [player, setPlayer]           = useState<Player | null>(null);
  const [playerTeams, setPlayerTeams] = useState<Team[]>([]);
  const [stats, setStats]             = useState<PlayerStats | null>(null);
  const [allSessions, setAllSessions] = useState<TrainingSession[]>([]);
  const [initialEvents, setInitialEvents] = useState<PlayerEvent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [matchFilter, setMatchFilter] = useState<MatchTypeFilter>('all');
  const [updatingTeamId, setUpdatingTeamId] = useState<string | null>(null);

  const [radarData, setRadarData]       = useState<PlayerRadarResult | null>(null);
  const [radarLoading, setRadarLoading] = useState(false);
  const [feedbackRows, setFeedbackRows]       = useState<PlayerFeedbackRow[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [ratingSeries, setRatingSeries]       = useState<{ date: string; rating: number }[]>([]);

  // ── Modal édition joueur ──────────────────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    first_name: '', last_name: '', birth_date: '',
    position: '', strong_foot: '', status: '',
    number: '', sequence_time_limit: '',
  });
  const [savingPlayer, setSavingPlayer] = useState(false);

  // ── Chargement données ────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!playerId) return;
    setError(null);
    try {
      const [playerData, teamsData, eventsRes] = await Promise.all([
        getPlayerById(playerId),
        getPlayerTeams(playerId),
        supabase.from('player_events').select('*').eq('player_id', playerId).order('event_date', { ascending: false }),
      ]);
      setPlayer(playerData ?? null);
      setPlayerTeams(teamsData ?? []);
      setInitialEvents((eventsRes.data ?? []) as PlayerEvent[]);
      if (!playerData) { setError('Joueur introuvable'); return; }
      if (activeTeamId) {
        const trainings = await getTrainingsByTeam(activeTeamId, activeSeason);
        const sorted = [...(trainings ?? [])].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        setAllSessions(
          sorted.map(t => ({
            date: t.date,
            status: (t.attendance?.[playerId] ?? 'not_recorded') as TrainingSession['status'],
          }))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [playerId, activeTeamId, activeSeason]);

  useEffect(() => { setLoading(true); loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!playerId || !activeTeamId) return;
    getPlayerStats(playerId, activeTeamId, matchFilter, activeSeason).then(setStats).catch(() => setStats(null));
    setRadarLoading(true);
    getPlayerRadarStats(playerId, activeTeamId, matchFilter, activeSeason)
      .then(setRadarData)
      .catch(() => setRadarData(null))
      .finally(() => setRadarLoading(false));
  }, [playerId, activeTeamId, matchFilter, activeSeason]);

  // Courbe note data (Volet B) : notes de match du joueur sur la saison/filtre.
  useEffect(() => {
    if (!playerId || !activeTeamId) { setRatingSeries([]); return; }
    (async () => {
      try {
        const teamMatches = await getMatchesByTeam(activeTeamId, activeSeason);
        const scoped = matchFilter === 'all'
          ? teamMatches
          : teamMatches.filter(m => m.competition === matchFilter);
        const rows = await getMatchPlayerRatingsBulk(scoped.map(m => m.id));
        setRatingSeries(
          rows
            .filter(r => r.player_id === playerId)
            .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())
            .map(r => ({ date: r.match_date, rating: r.rating }))
        );
      } catch {
        setRatingSeries([]);
      }
    })();
  }, [playerId, activeTeamId, matchFilter, activeSeason]);

  useEffect(() => {
    if (!playerId) return;
    setFeedbackLoading(true);
    getPlayerFeedbackHistory(playerId)
      .then(setFeedbackRows)
      .catch(() => setFeedbackRows([]))
      .finally(() => setFeedbackLoading(false));
  }, [playerId]);

  // ── Gestion équipes ───────────────────────────────────────────────────────

  const handleAddToTeam = useCallback(async (teamId: string) => {
    if (!playerId) return;
    setUpdatingTeamId(teamId);
    try {
      await addPlayerToTeam(playerId, teamId);
      const team = allTeams.find(t => t.id === teamId);
      if (team) setPlayerTeams(prev => [...prev, team].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible d\'assigner');
    } finally { setUpdatingTeamId(null); }
  }, [playerId, allTeams]);

  const handleRemoveFromTeam = useCallback((team: Team) => {
    if (!playerId) return;
    Alert.alert('Retirer de l\'équipe', `Retirer de ${team.name} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer', style: 'destructive',
        onPress: async () => {
          setUpdatingTeamId(team.id);
          try {
            await removePlayerFromTeam(playerId, team.id);
            setPlayerTeams(prev => prev.filter(t => t.id !== team.id));
          } catch (e) {
            Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de retirer');
          } finally { setUpdatingTeamId(null); }
        },
      },
    ]);
  }, [playerId]);

  // ── Édition joueur ────────────────────────────────────────────────────────

  const openEditModal = () => {
    if (!player) return;
    setEditForm({
      first_name:          player.first_name,
      last_name:           player.last_name,
      birth_date:          isoToDisplay(player.birth_date),
      position:            player.position ?? '',
      strong_foot:         player.strong_foot ?? '',
      status:              player.status ?? 'Actif',
      number:              player.number != null ? String(player.number) : '',
      sequence_time_limit: player.sequence_time_limit != null ? String(player.sequence_time_limit) : '',
    });
    setShowEditModal(true);
  };

  const handleSavePlayer = async () => {
    if (!playerId) return;
    setSavingPlayer(true);
    try {
      const updated = await updatePlayer(playerId, {
        first_name:          editForm.first_name.trim(),
        last_name:           editForm.last_name.trim(),
        birth_date:          displayToIso(editForm.birth_date).iso,
        position:            editForm.position || undefined,
        strong_foot:         editForm.strong_foot || undefined,
        status:              editForm.status || undefined,
        number:              editForm.number ? Number(editForm.number) : undefined,
        sequence_time_limit: editForm.sequence_time_limit ? Number(editForm.sequence_time_limit) : undefined,
      });
      setPlayer(updated);
      setShowEditModal(false);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible d\'enregistrer');
    } finally {
      setSavingPlayer(false);
    }
  };

  // ── États non nominaux ────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <SkeletonDetail />
      </View>
    );
  }

  if (error || !player) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <EmptyState
          icon="alert-circle-outline"
          tone="negative"
          title="Joueur introuvable"
          description={error ?? "Cette fiche n'existe plus."}
          action={{ label: 'Retour', onPress: () => router.back() }}
        />
      </View>
    );
  }

  const birthError = displayToIso(editForm.birth_date).error;

  const availableTeams = allTeams.filter(t => !playerTeams.some(pt => pt.id === t.id));

  return (
    <>
      {/* « Modifier » vit dans le header natif : le bandeau de la fiche portait
          sa propre ligne « ‹ Effectif / Modifier » juste sous le header système,
          soit deux barres de navigation empilées pour la même chose.

          Sur iPad, `squad/_layout` pose `headerShown: !isTablet` — il n'y a donc
          aucun header natif, et `headerRight` n'était rendu nulle part : le
          bouton « Modifier » avait purement disparu de la tablette, et le retour
          vers l'effectif avec lui. La ligne du bandeau reprend les deux, elle
          existe exactement pour ça. Même arbitrage que la barre iPad de
          `squad/index`. */}
      <Stack.Screen
        options={{
          title: `${player.first_name} ${player.last_name}`,
          headerRight: isTablet ? undefined : () => <HeaderEditButton onPress={openEditModal} />,
        }}
      />
      <PlayerDetailView
        onBack={isTablet ? () => router.back() : undefined}
        onEdit={isTablet ? openEditModal : undefined}
        player={player}
        playerTeams={playerTeams}
        availableTeams={availableTeams}
        stats={stats}
        radarData={radarData}
        radarLoading={radarLoading}
        feedbackRows={feedbackRows}
        feedbackLoading={feedbackLoading}
        ratingSeries={ratingSeries}
        allSessions={allSessions}
        initialEvents={initialEvents}
        matchFilter={matchFilter}
        updatingTeamId={updatingTeamId}
        isManager={true}
        onMatchFilterChange={setMatchFilter}
        onAddToTeam={handleAddToTeam}
        onRemoveFromTeam={handleRemoveFromTeam}
      />

      <Sheet
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Modifier le joueur"
        maxHeight="88%"
      >
        <View style={styles.form}>
          <View style={styles.row}>
            <Input
              label="Prénom"
              value={editForm.first_name}
              onChangeText={v => setEditForm(f => ({ ...f, first_name: v }))}
              placeholder="Prénom"
              autoCapitalize="words"
              containerStyle={styles.flex}
            />
            <Input
              label="Nom"
              value={editForm.last_name}
              onChangeText={v => setEditForm(f => ({ ...f, last_name: v }))}
              placeholder="Nom"
              autoCapitalize="words"
              containerStyle={styles.flex}
            />
          </View>

          <View style={styles.row}>
            <Input
              label="Date de naissance"
              optional
              value={editForm.birth_date}
              onChangeText={v => setEditForm(f => ({ ...f, birth_date: v }))}
              error={birthError}
              hint="JJ/MM/AAAA"
              placeholder="15/05/2000"
              keyboardType="numbers-and-punctuation"
              containerStyle={styles.flex}
            />
            <Input
              label="Numéro"
              optional
              value={editForm.number}
              onChangeText={v => setEditForm(f => ({ ...f, number: v.replace(/\D/g, '') }))}
              keyboardType="number-pad"
              placeholder="10"
              numeric
              containerStyle={styles.numberField}
            />
          </View>

          <Field label="Poste">
            <ChipGroup
              label="Poste du joueur"
              options={POSITION_CHIPS}
              value={editForm.position}
              onChange={v => setEditForm(f => ({ ...f, position: v }))}
            />
          </Field>

          <Field label="Pied fort">
            <ChipGroup
              label="Pied fort du joueur"
              options={FOOT_CHIPS}
              value={editForm.strong_foot}
              onChange={v => setEditForm(f => ({ ...f, strong_foot: v }))}
            />
          </Field>

          <Field label="Statut">
            <ChipGroup
              label="Statut du joueur"
              options={STATUS_CHIPS}
              value={editForm.status}
              onChange={v => setEditForm(f => ({ ...f, status: v }))}
            />
          </Field>

          <Input
            label="Limite de séquence"
            optional
            value={editForm.sequence_time_limit}
            onChangeText={v => setEditForm(f => ({ ...f, sequence_time_limit: v.replace(/\D/g, '') }))}
            keyboardType="number-pad"
            placeholder="10"
            hint="Durée maximale d'une séquence sur le terrain, en minutes."
            numeric
            containerStyle={styles.numberField}
          />

          <Button
            label={savingPlayer ? 'Enregistrement…' : 'Enregistrer'}
            onPress={handleSavePlayer}
            loading={savingPlayer}
            disabled={savingPlayer || !!birthError}
            size="lg"
            block
          />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  form: { gap: 16 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  numberField: { width: 118 },
});
