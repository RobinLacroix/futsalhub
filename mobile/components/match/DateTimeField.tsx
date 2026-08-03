/**
 * DateTimeField — saisie de date et d'heure (P0-7)
 *
 * Extrait de `matchDetail/[matchId].tsx`, où le sélecteur natif était configuré
 * en dur avec `themeVariant="light"` et `textColor="#111111"`. **C'est un bug,
 * pas seulement un défaut de style** : en thème sombre, le sélecteur s'affichait
 * en clair au milieu d'un écran sombre, et sur un fond de feuille sombre le
 * texte noir en dur devenait illisible. Les deux valeurs suivent maintenant le
 * thème résolu.
 *
 * Le repli sans `@react-native-community/datetimepicker` (module optionnel) est
 * conservé : deux champs texte `JJ/MM/AAAA` et `HH:MM`. Il gagne au passage des
 * couleurs de thème pour le texte de remplacement, qui était en `#9ca3af` fixe.
 */

import React, { useState } from 'react';
import { View, Pressable, TextInput, Modal, StyleSheet, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTheme } from '../../contexts/ThemeContext';
import { Text, Button } from '../ui';

let DateTimePicker: React.ComponentType<Record<string, unknown>> | null = null;
try {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch {
  /* module optionnel */
}

export const hasNativePicker = DateTimePicker != null;

export interface DateTimeFieldProps {
  value: Date;
  onChange: (next: Date) => void;
  /** Repli texte quand le module natif est absent. */
  dateText: string;
  timeText: string;
  onDateTextChange: (v: string) => void;
  onTimeTextChange: (v: string) => void;
}

export function DateTimeField({
  value,
  onChange,
  dateText,
  timeText,
  onDateTextChange,
  onTimeTextChange,
}: DateTimeFieldProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [openMode, setOpenMode] = useState<'date' | 'time' | null>(null);

  const inputStyle = {
    backgroundColor: c.bg.sunken,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border.subtle,
    color: c.text.primary,
    paddingHorizontal: theme.space.md,
    minHeight: 48,
    fontSize: 16,
  };

  if (!hasNativePicker || !DateTimePicker) {
    return (
      <View style={styles.wrap}>
        <View style={styles.field}>
          <Text variant="callout" tone="secondary" weight="600">
            Date
          </Text>
          <TextInput
            style={inputStyle}
            value={dateText}
            onChangeText={onDateTextChange}
            placeholder="JJ/MM/AAAA"
            placeholderTextColor={c.text.tertiary}
            accessibilityLabel="Date du match, format jour slash mois slash année"
          />
        </View>
        <View style={styles.field}>
          <Text variant="callout" tone="secondary" weight="600">
            Heure
          </Text>
          <TextInput
            style={inputStyle}
            value={timeText}
            onChangeText={onTimeTextChange}
            placeholder="HH:MM"
            placeholderTextColor={c.text.tertiary}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel="Heure du match, format heures deux-points minutes"
          />
        </View>
      </View>
    );
  }

  const trigger = (mode: 'date' | 'time', label: string, display: string, icon: 'calendar-outline' | 'time-outline') => (
    <Pressable
      onPress={() => setOpenMode(mode)}
      accessibilityRole="button"
      accessibilityLabel={`${label} : ${display}. Appuyer pour modifier`}
      style={({ pressed }) => [
        styles.trigger,
        {
          backgroundColor: pressed ? c.bg.stripe : c.bg.sunken,
          borderRadius: theme.radius.sm,
          borderColor: c.border.subtle,
          gap: theme.space.md,
        },
      ]}
    >
      <Ionicons name={icon} size={18} color={c.text.secondary} />
      <View style={styles.triggerText}>
        <Text variant="caption" tone="tertiary">
          {label}
        </Text>
        <Text variant="body" weight="500">
          {display}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={c.text.tertiary} />
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      {trigger('date', 'Date', format(value, 'EEEE d MMMM yyyy', { locale: fr }), 'calendar-outline')}
      {trigger('time', 'Heure', format(value, 'HH:mm'), 'time-outline')}

      <Modal visible={openMode !== null} transparent animationType="slide">
        <Pressable
          style={[styles.overlay, { backgroundColor: c.overlay }]}
          onPress={() => setOpenMode(null)}
          accessibilityLabel="Fermer le sélecteur"
        >
          {/* Capte le responder pour que le tap sur la feuille ne ferme pas la modale. */}
          <View
            style={[styles.sheet, { backgroundColor: c.bg.elevated }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.sheetHeader}>
              <Button label="OK" variant="ghost" size="sm" onPress={() => setOpenMode(null)} />
            </View>
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={value}
                mode={openMode ?? 'date'}
                display={
                  Platform.OS === 'ios' ? (openMode === 'time' ? 'spinner' : 'inline') : 'default'
                }
                onChange={(_e: unknown, v?: Date) => {
                  if (v) {
                    const next = new Date(value);
                    if (openMode === 'time') next.setHours(v.getHours(), v.getMinutes(), 0, 0);
                    else next.setFullYear(v.getFullYear(), v.getMonth(), v.getDate());
                    onChange(next);
                  }
                  if (Platform.OS !== 'ios') setOpenMode(null);
                }}
                locale="fr-FR"
                is24Hour
                // Suivent le thème résolu. Étaient figés en clair, ce qui rendait
                // le sélecteur illisible en mode sombre.
                textColor={c.text.primary}
                themeVariant={theme.scheme}
                accentColor={c.accent.default}
              />
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  field: { gap: 6 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  triggerText: { flex: 1, gap: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingTop: 8 },
  pickerWrap: { alignItems: 'center', minHeight: 220, width: '100%' },
});
