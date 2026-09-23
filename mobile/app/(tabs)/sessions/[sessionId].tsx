import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, Alert, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { useIsTablet, LAYOUT } from '../../../hooks/useIsTablet';
import { Screen, Text, Button, Section, Input, ChipGroup, HeaderBackButton, BackLink, type ChipOption } from '../../../components/ui';
import { ProcedurePickerSheet } from '../../../components/training/ProcedurePickerSheet';
import { SessionTimeline } from '../../../components/tactics/SessionTimeline';
import { SessionBlockCard } from '../../../components/tactics/SessionBlockCard';
import { AddBlockSheet } from '../../../components/tactics/AddBlockSheet';
import { AttachTrainingSheet } from '../../../components/tactics/AttachTrainingSheet';
import { buildDefaultBlocks, newBlock } from '../../../lib/tactics/sessionBlocks';
import {
  getSessionById,
  saveSession,
  type SessionBlock,
  type SessionBlockType,
  type SessionMeta,
  type LearningPhase,
} from '../../../lib/services/sessionsService';
import { getProceduresByClub, type TrainingProcedureRecord } from '../../../lib/services/trainingProceduresService';
import { getTrainingsByTeamIds, setTrainingSession } from '../../../lib/services/trainings';
import { getTeamsByClubId } from '../../../lib/services/teams';
import type { Training } from '../../../types';

const PHASE_OPTIONS: readonly ChipOption<LearningPhase | ''>[] = [
  { value: '', label: 'Non précisé' },
  { value: 'Phase 1', label: 'Phase 1' },
  { value: 'Phase 2', label: 'Phase 2' },
  { value: 'Mix', label: 'Mix' },
];

function emptyMeta(): SessionMeta {
  return { principe: '', dureeTotaleMin: 0 };
}

function formatShortDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Assembleur de séance — modèle à 6 blocs (trame futsal-coach), timeline
 * segmentée, rattachement au calendrier, sélecteur de procédé avec filtres.
 * Réordonnancement par boutons monter/descendre uniquement (pas de drag,
 * décision accessibilité).
 */
