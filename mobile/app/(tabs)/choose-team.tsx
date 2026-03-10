import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';

export default function ChooseTeamScreen() {
  const router = useRouter();
  const { teams, loading, activeTeamId, setActiveTeamId } = useActiveTeam();

  const handleSelect = async (teamId: string) => {
    await setActiveTeamId(teamId);
    router.back();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Retour</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Choisir une équipe</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" style={styles.loader} />
      ) : teams.length === 0 ? (
        <Text style={styles.empty}>Aucune équipe disponible</Text>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {teams.map((team) => (
            <TouchableOpacity
              key={team.id}
              style={[styles.row, team.id === activeTeamId && styles.rowActive]}
              onPress={() => handleSelect(team.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.rowText}>{team.name}</Text>
              {team.id === activeTeamId ? (
                <Text style={styles.checkmark}>✓</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', padding: 16 },
  backBtn: { marginBottom: 16 },
  backBtnText: { fontSize: 16, color: '#3b82f6' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 20 },
  loader: { marginTop: 24 },
  empty: { fontSize: 16, color: '#6b7280', marginTop: 24 },
  list: { flex: 1 },
  listContent: { paddingBottom: 32 },
  row: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowActive: { backgroundColor: '#dbeafe', borderWidth: 2, borderColor: '#3b82f6' },
  rowText: { fontSize: 16, fontWeight: '500', color: '#111' },
  checkmark: { fontSize: 18, color: '#3b82f6', fontWeight: '700' },
});
