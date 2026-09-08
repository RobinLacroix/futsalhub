import type { ChipOption } from '../components/ui';

/** Options partagées création/édition de match (`new-match.tsx` et `matchDetail/[matchId].tsx`). */

export type LocationOption = 'Domicile' | 'Extérieur';
export type CompetitionOption = 'Championnat' | 'Coupe' | 'Amical';

export const LOCATION_OPTIONS: readonly ChipOption<LocationOption>[] = [
  { value: 'Domicile', label: 'Domicile', icon: 'home-outline' },
  { value: 'Extérieur', label: 'Extérieur', icon: 'bus-outline' },
];

export const COMPETITION_OPTIONS: readonly ChipOption<CompetitionOption>[] = [
  { value: 'Championnat', label: 'Championnat' },
  { value: 'Coupe', label: 'Coupe' },
  { value: 'Amical', label: 'Amical' },
];
