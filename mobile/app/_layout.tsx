import 'react-native-gesture-handler';
import React from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, ActivityIndicator, Text, StyleSheet, ScrollView } from 'react-native';
import { ActiveTeamProvider } from '../contexts/ActiveTeamContext';
import { AppRoleProvider } from '../contexts/AppRoleContext';
import { isSupabaseConfigured } from '../lib/supabase';

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.centered}>
          <Text style={styles.title}>Erreur au démarrage</Text>
          <ScrollView style={styles.scroll}>
            <Text style={styles.errorText}>{this.state.error.message}</Text>
            {this.state.error.stack && (
              <Text style={styles.stackText} selectable>
                {this.state.error.stack}
              </Text>
            )}
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  if (!isSupabaseConfigured) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Configuration manquante</Text>
        <Text style={styles.message}>
          Les variables Supabase ne sont pas définies pour ce build.{'\n\n'}
          Vérifiez les secrets EAS (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY) puis relancez un build.
        </Text>
      </View>
    );
  }

  return (
    <RootErrorBoundary>
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
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  scroll: {
    maxHeight: 400,
    width: '100%',
  },
  errorText: {
    fontSize: 14,
    color: '#b91c1c',
    marginBottom: 8,
  },
  stackText: {
    fontSize: 11,
    color: '#666',
    fontFamily: 'monospace',
  },
});
