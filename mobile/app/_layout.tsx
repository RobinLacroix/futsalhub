import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, ActivityIndicator, Text, StyleSheet, ScrollView, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import { ActiveTeamProvider } from '../contexts/ActiveTeamContext';
import { ActiveSeasonProvider } from '../contexts/ActiveSeasonContext';
import { AppRoleProvider } from '../contexts/AppRoleContext';
import { MatchRecorderExitGuardProvider } from '../contexts/MatchRecorderExitGuardContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { useOrientationPolicy } from '../hooks/useOrientationPolicy';
import { isSupabaseConfigured } from '../lib/supabase';
import { flushMatchRecorderOutbox } from '../lib/offline/matchRecorderOutbox';

function NotificationDeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      const type = data?.type;
      switch (type) {
        case 'convocation':
          router.push('/(player-tabs)/');
          break;
        case 'questionnaire':
          router.push('/(player-tabs)/questionnaires');
          break;
        case 'absence_report':
        case 'injury': {
          const tid = data?.training_id;
          if (tid) router.push(`/(tabs)/calendar/training/${tid}` as any);
          else router.push('/(tabs)/calendar');
          break;
        }
        case 'feedback_comment':
        case 'questionnaire_response': {
          const pid = data?.player_id;
          if (pid) router.push(`/(tabs)/squad/${pid}` as any);
          else router.push('/(tabs)/squad');
          break;
        }
      }
    });
    return () => sub.remove();
  }, [router]);

  return null;
}

function MatchRecorderOutboxSync() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void flushMatchRecorderOutbox().catch((e) =>
          console.warn('[Outbox] flush AppState active', e)
        );
      }
    });
    const netSub = Network.addNetworkStateListener(() => {
      void flushMatchRecorderOutbox().catch((e) =>
        console.warn('[Outbox] flush après changement réseau', e)
      );
    });
    void flushMatchRecorderOutbox().catch((e) => console.warn('[Outbox] flush au démarrage', e));
    return () => {
      sub.remove();
      netSub.remove();
    };
  }, []);
  return null;
}

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

/**
 * Applique le thème résolu au chrome de navigation et à la barre de statut,
 * et retient le rendu tant que les polices ne sont pas prêtes (évite le flash
 * de texte en police système puis re-rendu en Archivo).
 */
function ThemedRoot() {
  const { theme, ready } = useTheme();
  useOrientationPolicy();

  if (!ready) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.colors.bg.canvas }]}>
        <ActivityIndicator color={theme.colors.accent.default} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme.statusBarStyle} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bg.canvas },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" options={{ title: 'Créer un compte' }} />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="choose-role" />
        <Stack.Screen name="join-club" options={{ title: 'Rejoindre le club' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(player-tabs)" />
        {/* Vérification visuelle du design system. Non listée en navigation. */}
        <Stack.Screen name="design-gallery" options={{ title: 'Design system' }} />
      </Stack>
    </>
  );
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
      <ThemeProvider>
        <MatchRecorderExitGuardProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
              <MatchRecorderOutboxSync />
              <AppRoleProvider>
                <ActiveTeamProvider>
                  <ActiveSeasonProvider>
                    <NotificationProvider>
                      <NotificationDeepLinkHandler />
                      <ThemedRoot />
                    </NotificationProvider>
                  </ActiveSeasonProvider>
                </ActiveTeamProvider>
              </AppRoleProvider>
            </SafeAreaProvider>
          </GestureHandlerRootView>
        </MatchRecorderExitGuardProvider>
      </ThemeProvider>
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
