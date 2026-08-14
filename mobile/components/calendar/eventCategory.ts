/**
 * Catégorie d'événement du calendrier — source unique de la couleur (P0-7)
 *
 * Entraînement et match sont une **catégorie**, pas un statut : ni l'un ni
 * l'autre n'est « bon » ou « mauvais ». Les teintes viennent donc de
 * `chartSeries`, la rampe catégorielle du thème, et jamais de `positive` /
 * `negative` / `warning`, qui portent un jugement.
 *
 * Avant, la grille du mois, la légende et la carte d'événement définissaient
 * chacune leur bleu et leur ambre en dur, avec deux valeurs de bleu différentes
 * (`#3b82f6` dans la carte, `#2563eb` dans la grille) que rien ne distinguait.
 */

import type { ThemeColors } from '../../lib/design/tokens';

export type EventCategory = 'training' | 'match';

export interface EventCategoryStyle {
  color: string;
  icon: 'barbell' | 'football';
  label: string;
}

export function eventCategoryStyle(
  category: EventCategory,
  c: ThemeColors,
): EventCategoryStyle {
  return category === 'training'
    ? { color: c.chartSeries[0], icon: 'barbell', label: 'Entraînement' }
    : { color: c.chartSeries[2], icon: 'football', label: 'Match' };
}
