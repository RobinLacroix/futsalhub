import { supabase } from '../supabase';
import type {
  AvailabilityHistoryRow,
  AvailabilityRow,
  AvailabilityStatus,
  PainSignalRow,
} from '../availability';

/**
 * Disponibilité — couche service mobile.
 *
 * Jumeau web : `lib/services/availabilityService.ts`. Même API, style d'export
 * de la brique mobile (fonctions nommées).
 *
 * ## Tout passe par des RPC, y compris les lectures
 *
 * Inhabituel dans ce dépôt, et voulu. `set_player_availability` est la seule à
 * savoir clôturer l'état courant avant d'en ouvrir un autre : l'index unique
 * partiel `player_availability_current` refuse deux lignes ouvertes pour un même
 * joueur, donc une insertion directe échoue, et une mise à jour directe détruit
 * l'historique. `authenticated` n'a d'ailleurs que le SELECT sur la table.
 *
 * Les lectures passent par RPC pour la même raison qu'ailleurs : les calculs de
 * jours écoulés et de jours restants doivent tomber du même côté de minuit pour
 * tout le monde, donc ils sont faits par Postgres, pas par le téléphone du
 * coach.
 */

export interface SetAvailabilityInput {
  playerId: string;
  status: AvailabilityStatus;
  since?: string | null;
  expectedReturn?: string | null;
  returnConfidence?: 'estimee' | 'confirmee' | null;
  zone?: string | null;
  side?: 'L' | 'R' | 'C' | null;
  note?: string | null;
  injuryEventId?: string | null;
}

/** État courant de tous les joueurs du club AYANT un état saisi. */
export async function getClubAvailability(
  clubId: string,
  teamId?: string | null,
): Promise<AvailabilityRow[]> {
  const { data, error } = await supabase.rpc('get_club_availability', {
    p_club_id: clubId,
    p_team_id: teamId ?? null,
  });
  if (error) throw error;
  return (data || []) as AvailabilityRow[];
}

/**
 * Change le statut d'un joueur. Renvoie l'identifiant de la nouvelle ligne.
 *
 * `since` sert AUSSI de date de clôture de l'état précédent : un kiné qui
 * saisit lundi une reprise datée de samedi doit produire un historique
 * cohérent, pas une ligne close le lundi.
 */
export async function setPlayerAvailability(input: SetAvailabilityInput): Promise<string> {
  const { data, error } = await supabase.rpc('set_player_availability', {
    p_player_id: input.playerId,
    p_status: input.status,
    p_since: input.since ?? null,
    p_expected_return: input.expectedReturn ?? null,
    p_return_confidence: input.returnConfidence ?? null,
    p_zone: input.zone ?? null,
    p_side: input.side ?? null,
    p_note: input.note ?? null,
    p_injury_event_id: input.injuryEventId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function getPlayerAvailabilityHistory(
  playerId: string,
  from?: string | null,
): Promise<AvailabilityHistoryRow[]> {
  const { data, error } = await supabase.rpc('get_player_availability_history', {
    p_player_id: playerId,
    p_from: from ?? null,
  });
  if (error) throw error;
  return (data || []) as AvailabilityHistoryRow[];
}

/**
 * Signaux précoces : N signalements de douleur sur la même zone et le même côté
 * pour un joueur, sur une fenêtre glissante.
 *
 * Le seuil est un paramètre, pas une constante cachée : l'écran doit afficher
 * la valeur utilisée, sinon « 3 joueurs en signal » ne veut rien dire.
 */
export async function getPainSignals(
  clubId: string,
  windowDays = 21,
  minReports = 3,
): Promise<PainSignalRow[]> {
  const { data, error } = await supabase.rpc('get_pain_signals', {
    p_club_id: clubId,
    p_window_days: windowDays,
    p_min_reports: minReports,
  });
  if (error) throw error;
  return (data || []) as PainSignalRow[];
}
