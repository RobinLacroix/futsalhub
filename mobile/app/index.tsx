import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useAppRole } from '../contexts/AppRoleContext';

/**
 * Démarrage direct sur la galerie du design system, pour vérifier le rendu sans
 * passer par l'authentification.
 *
 * Double garde : `__DEV__` (faux dans tout build de production) ET une variable
 * d'environnement explicite. Inerte tant qu'on ne lance pas Metro avec
 * `EXPO_PUBLIC_DEV_GALLERY=1`. À retirer à la fin de la refonte UI.
 */
const DEV_GALLERY_BOOT = __DEV__ && process.env.EXPO_PUBLIC_DEV_GALLERY === '1';

export default function Index() {
  const { session, loading, isPlayer, isCoach, appRole, setAppRole } = useAppRole();

  useEffect(() => {
    if (!loading && session && isCoach && appRole !== 'coach') {
      setAppRole('coach');
    }
  }, [loading, session, isCoach, appRole, setAppRole]);

  if (DEV_GALLERY_BOOT) return <Redirect href={'/design-gallery' as any} />;

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

  // Ni club en tant que staff ni profil joueur → accueil avec les 3 options
  // (créer un club / rejoindre en tant que staff / lier un profil joueur).
  return <Redirect href="/(tabs)" />;
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
