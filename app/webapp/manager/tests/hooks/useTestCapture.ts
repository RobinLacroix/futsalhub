'use client';

/**
 * État de saisie d'une campagne de tests physiques — grille web.
 *
 * Isolé du composant dès l'écriture, pas après coup : c'est la règle du repo
 * (décomposer avant de router vers les services), et c'est ce qui manque à
 * `matchrecorder/page.tsx`, 5 000 lignes et 26 `useState`.
 *
 * ## Ce qui est repris de l'écran mobile, à l'identique
 *
 * Même forme d'état (`entries` indexé par `test:joueur`, les essais dans le
 * tableau associé), même enregistrement automatique à 1,5 s, même granularité
 * de marquage. Ces trois choix ont été payés sur mobile, notamment le dernier :
 * marquer le TEST entier plutôt que la cellule renvoie tout l'effectif à chaque
 * frappe, et un joueur jamais saisi part en suppression.
 *
 * ## Ce qui est propre au web
 *
 * Le collage tableur. C'est la raison d'être de cette grille : le coach qui a
 * chronométré sur papier ou dans Excel doit pouvoir déverser sa feuille d'un
 * coup. `applyPaste` remplit vers la droite puis vers le bas à partir de la
 * cellule ancre, en suivant l'ordre visible des colonnes.
 *
 * ## Une saisie illisible n'est jamais silencieuse
 *
 * `parseTestInput` renvoie `null` sur ce qu'il ne sait pas lire, et le service
 * traduit `null` par une suppression. Un collage décalé d'une colonne
 * effacerait donc des résultats sans rien dire. La valeur brute est gardée
 * telle quelle dans l'état, `unreadableKeys` recense les cellules concernées, et
 * l'écran doit les montrer. Sans ça, la fonction la plus utile de la page est
 * aussi la plus dangereuse.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { physicalTestsService, playersService, type ResultInput } from '@/lib/services';
import { trainingsService } from '@/lib/services/trainingsService';
import {
  parseTestInput,
  retainedValue,
  sortTestTypes,
  type PhysicalTestSession,
  type PhysicalTestType,
} from '@/lib/physicalTests';
import type { Player } from '@/types';

const AUTOSAVE_DELAY_MS = 1500;

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/** Clé de saisie : un test, un joueur. Les essais sont le tableau associé. */
export const entryKey = (testTypeId: string, playerId: string) => `${testTypeId}:${playerId}`;

/** Une colonne de la grille : un essai d'un test. */
export interface GridColumn {
  testTypeId: string;
  attemptIndex: number;
}

