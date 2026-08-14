/**
 * Actions de header de l'espace joueur : bascule vers l'espace coach, et
 * déconnexion.
 *
 * ## Le bug que ça corrige
 *
 * Les deux boutons dessinaient en `#fff` en dur. C'était juste tant que le
 * header joueur était un aplat vert (`#16a34a`). Depuis que ce header suit le
 * thème (`bg.surface`), le blanc est posé sur du blanc en thème clair : le
 * libellé « Espace coach » et l'icône de déconnexion étaient **invisibles**.
 * Régression introduite en migrant `(player-tabs)/_layout`, pas un défaut
 * d'origine.
 *
 * `SwitchToPlayerButton` a été supprimé : l'espace coach fait déjà la bascule
 * depuis `(tabs)/plus` et `TabletSidebar`, ce composant n'était monté nulle
 * part.
 *
 * La déconnexion demande confirmation. Elle était immédiate, à 38 pt d'un
 * bouton d'onglet, sur un écran que le joueur ouvre pour répondre à une
 * convocation.
 */

import { Pressable, StyleSheet, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useAppRole } from '../contexts/AppRoleContext';
import { useTheme } from '../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../lib/design/tokens';
import { supabase } from '../lib/supabase';
import { Text } from './ui';

/** Affiche « Espace coach » dans l'interface joueur (si le compte est coach). */
export function SwitchToCoachButton() {
  const router = useRouter();
  const { isCoach, setAppRole } = useAppRole();
  const { theme } = useTheme();

  if (!isCoach) return null;

  const handlePress = async () => {
    await setAppRole('coach');
    router.replace('/(tabs)');
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Basculer vers l'espace coach"
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      <Ionicons name="swap-horizontal" size={15} color={theme.colors.accent.default} />
      <Text variant="caption" weight="700" color={theme.colors.accent.default}>
        Espace coach
      </Text>
    </Pressable>
  );
}

/** Bouton icône de déconnexion, à poser dans un header. */
export function SignOutIconButton() {
  const router = useRouter();
  const { theme } = useTheme();

  const handlePress = () => {
    Alert.alert('Se déconnecter ?', 'Tu devras te reconnecter pour voir tes convocations.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Se déconnecter',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/sign-in');
        },
      },
    ]);
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Se déconnecter"
      style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
    >
      <Ionicons name="log-out-outline" size={20} color={theme.colors.text.secondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    minHeight: HIT_SLOP_MIN,
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    minHeight: HIT_SLOP_MIN,
  },
  pressed: { opacity: 0.6 },
});
