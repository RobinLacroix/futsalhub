/**
 * FutsalHub — Couche de design tokens (P0-1)
 *
 * Source unique de toutes les valeurs visuelles de l'app mobile.
 * Règle : aucun littéral de couleur, de taille ou d'espacement ne doit exister
 * ailleurs que dans ce fichier. Un écran qui écrit `#3b82f6` ou `fontSize: 13`
 * en dur est un bug.
 *
 * Deux thèmes complets et de qualité égale (sombre + clair), mêmes clés
 * sémantiques. C'est ce qui rend le switch de thème gratuit côté écrans :
 * un composant consomme `t.text.primary`, jamais une teinte.
 *
 * Les ratios de contraste indiqués en commentaire sont calculés (WCAG 2.1)
 * contre le `bg.canvas` du thème concerné. Seuil retenu : 4.5:1 pour tout
 * texte, sans exception.
 */

import { Platform, TextStyle, ViewStyle } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Primitives — indépendantes du thème
// ─────────────────────────────────────────────────────────────────────────────

/** Échelle d'espacement, base 4. Aucune autre valeur n'est autorisée. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 48,
} as const;

/** Rayons de bordure. Cinq valeurs, contre 26 avant la refonte. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** Durées d'animation. Le mouvement est fonctionnel, jamais décoratif. */
export const duration = {
  instant: 120,
  fast: 180,
  base: 240,
  slow: 320,
} as const;

/** Cible minimale de zone tactile (HIG). */
export const HIT_SLOP_MIN = 44;

// ─────────────────────────────────────────────────────────────────────────────
// Typographie
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Familles de polices.
 *
 * Corps de texte = police système, volontairement. SF Pro est optiquement
 * compensée par taille et supporte Dynamic Type nativement : aucune police
 * chargée ne fera mieux, et charger une police de corps ferme la porte du
 * Dynamic Type.
 *
 * Display = Archivo (OFL, Omnibus-Type), pour les titres et les grands chiffres.
 *
 * Piège Android : avec une police custom, `fontWeight` entre en conflit avec la
 * famille et retombe sur un faux gras. La graisse doit donc être portée par le
 * nom de famille (`Archivo-Bold`), jamais par `fontWeight`. Les variantes
 * display ci-dessous n'exposent donc pas de `fontWeight`.
 */
export const fontFamily = {
  /** `undefined` = police système de la plateforme. C'est voulu. */
  body: undefined as string | undefined,
  displaySemibold: 'Archivo-SemiBold',
  displayBold: 'Archivo-Bold',
  displayCondensed: 'ArchivoCondensed-Bold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

/** Fichiers à charger via `expo-font`. Consommé par ThemeProvider. */
export const fontAssets = {
  'Archivo-SemiBold': require('../../assets/fonts/Archivo-SemiBold.ttf'),
  'Archivo-Bold': require('../../assets/fonts/Archivo-Bold.ttf'),
  'ArchivoCondensed-Bold': require('../../assets/fonts/ArchivoCondensed-Bold.ttf'),
} as const;

/**
 * Chiffres tabulaires. À appliquer sur TOUT texte numérique.
 * C'est ce qui empêche les colonnes de trembler d'une ligne à l'autre,
 * et ça fonctionne aussi sur la police système.
 */
export const tabularNums: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * Échelle typographique : 7 niveaux nommés, contre 22 tailles anonymes avant.
 *
 * `hero` / `display` portent les grands chiffres (KPI). Le chiffre est le héros,
 * le libellé passe en `caption` en casse normale : c'est l'inverse du rapport
 * actuel (valeur 22px / libellé 9px capitales espacées).
 */
export const typography = {
  /** Chiffre héros, un seul par écran. Archivo Bold, tabulaire, serré. */
  hero: {
    fontFamily: fontFamily.displayBold,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.2,
    ...tabularNums,
  } as TextStyle,

  /** Titre d'écran, gros chiffre secondaire. */
  display: {
    fontFamily: fontFamily.displayBold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
  } as TextStyle,

  /** Titre de section, nom d'entité. */
  title: {
    fontFamily: fontFamily.displaySemibold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.3,
  } as TextStyle,

  /** Sous-titre, en-tête de carte. */
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  } as TextStyle,

  /** Corps de texte par défaut. */
  body: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '400',
  } as TextStyle,

  /** Texte secondaire, métadonnée, libellé de KPI. Casse normale, jamais capitales. */
  callout: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  } as TextStyle,

  /** Plancher de lisibilité. Ne jamais descendre en dessous. */
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  } as TextStyle,

  /** En-tête de colonne de tableau. Condensé pour tenir la largeur. */
  tableHeader: {
    fontFamily: fontFamily.displayCondensed,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.2,
  } as TextStyle,

  /** Cellule numérique de tableau. */
  tableCell: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
    ...tabularNums,
  } as TextStyle,
} as const;

