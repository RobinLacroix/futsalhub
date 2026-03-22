/**
 * Contexte pour persister l'état du match recorder lors de la navigation.
 * Tant que l'app reste ouverte, les données (temps de jeu, score, etc.) sont conservées
 * si l'utilisateur change de page.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface PlayerState {
  id: string;
  totalTime: number;
  currentSequenceTime: number;
  sequenceTimeLimit: number;
  yellowCards: number;
  redCards: number;
  stats: Record<string, number>;
}

export interface MatchRecorderPersistedState {
  matchId: string;
  step: 'record';
  half: 1 | 2;
  seconds: number;
  isRunning: boolean;
  scoreUs: number;
  scoreOpponent: number;
  opponentShotsTotal: number;
  opponentShotsOnTarget: number;
  foulsUs: number;
  foulsOpponent: number;
  playersOnField: string[];
  playerStates: Record<string, PlayerState>;
}

interface MatchRecorderContextValue {
  persistedState: MatchRecorderPersistedState | null;
  saveState: (state: MatchRecorderPersistedState) => void;
  getStateForMatch: (matchId: string) => MatchRecorderPersistedState | null;
  clearState: () => void;
}

const MatchRecorderContext = createContext<MatchRecorderContextValue | null>(null);

export function MatchRecorderProvider({ children }: { children: React.ReactNode }) {
  const [persistedState, setPersistedState] = useState<MatchRecorderPersistedState | null>(null);

  const saveState = useCallback((state: MatchRecorderPersistedState) => {
    setPersistedState(state);
  }, []);

  const getStateForMatch = useCallback(
    (matchId: string) => {
      if (persistedState && persistedState.matchId === matchId) {
        return persistedState;
      }
      return null;
    },
    [persistedState]
  );

  const clearState = useCallback(() => {
    setPersistedState(null);
  }, []);

  const value = useMemo(
    () => ({ persistedState, saveState, getStateForMatch, clearState }),
    [persistedState, saveState, getStateForMatch, clearState]
  );

  return (
    <MatchRecorderContext.Provider value={value}>
      {children}
    </MatchRecorderContext.Provider>
  );
}

export function useMatchRecorder() {
  return useContext(MatchRecorderContext);
}
