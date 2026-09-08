/**
 * Primitives web pour le port d'Analytics — miroir réduit de mobile/components/ui/*.
 * Même API (variant/tone/size) pour que le code porté depuis mobile se lise
 * presque à l'identique. Pas un système de design complet : juste ce dont
 * AnalyticsView et ses sous-composants ont besoin.
 */
'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import type { TypographyVariant } from '@/lib/design/tokens';
import { deltaColor } from '@/lib/design/tokens';
import { ArrowUp, ArrowDown, Minus, X } from 'lucide-react';

// ─── Text ─────────────────────────────────────────────────────────────────────
export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'positive' | 'negative' | 'warning' | 'onFill';

export function Text({
  variant = 'body', tone = 'primary', numeric = false, weight, color, style, children,
  numberOfLines, className,
}: {
  variant?: TypographyVariant; tone?: TextTone; numeric?: boolean; weight?: number;
  color?: string; style?: CSSProperties; children?: ReactNode; numberOfLines?: 1 | 2; className?: string;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const toneColor: Record<TextTone, string> = {
    primary: c.text.primary, secondary: c.text.secondary, tertiary: c.text.tertiary,
    accent: c.accent.default, positive: c.positive.default, negative: c.negative.default,
    warning: c.warning.default, onFill: c.text.onFill,
  };
  const t = theme.typography[variant];
  const isDisplay = variant === 'hero' || variant === 'display' || variant === 'title' || variant === 'tableHeader';
  return (
    <span
      className={className}
      style={{
        display: numberOfLines === 2 ? '-webkit-box' : 'block',
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        lineHeight: `${t.lineHeight}px`,
        letterSpacing: t.letterSpacing,
        fontWeight: isDisplay ? t.fontWeight : (weight ?? t.fontWeight),
        color: color ?? toneColor[tone],
        fontVariantNumeric: numeric ? 'tabular-nums' : undefined,
        overflow: numberOfLines ? 'hidden' : undefined,
        textOverflow: numberOfLines === 1 ? 'ellipsis' : undefined,
        whiteSpace: numberOfLines === 1 ? 'nowrap' : undefined,
        WebkitLineClamp: numberOfLines === 2 ? 2 : undefined,
        WebkitBoxOrient: numberOfLines === 2 ? ('vertical' as const) : undefined,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export type CardVariant = 'flat' | 'raised' | 'floating' | 'accent';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export function Card({
  variant = 'raised', padding = 'md', onPress, style, children, className,
}: {
  variant?: CardVariant; padding?: CardPadding; onPress?: () => void;
  style?: CSSProperties; children?: ReactNode; className?: string;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const paddingValue: Record<CardPadding, number> = { none: 0, sm: theme.space.md, md: theme.space.lg, lg: theme.space.xl };
  const byVariant: Record<CardVariant, CSSProperties> = {
    flat: { border: theme.elevation.flat.border, background: c.bg.surface },
    raised: { border: theme.elevation.raised.border, background: c.bg.surface, boxShadow: theme.elevation.raised.boxShadow },
    floating: { border: theme.elevation.floating.border, background: theme.elevation.floating.background, boxShadow: theme.elevation.floating.boxShadow },
    accent: { background: c.accent.subtle, border: `1px solid ${c.accent.border}` },
  };
  const base: CSSProperties = {
    borderRadius: theme.radius.md,
    padding: paddingValue[padding],
    ...byVariant[variant],
    ...style,
  };
  if (!onPress) return <div className={className} style={base}>{children}</div>;
  return (
    <button type="button" className={className} onClick={onPress} style={{ ...base, textAlign: 'left', cursor: 'pointer', width: '100%' }}>
      {children}
    </button>
  );
}

// ─── Stat ─────────────────────────────────────────────────────────────────────
export type StatSize = 'hero' | 'primary' | 'compact';

export function Stat({
  value, label, size = 'primary', unit, delta, deltaLabel, deltaPrecision = 1, density, valueColor, style,
}: {
  value: string; label: string; size?: StatSize; unit?: string; delta?: number;
  deltaLabel?: string; deltaPrecision?: number; density?: number; valueColor?: string; style?: CSSProperties;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const valueVariant: TypographyVariant = size === 'hero' ? 'hero' : size === 'primary' ? 'display' : 'title';
  const labelVariant: TypographyVariant = size === 'compact' ? 'caption' : 'callout';
  const hasDelta = delta != null && Number.isFinite(delta);
  const dColor = hasDelta ? deltaColor(theme, delta!) : c.neutralData;
  const DeltaIcon = !hasDelta || delta === 0 ? Minus : delta! > 0 ? ArrowUp : ArrowDown;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.xs, ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <Text variant={valueVariant} numeric color={valueColor}>{value}</Text>
        {unit && <Text variant={size === 'compact' ? 'caption' : 'callout'} tone="tertiary">{unit}</Text>}
      </div>
      <Text variant={labelVariant} tone="secondary" numberOfLines={2}>{label}</Text>
      {hasDelta && (
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.xs }}>
          <DeltaIcon size={12} color={dColor} />
          <Text variant="caption" numeric color={dColor}>{delta! > 0 ? '+' : ''}{delta!.toFixed(deltaPrecision)}</Text>
          {deltaLabel && <Text variant="caption" tone="tertiary" numberOfLines={1}>{deltaLabel}</Text>}
        </div>
      )}
      {density != null && Number.isFinite(density) && (
        <div style={{ height: 4, width: '100%', overflow: 'hidden', marginTop: 2, backgroundColor: c.bg.sunken, borderRadius: theme.radius.pill }}>
          <div style={{ width: `${Math.round(Math.min(1, Math.max(0, density)) * 100)}%`, height: '100%', backgroundColor: valueColor ?? c.accent.default, borderRadius: theme.radius.pill }} />
        </div>
      )}
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({
  icon: Icon, title, description, action, secondaryAction, tone = 'neutral', compact = false, style,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string; description?: string;
  action?: { label: string; onPress: () => void };
  secondaryAction?: { label: string; onPress: () => void };
  tone?: 'neutral' | 'negative'; compact?: boolean; style?: CSSProperties;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const bubbleBg = tone === 'negative' ? c.negative.subtle : c.bg.sunken;
  const glyphColor = tone === 'negative' ? c.negative.default : c.text.tertiary;
  const bubble = compact ? 44 : 64;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: `${compact ? theme.space.xl : theme.space.giant}px ${theme.space.xl}px`, gap: theme.space.md, ...style }}>
      <div style={{ width: bubble, height: bubble, borderRadius: bubble / 2, backgroundColor: bubbleBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={compact ? 22 : 30} color={glyphColor} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: theme.space.xs }}>
        <Text variant={compact ? 'headline' : 'title'} style={{ textAlign: 'center' }}>{title}</Text>
        {description && <Text variant="callout" tone="tertiary" style={{ textAlign: 'center' }}>{description}</Text>}
      </div>
      {action && <Button label={action.label} onPress={action.onPress} variant={tone === 'negative' ? 'secondary' : 'primary'} size={compact ? 'sm' : 'md'} />}
      {secondaryAction && <Button label={secondaryAction.label} onPress={secondaryAction.onPress} variant="ghost" size="sm" />}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export type BadgeTone = 'neutral' | 'accent' | 'positive' | 'negative' | 'warning';

export function Badge({ label, tone = 'neutral', size = 'md', solid = false, style }: {
  label: string; tone?: BadgeTone; size?: 'sm' | 'md'; solid?: boolean; style?: CSSProperties;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const subtle: Record<BadgeTone, string> = { neutral: c.bg.sunken, accent: c.accent.subtle, positive: c.positive.subtle, negative: c.negative.subtle, warning: c.warning.subtle };
  const strong: Record<BadgeTone, string> = { neutral: c.text.tertiary, accent: c.accent.fill, positive: c.positive.fill, negative: c.negative.fill, warning: c.warning.fill };
  const fg: Record<BadgeTone, string> = { neutral: c.text.secondary, accent: c.accent.default, positive: c.positive.default, negative: c.negative.default, warning: c.warning.default };
  const contentColor = solid ? c.text.onFill : fg[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', backgroundColor: solid ? strong[tone] : subtle[tone],
      borderRadius: theme.radius.pill, padding: size === 'sm' ? `2px ${theme.space.sm}px` : `${theme.space.xs}px ${theme.space.md}px`,
      ...style,
    }}>
      <Text variant="caption" color={contentColor} numberOfLines={1}>{label}</Text>
    </span>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export function Button({
  label, onPress, variant = 'primary', size = 'md', icon: Icon, iconAfter = false, disabled = false, block = false, style,
}: {
  label: string; onPress: () => void; variant?: ButtonVariant; size?: ButtonSize;
  icon?: React.ComponentType<{ size?: number; color?: string }>; iconAfter?: boolean;
  disabled?: boolean; block?: boolean; style?: CSSProperties;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const height: Record<ButtonSize, number> = { sm: 36, md: 44, lg: 52 };
  const paddingH: Record<ButtonSize, number> = { sm: theme.space.md, md: theme.space.lg, lg: theme.space.xl };
  const iconSize: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };
  const surface: Record<ButtonVariant, CSSProperties> = {
    primary: { backgroundColor: c.accent.fill, border: 'none' },
    secondary: { backgroundColor: c.bg.surface, border: `1px solid ${c.border.strong}` },
    ghost: { backgroundColor: 'transparent', border: 'none' },
    destructive: { backgroundColor: c.negative.fill, border: 'none' },
  };
  const contentColor = variant === 'primary' || variant === 'destructive' ? c.text.onFill : variant === 'ghost' ? c.accent.default : c.text.primary;

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      style={{
        display: 'flex', flexDirection: iconAfter ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'center',
        height: height[size], padding: `0 ${paddingH[size]}px`, borderRadius: theme.radius.sm, gap: theme.space.sm,
        alignSelf: block ? 'stretch' : 'flex-start', width: block ? '100%' : undefined,
        opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
        ...surface[variant], ...style,
      }}
    >
      {Icon && <Icon size={iconSize[size]} color={contentColor} />}
      <Text variant={size === 'sm' ? 'caption' : 'headline'} color={contentColor} numberOfLines={1}>{label}</Text>
    </button>
  );
}

// ─── Sheet — miroir simplifié : réutilise fm-overlay/fm-modal du reste du webapp ─
export function Sheet({ visible, onClose, title, subtitle, children }: {
  visible: boolean; onClose: () => void; title?: string; subtitle?: string; children: ReactNode;
}) {
  const { theme } = useTheme();
  if (!visible) return null;
  return (
    <div className="fm-overlay" onClick={onClose}>
      <div className="fm-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        {(title || subtitle) && (
          <div className="fm-modal-header">
            <div>
              {title && <Text variant="title">{title}</Text>}
              {subtitle && <Text variant="callout" tone="tertiary" style={{ marginTop: 2 }}>{subtitle}</Text>}
            </div>
            <button type="button" className="fm-modal-close" onClick={onClose} aria-label="Fermer">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="fm-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: theme.space.sm }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton (chargement) ────────────────────────────────────────────────────
export function SkeletonStats({ count = 4, columns = 2 }: { count?: number; columns?: number }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const width = `${Math.floor(100 / columns) - 2}%`;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.md, padding: theme.space.lg }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ width, display: 'flex', flexDirection: 'column', gap: theme.space.sm, padding: theme.space.lg, borderRadius: theme.radius.md, backgroundColor: c.bg.surface }}>
          <div className="fh-skeleton-pulse" style={{ width: '60%', height: 30, borderRadius: theme.radius.sm, backgroundColor: c.bg.sunken }} />
          <div className="fh-skeleton-pulse" style={{ width: '85%', height: 12, borderRadius: theme.radius.sm, backgroundColor: c.bg.sunken }} />
        </div>
      ))}
    </div>
  );
}
