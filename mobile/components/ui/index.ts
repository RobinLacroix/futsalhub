/**
 * FutsalHub — Primitives d'interface (P0-2)
 *
 * Point d'import unique. Un écran importe d'ici, jamais un fichier de primitive
 * directement, pour que le jour où une primitive est décomposée en plusieurs
 * fichiers, aucun écran ne bouge.
 *
 *     import { Screen, Section, Card, Stat, Button } from '../../components/ui';
 *
 * Règle de migration : un écran touché est un écran migré. On ne rajoute pas de
 * `StyleSheet` avec des couleurs en dur à côté de ces composants.
 */

export { Text } from './Text';
export type { TextProps, TextTone } from './Text';

export { Card } from './Card';
export type { CardProps, CardVariant, CardPadding } from './Card';

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { IconButton } from './IconButton';
export type { IconButtonProps, IconButtonVariant, IconButtonSize } from './IconButton';

export { Stat } from './Stat';
export type { StatProps, StatSize } from './Stat';

export { Badge } from './Badge';
export type { BadgeProps, BadgeTone, BadgeSize } from './Badge';

export { Section } from './Section';
export type { SectionProps } from './Section';

export { Field, Input, ChipGroup } from './Field';
export type { FieldProps, InputProps, ChipGroupProps, ChipOption } from './Field';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { Sheet } from './Sheet';
export type { SheetProps } from './Sheet';

export {
  Skeleton,
  SkeletonList,
  SkeletonStats,
  SkeletonTable,
  SkeletonDetail,
} from './Skeleton';
export type { SkeletonProps } from './Skeleton';

export { Screen } from './Screen';
export type { ScreenProps } from './Screen';

export { ThemeSwitcher } from './ThemeSwitcher';
