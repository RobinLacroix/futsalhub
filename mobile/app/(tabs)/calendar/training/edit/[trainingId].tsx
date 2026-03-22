import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

let DateTimePicker: import('react').ComponentType<any> | null = null;
try {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch {
  // ignore
}

import { getTrainingById, updateTraining } from '../../../../../lib/services/trainings';
import type { Training } from '../../../../../types';

const THEME_OPTIONS = ['Offensif', 'Défensif', 'Transition', 'Supériorité'] as const;
type TrainingTheme = (typeof THEME_OPTIONS)[number];

export default function EditTrainingScreen() {
  const { trainingId } = useLocalSearchParams<{ trainingId: string }>();
  const router = useRouter();
  const [training, setTraining] = useState<Training | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dateTime, setDateTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [location, setLocation] = useState('');
  const [keyPrinciple, setKeyPrinciple] = useState('');
  const [theme, setTheme] = useState<TrainingTheme>('Offensif');

  const useNativePicker = DateTimePicker != null;

  useEffect(() => {
    if (!trainingId) {
      setLoading(false);
      return;
    }
    getTrainingById(trainingId)
      .then((t) => {
        if (t) {
          setTraining(t);
          const dateStr = typeof t.date === 'string' ? t.date : (t.date as Date).toISOString?.();
          const d = dateStr ? parseISO(dateStr) : new Date();
          setDateTime(d);
          setLocation((t.location ?? '').toString());
          setKeyPrinciple((t.key_principle ?? '').toString());
          setTheme((t.theme as TrainingTheme) ?? 'Offensif');
        }
      })
      .catch(() => setError('Entraînement introuvable'))
      .finally(() => setLoading(false));
  }, [trainingId]);

  const handleSave = async () => {
    if (!trainingId) return;
    setSaving(true);
    setError(null);
    try {
      await updateTraining(trainingId, {
        date: dateTime,
        location: location.trim() || undefined,
        theme,
        key_principle: keyPrinciple.trim() || undefined,
      });
      Alert.alert('Enregistré', 'Les modifications ont été enregistrées.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Impossible d'enregistrer";
      setError(msg);
      Alert.alert('Erreur', msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (error && !training) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Modifier l&apos;entraînement</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Date</Text>
          {useNativePicker ? (
            <TouchableOpacity style={styles.pickerTouch} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.pickerText}>{format(dateTime, 'EEEE d MMMM yyyy', { locale: fr })}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.pickerText}>{format(dateTime, 'dd/MM/yyyy')}</Text>
          )}
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Heure</Text>
          {useNativePicker ? (
            <TouchableOpacity style={styles.pickerTouch} onPress={() => setShowTimePicker(true)}>
              <Text style={styles.pickerText}>{format(dateTime, 'HH:mm')}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.pickerText}>{format(dateTime, 'HH:mm')}</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Lieu</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="ex: Gymnase (optionnel)"
            placeholderTextColor="#9ca3af"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Thème</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.themeChip, theme === t && styles.themeChipActive]}
                onPress={() => setTheme(t)}
              >
                <Text style={[styles.themeChipText, theme === t && styles.themeChipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Principe clé (optionnel)</Text>
          <TextInput
            style={styles.input}
            value={keyPrinciple}
            onChangeText={setKeyPrinciple}
            placeholder="Ex: Fixer le bloc équipe"
            placeholderTextColor="#9ca3af"
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.submitBtnText}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {useNativePicker && DateTimePicker && (
        <>
          <Modal visible={showDatePicker} transparent animationType="slide">
            <Pressable style={styles.modalOverlay} onPress={() => setShowDatePicker(false)}>
              <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.modalDone}>OK</Text>
                  </Pressable>
                </View>
                <View style={styles.pickerWrapper}>
                  <DateTimePicker
                    value={dateTime}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={(_e: unknown, v?: Date) => {
                      if (v) {
                        const next = new Date(dateTime);
                        next.setFullYear(v.getFullYear(), v.getMonth(), v.getDate());
                        setDateTime(next);
                      }
                      if (Platform.OS !== 'ios') setShowDatePicker(false);
                    }}
                    locale="fr-FR"
                  />
                </View>
              </View>
            </Pressable>
          </Modal>
          <Modal visible={showTimePicker} transparent animationType="slide">
            <Pressable style={styles.modalOverlay} onPress={() => setShowTimePicker(false)}>
              <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setShowTimePicker(false)}>
                    <Text style={styles.modalDone}>OK</Text>
                  </Pressable>
                </View>
                <View style={styles.pickerWrapper}>
                  <DateTimePicker
                    value={dateTime}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_e: unknown, v?: Date) => {
                      if (v) {
                        const next = new Date(dateTime);
                        next.setHours(v.getHours(), v.getMinutes(), 0, 0);
                        setDateTime(next);
                      }
                      if (Platform.OS !== 'ios') setShowTimePicker(false);
                    }}
                    is24Hour
                  />
                </View>
              </View>
            </Pressable>
          </Modal>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 14, color: '#dc2626', marginBottom: 16 },
  backBtn: { marginTop: 12, padding: 12 },
  backBtnText: { fontSize: 16, color: '#3b82f6', fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  pickerTouch: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#fff',
  },
  pickerText: { fontSize: 16, color: '#111' },
  themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themeChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
  },
  themeChipActive: { backgroundColor: '#3b82f6' },
  themeChipText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  themeChipTextActive: { color: '#fff' },
  submitBtn: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#22c55e',
    borderRadius: 12,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24 },
  modalHeader: { padding: 16, alignItems: 'flex-end' },
  modalDone: { fontSize: 17, fontWeight: '600', color: '#3b82f6' },
  pickerWrapper: { paddingHorizontal: 16 },
});
