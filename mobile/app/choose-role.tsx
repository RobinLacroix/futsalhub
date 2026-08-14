/**
 * Choisir l'espace à ouvrir — comptes à la fois coach et joueur
 *
 * ## Cet écran était du code mort
 *
 * Il existait, il était enregistré dans `app/_layout`, et **rien ne le
 * routait**. L'aiguillage de démarrage forçait `appRole = 'coach'` dès qu'un
 * compte avait une équipe : la question ne pouvait jamais se poser.
 *
 * Il redevient utile maintenant que la préférence de l'utilisateur est
 * respectée. Il ne s'affiche qu'une fois, au premier lancement d'un compte qui
 * est les deux — le cas normal en club amateur, un senior qui entraîne les
 * jeunes. Ensuite le choix est enregistré, et se change depuis « Plus » (ou la
 * sidebar sur iPad) et depuis l'en-tête de l'espace joueur.
 *
 * ## Ce qui change à l'écran
 *
 * Douze couleurs en dur, dont le `#16a34a` à 3,30:1 de l'ancienne identité
 * joueur et un `#3b82f6` qui n'est plus l'accent de l'application. Tout passe
 * par la rampe, avec la même convention que le reste : `accent` pour l'espace
 * coach, `positive` pour l'espace joueur.
 *
 * Le vouvoiement est corrigé — le reste de l'application tutoie.
 */

import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppRole } from '../contexts/AppRoleContext';
import { useTheme, makeStyles } from '../contexts/ThemeContext';
import { haptics } from '../lib/design/haptics';
import { Text } from '../components/ui';

export default function ChooseRoleScreen() {
  const router = useRouter();
  const s = useStyles();
  const { theme } = useTheme();
  const { setAppRole, player } = useAppRole();
  const c = theme.colors;

  const choose = async (role: 'coach' | 'player') => {
    haptics.select();
    await setAppRole(role);
    router.replace(role === 'coach' ? '/(tabs)' : '/(player-tabs)');
  };

  return (
    <View style={s.root}>
      <View style={s.content}>
        <Text variant="title" style={s.center}>
          Quel espace ouvrir ?
        </Text>
        <Text variant="callout" tone="secondary" style={s.center}>
          Ton compte est à la fois coach et joueur. Tu pourras basculer de l’un à
          l’autre à tout moment : ce choix n’est que celui par défaut.
        </Text>

        <RoleCard
          icon="clipboard-outline"
          tint={c.accent.default}
          tintSubtle={c.accent.subtle}
          title="Espace coach"
          description="Calendrier, effectif, séances, matchs"
          onPress={() => choose('coach')}
        />

        <RoleCard
          icon="football-outline"
          tint={c.positive.default}
          tintSubtle={c.positive.subtle}
          title="Espace joueur"
          description={
            player
              ? `Convocations, questionnaires, fiche de ${player.first_name}`
              : 'Convocations, questionnaires, ma fiche'
          }
          onPress={() => choose('player')}
        />
      </View>
    </View>
  );
}

function RoleCard({
  icon,
  tint,
  tintSubtle,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  tintSubtle: string;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const s = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      style={({ pressed }) => [s.card, { borderColor: tint }, pressed && s.pressed]}
    >
      <View style={[s.cardIcon, { backgroundColor: tintSubtle }]}>
        <Ionicons name={icon} size={24} color={tint} />
      </View>
      <View style={s.flex}>
        <Text variant="headline">{title}</Text>
        <Text variant="caption" tone="secondary">
          {description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={tint} />
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  pressed: { opacity: 0.65 },
  root: { flex: 1, backgroundColor: t.colors.bg.canvas },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: t.space.md,
    padding: t.space.xl,
    maxWidth: 460,
    alignSelf: 'center',
    width: '100%',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    padding: t.space.lg,
    borderRadius: t.radius.md,
    borderWidth: 1.5,
    backgroundColor: t.colors.bg.surface,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
