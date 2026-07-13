import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { MatchData } from '../types';

/**
 * Incrémente chaque seconde le temps de match et le temps de jeu des joueurs
 * présents sur le terrain, tant que le match est en cours.
 */
export function useMatchTimer(
  isRunning: boolean,
  setMatchData: Dispatch<SetStateAction<MatchData>>,
) {
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (isRunning) {
      interval = setInterval(() => {
        setMatchData(prev => ({
          ...prev,
          matchTime: prev.matchTime + 1,
          players: prev.players.map(player => ({
            ...player,
            totalTime: player.isOnField ? player.totalTime + 1 : player.totalTime,
            currentSequenceTime: player.isOnField ? player.currentSequenceTime + 1 : player.currentSequenceTime,
          })),
        }));
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isRunning, setMatchData]);
}