export default function SessionEditorScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { theme } = useTheme();
  const isTablet = useIsTablet();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { activeTeam } = useActiveTeam();

  const isNew = sessionId === 'new';
  const [recordId, setRecordId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [meta, setMeta] = useState<SessionMeta>(emptyMeta());
  const [blocks, setBlocks] = useState<SessionBlock[]>([]);
  const [procedures, setProcedures] = useState<TrainingProcedureRecord[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [teamNameById, setTeamNameById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [pickerForBlock, setPickerForBlock] = useState<string | null>(null);
  const [addBlockOpen, setAddBlockOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      title: 'Assembleur de séance',
      headerLeft: () => <HeaderBackButton onPress={() => router.back()} />,
    });
  }, [navigation, router]);

  const loadTrainings = useCallback(async (clubId: string) => {
    const teams = await getTeamsByClubId(clubId);
    setTeamNameById(new Map(teams.map((t) => [t.id, t.name])));
    setTrainings(await getTrainingsByTeamIds(teams.map((t) => t.id)));
  }, []);

  useEffect(() => {
    const clubId = activeTeam?.club_id;
    if (!clubId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [procs, existing] = await Promise.all([
          getProceduresByClub(clubId),
          isNew ? Promise.resolve(null) : getSessionById(sessionId),
          loadTrainings(clubId),
        ]);
        if (cancelled) return;
        setProcedures(procs);
        if (existing) {
          setRecordId(existing.id);
          setName(existing.name);
          setMeta(existing.meta ?? emptyMeta());
          setBlocks(existing.blocks ?? []);
        } else if (isNew) {
          setBlocks(buildDefaultBlocks());
        }
      } catch (err) {
        Alert.alert('Erreur', err instanceof Error ? err.message : 'Chargement impossible');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTeam?.club_id, isNew, sessionId, loadTrainings]);

  const attachedTrainings = useMemo(
    () => (recordId ? trainings.filter((t) => t.session_id === recordId) : []),
    [trainings, recordId],
  );

  const handleAttach = useCallback(
    async (trainingId: string) => {
      try {
        await setTrainingSession(trainingId, recordId);
        if (activeTeam?.club_id) await loadTrainings(activeTeam.club_id);
      } catch (err) {
        Alert.alert('Erreur', err instanceof Error ? err.message : 'Échec du rattachement.');
      }
    },
    [recordId, activeTeam?.club_id, loadTrainings],
  );

  const handleDetach = useCallback(
    async (trainingId: string) => {
      try {
        await setTrainingSession(trainingId, null);
        if (activeTeam?.club_id) await loadTrainings(activeTeam.club_id);
      } catch (err) {
        Alert.alert('Erreur', err instanceof Error ? err.message : 'Échec du détachement.');
      }
    },
    [activeTeam?.club_id, loadTrainings],
  );

  const procedureById = useMemo(() => new Map(procedures.map((p) => [p.id, p])), [procedures]);
  const totalMin = useMemo(() => blocks.reduce((sum, b) => sum + (b.duration || 0), 0), [blocks]);

  const patchBlock = useCallback((id: string, patch: Partial<SessionBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);

  const addBlock = useCallback((type: SessionBlockType) => {
    setBlocks((prev) => [...prev, newBlock(type)]);
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const moveBlock = useCallback((id: string, dir: -1 | 1) => {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeTeam?.club_id) return;
    if (!name.trim()) {
      Alert.alert('Nom manquant', 'Donne un nom à la séance avant d’enregistrer.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveSession({
        id: recordId,
        clubId: activeTeam.club_id,
        name: name.trim(),
        meta: { ...meta, dureeTotaleMin: totalMin },
        blocks,
      });
      setRecordId(saved.id);
      setJustSaved(true);
      if (isNew) router.replace(`/(tabs)/sessions/${saved.id}` as never);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : "Échec de l'enregistrement de la séance");
    } finally {
      setSaving(false);
    }
  }, [activeTeam?.club_id, name, meta, blocks, recordId, totalMin, isNew, router]);

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(t);
  }, [justSaved]);

  if (loading) {
    return (
      <Screen scroll={false}>
        {isTablet && <BackLink onPress={() => router.back()} />}
        <View style={s.center}>
          <ActivityIndicator color={theme.colors.accent.default} />
        </View>
      </Screen>
    );
  }

  const pickerBlock = blocks.find((b) => b.id === pickerForBlock) ?? null;

  return (
    <View style={[s.root, { backgroundColor: theme.colors.bg.canvas }]}>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {isTablet && <BackLink onPress={() => router.back()} />}

        <Input label="Nom de la séance" value={name} onChangeText={setName} placeholder="Ex : Semaine 3 — sortie de pression" />

        <Section title="Détails">
          <View style={s.metaRow}>
            <Input label="Principe servi" value={meta.principe} onChangeText={(v) => setMeta((m) => ({ ...m, principe: v }))} containerStyle={s.metaField} placeholder="Ex : Supériorité collective offensive" />
            <Input label="Moyen travaillé" value={meta.moyen ?? ''} onChangeText={(v) => setMeta((m) => ({ ...m, moyen: v }))} containerStyle={s.metaField} optional placeholder="Ex : Dualité meneur → ailier" />
          </View>
          <View style={s.metaRow}>
            <Input label="Thème" value={meta.theme ?? ''} onChangeText={(v) => setMeta((m) => ({ ...m, theme: v }))} containerStyle={s.metaField} optional placeholder="Titre libre" />
            <Input label="Effectif" value={meta.effectif ?? ''} onChangeText={(v) => setMeta((m) => ({ ...m, effectif: v }))} containerStyle={s.metaField} placeholder="Ex : 12 joueurs" />
          </View>
          <ChipGroup
            label="Phase d'apprentissage"
            options={PHASE_OPTIONS}
            value={(meta.phase || '') as LearningPhase | ''}
            onChange={(v) => setMeta((m) => ({ ...m, phase: (v || undefined) as LearningPhase | undefined }))}
          />
          <Text variant="caption" tone="tertiary">
            Durée totale : {totalMin} min ({blocks.length} bloc{blocks.length > 1 ? 's' : ''}) — calculée automatiquement
          </Text>
        </Section>

        <Section title="Rattachement au calendrier">
          {!recordId ? (
            <Text variant="caption" tone="tertiary">
              Enregistre la séance une première fois pour pouvoir la rattacher à un entraînement.
            </Text>
          ) : (
            <View style={s.attachWrap}>
              {attachedTrainings.map((t) => (
                <View key={t.id} style={[s.attachChip, { backgroundColor: theme.colors.accent.subtle, borderColor: theme.colors.accent.border }]}>
                  <Ionicons name="calendar-outline" size={12} color={theme.colors.accent.default} />
                  <Text variant="caption" tone="accent" numberOfLines={1}>
                    {formatShortDate(t.date)} · {teamNameById.get(t.team_id || '') || '—'}
                  </Text>
                  <Pressable onPress={() => handleDetach(t.id)} accessibilityRole="button" accessibilityLabel="Détacher cet entraînement" hitSlop={6}>
                    <Ionicons name="close" size={12} color={theme.colors.accent.default} />
                  </Pressable>
                </View>
              ))}
              <Button label="Rattacher à un entraînement" icon="link-outline" variant="secondary" size="sm" onPress={() => setAttachOpen(true)} />
            </View>
          )}
        </Section>

        <Section title="Timeline">
          <SessionTimeline blocks={blocks} />
        </Section>

        <Section title="Blocs">
          <View style={s.blocksList}>
            {blocks.map((block, i) => (
              <SessionBlockCard
                key={block.id}
                block={block}
                index={i}
                total={blocks.length}
                procedure={block.procedureId ? procedureById.get(block.procedureId) ?? null : null}
                onPatch={(patch) => patchBlock(block.id, patch)}
                onRemove={() => removeBlock(block.id)}
                onMoveUp={() => moveBlock(block.id, -1)}
                onMoveDown={() => moveBlock(block.id, 1)}
                onPickProcedure={() => setPickerForBlock(block.id)}
                onViewSchematic={(schematicId) => router.push(`/(tabs)/library/${schematicId}` as never)}
              />
            ))}
          </View>

          <Button label="Ajouter un bloc" icon="add" variant="secondary" onPress={() => setAddBlockOpen(true)} block />
        </Section>
      </ScrollView>

      <View
        style={[
          s.footer,
          { paddingBottom: Math.max(insets.bottom, theme.space.md), maxWidth: isTablet ? LAYOUT.MAX_CONTENT_WIDTH : undefined },
        ]}
      >
        <Button label={justSaved ? 'Enregistré ✓' : 'Enregistrer'} onPress={handleSave} loading={saving} disabled={saving} block />
      </View>

      <ProcedurePickerSheet
        visible={pickerForBlock != null}
        onClose={() => setPickerForBlock(null)}
        procedures={procedures}
        onSelect={(procedureId) => {
          if (pickerBlock) patchBlock(pickerBlock.id, { procedureId });
        }}
      />

      <AddBlockSheet visible={addBlockOpen} onClose={() => setAddBlockOpen(false)} onAdd={addBlock} />

      <AttachTrainingSheet
        visible={attachOpen}
        trainings={trainings}
        teamNameById={teamNameById}
        onSelect={handleAttach}
        onClose={() => setAttachOpen(false)}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: t.space.lg, paddingBottom: t.space.xl, gap: t.space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', gap: t.space.md },
  metaField: { flex: 1 },
  attachWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, alignItems: 'center' },
  attachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: t.space.sm,
    paddingVertical: 4,
    borderRadius: t.radius.pill,
    borderWidth: 1,
  },
  blocksList: { gap: t.space.md, marginBottom: t.space.md },
  footer: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.md,
    backgroundColor: t.colors.bg.surface,
    borderTopWidth: 1,
    borderTopColor: t.colors.border.subtle,
  },
}));
