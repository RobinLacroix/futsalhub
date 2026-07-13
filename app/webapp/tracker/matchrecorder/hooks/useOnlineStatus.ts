import { useEffect, useState } from 'react';

/**
 * Suit l'état de connexion réseau (online/offline) via les événements window,
 * et initialise depuis navigator.onLine.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => {
      console.log('✅ Connexion internet rétablie');
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log('⚠️ Perte de connexion internet');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Vérifier l'état initial
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
