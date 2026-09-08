// Types partagés avec la webapp (champs utilisés par l'app mobile)

export interface Team {
  id: string;
  name: string;
  category: string;
  level: string;
  color: string;
  club_id?: string;
  /** Délai de prévenance (minutes) avant qu'un joueur ne puisse plus se déclarer absent lui-même. */
  absence_notice_minutes?: number;
  /** Délai de prévenance (minutes) avant qu'un joueur ne puisse plus se déclarer présent/en retard/blessé lui-même. */
  late_notice_minutes?: number;
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
  phone?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  /**
   * Compte utilisateur relié à la fiche, `null` tant que le joueur n'a pas
   * saisi son code de liaison. La colonne revenait déjà des `select('*')`, elle
   * n'était simplement pas déclarée ici.
   */
  user_id?: string | null;
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

// ─── Douleurs (body-map) ─────────────────────────────────────────────────────
export interface PainReportZone {
  zone: string;
  side: 'L' | 'R' | 'C';
  intensity: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  mode: 'zone' | 'articulation';
}

export interface PainReportGroup {
  report_group: string;
  reported_at: string;
  source: 'questionnaire' | 'spontane';
  max_intensity: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  note: string | null;
  onset: 'aigu' | 'chronique' | null;
  training_id: string | null;
  match_id: string | null;
  zones: PainReportZone[];
}

/** Même soumission, vue club (onglet Infirmerie) : le joueur voyage avec. */
export interface ClubPainReportGroup extends PainReportGroup {
  player_id: string;
  first_name: string;
  last_name: string;
  number: number | null;
}

export interface TeamFeedPostTag {
  player_id: string;
  first_name: string;
  last_name: string;
}

export type TeamFeedPostType = 'manual' | 'birthday' | 'convocation' | 'planning' | 'video';

/** 1 ligne du fil d'équipe, telle que renvoyée par get_team_feed. */
export interface TeamFeedPost {
  id: string;
  team_id: string;
  author_user_id: string;
  author_name: string;
  content: string;
  post_type: TeamFeedPostType;
  /** Route in-app (convocation/planning) ou URL externe (vidéo). Null pour manual/birthday. */
  link_url: string | null;
  created_at: string;
  edited_at: string | null;
  comment_count: number;
  tags: TeamFeedPostTag[];
}

/** 1 commentaire, tel que renvoyé par get_post_comments. */
export interface TeamFeedComment {
  id: string;
  post_id: string;
  author_user_id: string;
  author_name: string;
  content: string;
  created_at: string;
  edited_at: string | null;
}

export interface Training {
  id: string;
  date: string;
  location: string;
  theme: string;
  key_principle?: string;
  attendance?: Record<string, PlayerStatus>;
  /** Pertinent seulement quand attendance[playerId] est 'absent' ou 'late'. Absence de clé = non prévenu. */
  attendance_excused?: Record<string, boolean>;
  /** Joueurs convoqués pour cette séance (ceux qui voient la séance dans leur calendrier). */
  convoked_players?: { id: string }[];
  team_id?: string;
  season?: string | null; // Saison de rattachement, ex. "2025-2026"
  session_duration?: number | null; // minutes, 45-150
  target_rpe_min?: number | null; // RPE cible, borne basse (1-10)
  target_rpe_max?: number | null; // RPE cible, borne haute (1-10)
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
  coach_evaluation?: CoachEvaluation | null; // Évaluation qualitative coach (Volet A), NULL si non évalué
  venue_address?: string | null;
  meeting_time?: string | null;
  convocation_message?: string | null;
}

// ==================== ÉVALUATION DE MATCH ====================
// Spec : livrables/futsalhub/SPEC_EVALUATION_MATCH_2026-07.md
// Volet A : évaluation qualitative du match par le coach (5 niveaux).
export type CoachEvaluation = 'bad' | 'poor' | 'neutral' | 'good' | 'great';

// Volet B : note data /10 d'un joueur de champ pour un match (calculée en RPC).
export interface MatchPlayerRating {
  player_id: string;
  player_name: string;
  rating: number; // [0.0 ; 10.0], 1 décimale
  indiv_pts: number;
  coll_pts: number;
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
  is_custom: boolean;
}

// Volet C : note staff /10 par joueur et par match, saisie manuelle coach.
// Strictement staff-only (table dédiée + RLS, jamais exposée au joueur).
export interface MatchPlayerCoachNote {
  match_id: string;
  player_id: string;
  note: number; // [0.5 ; 10.0], par pas de 0.5
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

export interface MatchPlayer {
  id: string;
  goals?: number;
  assists?: number;
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

export type SharedContentType = 'youtube' | 'link' | 'file';

export interface SharedContent {
  id: string;
  club_id: string;
  /** null = partagé à toutes les équipes du club (réservé aux admins) */
  team_id: string | null;
  title: string;
  description?: string | null;
  content_type: SharedContentType;
  url: string | null;
  file_path?: string | null;
  file_size_bytes?: number | null;
  file_mime_type?: string | null;
  folder_id?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface SharedFolder {
  id: string;
  club_id: string;
  /** null = dossier au niveau du club, visible par toutes les équipes */
  team_id: string | null;
  name: string;
  parent_id: string | null;
  created_by?: string | null;
  created_at: string;
}
