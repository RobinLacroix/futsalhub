/**
 * Screen — conteneur d'écran (P0-2)
 *
 * Standardise ce que chaque écran refaisait à la main : fond de canvas, safe
 * area, padding horizontal, largeur maximale de contenu sur tablette,
 * pull-to-refresh.
 *
 * `LAYOUT.MAX_CONTENT_WIDTH` était déjà défini dans `hooks/useIsTablet.ts` mais
 * appliqué de façon inégale selon les écrans. Il est centralisé ici.
 */

import React from 'react';
import { View, ScrollView, RefreshControl, ViewStyle, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useIsTablet, LAYOUT } from '../../hooks/useIsTablet';

export interface ScreenProps {
  children: React.ReactNode;
  /** Rend l'écran défilant. Mettre `false` pour un écran à liste virtualisée. */
  scroll?: boolean;
  /** Branche le pull-to-refresh sur le ScrollView. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Retire le padding horizontal, pour un contenu qui va bord à bord. */
  bleed?: boolean;
  /** Respecte l'encoche en haut. À désactiver quand un header natif est présent. */
  edgeTop?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
}

export function Screen({
  children,
  scroll = true,
  onRefresh,
  refreshing = false,
  bleed = false,
  edgeTop = false,
  style,
  contentContainerStyle,
}: ScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isTablet = useIsTablet();

  const pad: ViewStyle = {
    paddingHorizontal: bleed ? 0 : theme.space.lg,
    paddingTop: edgeTop ? insets.top : 0,
    paddingBottom: theme.space.huge,
    width: '100%',
    maxWidth: isTablet ? LAYOUT.MAX_CONTENT_WIDTH : undefined,
    alignSelf: 'center',
  };

  if (!scroll) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.bg.canvas }, style]}>
        <View style={[pad, { flex: 1 }, contentContainerStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.colors.bg.canvas }, style]}
      contentContainerStyle={[pad, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent.default}
            colors={[theme.colors.accent.default]}
            progressBackgroundColor={theme.colors.bg.surface}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
