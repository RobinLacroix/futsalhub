/**
 * Disponibilité des joueurs, pour les écrans de convocation.
 *
 * Trois surfaces convoquent sur mobile : la création de séance
 * (`calendar/new`), le détail de séance (`calendar/training/[trainingId]`) et
 * la feuille d'invitation match (`components/match/InvitePlayersSheet`). Sans ce
 * hook, chacune chargerait la disponibilité à sa façon et formulerait sa propre
 * confirmation — c'est exactement le motif qui a produit quatre tables de
 * couleurs de postes divergentes, puis les cinq bugs de données des deux match
 * recorders.
 *
 * ## Le chargement ne bloque JAMAIS la convocation
 *
 * Si l'appel échoue (réseau du gymnase, RPC absente parce que la migration
 * n'est pas passée), `statusOf` renvoie `disponible` pour tout le monde et la
 * confirmation ne se déclenche pas. Une garde de confort ne doit pas empêcher un
 * coach de composer son groupe : le pire cas dégradé, c'est le comportement
 * d'avant cette feature, pas un écran bloqué.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { getClubAvailability } from '../lib/services/availability';
import { getUserClubId } from '../lib/services/clubs';
import {
  convocationWarning,
  needsConvocationWarning,
  type AvailabilityRow,
  type AvailabilityStatus,
} from '../lib/availability';

export interface UseAvailabilityResult {
  /** Statut courant d'un joueur. `disponible` si rien n'est enregistré. */
  statusOf: (playerId: string) => AvailabilityStatus;
  /** Ligne complète, pour afficher l'échéance de retour. `null` si aucune. */
  rowOf: (playerId: string) => AvailabilityRow | null;
  /**
   * Exécute `onConfirm`, immédiatement si le joueur est apte, après une
   * confirmation explicite sinon. À utiliser pour TOUTE convocation unitaire.
   */
  confirmConvocation: (playerId: string, playerName: string, onConfirm: () => void) => void;
  /** Chargement en cours. Les écrans n'ont pas à l'attendre pour être utilisables. */
  loading: boolean;
  /** Recharge, par exemple au retour sur l'écran. */
  refresh: () => Promise<void>;
}

export function useAvailability(teamId?: string | null): UseAvailabilityResult {
  const [rows, setRows] = useState<AvailabilityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const clubId = await getUserClubId();
      if (!clubId) {
        setRows([]);
        return;
      }
      setRows(await getClubAvailability(clubId, teamId || null));
    } catch {
      // Silencieux et volontairement : voir l'en-tête. Tout le monde redevient
      // disponible, ce qui est le comportement d'avant la feature.
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const byPlayer = useMemo(() => new Map(rows.map((r) => [r.player_id, r])), [rows]);

  const rowOf = useCallback(
    (playerId: string) => byPlayer.get(playerId) ?? null,
    [byPlayer],
  );

  const statusOf = useCallback(
    (playerId: string): AvailabilityStatus => byPlayer.get(playerId)?.status ?? 'disponible',
    [byPlayer],
  );

  const confirmConvocation = useCallback(
    (playerId: string, playerName: string, onConfirm: () => void) => {
      const status = statusOf(playerId);
      if (!needsConvocationWarning(status)) {
        onConfirm();
        return;
      }
      Alert.alert(
        'Joueur non disponible',
        convocationWarning(playerName, status, rowOf(playerId)),
        [
          { text: 'Annuler', style: 'cancel' },
          // Pas `destructive` : convoquer un joueur en reprise est parfois le
          // bon choix (il vient au groupe sans jouer). Le rouge en ferait une
          // faute, alors que c'est une décision de coach à prendre en connaissance
          // de cause.
          { text: 'Convoquer quand même', onPress: onConfirm },
        ],
      );
    },
    [statusOf, rowOf],
  );

  return { statusOf, rowOf, confirmConvocation, loading, refresh: load };
}
