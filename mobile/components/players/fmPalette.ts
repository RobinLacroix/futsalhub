/**
 * Palette de la fiche joueur — style « Football Manager » (P0-7)
 *
 * La fiche joueur est l'écran signature de FutsalHub : bandeau sombre, sections
 * denses, blocs de KPI, radar, barre de saison. **Ce caractère vient de la
 * structure, pas des teintes.** Ce module remplace donc les 83 couleurs figées
 * de `PlayerDetailView` par une palette dérivée du thème, sans toucher à la
 * mise en page.
 *
 * Deux décisions à connaître avant de modifier ce fichier :
 *
 * 1. **Le bandeau reste une surface de marque, dans les deux thèmes.** C'est le
 *    seul aplat de l'application qui ne suit pas `bg.*` : il porte l'identité de
 *    la fiche, comme une image de couverture. Il s'assombrit en thème sombre
 *    pour ne pas former une tache claire sur le canvas anthracite, mais il ne
 *    devient jamais un fond neutre. Le texte posé dessus est toujours clair.
 *
 * 2. **L'ambre d'origine cède la place à l'accent du système.** L'écran portait
 *    son propre accent `#d97706`, ce qui faisait deux couleurs de marque dans
 *    l'application. Un seul accent, partout : c'est précisément ce que l'audit
 *    reprochait à l'ancienne version. Le vert et le rouge passent sur la rampe
 *    sémantique, et le violet du statut « blessé » passe en `warning`, cohérent
 *    avec `components/training/attendance.ts` où un joueur blessé est une
 *    information à traiter et non une erreur.
 */

import type { ThemeColors } from '../../lib/design/tokens';

export interface FMPalette {
  /** Aplat de marque du bandeau. Ne suit pas `bg.*`, volontairement. */
  brand: string;
  /** Texte plein sur le bandeau. */
  onBrand: string;
  /** Texte secondaire sur le bandeau. */
  onBrandMuted: string;
  /** Fond de pastille sur le bandeau. */
  onBrandFill: string;
  /** Bordure de pastille sur le bandeau. */
  onBrandBorder: string;

  bg: string;
  surface: string;
  surface2: string;
  border: string;
  divider: string;

  accent: string;
  accentFill: string;
  accentSubtle: string;

  positive: string;
  negative: string;
  warning: string;
  neutral: string;

  text1: string;
  text2: string;
  text3: string;
  onFill: string;

  /** Séries catégorielles, pour les événements et les courbes. */
  series: readonly string[];
  /** Grille de graphique. */
  grid: string;
}

export function fmPalette(c: ThemeColors, scheme: 'light' | 'dark'): FMPalette {
  return {
    brand: scheme === 'dark' ? '#141B2E' : '#1A2744',
    onBrand: '#FFFFFF',
    onBrandMuted: 'rgba(255,255,255,0.62)',
    onBrandFill: 'rgba(255,255,255,0.10)',
    onBrandBorder: 'rgba(255,255,255,0.22)',

    bg: c.bg.canvas,
    surface: c.bg.surface,
    surface2: c.bg.sunken,
    border: c.border.subtle,
    divider: c.border.subtle,

    accent: c.accent.default,
    accentFill: c.accent.fill,
    accentSubtle: c.accent.subtle,

    positive: c.positive.default,
    negative: c.negative.default,
    warning: c.warning.default,
    neutral: c.neutralData,

    text1: c.text.primary,
    text2: c.text.secondary,
    text3: c.text.tertiary,
    onFill: c.text.onFill,

    series: c.chartSeries,
    grid: c.chartGrid,
  };
}

/**
 * Couleur d'un statut de séance. Alignée sur `components/training/attendance.ts`
 * pour qu'un « blessé » ait la même teinte sur la fiche joueur et sur la feuille
 * de présence : avant, c'était violet ici et bleu là-bas.
 */
export type SessionStatus = 'present' | 'late' | 'absent' | 'injured' | 'not_recorded';

export function sessionColor(status: SessionStatus, p: FMPalette): string {
  switch (status) {
    case 'present':
      return p.positive;
    case 'late':
      return p.warning;
    case 'absent':
      return p.negative;
    case 'injured':
      return p.series[5] ?? p.warning;
    default:
      return p.border;
  }
}
