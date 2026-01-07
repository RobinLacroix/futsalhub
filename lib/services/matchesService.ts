import { supabase } from '../supabaseClient';
import type { Match, MatchFormData, MatchStats } from '@/types';
import { format } from 'date-fns';

export const matchesService = {
  /**
   * Récupère tous les matchs d'une équipe
   */
  async getMatchesByTeam(teamId: string): Promise<Match[]> {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .eq('team_id', teamId)
      .order('date', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * Récupère un match par son ID
   */
  async getMatchById(matchId: string): Promise<Match | null> {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Crée un nouveau match
   */
  async createMatch(matchData: MatchFormData, teamId: string): Promise<Match> {
    // Convertir les joueurs en format JSON
    const playersArray = Object.values(matchData.players)
      .filter(p => p.present)
      .map(p => ({
        id: p.id,
        goals: p.goals || 0,
        yellow_cards: p.yellow_cards || 0,
        red_cards: p.red_cards || 0
      }));

    const { data, error } = await supabase
      .from('matches')
      .insert({
        title: matchData.title,
        date: matchData.date.toISOString(),
        location: matchData.location,
        competition: matchData.competition,
        score_team: matchData.score_team,
        score_opponent: matchData.score_opponent,
        opponent_team: matchData.opponent_team || null,
        players: playersArray,
        goals_by_type: matchData.goals_by_type,
        conceded_by_type: matchData.conceded_by_type,
        team_id: teamId
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Met à jour un match
   */
  async updateMatch(matchId: string, matchData: Partial<MatchFormData>): Promise<Match> {
    const updateData: any = {};

    if (matchData.title) updateData.title = matchData.title;
    if (matchData.date) updateData.date = matchData.date.toISOString();
    if (matchData.location) updateData.location = matchData.location;
    if (matchData.competition) updateData.competition = matchData.competition;
    if (matchData.score_team !== undefined) updateData.score_team = matchData.score_team;
    if (matchData.score_opponent !== undefined) updateData.score_opponent = matchData.score_opponent;
    if (matchData.opponent_team !== undefined) updateData.opponent_team = matchData.opponent_team;
    if (matchData.goals_by_type) updateData.goals_by_type = matchData.goals_by_type;
    if (matchData.conceded_by_type) updateData.conceded_by_type = matchData.conceded_by_type;

    if (matchData.players) {
      const playersArray = Object.values(matchData.players)
        .filter(p => p.present)
        .map(p => ({
          id: p.id,
          goals: p.goals || 0,
          yellow_cards: p.yellow_cards || 0,
          red_cards: p.red_cards || 0
        }));
      updateData.players = playersArray;
    }

    const { data, error } = await supabase
      .from('matches')
      .update(updateData)
      .eq('id', matchId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Supprime un match
   */
  async deleteMatch(matchId: string): Promise<void> {
    const { error } = await supabase
      .from('matches')
      .delete()
      .eq('id', matchId);

    if (error) throw error;
  },

  /**
   * Récupère les statistiques de matchs formatées
   */
  async getMatchStats(teamId: string): Promise<MatchStats[]> {
    const matches = await this.getMatchesByTeam(teamId);

    return matches.map(match => {
      const title = match.title || '';
      let location: 'Domicile' | 'Exterieur' = 'Domicile';
      
      if (title.toLowerCase().includes('domicile') || 
          title.toLowerCase().includes('chez nous') ||
          title.toLowerCase().includes('à la maison')) {
        location = 'Domicile';
      } else if (title.toLowerCase().includes('exterieur') || 
                 title.toLowerCase().includes('dehors') ||
                 title.toLowerCase().includes('chez eux') ||
                 title.toLowerCase().includes('extérieur')) {
        location = 'Exterieur';
      }

      return {
        id: match.id,
        title: title,
        date: format(new Date(match.date), 'dd/MM/yyyy'),
        goals_scored: Number(match.score_team) || 0,
        goals_conceded: Number(match.score_opponent) || 0,
        result: (match.score_team > match.score_opponent ? 'Victoire' : 
                match.score_team < match.score_opponent ? 'Défaite' : 'Nul') as 'Victoire' | 'Nul' | 'Défaite',
        location: location,
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
      };
    });
  }
};



