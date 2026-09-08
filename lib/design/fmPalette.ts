/**
 * Palette « Football Manager » — miroir de mobile/components/players/fmPalette.ts
 *
 * Bandeau de marque (fiche joueur, Dashboard, Analytics sur mobile) : une
 * surface qui ne suit pas bg.*, volontairement — c'est la seule identité de
 * marque qui reste fixe dans les deux thèmes, comme une image de couverture.
 */

import type { ThemeColors } from './tokens';

export interface FMPalette {
  brand: string;
  onBrand: string;
  onBrandMuted: string;
  onBrandFill: string;
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
  series: readonly string[];
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
