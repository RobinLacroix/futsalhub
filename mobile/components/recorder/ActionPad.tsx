/**
 * Grille de saisie des actions joueur (P1-3)
 *
 * ## Le problème d'ergonomie que ça corrige
 *
 * L'ancienne grille était en 4 colonnes de boutons carrés pleine couleur, avec
 * le libellé en 10 px blanc sur fond saturé. Deux conséquences :
 *
 * - **L'annulation était sur l'appui long du même bouton**, annoncée par une
 *   ligne de 10 px en italique. Un appui long qui rate devient un ajout : sur
 *   la seule action correctrice, c'est le pire geste possible. L'annulation a
 *   maintenant son propre bouton, séparé, avec le compteur de ce qui est
 *   annulable.
 * - **Le compte courant n'apparaissait nulle part.** Le coach appuyait sans
 *   savoir s'il avait déjà saisi. Chaque bouton porte son compteur pour le
 *   joueur sélectionné.
 *
 * Le mode `requiresPlayer` (but, cartons) désactive visiblement le bouton tant
 * qu'aucun joueur n'est choisi, au lieu d'ouvrir une alerte après coup.
 */

import { View, Pressable, type DimensionValue } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { Text } from '../ui';
import { PLAYER_ACTIONS, type PlayerState, type RecorderAction } from './recorderModel';

export interface ActionPadProps {
  /** `null` = aucun joueur choisi : les actions nominatives sont bloquées. */
  selectedPlayerId: string | null;
  selectedPlayerName?: string;
  state?: PlayerState;
  onRecord: (action: RecorderAction) => void;
  onUndo: (action: RecorderAction) => void;
  /** Nombre de colonnes. 2 sur téléphone, 4 sur tablette. */
  columns?: number;
}

function countFor(action: RecorderAction, state?: PlayerState): number {
  if (!state) return 0;
  if (action.eventType === 'yellow_card') return state.yellowCards;
  if (action.eventType === 'red_card') return state.redCards;
  return state.stats[action.statKey] ?? 0;
}

export function ActionPad({
  selectedPlayerId,
  selectedPlayerName,
  state,
  onRecord,
  onUndo,
  columns = 2,
}: ActionPadProps) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  const basis: DimensionValue = `${100 / columns}%`;

  return (
    <View style={s.grid}>
      {PLAYER_ACTIONS.map((a) => {
        const blocked = a.requiresPlayer && !selectedPlayerId;
        const count = countFor(a, state);
        const tone = a.tone(c);
        return (
          <View key={a.eventType} style={[s.cell, { flexBasis: basis }]}>
            <Pressable
              onPress={() => onRecord(a)}
              disabled={blocked}
              style={({ pressed }) => [
                s.action,
                { borderColor: tone },
                blocked && s.blocked,
                pressed && s.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: blocked }}
              accessibilityLabel={
                blocked
                  ? `${a.label}, indisponible : sélectionnez d'abord un joueur`
                  : selectedPlayerName
                    ? `${a.label} pour ${selectedPlayerName}. ${count} enregistré${count > 1 ? 's' : ''}`
                    : `${a.label}. ${count} enregistré${count > 1 ? 's' : ''}`
              }
            >
              <View style={[s.iconWrap, { backgroundColor: tone }]}>
                <Ionicons name={a.icon} size={20} color={c.bg.canvas} />
              </View>
              <Text variant="caption" weight="600" numberOfLines={2} style={s.actionLabel}>
                {a.label}
              </Text>
              {count > 0 && (
                <View style={[s.count, { backgroundColor: tone }]}>
                  <Text variant="caption" weight="700" color={c.bg.canvas} numeric>
                    {count}
                  </Text>
                </View>
              )}
            </Pressable>

            <Pressable
              onPress={() => onUndo(a)}
              disabled={blocked || count === 0}
              hitSlop={6}
              style={({ pressed }) => [
                s.undo,
                (blocked || count === 0) && s.blocked,
                pressed && s.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Annuler la dernière action : ${a.label}`}
            >
              <Ionicons name="arrow-undo" size={13} color={c.text.secondary} />
              <Text variant="caption" tone="secondary">
                Annuler
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -t.space.xs / 2 },
  cell: { paddingHorizontal: t.space.xs / 2, paddingBottom: t.space.sm },

  action: {
    minHeight: 72,
    gap: t.space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: t.space.md,
    paddingHorizontal: t.space.sm,
    borderRadius: t.radius.md,
    borderWidth: 2,
    backgroundColor: t.colors.bg.surface,
  },
  actionLabel: { textAlign: 'center' },
  iconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  count: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },

  undo: {
    minHeight: HIT_SLOP_MIN - 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    paddingVertical: t.space.xs,
  },

  blocked: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
}));
