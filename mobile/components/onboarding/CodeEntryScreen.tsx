/**
 * Saisie d'un code d'accès — chrome partagé
 *
 * L'app demande un code court à deux endroits, pour deux populations :
 *
 * - `app/join-club.tsx` — un **joueur** lie son profil au compte de son coach ;
 * - `app/(tabs)/join-club-staff.tsx` — un **membre du staff** rejoint un club
 *   avec l'invitation de l'administrateur.
 *
 * C'est le même écran : un code, un champ, un bouton, une explication de la
 * durée de validité. Il était écrit deux fois, et les deux avaient divergé —
 * motif déjà trouvé cinq fois dans ce dépôt (table des postes, statuts de
 * présence, modale d'invitation, sélecteur de date, match recorders).
 *
 * Ce que la divergence coûtait, côté staff :
 *
 * 1. **L'échec passait par `Alert.alert`.** Un code invalide se corrige dans le
 *    champ ; une boîte de dialogue le recouvre, oblige à un tap pour la fermer,
 *    et ne laisse aucune trace de ce qui n'allait pas. La version joueur avait
 *    déjà été corrigée en erreur sous le champ, pas celle du staff.
 * 2. **Le code s'affichait en `fontFamily: 'monospace'` à 14 px** alors que la
 *    version joueur le rendait à 20 px avec 4 pt d'interlettrage. Un code de 8
 *    caractères se relit lettre à lettre : c'est l'interlettrage qui compte, et
 *    `'monospace'` sur iOS ne désigne aucune police installée.
 * 3. **Aucun retour haptique**, là où la version joueur en avait un au succès
 *    comme à l'échec.
 * 4. **Le violet `#7c3aed` n'était la couleur de marque de rien** — ni l'accent
 *    de l'app (`accent.default`), ni le vert de l'espace joueur. Troisième
 *    couleur de marque sur un parcours qui en comptait déjà deux.
 *
 * Les deux écrans ne se distinguent plus que par ce qui les distingue vraiment :
 * la cible (`tone`), le vocabulaire, et ce que le code déclenche une fois validé.
 */

import { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { haptics } from '../../lib/design/haptics';
import { Text, Button, Input } from '../ui';

/**
 * Résultat attendu de la validation.
 *
 * `ok: false` est un refus métier (code inconnu, expiré, déjà utilisé) : il
 * s'affiche sous le champ. Une exception levée est traitée pareil — l'écran ne
 * distingue pas les deux pour l'utilisateur, mais l'appelant garde la liberté
 * de renvoyer un message précis plutôt que de laisser remonter un message
 * technique.
 */
export type CodeSubmitResult = { ok: true } | { ok: false; error?: string };

export interface CodeEntryScreenProps {
  /** Cible du code. Détermine la teinte de l'écran, et rien d'autre. */
  tone: 'player' | 'staff';
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  /** Libellé du champ. Visible ET annoncé par VoiceOver. */
  fieldLabel: string;
  placeholder: string;
  submitLabel: string;
  /** Durée de validité et conduite à tenir si le code a expiré. */
  hint: string;
  /** Message affiché sous le champ quand l'utilisateur valide à vide. */
  emptyError: string;
  onSubmit: (code: string) => Promise<CodeSubmitResult>;
  /** Appelé après un succès. C'est à lui de décider où l'on arrive. */
  onSuccess: () => void | Promise<void>;
  /** Sortie de l'écran. Par défaut, retour arrière. */
  onCancel?: () => void;
  /**
   * Marge haute à appliquer. `false` quand un header natif est présent : sur
   * iPad, les écrans du groupe `(tabs)` n'en ont pas et doivent porter leur
   * propre marge, sur iPhone le header la consomme déjà.
   */
  edgeTop?: boolean;
}

export function CodeEntryScreen({
  tone,
  icon,
  title,
  subtitle,
  fieldLabel,
  placeholder,
  submitLabel,
  hint,
  emptyError,
  onSubmit,
  onSuccess,
  onCancel,
  edgeTop = true,
}: CodeEntryScreenProps) {
  const router = useRouter();
  const s = useStyles();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Espace joueur = `positive`, espace coach = `accent`. Règle actée lors de la
  // migration de l'espace joueur, appliquée ici sans exception.
  const ramp = tone === 'player' ? theme.colors.positive : theme.colors.accent;

  const handleSubmit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError(emptyError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await onSubmit(trimmed);
      if (!result.ok) {
        haptics.error();
        setError(result.error ?? 'Code invalide ou expiré.');
        return;
      }
      haptics.success();
      await onSuccess();
    } catch (e) {
      haptics.error();
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  const back = onCancel ?? (() => router.back());

  return (
    <View style={[s.root, edgeTop ? { paddingTop: insets.top } : null]}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <Pressable
          onPress={back}
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
          <View style={[s.icon, { backgroundColor: ramp.subtle }]}>
            <Ionicons name={icon} size={26} color={ramp.default} />
          </View>

          <Text variant="title" style={s.center}>
            {title}
          </Text>
          <Text variant="callout" tone="secondary" style={s.center}>
            {subtitle}
          </Text>

          <Input
            label={fieldLabel}
            value={code}
            onChangeText={(t) => {
              setError(null);
              setCode(t.replace(/\s/g, '').toUpperCase());
            }}
            placeholder={placeholder}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            editable={!submitting}
            error={error ?? undefined}
            containerStyle={s.field}
            inputStyle={s.codeInput}
            returnKeyType="go"
            onSubmitEditing={() => void handleSubmit()}
          />

          <Button
            label={submitLabel}
            onPress={() => void handleSubmit()}
            loading={submitting}
            disabled={submitting}
            block
          />

          <Text variant="caption" tone="tertiary" style={s.center}>
            {hint}
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
