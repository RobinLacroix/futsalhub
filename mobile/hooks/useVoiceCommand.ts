import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { parseVoiceCommand } from '../utils/voiceParser';
import type { Player, MatchEventType } from '../types';

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

  // Écoute le résultat final de la reconnaissance vocale
  useSpeechRecognitionEvent('result', (event) => {
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

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  });

  useSpeechRecognitionEvent('error', () => {
    setIsListening(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  });

  const stopListening = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    ExpoSpeechRecognitionModule.stop();
    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) return;

    ExpoSpeechRecognitionModule.start({
      lang: 'fr-FR',
      continuous: false,
      interimResults: false,
    });
    setIsListening(true);

    // Arrêt automatique après 6 secondes sans résultat
    timeoutRef.current = setTimeout(() => {
      ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
    }, 6000);
  }, []);

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      ExpoSpeechRecognitionModule.stop();
    };
  }, []);

  return { isListening, startListening, stopListening };
}
