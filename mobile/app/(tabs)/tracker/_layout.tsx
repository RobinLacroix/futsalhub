/**
 * Pile de navigation du tracker.
 *
 * ## Le header natif de `record` est masqué
 *
 * Il affichait « Enregistrer un match » sur un bleu `#3b82f6` en dur, au-dessus
 * du bandeau de l'écran qui affiche déjà le nom du match : deux barres
 * empilées, deux bleus différents, une seule information utile. Le recorder
 * porte lui-même son retour et son bouton d'enregistrement.
 *
 * Le masquage vaut pour téléphone ET tablette. C'est délibéré : les deux
 * recorders ont leur propre bandeau complet, aucun des deux ne dépend du header
 * natif pour naviguer.
 *
 * ## Ailleurs, seule la racine masque son header sur tablette
 *
 * `headerShown: !isTablet` posé sur tout le Stack privait les écrans empilés de
 * titre et de retour sur iPad. La règle est la même dans les trois piles du
 * dépôt : racine masquée sur tablette, écran empilé gardé.
 */

import { Stack } from 'expo-router';
import { useTheme } from '../../../contexts/ThemeContext';
import { useIsTablet } from '../../../hooks/useIsTablet';

export default function TrackerLayout() {
  const isTablet = useIsTablet();
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        // Chaque header suivait sa propre couleur en dur (`#3b82f6` ici,
        // `#0E0E10` sur le rapport de match) : le rapport gardait donc un
        // header sombre en thème clair.
        headerStyle: { backgroundColor: theme.colors.bg.surface },
        headerTintColor: theme.colors.accent.default,
        headerTitleStyle: { color: theme.colors.text.primary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Tracker', headerShown: !isTablet }} />
      <Stack.Screen name="record" options={{ headerShown: false }} />
      <Stack.Screen
        name="match-report/[matchId]"
        options={{
          title: 'Rapport de match',
          headerShown: true,
          headerBackTitle: 'Retour',
        }}
      />
    </Stack>
  );
}
