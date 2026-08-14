import { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTheme } from '../../../../../contexts/ThemeContext';
import { getTrainingById, updateTraining } from '../../../../../lib/services/trainings';
import { haptics } from '../../../../../lib/design/haptics';
import {
  Card,
  Button,
  Field,
  Input,
  ChipGroup,
  EmptyState,
  SkeletonDetail,
  type ChipOption,
} from '../../../../../components/ui';
import { DateTimeField, hasNativePicker } from '../../../../../components/match/DateTimeField';
import type { Training } from '../../../../../types';

type TrainingTheme = 'Offensif' | 'Défensif' | 'Transition' | 'Supériorité';

const THEME_OPTIONS: readonly ChipOption<TrainingTheme>[] = [
  { value: 'Offensif', label: 'Offensif' },
  { value: 'Défensif', label: 'Défensif' },
  { value: 'Transition', label: 'Transition' },
  { value: 'Supériorité', label: 'Supériorité' },
];

export default function EditTrainingScreen() {
  const { trainingId } = useLocalSearchParams<{ trainingId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;

  const [training, setTraining] = useState<Training | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dateTime, setDateTime] = useState(new Date());
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [location, setLocation] = useState('');
  const [keyPrinciple, setKeyPrinciple] = useState('');
  const [trainingTheme, setTrainingTheme] = useState<TrainingTheme>('Offensif');

  useEffect(() => {
    if (!trainingId) {
      setLoading(false);
      return;
    }
    getTrainingById(trainingId)
      .then((t) => {
        if (!t) {
          setError('Entraînement introuvable');
          return;
        }
        setTraining(t);
        const iso = typeof t.date === 'string' ? t.date : (t.date as Date).toISOString?.();
        const d = iso ? parseISO(iso) : new Date();
        setDateTime(d);
        setDateStr(format(d, 'dd/MM/yyyy', { locale: fr }));
        setTimeStr(format(d, 'HH:mm'));
        setLocation((t.location ?? '').toString());
        setKeyPrinciple((t.key_principle ?? '').toString());
        setTrainingTheme((t.theme as TrainingTheme) ?? 'Offensif');
      })
      .catch(() => setError('Entraînement introuvable'))
      .finally(() => setLoading(false));
  }, [trainingId]);

  /**
   * Bug corrigé : sans le module natif `@react-native-community/datetimepicker`,
   * cet écran affichait la date et l'heure en **texte non modifiable**. Il était
   * alors impossible de replanifier une séance. `DateTimeField` fournit le repli
   * en champs texte, comme les autres écrans du module.
   */
  const resolveDate = (): Date | null => {
    if (hasNativePicker) return dateTime;
    const [d, m, y] = dateStr.trim().split('/').map(Number);
    const [h, mn] = timeStr.trim().split(':').map(Number);
    if ([d, m, y, h, mn].some(Number.isNaN)) return null;
    const out = new Date(y, m - 1, d, h, mn, 0, 0);
    return Number.isNaN(out.getTime()) ? null : out;
  };

  const save = async () => {
    if (!trainingId) return;
    const submitDate = resolveDate();
    if (!submitDate) {
      Alert.alert('Date ou heure invalide', 'Date : JJ/MM/AAAA. Heure : HH:MM (ex. 18:30).');
      return;
    }
    setSaving(true);
    try {
      await updateTraining(trainingId, {
        date: submitDate,
        location: location.trim() || undefined,
        theme: trainingTheme,
        key_principle: keyPrinciple.trim() || undefined,
      });
      haptics.success();
      router.back();
    } catch (e) {
      haptics.error();
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <SkeletonDetail />
      </View>
    );
  }

  if (error || !training) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <EmptyState
          icon="alert-circle-outline"
          tone="negative"
          title="Séance indisponible"
          description={error ?? 'Cet entraînement est introuvable.'}
          action={{ label: 'Retour', onPress: () => router.back() }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: c.bg.canvas }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { gap: theme.space.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Card variant="raised" padding="lg" style={{ gap: theme.space.lg }}>
          <DateTimeField
            value={dateTime}
            onChange={setDateTime}
            dateText={dateStr}
            timeText={timeStr}
            onDateTextChange={setDateStr}
            onTimeTextChange={setTimeStr}
          />
          <Input
            label="Lieu"
            optional
            value={location}
            onChangeText={setLocation}
            placeholder="ex : Gymnase Jean Jaurès"
          />
          <Field label="Thème">
            <ChipGroup
              label="Thème de séance"
              options={THEME_OPTIONS}
              value={trainingTheme}
              onChange={setTrainingTheme}
            />
          </Field>
          <Input
            label="Principe clé"
            optional
            value={keyPrinciple}
            onChangeText={setKeyPrinciple}
            placeholder="ex : fixer le bloc équipe"
          />
        </Card>

        <Button
          label={saving ? 'Enregistrement…' : 'Enregistrer'}
          onPress={save}
          loading={saving}
          disabled={saving}
          size="lg"
          block
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
});
