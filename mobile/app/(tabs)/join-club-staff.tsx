import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { acceptClubInvitation } from '../../lib/services/clubs';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';

export default function JoinClubStaffScreen() {
  const router = useRouter();
  const { refetchTeams } = useActiveTeam();
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      Alert.alert('Code requis', 'Veuillez saisir le code d\'invitation recu.');
      return;
    }
    setSubmitting(true);
    try {
      await acceptClubInvitation(trimmed);
      await refetchTeams();
      Alert.alert('Club rejoint !', 'Vous avez rejoint le club avec succes.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Code invalide ou expire.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.iconWrap}>
          <Ionicons name="enter-outline" size={40} color="#7c3aed" />
        </View>
        <Text style={styles.title}>Rejoindre un club</Text>
        <Text style={styles.subtitle}>
          Saisissez le code d'invitation que l'administrateur du club vous a transmis via FutsalHub.
        </Text>

        <Text style={styles.label}>Code d'invitation</Text>
        <TextInput
          style={styles.input}
          value={token}
          onChangeText={setToken}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
        />

        <TouchableOpacity
          style={[styles.btn, submitting && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.btnText}>Rejoindre le club</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} disabled={submitting}>
          <Text style={styles.cancelBtnText}>Annuler</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Le code est valable 7 jours. Contactez l'administrateur de votre club pour obtenir une invitation.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  scroll: { flex: 1 },
  content: {
    padding: 28,
    paddingTop: 40,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#f5f3ff',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 28, lineHeight: 22 },
  label: { fontSize: 12, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#7c3aed',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
    color: '#111',
    marginBottom: 20,
    fontFamily: 'monospace',
  },
  btn: {
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelBtnText: { fontSize: 16, color: '#6b7280' },
  hint: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 20, lineHeight: 18 },
});
