import React, { createContext, useContext, useMemo, useState } from 'react';
import { Alert } from 'react-native';

type MatchRecorderExitGuardContextValue = {
  /** Match recorder tablette : étape saisie avec un match chargé */
  isRecordingActive: boolean;
  setIsRecordingActive: (active: boolean) => void;
  /** Désactive temporairement la confirmation (sortie volontaire après enregistrement ou après « Quitter » dans l’alerte) */
  suppressExitGuard: boolean;
  setSuppressExitGuard: (suppress: boolean) => void;
};

const MatchRecorderExitGuardContext = createContext<MatchRecorderExitGuardContextValue | null>(
  null
);

export function MatchRecorderExitGuardProvider({ children }: { children: React.ReactNode }) {
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  const [suppressExitGuard, setSuppressExitGuard] = useState(false);

  const value = useMemo(
    () => ({
      isRecordingActive,
      setIsRecordingActive,
      suppressExitGuard,
      setSuppressExitGuard,
    }),
    [isRecordingActive, suppressExitGuard]
  );

  return (
    <MatchRecorderExitGuardContext.Provider value={value}>
      {children}
    </MatchRecorderExitGuardContext.Provider>
  );
}

export function useMatchRecorderExitGuard() {
  const ctx = useContext(MatchRecorderExitGuardContext);
  if (!ctx) {
    throw new Error('useMatchRecorderExitGuard must be used within MatchRecorderExitGuardProvider');
  }
  return ctx;
}

export function confirmLeaveMatchRecorder(
  onConfirm: () => void,
  setSuppressExitGuard: (v: boolean) => void
) {
  Alert.alert(
    "Quitter l'enregistrement ?",
    'En quittant cette page, certaines données peuvent être perdues (temps de jeu, saisie non enregistrée ou synchronisation en attente).',
    [
      { text: 'Rester', style: 'cancel' },
      {
        text: 'Quitter',
        style: 'destructive',
        onPress: () => {
          setSuppressExitGuard(true);
          queueMicrotask(onConfirm);
        },
      },
    ]
  );
}
