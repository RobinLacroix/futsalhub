/**
 * Chrome partagé des écrans d'authentification
 *
 * `sign-in` et `sign-up` sont deux écrans consécutifs qui se ressemblaient sans
 * se ressembler : même carte, même ombre, mêmes champs — mais un bouton
 * principal **bleu** d'un côté et **vert** de l'autre, pour la même action au
 * même endroit. Deux couleurs de marque à deux écrans d'intervalle, c'est le
 * premier signal qu'un utilisateur extérieur reçoit du produit.
 *
 * Tout ce qui est commun vit donc ici, et ne peut plus diverger.
 */

import { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, ScrollView, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { Text, Input, type InputProps } from '../ui';

// ─── Carte ────────────────────────────────────────────────────────────────────

export interface AuthCardProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  const s = useStyles();
  const { theme } = useTheme();

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.card}>
          <View style={[s.mark, { backgroundColor: theme.colors.accent.subtle }]}>
            <Ionicons name="football" size={26} color={theme.colors.accent.default} />
          </View>
          <Text variant="title" style={s.center}>
            {title}
          </Text>
          <Text variant="callout" tone="secondary" style={s.center}>
            {subtitle}
          </Text>
          <View style={s.body}>{children}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Bandeau d'erreur ─────────────────────────────────────────────────────────

/**
 * L'erreur était un bloc rouge muet, non annoncé aux lecteurs d'écran. Elle
 * porte maintenant `accessibilityRole="alert"` : c'est le seul retour qu'un
 * utilisateur reçoit quand sa connexion échoue.
 */
export function AuthError({ message }: { message: string | null }) {
  const s = useStyles();
  const { theme } = useTheme();
  if (!message) return null;
  return (
    <View style={s.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={17} color={theme.colors.negative.default} />
      <Text variant="callout" color={theme.colors.negative.default} style={s.flex}>
        {message}
      </Text>
    </View>
  );
}

// ─── Champ mot de passe ───────────────────────────────────────────────────────

/**
 * Les champs n'avaient **aucun libellé** : uniquement un placeholder, qui
 * disparaît dès la première frappe. Un utilisateur qui revient sur un champ à
 * moitié rempli ne sait plus ce qu'il contient, et un lecteur d'écran n'annonce
 * rien du tout. `Input` impose un libellé, c'est précisément à ça qu'il sert.
 *
 * S'y ajoute le bouton œil. Sans lui, un mot de passe saisi au clavier mobile
 * ne peut pas être relu : la seule stratégie de récupération est de tout
 * effacer, ce qui est la première cause d'abandon sur un écran de connexion.
 */
export function PasswordInput({
  label,
  ...rest
}: Omit<InputProps, 'secureTextEntry' | 'inputStyle'>) {
  const s = useStyles();
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View>
      <Input
        {...rest}
        label={label}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        inputStyle={s.passwordInput}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        accessibilityState={{ selected: visible }}
        style={({ pressed }) => [s.eye, pressed && s.pressed]}
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          color={theme.colors.text.tertiary}
        />
      </Pressable>
    </View>
  );
}

// ─── Lien secondaire ──────────────────────────────────────────────────────────

/**
 * Les liens de bas d'écran faisaient une vingtaine de points de haut, sans
 * marge tactile — la moitié du minimum HIG, sur les deux seules issues de
 * l'écran (mot de passe oublié, créer un compte).
 */
export function AuthLink({
  label,
  onPress,
  disabled,
  tone = 'accent',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'accent' | 'tertiary';
}) {
  const s = useStyles();
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }) => [s.link, pressed && s.pressed]}
    >
      <Text
        variant="callout"
        weight={tone === 'accent' ? '600' : '400'}
        color={tone === 'accent' ? theme.colors.accent.default : theme.colors.text.tertiary}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  pressed: { opacity: 0.6 },

  root: { flex: 1, backgroundColor: t.colors.bg.canvas },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: t.space.lg,
    paddingVertical: t.space.xl,
  },
  card: {
    gap: t.space.xs,
    padding: t.space.xl,
    borderRadius: t.radius.lg,
    maxWidth: 440,
    alignSelf: 'center',
    width: '100%',
    // `floating` porte déjà le fond, la bordure et l'ombre des deux thèmes.
    // L'ancienne carte les déclarait à la main (`#fff`, ombre noire fixe) et
    // restait donc blanche sur le canvas anthracite en thème sombre.
    ...t.elevation.floating,
  },
  mark: {
    alignSelf: 'center',
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: t.space.sm,
  },
  body: { gap: t.space.md, marginTop: t.space.lg },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.space.sm,
    padding: t.space.md,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.negative.subtle,
    borderWidth: 1,
    borderColor: t.colors.negative.default,
  },

  // Place réservée au bouton œil, pour que le texte ne passe pas dessous.
  passwordInput: { paddingRight: 46 },
  eye: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 46,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },

  link: {
    alignSelf: 'center',
    justifyContent: 'center',
    minHeight: HIT_SLOP_MIN,
    paddingHorizontal: t.space.sm,
  },
}));
