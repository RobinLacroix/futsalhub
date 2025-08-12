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
import { supabase } from '@/lib/supabaseClient';
import {
  X,
  AlertCircle,
  Dumbbell,
  Trophy
} from 'lucide-react';

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

interface Training {
  id: string;
  date: Date;
  location: string;
  theme: string;
  key_principle: string;
  players: {
    id: string;
    present: boolean;
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

interface TrainingFormData {
  date: Date;
  location: string;
  theme: TrainingTheme;
  key_principle: string;
  players: {
    [key: string]: {
      id: string;
      present: boolean;
    };
  };
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
  }),
  conceded_by_type: yup.object().shape({
    offensive: yup.number().min(0).default(0),
    transition: yup.number().min(0).default(0),
    cpa: yup.number().min(0).default(0),
    superiority: yup.number().min(0).default(0)
  })
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
        player && typeof player === 'object' && 'present' in player && player.present === true
      );
    }
  )
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



  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<MatchFormData>({
    resolver: yupResolver(matchSchema),
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

  const { control: trainingControl, handleSubmit: handleTrainingSubmit, reset: resetTraining, watch: watchTraining, formState: { errors: trainingErrors } } = useForm<TrainingFormData>({
    resolver: yupResolver(trainingSchema),
    defaultValues: {
      date: new Date(),
      location: '',
      theme: 'Offensif',
      key_principle: '',
      players: {}
    }
  });

  // Chargement des données
  useEffect(() => {
    fetchMatches();
    fetchTrainings();
    fetchPlayers();
    fetchTrainingStats();
    fetchMatchStats();
  }, []);

  const fetchMatches = async () => {
    try {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .order('date', { ascending: true });

      if (error) throw error;

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
      const { data, error } = await supabase
        .from('trainings')
        .select('*')
        .order('date', { ascending: true });

      if (error) throw error;

      setTrainings(data.map(training => ({
        ...training,
        date: new Date(training.date),
        players: training.players || [],
        type: 'training' as const
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des entraînements');
    }
  };

  const fetchPlayers = async () => {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('id, first_name, last_name')
        .order('last_name');

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
      const { data, error } = await supabase
        .from('trainings')
        .select('*')
        .order('date', { ascending: true });

      if (error) throw error;

      console.log('Données brutes des entraînements:', data);

      if (!data || data.length === 0) {
        console.log('Aucune donnée d\'entraînement trouvée');
        setTrainingStats([]);
        return;
      }

      const stats = data.map(training => ({
        date: format(new Date(training.date), 'dd/MM/yyyy'),
        attendance: Array.isArray(training.players) ? training.players.length : 0,
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
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .order('date', { ascending: true });

      if (error) throw error;

      console.log('Données brutes des matchs:', data);

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
      players: {}
    });
    setIsTrainingModalOpen(true);
  };

  const handleCloseTrainingModal = () => {
    setIsTrainingModalOpen(false);
    setIsEditing(false);
    setEditingEvent(null);
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

  const updateTrainingAttendance = async (players: { id: string; present: boolean }[]) => {
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
      };

      console.log('Données du formulaire à pré-remplir:', formData);
      reset(formData);
      setIsModalOpen(true);
    } else {
      console.log('Pré-remplissage du formulaire d\'entraînement');
      console.log('Joueurs de l\'événement:', event.players);

      // Pré-remplir le formulaire d'entraînement avec les joueurs présents
      const playersData = event.players.reduce((acc, player) => {
        console.log('Traitement du joueur:', player);
        acc[player.id] = {
          id: player.id,
          present: player.present
        };
        return acc;
      }, {} as { [key: string]: { id: string; present: boolean } });

      console.log('Données des joueurs préparées:', playersData);

      const formData = {
        date: event.date,
        location: event.location,
        theme: event.theme as TrainingTheme,
        key_principle: event.key_principle,
        players: playersData
      };

      console.log('Données du formulaire à pré-remplir:', formData);
      resetTraining(formData);
      setIsTrainingModalOpen(true);
    }
  };

  const handleUpdateMatch = async (data: MatchFormData) => {
    try {
      setError(null);
      if (!editingEvent || editingEvent.type !== 'match') return;

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

      // Nettoyer et formater les données des joueurs
      const cleanedPlayers = Object.entries(data.players)
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
          present: true
        }));

      const trainingData = {
        date: data.date.toISOString(),
        location: data.location,
        theme: data.theme,
        key_principle: data.key_principle,
        players: cleanedPlayers
      };

      // Mise à jour de l'entraînement
      const { error: trainingError } = await supabase
        .from('trainings')
        .update(trainingData)
        .eq('id', editingEvent.id);

      if (trainingError) throw trainingError;

      // Mise à jour de la présence aux entraînements
      await updateTrainingAttendance(cleanedPlayers);

      handleCloseTrainingModal();
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
                className="ml-2 text-gray-500 hover:text-red-600 cursor-pointer"
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
          conceded_by_type: data.conceded_by_type
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

        // Nettoyer et formater les données des joueurs
        const cleanedPlayers = Object.entries(data.players)
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
            present: true
          }));

        const trainingData = {
          date: data.date.toISOString(),
          location: data.location,
          theme: data.theme,
          key_principle: data.key_principle,
          players: cleanedPlayers
        };

        // Enregistrement de l'entraînement
        const { error: trainingError } = await supabase
          .from('trainings')
          .insert([trainingData]);

        if (trainingError) {
          console.error('Erreur lors de l\'enregistrement de l\'entraînement:', trainingError);
          throw trainingError;
        }

        // Mise à jour de la présence aux entraînements
        await updateTrainingAttendance(cleanedPlayers);

        handleCloseTrainingModal();
        fetchMatches();
        fetchPlayers();
      } catch (err) {
        console.error('Erreur lors de l\'enregistrement:', err);
        setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
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
    <div className="p-8">
      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-md flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Calendrier</h1>
        <div className="flex gap-4">
          <button
            onClick={handleOpenTrainingModal}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            <Dumbbell className="h-5 w-5" />
            Ajouter un entraînement
          </button>
          <button
            onClick={handleOpenModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Trophy className="h-5 w-5" />
            Ajouter un match
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <DragAndDropCalendar
          localizer={localizer}
          events={events}
          startAccessor={(event: object) => (event as RBCalendarEvent).start}
          endAccessor={(event: object) => (event as RBCalendarEvent).end}
          style={{ height: 600 }}
          onSelectEvent={handleCalendarEventClick}
          onEventDrop={moveEvent}
          draggableAccessor={() => true}
          onDoubleClickEvent={handleCalendarEventClick}
          eventPropGetter={eventPropGetter}
          components={{ event: CustomEvent }}
          views={['month', 'week', 'day']}
          defaultView="month"
          toolbar={true}
          popup
          date={currentDate}
          onNavigate={setCurrentDate}
        />
      </div>

      {/* Modal d'ajout de match */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-[600px] max-h-[90vh] flex flex-col">
            {/* Header fixe */}
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl text-gray-700 font-semibold">Ajouter un match</h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Titre</label>
                  <Controller
                    name="title"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    )}
                  />
                  {errors.title && (
                    <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Date</label>
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
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    )}
                  />
                  {errors.date && (
                    <p className="mt-1 text-sm text-red-600">{errors.date.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Lieu</label>
                  <Controller
                    name="location"
                    control={control}
                    render={({ field }) => (
                      <div className="mt-1">
                        <select
                          {...field}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
                  <label className="block text-sm font-medium text-gray-700">Type de compétition</label>
                  <Controller
                    name="competition"
                    control={control}
                    render={({ field }) => (
                      <div className="mt-1">
                        <select
                          {...field}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
                  <label className="block text-sm font-medium text-gray-700">Nom de l'adversaire</label>
                  <Controller
                    name="opponent_team"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        placeholder="Ex: Team X (optionnel)"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Score équipe</label>
                    <Controller
                      name="score_team"
                      control={control}
                      render={({ field }) => (
                        <input
                          type="number"
                          min="0"
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          {...field}
                        />
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Score adversaire</label>
                    <Controller
                      name="score_opponent"
                      control={control}
                      render={({ field }) => (
                        <input
                          type="number"
                          min="0"
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          {...field}
                        />
                      )}
                    />
                  </div>
                </div>

                {/* Répartition des buts marqués */}
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Répartition des buts marqués</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Phase Offensive</label>
                      <Controller
                        name="goals_by_type.offensive"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            {...field}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Transition</label>
                      <Controller
                        name="goals_by_type.transition"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            {...field}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">CPA</label>
                      <Controller
                        name="goals_by_type.cpa"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            {...field}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Supériorité</label>
                      <Controller
                        name="goals_by_type.superiority"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Phase Offensive</label>
                      <Controller
                        name="conceded_by_type.offensive"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            {...field}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Transition</label>
                      <Controller
                        name="conceded_by_type.transition"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            {...field}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">CPA</label>
                      <Controller
                        name="conceded_by_type.cpa"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            {...field}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Supériorité</label>
                      <Controller
                        name="conceded_by_type.superiority"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            {...field}
                          />
                        )}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Joueurs participants</label>
                  <div className="border rounded-md overflow-hidden">
                    {/* Header de la table */}
                    <div className="grid grid-cols-12 gap-4 bg-gray-50 p-3 border-b">
                      <div className="col-span-4">
                        <span className="text-sm font-medium text-gray-700">Joueur</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm font-medium text-gray-700">Buts marqués</span>
                      </div>
                      <div className="col-span-3">
                        <span className="text-sm font-medium text-gray-700">Cartons jaunes</span>
                      </div>
                      <div className="col-span-3">
                        <span className="text-sm font-medium text-gray-700">Cartons rouges</span>
                      </div>
                    </div>

                    {/* Liste des joueurs */}
                    <div className="max-h-[300px] overflow-y-auto">
                      {players.map(player => {
                        const isPlayerPresent = watch(`players.${player.id}.present`);
                        
                        return (
                          <div 
                            key={player.id} 
                            className="grid grid-cols-12 gap-4 p-3 border-b last:border-b-0 hover:bg-gray-50"
                          >
                            {/* Case à cocher et nom du joueur */}
                            <div className="col-span-4 flex items-center gap-2">
                              <Controller
                                name={`players.${player.id}.present`}
                                control={control}
                                defaultValue={false}
                                render={({ field: { value, onChange } }) => (
                                  <input
                                    type="checkbox"
                                    checked={value ?? false}
                                    onChange={(e) => onChange(e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                )}
                              />
                              <span className="text-sm text-gray-900">
                                {player.first_name} {player.last_name}
                              </span>
                            </div>

                            {/* Buts marqués */}
                            <div className="col-span-2">
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
                                    className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${
                                      !isPlayerPresent ? 'bg-gray-100 cursor-not-allowed' : ''
                                    }`}
                                  />
                                )}
                              />
                            </div>

                            {/* Cartons jaunes */}
                            <div className="col-span-3">
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
                                    className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${
                                      !isPlayerPresent ? 'bg-gray-100 cursor-not-allowed' : ''
                                    }`}
                                  />
                                )}
                              />
                            </div>

                            {/* Cartons rouges */}
                            <div className="col-span-3">
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
                                    className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${
                                      !isPlayerPresent ? 'bg-gray-100 cursor-not-allowed' : ''
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
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
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
          <div className="bg-white rounded-lg w-full max-w-[600px] max-h-[90vh] flex flex-col">
            {/* Header fixe */}
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold">Ajouter un entraînement</h2>
              <button
                onClick={handleCloseTrainingModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              <form onSubmit={handleTrainingSubmit(onSubmitTraining)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Date</label>
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
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    )}
                  />
                  {trainingErrors.date && (
                    <p className="mt-1 text-sm text-red-600">{trainingErrors.date.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Lieu</label>
                  <Controller
                    name="location"
                    control={trainingControl}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    )}
                  />
                  {trainingErrors.location && (
                    <p className="mt-1 text-sm text-red-600">{trainingErrors.location.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Thème</label>
                  <Controller
                    name="theme"
                    control={trainingControl}
                    render={({ field }) => (
                      <div className="mt-1">
                        <select
                          {...field}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                          <option value="Offensif">Offensif</option>
                          <option value="Défensif">Défensif</option>
                          <option value="Transition">Transition</option>
                          <option value="Supériorité">Supériorité</option>
                        </select>
                        {trainingErrors.theme && (
                          <p className="mt-1 text-sm text-red-600">{trainingErrors.theme.message}</p>
                        )}
                      </div>
                    )}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Principe clé</label>
                  <Controller
                    name="key_principle"
                    control={trainingControl}
                    render={({ field }) => (
                      <textarea
                        {...field}
                        rows={3}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    )}
                  />
                  {trainingErrors.key_principle && (
                    <p className="mt-1 text-sm text-red-600">{trainingErrors.key_principle.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Joueurs présents</label>
                  <div className="border rounded-md overflow-hidden">
                    <div className="max-h-[300px] overflow-y-auto">
                      {players.map(player => (
                        <div 
                          key={player.id} 
                          className="flex items-center gap-2 p-3 border-b last:border-b-0 hover:bg-gray-50"
                        >
                          <Controller
                            name={`players.${player.id}.present`}
                            control={trainingControl}
                            defaultValue={false}
                            render={({ field: { value, onChange } }) => (
                              <input
                                type="checkbox"
                                checked={value ?? false}
                                onChange={(e) => onChange(e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            )}
                          />
                          <span className="text-sm text-gray-900">
                            {player.first_name} {player.last_name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Footer fixe */}
            <div className="flex justify-end gap-2 p-6 border-t bg-gray-50">
              <button
                type="button"
                onClick={handleCloseTrainingModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                onClick={handleTrainingSubmit(onSubmitTraining)}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 