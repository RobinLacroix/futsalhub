import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, makeStyles } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { useIsTablet, LAYOUT } from '../../../hooks/useIsTablet';
import { Screen, Text, Button, IconButton, Card, Section, Input, ChipGroup, HeaderBackButton, BackLink, type ChipOption } from '../../../components/ui';
import { ProcedurePickerSheet } from '../../../components/training/ProcedurePickerSheet';
import {
  getSessionById,
  saveSession,
  type SessionBlock,
  type SessionMeta,
  type TrainingSessionRecord,
} from '../../../lib/services/sessionsService';
import { getProceduresByClub, type TrainingProcedureRecord } from '../../../lib/services/trainingProceduresService';

const BLOCK_TYPES: readonly ChipOption<SessionBlock['type']>[] = [
  { value: 'Echauffement', label: 'Échauffement' },
  { value: 'Exercice', label: 'Exercice' },
  { value: 'Situation', label: 'Situation' },
  { value: 'Jeu', label: 'Jeu' },
];

let idSeq = 0;
function newBlockId() {
  idSeq += 1;
  return `b${Date.now() % 100000}${idSeq}`;
}

function emptyMeta(): SessionMeta {
  return { theme: '', objectif: '', effectif: '', dureeTotaleMin: 0, philosophyTags: [] };
}

/**
 * Assembleur de séance : enchaîne des `training_procedures` en une séance
 * réutilisable — même modèle que `seance.js` côté web (bloc libre, pas de
 * trame fixe), mais réordonnancement par boutons monter/descendre plutôt que
 * par glisser (pas d'alternative single-pointer sur un drag-only, cf
 * PLAN_SEANCE_BIBLIOTHEQUE_MOBILE_2026-09.md §5).
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerForBlock, setPickerForBlock] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: 'Assembleur de séance',
      headerLeft: () => <HeaderBackButton onPress={() => router.back()} />,
    });
  }, [navigation, router]);

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
        ]);
        if (cancelled) return;
        setProcedures(procs);
        if (existing) {
          setRecordId(existing.id);
          setName(existing.name);
          setMeta(existing.meta ?? emptyMeta());
          setBlocks(existing.blocks ?? []);
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
  }, [activeTeam?.club_id, isNew, sessionId]);

  const procedureById = useMemo(() => new Map(procedures.map((p) => [p.id, p])), [procedures]);
  const totalMin = useMemo(() => blocks.reduce((sum, b) => sum + (b.duration || 0), 0), [blocks]);

  const patchBlock = useCallback((id: string, patch: Partial<SessionBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);

  const addBlock = useCallback(() => {
    const block: SessionBlock = { id: newBlockId(), type: 'Exercice', duration: 15, procedureId: null, intentionPedagogique: '' };
    setBlocks((prev) => [...prev, block]);
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
      router.back();
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : "Échec de l'enregistrement de la séance");
    } finally {
      setSaving(false);
    }
  }, [activeTeam?.club_id, name, meta, blocks, recordId, totalMin, router]);

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
            <Input label="Thème" value={meta.theme ?? ''} onChangeText={(v) => setMeta((m) => ({ ...m, theme: v }))} containerStyle={s.metaField} />
            <Input
              label="Objectif"
              value={meta.objectif ?? ''}
              onChangeText={(v) => setMeta((m) => ({ ...m, objectif: v }))}
              containerStyle={s.metaField}
            />
          </View>
          <Text variant="caption" tone="tertiary">
            Durée totale : {totalMin} min ({blocks.length} bloc{blocks.length > 1 ? 's' : ''})
          </Text>
        </Section>

        <Section title="Blocs">
          <View style={s.blocksList}>
            {blocks.map((block, i) => {
              const proc = block.procedureId ? procedureById.get(block.procedureId) : null;
              return (
                <Card key={block.id} variant="raised" padding="md" style={s.blockCard}>
                  <View style={s.blockHeader}>
                    <Text variant="caption" tone="tertiary">
                      Bloc {i + 1}
                    </Text>
                    <View style={s.blockOrderActions}>
                      <IconButton icon="chevron-up" label="Monter le bloc" variant="plain" size="sm" disabled={i === 0} onPress={() => moveBlock(block.id, -1)} />
                      <IconButton
                        icon="chevron-down"
                        label="Descendre le bloc"
                        variant="plain"
                        size="sm"
                        disabled={i === blocks.length - 1}
                        onPress={() => moveBlock(block.id, 1)}
                      />
                      <IconButton icon="close" label="Retirer le bloc" variant="destructive" size="sm" onPress={() => removeBlock(block.id)} />
                    </View>
                  </View>

                  <ChipGroup label="Type" options={BLOCK_TYPES} value={block.type} onChange={(v) => patchBlock(block.id, { type: v })} />

                  <Input
                    label="Durée (min)"
                    value={String(block.duration || 0)}
                    onChangeText={(v) => patchBlock(block.id, { duration: parseInt(v, 10) || 0 })}
                    numeric
                    keyboardType="number-pad"
                  />

                  <Button
                    label={proc ? proc.title || 'Sans titre' : 'Choisir un procédé'}
                    icon="document-text-outline"
                    variant="secondary"
                    onPress={() => setPickerForBlock(block.id)}
                    block
                  />

                  {proc?.schematic_id ? (
                    <Button
                      label="Voir le schéma"
                      icon="albums-outline"
                      variant="ghost"
                      size="sm"
                      onPress={() => router.push(`/(tabs)/library/${proc.schematic_id}` as never)}
                    />
                  ) : null}

                  <Input
                    label="Intention pédagogique"
                    value={block.intentionPedagogique}
                    onChangeText={(v) => patchBlock(block.id, { intentionPedagogique: v })}
                    placeholder="Ce que ce bloc doit produire"
                    multiline
                    optional
                  />
                </Card>
              );
            })}
          </View>

          <Button label="Ajouter un bloc" icon="add" variant="secondary" onPress={addBlock} block />
        </Section>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, theme.space.md), maxWidth: isTablet ? LAYOUT.MAX_CONTENT_WIDTH : undefined }]}>
        <Button label="Enregistrer" onPress={handleSave} loading={saving} disabled={saving} block />
      </View>

      <ProcedurePickerSheet
        visible={pickerForBlock != null}
        onClose={() => setPickerForBlock(null)}
        procedures={procedures}
        onSelect={(procedureId) => {
          if (pickerBlock) patchBlock(pickerBlock.id, { procedureId });
        }}
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
  blocksList: { gap: t.space.md, marginBottom: t.space.md },
  blockCard: { gap: t.space.md },
  blockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blockOrderActions: { flexDirection: 'row', gap: t.space.xs },
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
