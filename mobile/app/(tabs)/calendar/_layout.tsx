import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useIsTablet } from '../../../hooks/useIsTablet';
import { useTheme } from '../../../contexts/ThemeContext';
import { SeasonHeaderButton } from '../../../components/SeasonHeaderButton';
import { AddEventButton } from '../../../components/calendar/AddEventButton';

/**
 * Sur iPad le Stack ne rend pas de header : le bouton d'ajout est alors porté
 * par l'écran lui-même (`calendar/index.tsx`), via le même `AddEventButton`.
 */
export default function CalendarLayout() {
  const isTablet = useIsTablet();
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <Stack
      screenOptions={{
        headerShown: !isTablet,
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
