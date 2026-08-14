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

/** Vide → undefined (champ non renseigné, on ne force pas de valeur par défaut). */
const parseIntOrUndefined = (s: string): number | undefined => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
};

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
  const [sessionDuration, setSessionDuration] = useState('');
  const [targetRpeMin, setTargetRpeMin] = useState('');
  const [targetRpeMax, setTargetRpeMax] = useState('');

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
        setSessionDuration(t.session_duration != null ? String(t.session_duration) : '');
        setTargetRpeMin(t.target_rpe_min != null ? String(t.target_rpe_min) : '');
        setTargetRpeMax(t.target_rpe_max != null ? String(t.target_rpe_max) : '');
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
    const duration = parseIntOrUndefined(sessionDuration);
    if (duration != null && (duration < 45 || duration > 150)) {
      Alert.alert('Durée invalide', 'La durée doit être comprise entre 45 et 150 minutes.');
      return;
    }
    const rpeMin = parseIntOrUndefined(targetRpeMin);
    const rpeMax = parseIntOrUndefined(targetRpeMax);
    if ((rpeMin != null && (rpeMin < 1 || rpeMin > 10)) || (rpeMax != null && (rpeMax < 1 || rpeMax > 10))) {
      Alert.alert('RPE invalide', 'Le RPE cible doit être compris entre 1 et 10.');
      return;
    }
    if (rpeMin != null && rpeMax != null && rpeMax < rpeMin) {
      Alert.alert('RPE invalide', 'Le RPE max doit être supérieur ou égal au RPE min.');
      return;
    }

    setSaving(true);
    try {
      await updateTraining(trainingId, {
        date: submitDate,
        location: location.trim() || undefined,
        theme: trainingTheme,
        key_principle: keyPrinciple.trim() || undefined,
        session_duration: duration ?? null,
        target_rpe_min: rpeMin ?? null,
        target_rpe_max: rpeMax ?? null,
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
          <Input
            label="Durée de la séance"
            optional
            numeric
            keyboardType="number-pad"
            value={sessionDuration}
            onChangeText={setSessionDuration}
            placeholder="ex : 75"
            hint="En minutes, entre 45 et 150."
          />
          <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
            <Input
              label="RPE cible min"
              optional
              numeric
              keyboardType="number-pad"
              value={targetRpeMin}
              onChangeText={setTargetRpeMin}
              placeholder="ex : 5"
              containerStyle={styles.flex}
            />
            <Input
              label="RPE cible max"
              optional
              numeric
              keyboardType="number-pad"
              value={targetRpeMax}
              onChangeText={setTargetRpeMax}
              placeholder="ex : 7"
              hint="Fourchette 1-10, à comparer au RPE réel des joueurs."
              containerStyle={styles.flex}
            />
          </View>
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
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
});
