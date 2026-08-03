/**
 * Sheet — feuille modale par le bas (P0-2)
 *
 * Remplace la vingtaine de modales roulées à la main (`modalSheet`,
 * `modalHandle`, `borderTopLeftRadius: 24`, `maxHeight: '75%'`...) qui
 * différaient toutes légèrement et n'offraient ni geste de fermeture ni recul
 * de la vue parente.
 *
 * Apporte : poignée de glissement fonctionnelle, fermeture au geste, voile
 * tapable, respect de la safe area, retour haptique à l'ouverture.
 *
 * Limite assumée : pas de detents (demi-hauteur / pleine hauteur). Le passage à
 * `@gorhom/bottom-sheet` est prévu en P2, une fois les écrans migrés. Ajouter la
 * dépendance maintenant ne rendrait pas les écrans migrables plus vite.
 */

import React, { useEffect } from 'react';
import { View, Modal, Pressable, ScrollView, StyleSheet, DimensionValue } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { haptics } from '../../lib/design/haptics';
import { Text } from './Text';
import { IconButton } from './IconButton';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Hauteur maximale de la feuille, en fraction de l'écran. */
  maxHeight?: DimensionValue;
  /** Désactive le ScrollView interne, si l'enfant gère déjà son défilement. */
  scrollable?: boolean;
  children: React.ReactNode;
}

/** Distance de glissement au-delà de laquelle la feuille se ferme. */
const DISMISS_THRESHOLD = 120;

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  maxHeight = '80%',
  scrollable = true,
  children,
}: SheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const c = theme.colors;
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      haptics.tapMedium();
    }
  }, [visible, translateY]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Glissement vers le bas uniquement : vers le haut, la feuille est fixe.
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD || e.velocityY > 800) {
        translateY.value = withTiming(
          600,
          { duration: 180, easing: Easing.in(Easing.quad) },
          () => runOnJS(onClose)(),
        );
      } else {
        translateY.value = withTiming(0, { duration: 180 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const body = (
    <View style={{ gap: theme.space.md, paddingHorizontal: theme.space.xl }}>{children}</View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: c.overlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
        />

        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.sheet,
              {
                maxHeight,
                backgroundColor: c.bg.elevated,
                borderTopLeftRadius: theme.radius.xl,
                borderTopRightRadius: theme.radius.xl,
                borderColor: c.border.subtle,
                paddingBottom: Math.max(insets.bottom, theme.space.xl),
              },
              sheetStyle,
            ]}
          >
            <View style={[styles.handleZone, { paddingVertical: theme.space.md }]}>
              <View
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: theme.radius.pill,
                  backgroundColor: c.border.strong,
                }}
              />
            </View>

            {(title || subtitle) && (
              <View
                style={[
                  styles.header,
                  {
                    paddingHorizontal: theme.space.xl,
                    paddingBottom: theme.space.lg,
                    gap: theme.space.md,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  {title ? (
                    <Text variant="title" accessibilityRole="header">
                      {title}
                    </Text>
                  ) : null}
                  {subtitle ? (
                    <Text variant="callout" tone="tertiary">
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <IconButton icon="close" label="Fermer" onPress={onClose} variant="surface" />
              </View>
            )}

            {scrollable ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: theme.space.lg }}
              >
                {body}
              </ScrollView>
            ) : (
              body
            )}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    width: '100%',
    borderTopWidth: 1,
  },
  handleZone: {
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
});
