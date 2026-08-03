/**
 * FutsalHub — Fourniture du thème (P0-1)
 *
 * Expose le thème résolu à toute l'app (espace coach ET espace joueur, les deux
 * étant sous le même `app/_layout.tsx`).
 *
 * Trois modes : `system` (défaut, suit iOS/Android), `light`, `dark`.
 * Le choix est persisté et rechargé au démarrage.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { darkTheme, lightTheme, fontAssets, type Theme } from '../lib/design/tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = '@futsalhub/theme-mode';

interface ThemeContextValue {
  /** Thème résolu, à consommer dans les écrans. */
  theme: Theme;
  /** Préférence de l'utilisateur, `system` par défaut. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
  isDark: boolean;
  /** Faux tant que les polices ne sont pas chargées ou la préférence pas lue. */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [modeLoaded, setModeLoaded] = useState(false);
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored);
        }
      })
      .catch(() => {
        // Préférence illisible : on reste sur `system`, ce n'est pas bloquant.
      })
      .finally(() => {
        if (!cancelled) setModeLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Échec d'écriture : le mode reste appliqué pour la session en cours.
    }
  }, []);

  const isDark = mode === 'system' ? systemScheme !== 'light' : mode === 'dark';

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: isDark ? darkTheme : lightTheme,
      mode,
      setMode,
      isDark,
      // Une police manquante ne doit jamais bloquer le démarrage : on retombe
      // sur la police système, dégradation acceptable.
      ready: modeLoaded && (fontsLoaded || fontError != null),
    }),
    [isDark, mode, setMode, modeLoaded, fontsLoaded, fontError],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Accès au thème résolu. Lève si utilisé hors du provider. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme doit être utilisé dans un ThemeProvider');
  return ctx;
}

/**
 * Construit une feuille de styles dépendante du thème, mémoïsée par thème.
 *
 * Le cache évite de recréer la StyleSheet à chaque rendu, ce qui compte sur les
 * écrans denses (tableau de stats, match recorder).
 *
 * ```ts
 * const useStyles = makeStyles((t) => ({
 *   card: { backgroundColor: t.colors.bg.surface, borderRadius: t.radius.md },
 * }));
 * // dans le composant :
 * const s = useStyles();
 * ```
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: Theme) => T,
): () => T {
  const cache = new Map<Theme['scheme'], T>();
  return function useStyles(): T {
    const { theme } = useTheme();
    let sheet = cache.get(theme.scheme);
    if (!sheet) {
      sheet = StyleSheet.create(factory(theme));
      cache.set(theme.scheme, sheet);
    }
    return sheet;
  };
}
