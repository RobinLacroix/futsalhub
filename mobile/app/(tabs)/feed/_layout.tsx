import { Stack } from 'expo-router';
import { useTheme } from '../../../contexts/ThemeContext';
import { useIsTablet } from '../../../hooks/useIsTablet';

export default function FeedLayout() {
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
      <Stack.Screen name="index" options={{ title: "Fil d'équipe", headerShown: !isTablet }} />
      <Stack.Screen name="new-post" options={{ title: 'Nouveau post' }} />
      <Stack.Screen name="[postId]" options={{ title: 'Post' }} />
    </Stack>
  );
}
