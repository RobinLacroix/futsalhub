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
import { useActiveTeam } from '../../contexts/ActiveTeamContext';
import { createUserClub } from '../../lib/services/clubs';

export default function CreateClubScreen() {
  const router = useRouter();
  const { refetchTeams, setActiveTeamId } = useActiveTeam();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Champ requis', 'Le nom du club est obligatoire.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { teamId } = await createUserClub({
        name: trimmedName,
        description: description.trim() || undefined,
        createFirstTeam: true,
      });
      await refetchTeams();
      if (teamId) await setActiveTeamId(teamId);
      Alert.alert(
        'Club créé',
        'Votre club et votre première équipe ont été créés.',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Impossible de créer le club';
      setError(msg);
      Alert.alert('Erreur', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Créer un club</Text>
        <Text style={styles.subtitle}>
          Vous n'avez pas encore de club. Créez-en un pour gérer vos équipes et vos joueurs.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Nom du club *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="ex: Club de Futsal"
            placeholderTextColor="#9ca3af"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description (optionnel)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Quelques mots sur votre club..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
          />
        </View>

        <Text style={styles.hint}>
          Une première équipe « Équipe principale » sera créée automatiquement.
        </Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving}
        >
          <Text style={styles.submitBtnText}>{saving ? 'Création…' : 'Créer le club'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} disabled={saving}>
          <Text style={styles.cancelBtnText}>Annuler</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  scroll: { flex: 1 },
  content: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#6b7280', marginBottom: 24 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#111',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  hint: { fontSize: 13, color: '#9ca3af', marginBottom: 24 },
  errorText: { fontSize: 14, color: '#dc2626', marginBottom: 16 },
  submitBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelBtnText: { fontSize: 16, color: '#6b7280' },
});
