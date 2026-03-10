// Types partagés avec la webapp (champs utilisés par l'app mobile)

export interface Team {
  id: string;
  name: string;
  category: string;
  level: string;
  color: string;
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
}

export interface MatchPlayer {
  id: string;
  goals?: number;
  yellow_cards?: number;
  red_cards?: number;
}
