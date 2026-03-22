import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

const SKELETON_COUNT = 5;

function SkeletonBar({ width, height, style }: { width: string | number; height: number; style?: object }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.6, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeletonBar,
        { width: typeof width === 'string' ? width : width, height, opacity },
        style,
      ]}
    />
  );
}

function SkeletonCard({ variant }: { variant: 'training' | 'match' }) {
  return (
    <View style={[styles.card, variant === 'training' ? styles.cardTraining : styles.cardMatch]}>
      <SkeletonBar width="75%" height={18} style={styles.dateBar} />
      <SkeletonBar width="90%" height={14} style={styles.themeBar} />
      <SkeletonBar width="60%" height={12} style={styles.locationBar} />
    </View>
  );
}

export function CalendarSkeleton() {
  return (
    <View style={styles.container}>
      {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
        <SkeletonCard key={i} variant={i % 2 === 0 ? 'training' : 'match'} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  cardTraining: { borderLeftColor: '#3b82f6' },
  cardMatch: { borderLeftColor: '#dc2626' },
  skeletonBar: {
    backgroundColor: '#e5e7eb',
    borderRadius: 6,
  },
  dateBar: { marginBottom: 8 },
  themeBar: { marginBottom: 6 },
  locationBar: {},
});
