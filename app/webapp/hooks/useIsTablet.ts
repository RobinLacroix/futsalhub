'use client';

import { useEffect, useState } from 'react';

/**
 * Miroir de mobile/hooks/useIsTablet.ts — même seuil (768px), pour que les
 * mises en page qui basculent tableau/cartes sur mobile basculent au même
 * point sur web (déjà le seuil utilisé par la sidebar dans app/webapp/layout.tsx).
 */
const TABLET_MIN_WIDTH = 768;

export function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const check = () => setIsTablet(window.innerWidth >= TABLET_MIN_WIDTH);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isTablet;
}
