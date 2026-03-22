import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useIsTablet } from '../../hooks/useIsTablet';
import { supabase } from '../../lib/supabase';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';
import { getUserClubId } from '../../lib/services/clubs';

export default function HomeScreen() {
  const [email, setEmail] = useState<string | null>(null);
  const [hasNoClub, setHasNoClub] = useState<boolean | null>(null);
  const router = useRouter();
  const isTablet = useIsTablet();
  const { activeTeam, teams, loading: teamsLoading, setActiveTeamId, refetchTeams } = useActiveTeam();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? null);
    });
  }, []);

  // Recharger les équipes à chaque fois qu’on arrive sur l’Accueil (après connexion ou retour d’un autre onglet)
  useEffect(() => {
    refetchTeams();
  }, [refetchTeams]);

  const checkUserClub = useCallback(async () => {
    if (!teamsLoading && teams.length === 0) {
      try {
        const clubId = await getUserClubId();
        setHasNoClub(clubId === null);
      } catch {
        setHasNoClub(false);
      }
    } else {
      setHasNoClub(false);
    }
  }, [teamsLoading, teams.length]);

  useEffect(() => {
    checkUserClub();
  }, [checkUserClub]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/sign-in');
  };

  const handleSelectTeam = async (teamId: string) => {
    const teamName = teams.find((t) => t.id === teamId)?.name ?? 'Équipe';
    await setActiveTeamId(teamId);
    Alert.alert('Équipe sélectionnée', `${teamName} est maintenant l’équipe active.`);
  };

  const handleAddTeam = () => {
    router.push('/(tabs)/teams');
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.welcome}>Bienvenue sur FutsalHub</Text>
      {email ? <Text style={styles.email}>Connecté : {email}</Text> : null}

      <View style={styles.teamSection}>
        <Text style={styles.teamLabel}>Équipe active</Text>
        {teamsLoading ? (
          <ActivityIndicator size="small" color="#3b82f6" />
        ) : hasNoClub ? (
          <View style={styles.noClubBox}>
            <Text style={styles.noClubTitle}>Aucun club</Text>
            <Text style={styles.noClubText}>
              Vous n'avez pas encore de club. Créez-en un pour gérer vos équipes et vos joueurs.
            </Text>
            <TouchableOpacity
              style={styles.createClubBtn}
              onPress={() => router.push('/(tabs)/create-club')}
              activeOpacity={0.8}
            >
              <Text style={styles.createClubBtnText}>Créer un club</Text>
            </TouchableOpacity>
          </View>
        ) : teams.length === 0 ? (
          <View style={styles.noTeamBox}>
            <Text style={styles.teamEmpty}>Aucune équipe</Text>
            <TouchableOpacity
              style={styles.addTeamButton}
              onPress={handleAddTeam}
              activeOpacity={0.8}
            >
              <Text style={styles.addTeamButtonText}>Ajouter une équipe</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {activeTeam ? (
              <Text style={styles.teamName}>{activeTeam.name}</Text>
            ) : (
              <Text style={styles.teamHint}>Appuie sur une équipe ci‑dessous</Text>
            )}
            <View style={styles.teamList}>
              {teams.map((team) => (
                <TouchableOpacity
                  key={team.id}
                  style={[
                    styles.teamRow,
                    team.id === activeTeam?.id && styles.teamRowActive,
                  ]}
                  onPress={() => handleSelectTeam(team.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.teamRowText}>{team.name}</Text>
                  {team.id === activeTeam?.id ? (
                    <Text style={styles.teamRowCheck}>✓</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
            {isTablet && (
              <TouchableOpacity
                style={[styles.addTeamButton, { marginTop: 12 }]}
                onPress={handleAddTeam}
                activeOpacity={0.8}
              >
                <Text style={styles.addTeamButtonText}>Ajouter une équipe</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Déconnexion</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  welcome: { fontSize: 20, fontWeight: '600', color: '#111', marginBottom: 8 },
  email: { fontSize: 14, color: '#6b7280', marginBottom: 24 },
  teamSection: { width: '100%', marginBottom: 24, alignItems: 'center' },
  teamLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  teamName: { fontSize: 18, fontWeight: '600', color: '#111', marginBottom: 12 },
  teamHint: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  teamList: { width: '100%', maxWidth: 320 },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  teamRowActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  teamRowText: { fontSize: 17, fontWeight: '500', color: '#111' },
  teamRowCheck: { fontSize: 20, color: '#3b82f6', fontWeight: '700' },
  teamEmpty: { fontSize: 14, color: '#9ca3af' },
  noTeamBox: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  addTeamButton: {
    marginTop: 12,
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  addTeamButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  noClubBox: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#f59e0b',
    alignItems: 'center',
  },
  noClubTitle: { fontSize: 16, fontWeight: '600', color: '#92400e', marginBottom: 8 },
  noClubText: {
    fontSize: 14,
    color: '#b45309',
    textAlign: 'center',
    marginBottom: 16,
  },
  createClubBtn: {
    backgroundColor: '#d97706',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  createClubBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  signOutButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#ef4444',
    borderRadius: 8,
  },
  signOutText: { color: '#fff', fontWeight: '600' },
});
