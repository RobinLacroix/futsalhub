/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Calendar as ReactBigCalendar, momentLocalizer } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { format } from 'date-fns';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { schematicsService, type SchematicData } from '@/lib/services/schematicsService';
import { createTokensForTraining, getFeedbackLinksForTraining } from '@/lib/services/trainingFeedbackService';
import { SchematicPreview } from '../../library/components/SchematicPreview';
import {
  X,
  AlertCircle,
  Dumbbell,
  Trophy,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
  Layout,
  ExternalLink,
  Search,
  Filter
} from 'lucide-react';
import { DurationSlider } from './components/DurationSlider';

// Types
interface Player {
  id: string;
  first_name: string;
  last_name: string;
  stats?: {
    matches_played: number;
    goals: number;
    yellow_cards: number;
    red_cards: number;
  };
}

interface Match {
  id: string;
  title: string;
  date: Date;
  location: string;
  competition: string;
  score_team: number;
  score_opponent: number;
  opponent_team?: string;
  players: {
    id: string;
    goals: number;
    yellow_cards: number;
    red_cards: number;
  }[];
  type: 'match';
}

type PlayerStatus = 'present' | 'late' | 'absent' | 'injured';

interface Training {
  id: string;
  date: Date;
  location: string;
  theme: string;
  key_principle: string;
  players: {
    id: string;
    status: PlayerStatus;
  }[];
  type: 'training';
}

type CalendarEvent = Match | Training;

interface PlayerFormData {
  id: string;
  present: boolean;
  goals: number;
  yellow_cards: number;
  red_cards: number;
}

type CompetitionType = 'Championnat' | 'Coupe' | 'Amical';

type LocationType = 'Domicile' | 'Exterieur';

