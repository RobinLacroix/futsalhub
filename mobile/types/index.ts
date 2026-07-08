// Types partagés avec la webapp (champs utilisés par l'app mobile)

export interface Team {
  id: string;
  name: string;
  category: string;
  level: string;
  color: string;
  club_id?: string;
}

export interface Player {
  id: string;
  first_name: string;
  last_name: string;
  birth_date?: string | null;
  position: string;
  strong_foot: string;
  status: string;
  number?: number;
  team_id?: string;
  sequence_time_limit?: number;
}

export type PlayerEventType = 'interview' | 'injury' | 'suspension' | 'feedback';

export interface PlayerEvent {
  id: string;
  player_id: string;
  event_type: PlayerEventType;
  event_date: string;
  report?: string | null;
  injury_type?: string | null;
  unavailability_days?: number | null;
  matches_suspended?: number | null;
  created_at?: string;
}

export type PlayerStatus = 'present' | 'late' | 'absent' | 'injured';

export interface Training {
  id: string;
  date: string;
  location: string;
  theme: string;
  key_principle?: string;
  attendance?: Record<string, PlayerStatus>;
  /** Joueurs convoqués pour cette séance (ceux qui voient la séance dans leur calendrier). */
  convoked_players?: { id: string }[];
  team_id?: string;
  season?: string | null; // Saison de rattachement, ex. "2025-2026"
}

export type GoalsByTypeRecord = Record<'offensive' | 'transition' | 'cpa' | 'superiority', number>;

export interface Match {
  id: string;
  title: string;
  date: string;
  location: string;
  competition: string;
  score_team: number;
  score_opponent: number;
  opponent_team?: string;
  players?: MatchPlayer[] | string;
  team_id?: string;
  goals_by_type?: GoalsByTypeRecord;
  conceded_by_type?: GoalsByTypeRecord;
  fouls_team?: number;
  fouls_opponent?: number;
  season?: string | null; // Saison de rattachement, ex. "2025-2026"
}

export interface MatchPlayer {
  id: string;
  goals?: number;
  yellow_cards?: number;
  red_cards?: number;
  time_played?: number;
}

export type MatchEventType =
  | 'goal'
  | 'shot'
  | 'shot_on_target'
  | 'recovery'
  | 'yellow_card'
  | 'red_card'
  | 'assist'
  | 'ball_loss'
  | 'opponent_goal'
  | 'opponent_shot'
  | 'opponent_shot_on_target'
  | 'substitution';

export type GoalType = 'offensive' | 'transition' | 'cpa' | 'superiority';

export interface MatchEvent {
  id: string;
  match_id: string;
  event_type: MatchEventType;
  match_time_seconds: number;
  half: 1 | 2;
  player_id?: string | null;
  players_on_field?: string[];
  goal_type?: GoalType | null;
  created_at?: string;
}

export type SharedContentType = 'youtube' | 'link';

export interface SharedContent {
  id: string;
  team_id: string;
  title: string;
  description?: string | null;
  content_type: SharedContentType;
  url: string;
  folder_id?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface SharedFolder {
  id: string;
  team_id: string;
  name: string;
  parent_id: string | null;
  created_by?: string | null;
  created_at: string;
}
