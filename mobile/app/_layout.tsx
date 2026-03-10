import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActiveTeamProvider } from '../contexts/ActiveTeamContext';
import { AppRoleProvider } from '../contexts/AppRoleContext';

export default function RootLayout() {
  const [fontsLoaded] = useFonts(
    Ionicons.font ? { ...Ionicons.font } : {}
  );

  if (Ionicons.font && !fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
      <AppRoleProvider>
        <ActiveTeamProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="sign-up" options={{ title: 'Créer un compte' }} />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="choose-role" />
            <Stack.Screen name="join-club" options={{ title: 'Rejoindre le club' }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(player-tabs)" />
          </Stack>
        </ActiveTeamProvider>
      </AppRoleProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
