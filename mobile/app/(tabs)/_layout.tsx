/**
 * Navigation de l'espace coach (P0-5)
 *
 * Rétablit une vraie tab bar iOS sur iPhone. L'ancienne configuration
 * désactivait la tab bar (`tabBarStyle: { display: 'none' }`) au profit d'un
 * menu hamburger de neuf destinations, ce qui cumulait trois défauts :
 *   - anti-pattern iOS explicite dans les HIG, qui recommandent la tab bar pour
 *     les destinations de premier niveau ;
 *   - coût d'interaction doublé, deux taps et une animation pour chaque
 *     changement de section contre un tap instantané ;
 *   - aucune affordance de position ni de découvrabilité, un drawer fermé
 *     n'affiche ni où l'on est ni ce qui existe.
 *
 * Le chrome est également allégé : la barre de navigation ne porte plus qu'une
 * seule action contextuelle (la saison). « Basculer vers l'espace joueur » et
 * « Déconnexion » ont rejoint l'écran « Plus », où elles ont leur place.
 *
 * La sidebar iPad reste, et lit désormais la même source de destinations.
 */

import { useState } from 'react';
import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsTablet, LAYOUT } from '../../hooks/useIsTablet';
import { TabletSidebar } from '../../components/TabletSidebar';
import { SeasonHeaderButton } from '../../components/SeasonHeaderButton';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { useTheme } from '../../contexts/ThemeContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { PRIMARY_DESTINATIONS } from '../../lib/navigation';

/** Routes hors tab bar : accessibles par navigation, jamais listées. */
const HIDDEN_ROUTES = [
  'dashboard/index',
  'analytics/index',
  'tracker/index',
  'tracker/record',
  'tracker/match-report/[matchId]',
  'calendar/training/[trainingId]',
  'calendar/training/edit/[trainingId]',
  'calendar/matchDetail/[matchId]',
  'calendar/new',
  'calendar/new-match',
  'squad/[playerId]',
  'squad/new-player',
  'squad/import-players',
  'squad/season-planning',
  'choose-team',
  'create-club',
  'teams',
  'settings',
  'share',
  'join-club-staff',
] as const;

function TabsLayoutContent() {
  const isTablet = useIsTablet();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { counts } = useNotifications();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  usePushNotifications();

  const c = theme.colors;

  const badgeFor = (key: string): number | undefined => {
    if (key === 'calendar') {
      const n = counts.absence_report + counts.injury;
      return n > 0 ? n : undefined;
    }
    if (key === 'squad') {
      const n = counts.feedback_comment + counts.questionnaire_response;
      return n > 0 ? n : undefined;
    }
    return undefined;
  };

  const content = (
    <Tabs
      screenOptions={{
        headerShown: !isTablet,
        headerStyle: { backgroundColor: c.bg.canvas },
        headerShadowVisible: false,
        headerTintColor: c.text.primary,
        headerTitleStyle: { color: c.text.primary },
        // Une seule action contextuelle à droite, conformément aux HIG.
        headerRight: isTablet ? undefined : () => <SeasonHeaderButton />,
        sceneStyle: { backgroundColor: c.bg.canvas },
        tabBarActiveTintColor: c.accent.default,
        tabBarInactiveTintColor: c.text.tertiary,
        tabBarStyle: isTablet
          ? { display: 'none' }
          : {
              backgroundColor: c.bg.surface,
              borderTopColor: c.border.subtle,
              borderTopWidth: StyleSheet.hairlineWidth,
            },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarBadgeStyle: {
          backgroundColor: c.negative.fill,
          color: c.text.onFill,
          fontSize: 11,
        },
      }}
    >
      {/* `index` doit rester le premier enfant : c'est la route par défaut. */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      {PRIMARY_DESTINATIONS.filter((d) => d.key !== 'home').map((d) => (
        <Tabs.Screen
          key={d.key}
          name={d.key === 'more' ? 'plus' : d.key}
          options={{
            title: d.label,
            headerShown: d.key === 'calendar' || d.key === 'squad' ? false : !isTablet,
            tabBarBadge: badgeFor(d.key),
            tabBarAccessibilityLabel: d.description ? `${d.label}. ${d.description}` : d.label,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? d.iconActive : d.icon} size={size} color={color} />
            ),
          }}
        />
      ))}

      {HIDDEN_ROUTES.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </Tabs>
  );

  if (isTablet) {
    const headerHeight = Math.max(insets.top, 8) + 8;
    return (
      <View style={{ flex: 1, backgroundColor: c.bg.canvas }}>
        <View
          style={[
            styles.tabletHeader,
            { height: headerHeight, backgroundColor: c.bg.canvas, borderBottomColor: c.border.subtle },
          ]}
        />
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <TabletSidebar
            isExpanded={sidebarExpanded}
            onToggle={() => setSidebarExpanded((v) => !v)}
          />
          <View style={{ flex: 1, paddingHorizontal: LAYOUT.CONTENT_PADDING }}>{content}</View>
        </View>
      </View>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  tabletHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

export default function TabsLayout() {
  return <TabsLayoutContent />;
}
