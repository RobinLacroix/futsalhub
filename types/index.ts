// Types centralisés pour toute l'application

// ==================== CLUBS ====================
export interface Club {
  id: string;
  name: string;
  description?: string;
  logo_url?: string;
  current_season?: string | null; // Saison active du club, ex. "2025-2026"
  created_at?: string;
  updated_at?: string;
}

export type ClubMemberRole = 'admin' | 'coach' | 'viewer';

export interface ClubMember {
  id: string;
  user_id: string;
  club_id: string;
  role: ClubMemberRole;
  team_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ==================== ÉQUIPES ====================
export interface Team {
  id: string;
  name: string;
  category: string;
  level: string;
  color: string;
  club_id?: string;
  created_at?: string;
  updated_at?: string;
}

// ==================== JOUEURS ====================
export interface Player {
  id: string;
  first_name: string;
  last_name: string;
  birth_date?: string | null;
  position: string;
  strong_foot: string;
  status: string;
  number?: number;
  sequence_time_limit?: number;
  team_id?: string; // Le club est hérité via team_id -> teams.club_id
  user_id?: string | null; // Compte utilisateur pour l'accès espace joueur
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
  birth_date: string;
  position: string;
  strong_foot: string;
  status: string;
  number: string;
  sequence_time_limit: string;
  selectedTeams: string[];
}

// Statut de présence à l'entraînement
// - present : présent à l'heure
// - late    : présent mais en retard
// - absent  : non présent
// - injured : blessé (ne peut pas participer)
export type PlayerStatus = 'present' | 'late' | 'absent' | 'injured';

export type PlayerEventType = 'interview' | 'injury' | 'suspension' | 'feedback';

export interface PlayerEvent {
  id: string;
  player_id: string;
  event_type: PlayerEventType;
  event_date: string;
  created_at?: string;
  updated_at?: string;
  report?: string | null;
  injury_type?: string | null;
  unavailability_days?: number | null;
  matches_suspended?: number | null;
}

// ==================== DOULEURS (body-map) ====================
// Historique staff : une entrée = une soumission (report_group), regroupant N zones.
export interface PainReportZone {
  zone: string;                       // id de zone (cf. lib/painMap.ts)
  side: 'L' | 'R' | 'C';
  intensity: 1 | 2 | 3;
  mode: 'zone' | 'articulation';
}

export interface PainReportGroup {
  report_group: string;
  reported_at: string;
  source: 'questionnaire' | 'spontane';
  max_intensity: 1 | 2 | 3;
  note: string | null;
  onset: 'aigu' | 'chronique' | null;
  training_id: string | null;
  zones: PainReportZone[];
}

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
  team_id?: string; // Le club est hérité via team_id -> teams.club_id
  season?: string | null; // Saison de rattachement, ex. "2025-2026"
  coach_evaluation?: CoachEvaluation | null; // Évaluation qualitative coach (Volet A), NULL si non évalué
  created_at?: string;
}

// ==================== ÉVALUATION DE MATCH ====================
// Volet A : évaluation qualitative du match par le coach (5 niveaux).
// Spec : livrables/futsalhub/SPEC_EVALUATION_MATCH_2026-07.md
export type CoachEvaluation = 'bad' | 'poor' | 'neutral' | 'good' | 'great';

// Volet B : note data /10 d'un joueur de champ pour un match (calculée en RPC).
export interface MatchPlayerRating {
  player_id: string;
  player_name: string;
  rating: number; // [0.0 ; 10.0], 1 décimale
  indiv_pts: number; // apport composante individuelle (info/debug)
  coll_pts: number; // apport composante collective (info/debug)
}

// Ligne d'une note par (match, joueur), pour l'agrégation analytics et la courbe page joueur.
export interface MatchPlayerRatingRow extends MatchPlayerRating {
  match_id: string;
  match_date: string;
}

// Échelle de notation personnalisable (par club). Poids individuels (w_*) et collectifs (cw_*).
export interface RatingWeights {
  w_goal: number;
  w_assist: number;
  w_recovery: number;
  w_shot_on_target: number;
  w_shot: number;
  w_ball_loss: number;
  w_yellow_card: number;
  w_red_card: number;
  cw_goal: number;
  cw_shot: number;
  cw_opponent_shot: number;
  cw_opponent_goal: number;
}

export interface RatingWeightsResult extends RatingWeights {
  is_custom: boolean; // true si le club a une échelle personnalisée (sinon défauts)
}

// Échelle par défaut (miroir des DEFAULT de la table match_rating_weights).
export const DEFAULT_RATING_WEIGHTS: RatingWeights = {
  w_goal: 0.8,
  w_assist: 0.4,
  w_recovery: 0.3,
  w_shot_on_target: 0.1,
  w_shot: 0.05,
  w_ball_loss: -0.3,
  w_yellow_card: -0.2,
  w_red_card: -0.7,
  cw_goal: 0.2,
  cw_shot: 0.05,
  cw_opponent_shot: -0.05,
  cw_opponent_goal: -0.2,
};

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
  team_id?: string; // Le club est hérité via team_id -> teams.club_id
  season?: string | null; // Saison de rattachement, ex. "2025-2026"
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
  team_id?: string; // Le club est hérité via match_id -> matches.team_id -> teams.club_id
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
  late_count: number;
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
    assists: number;
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

// ==================== CONTENU PARTAGÉ ====================
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




