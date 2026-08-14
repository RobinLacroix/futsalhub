/**
 * Text — primitive typographique (P0-2)
 *
 * Remplace tous les `fontSize` / `color` littéraux des écrans. Un composant qui
 * écrit encore une taille en dur est un bug.
 *
 * Piège Android traité ici : avec une police custom, `fontWeight` entre en
 * conflit avec la famille et produit un faux gras. Les variantes display
 * portent donc leur graisse dans le nom de famille et n'exposent jamais
 * `fontWeight`. La prop `weight` est ignorée sur ces variantes, volontairement.
 */

import React from 'react';
import { Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { tabularNums, type TypographyVariant } from '../../lib/design/tokens';

/** Rôle sémantique de la couleur du texte. Jamais une teinte. */
export type TextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'accent'
  | 'positive'
  | 'negative'
  | 'warning'
  | 'onFill';

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  tone?: TextTone;
  /** Force les chiffres tabulaires (déjà actif sur `hero` et `tableCell`). */
  numeric?: boolean;
  /** Ignoré sur les variantes display, qui portent leur graisse dans la famille. */
  weight?: TextStyle['fontWeight'];
  /** Couleur explicite, réservée aux couleurs de données issues de `dataColor`. */
  color?: string;
}

/** Variantes dont la graisse vient de la famille de police, pas de fontWeight. */
const DISPLAY_VARIANTS: ReadonlySet<TypographyVariant> = new Set([
  'hero',
  'display',
  'title',
  'tableHeader',
]);

export function Text({
  variant = 'body',
  tone = 'primary',
  numeric = false,
  weight,
  color,
  style,
  ...rest
}: TextProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const toneColor: Record<TextTone, string> = {
    primary: c.text.primary,
    secondary: c.text.secondary,
    tertiary: c.text.tertiary,
    accent: c.accent.default,
    positive: c.positive.default,
    negative: c.negative.default,
    warning: c.warning.default,
    onFill: c.text.onFill,
  };

  const isDisplay = DISPLAY_VARIANTS.has(variant);

  return (
    <RNText
      {...rest}
      style={[
        theme.typography[variant],
        { color: color ?? toneColor[tone] },
        numeric ? tabularNums : null,
        !isDisplay && weight ? { fontWeight: weight } : null,
        style,
      ]}
    />
  );
}
