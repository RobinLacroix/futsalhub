import { useState } from 'react';
import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsTablet, LAYOUT } from '../../hooks/useIsTablet';
import { TabletSidebar } from '../../components/TabletSidebar';
import { PhoneNavMenu } from '../../components/PhoneNavMenu';
import { SwitchToPlayerButton, SignOutIconButton } from '../../components/SwitchSpaceButton';

function TabsLayoutContent() {
  const isTablet = useIsTablet();
  const insets = useSafeAreaInsets();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const tabScreenOptions = {
    headerStyle: { backgroundColor: '#3b82f6' },
    headerTintColor: '#fff',
    tabBarActiveTintColor: '#3b82f6',
    tabBarStyle: { display: 'none' },
    headerShown: isTablet ? false : true,
    headerLeft: isTablet ? undefined : () => <PhoneNavMenu />,
    headerRight: isTablet ? undefined : () => (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <SwitchToPlayerButton />
        <SignOutIconButton />
      </View>
    ),
  };

  const content = (
    <Tabs
      screenOptions={tabScreenOptions}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarLabel: 'Accueil',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendrier',
          tabBarLabel: 'Calendrier',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="squad"
        options={{
          title: 'Équipe',
          tabBarLabel: 'Équipe',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tracker"
        options={{
          title: 'Tracker',
          tabBarLabel: 'Tracker',
          headerShown: false,
          href: isTablet ? '/(tabs)/tracker' : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarLabel: 'Analytics',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'pie-chart' : 'pie-chart-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tracker/record"
        options={{ href: null, title: 'Enregistrer un match' }}
      />
      <Tabs.Screen
        name="calendar/training/[trainingId]"
        options={{ href: null, title: 'Détail entraînement' }}
      />
      <Tabs.Screen
        name="calendar/matchDetail/[matchId]"
        options={{ href: null, title: 'Match' }}
      />
      <Tabs.Screen
        name="calendar/new"
        options={{ href: null, title: 'Nouvel entraînement' }}
      />
      <Tabs.Screen
        name="calendar/new-match"
        options={{ href: null, title: 'Nouveau match' }}
      />
      <Tabs.Screen
        name="squad/[playerId]"
        options={{ href: null, title: 'Détail joueur' }}
      />
      <Tabs.Screen
        name="choose-team"
        options={{
          href: null,
          title: 'Choisir une équipe',
        }}
      />
      <Tabs.Screen
        name="create-club"
        options={{
          href: null,
          title: 'Créer un club',
        }}
      />
      <Tabs.Screen
        name="teams"
        options={{
          href: null,
          title: 'Équipes du club',
        }}
      />
    </Tabs>
  );

  if (isTablet) {
    const headerHeight = Math.max(insets.top, 8) + 8;
    return (
      <View style={{ flex: 1 }}>
        <View style={[styles.tabletHeader, { height: headerHeight }]} />
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <TabletSidebar
            isExpanded={sidebarExpanded}
            onToggle={() => setSidebarExpanded((v) => !v)}
          />
          <View style={{ flex: 1, paddingHorizontal: LAYOUT.CONTENT_PADDING }}>
            {content}
          </View>
        </View>
      </View>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  tabletHeader: {
    backgroundColor: '#f8fafc',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
});

export default function TabsLayout() {
  return <TabsLayoutContent />;
}
