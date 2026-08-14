/**
 * Palette locale de la page Performance.
 *
 * Le web n'a pas de fichier de tokens : `layout.tsx`, `manager/squad/page.tsx`
 * et les autres redéclarent chacun leur objet `T`. C'est de la dette connue, et
 * ce n'est pas ici qu'on la rembourse — introduire un module de tokens web
 * demande de reprendre les pages existantes, pas d'en ajouter une. Les valeurs
 * ci-dessous sont donc RECOPIÉES à l'identique de `layout.tsx`, pour que la page
 * ne détonne pas, et regroupées ici pour que cette feature n'en fasse qu'une
 * copie au lieu de quatre.
 */

import type { AvailabilityTone } from '@/lib/availability';

export const T = {
  pageBg: '#EEF0F5',
  cardBg: '#FFFFFF',
  border: '#DDE1EA',
  text: '#1A2332',
  textMuted: '#697585',
  accent: '#3B82F6',
  rowOdd: '#F9FAFB',
} as const;

/**
 * Couleurs des statuts de disponibilité.
 *
 * `injury` n'est PAS rouge. `components/training/attendance.ts` a tranché ça
 * côté mobile : un joueur blessé est « une information à traiter et non une
 * erreur ». Le rouge est réservé à `negative`, c'est-à-dire à la suspension,
 * seul statut de la liste qui soit une sanction donc un jugement.
 */
export const TONE_COLORS: Record<AvailabilityTone, { fg: string; bg: string; border: string }> = {
  positive: { fg: '#15803D', bg: 'rgba(22,163,74,0.10)', border: 'rgba(22,163,74,0.30)' },
  warning: { fg: '#B45309', bg: 'rgba(255,176,32,0.12)', border: 'rgba(255,176,32,0.35)' },
  injury: { fg: '#7C3AED', bg: 'rgba(124,58,237,0.10)', border: 'rgba(124,58,237,0.28)' },
  neutral: { fg: '#5B6472', bg: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.28)' },
  negative: { fg: '#B91C1C', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.30)' },
};

/**
 * Rampe d'intensité de douleur : une MESURE, pas un jugement.
 *
 * Volontairement monochrome et croissante, jamais vert-orange-rouge. Colorer
 * une intensité déclarée comme une note reproduit exactement le bug du RPE
 * coloré en sémantique, et pousse le joueur à sous-déclarer pour éviter le
 * rouge — ce qui détruit la donnée qu'on essaie justement de récolter.
 */
export const INTENSITY_RAMP: Record<1 | 2 | 3, string> = {
  1: '#C7D2FE',
  2: '#818CF8',
  3: '#4F46E5',
};
