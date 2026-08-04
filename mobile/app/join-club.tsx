/**
 * Lier un profil joueur à son compte
 *
 * ## Ce n'est plus un écran d'onboarding
 *
 * Il n'était atteignable que depuis l'accueil d'un compte **sans aucune
 * équipe** : trois options de premiers pas, dont « Lier un profil joueur ».
 * Dès qu'un compte avait une équipe, l'écran devenait inaccessible.
 *
 * En club amateur, un coach est très souvent aussi joueur — un senior qui
 * entraîne les jeunes. Ce compte-là avait donc une équipe, et perdait
 * définitivement l'accès à son propre espace joueur : ni convocations, ni
 * questionnaire de séance, ni fiche personnelle. L'entrée vit désormais dans
 * « Plus » et dans la sidebar iPad, disponible en permanence.
 *
 * ## L'arrivée dépend de qui lie
 *
 * L'écran faisait `router.replace('/(player-tabs)')` sans condition et sans
 * enregistrer le rôle. Un coach qui liait son profil se retrouvait donc
 * propulsé dans l'espace joueur sans l'avoir demandé, avec un `appRole` resté
 * sur `coach` — incohérence que l'aiguillage de démarrage corrigeait au
 * lancement suivant en le ramenant côté coach.
 *
 * Désormais : un compte sans équipe entre dans l'espace joueur (c'est ce qu'il
 * venait chercher), un coach revient d'où il vient et bascule quand il le
 * décide.
 *
 * L'échec passe de `Alert` à une erreur sous le champ : un code invalide se
 * corrige dans le champ, pas dans une boîte de dialogue qui le masque.
 */

import { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppRole } from '../contexts/AppRoleContext';
import { useTheme, makeStyles } from '../contexts/ThemeContext';
import { claimPlayerLinkCode } from '../lib/services/playerConvocations';
import { HIT_SLOP_MIN } from '../lib/design/tokens';
import { haptics } from '../lib/design/haptics';
import { Text, Button, Input } from '../components/ui';

export default function JoinClubScreen() {
  const router = useRouter();
  const s = useStyles();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { refetch, isCoach, setAppRole } = useAppRole();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError('Saisis le code que ton coach t’a communiqué.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await claimPlayerLinkCode(trimmed);
      if (!result.ok) {
        haptics.error();
        setError(result.error ?? 'Impossible de lier le compte.');
        return;
      }
      haptics.success();
      await refetch();
      if (isCoach) {
        // Il gérait son club : on le laisse où il était. La bascule vers
        // l'espace joueur est offerte dans « Plus » et dans la sidebar.
        router.back();
      } else {
        await setAppRole('player');
        router.replace('/(player-tabs)');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <Pressable
          onPress={() => router.back()}
          disabled={submitting}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={({ pressed }) => [s.backBtn, pressed && s.pressed]}
        >
          <Ionicons name="chevron-back" size={22} color={theme.colors.text.secondary} />
          <Text variant="body" tone="secondary">
            Retour
          </Text>
        </Pressable>

        <View style={s.content}>
          <View style={[s.icon, { backgroundColor: theme.colors.positive.subtle }]}>
            <Ionicons name="person-add" size={26} color={theme.colors.positive.default} />
          </View>

          <Text variant="title" style={s.center}>
            Lier mon profil joueur
          </Text>
          <Text variant="callout" tone="secondary" style={s.center}>
            {isCoach
              ? 'On peut être coach et joueur. Saisis le code que le coach de ton équipe t’a communiqué pour accéder aussi à ton espace joueur : convocations, questionnaires, fiche personnelle.'
              : 'Saisis le code que ton coach t’a communiqué pour accéder à ton espace joueur : convocations, questionnaires, fiche personnelle.'}
          </Text>

          <Input
            label="Code de liaison"
            value={code}
            onChangeText={(t) => {
              setError(null);
              setCode(t.replace(/\s/g, '').toUpperCase());
            }}
            placeholder="Ex. ABC12XYZ"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            editable={!submitting}
            error={error ?? undefined}
            containerStyle={s.field}
            inputStyle={s.codeInput}
          />

          <Button
            label="Valider le code"
            onPress={handleSubmit}
            loading={submitting}
            disabled={submitting}
            block
          />

          <Text variant="caption" tone="tertiary" style={s.center}>
            Le code est valable 24 h. S’il a expiré, ton coach peut en générer un
            nouveau depuis ta fiche.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  pressed: { opacity: 0.6 },
  root: { flex: 1, backgroundColor: t.colors.bg.canvas },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: t.space.lg,
    minHeight: HIT_SLOP_MIN,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: t.space.md,
    padding: t.space.xl,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
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
  // Un code de 8 caractères se relit lettre à lettre : interlettrage large,
  // comme sur la carte qui l'affiche côté coach.
  codeInput: { fontSize: 20, letterSpacing: 4, textAlign: 'center' },
}));
