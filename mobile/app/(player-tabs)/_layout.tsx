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
 * À sa place vivait la bascule clair / sombre, puis (P1-7 v2) les actions de
 * compte sur l'onglet « Ma fiche » — parce que l'espace joueur n'avait aucun
 * écran de réglages où les poser. Ce trou est refermé par `player-settings.tsx`
 * (écran poussé, même format que « Plus » côté coach) : thème 3 positions,
 * bascule coach, déconnexion, suppression de compte y vivent maintenant tous
 * ensemble.
 *
 * ## Répartition du header
 *
 * Une seule icône réglages en `headerLeft`, globale aux quatre onglets — un
 * onglet n'a pas de bouton retour, la place était déjà libre, et un réglage
 * n'appartient à aucun écran en particulier. Elle ouvre `player-settings.tsx`.
 * Plus rien en `headerRight` : les anciennes actions (bascule coach,
 * déconnexion, suppression) ont migré sur cet écran, `SwitchSpaceButton.tsx`
 * et `ThemeToggleButton.tsx` sont supprimés (plus aucun appelant).
 */

import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { useNotifications } from '../../contexts/NotificationContext';
import { PlayerSettingsButton } from '../../components/PlayerSettingsButton';

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
        // Un onglet n'a pas de bouton retour : la gauche du header est libre, et
        // c'est la place d'un réglage — il n'appartient à aucun écran en
        // particulier, contrairement à une action.
        headerLeft: () => <PlayerSettingsButton />,
      }}
      screenListeners={({ route }) => ({
        focus: () => {
          if (route.name === 'index') void markRead(['convocation']);
          if (route.name === 'questionnaires') void markRead(['questionnaire']);
          if (route.name === 'feed') void markRead(['post_tag', 'post_comment']);
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
          title: 'Ma fiche',
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
      <Tabs.Screen
        name="feed"
        options={{
          headerShown: false,
          tabBarLabel: 'Fil',
          tabBarBadge: counts.post_tag > 0 ? counts.post_tag : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
