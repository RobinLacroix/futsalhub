import { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { format, isValid, parse } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTheme } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { createPlayer } from '../../../lib/services/players';
import { haptics } from '../../../lib/design/haptics';
import { Card, Button, Field, Input, ChipGroup, EmptyState, type ChipOption } from '../../../components/ui';
import { POSITIONS } from '../../../components/players/positions';

type StrongFoot = 'Droit' | 'Gauche' | 'Droit et gauche';

const POSITION_OPTIONS: readonly ChipOption<string>[] = POSITIONS.map((p) => ({
  value: p.key,
  label: p.label,
}));

const FOOT_OPTIONS: readonly ChipOption<StrongFoot>[] = [
  { value: 'Droit', label: 'Droit' },
  { value: 'Gauche', label: 'Gauche' },
  { value: 'Droit et gauche', label: 'Les deux' },
];

/**
 * La date de naissance était saisie au format ISO `AAAA-MM-JJ`, imposé à
 * l'utilisateur par un contrôle `/^\d{4}-\d{2}-\d{2}$/`. Personne n'écrit une
 * date comme ça en français. La saisie se fait maintenant en `JJ/MM/AAAA` et
 * la conversion vers l'ISO attendu par le service est faite ici.
 */
function toIsoBirthDate(input: string): { iso?: string; error?: string } {
  const raw = input.trim();
  if (!raw) return {};
  const parsed = parse(raw, 'dd/MM/yyyy', new Date(), { locale: fr });
  if (!isValid(parsed)) return { error: 'Format attendu : JJ/MM/AAAA (ex. 15/05/2000).' };
  const year = parsed.getFullYear();
  if (year < 1900 || parsed > new Date()) return { error: 'Cette date de naissance est impossible.' };
  return { iso: format(parsed, 'yyyy-MM-dd') };
}

export default function NewPlayerScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const { activeTeamId } = useActiveTeam();

  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [position, setPosition] = useState<string>('Ailier');
  const [strongFoot, setStrongFoot] = useState<StrongFoot>('Droit');
  const [numberStr, setNumberStr] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const numberError = useMemo(() => {
    const raw = numberStr.trim();
    if (!raw) return undefined;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) || n < 0 || n > 99 ? 'Le numéro doit être compris entre 0 et 99.' : undefined;
  }, [numberStr]);

  const birthError = useMemo(() => toIsoBirthDate(birthDate).error, [birthDate]);

  const submit = async () => {
    if (!activeTeamId) return;

    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = 'Le prénom est obligatoire.';
    if (!lastName.trim()) next.lastName = 'Le nom est obligatoire.';
    if (birthError) next.birthDate = birthError;
    if (numberError) next.number = numberError;

    setErrors(next);
    if (Object.keys(next).length > 0) {
      haptics.error();
      return;
    }

    setSaving(true);
    try {
      const player = await createPlayer(activeTeamId, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        birth_date: toIsoBirthDate(birthDate).iso,
        position,
        strong_foot: strongFoot,
        number: numberStr.trim() ? parseInt(numberStr.trim(), 10) : undefined,
      });
      haptics.success();
      Alert.alert('Joueur ajouté', `${player.first_name} ${player.last_name} rejoint l'effectif.`, [
        { text: 'Voir la fiche', onPress: () => router.replace(`/(tabs)/squad/${player.id}` as never) },
        { text: "Retour à l'effectif", onPress: () => router.replace('/(tabs)/squad') },
      ]);
    } catch (e) {
      haptics.error();
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de créer le joueur');
    } finally {
      setSaving(false);
    }
  };

  if (!activeTeamId) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <EmptyState
          icon="people-outline"
          title="Aucune équipe sélectionnée"
          description="Choisissez une équipe depuis l'accueil avant d'ajouter un joueur."
          action={{ label: "Aller à l'accueil", onPress: () => router.replace('/(tabs)') }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: c.bg.canvas }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { gap: theme.space.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Card variant="raised" padding="lg" style={{ gap: theme.space.lg }}>
          <Input
            label="Prénom"
            value={firstName}
            onChangeText={(v) => {
              setFirstName(v);
              if (errors.firstName) setErrors((e) => ({ ...e, firstName: '' }));
            }}
            error={errors.firstName || undefined}
            placeholder="Prénom"
            autoCapitalize="words"
          />
          <Input
            label="Nom"
            value={lastName}
            onChangeText={(v) => {
              setLastName(v);
              if (errors.lastName) setErrors((e) => ({ ...e, lastName: '' }));
            }}
            error={errors.lastName || undefined}
            placeholder="Nom"
            autoCapitalize="words"
          />
          <Input
            label="Date de naissance"
            optional
            value={birthDate}
            onChangeText={setBirthDate}
            error={errors.birthDate || undefined}
            hint="Format : JJ/MM/AAAA"
            placeholder="15/05/2000"
            keyboardType="numbers-and-punctuation"
          />
        </Card>

        <Card variant="raised" padding="lg" style={{ gap: theme.space.lg }}>
          <Field label="Poste">
            <ChipGroup
              label="Poste du joueur"
              options={POSITION_OPTIONS}
              value={position}
              onChange={setPosition}
            />
          </Field>
          <Field label="Pied fort">
            <ChipGroup
              label="Pied fort du joueur"
              options={FOOT_OPTIONS}
              value={strongFoot}
              onChange={setStrongFoot}
            />
          </Field>
          <Input
            label="Numéro de maillot"
            optional
            value={numberStr}
            onChangeText={setNumberStr}
            error={errors.number || numberError}
            placeholder="7"
            keyboardType="number-pad"
            numeric
            containerStyle={styles.numberField}
          />
        </Card>

        <Button
          label={saving ? 'Ajout…' : 'Ajouter le joueur'}
          onPress={submit}
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
  numberField: { alignSelf: 'flex-start' },
});
