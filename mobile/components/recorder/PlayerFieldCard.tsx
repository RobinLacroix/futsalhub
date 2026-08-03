/**
 * Carte d'un joueur sur le terrain (P1-3)
 *
 * Cinq cartes côte à côte sur un téléphone, c'est ~72 pt de large chacune.
 * L'ancienne version y logeait prénom (9 px), nom (10 px), deux lignes de temps
 * (9 px) et une barre de 3 px. Illisible à bout de bras dans un gymnase.
 *
 * Trois décisions pour tenir dans la largeur :
 *
 * 1. **Le nom de famille seul**, en `caption`. Le prénom ne sert pas à
 *    distinguer cinq joueurs dont le coach connaît l'effectif par cœur.
 * 2. **Un seul temps affiché** : la séquence en cours. Le temps cumulé est
 *    dans l'onglet Bilan, il n'a pas d'usage en direct — la question du coach
 *    en bord de terrain est « depuis combien de temps celui-là est dessus ».
 * 3. **La barre de séquence passe à 6 px** et double la couleur d'un état
 *    textuel, parce que le dépassement était signalé par du rouge seul.
 */

import { View, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { Text } from '../ui';
import { formatSeconds } from '../../utils/matchUtils';
import { isGoalkeeper, type PlayerState } from './recorderModel';
import type { Player } from '../../types';

export interface PlayerFieldCardProps {
  player: Player;
  state?: PlayerState;
  onPress: () => void;
  /** Cible d'un glisser-déposer en cours (tablette). */
  isDropTarget?: boolean;
  /** Carte en cours de déplacement (tablette). */
  isDragging?: boolean;
  /** Sélectionnée pour recevoir une action. */
  selected?: boolean;
  /** Affiche aussi le temps cumulé : la tablette a la place. */
  showTotal?: boolean;
}

export function PlayerFieldCard({
  player,
  state,
  onPress,
  isDropTarget,
  isDragging,
  selected,
  showTotal,
}: PlayerFieldCardProps) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;

  const seq = state?.currentSequenceTime ?? 0;
  const limit = state?.sequenceTimeLimit || 1;
  const ratio = Math.min(1, seq / limit);
  const over = seq >= limit;
  const near = !over && ratio > 0.7;
  const gk = isGoalkeeper(player.position);

  const barColor = over ? c.negative.default : near ? c.warning.default : c.positive.default;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        gk && s.cardGk,
        selected && s.cardSelected,
        isDropTarget && s.cardDropTarget,
        isDragging && s.cardDragging,
        pressed && s.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={
        `${player.first_name} ${player.last_name}${gk ? ', gardien' : ''}. ` +
        `Séquence ${formatSeconds(seq)}${over ? ', limite dépassée' : ''}`
      }
      accessibilityHint="Remplacer ce joueur"
    >
      <View style={s.nameRow}>
        {gk && <Ionicons name="hand-left" size={12} color={c.warning.default} />}
        <Text variant="caption" weight="700" numberOfLines={1} style={s.name}>
          {player.last_name}
        </Text>
      </View>

      <Text variant="tableCell" numeric tone={over ? 'primary' : 'secondary'} style={s.seqValue}>
        {formatSeconds(seq)}
      </Text>

      {showTotal && (
        <Text variant="caption" numeric tone="tertiary" numberOfLines={1}>
          {formatSeconds(state?.totalTime ?? 0)} cum.
        </Text>
      )}

      <View style={s.bar}>
        <View style={[s.barFill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: barColor }]} />
      </View>

      {over && (
        <Text variant="caption" weight="700" color={c.negative.default} numberOfLines={1}>
          À sortir
        </Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    paddingVertical: t.space.sm,
    paddingHorizontal: t.space.xs,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.bg.surface,
    borderWidth: 2,
    borderColor: t.colors.border.subtle,
    alignItems: 'center',
    overflow: 'hidden',
  },
  cardGk: { borderColor: t.colors.warning.default },
  cardSelected: { borderColor: t.colors.accent.default, backgroundColor: t.colors.accent.subtle },
  cardDropTarget: { borderColor: t.colors.positive.default, backgroundColor: t.colors.positive.subtle },
  cardDragging: { opacity: 0.4 },
  pressed: { opacity: 0.7 },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '100%' },
  name: { flexShrink: 1, textAlign: 'center' },
  seqValue: { textAlign: 'center' },

  bar: {
    height: 6,
    alignSelf: 'stretch',
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.border.subtle,
    overflow: 'hidden',
  },
  barFill: { height: 6, borderRadius: t.radius.pill },
}));
