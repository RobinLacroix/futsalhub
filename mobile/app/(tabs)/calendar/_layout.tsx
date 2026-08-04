import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useIsTablet } from '../../../hooks/useIsTablet';
import { useTheme } from '../../../contexts/ThemeContext';
import { SeasonHeaderButton } from '../../../components/SeasonHeaderButton';
import { AddEventButton } from '../../../components/calendar/AddEventButton';

/**
 * ## Le header n'est masqué que sur la racine
 *
 * `headerShown: !isTablet` était posé sur **tout le Stack**. Conséquence :
 * sur iPad, « Nouvel entraînement », « Nouveau match », le détail d'un
 * entraînement et le détail d'un match s'ouvraient sans titre et **sans bouton
 * retour**. Aucun de ces écrans n'en porte un lui-même : on n'en sortait que
 * par le geste de balayage, invisible, et sur des formulaires longs.
 *
 * La règle est donc affinée : une racine (accessible depuis la sidebar) masque
 * son header sur tablette, un écran empilé le garde. C'est le header natif qui
 * fournit alors le titre et le retour, exactement comme sur iPhone.
 *
 * Sur la racine, le bouton d'ajout reste porté par l'écran lui-même
 * (`calendar/index.tsx`), via le même `AddEventButton`.
 */
export default function CalendarLayout() {
  const isTablet = useIsTablet();
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: c.bg.canvas },
        headerShadowVisible: false,
        headerTintColor: c.text.primary,
        headerTitleStyle: { color: c.text.primary, fontWeight: '600', fontSize: 18 },
        contentStyle: { backgroundColor: c.bg.canvas },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Calendrier',
          headerShown: !isTablet,
          headerRight: () => (
            <View style={styles.headerRight}>
              <SeasonHeaderButton />
              <AddEventButton />
            </View>
          ),
        }}
      />
      <Stack.Screen name="new" options={{ title: 'Nouvel entraînement' }} />
      <Stack.Screen name="new-match" options={{ title: 'Nouveau match' }} />
      <Stack.Screen name="training/[trainingId]" options={{ title: 'Entraînement' }} />
      <Stack.Screen name="training/edit/[trainingId]" options={{ title: "Modifier l'entraînement" }} />
      <Stack.Screen name="matchDetail/[matchId]" options={{ title: 'Match' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 4 },
});