interface MatchFormData {
  title: string;
  date: Date;
  location: LocationType;
  competition: CompetitionType;
  score_team: number;
  score_opponent: number;
  opponent_team?: string;
  players: {
    [key: string]: PlayerFormData;
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

type TrainingTheme = 'Offensif' | 'Défensif' | 'Transition' | 'Supériorité';

interface SessionPart {
  id: string;
  type: 'Echauffement' | 'Exercice' | 'Situation' | 'Jeu';
  duration: number; // en minutes
  procedureId?: string | null;
}

interface TrainingFormData {
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
  // Page 2
  sessionDuration?: number; // durée totale en minutes
  sessionParts?: SessionPart[]; // organisation de la séance
}

interface TrainingStats {
  date: string;
  attendance: number;
  theme: string;
}

interface MatchStats {
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



// Schéma de validation
const matchSchema = yup.object().shape({
  title: yup.string().required('Le titre est requis'),
  date: yup.date().required('La date est requise'),
  location: yup.string().oneOf(['Domicile', 'Exterieur'] as const, 'Veuillez sélectionner un lieu').required('Le lieu est requis'),
  competition: yup.string().oneOf(['Championnat', 'Coupe', 'Amical'] as const, 'Veuillez sélectionner un type de compétition').required('Le type de compétition est requis'),
  score_team: yup.number().min(0).required('Le score de l\'équipe est requis'),
  score_opponent: yup.number().min(0).required('Le score de l\'adversaire est requis'),
  opponent_team: yup.string().optional(),
  players: yup.object().optional(),
  goals_by_type: yup.object().shape({
    offensive: yup.number().min(0).default(0),
    transition: yup.number().min(0).default(0),
    cpa: yup.number().min(0).default(0),
    superiority: yup.number().min(0).default(0)
  }).required(),
  conceded_by_type: yup.object().shape({
    offensive: yup.number().min(0).default(0),
    transition: yup.number().min(0).default(0),
    cpa: yup.number().min(0).default(0),
    superiority: yup.number().min(0).default(0)
  }).required()
});

// Schéma de validation pour l'entraînement
const trainingSchema = yup.object().shape({
  date: yup.date().required('La date est requise'),
  location: yup.string().required('Le lieu est requis'),
  theme: yup.string().oneOf(['Offensif', 'Défensif', 'Transition', 'Supériorité'] as const, 'Veuillez sélectionner un thème').required('Le thème est requis'),
  key_principle: yup.string().required('Le principe clé est requis'),
  players: yup.object().test(
    'at-least-one-player',
    'Au moins un joueur doit être sélectionné',
    (value) => {
      if (!value) return false;
      return Object.values(value).some(player => 
        player &&
        typeof player === 'object' &&
        'status' in player &&
        (player.status === 'present' || player.status === 'late')
      );
    }
  ),
  sessionDuration: yup.number().min(45).max(150).optional(),
  sessionParts: yup.array().optional()
});

const localizer = momentLocalizer(moment);

type RBCalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  type: 'match' | 'training';
  raw: Match | Training;
};

const DragAndDropCalendar = withDragAndDrop<RBCalendarEvent>(ReactBigCalendar);

export default function CalendarPage() {
  const router = useRouter();
  const { activeTeam } = useActiveTeam();
  const [matches, setMatches] = useState<Match[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTrainingModalOpen, setIsTrainingModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [success, setSuccess] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [trainingStats, setTrainingStats] = useState<TrainingStats[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStats[]>([]);
  const [matchLocationFilter, setMatchLocationFilter] = useState<'Tous' | 'Domicile' | 'Exterieur'>('Tous');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isMobile, setIsMobile] = useState(false);
  
  // État pour la pagination du formulaire d'entraînement
  const [trainingFormPage, setTrainingFormPage] = useState(1);
  const [availableProcedures, setAvailableProcedures] = useState<any[]>([]);
  const [selectedProcedureForPart, setSelectedProcedureForPart] = useState<{ partId: string; procedureId: string | null } | null>(null);
  const [draggedPartId, setDraggedPartId] = useState<string | null>(null);
  const [viewingProcedure, setViewingProcedure] = useState<any | null>(null);
  const [procedureDetailSchematic, setProcedureDetailSchematic] = useState<any | null>(null);
  const [procedureSearchTerm, setProcedureSearchTerm] = useState('');
  const [procedureFilterTheme, setProcedureFilterTheme] = useState<string | null>(null);
  const [feedbackLinks, setFeedbackLinks] = useState<{ player_name: string; url: string }[]>([]);
  const [feedbackLinksLoading, setFeedbackLinksLoading] = useState(false);
  const [feedbackLinksGenerating, setFeedbackLinksGenerating] = useState(false);



  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<MatchFormData>({
    resolver: yupResolver(matchSchema) as any,
    defaultValues: {
      title: '',
      date: new Date(),
      location: 'Domicile',
      competition: 'Championnat',
      score_team: 0,
      score_opponent: 0,
      opponent_team: '',
      players: {},
      goals_by_type: {
        offensive: 0,
        transition: 0,
        cpa: 0,
        superiority: 0
      },
      conceded_by_type: {
        offensive: 0,
        transition: 0,
        cpa: 0,
        superiority: 0
      }
    }
  });

  const { control: trainingControl, handleSubmit: handleTrainingSubmit, reset: resetTraining, watch: watchTraining, setValue: setTrainingValue, formState: { errors: trainingErrors } } = useForm<TrainingFormData>({
    resolver: yupResolver(trainingSchema),
    defaultValues: {
      date: new Date(),
      location: '',
      theme: 'Offensif',
      key_principle: '',
      players: {},
      sessionDuration: 60,
      sessionParts: [] // Ne pas préremplir - l'utilisateur créera sa propre organisation
    }
  });

  // Charger les procédés depuis la librairie
  useEffect(() => {
    const fetchProcedures = async () => {
      try {
        const { data, error } = await supabase
          .from('training_procedures')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        setAvailableProcedures(data || []);
      } catch (err) {
        console.error('Erreur lors du chargement des procédés:', err);
      }
    };
    
    if (isTrainingModalOpen) {
      fetchProcedures();
    }
  }, [isTrainingModalOpen]);

  useEffect(() => {
    if (!isTrainingModalOpen || !isEditing || editingEvent?.type !== 'training' || !editingEvent?.id) {
      setFeedbackLinks([]);
      return;
    }
    let cancelled = false;
    setFeedbackLinksLoading(true);
    getFeedbackLinksForTraining(editingEvent.id)
      .then(links => {
        if (!cancelled) setFeedbackLinks(links.map(l => ({ player_name: l.player_name, url: l.url })));
      })
      .catch(() => { if (!cancelled) setFeedbackLinks([]); })
      .finally(() => { if (!cancelled) setFeedbackLinksLoading(false); });
    return () => { cancelled = true; };
  }, [isTrainingModalOpen, isEditing, editingEvent?.id, editingEvent?.type]);

  const refreshFeedbackLinks = async () => {
    if (!editingEvent || editingEvent.type !== 'training' || !editingEvent.id) return;
    setFeedbackLinksLoading(true);
    try {
      const links = await getFeedbackLinksForTraining(editingEvent.id);
      setFeedbackLinks(links.map(l => ({ player_name: l.player_name, url: l.url })));
    } catch {
      setFeedbackLinks([]);
    } finally {
      setFeedbackLinksLoading(false);
    }
  };

  const handleGenerateFeedbackLinks = async () => {
    if (!editingEvent || editingEvent.type !== 'training' || !editingEvent.id) return;
    const attendance = (editingEvent as any).attendance || {};
    const presentOrLate = Object.entries(attendance).filter(([, s]) => s === 'present' || s === 'late');
    if (presentOrLate.length === 0) {
      setError('Marquez au moins un joueur Présent ou Retard puis enregistrez l\'entraînement avant de générer les liens.');
      return;
    }
    setFeedbackLinksGenerating(true);
    setError(null);
    try {
      await createTokensForTraining(editingEvent.id, attendance);
      await refreshFeedbackLinks();
      setSuccess('Liens générés. Vous pouvez les copier ci-dessous.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Génération des liens questionnaire:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la génération des liens');
    } finally {
      setFeedbackLinksGenerating(false);
    }
  };

  // Chargement des données
  useEffect(() => {
    if (activeTeam) {
      console.log('🏆 Calendar - Chargement des données pour l\'équipe:', activeTeam.name);
      fetchMatches();
      fetchTrainings();
      fetchPlayers();
      fetchTrainingStats();
      fetchMatchStats();
    }
  }, [activeTeam]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchMatches = async () => {
    try {
      if (!activeTeam) {
        console.log('🏆 Calendar - Aucune équipe active, chargement des matchs impossible');
        setMatches([]);
        return;
      }

      console.log('🏆 Calendar - Chargement des matchs pour l\'équipe:', activeTeam.name);
      
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('team_id', activeTeam.id)
        .order('date', { ascending: true });

      if (error) throw error;

      console.log('🏆 Calendar - Matchs récupérés:', data?.length || 0);

      setMatches(data.map(match => ({
        ...match,
        date: new Date(match.date),
        players: match.players || [],
        type: 'match' as const
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des matchs');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrainings = async () => {
    try {
      if (!activeTeam) {
        console.log('🏆 Calendar - Aucune équipe active, chargement des entraînements impossible');
        setTrainings([]);
        return;
      }

      console.log('🏆 Calendar - Chargement des entraînements pour l\'équipe:', activeTeam.name);
      
      const { data, error } = await supabase
        .from('trainings')
        .select('*')
        .eq('team_id', activeTeam.id)
        .order('date', { ascending: true });

      if (error) throw error;

      console.log('🏆 Calendar - Entraînements récupérés:', data?.length || 0);

      setTrainings(data.map(training => ({
        ...training,
        date: new Date(training.date),
        // Convertir le champ attendance JSONB en format players pour la compatibilité
        players: training.attendance ? Object.entries(training.attendance).map(([playerId, status]) => ({
          id: playerId,
          status: status as PlayerStatus
        })) : [],
        // Conserver session_duration et session_parts pour l'édition
        session_duration: training.session_duration || null,
        session_parts: training.session_parts || null,
        type: 'training' as const
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des entraînements');
    }
  };

  const fetchPlayers = async () => {
    try {
      if (!activeTeam) {
        console.log('🏆 Calendar - Aucune équipe active, chargement des joueurs impossible');
        setPlayers([]);
        return;
      }

      console.log('🏆 Calendar - Chargement des joueurs pour l\'équipe:', activeTeam.name);
      
      // Récupération des joueurs via la table de liaison
      const { data: playerTeamsData, error } = await supabase
        .from('player_teams')
        .select(`
          player_id,
          players (id, first_name, last_name)
        `)
        .eq('team_id', activeTeam.id);
      
      if (error) throw error;
      
      // Transformer les données pour extraire les joueurs
      const data = playerTeamsData?.map((item: any) => item.players).filter(Boolean) || [];
      
      // Trier par nom de famille
      data.sort((a: any, b: any) => (a.last_name || '').localeCompare(b.last_name || ''));

      if (error) throw error;

      // Récupérer les stats pour chaque joueur
      const playersWithStats = await Promise.all(
        (data || []).map(async (player) => {
          const { data: stats, error: statsError } = await supabase
            .from('player_stats')
            .select('matches_played, goals, yellow_cards, red_cards')
            .eq('player_id', player.id)
            .single();

          if (statsError && statsError.code !== 'PGRST116') {
            console.error(`Erreur lors de la récupération des stats pour ${player.id}:`, statsError);
          }

          return {
            ...player,
            stats: stats || { matches_played: 0, goals: 0, yellow_cards: 0, red_cards: 0 }
          };
        })
      );

      setPlayers(playersWithStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des joueurs');
    }
  };

  const fetchTrainingStats = async () => {
    try {
      if (!activeTeam) {
        console.log('🏆 Calendar - Aucune équipe active, chargement des stats d\'entraînement impossible');
        setTrainingStats([]);
        return;
      }

      console.log('🏆 Calendar - Chargement des stats d\'entraînement pour l\'équipe:', activeTeam.name);
      
      const { data, error } = await supabase
        .from('trainings')
        .select('*')
        .eq('team_id', activeTeam.id)
        .order('date', { ascending: true });

      if (error) throw error;

      console.log('🏆 Calendar - Stats d\'entraînement récupérées:', data?.length || 0);

      if (!data || data.length === 0) {
        console.log('Aucune donnée d\'entraînement trouvée');
        setTrainingStats([]);
        return;
      }

      const stats = data.map(training => ({
        date: format(new Date(training.date), 'dd/MM/yyyy'),
        attendance: training.attendance ? Object.keys(training.attendance).length : 0,
        theme: training.theme || 'Non spécifié'
      }));

      console.log('Stats des entraînements formatées:', stats);
      setTrainingStats(stats);
    } catch (err) {
      console.error('Erreur lors du chargement des stats d\'entraînement:', err);
      setTrainingStats([]);
    }
  };

  const fetchMatchStats = async () => {
    try {
      if (!activeTeam) {
        console.log('🏆 Calendar - Aucune équipe active, chargement des stats de match impossible');
        setMatchStats([]);
        return;
      }

      console.log('🏆 Calendar - Chargement des stats de match pour l\'équipe:', activeTeam.name);
      
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('team_id', activeTeam.id)
        .order('date', { ascending: true });

      if (error) throw error;

      console.log('🏆 Calendar - Stats de match récupérées:', data?.length || 0);

      if (!data || data.length === 0) {
        console.log('Aucune donnée de match trouvée');
        setMatchStats([]);
        return;
      }

      const stats = data.map(match => ({
        date: format(new Date(match.date), 'dd/MM/yyyy'),
        goals_scored: Number(match.score_team) || 0,
        goals_conceded: Number(match.score_opponent) || 0,
        result: (match.score_team > match.score_opponent ? 'Victoire' : 
                match.score_team < match.score_opponent ? 'Défaite' : 'Nul') as 'Victoire' | 'Nul' | 'Défaite',
        location: match.location as 'Domicile' | 'Exterieur',
        goals_by_type: match.goals_by_type || {
          offensive: 0,
          transition: 0,
          cpa: 0,
          superiority: 0
        },
        conceded_by_type: match.conceded_by_type || {
          offensive: 0,
          transition: 0,
          cpa: 0,
          superiority: 0
        }
      }));

      console.log('Stats des matchs formatées:', stats);
      setMatchStats(stats);
    } catch (err) {
      console.error('Erreur lors du chargement des stats de match:', err);
      setMatchStats([]);
    }
  };

  const handleOpenModal = () => {
    reset({
      title: '',
      date: new Date(),
      location: 'Domicile',
      competition: 'Championnat',
      score_team: 0,
      score_opponent: 0,
      opponent_team: '',
      players: {},
      goals_by_type: {
        offensive: 0,
        transition: 0,
        cpa: 0,
        superiority: 0
      },
      conceded_by_type: {
        offensive: 0,
        transition: 0,
        cpa: 0,
        superiority: 0
      }
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsEditing(false);
    setEditingEvent(null);
    reset({});
  };

  const handleOpenTrainingModal = () => {
    resetTraining({
      date: new Date(),
      location: '',
      theme: 'Offensif',
      key_principle: '',
      players: {},
      sessionDuration: 60,
      sessionParts: [] // Ne pas préremplir
    });
    setTrainingFormPage(1);
    setIsTrainingModalOpen(true);
  };

  const handleCloseTrainingModal = () => {
    setIsTrainingModalOpen(false);
    setIsEditing(false);
    setEditingEvent(null);
    setTrainingFormPage(1);
    resetTraining({});
  };

  const updatePlayerStats = async (players: { id: string; goals: number; yellow_cards: number; red_cards: number }[]) => {
    try {
      console.log('Début de la mise à jour des stats pour les joueurs:', players);

      for (const player of players) {
        if (!player.id) {
          console.error('ID de joueur manquant:', player);
          continue;
        }

        console.log(`Traitement du joueur ${player.id}:`, player);

        // Récupérer les stats actuelles
        const { data: currentStats, error: fetchError } = await supabase
          .from('player_stats')
          .select('matches_played, goals, yellow_cards, red_cards')
          .eq('player_id', player.id)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error('Erreur lors de la récupération des stats:', fetchError);
          continue;
        }

        console.log('Stats actuelles du joueur:', currentStats);

        // Préparer les nouvelles stats
        const newStats = {
          player_id: player.id,
          matches_played: (currentStats?.matches_played || 0) + 1,
          goals: (currentStats?.goals || 0) + (player.goals || 0),
          yellow_cards: (currentStats?.yellow_cards || 0) + (player.yellow_cards || 0),
          red_cards: (currentStats?.red_cards || 0) + (player.red_cards || 0)
        };

        console.log('Nouvelles stats à enregistrer:', newStats);

        // Mettre à jour ou créer les stats
        const { error: upsertError } = await supabase
          .from('player_stats')
          .upsert(newStats, {
            onConflict: 'player_id'
          });

        if (upsertError) {
          console.error('Erreur lors de l\'upsert des stats:', upsertError);
          throw upsertError;
        }

        console.log('Stats mises à jour avec succès pour le joueur:', player.id);
      }
    } catch (err) {
      console.error('Erreur lors de la mise à jour des statistiques:', err);
      throw err;
    }
  };

  const updateTrainingAttendance = async (players: { id: string; status: PlayerStatus }[]) => {
    try {
      console.log('Mise à jour de la présence aux entraînements pour les joueurs:', players);

      for (const player of players) {
        if (!player.id) {
          console.error('ID de joueur manquant:', player);
          continue;
        }

        // Récupérer les stats actuelles
        const { data: currentStats, error: fetchError } = await supabase
          .from('player_stats')
          .select('training_attendance')
          .eq('player_id', player.id)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error('Erreur lors de la récupération des stats:', fetchError);
          continue;
        }

        // Préparer les nouvelles stats
        const newStats = {
          player_id: player.id,
          training_attendance: (currentStats?.training_attendance || 0) + 1
        };

        // Mettre à jour les stats
        const { error: upsertError } = await supabase
          .from('player_stats')
          .upsert(newStats, {
            onConflict: 'player_id'
          });

        if (upsertError) {
          console.error('Erreur lors de l\'upsert des stats:', upsertError);
          throw upsertError;
        }

        console.log('Présence aux entraînements mise à jour pour le joueur:', player.id);
      }
    } catch (err) {
      console.error('Erreur lors de la mise à jour de la présence aux entraînements:', err);
      throw err;
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    console.log('Événement cliqué:', event);
    setEditingEvent(event);
    setIsEditing(true);
    
    if (event.type === 'match') {
      console.log('Pré-remplissage du formulaire de match');
      console.log('Joueurs de l\'événement:', event.players);
      console.log('Liste des joueurs disponibles:', players);

      // Pré-remplir le formulaire de match avec les joueurs et leurs stats
      const playersData = event.players.reduce((acc, player) => {
        console.log('Traitement du joueur:', player);
        acc[player.id] = {
          id: player.id,
          present: true,
          goals: player.goals || 0,
          yellow_cards: player.yellow_cards || 0,
          red_cards: player.red_cards || 0
        };
        return acc;
      }, {} as { [key: string]: PlayerFormData });

      console.log('Données des joueurs préparées:', playersData);

      const formData = {
        title: event.title,
        date: event.date,
        location: event.location as LocationType,
        competition: event.competition as CompetitionType,
        score_team: event.score_team,
        score_opponent: event.score_opponent,
        opponent_team: (event as any).opponent_team || '',
        players: playersData,
        goals_by_type: (event as any).goals_by_type || {
          offensive: 0,
          transition: 0,
          cpa: 0,
          superiority: 0
        },
        conceded_by_type: (event as any).conceded_by_type || {
          offensive: 0,
          transition: 0,
          cpa: 0,
          superiority: 0
        }
      };

      console.log('Données du formulaire à pré-remplir:', formData);
      reset(formData);
      setIsModalOpen(true);
    } else {
      console.log('Pré-remplissage du formulaire d\'entraînement');
      console.log('Joueurs de l\'événement:', event.players);

      // Pré-remplir le formulaire d'entraînement avec les joueurs
      // Si l'événement a un champ attendance JSONB, l'utiliser
      let playersData: { [key: string]: { id: string; status: PlayerStatus } } = {};
      
      if ((event as any).attendance && typeof (event as any).attendance === 'object') {
        // Utiliser le champ attendance JSONB s'il existe
        Object.entries((event as any).attendance).forEach(([playerId, status]) => {
          playersData[playerId] = {
            id: playerId,
            status: status as PlayerStatus
          };
        });
      } else if (Array.isArray(event.players)) {
        // Fallback sur l'ancien format si nécessaire
        event.players.forEach((player: any) => {
          playersData[player.id] = {
            id: player.id,
            status: player.status || 'present'
          };
        });
      }

      // S'assurer que tous les joueurs ont un statut
      players.forEach(player => {
        if (!playersData[player.id]) {
          playersData[player.id] = {
            id: player.id,
            status: 'present' // Par défaut
          };
        }
      });

      console.log('Données des joueurs préparées:', playersData);

      const formData: TrainingFormData = {
        date: event.date,
        location: event.location,
        theme: event.theme as TrainingTheme,
        key_principle: event.key_principle,
        players: playersData,
        // Charger les données de la page 2 si disponibles
        sessionDuration: (event as any).session_duration || undefined,
        sessionParts: (event as any).session_parts || undefined
      };

      console.log('Données du formulaire à pré-remplir:', formData);
      resetTraining(formData);
      setIsTrainingModalOpen(true);
      // Si on a des données de session, afficher directement la page 2
      if (formData.sessionDuration || (formData.sessionParts && formData.sessionParts.length > 0)) {
        setTrainingFormPage(2);
      }
    }
  };

  const handleUpdateMatch = async (data: MatchFormData) => {
    try {
      setError(null);
      if (!editingEvent || editingEvent.type !== 'match') return;

      // Récupérer les données existantes du match pour préserver le time_played
      const { data: existingMatch, error: fetchError } = await supabase
        .from('matches')
        .select('players')
        .eq('id', editingEvent.id)
        .single();

      if (fetchError) {
        console.error('Erreur lors de la récupération des données existantes:', fetchError);
        throw fetchError;
      }

      console.log('🔍 Données existantes du match:', existingMatch);

      // Nettoyer et formater les données des joueurs (optionnel)
      const cleanedPlayers = data.players ? Object.entries(data.players)
        .filter(([playerId, player]) => {
          if (!player || typeof player !== 'object' || !player.present) return false;
          if (!playerId) {
            console.error('ID de joueur manquant:', player);
            return false;
          }
          return true;
        })
        .map(([playerId, player]) => ({
          id: playerId,
          goals: Number(player.goals) || 0,
          yellow_cards: Number(player.yellow_cards) || 0,
          red_cards: Number(player.red_cards) || 0
        })) : [];

      // Fusionner les nouvelles données avec les données existantes (time_played)
      const mergedPlayers = cleanedPlayers.map(newPlayer => {
        const existingPlayer = existingMatch.players?.find((p: any) => p.id === newPlayer.id);
        if (existingPlayer) {
          return {
            ...newPlayer,
            time_played: existingPlayer.time_played || 0 // Préserver le time_played existant
          };
        }
        return newPlayer;
      });

      console.log('🔍 Joueurs fusionnés avec time_played préservé:', mergedPlayers);

      const matchData = {
        title: data.title,
        date: data.date.toISOString(),
        location: data.location,
        competition: data.competition,
        score_team: data.score_team,
        score_opponent: data.score_opponent,
        opponent_team: data.opponent_team || null,
        players: mergedPlayers, // Utiliser les joueurs fusionnés
        goals_by_type: data.goals_by_type,
        conceded_by_type: data.conceded_by_type
      };

      // Mise à jour du match
      const { error: matchError } = await supabase
        .from('matches')
        .update(matchData)
        .eq('id', editingEvent.id);

      if (matchError) throw matchError;

      // Mise à jour des stats des joueurs
      await updatePlayerStats(cleanedPlayers);

      handleCloseModal();
      fetchMatches();
      fetchPlayers();
      setSuccess('Match modifié avec succès');
    } catch (err) {
      console.error('Erreur lors de la modification:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la modification');
    }
  };

  const handleUpdateTraining = async (data: TrainingFormData) => {
    try {
      setError(null);
      if (!editingEvent || editingEvent.type !== 'training') return;

      // Préparer les données de présence au format JSONB
      const attendanceData: Record<string, string> = {};
      Object.entries(data.players).forEach(([playerId, player]) => {
        if (player && typeof player === 'object' && player.status) {
          attendanceData[playerId] = player.status;
        }
      });

      const trainingData: any = {
        date: data.date.toISOString(),
        location: data.location,
        theme: data.theme,
        key_principle: data.key_principle,
        attendance: attendanceData // Mise à jour du champ JSONB
      };

      // Ajouter les données de la page 2 si disponibles
      if (data.sessionDuration) {
        trainingData.session_duration = data.sessionDuration;
      }
      if (data.sessionParts && data.sessionParts.length > 0) {
        trainingData.session_parts = data.sessionParts;
      } else if (data.sessionParts && data.sessionParts.length === 0) {
        // Si sessionParts est un tableau vide, le mettre à null pour nettoyer
        trainingData.session_parts = null;
      }

      console.log('Données de l\'entraînement à mettre à jour:', trainingData);

      // Mise à jour de l'entraînement avec les présences
      const { error: trainingError } = await supabase
        .from('trainings')
        .update(trainingData)
        .eq('id', editingEvent.id);

      if (trainingError) throw trainingError;

      try {
        await createTokensForTraining(editingEvent.id, attendanceData);
      } catch (tokenErr) {
        console.warn('Mise à jour des liens questionnaire:', tokenErr);
      }

      handleCloseTrainingModal();
      fetchMatches();
      fetchTrainings();
      fetchPlayers();
      setSuccess('Entraînement modifié avec succès');
    } catch (err) {
      console.error('Erreur lors de la modification:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la modification');
    }
  };

  // Nouvelle structure d'événements pour react-big-calendar
  const events: RBCalendarEvent[] = [
    ...matches.map(match => ({
      id: match.id,
      title: match.title + ` (${match.score_team} - ${match.score_opponent})`,
      start: match.date,
      end: match.date,
      type: 'match' as const,
      raw: match
    })),
    ...trainings.map(training => ({
      id: training.id,
      title: `Entraînement: ${training.theme}`,
      start: training.date,
      end: training.date,
      type: 'training' as const,
      raw: training
    }))
  ];

  // Handler pour drag & drop adapté à la signature attendue
  const moveEvent = async ({ event, start, end }: { event: object, start: string | Date, end: string | Date }) => {
    const realEvent = event as RBCalendarEvent;
    const startDate = typeof start === 'string' ? new Date(start) : start;
    if (realEvent.type === 'match') {
      await supabase.from('matches').update({ date: startDate.toISOString() }).eq('id', realEvent.id);
      fetchMatches();
    } else {
      await supabase.from('trainings').update({ date: startDate.toISOString() }).eq('id', realEvent.id);
      fetchTrainings();
    }
  };

  // Handler pour le clic droit adapté à la signature attendue
  const handleEventContextMenu = async (event: object, e: React.SyntheticEvent<HTMLElement, Event>) => {
    e.preventDefault();
    const realEvent = event as RBCalendarEvent;
    if (window.confirm('Dupliquer cet événement ?')) {
      if (realEvent.type === 'match') {
        const newDate = moment(realEvent.start).add(7, 'days').toDate();
        const matchCopy = { ...realEvent.raw, date: newDate, id: undefined };
        delete matchCopy.id;
        await supabase.from('matches').insert([matchCopy]);
        fetchMatches();
      } else {
        const newDate = moment(realEvent.start).add(7, 'days').toDate();
        const trainingCopy = { ...realEvent.raw } as any;
        try {
          delete trainingCopy.id;
          delete trainingCopy.created_at;
          delete trainingCopy.type; // <-- SUPPRIME le champ type
        } catch {}
        trainingCopy.date = newDate.toISOString();
        const { error } = await supabase.from('trainings').insert([trainingCopy]);
        if (error) {
          console.error('Erreur lors de la duplication de l\'entraînement:', error);
          setError('Erreur lors de la duplication de l\'entraînement');
        } else {
          fetchTrainings();
        }
      }
    }
  };

  // eventPropGetter pour appliquer le style selon le type/compétition
  const eventPropGetter = (event: object) => {
    const realEvent = event as RBCalendarEvent;
    let style: React.CSSProperties = {
      borderRadius: 6,
      color: '#222',
      border: 'none',
      padding: 0,
      opacity: 1
    };
    if (realEvent.type === 'training') {
      style.background = 'rgba(66, 153, 225, 0.25)'; // bleu clair transparent
      style.color = '#2563eb'; // bleu foncé
    } else if (realEvent.type === 'match') {
      // On regarde la compétition
      const comp = (realEvent.raw as Match).competition;
      if (comp === 'Amical') {
        style.background = '#bbf7d0'; // vert clair
        style.color = '#166534'; // vert foncé
      } else {
        style.background = '#fecaca'; // rouge clair
        style.color = '#b91c1c'; // rouge foncé
      }
    }
    return { style };
  };

  // Handler pour sélectionner un événement RBCalendarEvent
  const handleCalendarEventClick = (event: object) => {
    handleEventClick((event as RBCalendarEvent).raw as CalendarEvent);
  };

  // Rendu des événements sur le calendrier
  const tileContent = ({ date }: { date: Date }) => {
    const dayEvents = [
      ...matches.filter(match => format(match.date, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')),
      ...trainings.filter(training => format(training.date, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'))
    ];

    return dayEvents.length > 0 ? (
      <div className="flex flex-col gap-1 mt-1">
        {dayEvents.map(event => (
          <div
            key={event.id}
            onClick={() => handleEventClick(event)}
            className={`text-xs p-1 rounded cursor-pointer ${
              event.type === 'match' 
                ? 'bg-red-100 text-red-800 hover:bg-red-200' 
                : 'bg-green-100 text-green-800 hover:bg-green-200'
            }`}
          >
            <div className="flex justify-between items-center">
              <div className="flex-1">
                {event.type === 'match' ? (
                  <>
                    <span className="font-medium">{event.title}</span>
                    <span className="ml-2">
                      {event.score_team} - {event.score_opponent}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-medium">Entraînement</span>
                    <span className="ml-2 text-xs">
                      {event.theme}
                    </span>
                  </>
                )}
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm('Êtes-vous sûr de vouloir supprimer cet événement ?')) {
                    if (event.type === 'match') {
                      handleDeleteMatch(event.id);
                    } else {
                      handleDeleteTraining(event.id);
                    }
                  }
                }}
                className="ml-2 text-gray-600 hover:text-red-600 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    ) : null;
  };

  // Modifier les fonctions de soumission des formulaires
  const onSubmit = async (data: MatchFormData) => {
    if (isEditing && editingEvent?.type === 'match') {
      await handleUpdateMatch(data);
    } else {
      // Code existant pour l'ajout d'un match
      try {
        setError(null);
        
        // Vérifier qu'une équipe est active
        if (!activeTeam) {
          setError('Aucune équipe active sélectionnée. Veuillez sélectionner une équipe dans la sidebar.');
          return;
        }
        
        console.log('🏆 Calendar - Ajout de match pour l\'équipe:', activeTeam.name);
        console.log('Données du formulaire:', data);

        // Nettoyer et formater les données des joueurs (optionnel)
        const cleanedPlayers = data.players ? Object.entries(data.players)
          .filter(([playerId, player]) => {
            if (!player || typeof player !== 'object' || !player.present) return false;
            if (!playerId) {
              console.error('ID de joueur manquant:', player);
              return false;
            }
            return true;
          })
          .map(([playerId, player]) => ({
            id: playerId,
            goals: Number(player.goals) || 0,
            yellow_cards: Number(player.yellow_cards) || 0,
            red_cards: Number(player.red_cards) || 0
          })) : [];

        console.log('Joueurs nettoyés:', cleanedPlayers);

        const matchData = {
          title: data.title,
          date: data.date.toISOString(),
          location: data.location,
          competition: data.competition,
          score_team: data.score_team,
          score_opponent: data.score_opponent,
          opponent_team: data.opponent_team || null,
          players: cleanedPlayers,
          goals_by_type: data.goals_by_type,
          conceded_by_type: data.conceded_by_type,
          team_id: activeTeam.id // Ajouter automatiquement le team_id
        };

        console.log('Données du match à enregistrer:', matchData);

        // Enregistrement du match
        const { error: matchError } = await supabase
          .from('matches')
          .insert([matchData]);

        if (matchError) {
          console.error('Erreur lors de l\'enregistrement du match:', matchError);
          throw matchError;
        }

        // Mise à jour des stats des joueurs
        console.log('Mise à jour des stats pour les joueurs:', cleanedPlayers);
        await updatePlayerStats(cleanedPlayers);

        handleCloseModal();
        fetchMatches();
        fetchPlayers();
      } catch (err) {
        console.error('Erreur lors de l\'enregistrement:', err);
        setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
      }
    }
  };

  const onSubmitTraining = async (data: TrainingFormData) => {
    if (isEditing && editingEvent?.type === 'training') {
      await handleUpdateTraining(data);
    } else {
      // Code existant pour l'ajout d'un entraînement
      try {
        setError(null);
        
        // Vérifier qu'une équipe est active
        if (!activeTeam) {
          setError('Aucune équipe active sélectionnée. Veuillez sélectionner une équipe dans la sidebar.');
          return;
        }
        
        console.log('🏆 Calendar - Ajout d\'entraînement pour l\'équipe:', activeTeam.name);

        // Préparer les données de présence au format JSONB
        const attendanceData: Record<string, string> = {};
        Object.entries(data.players).forEach(([playerId, player]) => {
          if (player && typeof player === 'object' && player.status) {
            attendanceData[playerId] = player.status;
          }
        });

        // Créer l'entraînement avec les présences directement dans le JSONB
        const trainingData: any = {
          date: data.date.toISOString(),
          location: data.location,
          theme: data.theme,
          key_principle: data.key_principle,
          attendance: attendanceData, // Stockage direct dans le JSONB
          team_id: activeTeam.id // Ajouter automatiquement le team_id
        };

        // Ajouter les données de la page 2 si disponibles
        if (data.sessionDuration) {
          trainingData.session_duration = data.sessionDuration;
        }
        if (data.sessionParts && data.sessionParts.length > 0) {
          trainingData.session_parts = data.sessionParts; // Stockage en JSONB
        }

        console.log('Données de l\'entraînement à enregistrer:', trainingData);

        // Enregistrement de l'entraînement
        const { data: inserted, error: trainingError } = await supabase
          .from('trainings')
          .insert([trainingData])
          .select('id')
          .single();

        if (trainingError) {
          console.error('Erreur lors de l\'enregistrement de l\'entraînement:', trainingError);
          throw trainingError;
        }

        if (inserted?.id) {
          try {
            await createTokensForTraining(inserted.id, attendanceData);
          } catch (tokenErr) {
            console.warn('Création des liens questionnaire:', tokenErr);
          }
        }

        handleCloseTrainingModal();
        fetchMatches();
        fetchTrainings();
        fetchPlayers();
        setSuccess('Entraînement ajouté avec succès');
      } catch (err) {
        console.error('Erreur lors de l\'enregistrement:', err);
        const errorMessage = err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement';
        if (err && typeof err === 'object' && 'message' in err) {
          console.error('Détails de l\'erreur:', JSON.stringify(err, null, 2));
        }
        setError(errorMessage);
      }
    }
  };

  // Calcul des données pour les graphiques
  const getTrainingThemeDistribution = () => {
    console.log('Calcul de la distribution des thèmes avec les données:', trainingStats);
    
    if (!trainingStats || trainingStats.length === 0) {
      console.log('Aucune donnée d\'entraînement disponible pour le calcul de la distribution');
      return [];
    }

    // Préparation des données pour le bar chart
    const themeCount = trainingStats.reduce((acc, training) => {
      const theme = training.theme || 'Non spécifié';
      acc[theme] = (acc[theme] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    // Formatage des données pour le bar chart
    const distribution = Object.entries(themeCount)
      .filter(([_, value]) => value > 0) // Filtrer les valeurs nulles ou zéro
      .map(([name, value]) => ({
        name,
        value: Number(value) // S'assurer que la valeur est un nombre
      }))
      .sort((a, b) => b.value - a.value); // Trier par nombre de séances décroissant

    console.log('Distribution des thèmes calculée:', distribution);
    return distribution;
  };

  const getMatchResultDistribution = () => {
    console.log('Calcul de la distribution des résultats avec les données:', matchStats);
    
    if (!matchStats || matchStats.length === 0) {
      console.log('Aucune donnée de match disponible pour le calcul de la distribution');
      return [];
    }

    const filteredStats = matchLocationFilter === 'Tous' 
      ? matchStats 
      : matchStats.filter(match => match.location === matchLocationFilter);

    console.log('Stats filtrées par lieu:', filteredStats);

    if (filteredStats.length === 0) {
      console.log('Aucune donnée de match disponible après filtrage par lieu');
      return [];
    }

    // Préparation des données pour le pie chart
    const resultCount = filteredStats.reduce((acc, match) => {
      const result = match.result || 'Non spécifié';
      acc[result] = (acc[result] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    // Formatage des données pour le pie chart
    const distribution = Object.entries(resultCount)
      .filter(([_, value]) => value > 0) // Filtrer les valeurs nulles ou zéro
      .map(([name, value]) => ({
        name,
        value: Number(value) // S'assurer que la valeur est un nombre
      }));

    console.log('Distribution des résultats calculée:', distribution);
    return distribution;
  };

  const getGoalsDistribution = () => {
    console.log('Calcul de la distribution des buts avec les données:', matchStats);
    
    if (!matchStats || matchStats.length === 0) {
      console.log('Aucune donnée de match disponible pour le calcul de la distribution');
      return { scored: [], conceded: [] };
    }

    const filteredStats = matchLocationFilter === 'Tous' 
      ? matchStats 
      : matchStats.filter(match => match.location === matchLocationFilter);

    console.log('Stats filtrées par lieu:', filteredStats);

    if (filteredStats.length === 0) {
      console.log('Aucune donnée de match disponible après filtrage par lieu');
      return { scored: [], conceded: [] };
    }

    // Formater les données pour les graphiques
    const scoredData = filteredStats.map(match => ({
      name: match.date,
      'Phase Offensive': match.goals_by_type.offensive,
      'Transition': match.goals_by_type.transition,
      'CPA': match.goals_by_type.cpa,
      'Supériorité': match.goals_by_type.superiority
    }));

    const concededData = filteredStats.map(match => ({
      name: match.date,
      'Phase Offensive': match.conceded_by_type.offensive,
      'Transition': match.conceded_by_type.transition,
      'CPA': match.conceded_by_type.cpa,
      'Supériorité': match.conceded_by_type.superiority
    }));

    console.log('Distribution des buts calculée:', { scored: scoredData, conceded: concededData });
    return { scored: scoredData, conceded: concededData };
  };

  const getFilteredMatchStats = () => {
    if (!matchStats || matchStats.length === 0) {
      return [];
    }

    return matchLocationFilter === 'Tous'
      ? matchStats
      : matchStats.filter(match => match.location === matchLocationFilter);
  };

  const getMatchSummary = () => {
    if (!matchStats || matchStats.length === 0) {
      return {
        victories: 0,
        draws: 0,
        defeats: 0,
        goalsScored: 0,
        goalsConceded: 0
      };
    }

    const filteredStats = matchLocationFilter === 'Tous' 
      ? matchStats 
      : matchStats.filter(match => match.location === matchLocationFilter);

    return {
      victories: filteredStats.filter(match => match.result === 'Victoire').length,
      draws: filteredStats.filter(match => match.result === 'Nul').length,
      defeats: filteredStats.filter(match => match.result === 'Défaite').length,
      goalsScored: filteredStats.reduce((sum, match) => sum + match.goals_scored, 0),
      goalsConceded: filteredStats.reduce((sum, match) => sum + match.goals_conceded, 0)
    };
  };

  const getGoalsByTypeDistribution = () => {
    if (!matchStats || matchStats.length === 0) {
      return [];
    }

    const filteredStats = matchLocationFilter === 'Tous' 
      ? matchStats 
      : matchStats.filter(match => match.location === matchLocationFilter);

    if (filteredStats.length === 0) {
      return [];
    }

    // Calculer les totaux par type pour les buts marqués et encaissés
    const totals = filteredStats.reduce((acc, match) => {
      // Buts marqués
      acc.offensive_scored += match.goals_by_type.offensive;
      acc.transition_scored += match.goals_by_type.transition;
      acc.cpa_scored += match.goals_by_type.cpa;
      acc.superiority_scored += match.goals_by_type.superiority;

      // Buts encaissés
      acc.offensive_conceded += match.conceded_by_type.offensive;
      acc.transition_conceded += match.conceded_by_type.transition;
      acc.cpa_conceded += match.conceded_by_type.cpa;
      acc.superiority_conceded += match.conceded_by_type.superiority;

      return acc;
    }, {
      offensive_scored: 0,
      transition_scored: 0,
      cpa_scored: 0,
      superiority_scored: 0,
      offensive_conceded: 0,
      transition_conceded: 0,
      cpa_conceded: 0,
      superiority_conceded: 0
    });

    // Formater les données pour le graphique
    return [
      {
        name: 'Phase Offensive',
        buts_marqués: totals.offensive_scored,
        buts_encaissés: totals.offensive_conceded
      },
      {
        name: 'Transition',
        buts_marqués: totals.transition_scored,
        buts_encaissés: totals.transition_conceded
      },
      {
        name: 'CPA',
        buts_marqués: totals.cpa_scored,
        buts_encaissés: totals.cpa_conceded
      },
      {
        name: 'Supériorité',
        buts_marqués: totals.superiority_scored,
        buts_encaissés: totals.superiority_conceded
      }
    ];
  };

  // Logs pour debug PieChart
  const pieThemeData = useMemo(() => getTrainingThemeDistribution(), [trainingStats]);
  const pieResultData = useMemo(() => getMatchResultDistribution(), [matchStats, matchLocationFilter]);
  console.log('DATA PIE THEME:', pieThemeData);
  console.log('DATA PIE RESULT:', pieResultData);

  const handleDeleteMatch = async (id: string) => {
    try {
      setError(null);
      const { error } = await supabase.from('matches').delete().eq('id', id);
      if (error) throw error;
      fetchMatches();
      setSuccess('Match supprimé avec succès');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression du match');
    }
  };

  const handleDeleteTraining = async (id: string) => {
    try {
      setError(null);
      const { error } = await supabase.from('trainings').delete().eq('id', id);
      if (error) throw error;
      fetchTrainings();
      setSuccess('Entraînement supprimé avec succès');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression de l\'entraînement');
    }
  };

  // Attacher dynamiquement le handler contextmenu sur les événements après le rendu
  useEffect(() => {
    const eventEls = document.querySelectorAll('.rbc-event');
    eventEls.forEach(el => {
      el.removeEventListener('contextmenu', (el as any)._customContextMenuHandler);
      const handler = (e: Event) => {
        e.preventDefault();
        // Trouver l'id de l'événement à partir du DOM
        const id = el.getAttribute('data-event-id');
        const found = events.find(ev => ev.id === id);
        if (found) {
          handleEventContextMenu(found, e as any);
        }
      };
      (el as any)._customContextMenuHandler = handler;
      el.addEventListener('contextmenu', handler);
    });
    return () => {
      eventEls.forEach(el => {
        el.removeEventListener('contextmenu', (el as any)._customContextMenuHandler);
      });
    };
  }, [events]);

  // Suppression d'un événement depuis le custom renderer
  const handleDeleteEvent = async (event: RBCalendarEvent) => {
    if (window.confirm('Supprimer cet événement ?')) {
      if (event.type === 'match') {
        await handleDeleteMatch(event.id);
      } else {
        await handleDeleteTraining(event.id);
      }
    }
  };

  // Duplication d'un événement depuis le custom renderer
  const handleDuplicateEvent = async (event: RBCalendarEvent) => {
    if (window.confirm('Dupliquer cet événement ?')) {
      if (event.type === 'match') {
        const newDate = moment(event.start).add(7, 'days').toDate();
        const matchCopy = { ...event.raw } as any;
        try {
          delete matchCopy.id;
          delete matchCopy.created_at;
          delete matchCopy.type; // <-- SUPPRIME le champ type aussi pour les matchs
        } catch {}
        matchCopy.date = newDate.toISOString();
        // Correction des noms de colonnes
        matchCopy.goals_by_type = matchCopy.goalsByType ?? { offensive: 0, transition: 0, cpa: 0, superiority: 0 };
        matchCopy.conceded_by_type = matchCopy.concededByType ?? { offensive: 0, transition: 0, cpa: 0, superiority: 0 };
        delete matchCopy.goalsByType;
        delete matchCopy.concededByType;
        const { error } = await supabase.from('matches').insert([matchCopy]);
        if (error) {
          console.error('Erreur lors de la duplication du match:', error);
          setError('Erreur lors de la duplication du match');
        } else {
          fetchMatches();
        }
      } else {
        const newDate = moment(event.start).add(7, 'days').toDate();
        const trainingCopy = { ...event.raw } as any;
        try {
          delete trainingCopy.id;
          delete trainingCopy.created_at;
          delete trainingCopy.type; // <-- SUPPRIME le champ type
        } catch {}
        trainingCopy.date = newDate.toISOString();
        const { error } = await supabase.from('trainings').insert([trainingCopy]);
        if (error) {
          console.error('Erreur lors de la duplication de l\'entraînement:', error);
          setError('Erreur lors de la duplication de l\'entraînement');
        } else {
          fetchTrainings();
        }
      }
    }
  };

  // Composant custom pour le rendu d'un événement
  const CustomEvent = ({ event }: { event: RBCalendarEvent }) => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: 4,
      borderRadius: 6,
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      minHeight: 32,
      height: '100%',
      width: '100%'
    }}>
      <span style={{ flex: 1 }}>{event.title}</span>
      <button
        onClick={e => { e.stopPropagation(); handleDuplicateEvent(event); }}
        title="Dupliquer"
        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', marginRight: 2 }}
      >
        ⧉
      </button>
      <button
        onClick={e => { e.stopPropagation(); handleDeleteEvent(event); }}
        title="Supprimer"
        style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontWeight: 'bold' }}
      >
        ×
      </button>
    </div>
  );





  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:p-8">
      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-md flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Calendrier</h1>
          {activeTeam && (
            <div className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: activeTeam.color }}
              ></div>
              <span className="text-sm text-gray-600">
                Équipe active : <strong>{activeTeam.name}</strong> ({activeTeam.category} - Niveau {activeTeam.level})
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
          <button
            onClick={handleOpenTrainingModal}
            disabled={!activeTeam}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors w-full sm:w-auto ${
              activeTeam 
                ? 'bg-green-600 text-white hover:bg-green-700' 
                : 'bg-gray-400 text-gray-200 cursor-not-allowed'
            }`}
          >
            <Dumbbell className="h-5 w-5" />
            {activeTeam ? `Ajouter un entraînement à ${activeTeam.name}` : 'Sélectionnez une équipe'}
          </button>
          <button
            onClick={handleOpenModal}
            disabled={!activeTeam}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors w-full sm:w-auto ${
              activeTeam 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-gray-400 text-gray-200 cursor-not-allowed'
            }`}
          >
            <Trophy className="h-5 w-5" />
            {activeTeam ? `Ajouter un match à ${activeTeam.name}` : 'Sélectionnez une équipe'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 sm:p-6 overflow-hidden">
        <div className="w-full overflow-x-auto">
          <div className="min-w-[600px] sm:min-w-0">
            <DragAndDropCalendar
              localizer={localizer}
              events={events}
              startAccessor={(event: object) => (event as RBCalendarEvent).start}
              endAccessor={(event: object) => (event as RBCalendarEvent).end}
              style={{ height: isMobile ? 520 : 600 }}
              onSelectEvent={handleCalendarEventClick}
              onEventDrop={moveEvent}
              draggableAccessor={() => true}
              onDoubleClickEvent={handleCalendarEventClick}
              eventPropGetter={eventPropGetter}
              components={{ event: CustomEvent }}
              views={isMobile ? ['agenda', 'day', 'week', 'month'] : ['month', 'week', 'day']}
              defaultView={isMobile ? 'agenda' : 'month'}
              toolbar={true}
              popup
              date={currentDate}
              onNavigate={setCurrentDate}
            />
          </div>
        </div>
      </div>

      {/* Modal d'ajout de match */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-[600px] max-h-[90vh] flex flex-col">
            {/* Header fixe */}
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl text-gray-800 font-semibold">Ajouter un match</h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-600 hover:text-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-800">Titre</label>
                  <Controller
                    name="title"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    )}
                  />
                  {errors.title && (
                    <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800">Date</label>
                  <Controller
                    name="date"
                    control={control}
                    render={({ field: { value, onChange } }) => (
                      <input
                        type="datetime-local"
                        value={value instanceof Date ? format(value, "yyyy-MM-dd'T'HH:mm") : ''}
                        onChange={(e) => {
                          const date = new Date(e.target.value);
                          if (!isNaN(date.getTime())) {
                            onChange(date);
                          }
                        }}
                        className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    )}
                  />
                  {errors.date && (
                    <p className="mt-1 text-sm text-red-600">{errors.date.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800">Lieu</label>
                  <Controller
                    name="location"
                    control={control}
                    render={({ field }) => (
                      <div className="mt-1">
                        <select
                          {...field}
                          className="block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-900"
                        >
                          <option value="Domicile">Domicile</option>
                          <option value="Exterieur">Exterieur</option>
                        </select>
                        {errors.location && (
                          <p className="mt-1 text-sm text-red-600">{errors.location.message}</p>
                        )}
                      </div>
                    )}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800">Type de compétition</label>
                  <Controller
                    name="competition"
                    control={control}
                    render={({ field }) => (
                      <div className="mt-1">
                        <select
                          {...field}
                          className="block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-900"
                        >
                          <option value="Championnat">Championnat</option>
                          <option value="Coupe">Coupe</option>
                          <option value="Amical">Amical</option>
                        </select>
                        {errors.competition && (
                          <p className="mt-1 text-sm text-red-600">{errors.competition.message}</p>
                        )}
                      </div>
                    )}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800">Nom de l'adversaire</label>
                  <Controller
                    name="opponent_team"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        placeholder="Ex: Team X (optionnel)"
                        className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-800">Score équipe</label>
                    <Controller
                      name="score_team"
                      control={control}
                      render={({ field }) => (
                        <input
                          type="number"
                          min="0"
                          className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          {...field}
                        />
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-800">Score adversaire</label>
                    <Controller
                      name="score_opponent"
                      control={control}
                      render={({ field }) => (
                        <input
                          type="number"
                          min="0"
                          className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          {...field}
                        />
                      )}
                    />
                  </div>
                </div>

                {/* Répartition des buts marqués */}
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Répartition des buts marqués</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-800">Phase Offensive</label>
                      <Controller
                        name="goals_by_type.offensive"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            {...field}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-800">Transition</label>
                      <Controller
                        name="goals_by_type.transition"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            {...field}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-800">CPA</label>
                      <Controller
                        name="goals_by_type.cpa"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            {...field}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-800">Supériorité</label>
                      <Controller
                        name="goals_by_type.superiority"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            {...field}
                          />
                        )}
                      />
                    </div>
                  </div>
                </div>

                {/* Répartition des buts encaissés */}
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Répartition des buts encaissés</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-800">Phase Offensive</label>
                      <Controller
                        name="conceded_by_type.offensive"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            {...field}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-800">Transition</label>
                      <Controller
                        name="conceded_by_type.transition"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            {...field}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-800">CPA</label>
                      <Controller
                        name="conceded_by_type.cpa"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            {...field}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-800">Supériorité</label>
                      <Controller
                        name="conceded_by_type.superiority"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            {...field}
                          />
                        )}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-2">Joueurs participants</label>
                  <div className="border rounded-md overflow-hidden">
                    {/* Header de la table */}
                    <div className="hidden sm:grid grid-cols-12 gap-4 bg-gray-50 p-3 border-b">
                      <div className="col-span-4">
                        <span className="text-sm font-medium text-gray-800">Joueur</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm font-medium text-gray-800">Buts marqués</span>
                      </div>
                      <div className="col-span-3">
                        <span className="text-sm font-medium text-gray-800">Cartons jaunes</span>
                      </div>
                      <div className="col-span-3">
                        <span className="text-sm font-medium text-gray-800">Cartons rouges</span>
                      </div>
                    </div>

                    {/* Liste des joueurs */}
                    <div className="max-h-[300px] overflow-y-auto divide-y">
                      {players.map(player => {
                        const isPlayerPresent = watch(`players.${player.id}.present`);
                        
                        return (
                          <div 
                            key={player.id} 
                            className="grid grid-cols-1 sm:grid-cols-12 gap-4 p-3 hover:bg-gray-50"
                          >
                            {/* Case à cocher et nom du joueur */}
                            <div className="flex items-center gap-3 sm:col-span-4">
                              <Controller
                                name={`players.${player.id}.present`}
                                control={control}
                                defaultValue={false}
                                render={({ field: { value, onChange } }) => (
                                  <input
                                    type="checkbox"
                                    checked={value ?? false}
                                    onChange={(e) => onChange(e.target.checked)}
                                    className="rounded border-gray-400 text-blue-600 focus:ring-blue-500"
                                  />
                                )}
                              />
                              <span className="text-sm text-gray-900">
                                {player.first_name} {player.last_name}
                              </span>
                            </div>

                            {/* Buts marqués */}
                            <div className="sm:col-span-2">
                              <label className="text-xs font-medium text-gray-600 sm:hidden">Buts marqués</label>
                              <Controller
                                name={`players.${player.id}.goals`}
                                control={control}
                                defaultValue={0}
                                render={({ field: { value, onChange } }) => (
                                  <input
                                    type="number"
                                    min="0"
                                    value={value || 0}
                                    onChange={(e) => onChange(parseInt(e.target.value) || 0)}
                                    disabled={!isPlayerPresent}
                                    className={`w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm text-gray-900 ${
                                      !isPlayerPresent ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                                    }`}
                                  />
                                )}
                              />
                            </div>

                            {/* Cartons jaunes */}
                            <div className="sm:col-span-3">
                              <label className="text-xs font-medium text-gray-600 sm:hidden">Cartons jaunes</label>
                              <Controller
                                name={`players.${player.id}.yellow_cards`}
                                control={control}
                                defaultValue={0}
                                render={({ field: { value, onChange } }) => (
                                  <input
                                    type="number"
                                    min="0"
                                    value={value || 0}
                                    onChange={(e) => onChange(parseInt(e.target.value) || 0)}
                                    disabled={!isPlayerPresent}
                                    className={`w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm text-gray-900 ${
                                      !isPlayerPresent ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                                    }`}
                                  />
                                )}
                              />
                            </div>

                            {/* Cartons rouges */}
                            <div className="sm:col-span-3">
                              <label className="text-xs font-medium text-gray-600 sm:hidden">Cartons rouges</label>
                              <Controller
                                name={`players.${player.id}.red_cards`}
                                control={control}
                                defaultValue={0}
                                render={({ field: { value, onChange } }) => (
                                  <input
                                    type="number"
                                    min="0"
                                    value={value || 0}
                                    onChange={(e) => onChange(parseInt(e.target.value) || 0)}
                                    disabled={!isPlayerPresent}
                                    className={`w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm text-gray-900 ${
                                      !isPlayerPresent ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                                    }`}
                                  />
                                )}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Footer fixe */}
            <div className="flex justify-end gap-2 p-6 border-t bg-gray-50">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 text-sm font-medium text-gray-800 bg-white border border-gray-400 rounded-md hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                onClick={handleSubmit(onSubmit)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'ajout d'entraînement */}
      {isTrainingModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-[800px] max-h-[90vh] flex flex-col">
            {/* Header fixe */}
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Ajouter un entraînement</h2>
              <button
                onClick={handleCloseTrainingModal}
                className="text-gray-600 hover:text-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Indicateur de page */}
            <div className="flex items-center justify-center gap-2 p-2 border-b bg-gray-50">
              <div className={`w-2 h-2 rounded-full ${trainingFormPage === 1 ? 'bg-green-600' : 'bg-gray-300'}`} />
              <div className={`w-2 h-2 rounded-full ${trainingFormPage === 2 ? 'bg-green-600' : 'bg-gray-300'}`} />
            </div>

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-y-auto p-4">
              <form onSubmit={handleTrainingSubmit(onSubmitTraining)} className="space-y-3">
                {trainingFormPage === 1 ? (
                  <>
                <div>
                  <label className="block text-xs font-medium text-gray-800 mb-1">Date</label>
                  <Controller
                    name="date"
                    control={trainingControl}
                    render={({ field: { value, onChange } }) => (
                      <input
                        type="datetime-local"
                        value={value instanceof Date ? format(value, "yyyy-MM-dd'T'HH:mm") : ''}
                        onChange={(e) => {
                          const date = new Date(e.target.value);
                          if (!isNaN(date.getTime())) {
                            onChange(date);
                          }
                        }}
                        className="block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm py-1.5"
                      />
                    )}
                  />
                  {trainingErrors.date && (
                    <p className="mt-0.5 text-xs text-red-600">{trainingErrors.date.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-800 mb-1">Lieu</label>
                  <Controller
                    name="location"
                    control={trainingControl}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        className="block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm py-1.5"
                      />
                    )}
                  />
                  {trainingErrors.location && (
                    <p className="mt-0.5 text-xs text-red-600">{trainingErrors.location.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-800 mb-1">Thème</label>
                  <Controller
                    name="theme"
                    control={trainingControl}
                    render={({ field }) => (
                      <div>
                        <select
                          {...field}
                          className="block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-900 text-sm py-1.5"
                        >
                          <option value="Offensif">Offensif</option>
                          <option value="Défensif">Défensif</option>
                          <option value="Transition">Transition</option>
                          <option value="Supériorité">Supériorité</option>
                        </select>
                        {trainingErrors.theme && (
                          <p className="mt-0.5 text-xs text-red-600">{trainingErrors.theme.message}</p>
                        )}
                      </div>
                    )}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-800 mb-1">Principe clé</label>
                  <Controller
                    name="key_principle"
                    control={trainingControl}
                    render={({ field }) => (
                      <textarea
                        {...field}
                        rows={2}
                        className="block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm py-1.5"
                      />
                    )}
                  />
                  {trainingErrors.key_principle && (
                    <p className="mt-0.5 text-xs text-red-600">{trainingErrors.key_principle.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-800 mb-1.5">Statut des joueurs</label>
                  <div className="border rounded-md overflow-hidden">
                    <div className="max-h-[200px] overflow-y-auto divide-y">
                      {players.map(player => (
                        <div 
                          key={player.id} 
                          className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 hover:bg-gray-50"
                        >
                          <span className="text-sm text-gray-900 flex-1">
                            {player.first_name} {player.last_name}
                          </span>
                          
                          <div className="flex flex-wrap items-center gap-3 sm:gap-4 sm:justify-end">
                            <Controller
                              name={`players.${player.id}.status`}
                              control={trainingControl}
                              defaultValue="present"
                              render={({ field: { value, onChange } }) => (
                                <div className="flex items-center gap-3">
                                  <label className="flex items-center gap-1 text-xs">
                                    <input
                                      type="radio"
                                      name={`status-${player.id}`}
                                      value="present"
                                      checked={value === "present"}
                                      onChange={(e) => onChange(e.target.value as PlayerStatus)}
                                      className="text-green-600 focus:ring-green-500"
                                    />
                                    <span className="text-green-700">✅</span>
                                  </label>
                                  
                                  <label className="flex items-center gap-1 text-xs">
                                    <input
                                      type="radio"
                                      name={`status-${player.id}`}
                                      value="absent"
                                      checked={value === "absent"}
                                      onChange={(e) => onChange(e.target.value as PlayerStatus)}
                                      className="text-red-600 focus:ring-red-500"
                                    />
                                    <span className="text-red-700">❌</span>
                                  </label>
                                  
                                  <label className="flex items-center gap-1 text-xs">
                                    <input
                                      type="radio"
                                      name={`status-${player.id}`}
                                      value="injured"
                                      checked={value === "injured"}
                                      onChange={(e) => onChange(e.target.value as PlayerStatus)}
                                      className="text-orange-600 focus:ring-orange-500"
                                    />
                                    <span className="text-orange-700">🩹</span>
                                  </label>

                                  <label className="flex items-center gap-1 text-xs">
                                    <input
                                      type="radio"
                                      name={`status-${player.id}`}
                                      value="late"
                                      checked={value === "late"}
                                      onChange={(e) => onChange(e.target.value as PlayerStatus)}
                                      className="text-yellow-600 focus:ring-yellow-500"
                                    />
                                    <span className="text-yellow-700">⏰ Retard</span>
                                  </label>
                                </div>
                              )}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {isEditing && editingEvent?.type === 'training' && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs font-medium text-blue-900 mb-2">Liens questionnaire (présents / retards)</p>
                    <p className="text-xs text-blue-800 mb-2">Envoyez ces liens aux joueurs pour qu&apos;ils remplissent le questionnaire de fin de séance.</p>
                    <button
                      type="button"
                      onClick={handleGenerateFeedbackLinks}
                      disabled={feedbackLinksGenerating || feedbackLinksLoading}
                      className="mb-3 text-xs font-medium text-blue-700 hover:text-blue-900 underline disabled:opacity-50"
                    >
                      {feedbackLinksGenerating ? 'Génération…' : 'Générer / actualiser les liens'}
                    </button>
                    {feedbackLinksLoading ? (
                      <p className="text-xs text-blue-700">Chargement…</p>
                    ) : feedbackLinks.length === 0 ? (
                      <p className="text-xs text-blue-700">Cliquez sur « Générer / actualiser les liens » ci-dessus (au moins un joueur doit être Présent ou Retard et l&apos;entraînement enregistré).</p>
                    ) : (
                      <ul className="space-y-2">
                        {feedbackLinks.map((link, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="text-xs text-gray-800 truncate flex-1">{link.player_name}</span>
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard.writeText(link.url); setSuccess('Lien copié'); setTimeout(() => setSuccess(null), 2000); }}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              Copier
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                  </>
                ) : (
                  <>
                    <h3 className="text-base font-semibold text-gray-900 mb-3">
                      Comment souhaitez-vous organiser votre séance ?
                    </h3>

                    {/* Durée de séance et Nombre de joueurs côte à côte */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Durée de la séance */}
                      <div>
                        <label className="block text-xs font-medium text-gray-800 mb-1">
                          Durée de la séance (minutes)
                        </label>
                        <Controller
                          name="sessionDuration"
                          control={trainingControl}
                          render={({ field: { value, onChange } }) => {
                            const duration = value || 60;
                            return (
                              <div className="space-y-1.5">
                                <input
                                  type="range"
                                  min="45"
                                  max="150"
                                  value={duration}
                                  onChange={(e) => {
                                    const newDuration = parseInt(e.target.value) || 60;
                                    onChange(newDuration);
                                  }}
                                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-gray-600">45 min</span>
                                  <span className="text-sm font-semibold text-blue-600">{duration} min</span>
                                  <span className="text-xs text-gray-600">150 min</span>
                                </div>
                              </div>
                            );
                          }}
                        />
                      </div>

                      {/* Nombre de joueurs présents */}
                      <div>
                        <label className="block text-xs font-medium text-gray-800 mb-1">
                          Nombre de joueurs présents
                        </label>
                        <Controller
                          name="players"
                          control={trainingControl}
                          render={({ field }) => {
                            const presentCount = Object.values(field.value || {}).filter((p: any) => 
                              p?.status === 'present' || p?.status === 'late'
                            ).length;
                            const totalPlayers = players.length;
                            
                            return (
                              <div className="space-y-1.5">
                                <input
                                  type="range"
                                  min="0"
                                  max={totalPlayers}
                                  value={presentCount}
                                  onChange={(e) => {
                                    const targetCount = parseInt(e.target.value);
                                    const currentPresent = Object.entries(field.value || {}).filter(([_, p]: [string, any]) => 
                                      p?.status === 'present' || p?.status === 'late'
                                    );
                                    
                                    if (targetCount > currentPresent.length) {
                                      // Ajouter des joueurs présents
                                      const absentPlayers = players.filter(p => {
                                        const playerData = field.value?.[p.id];
                                        return !playerData || (playerData.status !== 'present' && playerData.status !== 'late');
                                      });
                                      const toAdd = targetCount - currentPresent.length;
                                      const newValue = { ...field.value };
                                      
                                      for (let i = 0; i < Math.min(toAdd, absentPlayers.length); i++) {
                                        newValue[absentPlayers[i].id] = {
                                          id: absentPlayers[i].id,
                                          status: 'present' as PlayerStatus
                                        };
                                      }
                                      field.onChange(newValue);
                                    } else if (targetCount < currentPresent.length) {
                                      // Retirer des joueurs présents
                                      const toRemove = currentPresent.length - targetCount;
                                      const newValue = { ...field.value };
                                      let removed = 0;
                                      
                                      for (const [playerId, playerData] of currentPresent) {
                                        if (removed < toRemove) {
                                          newValue[playerId] = {
                                            id: playerId,
                                            status: 'absent' as PlayerStatus
                                          };
                                          removed++;
                                        }
                                      }
                                      field.onChange(newValue);
                                    }
                                  }}
                                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-gray-600">0 joueur</span>
                                  <span className="text-sm font-semibold text-green-600">{presentCount} joueurs</span>
                                  <span className="text-xs text-gray-600">{totalPlayers} joueurs</span>
                                </div>
                              </div>
                            );
                          }}
                        />
                      </div>
                    </div>

                    {/* Organisation de la séance */}
                    <div>
                      <label className="block text-xs font-medium text-gray-800 mb-1.5">
                        Organisation de la séance
                      </label>
                      
                      <div className="space-y-2 mb-3">
                        {(watchTraining('sessionParts') || []).map((part: SessionPart, index: number) => {
                          const typeColors: Record<string, string> = {
                            Echauffement: 'bg-green-100 text-green-800 border-green-300',
                            Exercice: 'bg-orange-100 text-orange-800 border-orange-300',
                            Situation: 'bg-blue-100 text-blue-800 border-blue-300',
                            Jeu: 'bg-purple-100 text-purple-800 border-purple-300'
                          };
                          
                          const selectedProcedure = availableProcedures.find(p => p.id === part.procedureId);
                          const isDragging = draggedPartId === part.id;
                          
                          // Calculer l'heure de début et de fin en fonction de l'ordre
                          const currentParts = watchTraining('sessionParts') || [];
                          const startTime = currentParts.slice(0, index).reduce((sum: number, p: SessionPart) => sum + p.duration, 0);
                          const endTime = startTime + part.duration;
                          
                          // Formater les heures (0:00 - 1:30 format)
                          const formatTime = (minutes: number) => {
                            const hours = Math.floor(minutes / 60);
                            const mins = Math.floor(minutes % 60);
                            if (hours > 0) {
                              return mins > 0 ? `${hours}h${mins}` : `${hours}h`;
                            }
                            return `${mins}mn`;
                          };
                          
                          return (
                            <div
                              key={part.id}
                              draggable
                              onDragStart={(e) => {
                                setDraggedPartId(part.id);
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', part.id);
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                const draggedId = e.dataTransfer.getData('text/plain');
                                if (draggedId !== part.id) {
                                  const currentParts = watchTraining('sessionParts') || [];
                                  const draggedIndex = currentParts.findIndex((p: SessionPart) => p.id === draggedId);
                                  const dropIndex = currentParts.findIndex((p: SessionPart) => p.id === part.id);
                                  
                                  if (draggedIndex !== -1 && dropIndex !== -1) {
                                    const newParts = [...currentParts];
                                    const [removed] = newParts.splice(draggedIndex, 1);
                                    newParts.splice(dropIndex, 0, removed);
                                    setTrainingValue('sessionParts', newParts);
                                  }
                                }
                                setDraggedPartId(null);
                              }}
                              onDragEnd={() => {
                                setDraggedPartId(null);
                              }}
                              className={`flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-lg border cursor-move transition-all ${
                                typeColors[part.type] || 'bg-gray-100'
                              } ${isDragging ? 'opacity-50 scale-95' : 'hover:shadow-md'}`}
                            >
                              <div className="flex items-center gap-2 flex-1">
                                <GripVertical className="h-4 w-4 text-gray-600 cursor-grab active:cursor-grabbing" />
                                <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
                                  <span className="text-sm font-medium">{part.type}</span>
                                  <span className="text-xs text-gray-600">
                                    {formatTime(startTime)} - {formatTime(endTime)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <label className="text-xs text-gray-600">Durée:</label>
                                  <input
                                    type="number"
                                    min="5"
                                    max={watchTraining('sessionDuration') || 60}
                                    value={Math.round(part.duration)}
                                    onChange={(e) => {
                                      const newDuration = Math.max(5, Math.min(parseInt(e.target.value) || 5, watchTraining('sessionDuration') || 60));
                                      const currentParts = watchTraining('sessionParts') || [];
                                      const updated = currentParts.map((p: SessionPart) =>
                                        p.id === part.id ? { ...p, duration: newDuration } : p
                                      );
                                      setTrainingValue('sessionParts', updated);
                                    }}
                                    className="w-14 px-1.5 py-0.5 text-xs rounded border border-gray-400 focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-900"
                                  />
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (selectedProcedure) {
                                      // Afficher les détails du procédé
                                      setViewingProcedure(selectedProcedure);
                                      // Charger le schéma si présent
                                      if (selectedProcedure.schematic_id && activeTeam?.id) {
                                        schematicsService.getSchematicById(selectedProcedure.schematic_id)
                                          .then((schematic) => {
                                            if (schematic && schematic.data) {
                                              setProcedureDetailSchematic(schematic.data);
                                            } else {
                                              setProcedureDetailSchematic(null);
                                            }
                                          })
                                          .catch((err) => {
                                            console.error('Erreur lors du chargement du schéma pour la prévisualisation:', err);
                                            setProcedureDetailSchematic(null);
                                          });
                                      } else {
                                        setProcedureDetailSchematic(null);
                                      }
                                    } else {
                                      // Charger un nouveau procédé
                                      setSelectedProcedureForPart({ partId: part.id, procedureId: part.procedureId || null });
                                    }
                                  }}
                                  className="px-2 py-0.5 text-xs font-medium bg-white rounded hover:bg-gray-50 border"
                                >
                                  {selectedProcedure ? selectedProcedure.title : 'Charger un procédé'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentParts = watchTraining('sessionParts') || [];
                                    const updated = currentParts.filter((p: SessionPart) => p.id !== part.id);
                                    setTrainingValue('sessionParts', updated);
                                  }}
                                  className="p-0.5 text-red-600 hover:text-red-800"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Ajouter un type d'exercice */}
                      <div className="flex gap-2 mb-2">
                        <select
                          id="newPartType"
                          className="flex-1 rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-1 bg-white text-gray-900"
                          defaultValue="Jeu"
                        >
                          <option value="Echauffement">Echauffement</option>
                          <option value="Exercice">Exercice</option>
                          <option value="Situation">Situation</option>
                          <option value="Jeu">Jeu</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const select = document.getElementById('newPartType') as HTMLSelectElement;
                            const newType = select.value as 'Echauffement' | 'Exercice' | 'Situation' | 'Jeu';
                            const currentParts = watchTraining('sessionParts') || [];
                            const totalDuration = watchTraining('sessionDuration') || 60;
                            const currentTotal = currentParts.reduce((sum: number, p: SessionPart) => sum + p.duration, 0);
                            const remaining = totalDuration - currentTotal;
                            const newDuration = remaining > 0 ? Math.min(remaining, 20) : 10;
                            
                            // Demander la durée par défaut (10 min pour échauffement, 15 pour les autres)
                            const defaultDuration = newType === 'Echauffement' ? 10 : 15;
                            const newPart: SessionPart = {
                              id: Date.now().toString(),
                              type: newType,
                              duration: defaultDuration,
                              procedureId: null
                            };
                            
                            setTrainingValue('sessionParts', [...currentParts, newPart]);
                          }}
                          className="px-3 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-300 rounded-md hover:bg-green-100"
                        >
                          <Plus className="h-3.5 w-3.5 inline mr-1" />
                          Ajouter
                        </button>
                      </div>

                      {/* Réglette unique pour toutes les jonctions */}
                      {(watchTraining('sessionParts') || []).length > 1 && (
                        <div className="mt-3 space-y-1.5">
                          <h4 className="text-xs font-medium text-gray-800">
                            Ajustez ici la durée de chaque partie de la séance
                          </h4>
                          <div className="relative h-12 bg-gray-200 rounded-lg overflow-hidden">
                            {(watchTraining('sessionParts') || []).map((part: SessionPart, index: number) => {
                              const totalDuration = watchTraining('sessionDuration') || 60;
                              const currentParts = watchTraining('sessionParts') || [];
                              
                              // Calculer la position de début en additionnant les durées des segments précédents
                              const startTime = currentParts.slice(0, index).reduce((sum: number, p: SessionPart) => sum + p.duration, 0);
                              const leftPercent = (startTime / totalDuration) * 100;
                              const width = (part.duration / totalDuration) * 100;
                              
                              // Couleurs pour les segments
                              const partColors: Record<string, string> = {
                                Echauffement: '#10b981',
                                Exercice: '#f97316',
                                Situation: '#3b82f6',
                                Jeu: '#a855f7'
                              };
                              
                              return (
                                <div
                                  key={part.id}
                                  className="absolute h-full flex items-center justify-center"
                                  style={{
                                    left: `${leftPercent}%`,
                                    width: `${width}%`,
                                    backgroundColor: partColors[part.type] || '#9ca3af',
                                    opacity: 0.8
                                  }}
                                >
                                  <span className="text-xs font-medium text-white px-2">
                                    {part.type} (~{Math.round(part.duration)}mn)
                                  </span>
                                </div>
                              );
                            })}
                            
                            {/* Poignées pour chaque jonction */}
                            {(watchTraining('sessionParts') || []).slice(0, -1).map((part: SessionPart, index: number) => {
                              const nextPart = (watchTraining('sessionParts') || [])[index + 1];
                              const totalDuration = watchTraining('sessionDuration') || 60;
                              const currentParts = watchTraining('sessionParts') || [];
                              
                              // Calculer la position de la poignée (fin du procédé actuel = début du suivant)
                              const startTime = currentParts.slice(0, index + 1).reduce((sum: number, p: SessionPart) => sum + p.duration, 0);
                              const positionPercent = (startTime / totalDuration) * 100;
                              
                              return (
                                <div
                                  key={`handle-${part.id}`}
                                  className="absolute top-0 bottom-0 w-2 cursor-ew-resize z-10 flex items-center justify-center bg-gray-800 hover:bg-gray-900 transition-colors"
                                  style={{
                                    left: `${positionPercent}%`,
                                    transform: 'translateX(-50%)'
                                  }}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const slider = e.currentTarget.parentElement;
                                    if (!slider) return;
                                    
                                    const sliderRect = slider.getBoundingClientRect();
                                    const startX = e.clientX;
                                    const startPartDuration = part.duration;
                                    const startNextDuration = nextPart.duration;
                                    const totalAdjacent = startPartDuration + startNextDuration;
                                    
                                    const handleMove = (moveEvent: MouseEvent) => {
                                      moveEvent.preventDefault();
                                      const deltaX = moveEvent.clientX - startX;
                                      const deltaPercent = (deltaX / sliderRect.width) * 100;
                                      const deltaMinutes = (deltaPercent / 100) * totalDuration;
                                      
                                      // Calculer les nouvelles durées
                                      const newPartDuration = startPartDuration + deltaMinutes;
                                      const newNextDuration = startNextDuration - deltaMinutes;
                                      
                                      // Vérifier les contraintes (minimum 5 minutes pour chaque)
                                      if (newPartDuration >= 5 && newNextDuration >= 5) {
                                        const updated = currentParts.map((p: SessionPart) => {
                                          if (p.id === part.id) {
                                            return { ...p, duration: Math.round(newPartDuration * 10) / 10 };
                                          }
                                          if (p.id === nextPart.id) {
                                            return { ...p, duration: Math.round(newNextDuration * 10) / 10 };
                                          }
                                          return p;
                                        });
                                        setTrainingValue('sessionParts', updated);
                                      }
                                    };
                                    
                                    const handleUp = () => {
                                      document.removeEventListener('mousemove', handleMove);
                                      document.removeEventListener('mouseup', handleUp);
                                    };
                                    
                                    document.addEventListener('mousemove', handleMove);
                                    document.addEventListener('mouseup', handleUp);
                                  }}
                                >
                                  <GripVertical className="h-6 w-6 text-white" />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {/* Message si aucune partie n'est définie */}
                      {(watchTraining('sessionParts') || []).length === 0 && (
                        <div className="text-center py-8 text-gray-600 border-2 border-dashed border-gray-400 rounded-lg">
                          <p className="text-sm">Aucune partie définie. Ajoutez des parties pour organiser votre séance.</p>
                        </div>
                      )}
                    </div>

                    {/* Modal pour sélectionner un procédé */}
                    {selectedProcedureForPart && (() => {
                      const targetPartType = (watchTraining('sessionParts') || []).find((sp: SessionPart) => sp.id === selectedProcedureForPart.partId)?.type;
                      const filteredProcedures = availableProcedures.filter((p) => {
                        // Filtrer par type du procédé de la partie
                        if (p.type !== targetPartType) return false;
                        
                        // Filtrer par recherche (titre et objectifs)
                        if (procedureSearchTerm.trim()) {
                          const searchLower = procedureSearchTerm.toLowerCase();
                          const matchesTitle = p.title?.toLowerCase().includes(searchLower);
                          const matchesObjectives = p.objectives?.toLowerCase().includes(searchLower);
                          if (!matchesTitle && !matchesObjectives) return false;
                        }
                        
                        // Filtrer par thème
                        if (procedureFilterTheme && p.theme !== procedureFilterTheme) return false;
                        
                        return true;
                      });

                      const themes = ['Offensif', 'Defensif', 'Transition', 'CPA'] as const;

                      return (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
                          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
                            {/* Header */}
                            <div className="flex justify-between items-center px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
                              <h3 className="text-xl font-bold text-gray-900">Sélectionner un procédé</h3>
                              <button
                                onClick={() => {
                                  setSelectedProcedureForPart(null);
                                  setProcedureSearchTerm('');
                                  setProcedureFilterTheme(null);
                                }}
                                className="text-gray-600 hover:text-gray-800 transition-colors p-1 rounded-lg hover:bg-white"
                              >
                                <X className="h-5 w-5" />
                              </button>
                            </div>

                            {/* Barre de recherche et filtres */}
                            <div className="px-6 py-4 border-b bg-gray-50 space-y-3">
                              {/* Barre de recherche */}
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-600" />
                                <input
                                  type="text"
                                  placeholder="Rechercher par titre ou objectifs..."
                                  value={procedureSearchTerm}
                                  onChange={(e) => setProcedureSearchTerm(e.target.value)}
                                  className="w-full pl-10 pr-4 py-2.5 border border-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white placeholder-gray-600"
                                />
                              </div>

                              {/* Filtres par thème */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <Filter className="h-4 w-4 text-gray-600" />
                                <span className="text-sm font-medium text-gray-800">Filtrer par thème:</span>
                                <button
                                  onClick={() => setProcedureFilterTheme(null)}
                                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                    procedureFilterTheme === null
                                      ? 'bg-blue-600 text-white shadow-md'
                                      : 'bg-white text-gray-800 border border-gray-400 hover:bg-gray-100'
                                  }`}
                                >
                                  Tous
                                </button>
                                {themes.map((theme) => (
                                  <button
                                    key={theme}
                                    onClick={() => setProcedureFilterTheme(procedureFilterTheme === theme ? null : theme)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                      procedureFilterTheme === theme
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'bg-white text-gray-800 border border-gray-400 hover:bg-gray-100'
                                    }`}
                                  >
                                    {theme}
                                  </button>
                                ))}
                              </div>

                              {/* Compteur de résultats */}
                              <div className="text-sm text-gray-600">
                                {filteredProcedures.length} procédé{filteredProcedures.length !== 1 ? 's' : ''} trouvé{filteredProcedures.length !== 1 ? 's' : ''}
                              </div>
                            </div>

                            {/* Liste des procédés */}
                            <div className="flex-1 overflow-y-auto p-6">
                              {filteredProcedures.length === 0 ? (
                                <div className="text-center py-12 text-gray-600">
                                  <Search className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                                  <p className="text-sm font-medium">Aucun procédé trouvé</p>
                                  <p className="text-xs mt-1">Essayez de modifier vos critères de recherche ou filtres</p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 gap-3">
                                  {filteredProcedures.map((procedure) => (
                                    <button
                                      key={procedure.id}
                                      type="button"
                                      onClick={() => {
                                        const currentParts = watchTraining('sessionParts') || [];
                                        const updated = currentParts.map((p: SessionPart) =>
                                          p.id === selectedProcedureForPart.partId
                                            ? { ...p, procedureId: procedure.id }
                                            : p
                                        );
                                        setTrainingValue('sessionParts', updated);
                                        setSelectedProcedureForPart(null);
                                        setProcedureSearchTerm('');
                                        setProcedureFilterTheme(null);
                                      }}
                                      className="w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all bg-white group"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                          <div className="font-semibold text-gray-900 text-base mb-2 group-hover:text-blue-600 transition-colors">
                                            {procedure.title}
                                          </div>
                                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                              {procedure.type}
                                            </span>
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                              {procedure.theme}
                                            </span>
                                            {procedure.duration_minutes && (
                                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                                {procedure.duration_minutes} min
                                              </span>
                                            )}
                                          </div>
                                          {procedure.objectives && (
                                            <p className="text-sm text-gray-600 line-clamp-2 mt-2">
                                              {procedure.objectives}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </form>
            </div>

            {/* Footer fixe */}
            <div className="flex justify-between items-center gap-2 p-4 border-t bg-gray-50">
              <button
                type="button"
                onClick={handleCloseTrainingModal}
                className="px-4 py-2 text-sm font-medium text-gray-800 bg-white border border-gray-400 rounded-md hover:bg-gray-50"
              >
                Annuler
              </button>
              
              <div className="flex gap-2">
                {trainingFormPage === 1 ? (
                  <button
                    type="button"
                    onClick={() => setTrainingFormPage(2)}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 flex items-center gap-2"
                  >
                    Suivant
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setTrainingFormPage(1)}
                      className="px-4 py-2 text-sm font-medium text-gray-800 bg-white border border-gray-400 rounded-md hover:bg-gray-50 flex items-center gap-2"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Précédent
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        console.log('Bouton Ajouter cliqué');
                        console.log('Données du formulaire:', watchTraining());
                        handleTrainingSubmit(onSubmitTraining)().catch((err) => {
                          console.error('Erreur lors de la soumission:', err);
                          setError('Erreur lors de la soumission du formulaire');
                        });
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                    >
                      Ajouter
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de détails du procédé */}
      {viewingProcedure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-start gap-4 border-b px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{viewingProcedure.title}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    {viewingProcedure.theme}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                    {viewingProcedure.type}
                  </span>
                  {viewingProcedure.duration_minutes && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      {viewingProcedure.duration_minutes} min
                    </span>
                  )}
                  {viewingProcedure.min_players && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      {viewingProcedure.min_players} joueurs minimum
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setViewingProcedure(null);
                  setProcedureDetailSchematic(null);
                }}
                className="text-gray-600 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Colonne gauche : Texte */}
                <div className="space-y-4">
                  {viewingProcedure.image_url && (
                    <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-200">
                      <Image
                        src={viewingProcedure.image_url}
                        alt={`Illustration pour ${viewingProcedure.title}`}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}

                  <section>
                    <h3 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
                      Objectifs
                    </h3>
                    <p className="mt-1 text-sm text-gray-800 whitespace-pre-line">{viewingProcedure.objectives}</p>
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
                      Consignes / Règles
                    </h3>
                    <p className="mt-1 text-sm text-gray-800 whitespace-pre-line">{viewingProcedure.instructions}</p>
                  </section>

                  {viewingProcedure.variants && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
                        Variantes
                      </h3>
                      <p className="mt-1 text-sm text-gray-800 whitespace-pre-line">{viewingProcedure.variants}</p>
                    </section>
                  )}

                  {viewingProcedure.corrections && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
                        Correctifs / Comportements attendus
                      </h3>
                      <p className="mt-1 text-sm text-gray-800 whitespace-pre-line">{viewingProcedure.corrections}</p>
                    </section>
                  )}

                  {(viewingProcedure.field_dimensions || viewingProcedure.duration_minutes || viewingProcedure.min_players) && (
                    <section className="grid gap-3 sm:grid-cols-3">
                      {viewingProcedure.field_dimensions && (
                        <div className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            Dimension du terrain
                          </div>
                          <div className="mt-1 text-sm text-gray-800">{viewingProcedure.field_dimensions}</div>
                        </div>
                      )}
                      {viewingProcedure.duration_minutes && (
                        <div className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            Durée indicative
                          </div>
                          <div className="mt-1 text-sm text-gray-800">{viewingProcedure.duration_minutes} minutes</div>
                        </div>
                      )}
                      {viewingProcedure.min_players && (
                        <div className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            Nombre de joueurs minimum
                          </div>
                          <div className="mt-1 text-sm text-gray-800">{viewingProcedure.min_players}</div>
                        </div>
                      )}
                    </section>
                  )}
                </div>

                {/* Colonne droite : Schéma */}
                <div className="space-y-4">
                  {viewingProcedure.schematic_id && procedureDetailSchematic && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-800 uppercase tracking-wide mb-2">
                        Schéma tactique
                      </h3>
                      <SchematicPreview data={procedureDetailSchematic} />
                      <button
                        onClick={() => router.push(`/webapp/library/schematics?schematic=${viewingProcedure.schematic_id}`)}
                        className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <Layout className="h-3 w-3" />
                        Ouvrir dans l'éditeur
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </section>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t px-6 py-4 bg-gray-50 flex justify-end">
              <button
                onClick={() => {
                  setViewingProcedure(null);
                  setProcedureDetailSchematic(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 