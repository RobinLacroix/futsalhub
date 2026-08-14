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
import {
  CARD_ACTION_ORDER,
  DEFAULT_SEQUENCE_LIMIT,
  PLAYER_ACTIONS,
  isGoalkeeper,
  type PlayerState,
  type RecorderAction,
} from './recorderModel';
import type { Player } from '../../types';

/**
 * Les cartons sont à part : ils ne sont pas une statistique de performance, et
 * ils suivent le joueur au-delà du match.
 *
 * Les six autres suivent `CARD_ACTION_ORDER` et non l'ordre du catalogue :
 * chaque rangée doit opposer deux actions de même nature (issue, tentative,
 * possession), pour que le geste se choisisse par la ligne puis par le côté.
 */
const FIELD_ACTIONS = CARD_ACTION_ORDER.map(
  (t) => PLAYER_ACTIONS.find((a) => a.eventType === t)!
);
const CARD_ACTIONS = PLAYER_ACTIONS.filter(
  (a) => a.eventType === 'yellow_card' || a.eventType === 'red_card'
);

/**
 * Écart de note depuis le début du match.
 *
 * C'est l'écart qui est affiché, pas la note. Tout le monde part de 5.0 et les
 * poids sont petits : au bout de dix minutes l'écran afficherait cinq nombres
 * entre 4.7 et 5.4, illisibles au premier coup d'œil et faussement précis.
 * `+0.4` se lit d'un regard et dit la seule chose utile en direct, qui est le
 * sens et l'ampleur de ce qu'a produit le joueur.
 *
 * Rien n'est rendu quand la valeur est `null` (gardien hors barème, ou pas
 * encore assez d'actions) : une case vide est plus honnête qu'un `0.0` qui se
 * lirait comme un jugement neutre déjà établi.
 */
export function RatingDeltaChip({ value, label }: { value: number | null; label: string }) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  if (value == null) return null;

  const tone = value > 0 ? c.positive : value < 0 ? c.negative : null;
  const text = value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);

  return (
    <View
      style={[s.ratingChip, tone && { backgroundColor: tone.subtle, borderColor: tone.default }]}
      accessibilityLabel={`${label} : note ${text} depuis le début du match`}
    >
      <Text
        variant="caption"
        weight="700"
        numeric
        color={tone ? tone.default : c.text.tertiary}
      >
        {text}
      </Text>
    </View>
  );
}

export interface PlayerActionCardProps {
  player: Player;
  /** Nom court, désambiguïsé par `playerDisplayName` en cas d'homonyme. */
  name: string;
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
  /** Écart de note depuis le début du match. `null` = ne pas afficher. */
  ratingDelta?: number | null;
}

