/**
 * Catalogue unique des actions du match recorder. Miroir de
 * mobile/components/recorder/recorderModel.ts.
 *
 * Avant ce fichier, les couleurs d'action vivaient en dur dans `constants.ts`
 * (classes Tailwind arbitraires : tir non cadré en jaune, passe décisive en
 * violet) sans lien avec le thème ni avec les couleurs mobile. Robin bascule
 * entre web et mobile selon le contexte — la même donnée ne doit pas changer
 * de couleur d'un client à l'autre.
 *
 * Une action n'est colorée en `positive` / `negative` que quand elle porte un
 * jugement réel sur la performance (récupération, perte, cartons). Les autres
 * sont des CATÉGORIES : elles prennent une teinte de `chartSeries`, conçue
 * pour être distinguable sans porter de sens. Un tir non cadré prend
 * `neutralData` : ce n'est pas une faute, c'est le résultat nul d'une tentative.
 */

import {
  Goal, Target, Circle, Share2, ArrowUpCircle, ArrowDownCircle, Square,
  Flag, Zap as ZapIcon, Users as UsersIcon,
} from 'lucide-react';
import type { ThemeColors } from '@/lib/design/tokens';
import type { MatchEventType, GoalType, RatingWeights } from '@/types';

export const HALF_DURATION_SEC = 20 * 60;
export const DEFAULT_SEQUENCE_LIMIT = 180;

/** Nombre de joueurs sur le terrain en futsal (4 + gardien). */
export const FIELD_SIZE = 5;

/** Fautes cumulées à partir desquelles la suivante donne un jet franc de 10 m. */
export const FOUL_LIMIT = 5;

export const GOAL_TYPES: { value: GoalType; label: string; icon: typeof Goal }[] = [
  { value: 'offensive',   label: 'Phase offensive', icon: Goal },
  { value: 'transition',  label: 'Transition',      icon: ZapIcon },
  { value: 'cpa',         label: 'CPA',              icon: Flag },
  { value: 'superiority', label: 'Supériorité',      icon: UsersIcon },
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
  icon: typeof Goal;
  /** Exige un joueur sélectionné : un but sans buteur n'a pas de sens. */
  requiresPlayer: boolean;
  tone: (c: ThemeColors) => string;
}

export const PLAYER_ACTIONS: RecorderAction[] = [
  { eventType: 'goal',            statKey: 'goals',          label: 'But',            short: 'B',     icon: Goal,           requiresPlayer: true,  tone: (c) => c.chartSeries[0] ?? c.accent.default },
  { eventType: 'shot_on_target',  statKey: 'shotsOnTarget',  label: 'Tir cadré',      short: 'T.cad', icon: Target,         requiresPlayer: false, tone: (c) => c.chartSeries[4] ?? c.accent.default },
  { eventType: 'shot',            statKey: 'shotsOffTarget', label: 'Tir non cadré',  short: 'T.nc',  icon: Circle,         requiresPlayer: false, tone: (c) => c.neutralData },
  { eventType: 'assist',          statKey: 'assists',        label: 'Passe déc.',     short: 'P.déc', icon: Share2,         requiresPlayer: false, tone: (c) => c.chartSeries[5] ?? c.accent.default },
  { eventType: 'recovery',        statKey: 'ballRecovery',   label: 'Récupération',   short: 'Récup', icon: ArrowUpCircle,  requiresPlayer: false, tone: (c) => c.positive.default },
  { eventType: 'ball_loss',       statKey: 'ballLoss',       label: 'Perte de balle', short: 'Perte', icon: ArrowDownCircle, requiresPlayer: false, tone: (c) => c.negative.default },
  { eventType: 'yellow_card',     statKey: '',               label: 'Carton jaune',   short: 'CJ',    icon: Square,         requiresPlayer: true,  tone: (c) => c.warning.default },
  { eventType: 'red_card',        statKey: '',               label: 'Carton rouge',   short: 'CR',    icon: Square,         requiresPlayer: true,  tone: (c) => c.negative.default },
];

/** Actions adverses : pas de joueur, pas de stat individuelle. */
export const OPPONENT_ACTIONS: {
  eventType: MatchEventType;
  label: string;
  short: string;
  icon: typeof Goal;
  tone: (c: ThemeColors) => string;
}[] = [
  { eventType: 'opponent_goal',            label: 'But encaissé',           short: 'But adv.',     icon: Goal,   tone: (c) => c.negative.default },
  { eventType: 'opponent_shot_on_target',  label: 'Tir cadré concédé',      short: 'Tir cad. adv.', icon: Target, tone: (c) => c.warning.default },
  { eventType: 'opponent_shot',            label: 'Tir non cadré concédé', short: 'Tir adv.',      icon: Circle, tone: (c) => c.neutralData },
];

