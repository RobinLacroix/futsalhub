import { supabase } from '@/lib/supabaseClient';

/**
 * Insère un événement de match via la RPC Postgres (validation + sync compteurs côté serveur).
 *
 * ## L'appariement but → tir cadré
 *
 * Un but est nécessairement cadré : il doit donc écrire **deux** lignes dans
 * `match_events`. Cette règle n'existait que dans le recorder mobile
 * (`PAIRED_EVENT`), jamais ici — cet écran incrémentait bien son compteur de
 * tirs cadrés, mais **dans son état local uniquement**, sans jamais le
 * persister.
 *
 * Résultat mesuré le 2026-08-12 : sur 162 buts en base, **110 n'avaient pas de
 * tir cadré**, tous saisis depuis cet écran. Toute statistique de tirs et tout
 * `+/-T` étaient donc faux sur ces matchs, et aucune formule ne pouvait être
 * juste à la fois ici et côté mobile. L'historique a été repris par
 * `supabase/migrations/20260812100000_paired_shot_backfill.sql`.
 *
 * La règle vit désormais dans la RPC elle-même
 * (`20260812110000_insert_match_event_pair.sql`), que les deux clients
 * appelaient déjà : elle est devenue un invariant de la base, et l'écriture des
 * deux lignes est atomique. `p_write_pair` vaut FALSE par défaut pour que les
 * versions mobiles déjà installées, qui écrivent encore leur apparié
 * elles-mêmes, ne produisent pas de doublon ; un appelant à jour le demande
 * explicitement.
 *
 * ⚠️ Cette valeur `true` suppose que la migration `20260812110000` est passée.
 * Sans elle, la RPC rejette le paramètre inconnu.
 */
export async function insertMatchEvent(params: {
  match_id: string;
  event_type: string;
  match_time_seconds: number;
  half: number;
  player_id: string | null;
  players_on_field: string[];
}) {
  const { data, error } = await supabase.rpc('insert_match_event', {
    p_match_id: params.match_id,
    p_event_type: params.event_type,
    p_match_time_seconds: params.match_time_seconds,
    p_half: params.half,
    p_player_id: params.player_id,
    p_players_on_field: params.players_on_field,
    // La RPC n'apparie que `goal` et `opponent_goal` ; le drapeau est ignoré
    // pour les autres types, il peut donc être passé inconditionnellement.
    p_write_pair: true,
  });
  return { data, error };
}
