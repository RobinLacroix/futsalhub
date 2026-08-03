/**
 * Commande vocale du match recorder.
 *
 * ## Pourquoi le module natif est chargé derrière un `require` gardé
 *
 * `expo-speech-recognition` fournit un module natif. Un `import` statique
 * l'évalue au chargement du fichier : si le binaire installé ne le contient pas
 * (build antérieure à l'ajout du paquet, Expo Go, simulateur sans pod), le
 * module lève **à l'import**, donc avant que React ait monté quoi que ce soit.
 *
 * La conséquence n'est pas « la dictée ne marche pas » : c'est **tout l'écran
 * de suivi de match qui ne s'ouvre plus**, avec un message trompeur
 * (`Cannot read property 'ErrorBoundary' of undefined`) parce que la route
 * échoue avant même que son ErrorBoundary soit résolu.
 *
 * La dictée est un confort ; la saisie du match est le cœur de l'outil. Le
 * confort ne doit jamais emporter le cœur. Le module est donc chargé en
 * `require` protégé, et `isAvailable` dit à l'écran s'il faut afficher le
 * bouton micro.
 *
 * Quand `isAvailable` est faux, la correction est de **reconstruire
 * l'application native** (`npx expo run:ios`) : le paquet est bien dans
 * `package.json` et le pod dans `Podfile.lock`, c'est le binaire installé qui
 * est en retard.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseVoiceCommand } from '../utils/voiceParser';
import type { Player, MatchEventType } from '../types';

type SpeechModule = {
  start: (opts: { lang: string; continuous: boolean; interimResults: boolean }) => void;
  stop: () => void;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
};

type SpeechEvent = { isFinal?: boolean; results?: { transcript?: string }[] };
type UseSpeechEvent = (name: string, handler: (event: SpeechEvent) => void) => void;

const noopEventHook: UseSpeechEvent = () => {};

/**
 * Résolu une seule fois au chargement. L'identité de `useSpeechEvent` est donc
 * stable d'un rendu à l'autre : l'appeler inconditionnellement plus bas ne
 * viole pas les règles des hooks.
 */
const { speech, useSpeechEvent } = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-speech-recognition');
    if (!mod?.ExpoSpeechRecognitionModule) return { speech: null, useSpeechEvent: noopEventHook };
    return {
      speech: mod.ExpoSpeechRecognitionModule as SpeechModule,
      useSpeechEvent: (mod.useSpeechRecognitionEvent ?? noopEventHook) as UseSpeechEvent,
    };
  } catch {
    return { speech: null, useSpeechEvent: noopEventHook };
  }
})();

/** Faux tant que l'application native n'a pas été reconstruite avec le module. */
export const isVoiceCommandAvailable = speech !== null;

interface UseVoiceCommandOptions {
  players: Player[];
  playersOnField: string[];
  onEvent: (eventType: MatchEventType, player: Player | null, statKey: string) => void;
  onSubstitution: (outId: string, inId: string) => void;
  onUnknown: (transcript: string) => void;
}

export function useVoiceCommand({
  players,
  playersOnField,
  onEvent,
  onSubstitution,
  onUnknown,
}: UseVoiceCommandOptions) {
  const [isListening, setIsListening] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopListening = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    speech?.stop();
    setIsListening(false);
  }, []);

  useSpeechEvent('result', (event) => {
    if (!event.isFinal) return;
    const transcript = event.results?.[0]?.transcript ?? '';
    if (!transcript) return;

    const result = parseVoiceCommand(transcript, players, playersOnField);
    if (result.kind === 'event') {
      onEvent(result.eventType, result.player, result.statKey);
    } else if (result.kind === 'substitution') {
      onSubstitution(result.playerOut.id, result.playerIn.id);
    } else {
      onUnknown(result.transcript);
    }

    stopListening();
  });

  useSpeechEvent('end', () => {
    setIsListening(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  });

  useSpeechEvent('error', () => {
    setIsListening(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  });

  const startListening = useCallback(async () => {
    if (!speech) {
      onUnknown('Dictée indisponible sur cette version de l’application');
      return;
    }
    const { granted } = await speech.requestPermissionsAsync();
    if (!granted) {
      onUnknown('Micro refusé — autorisez-le dans les Réglages');
      return;
    }

    speech.start({ lang: 'fr-FR', continuous: false, interimResults: false });
    setIsListening(true);

    // Arrêt automatique après 6 secondes sans résultat.
    timeoutRef.current = setTimeout(() => {
      speech.stop();
      setIsListening(false);
    }, 6000);
  }, [onUnknown]);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      speech?.stop();
    },
    []
  );

  return { isListening, startListening, stopListening, isAvailable: isVoiceCommandAvailable };
}
