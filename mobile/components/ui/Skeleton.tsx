/**
 * Skeleton — état de chargement (P0-2)
 *
 * Remplace le spinner plein écran, utilisé dans 35 fichiers pour un seul
 * squelette existant. À durée de chargement rigoureusement identique, un
 * squelette est perçu nettement plus rapide qu'un spinner : la structure est
 * déjà là, la durée est implicitement bornée, l'écran n'a pas l'air vide.
 *
 * Règle : plus aucun `ActivityIndicator` en plein écran. Il reste légitime dans
 * un bouton (`Button loading`) ou en pied de liste paginée.
 */

import React, { useEffect } from 'react';
import { View, ViewStyle, StyleSheet, DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  /** Pastille circulaire (avatar, point d'équipe). */
  circle?: boolean;
  radius?: number;
  style?: ViewStyle;
}

/** Bloc élémentaire. Les archétypes ci-dessous s'en servent. */
export function Skeleton({ width = '100%', height = 14, circle = false, radius, style }: SkeletonProps) {
  const { theme } = useTheme();
  const progress = useSharedValue(0.5);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [progress]);

  const animated = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Chargement"
      style={[
        {
          width,
          height: circle ? (typeof width === 'number' ? width : height) : height,
          borderRadius: circle
            ? 999
            : (radius ?? theme.radius.sm),
          backgroundColor: theme.colors.bg.sunken,
        },
        animated,
        style,
      ]}
    />
  );
}

/** Archétype : liste de lignes (effectif, calendrier, partages). */
export function SkeletonList({ rows = 6 }: { rows?: number }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: theme.space.md, padding: theme.space.lg }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.row,
            {
              gap: theme.space.md,
              padding: theme.space.lg,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.bg.surface,
            },
          ]}
        >
          <Skeleton width={40} circle />
          <View style={{ flex: 1, gap: theme.space.sm }}>
            <Skeleton width="55%" height={15} />
            <Skeleton width="32%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Archétype : bandeau de KPI (dashboard, analytics). */
export function SkeletonStats({ count = 4, columns = 2 }: { count?: number; columns?: number }) {
  const { theme } = useTheme();
  const width = `${Math.floor(100 / columns) - 2}%` as DimensionValue;
  return (
    <View style={[styles.grid, { gap: theme.space.md, padding: theme.space.lg }]}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            width,
            gap: theme.space.sm,
            padding: theme.space.lg,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.bg.surface,
          }}
        >
          <Skeleton width="60%" height={30} />
          <Skeleton width="85%" height={12} />
        </View>
      ))}
    </View>
  );
}

/** Archétype : tableau de statistiques. */
export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: theme.space.sm, padding: theme.space.lg }}>
      <Skeleton width="100%" height={28} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width="100%" height={34} />
      ))}
    </View>
  );
}

/** Archétype : écran de détail (fiche joueur, détail match). */
export function SkeletonDetail() {
  const { theme } = useTheme();
  return (
    <View style={{ gap: theme.space.xl, padding: theme.space.lg }}>
      <View style={[styles.row, { gap: theme.space.lg }]}>
        <Skeleton width={64} circle />
        <View style={{ flex: 1, gap: theme.space.sm }}>
          <Skeleton width="60%" height={22} />
          <Skeleton width="40%" height={13} />
        </View>
      </View>
      <Skeleton width="100%" height={160} radius={theme.radius.md} />
      <View style={{ gap: theme.space.sm }}>
        <Skeleton width="90%" height={14} />
        <Skeleton width="75%" height={14} />
        <Skeleton width="82%" height={14} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