export type TypographyVariant = keyof typeof typography;

// ─────────────────────────────────────────────────────────────────────────────
// Couleurs sémantiques
// ─────────────────────────────────────────────────────────────────────────────

export interface ThemeColors {
  /** Fonds, du plus profond au plus haut. */
  bg: {
    canvas: string;
    surface: string;
    elevated: string;
    sunken: string;
    /** Fond de ligne alternée dans un tableau. */
    stripe: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    /** Sur un aplat d'accent ou de couleur pleine. */
    onFill: string;
  };
  border: {
    subtle: string;
    strong: string;
  };
  /** Marque et interactivité. Ne porte jamais de sens « bon / mauvais ». */
  accent: {
    default: string;
    fill: string;
    subtle: string;
    border: string;
  };
  /**
   * Rampe sémantique de la donnée.
   * Pôle haut en teal et non en vert : la paire rouge/vert est détruite par la
   * deutéranopie (~8 % des hommes, et le public coach est très majoritairement
   * masculin). Rouge (0°) vs teal (174°) reste distinguable, contre 145° pour
   * le vert. Bénéfice secondaire : le teal est lumineux, donc lisible sur fond
   * sombre, là où un vert foncé est terne dans les deux thèmes.
   */
  positive: { default: string; fill: string; subtle: string };
  negative: { default: string; fill: string; subtle: string };
  warning: { default: string; fill: string; subtle: string };
  /** Neutre de la rampe : valeur dans la moyenne, ni bonne ni mauvaise. */
  neutralData: string;
  /** Voile de modale. */
  overlay: string;
  /** Séries catégorielles de graphique, dans l'ordre d'usage. */
  chartSeries: readonly string[];
  /** Grille de graphique. Horizontale uniquement, jamais d'axe vertical. */
  chartGrid: string;
}

/**
 * Thème sombre. Canvas anthracite et non noir pur : le noir pur crée un halo
 * visible sur les bords de carte en OLED.
 */
export const darkColors: ThemeColors = {
  bg: {
    canvas: '#0E1116',
    surface: '#161A22',
    elevated: '#1E232D',
    sunken: '#090B0F',
    stripe: '#12161D',
  },
  text: {
    primary: '#F2F4F8',   // 17.2:1
    secondary: '#A8B2C4', //  8.9:1
    tertiary: '#78859C',  //  5.1:1
    onFill: '#FFFFFF',
  },
  border: {
    subtle: '#232935',
    strong: '#333B4A',
  },
  accent: {
    default: '#8B7CFF',   //  5.8:1
    fill: '#6C5CE0',      //  5.0:1 en texte blanc dessus
    subtle: '#1C1B3A',
    border: '#3A3468',
  },
  positive: { default: '#2DD4BF', fill: '#0F766E', subtle: '#0C2B2A' }, // 10.2:1
  negative: { default: '#FF5D5D', fill: '#D93636', subtle: '#33161A' }, //  6.3:1
  warning:  { default: '#FFB020', fill: '#B45309', subtle: '#2E2210' }, // 10.3:1
  neutralData: '#78859C',
  overlay: 'rgba(4, 6, 10, 0.72)',
  chartSeries: ['#8B7CFF', '#2DD4BF', '#FFB020', '#FF5D5D', '#5AA9FF', '#C084FC'],
  chartGrid: '#232935',
};

/**
 * Thème clair. Mêmes teintes, valeurs assombries pour tenir 4.5:1 sur blanc :
 * `#2DD4BF` tombe à 1.9:1 sur blanc, il ne peut donc pas servir en clair.
 * Canvas légèrement teinté plutôt que blanc pur, pour réduire l'éblouissement
 * et laisser les cartes blanches se détacher.
 */
