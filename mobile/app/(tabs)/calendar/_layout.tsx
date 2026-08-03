import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { View, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsTablet } from '../../../hooks/useIsTablet';
import { useTheme } from '../../../contexts/ThemeContext';
import { SeasonHeaderButton } from '../../../components/SeasonHeaderButton';
import { IconButton, Sheet, Text } from '../../../components/ui';

/**
 * Ajout d'un événement depuis le header.
 *
 * La modale centrée maison passe sur `Sheet` : geste de fermeture, safe area,
 * et surtout une cible tactile qui ne dépend plus d'un cercle de 36 pt.
 */
function HeaderAddButton() {
  const router = useRouter();
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const c = theme.colors;

  const go = (path: string) => {
    setOpen(false);
    router.push(path as never);
  };

  const options = [
    {
      key: 'training',
      icon: 'barbell' as const,
      label: 'Entraînement',
      hint: 'Thème, procédés, convocations',
      color: c.chartSeries[0],
      path: '/(tabs)/calendar/new',
    },
    {
      key: 'match',
      icon: 'football' as const,
      label: 'Match',
      hint: 'Adversaire, compétition, score',
      color: c.chartSeries[2],
      path: '/(tabs)/calendar/new-match',
    },
  ];

  return (
    <>
      <IconButton icon="add" label="Ajouter un événement" onPress={() => setOpen(true)} variant="accent" />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Ajouter au calendrier">
        {options.map((o) => (
          <Pressable
            key={o.key}
            onPress={() => go(o.path)}
            accessibilityRole="button"
            accessibilityLabel={`${o.label}. ${o.hint}`}
            style={({ pressed }) => [
              styles.optionRow,
              { borderRadius: theme.radius.md, backgroundColor: pressed ? c.bg.sunken : 'transparent' },
            ]}
          >
            <View style={[styles.optionIcon, { backgroundColor: c.bg.sunken, borderRadius: theme.radius.sm }]}>
              <Ionicons name={o.icon} size={20} color={o.color} />
            </View>
            <View style={styles.optionText}>
              <Text variant="headline">{o.label}</Text>
              <Text variant="callout" tone="tertiary">
                {o.hint}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
          </Pressable>
        ))}
      </Sheet>
    </>
  );
}

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
              <HeaderAddButton />
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
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 8 },
  optionIcon: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  optionText: { flex: 1, gap: 2 },
});
