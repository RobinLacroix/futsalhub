/**
 * Créer un club
 *
 * Premier écran d'un coach qui arrive seul dans FutsalHub, juste après la
 * création de compte. C'est le point où il devient administrateur.
 *
 * ## Ce que la migration corrige, au-delà du remapping des couleurs
 *
 * - **Le bouton principal était bleu `#3b82f6`** alors que son voisin immédiat
 *   dans le même parcours, « Rejoindre un club », était violet `#7c3aed`. Deux
 *   options présentées côte à côte sur l'accueil, deux couleurs de marque
 *   différentes une fois ouvertes, et aucune des deux n'était l'accent de
 *   l'app. Même défaut que celui trouvé entre `sign-in` et `sign-up`.
 * - **Les erreurs de saisie passaient par `Alert.alert`.** Un nom de club
 *   manquant se corrige dans le champ : `Input` porte l'erreur sous le champ
 *   concerné, où le regard est déjà.
 * - **Le succès aussi était une `Alert.alert`** à valider avant d'entrer dans
 *   l'app. Le club créé se constate — il est là, avec son équipe. La boîte de
 *   dialogue ajoutait un tap et masquait le résultat.
 * - **`placeholderTextColor` était figé à `#9ca3af`**, soit 1,9:1 sur le canvas
 *   sombre : les deux placeholders étaient invisibles en thème sombre.
 *
 * ## Ce qui reste à arbitrer (hors migration)
 *
 * La première équipe est créée automatiquement sous le nom « Équipe
 * principale », en catégorie Senior niveau A. Un coach qui gère les U15 doit
 * donc renommer et reclasser son équipe juste après l'avoir reçue. Laisser
 * nommer la première équipe ici est un changement de parcours, pas de style :
 * il n'est pas fait dans ce lot.
 */

import { useState } from 'react';
import { View, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';
import { createUserClub } from '../../lib/services/clubs';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { haptics } from '../../lib/design/haptics';
import { Screen, Text, Button, Input } from '../../components/ui';

export default function CreateClubScreen() {
  const router = useRouter();
  const s = useStyles();
  const { theme } = useTheme();
  const { refetchTeams, setActiveTeamId } = useActiveTeam();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      haptics.error();
      setNameError('Donnez un nom à votre club pour continuer.');
      return;
    }

    setSaving(true);
    setNameError(null);
    setError(null);
    try {
      const { teamId } = await createUserClub({
        name: trimmedName,
        description: description.trim() || undefined,
        createFirstTeam: true,
      });
      await refetchTeams();
      if (teamId) await setActiveTeamId(teamId);
      haptics.success();
      router.replace('/(tabs)');
    } catch (e) {
      haptics.error();
      setError(e instanceof Error ? e.message : 'Impossible de créer le club.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen contentContainerStyle={s.content}>
        <View style={[s.icon, { backgroundColor: theme.colors.accent.subtle }]}>
          <Ionicons name="add-circle" size={26} color={theme.colors.accent.default} />
        </View>

        <Text variant="title" style={s.center}>
          Créer un club
        </Text>
        <Text variant="callout" tone="secondary" style={s.center}>
          Vous en devenez administrateur : vous invitez votre staff, vous créez vos
          équipes et vous gérez vos joueurs.
        </Text>

        <Input
          label="Nom du club"
          value={name}
          onChangeText={(t) => {
            setNameError(null);
            setName(t);
          }}
          placeholder="Ex. Paris XIV Futsal"
          editable={!saving}
          error={nameError ?? undefined}
          containerStyle={s.field}
          returnKeyType="next"
        />

        <Input
          label="Description"
          optional
          value={description}
          onChangeText={setDescription}
          placeholder="Quelques mots sur votre club…"
          editable={!saving}
          multiline
          inputStyle={s.textArea}
          hint="Une première équipe « Équipe principale » sera créée automatiquement. Vous pourrez la renommer depuis l'écran Équipes."
        />

        {error ? (
          <View
            style={[
              s.errorBox,
              {
                backgroundColor: theme.colors.negative.subtle,
                borderColor: theme.colors.negative.default,
              },
            ]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Ionicons name="alert-circle" size={17} color={theme.colors.negative.default} />
            <Text variant="callout" tone="negative" style={s.flex}>
              {error}
            </Text>
          </View>
        ) : null}

        <Button
          label="Créer le club"
          onPress={() => void handleSubmit()}
          loading={saving}
          disabled={saving}
          block
          style={s.submit}
        />

        <Button
          label="Annuler"
          variant="ghost"
          onPress={() => router.back()}
          disabled={saving}
          block
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  content: {
    gap: t.space.md,
    paddingTop: t.space.xl,
    maxWidth: 440,
  },
  icon: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: t.space.xs,
  },
  field: { marginTop: t.space.sm },
  textArea: { minHeight: 88, paddingTop: t.space.md, textAlignVertical: 'top' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.space.sm,
    padding: t.space.md,
    borderRadius: t.radius.sm,
    borderWidth: 1,
  },
  submit: { marginTop: t.space.sm },
}));
