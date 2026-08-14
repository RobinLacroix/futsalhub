/**
 * Choisir l'équipe active
 *
 * Écran court mais structurant : tout le reste de l'app (calendrier, effectif,
 * analyse) est filtré par l'équipe choisie ici. Atteignable depuis « Plus » et
 * depuis la sidebar iPad.
 *
 * ## Ce que la migration corrige
 *
 * - **L'équipe active était signalée par un caractère `✓` posé dans un `Text`.**
 *   Un glyphe ne suit ni le thème, ni la taille de police, et VoiceOver le lit
 *   « coche » sans dire que la ligne est sélectionnée. Règle actée lors de la
 *   migration des statuts de présence : aucun glyphe ne porte seul une
 *   information. La sélection passe donc par trois canaux — icône, couleur
 *   d'accent, et `accessibilityState.selected` annoncé par le lecteur d'écran.
 * - **Les lignes n'avaient aucun rôle d'accessibilité.** C'est une liste de
 *   choix exclusifs : `radio` dans un `radiogroup`, ce que VoiceOver sait
 *   annoncer (« 2 sur 4, sélectionné »).
 * - **La couleur d'équipe n'était pas affichée**, alors qu'elle est stockée en
 *   base précisément pour reconnaître une équipe d'un écran à l'autre. Elle
 *   sert ici de repère, comme sur l'écran Équipes.
 * - L'état vide était une ligne de texte grise. Il devient actionnable : sans
 *   équipe, la seule issue utile est d'en créer une.
 */

import { useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { haptics } from '../../lib/design/haptics';
import { DEFAULT_TEAM_COLOR } from '../../lib/teamColors';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { Screen, Text, EmptyState, SkeletonList } from '../../components/ui';

export default function ChooseTeamScreen() {
  const router = useRouter();
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  const { teams, loading, activeTeamId, setActiveTeamId } = useActiveTeam();

  const handleSelect = useCallback(
    async (teamId: string) => {
      haptics.select();
      await setActiveTeamId(teamId);
      router.back();
    },
    [setActiveTeamId, router]
  );

  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Retour"
        style={({ pressed }) => [s.backBtn, pressed && s.pressed]}
      >
        <Ionicons name="chevron-back" size={22} color={c.text.secondary} />
        <Text variant="body" tone="secondary">
          Retour
        </Text>
      </Pressable>

      <Text variant="title" style={s.title}>
        Choisir une équipe
      </Text>
      <Text variant="callout" tone="secondary" style={s.subtitle}>
        Le calendrier, l'effectif et l'analyse suivent l'équipe sélectionnée.
      </Text>

      {loading ? (
        <SkeletonList rows={4} />
      ) : teams.length === 0 ? (
        <EmptyState
          icon="flag-outline"
          title="Aucune équipe"
          description="Créez une première équipe pour commencer à suivre vos séances et vos matchs."
          action={{ label: 'Gérer les équipes', onPress: () => router.push('/(tabs)/teams') }}
        />
      ) : (
        <View style={s.list} accessibilityRole="radiogroup" accessibilityLabel="Équipes">
          {teams.map((team) => {
            const active = team.id === activeTeamId;
            return (
              <Pressable
                key={team.id}
                onPress={() => void handleSelect(team.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, checked: active }}
                accessibilityLabel={team.name}
                style={({ pressed }) => [
                  s.row,
                  {
                    backgroundColor: active ? c.accent.subtle : c.bg.surface,
                    borderColor: active ? c.accent.border : c.border.subtle,
                  },
                  pressed && s.pressed,
                ]}
              >
                <View
                  style={[s.jersey, { backgroundColor: team.color || DEFAULT_TEAM_COLOR }]}
                />
                <Text variant="headline" style={s.flex} numberOfLines={1}>
                  {team.name}
                </Text>
                {active ? (
                  <Ionicons name="checkmark-circle" size={22} color={c.accent.default} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    minHeight: HIT_SLOP_MIN,
  },
  title: { marginTop: t.space.sm },
  subtitle: { marginTop: t.space.xs, marginBottom: t.space.lg },
  list: { gap: t.space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    minHeight: 56,
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.md,
    borderRadius: t.radius.md,
    borderWidth: 1,
  },
  // Repère d'identité d'équipe, comme sur l'écran Équipes.
  jersey: { width: 10, height: 28, borderRadius: 3 },
}));
