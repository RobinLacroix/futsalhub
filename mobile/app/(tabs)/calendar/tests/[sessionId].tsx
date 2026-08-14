/**
 * Saisie collective des tests physiques.
 *
 * Surface prioritaire du lot B, et la seule qui décide de son succès : le coach
 * saisit debout, un chrono dans une main. Si un test coûte plus de trois
 * secondes par joueur, la campagne ne se termine pas, et une campagne à moitié
 * saisie produit une donnée fausse — pire que pas de donnée.
 *
 * Trois choix qui découlent de ça :
 *
 * 1. **Enregistrement automatique, débattu à 1,5 s.** Pas de bouton à ne pas
 *    oublier, pas de garde de sortie à contourner. Sur un bord de terrain, la
 *    perte de saisie est le risque numéro un — c'est le défaut qui faisait
 *    perdre un match entier sur la tablette (`TabletMatchRecorder` ne persistait
 *    rien avant le 2026-08-03).
 * 2. **Enchaînement au clavier** via une barre d'accessoire iOS : le pavé
 *    décimal n'a pas de touche de validation, donc sans elle il faut viser la
 *    cellule suivante à chaque joueur.
 * 3. **La valeur retenue s'affiche par ligne**, parce qu'elle dépend de
 *    `direction` et n'est pas devinable : sur `sprint_10m` le meilleur essai est
 *    le plus PETIT, sur `cmj` le plus GRAND, et le catalogue mélange les deux.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  Platform,
  InputAccessoryView,
  Pressable,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../../contexts/ThemeContext';
import { haptics } from '../../../../lib/design/haptics';
import {
  getSessionById,
  getSessionResults,
  getTestTypes,
  saveResults,
  type ResultInput,
} from '../../../../lib/services/physicalTests';
import { getTrainingById } from '../../../../lib/services/trainings';
import { getPlayersByTeam } from '../../../../lib/services/players';
import {
  parseTestInput,
  type PhysicalTestSession,
  type PhysicalTestType,
} from '../../../../lib/physicalTests';
import { Text, Card, Button, EmptyState, SkeletonDetail } from '../../../../components/ui';
import { PlayerTestRow } from '../../../../components/tests/PlayerTestRow';
import { TestPickerSheet } from '../../../../components/tests/TestPickerSheet';
import type { Player } from '../../../../types';

const ACCESSORY_ID = 'physicalTestEntry';
const AUTOSAVE_DELAY_MS = 1500;

/** Clé de saisie : un test, un joueur. Les essais sont le tableau associé. */
const entryKey = (testTypeId: string, playerId: string) => `${testTypeId}:${playerId}`;

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export default function PhysicalTestEntryScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { theme } = useTheme();
  const c = theme.colors;

  const [session, setSession] = useState<PhysicalTestSession | null>(null);
  const [types, setTypes] = useState<PhysicalTestType[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [entries, setEntries] = useState<Record<string, string[]>>({});
  const [selectedType, setSelectedType] = useState<PhysicalTestType | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const inputRefs = useRef(new Map<string, TextInput>());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Cellules modifiées depuis le dernier enregistrement, à la granularité
   * `test:joueur`. Marquer le TEST entier renverrait les 18 joueurs à chaque
   * frappe, dont ceux jamais saisis — et un joueur vide part en suppression,
   * donc 18 DELETE inutiles toutes les 1,5 seconde sur un réseau de gymnase.
   */
  const dirtyEntries = useRef(new Set<string>());

  // ── Chargement ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const current = await getSessionById(sessionId);
        if (!current) throw new Error('Campagne de test introuvable.');

        const [catalogue, results] = await Promise.all([
          getTestTypes(current.club_id),
          getSessionResults(current.id),
        ]);

        // Le groupe testé : les convoqués de la séance si la campagne y est
        // rattachée, sinon l'effectif de l'équipe. Un joueur absent ne doit pas
        // occuper une ligne dans une liste qu'on parcourt au chrono.
        let roster: Player[] = current.team_id ? await getPlayersByTeam(current.team_id) : [];
        if (current.training_id) {
          const training = await getTrainingById(current.training_id);
          const convokedIds = new Set((training?.convoked_players ?? []).map((p) => p.id));
          if (convokedIds.size > 0) roster = roster.filter((p) => convokedIds.has(p.id));
        }

        const rebuilt: Record<string, string[]> = {};
        for (const result of results) {
          const type = catalogue.find((t) => t.id === result.test_type_id);
          const attempts = type?.attempts ?? 1;
          const key = entryKey(result.test_type_id, result.player_id);
          if (!rebuilt[key]) rebuilt[key] = Array(attempts).fill('');
          if (result.attempt <= attempts) {
            rebuilt[key][result.attempt - 1] = String(result.value);
          }
        }

        if (cancelled) return;
        setSession(current);
        setTypes(catalogue);
        setPlayers(roster);
        setEntries(rebuilt);
        setSelectedType((prev) => prev ?? catalogue[0] ?? null);
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
      await saveResults(session.id, inputs, types);
      setSaveState('saved');
    } catch {
      // Remis en file : la prochaine saisie relancera l'enregistrement, et le
      // démontage l'écrira de toute façon. Rien n'est perdu silencieusement.
      pending.forEach((key) => dirtyEntries.current.add(key));
      setSaveState('error');
    }
  }, [session, types, entries]);

  useEffect(() => {
    if (saveState !== 'pending') return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [saveState, flush]);

  /**
   * Écriture au démontage, pour ne rien perdre en quittant l'écran.
   *
   * Passe par une ref : `flush` change d'identité à chaque frappe, donc un
   * effet qui en dépend verrait son nettoyage se déclencher à CHAQUE frappe et
   * enregistrerait à chaque caractère, ce qui annule tout le débat.
   */
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(() => () => void flushRef.current(), []);

  // ── Saisie ────────────────────────────────────────────────────────────────

  const handleChange = useCallback(
    (playerId: string, attemptIndex: number, raw: string) => {
      if (!selectedType) return;
      const key = entryKey(selectedType.id, playerId);
      setEntries((prev) => {
        const current = prev[key] ?? Array(selectedType.attempts).fill('');
        const next = [...current];
        next[attemptIndex] = raw;
        return { ...prev, [key]: next };
      });
      dirtyEntries.current.add(key);
      setSaveState('pending');
    },
    [selectedType],
  );

  const registerInput = useCallback(
    (playerId: string, attemptIndex: number, ref: TextInput | null) => {
      const key = `${playerId}:${attemptIndex}`;
      if (ref) inputRefs.current.set(key, ref);
      else inputRefs.current.delete(key);
    },
    [],
  );

  /** Cellule suivante : essai suivant du même joueur, sinon joueur suivant. */
  const focusNext = useCallback(
    (playerId: string, attemptIndex: number) => {
      if (!selectedType) return;
      const playerIndex = players.findIndex((p) => p.id === playerId);
      if (playerIndex < 0) return;

      const nextAttempt = attemptIndex + 1;
      const target =
        nextAttempt < selectedType.attempts
          ? `${playerId}:${nextAttempt}`
          : playerIndex + 1 < players.length
            ? `${players[playerIndex + 1].id}:0`
            : null;

      if (!target) return;
      haptics.tapLight();
      inputRefs.current.get(target)?.focus();
    },
    [players, selectedType],
  );

  /**
   * Cellule active, tenue à jour au focus : c'est la seule façon pour la barre
   * d'accessoire de savoir d'où avancer. Le pavé décimal n'a pas de touche de
   * validation, donc `onSubmitEditing` ne se déclenche pas sur iOS.
   */
  const focusedRef = useRef<{ playerId: string; attemptIndex: number } | null>(null);

  const handleFocusAttempt = useCallback((playerId: string, attemptIndex: number) => {
    focusedRef.current = { playerId, attemptIndex };
  }, []);

  const handleSubmitAttempt = useCallback(
    (playerId: string, attemptIndex: number) => {
      focusedRef.current = { playerId, attemptIndex };
      focusNext(playerId, attemptIndex);
    },
    [focusNext],
  );

  // ── Dérivés d'affichage ───────────────────────────────────────────────────

  const filledCountByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [key, values] of Object.entries(entries)) {
      if (!values.some((v) => parseTestInput(v) !== null)) continue;
      const typeId = key.split(':')[0];
      counts[typeId] = (counts[typeId] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  const filledForSelected = selectedType ? (filledCountByType[selectedType.id] ?? 0) : 0;

  const saveLabel: Record<SaveState, string> = {
    idle: '',
    pending: 'Modifications non enregistrées',
    saving: 'Enregistrement…',
    saved: 'Enregistré',
    error: "Échec de l'enregistrement, nouvelle tentative à la prochaine saisie",
  };

  if (loading) return <SkeletonDetail />;

  if (error || !session) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        tone="negative"
        title="Campagne indisponible"
        description={error ?? 'Cette campagne de test est introuvable.'}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <View style={[styles.flex, { padding: theme.space.lg, gap: theme.space.lg }]}>
        <Card variant="flat" padding="md" style={{ gap: theme.space.xs }}>
          <Text variant="caption" tone="tertiary">
            {format(parseISO(session.date), 'EEEE d MMMM yyyy', { locale: fr })}
            {session.conditions ? ` · ${session.conditions}` : ''}
          </Text>

          <Pressable
            onPress={() => {
              haptics.select();
              setPickerOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={
              selectedType ? `Test en cours : ${selectedType.label}. Changer de test` : 'Choisir un test'
            }
            style={[styles.picker, { paddingVertical: theme.space.sm, gap: theme.space.md }]}
          >
            <View style={styles.flex}>
              <Text variant="title">{selectedType?.label ?? 'Choisir un test'}</Text>
              {selectedType && (
                <Text variant="caption" tone="tertiary">
                  {selectedType.unit}
                  {selectedType.direction === 'lower_is_better' ? ' · plus bas = mieux' : ''}
                  {selectedType.direction === 'higher_is_better' ? ' · plus haut = mieux' : ''}
                </Text>
              )}
            </View>
            <Ionicons name="swap-horizontal" size={22} color={c.accent.default} />
          </Pressable>

          {selectedType && (
            <Text variant="caption" tone={filledForSelected === players.length ? 'positive' : 'secondary'} numeric>
              {filledForSelected}/{players.length} joueurs saisis
            </Text>
          )}

          {saveState !== 'idle' && (
            <Text
              variant="caption"
              tone={saveState === 'error' ? 'negative' : saveState === 'saved' ? 'positive' : 'tertiary'}
            >
              {saveLabel[saveState]}
            </Text>
          )}
        </Card>

        {selectedType && selectedType.protocol_note && (
          <Text variant="caption" tone="tertiary">
            {selectedType.protocol_note}
          </Text>
        )}

        {players.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Aucun joueur à tester"
            description="Cette campagne n'a aucun joueur rattaché. Vérifiez la convocation de la séance ou l'effectif de l'équipe."
          />
        ) : (
          <ScrollView
            style={styles.flex}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            contentContainerStyle={{ paddingBottom: theme.space.giant }}
          >
            {selectedType &&
              players.map((player) => {
                const key = entryKey(selectedType.id, player.id);
                const values = entries[key] ?? Array(selectedType.attempts).fill('');
                return (
                  <PlayerTestRow
                    key={player.id}
                    playerId={player.id}
                    firstName={player.first_name}
                    lastName={player.last_name}
                    number={player.number}
                    testType={selectedType}
                    values={values}
                    parsed={values.map(parseTestInput)}
                    onChange={(attemptIndex, raw) => handleChange(player.id, attemptIndex, raw)}
                    onFocusAttempt={handleFocusAttempt}
                    registerInput={registerInput}
                    onSubmitAttempt={handleSubmitAttempt}
                    accessoryId={Platform.OS === 'ios' ? ACCESSORY_ID : undefined}
                  />
                );
              })}
          </ScrollView>
        )}
      </View>

      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={ACCESSORY_ID}>
          <View
            style={[
              styles.accessory,
              { backgroundColor: c.bg.elevated, borderTopColor: c.border.subtle, padding: theme.space.sm },
            ]}
          >
            <Button
              label="Joueur suivant"
              variant="ghost"
              size="sm"
              icon="arrow-down"
              onPress={() => {
                const focused = focusedRef.current;
                if (focused) focusNext(focused.playerId, focused.attemptIndex);
              }}
            />
          </View>
        </InputAccessoryView>
      )}

      <TestPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        types={types}
        selectedId={selectedType?.id ?? null}
        onSelect={setSelectedType}
        filledCountByType={filledCountByType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  picker: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  accessory: { borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'flex-end' },
});
