/**
 * Catalogue unique des actions du match recorder (P1-3)
 *
 * `PhoneMatchRecorder` et `TabletMatchRecorder` déclaraient chacun leur propre
 * table d'actions et de colonnes. Elles ont divergé : la récupération de balle
 * était verte (`#16a34a`) sur téléphone et violette (`#a855f7`) sur tablette.
 * Robin bascule entre les deux appareils selon le match — la même donnée
 * changeait de couleur d'un match à l'autre.
 *
 * ## Couleurs : catégorie ou jugement
 *
 * Une action n'est colorée en `positive` / `negative` que quand elle porte un
 * jugement réel sur la performance (récupération, perte, cartons). Les autres
 * sont des CATÉGORIES : elles prennent une teinte de `chartSeries`, qui est
 * conçue pour être distinguable sans porter de sens.
 *
 * Un tir non cadré prend `neutralData` : ce n'est pas une faute, c'est le
 * résultat nul d'une tentative.
 */

import type { MatchEventType } from '../../types';
import type { ThemeColors } from '../../lib/design/tokens';
import type { GoalType } from '../../lib/services/matchEvents';
import Ionicons from '@expo/vector-icons/Ionicons';

export const HALF_DURATION_SEC = 20 * 60;
export const DEFAULT_SEQUENCE_LIMIT = 180;

/** Nombre de joueurs sur le terrain en futsal (4 + gardien). */
export const FIELD_SIZE = 5;

/** Fautes cumulées à partir desquelles la suivante donne un jet franc de 10 m. */
export const FOUL_LIMIT = 5;

export type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export const GOAL_TYPES: { value: GoalType; label: string; icon: IoniconName }[] = [
  { value: 'offensive', label: 'Phase offensive', icon: 'football-outline' },
  { value: 'transition', label: 'Transition', icon: 'flash-outline' },
  { value: 'cpa', label: 'CPA', icon: 'flag-outline' },
  { value: 'superiority', label: 'Supériorité', icon: 'people-outline' },
];

/**
 * `statKey` est la clé dans `PlayerState.stats`. Les cartons n'en ont pas :
 * ils vivent dans `yellowCards` / `redCards`, comptés à part parce qu'ils
 * suivent le joueur au-delà du match (suspension).
 */
export interface RecorderAction {
  eventType: MatchEventType;
  statKey: string;
  /** Libellé complet, celui qu'on lit. */
  label: string;
  /** Abréviation pour les en-têtes de colonnes serrés. Jamais seule sur un bouton. */
  short: string;
  icon: IoniconName;
  /** Exige un joueur sélectionné : un but sans buteur n'a pas de sens. */
  requiresPlayer: boolean;
  tone: (c: ThemeColors) => string;
}

export const PLAYER_ACTIONS: RecorderAction[] = [
  {
    eventType: 'goal',
    statKey: 'goals',
    label: 'But',
    short: 'B',
    icon: 'football',
    requiresPlayer: true,
    tone: (c) => c.chartSeries[0] ?? c.accent.default,
  },
  {
    eventType: 'shot_on_target',
    statKey: 'shotsOnTarget',
    label: 'Tir cadré',
    short: 'T.cad',
    icon: 'radio-button-on',
    requiresPlayer: false,
    tone: (c) => c.chartSeries[4] ?? c.accent.default,
  },
  {
    eventType: 'shot',
    statKey: 'shotsOffTarget',
    label: 'Tir non cadré',
    short: 'T.nc',
    icon: 'ellipse-outline',
    requiresPlayer: false,
    tone: (c) => c.neutralData,
  },
  {
    eventType: 'assist',
    statKey: 'assists',
    label: 'Passe déc.',
    short: 'P.déc',
    icon: 'git-network-outline',
    requiresPlayer: false,
    tone: (c) => c.chartSeries[5] ?? c.accent.default,
  },
  {
    eventType: 'recovery',
    statKey: 'ballRecovery',
    label: 'Récupération',
    short: 'Récup',
    icon: 'arrow-up-circle',
    requiresPlayer: false,
    tone: (c) => c.positive.default,
  },
  {
    eventType: 'ball_loss',
    statKey: 'ballLoss',
    label: 'Perte de balle',
    short: 'Perte',
    icon: 'arrow-down-circle',
    requiresPlayer: false,
    tone: (c) => c.negative.default,
  },
  {
    eventType: 'yellow_card',
    statKey: '',
    label: 'Carton jaune',
    short: 'CJ',
    icon: 'card-outline',
    requiresPlayer: true,
    tone: (c) => c.warning.default,
  },
  {
    eventType: 'red_card',
    statKey: '',
    label: 'Carton rouge',
    short: 'CR',
    icon: 'card',
    requiresPlayer: true,
    tone: (c) => c.negative.default,
  },
];

