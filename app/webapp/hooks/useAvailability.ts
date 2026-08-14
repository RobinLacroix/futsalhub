'use client';

/**
 * Disponibilité des joueurs, pour les écrans de convocation web.
 *
 * Jumeau mobile : `mobile/hooks/useAvailability.ts`. Même contrat, même règle de
 * dégradation.
 *
 * ## Le chargement ne bloque JAMAIS la convocation
 *
 * Si l'appel échoue, `statusOf` renvoie `disponible` pour tout le monde et la
 * confirmation ne se déclenche pas. Une garde de confort ne doit pas empêcher un
 * coach de composer son groupe : le pire cas dégradé, c'est le comportement
 * d'avant cette feature, pas un écran bloqué.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { availabilityService } from '@/lib/services';
import {
  convocationWarning,
  needsConvocationWarning,
  type AvailabilityRow,
  type AvailabilityStatus,
} from '@/lib/availability';

export interface UseAvailabilityResult {
  statusOf: (playerId: string) => AvailabilityStatus;
  rowOf: (playerId: string) => AvailabilityRow | null;
  /**
   * `true` si la convocation peut se poursuivre. Confirme via `window.confirm`
   * quand le joueur n'est pas disponible.
   *
   * Le `confirm` natif est assumé ici : la page qui appelle ce hook fait 3 766
   * lignes, et y injecter une modale maison demanderait d'y ajouter de l'état,
   * exactement ce que la règle du dépôt interdit sur ce fichier. Un `confirm`
   * bloquant est laid mais il est lu, et c'est tout ce qu'on lui demande.
   */
  confirmConvocation: (playerId: string, playerName: string) => boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useAvailability(clubId?: string | null, teamId?: string | null): UseAvailabilityResult {
  const [rows, setRows] = useState<AvailabilityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clubId) {
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      setRows(await availabilityService.getClubAvailability(clubId, teamId || null));
    } catch {
      // Silencieux et volontairement : voir l'en-tête.
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [clubId, teamId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const byPlayer = useMemo(() => new Map(rows.map((r) => [r.player_id, r])), [rows]);

  const rowOf = useCallback((playerId: string) => byPlayer.get(playerId) ?? null, [byPlayer]);

  const statusOf = useCallback(
    (playerId: string): AvailabilityStatus => byPlayer.get(playerId)?.status ?? 'disponible',
    [byPlayer],
  );

  const confirmConvocation = useCallback(
    (playerId: string, playerName: string): boolean => {
      const status = statusOf(playerId);
      if (!needsConvocationWarning(status)) return true;
      return window.confirm(convocationWarning(playerName, status, rowOf(playerId)));
    },
    [statusOf, rowOf],
  );

  return { statusOf, rowOf, confirmConvocation, loading, refresh: load };
}
