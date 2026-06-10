import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { SwitchToCoachButton, SignOutIconButton } from '../../components/SwitchSpaceButton';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { useNotifications } from '../../contexts/NotificationContext';

export default function PlayerTabsLayout() {
  usePushNotifications();
  const { counts, markRead } = useNotifications();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#16a34a' },
        headerTintColor: '#fff',
        tabBarActiveTintColor: '#16a34a',
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