/**
 * Colonnes du tableau de bilan. `flex` est indicatif : c'est l'écran qui décide
 * lesquelles il affiche.
 */
export interface StatColumn {
  key: string;
  label: string;
  short: string;
  kind: 'count' | 'time' | 'plusminus' | 'delta';
  tone: (c: ThemeColors) => string;
}

export const STAT_COLUMNS: StatColumn[] = [
  { key: 'goals',          label: 'Buts',            short: 'B',     kind: 'count',     tone: (c) => c.chartSeries[0] ?? c.accent.default },
  { key: 'shotsOnTarget',  label: 'Tirs cadrés',     short: 'T.cad', kind: 'count',     tone: (c) => c.chartSeries[4] ?? c.accent.default },
  { key: 'totalShots',     label: 'Tirs totaux',     short: 'T.tot', kind: 'count',     tone: (c) => c.neutralData },
  { key: 'ballRecovery',   label: 'Récupérations',   short: 'Récup', kind: 'count',     tone: (c) => c.positive.default },
  { key: 'ballLoss',       label: 'Pertes',          short: 'Perte', kind: 'count',     tone: (c) => c.negative.default },
  { key: 'assists',        label: 'Passes déc.',     short: 'P.déc', kind: 'count',     tone: (c) => c.chartSeries[5] ?? c.accent.default },
  { key: 'plusMinus',      label: '+/-',             short: '+/-',   kind: 'plusminus', tone: (c) => c.text.secondary },
  { key: 'totalTime',      label: 'Temps de jeu',    short: 'Tps',   kind: 'time',      tone: (c) => c.text.secondary },
];

/** Colonne de note live, tablette seulement (largeur téléphone déjà saturée). */
export const RATING_DELTA_COLUMN: StatColumn = {
  key: 'ratingDelta', label: 'Note, écart depuis le début', short: 'Note', kind: 'delta', tone: (c) => c.text.secondary,
};

export const ALL_STAT_COLUMNS: StatColumn[] = [...STAT_COLUMNS, RATING_DELTA_COLUMN];
export const TABLET_STAT_KEYS = [...STAT_COLUMNS.map((c) => c.key), RATING_DELTA_COLUMN.key];

export interface PlayerState {
  id: string;
  totalTime: number;
  currentSequenceTime: number;
  sequenceTimeLimit: number;
  /**
   * Temps passé sur le banc depuis la dernière sortie (ou depuis le coup
   * d'envoi pour qui n'est pas encore entré). Ne court que chrono lancé, et
   * n'est PAS remis à zéro à la mi-temps (contrairement aux séquences de
   * terrain) : la pause coupe l'effort, elle n'efface pas l'information qu'un
   * joueur n'a pas joué la première période.
   */
  benchTime: number;
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
  /** Écart de note live, `null` si gardien ou sous {@link RATING_MIN_EVENTS}. */
  ratingDelta: number | null;
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
 * Un but écrit DEUX événements : le but, et le tir cadré qui l'accompagne (un
 * but est nécessairement cadré). L'annulation doit supprimer les deux, sinon
 * le tir cadré reste orphelin en base et gonfle le rapport de match.
 */
export const PAIRED_EVENT: Partial<Record<MatchEventType, MatchEventType>> = {
  goal: 'shot_on_target',
  opponent_goal: 'opponent_shot_on_target',
};

/**
 * Terme collectif de la note : quels compteurs un événement incrémente chez
 * CHAQUE joueur présent sur le terrain à cet instant. Vivent dans
 * `PlayerState.stats`, pas dans un état à part : `stats` est déjà persisté et
 * restauré au redémarrage, un état séparé ne l'est pas et se reconstruirait
 * faux tant que l'outbox n'est pas vidée.
 */
export const COLLECTIVE_STAT: Partial<Record<MatchEventType, string>> = {
  goal: 'collGoalsFor',
  shot: 'collShotsFor',
  shot_on_target: 'collShotsFor',
  opponent_goal: 'collGoalsAgainst',
  opponent_shot: 'collShotsAgainst',
  opponent_shot_on_target: 'collShotsAgainst',
};

