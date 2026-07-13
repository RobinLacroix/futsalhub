import { useState } from 'react';

/**
 * Gère le clic long (souris + tactile) de façon générique.
 *
 * - `start(key, onLongPress)` arme un timer : au bout de `delay` ms, exécute
 *   `onLongPress` (typiquement le décrément) puis marque la clé comme déclenchée.
 * - `end(key)` annule le timer et efface le flag après un court délai, afin
 *   que le handler de clic simple puisse ignorer le clic qui suit un clic long.
 * - `triggered[key]` indique si un clic long vient de se déclencher.
 *
 * Chaque compteur du match utilise une clé unique (ex: `${playerId}-goals`,
 * `opponent-shotsOnTarget`, `foul-team`).
 */
export function useLongPress(delay = 500) {
  const [timers, setTimers] = useState<{ [key: string]: ReturnType<typeof setTimeout> }>({});
  const [triggered, setTriggered] = useState<{ [key: string]: boolean }>({});

  const start = (key: string, onLongPress: () => Promise<void> | void) => {
    const timerId = setTimeout(async () => {
      await onLongPress();
      setTriggered(prev => ({ ...prev, [key]: true }));
    }, delay);

    setTimers(prev => ({ ...prev, [key]: timerId }));
  };

  const end = (key: string) => {
    const timer = timers[key];

    if (timer) {
      clearTimeout(timer);
      setTimers(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }

    // Réinitialiser le flag après un court délai pour éviter le double comptage.
    setTimeout(() => {
      setTriggered(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 100);
  };

  return { start, end, triggered };
}
