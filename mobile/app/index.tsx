import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useAppRole } from '../contexts/AppRoleContext';

export default function Index() {
  const { session, loading, isPlayer, isCoach, appRole, setAppRole } = useAppRole();

  useEffect(() => {
    if (!loading && session && isCoach && appRole !== 'coach') {
      setAppRole('coach');
    }
  }, [loading, session, isCoach, appRole, setAppRole]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Chargement…</Text>
      </View>
    );
  }

  if (!session) return <Redirect href="/sign-in" />;

  // Profil coach (avec ou sans profil joueur) → accueil manager
  if (isCoach) {
    if (appRole === 'coach') return <Redirect href="/(tabs)" />;
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  // Profil joueur uniquement → espace joueur
  if (isPlayer) return <Redirect href="/(player-tabs)" />;

  // Ni équipe en tant que manager ni profil joueur → partie joueur (rejoindre le club)
  return <Redirect href="/join-club" />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
});
