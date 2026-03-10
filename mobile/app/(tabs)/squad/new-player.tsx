import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { createPlayer } from '../../../lib/services/players';

const POSITION_OPTIONS = ['Gardien', 'Ailier', 'Pivot'] as const;
const STRONG_FOOT_OPTIONS = ['Droit', 'Gauche', 'Droit et gauche'] as const;

export default function NewPlayerScreen() {
  const router = useRouter();
  const { activeTeamId } = useActiveTeam();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [ageStr, setAgeStr] = useState('');
  const [position, setPosition] = useState<typeof POSITION_OPTIONS[number]>('Ailier');
  const [strongFoot, setStrongFoot] = useState<typeof STRONG_FOOT_OPTIONS[number]>('Droit');
  const [numberStr, setNumberStr] = useState('');

  const handleSubmit = async () => {
    if (!activeTeamId) {
      Alert.alert('Erreur', "Aucune équipe sélectionnée. Choisissez une équipe dans l'onglet Accueil.");
      return;
    }
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (!trimmedFirst || !trimmedLast) {
      Alert.alert('Champs requis', 'Prénom et nom sont obligatoires.');
      return;
    }
    const age = parseInt(ageStr.trim(), 10);
    if (Number.isNaN(age) || age < 1 || age > 99) {
      Alert.alert('Âge invalide', 'Indiquez un âge entre 1 et 99.');
      return;
    }
    const num = numberStr.trim() ? parseInt(numberStr.trim(), 10) : undefined;
    if (num !== undefined && (Number.isNaN(num) || num < 0 || num > 99)) {
      Alert.alert('Numéro invalide', 'Le numéro doit être entre 0 et 99.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const player = await createPlayer(activeTeamId, {
        first_name: trimmedFirst,
        last_name: trimmedLast,
        age,
        position,
        strong_foot: strongFoot,
        number: num,
      });
      Alert.alert(
        'Joueur ajouté',
        `${player.first_name} ${player.last_name} a été ajouté à l'équipe.`,
        [
          { text: 'Voir la fiche', onPress: () => router.replace(`/(tabs)/squad/${player.id}`) },
          { text: 'Retour à l\'équipe', onPress: () => router.replace('/(tabs)/squad') },
        ]
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Impossible de créer le joueur';
      setError(msg);
      Alert.alert('Erreur', msg);
    } finally {
      setSaving(false);
    }
  };

  if (!activeTeamId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Choisissez une équipe dans l'onglet Accueil</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.screenTitle}>Nouveau joueur</Text>
        <Text style={styles.screenSubtitle}>Renseignez les informations du joueur.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Prénom *</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Prénom"
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Nom *</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Nom"
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Âge *</Text>
          <TextInput
            style={styles.input}
            value={ageStr}
            onChangeText={setAgeStr}
            placeholder="Âge"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Poste</Text>
          <View style={styles.chipRow}>
            {POSITION_OPTIONS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.chip, position === p && styles.chipActive]}
                onPress={() => setPosition(p)}
              >
                <Text style={[styles.chipText, position === p && styles.chipTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Pied fort</Text>
          <View style={styles.chipRow}>
            {STRONG_FOOT_OPTIONS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.chip, strongFoot === f && styles.chipActive]}
                onPress={() => setStrongFoot(f)}
              >
                <Text style={[styles.chipText, strongFoot === f && styles.chipTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Numéro (optionnel)</Text>
          <TextInput
            style={styles.input}
            value={numberStr}
            onChangeText={setNumberStr}
            placeholder="ex: 7"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving}
        >
          <Text style={styles.submitBtnText}>{saving ? 'Ajout…' : 'Ajouter le joueur'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, color: '#6b7280' },
  screenTitle: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 4 },
  screenSubtitle: { fontSize: 14, color: '#6b7280', marginBottom: 24 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#111',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  errorText: { fontSize: 14, color: '#dc2626', marginBottom: 16 },
  submitBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
