'use client';

/**
 * FutsalHub — Fourniture du thème (web)
 *
 * Miroir de mobile/contexts/ThemeContext.tsx : mêmes trois modes
 * (système/clair/sombre), même clé de persistance sémantique.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { darkTheme, lightTheme, themeToCssVars, type Theme } from '@/lib/design/tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'futsalhub-web-theme-mode';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Défaut 'light' et non 'system' : contrairement au mobile, la majorité des
  // pages web codent encore leurs couleurs en dur hors des classes Tailwind
  // remappées par .fm-dark (voir globals.css). Tant qu'elles n'ont pas été
  // migrées écran par écran, le sombre reste un choix explicite dans les
  // Paramètres plutôt qu'un défaut qui casserait la lisibilité au hasard.
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [systemPrefersDark, setSystemPrefersDark] = useState(true);

  useEffect(() => {
    setModeState(readStoredMode());
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemPrefersDark(mql.matches);
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Préférence non persistée : le mode reste appliqué pour la session en cours.
    }
  }, []);

  const isDark = mode === 'system' ? systemPrefersDark : mode === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, setMode, isDark }),
    [theme, mode, setMode, isDark],
  );

  const cssVars = useMemo(() => themeToCssVars(theme), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      <div
        className={isDark ? 'fm-dark' : 'fm-light'}
        style={cssVars as React.CSSProperties}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme doit être utilisé dans un ThemeProvider');
  return ctx;
}
