// Types centralisés pour toute l'application

// ==================== ÉQUIPES ====================
export interface Team {
  id: string;
  name: string;
  category: string;
  level: string;
  color: string;
  created_at?: string;
  updated_at?: string;
}

// ==================== JOUEURS ====================
export interface Player {
  id: string;
  first_name: string;
  last_name: string;
  age: number;
  position: string;
  strong_foot: string;
  status: string;
  number?: number;
  sequence_time_limit?: number;
  team_id?: string;
  matches_played?: number;
  goals?: number;
  training_attendance?: number;
  attendance_percentage?: number;
  victories?: number;
  draws?: number;
  defeats?: number;
  yellow_cards?: number;
  red_cards?: number;
}

export interface PlayerFormData {
  first_name: string;
  last_name: string;
  age: string;
  position: string;
  strong_foot: string;
  status: string;
  number: string;
  sequence_time_limit: string;
  selectedTeams: string[];
}

export type PlayerStatus = 'present' | 'absent' | 'injured';

// ==================== MATCHS ====================
export interface Match {
  id: string;
  title: string;
  date: string | Date;
  location: string;
  competition: string;
  score_team: number;
  score_opponent: number;
  opponent_team?: string;
  players?: PlayerInMatch[] | string; // JSON string ou array
  goals_by_type?: {
    offensive: number;
    transition: number;
    cpa: number;
    superiority: number;
  };
  conceded_by_type?: {
    offensive: number;
    transition: number;
    cpa: number;
    superiority: number;
  };
  team_id?: string;
  created_at?: string;
}

export interface PlayerInMatch {
  id: string;
  goals?: number;
  yellow_cards?: number;
  red_cards?: number;
  [key: string]: any;
}

export interface MatchFormData {
  title: string;
  date: Date;
  location: 'Domicile' | 'Exterieur';
  competition: 'Championnat' | 'Coupe' | 'Amical';
  score_team: number;
  score_opponent: number;
  opponent_team?: string;
  players: {
    [key: string]: {
      id: string;
      present: boolean;
      goals: number;
      yellow_cards: number;
      red_cards: number;
    };
  };
  goals_by_type: {
    offensive: number;
    transition: number;
    cpa: number;
    superiority: number;
  };
  conceded_by_type: {
    offensive: number;
    transition: number;
    cpa: number;
    superiority: number;
  };
}

export interface MatchStats {
  id: string;
  title: string;
  date: string;
  goals_scored: number;
  goals_conceded: number;
  result: 'Victoire' | 'Nul' | 'Défaite';
  location: 'Domicile' | 'Exterieur';
  goals_by_type: {
    offensive: number;
    transition: number;
    cpa: number;
    superiority: number;
  };
  conceded_by_type: {
    offensive: number;
    transition: number;
    cpa: number;
    superiority: number;
  };
}

// ==================== ENTRAÎNEMENTS ====================
export interface Training {
  id: string;
  date: string | Date;
  location: string;
  theme: string;
  key_principle?: string;
  attendance?: Record<string, PlayerStatus>; // JSONB: { player_id: 'present' | 'absent' | 'injured' }
  team_id?: string;
  created_at?: string;
}

export type TrainingTheme = 'Offensif' | 'Défensif' | 'Transition' | 'Supériorité' | 'Defensif' | 'CPA';

export interface TrainingFormData {
  date: Date;
  location: string;
  theme: TrainingTheme;
  key_principle: string;
  players: {
    [key: string]: {
      id: string;
      status: PlayerStatus;
    };
  };
}

export interface TrainingStats {
  date: string;
  attendance: number;
  present?: number;
  absent?: number;
  injured?: number;
  theme: string;
}

// ==================== ÉVÉNEMENTS DE MATCH ====================
export interface MatchEvent {
  id: string;
  match_id: string;
  event_type: string;
  match_time_seconds: number;
  half: number;
  player_id?: string | null;
  players_on_field?: string[];
  event_location?: string;
  team_id?: string;
  created_at?: string;
}

// ==================== STATISTIQUES ====================
export interface ChartData {
  name: string;
  value: number;
}

export interface PlayerAttendanceStats {
  player_id: string;
  total_sessions: number;
  present_count: number;
  absent_count: number;
  injured_count: number;
  attendance_rate: number;
  present_percentage: number;
  absent_percentage: number;
  injured_percentage: number;
  absent_cumulative: number;
  injured_cumulative: number;
}

// ==================== FILTRES ====================
export interface PlayerFilterState {
  position: string;
  strongFoot: string;
  status: string;
  selectedPlayers: string[];
}

export interface PerformanceFilterState {
  matchLocationFilter: 'Tous' | 'Domicile' | 'Exterieur';
  selectedMatches: string[];
}

export interface SquadFilterState {
  name: string;
  age: string;
  position: string;
  strongFoot: string;
  status: string;
}

// ==================== CALENDRIER ====================
export type CalendarEventType = 'match' | 'training';

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  type: CalendarEventType;
  resource?: Match | Training;
}

// ==================== TRACKER DE MATCH ====================
export interface MatchTrackerPlayer {
  id: string;
  name: string;
  number: number;
  position: string;
  isStarter: boolean;
  isOnField: boolean;
  totalTime: number;
  currentSequenceTime: number;
  sequenceTimeLimit: number;
  yellowCards: number;
  redCards: number;
  stats: {
    shotsOnTarget: number;
    shotsOffTarget: number;
    goals: number;
    ballLoss: number;
    ballRecovery: number;
    dribbleSuccess: number;
    oneOnOneDefLost: number;
    [key: string]: number;
  };
}

export interface MatchTrackerData {
  selectedMatch: Match | null;
  isRunning: boolean;
  currentSequence: number;
  players: MatchTrackerPlayer[];
  teamScore: number;
  opponentScore: number;
  matchTime: number; // en secondes
  currentHalf: 1 | 2;
  teamFouls: number;
  opponentFouls: number;
  opponentActions: {
    shotsOnTarget: number;
    shotsOffTarget: number;
  };
  firstHalfOpponentActions: {
    shotsOnTarget: number;
    shotsOffTarget: number;
  };
}

export interface LocalMatchEvent {
  id: string;
  match_id: string;
  event_type: string;
  match_time_seconds: number;
  half: number;
  player_id: string | null;
  players_on_field: string[];
  created_at: string;
}



