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

import type { MatchEventType, RatingWeights } from '../../types';
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

/**
 * Ordre d'affichage sur les cartes tablette, en trois paires : l'issue
 * (but / passe décisive), la tentative (cadrée / non cadrée), la possession
 * (récupération / perte). Chaque rangée oppose deux actions de même nature,
 * donc le geste se choisit par la ligne puis par le côté.
 *
 * C'est l'ordre voulu par Robin, et il ne suit pas celui de `PLAYER_ACTIONS` :
 * ce dernier sert au téléphone, où la grille est un flux de huit cases.
 */
export const CARD_ACTION_ORDER = [
  'goal',
  'assist',
  'shot_on_target',
  'shot',
  'recovery',
  'ball_loss',
] as const;

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
  kind: 'count' | 'time' | 'plusminus' | 'delta';
  tone: (c: ThemeColors) => string;
}

export const STAT_COLUMNS: StatColumn[] = [
  // Note : la colonne de note live (`ratingDelta`) n'est PAS ici. Elle est
  // tablette seulement, donc opt-in explicite via `TABLET_STAT_KEYS`.
  { key: 'goals', label: 'Buts', short: 'B', kind: 'count', tone: (c) => c.chartSeries[0] ?? c.accent.default },
  { key: 'shotsOnTarget', label: 'Tirs cadrés', short: 'T.cad', kind: 'count', tone: (c) => c.chartSeries[4] ?? c.accent.default },
  { key: 'totalShots', label: 'Tirs totaux', short: 'T.tot', kind: 'count', tone: (c) => c.neutralData },
  { key: 'ballRecovery', label: 'Récupérations', short: 'Récup', kind: 'count', tone: (c) => c.positive.default },
  { key: 'ballLoss', label: 'Pertes', short: 'Perte', kind: 'count', tone: (c) => c.negative.default },
  { key: 'assists', label: 'Passes déc.', short: 'P.déc', kind: 'count', tone: (c) => c.chartSeries[5] ?? c.accent.default },
  { key: 'plusMinus', label: '+/-', short: '+/-', kind: 'plusminus', tone: (c) => c.text.secondary },
  { key: 'totalTime', label: 'Temps de jeu', short: 'Tps', kind: 'time', tone: (c) => c.text.secondary },
];

/**
 * Colonne de note live. Séparée de {@link STAT_COLUMNS} pour rester tablette
 * seulement : le téléphone rend le même tableau et sa largeur est déjà saturée.
 */
export const RATING_DELTA_COLUMN: StatColumn = {
  key: 'ratingDelta',
  label: 'Note, écart depuis le début',
  short: 'Note',
  kind: 'delta',
  tone: (c) => c.text.secondary,
};

/** Toutes les colonnes résolvables par clé, y compris celles hors défaut. */
export const ALL_STAT_COLUMNS: StatColumn[] = [...STAT_COLUMNS, RATING_DELTA_COLUMN];

/** Colonnes du bilan tablette : le jeu complet plus la note live. */
export const TABLET_STAT_KEYS = [...STAT_COLUMNS.map((c) => c.key), RATING_DELTA_COLUMN.key];

