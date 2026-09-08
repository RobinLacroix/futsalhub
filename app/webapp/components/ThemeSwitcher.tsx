'use client';

/**
 * Sélecteur de thème (web) — miroir de
 * mobile/components/ui/ThemeSwitcher.tsx. Segmented control à trois
 * positions : Système / Clair / Sombre.
 */

import { Monitor, Sun, Moon } from 'lucide-react';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';

const OPTIONS: { mode: ThemeMode; label: string; icon: typeof Monitor }[] = [
  { mode: 'system', label: 'Système', icon: Monitor },
  { mode: 'light', label: 'Clair', icon: Sun },
  { mode: 'dark', label: 'Sombre', icon: Moon },
];

export function ThemeSwitcher() {
  const { theme, mode, setMode } = useTheme();
  const t = theme.colors;

  return (
    <div
      role="radiogroup"
      aria-label="Apparence de l'application"
      style={{
        display: 'flex',
        gap: theme.space.xs,
        padding: theme.space.xs,
        borderRadius: theme.radius.md,
        backgroundColor: t.bg.sunken,
        border: `1px solid ${t.border.subtle}`,
      }}
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const selected = mode === opt.mode;
        return (
          <button
            key={opt.mode}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Thème ${opt.label}`}
            onClick={() => setMode(opt.mode)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.space.xs,
              padding: `${theme.space.sm}px 0`,
              borderRadius: theme.radius.sm,
              border: `1px solid ${selected ? t.accent.border : 'transparent'}`,
              backgroundColor: selected ? t.accent.subtle : 'transparent',
              color: selected ? t.accent.default : t.text.secondary,
              cursor: 'pointer',
              transition: 'background-color 120ms, border-color 120ms',
            }}
          >
            <Icon size={16} />
            <span style={{ fontSize: theme.typography.caption.fontSize, fontWeight: 600 }}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