/** Actions adverses : pas de joueur, pas de stat individuelle. */
export const OPPONENT_ACTIONS: {
  eventType: MatchEventType;
  label: string;
  short: string;
  icon: IoniconName;
  tone: (c: ThemeColors) => string;
}[] = [
  {
    eventType: 'opponent_goal',
    label: 'But encaissé',
    short: 'But adv.',
    icon: 'football',
    tone: (c) => c.negative.default,
  },
  {
    eventType: 'opponent_shot_on_target',
    label: 'Tir cadré concédé',
    short: 'Tir cad. adv.',
    icon: 'radio-button-on',
    tone: (c) => c.warning.default,
  },
  {
    eventType: 'opponent_shot',
    label: 'Tir non cadré concédé',
    short: 'Tir adv.',
    icon: 'ellipse-outline',
    tone: (c) => c.neutralData,
  },
];

/**
 * Colonnes du tableau de bilan. `flex` est indicatif : c'est l'écran qui décide
 * lesquelles il affiche, la tablette en montre plus que le téléphone.
 */
export interface StatColumn {
  key: string;
  label: string;
  short: string;
  kind: 'count' | 'time' | 'plusminus';
  tone: (c: ThemeColors) => string;
}

export const STAT_COLUMNS: StatColumn[] = [
  { key: 'goals', label: 'Buts', short: 'B', kind: 'count', tone: (c) => c.chartSeries[0] ?? c.accent.default },
  { key: 'shotsOnTarget', label: 'Tirs cadrés', short: 'T.cad', kind: 'count', tone: (c) => c.chartSeries[4] ?? c.accent.default },
  { key: 'totalShots', label: 'Tirs totaux', short: 'T.tot', kind: 'count', tone: (c) => c.neutralData },
  { key: 'ballRecovery', label: 'Récupérations', short: 'Récup', kind: 'count', tone: (c) => c.positive.default },
  { key: 'ballLoss', label: 'Pertes', short: 'Perte', kind: 'count', tone: (c) => c.negative.default },
  { key: 'assists', label: 'Passes déc.', short: 'P.déc', kind: 'count', tone: (c) => c.chartSeries[5] ?? c.accent.default },
  { key: 'plusMinus', label: '+/-', short: '+/-', kind: 'plusminus', tone: (c) => c.text.secondary },
  { key: 'totalTime', label: 'Temps de jeu', short: 'Tps', kind: 'time', tone: (c) => c.text.secondary },
];

export interface PlayerState {
  id: string;
  totalTime: number;
  currentSequenceTime: number;
  sequenceTimeLimit: number;
  yellowCards: number;
  redCards: number;
  stats: Record<string, number>;
}

export interface StatRow {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  number: number;
  goals: number;
  shotsOnTarget: number;
  totalShots: number;
  ballRecovery: number;
  ballLoss: number;
  assists: number;
  totalTime: number;
  plusMinus: number;
  yellowCards: number;
  redCards: number;
}

/** Correspondance événement → clé de stat, pour rejouer l'historique au chargement. */
export const EVENT_TO_STAT: Record<string, string> = {
  goal: 'goals',
  shot_on_target: 'shotsOnTarget',
  shot: 'shotsOffTarget',
  ball_loss: 'ballLoss',
  recovery: 'ballRecovery',
  assist: 'assists',
};

/**
 * Un but écrit DEUX événements : le but, et le tir cadré qui l'accompagne
 * (un but est nécessairement cadré). L'annulation doit donc supprimer les deux,
 * sinon le tir cadré reste orphelin en base et gonfle le rapport de match.
 */
export const PAIRED_EVENT: Partial<Record<MatchEventType, MatchEventType>> = {
  goal: 'shot_on_target',
  opponent_goal: 'opponent_shot_on_target',
};

export function emptyPlayerState(id: string, limit: number, totalTime: number): PlayerState {
  return {
    id,
    totalTime,
    currentSequenceTime: 0,
    sequenceTimeLimit: limit,
    yellowCards: 0,
    redCards: 0,
    stats: { shotsOnTarget: 0, shotsOffTarget: 0, goals: 0, ballLoss: 0, ballRecovery: 0, assists: 0 },
  };
}

export const isGoalkeeper = (position: string | null | undefined) =>
  (position ?? '').toLowerCase().startsWith('gardien');

/**
 * Nom court d'un joueur, désambiguïsé seulement quand il le faut.
 *
 * Les cartes n'affichent que le nom de famille : c'est ce qui tient dans la
 * largeur, et c'est ce qu'un coach emploie. Sauf que l'effectif de Paris XIV a
 * deux Guerinot — le banc affichait donc deux cartes identiques, impossibles à
 * distinguer avant de faire entrer la mauvaise.
 *
 * L'initiale n'est ajoutée que sur les homonymes. La mettre partout serait du
 * bruit permanent pour un cas rare, et le bruit permanent finit par ne plus
 * être lu.
 */
export function playerDisplayName(
  player: { first_name: string; last_name: string },
  squad: { first_name: string; last_name: string }[]
): string {
  const key = player.last_name.toLowerCase();
  const homonym = squad.some(
    (p) => p.last_name.toLowerCase() === key && p.first_name !== player.first_name
  );
  return homonym ? `${player.first_name.charAt(0)}. ${player.last_name}` : player.last_name;
}