export interface PlayerState {
  id: string;
  totalTime: number;
  currentSequenceTime: number;
  sequenceTimeLimit: number;
  /**
   * Temps passé sur le banc depuis la dernière sortie, ou depuis le coup
   * d'envoi pour qui n'est pas encore entré. Symétrique de
   * `currentSequenceTime`, et comme lui il ne court que chrono lancé : une
   * mi-temps ou un temps mort ne sont pas de l'attente.
   *
   * Volontairement NON remis à zéro à la mi-temps, contrairement aux séquences
   * de terrain. `resetSequences` remet tout le monde à égalité sur le terrain
   * parce que la pause coupe l'effort ; sur le banc elle effacerait justement
   * l'information qu'on cherche, à savoir que ce joueur n'a pas joué de la
   * première période.
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
 * Un but écrit DEUX événements : le but, et le tir cadré qui l'accompagne
 * (un but est nécessairement cadré). L'annulation doit donc supprimer les deux,
 * sinon le tir cadré reste orphelin en base et gonfle le rapport de match.
 */
export const PAIRED_EVENT: Partial<Record<MatchEventType, MatchEventType>> = {
  goal: 'shot_on_target',
  opponent_goal: 'opponent_shot_on_target',
};

/**
 * Terme collectif de la note : quels compteurs un événement incrémente chez
 * CHAQUE joueur présent sur le terrain à cet instant.
 *
 * Ces quatre compteurs vivent dans `PlayerState.stats` et non dans un état à
 * part, pour une raison précise : `stats` est déjà persisté par
 * `saveRecorderState` et restauré au redémarrage. Un état séparé (comme
 * `plusMinusByPlayer`) ne l'est pas et se reconstruit depuis la base — donc
 * faux quand des événements sont encore dans l'outbox, ce qui est le cas normal
 * en gymnase.
 *
 * Les quatre poids sont distincts (`cw_goal` ≠ -`cw_opponent_goal` si le club a
 * personnalisé son échelle), donc on compte séparément le pour et le contre au
 * lieu de réutiliser le +/- qui est un solde.
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
 *
 * Tout le monde part de la même base : après cinq minutes, l'écart tient dans
 * le bruit et le terme collectif est presque identique pour deux joueurs entrés
 * ensemble (cf. spec §8). Afficher une décimale sur si peu de matière lui donne
 * une autorité qu'elle n'a pas, et pousse à coacher le chiffre.
 *
 * Le seuil porte sur les actions du joueur, pas sur celles qu'il a subies : un
 * joueur qui n'a rien fait mais qui était sur le terrain sur deux buts encaissés
 * afficherait un écart négatif qui ne dit rien de lui.
 */
export const RATING_MIN_EVENTS = 3;

/** Actions saisies au nom du joueur. Un but compte double (but + tir cadré). */
export function individualEventCount(st: PlayerState | undefined): number {
  if (!st) return 0;
  const s = st.stats;
  return (
    (s.goals ?? 0) +
    (s.assists ?? 0) +
    (s.shotsOnTarget ?? 0) +
    (s.shotsOffTarget ?? 0) +
    (s.ballRecovery ?? 0) +
    (s.ballLoss ?? 0) +
    st.yellowCards +
    st.redCards
  );
}

/**
 * Écart de note depuis le début du match, avec l'échelle du club.
 *
 * Reproduit `get_match_player_ratings` (spec §11.3) moins la base de 5.0 : la
 * RPC reste la référence, celle-ci n'existe que parce que les événements du
 * match en cours ne sont pas tous en base tant que l'outbox n'a pas été vidée.
 * Les poids viennent du serveur, seule l'arithmétique est locale.
 *
 * Borné à ±5 comme la note l'est à [0 ; 10] (D3), pour que l'écart affiché en
 * direct corresponde toujours à celui que donnera le bilan.
 */
export function ratingDelta(st: PlayerState | undefined, w: RatingWeights): number {
  if (!st) return 0;
  const s = st.stats;

  /**
   * Somme en millièmes entiers, et pas en flottants.
   *
   * La RPC calcule en `numeric`, donc en décimal exact. En `number`, un total
   * qui vaut 0.35 sort à 0.34999999999999997 une fois sur deux selon l'ordre
   * d'accumulation, et l'arrondi au dixième bascule alors du mauvais côté : la
   * note live affichait +0.3 là où le bilan affiche +0.4. Vérifié sur un match
   * simulé, deux joueurs sur cinq touchés.
   */
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

  // `Math.round` arrondit -2.5 vers -2, là où le `ROUND(numeric)` de Postgres
  // s'éloigne de zéro et donne -0.3. Sans ça, une note négative pile au demi
  // dixième afficherait un dixième d'écart avec le bilan, sur le seul cas où le
  // coach irait vérifier.
  const clamped = Math.min(5000, Math.max(-5000, total));
  return (Math.sign(clamped) * Math.round(Math.abs(clamped) / 100)) / 10;
}

export function emptyPlayerState(id: string, limit: number, totalTime: number): PlayerState {
  return {
    id,
    totalTime,
    currentSequenceTime: 0,
    sequenceTimeLimit: limit,
    benchTime: 0,
    yellowCards: 0,
    redCards: 0,
    stats: {
      shotsOnTarget: 0,
      shotsOffTarget: 0,
      goals: 0,
      ballLoss: 0,
      ballRecovery: 0,
      assists: 0,
      collGoalsFor: 0,
      collGoalsAgainst: 0,
      collShotsFor: 0,
      collShotsAgainst: 0,
    },
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
/** Initiale du prénom + nom. Toujours, sans condition. */
export const playerShortName = (p: { first_name: string; last_name: string }) =>
  `${p.first_name.charAt(0)}. ${p.last_name}`;

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
