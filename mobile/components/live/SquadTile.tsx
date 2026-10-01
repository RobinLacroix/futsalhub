import { useEffect, useRef, useState } from 'react';
import { Animated, AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { haptics } from '../../lib/design/haptics';
import { readableOn, type SquadLevels } from '../../lib/liveSession/levels';
import { Text } from '../ui';

/**
 * Aplat d'une équipe : un tap = un point. Les trois niveaux sont toujours
 * visibles, du plus gros au plus discret : séquence (le tap), procédé, séance.
 * `compact` empile les aplats en lignes quand 3 équipes ou plus jouent.
 */
export function SquadTile({
  level,
  color,
  tapValue,
  disabled,
  compact,
  onScore,
  onUndo,
}: {
  level: SquadLevels;
  color: string;
  tapValue: number;
  disabled: boolean;
  compact: boolean;
  onScore: () => void;
  onUndo: () => void;
}) {
  const { theme } = useTheme();
  const fg = readableOn(color);
  const veil = fg === '#FFFFFF' ? 'rgba(0,0,0,0.24)' : 'rgba(255,255,255,0.40)';

  const scale = useRef(new Animated.Value(1)).current;
  const previous = useRef(level.sequence);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (level.sequence > previous.current && !reduceMotion) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.07, duration: 90, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 140, useNativeDriver: true }),
      ]).start();
    }
    previous.current = level.sequence;
  }, [level.sequence, reduceMotion, scale]);

  // Taille fixe selon le nombre de chiffres : adjustsFontSizeToFit écrasait le score dans un conteneur sans largeur imposée.
  const digits = String(level.sequence).length;
  const scoreSize = compact ? (digits >= 3 ? 52 : 72) : digits >= 3 ? 96 : digits === 2 ? 128 : 144;

  const record = `${level.wins}V ${level.draws}N ${level.losses}D`;

  const levels = (
    <View style={{ backgroundColor: veil, borderRadius: theme.radius.md, paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm, gap: 2, minWidth: compact ? 132 : undefined }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: theme.space.md }}>
        <Text variant="caption" color={fg}>Procédé</Text>
        <Text variant="headline" numeric color={fg}>{level.procedure}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: theme.space.md }}>
        <Text variant="caption" color={fg}>Séance</Text>
        <Text variant="callout" numeric weight="700" color={fg}>{record}</Text>
      </View>
    </View>
  );

  const undo = (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        haptics.tapLight();
        onUndo();
      }}
      disabled={disabled || level.sequence === 0}
      accessibilityRole="button"
      accessibilityLabel={`Annuler le point de ${level.label}`}
      hitSlop={6}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.space.xs,
        minHeight: 44,
        paddingHorizontal: theme.space.lg,
        borderRadius: theme.radius.pill,
        backgroundColor: veil,
        opacity: disabled || level.sequence === 0 ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name="arrow-undo" size={18} color={fg} />
      <Text variant="callout" weight="600" color={fg}>Annuler −{tapValue}</Text>
    </Pressable>
  );

  const score = (
    <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
      <Text
        variant="hero"
        numeric
        color={fg}
        style={{ fontSize: scoreSize, lineHeight: Math.round(scoreSize * 1.04), letterSpacing: -2, includeFontPadding: false }}
      >
        {level.sequence}
      </Text>
    </Animated.View>
  );

  return (
    <Pressable
      onPress={() => {
        haptics.success();
        onScore();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Ajouter ${tapValue} point à ${level.label}`}
      accessibilityValue={{ text: `Séquence ${level.sequence}, procédé ${level.procedure}, séance ${record}` }}
      style={{
        flex: 1,
        backgroundColor: color,
        borderRadius: theme.radius.xl,
        padding: theme.space.lg,
        opacity: disabled ? 0.55 : 1,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border.strong,
        gap: theme.space.sm,
      }}
    >
      {compact ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.md }}>
            <Text variant="title" color={fg} numberOfLines={1} style={{ flex: 1 }}>{level.label}</Text>
            {undo}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
            <View style={{ flex: 1, alignItems: 'flex-start' }}>
              <Text variant="caption" color={fg}>Séquence</Text>
              {score}
            </View>
            {levels}
          </View>
        </>
      ) : (
        <>
          <Text variant="title" color={fg} numberOfLines={1}>{level.label}</Text>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="caption" color={fg}>Séquence</Text>
            {score}
          </View>
          {levels}
          {undo}
        </>
      )}
    </Pressable>
  );
}
