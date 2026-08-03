/**
 * Carte joueur avec saisie intégrée — tablette (P1-3)
 *
 * Sur iPad, chaque joueur du terrain porte sa propre grille d'actions : pas de
 * mode, pas de sélection préalable, le coach touche directement la bonne case.
 * C'est le bon geste sur cette surface, et il est conservé.
 *
 * ## Ce qui change
 *
 * - **Les boutons d'action portaient un acronyme seul** : `TC`, `TnC`, `PdB`,
 *   `Pdec`, `R`, `B`. Six abréviations à mémoriser, dont deux (`TC` / `TnC`)
 *   qui ne se distinguent que par une lettre au milieu. Le libellé est écrit.
 * - **Le gardien était signalé par un emoji 🧤** collé au prénom. Un emoji n'a
 *   ni couleur garantie ni nom accessible, et il consommait deux caractères de
 *   la largeur d'un nom déjà tronqué.
 * - **Les cartons étaient deux pastilles nues avec un chiffre**, sans libellé
 *   ni rôle : impossible de savoir laquelle était la jaune sans la voir.
 * - Le compteur d'action était en 9 px sous l'acronyme.
 */

import { View, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { Text } from '../ui';
import { formatSeconds } from '../../utils/matchUtils';
import { PLAYER_ACTIONS, isGoalkeeper, type PlayerState, type RecorderAction } from './recorderModel';
import type { Player } from '../../types';

/** Les cartons sont à part : ils ne sont pas une statistique de performance. */
const FIELD_ACTIONS = PLAYER_ACTIONS.filter(
  (a) => a.eventType !== 'yellow_card' && a.eventType !== 'red_card'
);
const CARD_ACTIONS = PLAYER_ACTIONS.filter(
  (a) => a.eventType === 'yellow_card' || a.eventType === 'red_card'
);

export interface PlayerActionCardProps {
  player: Player;
  state?: PlayerState;
  onAction: (action: RecorderAction) => void;
  onUndo: (action: RecorderAction) => void;
  /** Bascule la sélection pour un changement par double touche. */
  onToggleSelect: () => void;
  selected?: boolean;
  isDropTarget?: boolean;
  isDragging?: boolean;
  /** Nom du joueur en cours de déplacement, pour l'étiquette de dépôt. */
  incomingName?: string | null;
}

export function PlayerActionCard({
  player,
  state,
  onAction,
  onUndo,
  onToggleSelect,
  selected,
  isDropTarget,
  isDragging,
  incomingName,
}: PlayerActionCardProps) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;

  const gk = isGoalkeeper(player.position);
  const seq = state?.currentSequenceTime ?? 0;
  const limit = state?.sequenceTimeLimit || 1;
  const over = seq >= limit;
  const near = !over && seq / limit > 0.7;

  return (
    <View
      style={[
        s.card,
        gk && s.cardGk,
        selected && s.cardSelected,
        isDropTarget && s.cardDrop,
        isDragging && s.cardDragging,
      ]}
    >
      {isDropTarget && incomingName && (
        <View style={s.dropBadge}>
          <Ionicons name="swap-horizontal" size={13} color={c.bg.canvas} />
          <Text variant="caption" weight="700" color={c.bg.canvas} numberOfLines={1}>
            Remplacer par {incomingName}
          </Text>
        </View>
      )}

      <View style={s.head}>
        {gk && <Ionicons name="hand-left" size={15} color={c.warning.default} />}
        <Text variant="headline" numberOfLines={1} style={s.flex}>
          {player.last_name}
        </Text>
        {player.number != null && (
          <Text variant="caption" tone="tertiary" numeric>
            #{player.number}
          </Text>
        )}
      </View>
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {player.first_name} · {player.position || 'Poste non renseigné'}
      </Text>

      <View style={s.times}>
        <View style={s.timeCell}>
          <Text variant="caption" tone="tertiary">
            Séquence
          </Text>
          <Text
            variant="headline"
            numeric
            color={over ? c.negative.default : near ? c.warning.default : c.text.primary}
          >
            {formatSeconds(seq)}
          </Text>
        </View>
        <View style={s.timeCell}>
          <Text variant="caption" tone="tertiary">
            Cumulé
          </Text>
          <Text variant="headline" numeric tone="secondary">
            {formatSeconds(state?.totalTime ?? 0)}
          </Text>
        </View>
        <View style={s.timeCell}>
          <Text variant="caption" tone="tertiary">
            Limite
          </Text>
          <Text variant="headline" numeric tone="tertiary">
            {formatSeconds(limit)}
          </Text>
        </View>
      </View>

      {over && (
        <View style={s.alert}>
          <Ionicons name="alert-circle" size={14} color={c.negative.default} />
          <Text variant="caption" weight="700" color={c.negative.default}>
            Limite de séquence dépassée
          </Text>
        </View>
      )}

      <View style={s.grid}>
        {FIELD_ACTIONS.map((a) => {
          const count = state?.stats[a.statKey] ?? 0;
          const tone = a.tone(c);
          return (
            <Pressable
              key={a.eventType}
              onPress={() => onAction(a)}
              onLongPress={() => onUndo(a)}
              delayLongPress={350}
              style={({ pressed }) => [s.action, { borderColor: tone }, pressed && s.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${a.label}, ${player.last_name}. ${count} enregistré${count > 1 ? 's' : ''}`}
              accessibilityHint="Appui long pour annuler la dernière"
            >
              <View style={[s.dot, { backgroundColor: tone }]} />
              <Text variant="caption" weight="600" numberOfLines={1} style={s.flex}>
                {a.short}
              </Text>
              <Text variant="tableCell" numeric weight="700" color={count > 0 ? tone : c.text.tertiary}>
                {count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={s.footer}>
        {CARD_ACTIONS.map((a) => {
          const count =
            a.eventType === 'yellow_card' ? (state?.yellowCards ?? 0) : (state?.redCards ?? 0);
          const tone = a.tone(c);
          return (
            <Pressable
              key={a.eventType}
              onPress={() => onAction(a)}
              onLongPress={() => onUndo(a)}
              delayLongPress={350}
              style={({ pressed }) => [
                s.cardBtn,
                { borderColor: tone },
                count > 0 && { backgroundColor: tone },
                pressed && s.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${a.label}, ${player.last_name}. ${count}`}
              accessibilityHint="Appui long pour annuler"
            >
              <Ionicons name={a.icon} size={14} color={count > 0 ? c.bg.canvas : tone} />
              <Text
                variant="caption"
                weight="700"
                numeric
                color={count > 0 ? c.bg.canvas : c.text.secondary}
              >
                {count}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={onToggleSelect}
          style={({ pressed }) => [s.subBtn, selected && s.subBtnOn, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityState={{ selected: !!selected }}
          accessibilityLabel={
            selected
              ? `${player.last_name} sélectionné, touchez un remplaçant`
              : `Sélectionner ${player.last_name} pour un changement`
          }
        >
          <Ionicons
            name={selected ? 'checkmark-circle' : 'swap-horizontal'}
            size={15}
            color={selected ? c.accent.default : c.text.secondary}
          />
          <Text variant="caption" weight="600" tone={selected ? 'accent' : 'secondary'} numberOfLines={1}>
            {selected ? 'Sélectionné' : 'Changer'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface BenchCardProps {
  player: Player;
  state?: PlayerState;
  onPress: () => void;
  selected?: boolean;
  isDropTarget?: boolean;
  isDragging?: boolean;
  /** Le remplaçant entre à la place de ce joueur. */
  outgoingName?: string | null;
}

export function BenchCard({
  player,
  state,
  onPress,
  selected,
  isDropTarget,
  isDragging,
  outgoingName,
}: BenchCardProps) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  const gk = isGoalkeeper(player.position);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.bench,
        gk && s.cardGk,
        selected && s.cardSelected,
        isDropTarget && s.cardDrop,
        isDragging && s.cardDragging,
        pressed && s.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={
        `${player.first_name} ${player.last_name}${gk ? ', gardien' : ''}, remplaçant. ` +
        `${formatSeconds(state?.totalTime ?? 0)} de jeu`
      }
      accessibilityHint={selected ? 'Touchez un joueur du terrain pour échanger' : 'Sélectionner pour entrer'}
    >
      {isDropTarget && outgoingName && (
        <View style={s.dropBadge}>
          <Ionicons name="swap-horizontal" size={12} color={c.bg.canvas} />
          <Text variant="caption" weight="700" color={c.bg.canvas} numberOfLines={1}>
            Pour {outgoingName}
          </Text>
        </View>
      )}
      <View style={s.head}>
        {gk && <Ionicons name="hand-left" size={13} color={c.warning.default} />}
        <Text variant="caption" weight="700" numberOfLines={1} style={s.flex}>
          {player.last_name}
        </Text>
      </View>
      <Text variant="tableCell" numeric tone="secondary">
        {formatSeconds(state?.totalTime ?? 0)}
      </Text>
      {((state?.yellowCards ?? 0) > 0 || (state?.redCards ?? 0) > 0) && (
        <View style={s.benchCards}>
          {(state?.yellowCards ?? 0) > 0 && (
            <View style={[s.miniCard, { backgroundColor: c.warning.default }]}>
              <Text variant="caption" weight="700" color={c.bg.canvas} numeric>
                {state?.yellowCards}
              </Text>
            </View>
          )}
          {(state?.redCards ?? 0) > 0 && (
            <View style={[s.miniCard, { backgroundColor: c.negative.default }]}>
              <Text variant="caption" weight="700" color={c.bg.canvas} numeric>
                {state?.redCards}
              </Text>
            </View>
          )}
        </View>
      )}
      <Text variant="caption" tone={selected ? 'accent' : 'tertiary'} weight={selected ? '700' : '500'}>
        {selected ? 'Sélectionné' : 'Entrer'}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  card: {
    flex: 1,
    minWidth: 0,
    gap: t.space.xs,
    padding: t.space.sm,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.bg.surface,
    borderWidth: 2,
    borderColor: t.colors.border.subtle,
  },
  cardGk: { borderColor: t.colors.warning.default },
  cardSelected: { borderColor: t.colors.accent.default, backgroundColor: t.colors.accent.subtle },
  cardDrop: { borderColor: t.colors.positive.default, backgroundColor: t.colors.positive.subtle },
  cardDragging: { opacity: 0.45 },

  dropBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: t.space.sm,
    paddingVertical: 2,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.positive.default,
  },

  head: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },

  times: { flexDirection: 'row', gap: t.space.xs, marginTop: 2 },
  timeCell: { flex: 1 },

  alert: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },

  grid: { gap: 3 },
  action: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    paddingHorizontal: t.space.sm,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    backgroundColor: t.colors.bg.canvas,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },

  footer: { flexDirection: 'row', alignItems: 'stretch', gap: t.space.xs, marginTop: 2 },
  cardBtn: {
    minWidth: 42,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: t.radius.sm,
    borderWidth: 1,
  },
  subBtn: {
    flex: 1,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.colors.border.subtle,
    backgroundColor: t.colors.bg.canvas,
  },
  subBtnOn: { borderColor: t.colors.accent.default, backgroundColor: t.colors.accent.subtle },

  bench: {
    flexGrow: 1,
    flexBasis: 118,
    maxWidth: 190,
    minHeight: HIT_SLOP_MIN + 26,
    gap: 2,
    padding: t.space.sm,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.bg.surface,
    borderWidth: 2,
    borderColor: t.colors.border.subtle,
  },
  benchCards: { flexDirection: 'row', gap: t.space.xs },
  miniCard: {
    minWidth: 18,
    height: 16,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
}));
