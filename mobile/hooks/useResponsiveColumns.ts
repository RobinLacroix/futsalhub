import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * Nombre de colonnes d'une grille de cartes et largeur de carte qui en
 * résulte, calculés à partir de la largeur réellement disponible (mesurée
 * via `onLayout` sur le conteneur) plutôt qu'un pourcentage fixe comme
 * `width: '47%'` — ce dernier reste bloqué à 2 colonnes quelle que soit la
 * largeur d'écran, donc gaspille l'espace sur iPad (cf demande de Robin :
 * bibliothèques de séances/procédés doivent prendre toute la largeur
 * disponible avec une taille de carte adaptée à la lisibilité).
 *
 * Vise une largeur de carte proche de `targetWidth`, jamais plus étroite —
 * le nombre de colonnes est arrondi au plus proche puis la largeur exacte
 * répartit l'espace restant, pour que les cartes remplissent toute la ligne
 * sans bord droit orphelin.
 */
export function useResponsiveColumns(targetWidth: number, gap: number, minColumns = 1) {
  const [containerWidth, setContainerWidth] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const columns =
    containerWidth > 0 ? Math.max(minColumns, Math.round((containerWidth + gap) / (targetWidth + gap))) : minColumns;
  const cardWidth = containerWidth > 0 ? (containerWidth - gap * (columns - 1)) / columns : undefined;

  return { onLayout, containerWidth, columns, cardWidth };
}
