import { useState, useEffect } from 'react';
import { Dimensions, ScaledSize } from 'react-native';

/** Breakpoint en dp : au-dessus = tablette (iPad) */
const TABLET_MIN_WIDTH = 768;

function getIsTablet(): boolean {
  const { width, height } = Dimensions.get('window');
  const min = Math.min(width, height);
  return min >= TABLET_MIN_WIDTH;
}

/**
 * Hook pour adapter l'UI à l'iPad (sidebar, grilles plus larges, etc.).
 * Utilise la plus petite dimension de la fenêtre pour éviter de considérer
 * un iPhone en paysage comme tablette.
 */
export function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState(getIsTablet);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', (e: { window: ScaledSize }) => {
      const { width, height } = e.window;
      setIsTablet(Math.min(width, height) >= TABLET_MIN_WIDTH);
    });
    return () => sub?.remove();
  }, []);

  return isTablet;
}

export const LAYOUT = {
  /** Largeur de la sidebar sur tablette (dp) */
  SIDEBAR_WIDTH: 200,
  /** Largeur sidebar réduite (icônes seuls) */
  SIDEBAR_WIDTH_COLLAPSED: 72,
  /** Espacement contenu principal sur tablette */
  CONTENT_PADDING: 24,
  /** Largeur max du contenu en mode tablette (pour lisibilité) */
  MAX_CONTENT_WIDTH: 900,
  /** Breakpoint utilisé pour isTablet */
  TABLET_MIN_WIDTH: TABLET_MIN_WIDTH,
} as const;