export const lightColors: ThemeColors = {
  bg: {
    canvas: '#F5F7FA',
    surface: '#FFFFFF',
    elevated: '#FFFFFF',
    sunken: '#EBEEF3',
    stripe: '#F7F9FC',
  },
  text: {
    primary: '#0E1116',   // 18.9:1
    secondary: '#4A5568', //  7.5:1
    tertiary: '#636D7B',  //  4.9:1
    onFill: '#FFFFFF',
  },
  border: {
    subtle: '#E3E8EF',
    strong: '#C9D1DC',
  },
  accent: {
    default: '#5B4BD6',   //  6.1:1
    fill: '#6C5CE0',      //  5.0:1 en texte blanc dessus
    subtle: '#EFEDFE',
    border: '#D5D0FA',
  },
  positive: { default: '#0F766E', fill: '#0F766E', subtle: '#E6F6F4' }, // 5.5:1
  negative: { default: '#C81E1E', fill: '#D93636', subtle: '#FDECEC' }, // 5.7:1
  warning:  { default: '#B45309', fill: '#B45309', subtle: '#FDF3E4' }, // 5.0:1
  neutralData: '#636D7B',
  overlay: 'rgba(14, 17, 22, 0.42)',
  chartSeries: ['#5B4BD6', '#0F766E', '#B45309', '#C81E1E', '#1D6FD0', '#8B37C9'],
  chartGrid: '#E3E8EF',
};

// ─────────────────────────────────────────────────────────────────────────────
// Élévation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trois niveaux, chacun définissant simultanément iOS et Android pour éviter la
 * divergence constatée à l'audit (10 `shadowOpacity` et 8 `elevation` déclarés
 * indépendamment).
 *
 * En thème sombre, une ombre portée est quasi invisible : la profondeur passe
 * par la valeur du fond et un liseré, pas par l'ombre. C'est pourquoi
 * l'élévation dépend du thème.
 */
export interface ThemeElevation {
  flat: ViewStyle;
  raised: ViewStyle;
  floating: ViewStyle;
}

const darkElevation: ThemeElevation = {
  flat: {
    borderWidth: 1,
    borderColor: darkColors.border.subtle,
  },
  raised: {
    borderWidth: 1,
    borderColor: darkColors.border.subtle,
    backgroundColor: darkColors.bg.surface,
  },
  floating: {
    borderWidth: 1,
    borderColor: darkColors.border.strong,
    backgroundColor: darkColors.bg.elevated,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
};

const lightElevation: ThemeElevation = {
  flat: {
    borderWidth: 1,
    borderColor: lightColors.border.subtle,
  },
  raised: {
    backgroundColor: lightColors.bg.surface,
    shadowColor: '#0E1116',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  floating: {
    backgroundColor: lightColors.bg.elevated,
    shadowColor: '#0E1116',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Thème assemblé
// ─────────────────────────────────────────────────────────────────────────────

export interface Theme {
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  elevation: ThemeElevation;
  space: typeof space;
  radius: typeof radius;
  typography: typeof typography;
  duration: typeof duration;
  /** Style de barre de statut à appliquer avec ce thème. */
  statusBarStyle: 'light' | 'dark';
}

export const darkTheme: Theme = {
  scheme: 'dark',
  colors: darkColors,
  elevation: darkElevation,
  space,
  radius,
  typography,
  duration,
  statusBarStyle: 'light',
};

export const lightTheme: Theme = {
  scheme: 'light',
  colors: lightColors,
  elevation: lightElevation,
  space,
  radius,
  typography,
  duration,
  statusBarStyle: 'dark',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de données
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Couleur d'une valeur sur la rampe divergente négatif → neutre → positif.
 * Point d'entrée UNIQUE pour toute mise en couleur de métrique, en remplacement
 * des barèmes inventés par écran (`ratingColor` à 5 seuils, `+/-` à 2 couleurs,
 * cartons à part).
 *
 * Trois niveaux et non cinq, délibérément : à 12-13 px dans une cellule, l'œil
 * ne distingue pas fiablement deux nuances de la même teinte, et les variantes
 * `fill` sont réservées aux aplats (elles ne tiennent pas 4.5:1 en texte).
 * L'intensité fine se lit dans le chiffre, pas dans la couleur.
 *
 * @param value    valeur mesurée
 * @param midpoint valeur considérée comme neutre (moyenne, base du barème)
 * @param spread   amplitude au-delà de laquelle l'écart est jugé significatif
 */
export function dataColor(
  theme: Theme,
  value: number,
  midpoint: number,
  spread: number,
): string {
  if (spread <= 0) return theme.colors.neutralData;
  const delta = (value - midpoint) / spread;
  if (delta >= 0.15) return theme.colors.positive.default;
  if (delta <= -0.15) return theme.colors.negative.default;
  return theme.colors.neutralData;
}

/** Couleur d'un delta signé (+/-, écart à la moyenne, progression). */
export function deltaColor(theme: Theme, delta: number): string {
  if (delta > 0) return theme.colors.positive.default;
  if (delta < 0) return theme.colors.negative.default;
  return theme.colors.neutralData;
}
