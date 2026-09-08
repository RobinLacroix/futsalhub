/**
 * FutsalHub — Design tokens (web)
 *
 * Miroir de `mobile/lib/design/tokens.ts`. Mêmes valeurs, mêmes clés
 * sémantiques, pour que web et mobile soient visuellement la même app.
 *
 * Toute divergence de valeur entre ce fichier et son équivalent mobile est un
 * bug — les deux doivent être modifiés ensemble.
 *
 * Les classes utilitaires Tailwind (gray-*, blue-*...) déjà répandues dans le
 * webapp sont recolorées via les blocs `.fm-light` / `.fm-dark` dans
 * `app/globals.css`, dont les valeurs hex sont recopiées à la main depuis ce
 * fichier (CSS ne peut pas importer du TS). Ce fichier est la source de
 * vérité ; `globals.css` doit rester synchronisé avec lui.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Primitives — indépendantes du thème
// ─────────────────────────────────────────────────────────────────────────────

/** Échelle d'espacement, base 4. */
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

/** Rayons de bordure. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** Durées d'animation, en ms. */
export const duration = {
  instant: 120,
  fast: 180,
  base: 240,
  slow: 320,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Typographie
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Familles de polices.
 *
 * Corps de texte = pile système (via `--font-system` dans globals.css),
 * comme sur mobile où le corps de texte est volontairement la police
 * native de la plateforme.
 *
 * Display = Archivo (chargée via next/font/google dans app/layout.tsx),
 * pour les titres et les grands chiffres — identique au mobile.
 */
export const fontFamily = {
  body: 'var(--font-system)',
  displaySemibold: 'var(--font-archivo)',
  displayBold: 'var(--font-archivo)',
  displayCondensed: 'var(--font-archivo-condensed)',
} as const;

export interface TypographyVariantStyle {
  fontFamily?: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  fontWeight?: number;
}

/** Échelle typographique : 7 niveaux nommés, miroir du mobile. */
export const typography: Record<
  'hero' | 'display' | 'title' | 'headline' | 'body' | 'callout' | 'caption' | 'tableHeader' | 'tableCell',
  TypographyVariantStyle
> = {
  hero: {
    fontFamily: fontFamily.displayBold,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.2,
    fontWeight: 700,
  },
  display: {
    fontFamily: fontFamily.displayBold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
    fontWeight: 700,
  },
  title: {
    fontFamily: fontFamily.displaySemibold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.3,
    fontWeight: 600,
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: 600,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: 400,
  },
  callout: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 400,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 500,
  },
  tableHeader: {
    fontFamily: fontFamily.displayCondensed,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.2,
    fontWeight: 700,
  },
  tableCell: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: 500,
  },
};

/** Union des noms de variantes (miroir de mobile/lib/design/tokens.ts). */
export type TypographyVariant = keyof typeof typography;

// ─────────────────────────────────────────────────────────────────────────────
// Couleurs sémantiques — valeurs identiques à mobile/lib/design/tokens.ts
// ─────────────────────────────────────────────────────────────────────────────

export interface ThemeColors {
  bg: {
    canvas: string;
    surface: string;
    elevated: string;
    sunken: string;
    stripe: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    onFill: string;
  };
  border: {
    subtle: string;
    strong: string;
  };
  /** Marque et interactivité. Un seul accent, jamais deux couleurs concurrentes. */
  accent: {
    default: string;
    fill: string;
    subtle: string;
    border: string;
  };
  positive: { default: string; fill: string; subtle: string };
  negative: { default: string; fill: string; subtle: string };
  warning: { default: string; fill: string; subtle: string };
  neutralData: string;
  overlay: string;
  chartSeries: readonly string[];
  chartGrid: string;
}

export const darkColors: ThemeColors = {
  bg: {
    canvas: '#0E1116',
    surface: '#161A22',
    elevated: '#1E232D',
    sunken: '#090B0F',
    stripe: '#12161D',
  },
  text: {
    primary: '#F2F4F8',
    secondary: '#A8B2C4',
    tertiary: '#78859C',
    onFill: '#FFFFFF',
  },
  border: {
    subtle: '#232935',
    strong: '#333B4A',
  },
  accent: {
    default: '#8B7CFF',
    fill: '#6C5CE0',
    subtle: '#1C1B3A',
    border: '#3A3468',
  },
  positive: { default: '#2DD4BF', fill: '#0F766E', subtle: '#0C2B2A' },
  negative: { default: '#FF5D5D', fill: '#D93636', subtle: '#33161A' },
  warning: { default: '#FFB020', fill: '#B45309', subtle: '#2E2210' },
  neutralData: '#78859C',
  overlay: 'rgba(4, 6, 10, 0.72)',
  chartSeries: ['#8B7CFF', '#2DD4BF', '#FFB020', '#FF5D5D', '#5AA9FF', '#C084FC'],
  chartGrid: '#232935',
};

