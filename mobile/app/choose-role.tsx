import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppRole } from '../contexts/AppRoleContext';

export default function ChooseRoleScreen() {
  const router = useRouter();
  const { setAppRole } = useAppRole();

  const goCoach = async () => {
    await setAppRole('coach');
    router.replace('/(tabs)');
  };

  const goPlayer = async () => {
    await setAppRole('player');
    router.replace('/(player-tabs)');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choisir l&apos;espace</Text>
      <Text style={styles.subtitle}>
        Votre compte est à la fois joueur et coach. Choisissez l&apos;espace à ouvrir.
      </Text>

      <TouchableOpacity style={[styles.card, styles.cardCoach]} onPress={goCoach} activeOpacity={0.8}>
        <Text style={styles.cardEmoji}>👔</Text>
        <Text style={styles.cardTitle}>Espace coach</Text>
        <Text style={styles.cardText}>Calendrier, effectif, équipes</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.card, styles.cardPlayer]} onPress={goPlayer} activeOpacity={0.8}>
        <Text style={styles.cardEmoji}>⚽</Text>
        <Text style={styles.cardTitle}>Espace joueur</Text>
        <Text style={styles.cardText}>Convocations, ma fiche, questionnaires</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    padding: 24,
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 8 },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 2,
  },
  cardCoach: { borderColor: '#3b82f6' },
  cardPlayer: { borderColor: '#16a34a' },
  cardEmoji: { fontSize: 32, marginBottom: 8 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#111', marginBottom: 4 },
  cardText: { fontSize: 14, color: '#6b7280' },
});
