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

    // Tentative initiale (utilisateur déjà connecté au montage)
    registerAndSaveToken()

    // Ré-enregistrer dès que la session est connue :
    // - INITIAL_SESSION : session restaurée depuis AsyncStorage au démarrage (utilisateur déjà connecté)
    // - SIGNED_IN       : connexion explicite (premier login ou après déconnexion)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') registerAndSaveToken()
    })

    return () => { subscription.unsubscribe() }
  }, [])
}

async function registerAndSaveToken() {
  const TAG = '[PushToken]'

  if (!Device.isDevice) {
    console.log(TAG, 'SKIP: simulateur détecté')
    return
  }

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
  console.log(TAG, 'Permission actuelle:', existing)

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
    console.log(TAG, 'Permission après demande:', status)
  }

  if (finalStatus !== 'granted') {
    console.warn(TAG, 'STOP: permission refusée. Va dans Réglages → Notifications → FutsalHub')
    return
  }

  try {
    let token: string
    if (Platform.OS === 'ios') {
      // iOS : token APNs natif (hex 64 car.) — bypass Expo push service
      const dt = await Notifications.getDevicePushTokenAsync()
      token = dt.data
      console.log(TAG, 'APNs device token:', token.slice(0, 16) + '...')
    } else {
      // Android : Expo gère FCM
      const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
      const { data: expoToken } = await Notifications.getExpoPushTokenAsync({ projectId })
      token = expoToken
      console.log(TAG, 'Expo token (Android):', token)
    }
    if (!token) {
      console.warn(TAG, 'STOP: token null')
      return
    }
    console.log(TAG, 'Token obtenu ✓')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      console.warn(TAG, 'STOP: pas de session active')
      return
    }
    console.log(TAG, 'Session user_id:', session.user.id)

    // Supprimer les anciens tokens de ce user/platform avant d'insérer le nouveau
    // (évite les doublons si l'app est réinstallée et génère un nouveau token APNs)
    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', session.user.id)
      .eq('platform', Platform.OS)
      .neq('token', token)

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        { user_id: session.user.id, token, platform: Platform.OS, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,token' },
      )

    if (error) {
      console.error(TAG, 'Erreur upsert push_tokens:', error.message)
    } else {
      console.log(TAG, 'Token sauvegardé en base ✓')
    }
  } catch (e) {
    console.error(TAG, 'Erreur getExpoPushTokenAsync:', e)
  }
}