export function useTestCapture(sessionId: string) {
  const [session, setSession] = useState<PhysicalTestSession | null>(null);
  const [catalogue, setCatalogue] = useState<PhysicalTestType[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [entries, setEntries] = useState<Record<string, string[]>>({});
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyEntries = useRef(new Set<string>());

  // ── Chargement ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const current = await physicalTestsService.getSessionById(sessionId);
        if (!current) throw new Error('Campagne de test introuvable.');

        const [types, results] = await Promise.all([
          physicalTestsService.getTestTypes(current.club_id),
          physicalTestsService.getSessionResults(current.id),
        ]);

        // Le groupe testé : les convoqués de la séance si la campagne y est
        // rattachée, sinon l'effectif de l'équipe. Côté web, la convocation
        // d'un entraînement se lit dans `attendance` (un joueur convoqué y a
        // une clé), là où le service mobile expose `convoked_players`.
        let roster: Player[] = current.team_id
          ? await playersService.getPlayersByTeam(current.team_id)
          : [];
        if (current.training_id) {
          // `getTrainingById` utilise `.single()` : une séance supprimée depuis
          // fait lever, ce qui viderait la page entière alors que les résultats
          // sont là. On retombe sur l'effectif complet plutôt que sur rien.
          try {
            const training = await trainingsService.getTrainingById(current.training_id);
            const convokedIds = new Set(Object.keys(training?.attendance ?? {}));
            if (convokedIds.size > 0) roster = roster.filter((p) => convokedIds.has(p.id));
          } catch {
            /* séance introuvable : on garde tout l'effectif de l'équipe */
          }
        }

        const rebuilt: Record<string, string[]> = {};
        for (const result of results) {
          const type = types.find((t) => t.id === result.test_type_id);
          const attempts = type?.attempts ?? 1;
          const key = entryKey(result.test_type_id, result.player_id);
          if (!rebuilt[key]) rebuilt[key] = Array(attempts).fill('');
          if (result.attempt <= attempts) {
            rebuilt[key][result.attempt - 1] = String(result.value);
          }
        }

        if (cancelled) return;
        setSession(current);
        setCatalogue(sortTestTypes(types));
        setPlayers(roster);
        setEntries(rebuilt);

        // Colonnes de départ : les tests déjà renseignés sur cette campagne.
        // Ouvrir sur les treize tests du catalogue donnerait une grille de
        // trente colonnes que personne ne lit.
        const alreadyUsed = sortTestTypes(
          types.filter((t) => results.some((r) => r.test_type_id === t.id)),
        ).map((t) => t.id);
        setSelectedTypeIds(alreadyUsed);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Chargement impossible.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (sessionId) load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // ── Enregistrement ────────────────────────────────────────────────────────

  const flush = useCallback(async () => {
    if (!session || dirtyEntries.current.size === 0) return;
    const pending = [...dirtyEntries.current];
    dirtyEntries.current.clear();

    try {
      setSaveState('saving');
      const inputs: ResultInput[] = [];
      for (const key of pending) {
        const [testTypeId, playerId] = key.split(':');
        const raw = entries[key];
        if (!raw) continue;
        inputs.push({
          playerId,
          testTypeId,
          attempts: raw.map((value, index) => ({
            attempt: index + 1,
            value: parseTestInput(value),
          })),
        });
      }
      await physicalTestsService.saveResults(session.id, inputs, catalogue);
      setSaveState('saved');
    } catch {
      // Remis en file : la prochaine saisie relancera l'enregistrement, et le
      // démontage l'écrira de toute façon. Rien n'est perdu silencieusement.
      pending.forEach((key) => dirtyEntries.current.add(key));
      setSaveState('error');
    }
  }, [session, catalogue, entries]);

  useEffect(() => {
    if (saveState !== 'pending') return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [saveState, flush]);

  /**
   * Écriture au démontage. Passe par une ref : `flush` change d'identité à
   * chaque frappe, donc un effet qui en dépend verrait son nettoyage se
   * déclencher à CHAQUE frappe et enregistrerait à chaque caractère, ce qui
   * annule tout le débat. Bug trouvé sur la version mobile avant livraison.
   */
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(() => () => void flushRef.current(), []);

  /**
   * Garde de fermeture d'onglet. Un `beforeunload` est le seul filet pendant la
   * fenêtre de 1,5 s : contrairement au démontage React, la fermeture d'onglet
   * ne laisse pas le temps d'un appel réseau.
   */
  useEffect(() => {
    const hasPending = () => dirtyEntries.current.size > 0;
    const handler = (event: BeforeUnloadEvent) => {
      if (!hasPending()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ── Saisie ────────────────────────────────────────────────────────────────

  const typeById = useMemo(
    () => new Map(catalogue.map((t) => [t.id, t])),
    [catalogue],
  );

  const setCell = useCallback(
    (testTypeId: string, playerId: string, attemptIndex: number, raw: string) => {
      const type = typeById.get(testTypeId);
      if (!type) return;
      const key = entryKey(testTypeId, playerId);
      setEntries((prev) => {
        const current = prev[key] ?? Array(type.attempts).fill('');
        const next = [...current];
        next[attemptIndex] = raw;
        return { ...prev, [key]: next };
      });
      dirtyEntries.current.add(key);
      setSaveState('pending');
    },
    [typeById],
  );

  /**
   * Déverse une grille collée à partir d'une cellule ancre.
   *
   * Les cellules qui tombent hors de la grille (plus de lignes collées que de
   * joueurs, plus de colonnes que d'essais affichés) sont ignorées, pas
   * repliées : replier écrirait des chronos sur le mauvais test sans que
   * personne ne s'en aperçoive.
   *
   * Retourne le nombre de cellules effectivement écrites, pour que l'écran
   * puisse dire « 54 valeurs collées » plutôt que rien.
   */
  const applyPaste = useCallback(
    (anchorRow: number, anchorCol: number, grid: string[][], columns: GridColumn[]) => {
      const updates: Array<{ key: string; attemptIndex: number; raw: string; attempts: number }> = [];

      grid.forEach((line, rowOffset) => {
        const player = players[anchorRow + rowOffset];
        if (!player) return;
        line.forEach((cell, colOffset) => {
          const column = columns[anchorCol + colOffset];
          if (!column) return;
          const type = typeById.get(column.testTypeId);
          if (!type) return;
          updates.push({
            key: entryKey(column.testTypeId, player.id),
            attemptIndex: column.attemptIndex,
            raw: cell.trim(),
            attempts: type.attempts,
          });
        });
      });

      if (updates.length === 0) return 0;

      setEntries((prev) => {
        const next = { ...prev };
        for (const update of updates) {
          const current = next[update.key] ?? Array(update.attempts).fill('');
          const copy = [...current];
          copy[update.attemptIndex] = update.raw;
          next[update.key] = copy;
        }
        return next;
      });
      updates.forEach((update) => dirtyEntries.current.add(update.key));
      setSaveState('pending');
      return updates.length;
    },
    [players, typeById],
  );

  const toggleType = useCallback((testTypeId: string) => {
    setSelectedTypeIds((prev) =>
      prev.includes(testTypeId)
        ? prev.filter((id) => id !== testTypeId)
        : [...prev, testTypeId],
    );
  }, []);

  // ── Dérivés ───────────────────────────────────────────────────────────────

  const selectedTypes = useMemo(
    () => sortTestTypes(catalogue.filter((t) => selectedTypeIds.includes(t.id))),
    [catalogue, selectedTypeIds],
  );

  const columns: GridColumn[] = useMemo(
    () =>
      selectedTypes.flatMap((type) =>
        Array.from({ length: type.attempts }, (_, attemptIndex) => ({
          testTypeId: type.id,
          attemptIndex,
        })),
      ),
    [selectedTypes],
  );

  /** Cellules dont le texte n'est pas un nombre lisible. Voir l'en-tête. */
  const unreadableKeys = useMemo(() => {
    const out = new Set<string>();
    for (const [key, values] of Object.entries(entries)) {
      values.forEach((raw, index) => {
        if (raw.trim() !== '' && parseTestInput(raw) === null) {
          out.add(`${key}:${index}`);
        }
      });
    }
    return out;
  }, [entries]);

  const retainedFor = useCallback(
    (testTypeId: string, playerId: string): number | null => {
      const type = typeById.get(testTypeId);
      if (!type) return null;
      const raw = entries[entryKey(testTypeId, playerId)] ?? [];
      const values = raw
        .map((v) => parseTestInput(v))
        .filter((v): v is number => v !== null);
      return retainedValue(values, type.aggregation, type.direction);
    },
    [entries, typeById],
  );

  /** Nombre de joueurs ayant au moins une valeur lisible, par test. */
  const filledCountByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [key, values] of Object.entries(entries)) {
      if (!values.some((v) => parseTestInput(v) !== null)) continue;
      const typeId = key.split(':')[0];
      counts[typeId] = (counts[typeId] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  return {
    session,
    catalogue,
    players,
    entries,
    selectedTypes,
    selectedTypeIds,
    columns,
    unreadableKeys,
    filledCountByType,
    loading,
    error,
    saveState,
    setCell,
    applyPaste,
    toggleType,
    retainedFor,
    flush,
  };
}
