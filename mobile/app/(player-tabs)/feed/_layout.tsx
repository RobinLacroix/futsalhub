import { Stack } from 'expo-router';
import { useTheme } from '../../../contexts/ThemeContext';
import { PlayerSettingsButton } from '../../../components/PlayerSettingsButton';

export default function PlayerFeedLayout() {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: c.bg.surface },
        headerTintColor: c.positive.default,
        headerTitleStyle: { color: c.text.primary },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.bg.canvas },
      }}
    >
      {/* headerLeft posé ici, pas dans screenOptions : [postId] doit garder
          son bouton retour natif, pas cette icône. */}
      <Stack.Screen
        name="index"
        options={{ title: "Fil d'équipe", headerLeft: () => <PlayerSettingsButton /> }}
      />
      <Stack.Screen name="[postId]" options={{ title: 'Post' }} />
    </Stack>
  );
}
