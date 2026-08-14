/**
 * Ligne de saisie d'un joueur sur un test physique.
 *
 * ## Pourquoi un TextInput brut et pas la primitive `Input`
 *
 * `Input` impose un `label` VISIBLE au-dessus du champ, ce qui est juste pour un
 * formulaire et faux pour une grille : ici la colonne porte déjà « Essai 1 », et
 * répéter le libellé sur chaque ligne ferait 18 × 3 étiquettes à l'écran.
 * La contrainte que `Input` garantit est reprise à la main, explicitement :
 * `accessibilityLabel` complet sur chaque cellule (« Marc Dupont, essai 2 »),
 * hauteur minimale de 48 pt, couleurs issues du thème, aucun littéral.
 *
 * ## Le bandeau de valeur retenue
 *
 * Il affiche ce qui sera enregistré, pas la dernière valeur tapée. Sur un test à
 * 3 essais avec `aggregation: 'best'`, le coach doit voir immédiatement que
 * c'est le 1,79 s qui compte et pas le 1,88 s qu'il vient de saisir — et le
 * meilleur essai dépend de `direction`, il n'est pas devinable à l'oeil sur un
 * catalogue qui mélange chronos et hauteurs.
 */

import React, { memo, useMemo } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui';
import { PlayerIdentity } from '../players/PlayerIdentity';
import {
  formatTestValue,
  retainedValue,
  type PhysicalTestType,
} from '../../lib/physicalTests';

export interface PlayerTestRowProps {
  playerId: string;
  firstName: string;
  lastName: string;
  number?: number | null;
  testType: PhysicalTestType;
  /** Saisie brute par essai, index 0 = essai 1. Chaîne vide = non saisi. */
  values: string[];
  /** Valeurs numériques déjà validées, alignées sur `values`. */
  parsed: (number | null)[];
  onChange: (attemptIndex: number, raw: string) => void;
  /** Enregistre la ref du champ pour permettre l'enchaînement au clavier. */
  registerInput: (playerId: string, attemptIndex: number, ref: TextInput | null) => void;
  onSubmitAttempt: (playerId: string, attemptIndex: number) => void;
  /** Suit la cellule active, seule source de position pour la barre d'accessoire. */
  onFocusAttempt: (playerId: string, attemptIndex: number) => void;
  /** `nativeID` de l'InputAccessoryView. iOS seulement, `undefined` ailleurs. */
  accessoryId?: string;
}

function PlayerTestRowBase({
  playerId,
  firstName,
  lastName,
  number,
  testType,
  values,
  parsed,
  onChange,
  registerInput,
  onSubmitAttempt,
  onFocusAttempt,
  accessoryId,
}: PlayerTestRowProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const retained = useMemo(
    () =>
      retainedValue(
        parsed.filter((v): v is number => v !== null),
        testType.aggregation,
        testType.direction,
      ),
    [parsed, testType.aggregation, testType.direction],
  );

  const hasAnyValue = parsed.some((v) => v !== null);

  return (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: c.border.subtle,
          paddingVertical: theme.space.sm,
          gap: theme.space.md,
        },
      ]}
    >
      <View style={styles.identity}>
        <PlayerIdentity
          firstName={firstName}
          lastName={lastName}
          number={number}
          muted={!hasAnyValue}
        />
        {retained !== null && (
          <Text variant="caption" tone="accent" numeric style={styles.retained}>
            retenu {formatTestValue(retained, testType)} {testType.unit}
          </Text>
        )}
      </View>

      <View style={[styles.attempts, { gap: theme.space.sm }]}>
        {values.map((raw, index) => (
          <TextInput
            key={index}
            ref={(ref) => registerInput(playerId, index, ref)}
            value={raw}
            onChangeText={(text) => onChange(index, text)}
            onFocus={() => onFocusAttempt(playerId, index)}
            onSubmitEditing={() => onSubmitAttempt(playerId, index)}
            inputAccessoryViewID={accessoryId}
            keyboardType="decimal-pad"
            returnKeyType="next"
            blurOnSubmit={false}
            selectTextOnFocus
            placeholder="—"
            placeholderTextColor={c.text.tertiary}
            accessibilityLabel={`${firstName} ${lastName}, ${testType.label}, essai ${index + 1}`}
            style={[
              styles.cell,
              {
                backgroundColor: c.bg.surface,
                borderColor: parsed[index] !== null ? c.accent.default : c.border.subtle,
                borderRadius: theme.radius.sm,
                color: c.text.primary,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  identity: { flex: 1, minWidth: 0 },
  retained: { marginTop: 2 },
  attempts: { flexDirection: 'row' },
  cell: {
    width: 68,
    minHeight: 48,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
});

/**
 * Mémoïsé : une saisie sur un joueur ne doit pas re-rendre les 17 autres lignes.
 * Sur un effectif complet, sans ça, chaque frappe redessine toute la liste et la
 * saisie « une main sur le chrono » devient poussive.
 */
export const PlayerTestRow = memo(PlayerTestRowBase);
