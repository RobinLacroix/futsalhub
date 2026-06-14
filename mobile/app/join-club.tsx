import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppRole } from '../contexts/AppRoleContext';
import { claimPlayerLinkCode } from '../lib/services/playerConvocations';

export default function JoinClubScreen() {
  const router = useRouter();
  const { refetch } = useAppRole();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      Alert.alert('Code requis', 'Veuillez saisir le code partagé par votre coach.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await claimPlayerLinkCode(trimmed);
      if (result.ok) {
        await refetch();
        router.replace('/(player-tabs)');
      } else {
        Alert.alert('Erreur', result.error ?? 'Impossible de lier le compte.');
      }
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} disabled={submitting}>
          <Ionicons name="chevron-back" size={22} color="#374151" />
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
      <View style={styles.content}>
        <Text style={styles.title}>Rejoindre le club</Text>
        <Text style={styles.subtitle}>
          Aucun profil joueur n'est rattaché à votre compte. Saisissez le code que votre coach vous a communiqué pour accéder à votre espace joueur (convocations, fiche, questionnaires).
        </Text>

        <Text style={styles.label}>Code de liaison</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={(t) => setCode(t.replace(/\s/g, '').toUpperCase())}
          placeholder="Ex. ABC12XYZ"
          placeholderTextColor="#9ca3af"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          editable={!submitting}
        />

        <TouchableOpacity
          style={[styles.btn, submitting && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.btnText}>Valider le code</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.hint}>
          Le code est valable 24 h. Si vous êtes aussi coach, vous pourrez basculer vers l'espace coach depuis l'en-tête.
        </Text>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  backText: { fontSize: 16, color: '#374151', fontWeight: '500' },
  content: { flex: 1, padding: 24, justifyContent: 'center', maxWidth: 400, alignSelf: 'center', width: '100%' },
  title: { fontSize: 22, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 12 },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    letterSpacing: 2,
    borderWidth: 2,
    borderColor: '#16a34a',
    marginBottom: 20,
  },
  btn: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  hint: { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 24, lineHeight: 18 },
});