export const lightColors: ThemeColors = {
  bg: {
    canvas: '#F5F7FA',
    surface: '#FFFFFF',
    elevated: '#FFFFFF',
    sunken: '#EBEEF3',
    stripe: '#F7F9FC',
  },
  text: {
    primary: '#0E1116',
    secondary: '#4A5568',
    tertiary: '#636D7B',
    onFill: '#FFFFFF',
  },
  border: {
    subtle: '#E3E8EF',
    strong: '#C9D1DC',
  },
  accent: {
    default: '#5B4BD6',
    fill: '#6C5CE0',
    subtle: '#EFEDFE',
    border: '#D5D0FA',
  },
  positive: { default: '#0F766E', fill: '#0F766E', subtle: '#E6F6F4' },
  negative: { default: '#C81E1E', fill: '#D93636', subtle: '#FDECEC' },
  warning: { default: '#B45309', fill: '#B45309', subtle: '#FDF3E4' },
  neutralData: '#636D7B',
  overlay: 'rgba(14, 17, 22, 0.42)',
  chartSeries: ['#5B4BD6', '#0F766E', '#B45309', '#C81E1E', '#1D6FD0', '#8B37C9'],
  chartGrid: '#E3E8EF',
};

// ─────────────────────────────────────────────────────────────────────────────
// Élévation — équivalent web des trois niveaux mobile (flat/raised/floating)
// ─────────────────────────────────────────────────────────────────────────────

export interface ThemeElevation {
  flat: { border: string };
  raised: { border: string; boxShadow: string; background: string };
  floating: { border: string; boxShadow: string; background: string };
}

function buildElevation(colors: ThemeColors, isDark: boolean): ThemeElevation {
  return {
    flat: { border: `1px solid ${colors.border.subtle}` },
    raised: {
      border: `1px solid ${colors.border.subtle}`,
      background: colors.bg.surface,
      boxShadow: isDark ? 'none' : '0 1px 4px rgba(14, 17, 22, 0.06)',
    },
    floating: {
      border: `1px solid ${colors.border.strong}`,
      background: colors.bg.elevated,
      boxShadow: isDark
        ? '0 8px 20px rgba(0, 0, 0, 0.5)'
        : '0 8px 20px rgba(14, 17, 22, 0.12)',
    },
  };
}

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
}

export const darkTheme: Theme = {
  scheme: 'dark',
  colors: darkColors,
  elevation: buildElevation(darkColors, true),
  space,
  radius,
  typography,
  duration,
};

export const lightTheme: Theme = {
  scheme: 'light',
  colors: lightColors,
  elevation: buildElevation(lightColors, false),
  space,
  radius,
  typography,
  duration,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de données — identiques à mobile
// ─────────────────────────────────────────────────────────────────────────────

export function dataColor(theme: Theme, value: number, midpoint: number, spread: number): string {
  if (spread <= 0) return theme.colors.neutralData;
  const delta = (value - midpoint) / spread;
  if (delta >= 0.15) return theme.colors.positive.default;
  if (delta <= -0.15) return theme.colors.negative.default;
  return theme.colors.neutralData;
}

export function deltaColor(theme: Theme, delta: number): string {
  if (delta > 0) return theme.colors.positive.default;
  if (delta < 0) return theme.colors.negative.default;
  return theme.colors.neutralData;
}

/**
 * Convertit les couleurs d'un thème en variables CSS custom properties, pour
 * les injecter en inline style sur un wrapper racine (`ThemeProvider`) et les
 * consommer via `var(--fh-accent)` dans du CSS ou du Tailwind arbitraire.
 */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const c = theme.colors;
  return {
    '--fh-bg-canvas': c.bg.canvas,
    '--fh-bg-surface': c.bg.surface,
    '--fh-bg-elevated': c.bg.elevated,
    '--fh-bg-sunken': c.bg.sunken,
    '--fh-bg-stripe': c.bg.stripe,
    '--fh-text-primary': c.text.primary,
    '--fh-text-secondary': c.text.secondary,
    '--fh-text-tertiary': c.text.tertiary,
    '--fh-text-on-fill': c.text.onFill,
    '--fh-border-subtle': c.border.subtle,
    '--fh-border-strong': c.border.strong,
    '--fh-accent': c.accent.default,
    '--fh-accent-fill': c.accent.fill,
    '--fh-accent-subtle': c.accent.subtle,
    '--fh-accent-border': c.accent.border,
    '--fh-positive': c.positive.default,
    '--fh-negative': c.negative.default,
    '--fh-warning': c.warning.default,
  };
}
