import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useAppRole } from '../contexts/AppRoleContext';
import { supabase } from '../lib/supabase';

/** Affiche "Espace coach" dans l’interface joueur (si isCoach). */
export function SwitchToCoachButton() {
  const router = useRouter();
  const { isCoach, setAppRole } = useAppRole();
  if (!isCoach) return null;
  const handlePress = async () => {
    await setAppRole('coach');
    router.replace('/(tabs)');
  };
  return (
    <TouchableOpacity onPress={handlePress} style={styles.btn}>
      <Text style={styles.label}>Espace coach</Text>
    </TouchableOpacity>
  );
}

/** Affiche "Espace joueur" dans l’interface coach (si isPlayer). */
export function SwitchToPlayerButton() {
  const router = useRouter();
  const { isPlayer, setAppRole } = useAppRole();
  if (!isPlayer) return null;
  const handlePress = async () => {
    await setAppRole('player');
    router.replace('/(player-tabs)');
  };
  return (
    <TouchableOpacity onPress={handlePress} style={styles.btn}>
      <Text style={styles.label}>Espace joueur</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: 12, paddingVertical: 8 },
  label: { color: '#fff', fontSize: 14, fontWeight: '600' },
});

/** Petit bouton icône pour se déconnecter (à mettre dans le header). */
export function SignOutIconButton() {
  const router = useRouter();
  const handlePress = async () => {
    await supabase.auth.signOut();
    router.replace('/sign-in');
  };
  return (
    <TouchableOpacity onPress={handlePress} style={signOutStyles.signOutBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      <Ionicons name="log-out-outline" size={22} color="#fff" />
    </TouchableOpacity>
  );
}

const signOutStyles = StyleSheet.create({
  signOutBtn: { paddingHorizontal: 8, paddingVertical: 8, marginLeft: 4 },
});
