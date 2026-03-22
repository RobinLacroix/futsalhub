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
  age: number;
  position: string;
  strong_foot: string;
  status: string;
  number?: number;
  team_id?: string;
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
  | 'dribble'
  | 'ball_loss'
  | 'opponent_goal'
  | 'opponent_shot'
  | 'opponent_shot_on_target';

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
