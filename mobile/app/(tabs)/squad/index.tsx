import { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useIsTablet } from '../../../hooks/useIsTablet';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { getPlayersByTeam, deletePlayer } from '../../../lib/services/players';
import type { Player } from '../../../types';

export default function SquadScreen() {
  const router = useRouter();
  const isTablet = useIsTablet();
  const { activeTeamId } = useActiveTeam();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeTeamId) {
      setPlayers([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const data = await getPlayersByTeam(activeTeamId);
      setPlayers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement');
      setPlayers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTeamId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleDeletePlayer = useCallback((player: Player, close: () => void) => {
    Alert.alert(
      'Supprimer',
      `Voulez-vous vraiment supprimer ${player.first_name} ${player.last_name} ?`,
      [
        { text: 'Annuler', style: 'cancel', onPress: close },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePlayer(player.id);
              setPlayers((prev) => prev.filter((p) => p.id !== player.id));
              close();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Erreur lors de la suppression');
            }
          },
        },
      ]
    );
  }, []);

  if (!activeTeamId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Choisissez une équipe dans l'onglet Accueil</Text>
      </View>
    );
  }

  if (loading && players.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isTablet && (
        <View style={styles.tabletBar}>
          <Text style={styles.tabletBarTitle}>Équipe</Text>
          <TouchableOpacity
            style={styles.tabletAddBtn}
            onPress={() => router.push('/(tabs)/squad/new-player')}
            activeOpacity={0.8}
          >
            <Text style={styles.tabletAddBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={players}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3b82f6']} />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Aucun joueur dans cette équipe</Text>
          </View>
        }
        renderItem={({ item }) => {
          const renderRightActions = (_progress: unknown, _dragX: unknown, swipeable: { close: () => void }) => (
            <View style={styles.deleteAction}>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeletePlayer(item, () => swipeable.close())}
                activeOpacity={0.8}
              >
                <Text style={styles.deleteText}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          );
          return (
            <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push(`/(tabs)/squad/${item.id}`)}
                activeOpacity={0.7}
              >
                {item.number != null ? (
                  <View style={styles.numberBadge}>
                    <Text style={styles.numberText}>{item.number}</Text>
                  </View>
                ) : null}
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>
                    {item.first_name} {item.last_name}
                  </Text>
                  <Text style={styles.playerMeta}>
                    {item.position} · {item.strong_foot}
                  </Text>
                </View>
              </TouchableOpacity>
            </Swipeable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, color: '#6b7280' },
  errorText: { fontSize: 14, color: '#dc2626', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  deleteAction: {
    width: 90,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  numberBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  numberText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 16, fontWeight: '600', color: '#111' },
  playerMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  tabletBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#3b82f6',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  tabletBarTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  tabletAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabletAddBtnText: { color: '#fff', fontSize: 22, fontWeight: '600', lineHeight: 24 },
});
