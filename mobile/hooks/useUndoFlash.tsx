import { useCallback, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Retourne flash() pour jouer une courte confirmation visuelle d’annulation,
 * et <UndoOverlay /> à placer une fois dans la racine de l’écran (pointerEvents="none").
 */
export function useUndoFlash() {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const running = useRef(false);

  const flash = useCallback(() => {
    if (running.current) return;
    running.current = true;
    opacity.setValue(0);
    scale.setValue(0.94);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 8, tension: 140, useNativeDriver: true }),
      ]),
      Animated.delay(420),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.92, duration: 220, useNativeDriver: true }),
      ]),
    ]).start(() => {
      running.current = false;
    });
  }, [opacity, scale]);

  const UndoOverlay = useCallback(
    () => (
      <Animated.View
        pointerEvents="none"
        style={[styles.anchor, { bottom: 22 + insets.bottom, opacity, transform: [{ scale }] }]}
      >
        <View style={styles.pill}>
          <Text style={styles.label}>Annulé</Text>
        </View>
      </Animated.View>
    ),
    [opacity, scale, insets.bottom]
  );

  return { flash, UndoOverlay };
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  label: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