export function PlayerActionCard({
  player,
  name,
  state,
  onAction,
  onUndo,
  onToggleSelect,
  selected,
  isDropTarget,
  isDragging,
  incomingName,
  ratingDelta = null,
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
          {name}
        </Text>
        {player.number != null && (
          <Text variant="caption" tone="tertiary" numeric>
            #{player.number}
          </Text>
        )}
        <RatingDeltaChip value={ratingDelta} label={name} />
      </View>

      {/*
        Trois colonnes de temps (séquence, cumulé, limite) ne tiennent pas dans
        une carte de ~180 pt : les intitulés se coupaient en « Séquen / ce » et
        les valeurs passaient à la ligne. La limite disparaît — elle ne sert
        qu'à déclencher l'alerte, qui la dit mieux qu'un chiffre à comparer de
        tête. Les deux temps restants passent sur une ligne.
      */}
      <View style={s.times}>
        <View style={s.timeCell}>
          <Text
            variant="title"
            numeric
            color={over ? c.negative.default : near ? c.warning.default : c.text.primary}
          >
            {formatSeconds(seq)}
          </Text>
          <Text variant="caption" tone="tertiary">
            séquence
          </Text>
        </View>
        <View style={[s.timeCell, s.timeCellRight]}>
          <Text variant="title" numeric tone="secondary">
            {formatSeconds(state?.totalTime ?? 0)}
          </Text>
          <Text variant="caption" tone="tertiary">
            cumulé
          </Text>
        </View>
      </View>

      <View style={s.bar}>
        <View
          style={[
            s.barFill,
            {
              width: `${Math.round(Math.min(1, seq / limit) * 100)}%`,
              backgroundColor: over
                ? c.negative.default
                : near
                  ? c.warning.default
                  : c.positive.default,
            },
          ]}
        />
      </View>

      {over && (
        <View style={s.alert}>
          <Ionicons name="alert-circle" size={14} color={c.negative.default} />
          <Text variant="caption" weight="700" color={c.negative.default} numberOfLines={1}>
            À sortir · limite {formatSeconds(limit)}
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
              accessibilityLabel={`${a.label}, ${name}. ${count} enregistré${count > 1 ? 's' : ''}`}
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

      <View style={s.cardsRow}>
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
              accessibilityLabel={`${a.label}, ${name}. ${count}`}
              accessibilityHint="Appui long pour annuler"
            >
              <Ionicons name={a.icon} size={14} color={count > 0 ? c.bg.canvas : tone} />
              <Text variant="caption" weight="600" color={count > 0 ? c.bg.canvas : c.text.secondary}>
                {a.short}
              </Text>
              <Text
                variant="tableCell"
                weight="700"
                numeric
                color={count > 0 ? c.bg.canvas : c.text.tertiary}
              >
                {count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View>
        <Pressable
          onPress={onToggleSelect}
          style={({ pressed }) => [s.subBtn, selected && s.subBtnOn, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityState={{ selected: !!selected }}
          accessibilityLabel={
            selected
              ? `${name} sélectionné, touchez un remplaçant`
              : `Sélectionner ${name} pour un changement`
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
  /** Nom court, désambiguïsé par `playerDisplayName` en cas d'homonyme. */
  name: string;
  state?: PlayerState;
  onPress: () => void;
  selected?: boolean;
  isDropTarget?: boolean;
  isDragging?: boolean;
  /** Le remplaçant entre à la place de ce joueur. */
  outgoingName?: string | null;
  /** Écart de note depuis le début du match. `null` = ne pas afficher. */
  ratingDelta?: number | null;
}

export function BenchCard({
  player,
  name,
  state,
  onPress,
  selected,
  isDropTarget,
  isDragging,
  outgoingName,
  ratingDelta = null,
}: BenchCardProps) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  const gk = isGoalkeeper(player.position);

  /**
   * Seuil d'attente : la propre limite de séquence du joueur, celle qui déclenche
   * déjà son « À sortir » sur le terrain. Pas de nouveau réglage à tenir, et le
   * repère est juste — un joueur qui attend plus longtemps que ce qu'il tient en
   * jeu a sauté un tour de rotation.
   */
  const wait = state?.benchTime ?? 0;
  const waiting = wait > 0 && wait >= (state?.sequenceTimeLimit || DEFAULT_SEQUENCE_LIMIT);

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
        `${formatSeconds(state?.totalTime ?? 0)} de jeu, ${formatSeconds(wait)} d'attente`
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
          {name}
        </Text>
      </View>
      <View style={s.benchLine}>
        <Text variant="tableCell" numeric tone="secondary">
          {formatSeconds(state?.totalTime ?? 0)}
        </Text>
        <RatingDeltaChip value={ratingDelta} label={name} />
      </View>

      {/*
        Le temps de jeu cumulé dit ce que le joueur a eu, l'attente dit ce qu'il
        n'a pas. Les deux se lisent ensemble : un remplaçant à 8 minutes de jeu
        qui attend depuis 6 minutes n'appelle pas la même décision qu'un autre à
        8 minutes entré il y a trente secondes.
      */}
      <View style={s.benchWait}>
        <Ionicons
          name="hourglass-outline"
          size={11}
          color={waiting ? c.warning.default : c.text.tertiary}
        />
        <Text
          variant="caption"
          numeric
          weight={waiting ? '700' : '400'}
          color={waiting ? c.warning.default : c.text.tertiary}
        >
          {formatSeconds(state?.benchTime ?? 0)}
        </Text>
      </View>
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
    gap: 5,
    paddingHorizontal: 6,
    paddingVertical: t.space.sm,
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

  /**
   * Bordure et fond teintés plutôt qu'un fond plein : le chip est posé sur la
   * ligne de titre, à côté du nom, et un aplat vif y attirerait plus l'œil que
   * le nom lui-même. En direct, c'est le nom qu'on cherche en premier.
   */
  ratingChip: {
    minWidth: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: t.colors.border.subtle,
  },
  benchLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.xs },
  benchWait: { flexDirection: 'row', alignItems: 'center', gap: 3 },

  times: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  timeCell: { minWidth: 0 },
  timeCellRight: { alignItems: 'flex-end' },
  bar: {
    height: 5,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.border.subtle,
    overflow: 'hidden',
  },
  barFill: { height: 5, borderRadius: t.radius.pill },

  alert: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },

  /**
   * Deux colonnes de trois. Six lignes empilées portaient la carte à plus de
   * 200 pt de haut pour des cibles de 34 pt : beaucoup de hauteur perdue et un
   * balayage vertical long. En deux colonnes, les six actions tiennent dans un
   * carré que l'œil embrasse d'un coup, et la cible gagne en hauteur.
   */
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  action: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 0,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.xs,
    paddingHorizontal: t.space.sm,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    backgroundColor: t.colors.bg.canvas,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },

  cardsRow: { flexDirection: 'row', alignItems: 'stretch', gap: 4 },
  cardBtn: {
    flex: 1,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    borderRadius: t.radius.sm,
    borderWidth: 1,
  },
  subBtn: {
    minHeight: 36,
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