/**
 * Nombre d'actions individuelles en dessous duquel la note n'est pas affichée.
 * Le seuil porte sur les actions du joueur, pas sur celles qu'il a subies.
 */
export const RATING_MIN_EVENTS = 3;

/**
 * Champs de `PlayerState` réellement lus par `individualEventCount` et
 * `ratingDelta` — pris en `Pick` plutôt qu'en `PlayerState` complet pour que
 * `Player` (types.ts, la forme utilisée par l'écran) les satisfasse aussi
 * sans champ de remplissage superflu (`benchTime` n'existe pas côté web).
 */
type RatableState = Pick<PlayerState, 'stats' | 'yellowCards' | 'redCards'>;

/** Actions saisies au nom du joueur. Un but compte double (but + tir cadré). */
export function individualEventCount(st: RatableState | undefined): number {
  if (!st) return 0;
  const s = st.stats;
  return (
    (s.goals ?? 0) + (s.assists ?? 0) + (s.shotsOnTarget ?? 0) + (s.shotsOffTarget ?? 0) +
    (s.ballRecovery ?? 0) + (s.ballLoss ?? 0) + st.yellowCards + st.redCards
  );
}

/**
 * Écart de note depuis le début du match, avec l'échelle du club. Reproduit
 * `get_match_player_ratings` moins la base de 5.0 — la RPC reste la
 * référence, celle-ci n'existe que parce que les événements en cours ne sont
 * pas tous en base tant que l'outbox n'a pas été vidée.
 */
export function ratingDelta(st: RatableState | undefined, w: RatingWeights): number {
  if (!st) return 0;
  const s = st.stats;

  // Somme en millièmes entiers : en flottant, un total qui vaut 0.35 sort à
  // 0.34999999999999997 une fois sur deux selon l'ordre d'accumulation, et
  // l'arrondi au dixième bascule alors du mauvais côté.
  const milli = (count: number, weight: number) => Math.round(count * weight * 1000);

  const total =
    milli(s.goals ?? 0, w.w_goal) +
    milli(s.assists ?? 0, w.w_assist) +
    milli(s.ballRecovery ?? 0, w.w_recovery) +
    milli(s.shotsOnTarget ?? 0, w.w_shot_on_target) +
    milli(s.shotsOffTarget ?? 0, w.w_shot) +
    milli(s.ballLoss ?? 0, w.w_ball_loss) +
    milli(st.yellowCards, w.w_yellow_card) +
    milli(st.redCards, w.w_red_card) +
    milli(s.collGoalsFor ?? 0, w.cw_goal) +
    milli(s.collShotsFor ?? 0, w.cw_shot) +
    milli(s.collShotsAgainst ?? 0, w.cw_opponent_shot) +
    milli(s.collGoalsAgainst ?? 0, w.cw_opponent_goal);

  // Math.round arrondit -2.5 vers -2, là où le ROUND(numeric) de Postgres
  // s'éloigne de zéro et donne -0.3. Sans ça, une note négative pile au demi
  // dixième afficherait un dixième d'écart avec le bilan.
  const clamped = Math.min(5000, Math.max(-5000, total));
  return (Math.sign(clamped) * Math.round(Math.abs(clamped) / 100)) / 10;
}

export function emptyPlayerState(id: string, limit: number, totalTime: number): PlayerState {
  return {
    id, totalTime, currentSequenceTime: 0, sequenceTimeLimit: limit,
    benchTime: 0, yellowCards: 0, redCards: 0,
    stats: {
      shotsOnTarget: 0, shotsOffTarget: 0, goals: 0, ballLoss: 0, ballRecovery: 0, assists: 0,
      collGoalsFor: 0, collGoalsAgainst: 0, collShotsFor: 0, collShotsAgainst: 0,
    },
  };
}

export const isGoalkeeper = (position: string | null | undefined) =>
  (position ?? '').toLowerCase().startsWith('gardien');

/** Initiale du prénom + nom, uniquement pour désambiguïser un homonyme de l'effectif. */
export const playerShortName = (p: { first_name: string; last_name: string }) =>
  `${p.first_name.charAt(0)}. ${p.last_name}`;

export function playerDisplayName(
  player: { first_name: string; last_name: string },
  squad: { first_name: string; last_name: string }[]
): string {
  const key = player.last_name.toLowerCase();
  const homonym = squad.some((p) => p.last_name.toLowerCase() === key && p.first_name !== player.first_name);
  return homonym ? `${player.first_name.charAt(0)}. ${player.last_name}` : player.last_name;
}
