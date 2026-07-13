// Types propres à l'écran Match Recorder (view-models, distincts des types DB de @/types).

export interface Player {
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
    assists: number;
    oneOnOneDefLost: number;
    [key: string]: number;
  };
}

export interface Match {
  id: string;
  title: string;
  date: string;
  competition: string;
  location?: string;
  score_team?: number;
  score_opponent?: number;
  opponent_team?: string;
}

export interface MatchData {
  selectedMatch: Match | null;
  isRunning: boolean;
  currentSequence: number;
  players: Player[];
  teamScore: number;
  opponentScore: number;
  matchTime: number; // en secondes
  currentHalf: 1 | 2; // 1 = première mi-temps, 2 = deuxième mi-temps
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
  synced?: boolean;
}

export interface LocalMatchSnapshot {
  match_id: string;
  timestamp: string;
  matchData: MatchData;
  events: LocalMatchEvent[];
  lastSavedAt: string;
}

// Statistiques d'équipe agrégées (retour de getTeamStats).
export interface TeamStats {
  totalShots: number;
  totalShotsOnTarget: number;
  totalShotsOffTarget: number;
  opponentShots: number;
  opponentShotsOnTarget: number;
  opponentShotsOffTarget: number;
}
