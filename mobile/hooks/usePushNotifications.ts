import { useEffect } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { supabase } from '../lib/supabase'

export function usePushNotifications() {
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    })

    registerAndSaveToken()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') registerAndSaveToken()
    })

    return () => { subscription.unsubscribe() }
  }, [])
}

async function registerAndSaveToken() {
  if (!Device.isDevice) return

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'FutsalHub',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFB020',
    })
  }

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return

  try {
    let token: string
    if (Platform.OS === 'ios') {
      const dt = await Notifications.getDevicePushTokenAsync()
      token = dt.data
    } else {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
      const { data: expoToken } = await Notifications.getExpoPushTokenAsync({ projectId })
      token = expoToken
    }
    if (!token) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', session.user.id)
      .eq('platform', Platform.OS)
      .neq('token', token)

    await supabase
      .from('push_tokens')
      .upsert(
        { user_id: session.user.id, token, platform: Platform.OS, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,token' },
      )
  } catch {
    // Non-bloquant — l'app fonctionne sans push
  }
}
