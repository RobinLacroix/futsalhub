/**
 * Navigation de l'espace joueur (P1-7)
 *
 * L'espace joueur était vert (`#16a34a`) et l'espace coach bleu : la
 * distinction est utile — le même appareil sert aux deux, et Robin bascule de
 * l'un à l'autre. Elle est conservée, mais elle passe par la rampe : l'espace
 * joueur prend `positive` (teal), l'espace coach garde `accent` (violet).
 *
 * Le vert d'origine était à 3,30:1, l'un des trois contrastes nommés par
 * l'audit. Le teal est validé à 4,5:1 dans les deux thèmes.
 *
 * ## Saison → thème
 *
 * Le sélecteur de saison quitte le header joueur. Un joueur ne consulte que la
 * saison en cours : le bouton n'était utile qu'au staff, et il occupait la
 * seule place disponible. `activeSeason` continue de valoir la saison active du
 * club (défaut d'`ActiveSeasonContext`), les écrans qui la lisent ne changent
 * pas de comportement.
 *
 * À sa place, la bascule clair / sombre. L'espace joueur n'a aucun écran de
 * réglages : sans ça, un joueur qui n'est pas coach n'a aucun moyen de choisir
 * son thème.
 */

import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { SwitchToCoachButton, SignOutIconButton } from '../../components/SwitchSpaceButton';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { useNotifications } from '../../contexts/NotificationContext';

export default function PlayerTabsLayout() {
  usePushNotifications();
  const { counts, markRead } = useNotifications();
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.bg.surface },
        headerTintColor: c.positive.default,
        headerTitleStyle: { color: c.text.primary },
        headerShadowVisible: false,
        tabBarActiveTintColor: c.positive.default,
        tabBarInactiveTintColor: c.text.tertiary,
        tabBarStyle: { backgroundColor: c.bg.surface, borderTopColor: c.border.subtle },
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 8 }}>
            <ThemeToggleButton />
            <SwitchToCoachButton />
            <SignOutIconButton />
          </View>
        ),
      }}
      screenListeners={({ route }) => ({
        focus: () => {
          if (route.name === 'index') void markRead(['convocation']);
          if (route.name === 'questionnaires') void markRead(['questionnaire']);
        },
      })}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Convocations',
          tabBarLabel: 'Calendrier',
          tabBarBadge: counts.convocation > 0 ? counts.convocation : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          headerShown: false,
          tabBarLabel: 'Ma fiche',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="questionnaires"
        options={{
          title: 'Questionnaires',
          tabBarLabel: 'Questionnaires',
          tabBarBadge: counts.questionnaire > 0 ? counts.questionnaire : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="shared"
        options={{
          title: 'Contenu',
          tabBarLabel: 'Contenu',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'share-social' : 'share-social-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
