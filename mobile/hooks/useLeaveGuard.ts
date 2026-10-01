import { createElement, useEffect, useRef } from 'react';
import { Alert, BackHandler } from 'react-native';
import { useIsFocused, useNavigation, useRouter } from 'expo-router';
import { HeaderBackButton } from '../components/ui';
import { haptics } from '../lib/design/haptics';

/**
 * Confirmation avant de quitter un écran. Trois portes de sortie, toutes couvertes :
 *  - le bouton retour du header, remplacé par un bouton qui demande d'abord ;
 *  - la touche retour Android ;
 *  - `beforeRemove` (geste de balayage, retour programmatique), désactivé le temps de la sortie confirmée.
 * `beforeRemove` seul ne suffisait pas : dans un `Tabs` il ne se déclenche jamais, et le
 * bouton retour ramenait à la fiche séance sans rien demander.
 *
 * `allowLeave()` permet une sortie voulue par l'écran lui-même (ex. « Enregistrer »), sans alerte.
 */
export function useLeaveGuard(
  enabled: boolean,
  copy: { title: string; message: string; stay: string; leave: string },
): { allowLeave: () => void } {
  const navigation = useNavigation();
  const router = useRouter();
  const focused = useIsFocused();
  const leavingRef = useRef(false);
  const copyRef = useRef(copy);
  copyRef.current = copy;

  useEffect(() => {
    // Non armé quand un autre écran est empilé dessus (ex. Équipes ouvert depuis le live) : la touche retour Android ne doit pas viser l'écran du dessous.
    if (!enabled || !focused) return;
    leavingRef.current = false;

    const ask = (onConfirm: () => void) => {
      haptics.warning();
      const c = copyRef.current;
      Alert.alert(c.title, c.message, [
        { text: c.stay, style: 'cancel' },
        {
          text: c.leave,
          style: 'destructive',
          onPress: () => {
            leavingRef.current = true;
            onConfirm();
          },
        },
      ]);
    };

    navigation.setOptions({
      headerLeft: () => createElement(HeaderBackButton, { onPress: () => ask(() => router.back()) }),
      gestureEnabled: false,
    });

    const hardware = BackHandler.addEventListener('hardwareBackPress', () => {
      ask(() => router.back());
      return true;
    });

    const removeListener = navigation.addListener('beforeRemove', (e) => {
      if (leavingRef.current) return;
      e.preventDefault();
      ask(() => navigation.dispatch(e.data.action));
    });

    return () => {
      hardware.remove();
      removeListener();
      navigation.setOptions({ headerLeft: undefined, gestureEnabled: true });
    };
  }, [enabled, focused, navigation, router]);

  return { allowLeave: () => { leavingRef.current = true; } };
}
