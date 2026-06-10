/** Types partagés pour update match (évite les imports circulaires matches ↔ outbox). */

export type GoalsByType = Record<'offensive' | 'transition' | 'cpa' | 'superiority', number>;

export interface UpdateMatchInput {
  title?: string;
  /** ISO 8601 (ex. depuis Date.toISOString()) */
  date?: string;
  convoquedPlayerIds?: string[];
  score_team?: number;
  score_opponent?: number;
  playerStats?: Record<string, { goals: number; yellow_cards: number; red_cards: number; time_played?: number }>;
  goals_by_type?: GoalsByType;
  conceded_by_type?: GoalsByType;
}
