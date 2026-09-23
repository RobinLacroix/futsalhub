import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { playPhaseTransitionSound } from '../lib/design/liveSessionSound';

export interface SeriesConfig {
  seriesCount: number;
  seriesDurationSeconds: number;
  restDurationSeconds: number;
}

export type TimerPhaseKind = 'serie' | 'repos';

export interface LiveGameTimerState {
  mode: 'continu' | 'series';
  /** secondes écoulées depuis le début du jeu (mode continu) ou de la phase courante (mode séries). */
  elapsedSeconds: number;
  /** mode séries uniquement */
  currentSeriesIndex: number | null;
  phaseKind: TimerPhaseKind | null;
  phaseRemainingSeconds: number | null;
  isFinished: boolean;
}

/**
 * Chrono d'un jeu, continu ou à séries/repos. `phaseStartedAtMs` est la seule
 * source de vérité temporelle — recalculé à chaque tick ET à chaque retour au
 * premier plan de l'app, jamais décrémenté (même patron que le chrono du match
 * recorder, `mobile/components/recorder/useMatchRecorder.ts:584-598`).
 * `onPhaseChange` déclenche le signal sonore/haptique — appelé une seule fois
 * par bascule franchie, pas à chaque tick.
 */
export function useLiveGameTimer(params: {
  mode: 'continu' | 'series';
  seriesConfig: SeriesConfig | null;
  gameStartedAtMs: number;
  /** restauré depuis le snapshot en cas de reprise — sinon calculé au montage. */
  initialPhaseStartedAtMs?: number;
  initialPhaseKind?: TimerPhaseKind;
  initialSeriesIndex?: number;
  onPhaseChange?: (phaseStartedAtMs: number, phaseKind: TimerPhaseKind, seriesIndex: number) => void;
}): LiveGameTimerState {
  const { mode, seriesConfig, gameStartedAtMs, onPhaseChange } = params;

  const phaseStartedAtMsRef = useRef(params.initialPhaseStartedAtMs ?? gameStartedAtMs);
  const phaseKindRef = useRef<TimerPhaseKind>(params.initialPhaseKind ?? 'serie');
  const seriesIndexRef = useRef<number>(params.initialSeriesIndex ?? 0);

  const computeState = useCallback((): LiveGameTimerState => {
    if (mode === 'continu') {
      const elapsedSeconds = Math.floor((Date.now() - gameStartedAtMs) / 1000);
      return { mode, elapsedSeconds, currentSeriesIndex: null, phaseKind: null, phaseRemainingSeconds: null, isFinished: false };
    }

    if (!seriesConfig) {
      return { mode, elapsedSeconds: 0, currentSeriesIndex: 0, phaseKind: 'serie', phaseRemainingSeconds: 0, isFinished: false };
    }

    const phaseDurationFor = (kind: TimerPhaseKind) =>
      kind === 'serie' ? seriesConfig.seriesDurationSeconds : seriesConfig.restDurationSeconds;

    let phaseElapsed = Math.floor((Date.now() - phaseStartedAtMsRef.current) / 1000);
    let remaining = phaseDurationFor(phaseKindRef.current) - phaseElapsed;

    // Avale toutes les bascules manquées (app restée en arrière-plan plusieurs
    // phases) en une seule passe, en notifiant chaque transition franchie.
    while (remaining <= 0) {
      const isLastSeries = seriesIndexRef.current >= seriesConfig.seriesCount - 1;
      if (phaseKindRef.current === 'serie' && isLastSeries) {
        return { mode, elapsedSeconds: 0, currentSeriesIndex: seriesIndexRef.current, phaseKind: 'serie', phaseRemainingSeconds: 0, isFinished: true };
      }
      const overshoot = -remaining;
      if (phaseKindRef.current === 'serie') {
        phaseKindRef.current = 'repos';
      } else {
        phaseKindRef.current = 'serie';
        seriesIndexRef.current += 1;
      }
      phaseStartedAtMsRef.current = Date.now() - overshoot * 1000;
      onPhaseChange?.(phaseStartedAtMsRef.current, phaseKindRef.current, seriesIndexRef.current);
      void playPhaseTransitionSound();

      phaseElapsed = overshoot;
      remaining = phaseDurationFor(phaseKindRef.current) - phaseElapsed;
    }

    return {
      mode,
      elapsedSeconds: phaseElapsed,
      currentSeriesIndex: seriesIndexRef.current,
      phaseKind: phaseKindRef.current,
      phaseRemainingSeconds: remaining,
      isFinished: false,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, seriesConfig, gameStartedAtMs, onPhaseChange]);

  const [state, setState] = useState<LiveGameTimerState>(computeState);

  useEffect(() => {
    setState(computeState());
    const interval = setInterval(() => setState(computeState()), 1000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setState(computeState());
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [computeState]);

  return state;
}
