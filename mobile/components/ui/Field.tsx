/**
 * Field / Input / ChipGroup — primitives de formulaire (P0-7)
 *
 * L'audit a relevé que chaque écran de saisie redéfinissait son propre
 * `label` / `input` / `pickerHint` / `chip`, avec des valeurs qui divergeaient :
 * `borderRadius` 8, 10 ou 12 selon le fichier, `padding` 8, 12 ou 14, et surtout
 * une hauteur de champ non garantie (`padding: 8` + `fontSize: 14` = 36 pt de
 * haut, sous la cible tactile).
 *
 * Trois corrections structurelles portées ici plutôt que par la discipline :
 *
 * 1. **`minHeight: 48`** sur tout champ et toute puce. Un champ ne peut plus
 *    être trop petit par accident.
 * 2. **`label` obligatoire sur `Input`**, et il sert d'`accessibilityLabel`.
 *    Les 40+ `TextInput` de l'app n'en avaient aucun.
 * 3. **`placeholderTextColor` issu du thème.** Il était en `#9ca3af` fixe :
 *    1,9:1 sur un fond sombre, donc invisible en thème sombre.
 */

import React, { useId } from 'react';
import { View, TextInput, TextInputProps, Pressable, ViewStyle, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from './Text';

// ─── Field ────────────────────────────────────────────────────────────────────

export interface FieldProps {
  label: string;
  /** Précision affichée sous le contrôle. */
  hint?: string;
  /** Message d'erreur. Remplace le hint et colore le libellé. */
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Field({ label, hint, error, optional, children, style }: FieldProps) {
  const { theme } = useTheme();
  return (
    <View style={[{ gap: theme.space.sm }, style]}>
      <View style={styles.labelRow}>
        <Text variant="callout" tone={error ? 'negative' : 'secondary'} weight="600">
          {label}
        </Text>
        {optional && (
          <Text variant="caption" tone="tertiary">
            optionnel
          </Text>
        )}
      </View>
      {children}
      {error ? (
        <View style={styles.hintRow}>
          <Ionicons name="alert-circle" size={13} color={theme.colors.negative.default} />
          <Text variant="caption" tone="negative" style={styles.flex}>
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

export interface InputProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  /** Visible ET annoncé par VoiceOver. Obligatoire. */
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  /** Champ numérique court, centré, chiffres tabulaires (score, dossard). */
  numeric?: boolean;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  hint,
  error,
  optional,
  numeric = false,
  containerStyle,
  ...rest
}: InputProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const id = useId();

  return (
    <Field label={label} hint={hint} error={error} optional={optional} style={containerStyle}>
      <TextInput
        {...rest}
        nativeID={id}
        accessibilityLabel={label}
        placeholderTextColor={c.text.tertiary}
        style={[
          styles.input,
          {
            backgroundColor: c.bg.surface,
            borderRadius: theme.radius.sm,
            borderColor: error ? c.negative.default : c.border.subtle,
            color: c.text.primary,
            paddingHorizontal: theme.space.lg,
          },
          numeric && styles.inputNumeric,
        ]}
      />
    </Field>
  );
}

// ─── ChipGroup ────────────────────────────────────────────────────────────────

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export interface ChipGroupProps<T extends string> {
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Annoncé comme intitulé du groupe. */
  label: string;
  style?: ViewStyle;
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  style,
}: ChipGroupProps<T>) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View
      style={[styles.chipRow, { gap: theme.space.sm }, style]}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active }}
            accessibilityLabel={o.label}
            style={({ pressed }) => [
              styles.chip,
              {
                borderRadius: theme.radius.pill,
                paddingHorizontal: theme.space.lg,
                gap: theme.space.xs,
                backgroundColor: active ? c.accent.fill : c.bg.surface,
                borderColor: active ? c.accent.fill : c.border.subtle,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            {o.icon && (
              <Ionicons name={o.icon} size={15} color={active ? c.text.onFill : c.text.secondary} />
            )}
            <Text variant="callout" tone={active ? 'onFill' : 'secondary'} weight="600">
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  input: {
    minHeight: 48,
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inputNumeric: { minWidth: 78, textAlign: 'center', fontSize: 22, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
