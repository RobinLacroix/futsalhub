import { useEffect } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { supabase } from '../lib/supabase'

export function usePushNotifications() {
  useEffect(() => {
    // Configurer le handler ici (dans useEffect) pour éviter tout crash
    // au niveau module dans les builds production/TestFlight
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    })
    registerAndSaveToken()
  }, [])
}

async function registerAndSaveToken() {
  // Les simulateurs ne supportent pas les push — sortir silencieusement
  if (!Device.isDevice) return

  // Canal Android (requis pour Android 8+)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'FutsalHub',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFB020',
    })
  }

  // Demander la permission
  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return

  // Générer le token Expo
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })

  if (!token) return

  // Vérifier que l'utilisateur est connecté
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  // Sauvegarder le token (upsert pour éviter les doublons)
  await supabase
    .from('push_tokens')
    .upsert(
      { user_id: session.user.id, token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' },
    )
}
