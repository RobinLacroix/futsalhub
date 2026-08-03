/**
 * Noyau partagé des match recorders (P1-3)
 *
 * `PhoneMatchRecorder` et `TabletMatchRecorder` importent d'ici, jamais un
 * fichier directement : les deux écrans doivent rester deux mises en forme
 * d'un même modèle, pas deux applications qui se ressemblent.
 */

export { useMatchRecorder } from './useMatchRecorder';
export type { MatchRecorder, GoalTypeTally, RecordedAction } from './useMatchRecorder';

export {
  HALF_DURATION_SEC,
  DEFAULT_SEQUENCE_LIMIT,
  FIELD_SIZE,
  FOUL_LIMIT,
  GOAL_TYPES,
  PLAYER_ACTIONS,
  OPPONENT_ACTIONS,
  STAT_COLUMNS,
  EVENT_TO_STAT,
  PAIRED_EVENT,
  emptyPlayerState,
  isGoalkeeper,
} from './recorderModel';
export type {
  RecorderAction,
  StatColumn,
  PlayerState,
  StatRow,
  IoniconName,
} from './recorderModel';

export { ClockBar, FoulRow, OpponentBar, VoiceButton, SyncBadge, VoiceOverlay } from './RecorderChrome';
export { PlayerFieldCard } from './PlayerFieldCard';
export { PlayerActionCard, BenchCard } from './PlayerActionCard';
export { ActionPad } from './ActionPad';
export { SubstitutionSheet, GoalTypeSheet, ScoreSheet, PlayerPicker } from './RecorderSheets';
export { StatsTable, ScrollableStatsTable } from './StatsTable';
export { MatchPicker } from './MatchPicker';
