import type { BadgeTone } from '../../components/ui';

/**
 * Taxonomie des fiches procédé — mêmes valeurs que app/webapp/library/page.tsx
 * (web, constantes BLOCS/FORMATS/PHASES_DE_JEU/INTENSITES) et que
 * public/tools/tactics/index.html (TAXO_BLOC/TAXO_FORMAT/TAXO_PHASE/
 * TAXO_INTENSITE, cf editor.js). À garder synchronisées : ce sont des valeurs
 * de colonnes DB (bloc/type/theme/intensite), pas des libellés libres.
 */
export const BLOCS = ['Échauffement', 'Problématisation', 'Situation isolée', 'Analytique', 'Jeu orienté', 'Match libre'] as const;
export const FORMATS = ['Echauffement', 'Exercice', 'Situation', 'Jeu', 'Rondo/Toro'] as const;
export const PHASES_DE_JEU = ['Offensif', 'Transition', 'Defensif', 'CPA', 'Powerplay'] as const;
export const INTENSITES = ['Légère', 'Modérée', 'Haute'] as const;

/** Tons sémantiques du design system mobile — jamais de teinte choisie à la main (cf Badge). */
export function phaseTone(theme: string | null | undefined): BadgeTone {
  if (theme === 'Offensif') return 'positive';
  if (theme === 'Defensif') return 'negative';
  if (theme === 'Transition') return 'warning';
  if (theme === 'CPA' || theme === 'Powerplay') return 'accent';
  return 'neutral';
}

export function intensiteTone(intensite: string | null | undefined): BadgeTone {
  if (intensite === 'Haute') return 'negative';
  if (intensite === 'Modérée') return 'warning';
  if (intensite === 'Légère') return 'positive';
  return 'neutral';
}
