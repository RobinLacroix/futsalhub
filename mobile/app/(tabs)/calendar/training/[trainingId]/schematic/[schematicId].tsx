import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTheme, makeStyles } from '../../../../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../../../../contexts/ActiveTeamContext';
import { Screen, Text, Button } from '../../../../../../components/ui';
import { TacticsBoard, type SelectedItem } from '../../../../../../components/tactics/TacticsBoard';
import { getSchematicById, createSchematic, updateSchematic } from '../../../../../../lib/services/schematicsService';
import { emptyDrill, type Drill, type DrillEntity, type DrillLine, type DrillPulse, type DrillText, type DrillZone } from '../../../../../../lib/tactics/types';

/**
 * Écran tranche 2 (cf PLAN_TACTIQUE_NATIF_MOBILE_TRANCHE1_2026-09.md +
 * décisions de tranche 2 en conversation) : positionnement statique complet
 * — jetons, matériel, zones, traits droits, textes, pulses. Pas de dessin
 * libre pour créer une zone/un trait courbé (création à taille par défaut
 * puis glisser/redimensionner), pas de panneau d'édition (couleur, contenu
 * du texte…), pas d'étapes multiples, pas de bibliothèque — tranche 3+.
 *
 * `schematicId` vaut "new" pour un schéma vide (créé à l'enregistrement),
 * sinon l'id d'un schéma existant à charger. Le JSON complet est conservé en
 * mémoire et réécrit intégralement à la sauvegarde (règle §1 du plan) : seuls
 * `pitch`, `keyframes[0].{entities,lines,texts,pulses}` et `zones` sont mutés
 * ici, le reste (variantes, règles, mode avancé) passe intact.
 */

let idSeq = 0;
function nextId(prefix: string) {
  idSeq += 1;
  return `${prefix}${Date.now() % 100000}${idSeq}`;
}

const ENTITY_BUTTONS: Array<{ label: string; type: DrillEntity['type']; team: DrillEntity['team'] }> = [
  { label: 'Nous', type: 'player', team: 'home' },
  { label: 'Adv.', type: 'player', team: 'away' },
  { label: 'Appui', type: 'support', team: 'support' },
  { label: 'Ballon', type: 'ball', team: 'none' },
  { label: 'But', type: 'goal', team: 'none' },
];

const EQUIP_BUTTONS: Array<{ label: string; type: string }> = [
  { label: 'Plot', type: 'cone' },
  { label: 'Coupelle', type: 'saucer' },
  { label: 'Piquet', type: 'pole' },
  { label: 'Cerceau', type: 'hoop' },
  { label: 'Haie', type: 'hurdle' },
  { label: 'Échelle', type: 'ladder' },
  { label: 'Mini-but', type: 'minigoal' },
];

export default function SchematicEditorScreen() {
  const { trainingId, schematicId } = useLocalSearchParams<{ trainingId: string; schematicId: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useStyles();
  const { activeTeamId } = useActiveTeam();

  const isNew = schematicId === 'new';
  const [drill, setDrill] = useState<Drill | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<SelectedItem>(null);

  useEffect(() => {
    navigation.setOptions({ title: 'Schéma tactique' });
  }, [navigation]);

  useEffect(() => {
    if (isNew) {
      setDrill(emptyDrill());
      return;
    }
    let cancelled = false;
    getSchematicById(schematicId)
      .then((row) => {
        if (cancelled || !row) return;
        setRecordId(row.id);
        setDrill(row.data);
      })
      .catch((err) => Alert.alert('Erreur', err instanceof Error ? err.message : 'Chargement du schéma impossible'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, schematicId]);

  const kf = drill?.keyframes[0];
  const entities = kf?.entities ?? [];
  const lines = kf?.lines ?? [];
  const texts = kf?.texts ?? [];
  const pulses = kf?.pulses ?? [];
  const zones = drill?.zones ?? [];

  const patchKeyframe = useCallback((patch: Partial<Drill['keyframes'][number]>) => {
    setDrill((d) => {
      if (!d) return d;
      const next = [...d.keyframes];
      next[0] = { ...next[0], ...patch };
      return { ...d, keyframes: next };
    });
  }, []);
  const onEntitiesChange = useCallback((next: DrillEntity[]) => patchKeyframe({ entities: next }), [patchKeyframe]);
  const onLinesChange = useCallback((next: DrillLine[]) => patchKeyframe({ lines: next }), [patchKeyframe]);
  const onTextsChange = useCallback((next: DrillText[]) => patchKeyframe({ texts: next }), [patchKeyframe]);
  const onPulsesChange = useCallback((next: DrillPulse[]) => patchKeyframe({ pulses: next }), [patchKeyframe]);
  const onZonesChange = useCallback((next: DrillZone[]) => setDrill((d) => (d ? { ...d, zones: next } : d)), []);

  const addEntity = useCallback(
    (spec: { label: string; type: DrillEntity['type']; team: DrillEntity['team'] }) => {
      const homeCount = entities.filter((e) => e.team === 'home' && e.type === 'player').length;
      const label = spec.type === 'player' || spec.type === 'support' ? String(entities.filter((e) => e.type === spec.type).length + 1) : undefined;
      const entity: DrillEntity = { id: nextId(spec.type[0]), type: spec.type, team: spec.team, x: 20 + homeCount * 0.1, y: 10, label };
      onEntitiesChange([...entities, entity]);
      setSelected({ kind: 'entity', id: entity.id });
    },
    [entities, onEntitiesChange]
  );

  const addEquip = useCallback(
    (spec: { label: string; type: string }) => {
      const entity: DrillEntity = { id: nextId(spec.type[0]), type: spec.type, team: 'none', x: 20, y: 10 };
      onEntitiesChange([...entities, entity]);
      setSelected({ kind: 'entity', id: entity.id });
    },
    [entities, onEntitiesChange]
  );

  const addZone = useCallback(() => {
    const zone: DrillZone = { id: nextId('z'), kind: 'area', shape: 'rect', x: 17, y: 8, w: 6, h: 4 };
    onZonesChange([...zones, zone]);
    setSelected({ kind: 'zone', id: zone.id });
  }, [zones, onZonesChange]);

  const addLine = useCallback(() => {
    const line: DrillLine = { id: nextId('ln'), x1: 16, y1: 10, x2: 24, y2: 10, color: '#ffffff', width: 2, head: 'arrow' };
    onLinesChange([...lines, line]);
    setSelected({ kind: 'line', id: line.id });
  }, [lines, onLinesChange]);

  const addText = useCallback(() => {
    const text: DrillText = { id: nextId('tx'), x: 20, y: 10, text: 'Texte', color: '#ffffff' };
    onTextsChange([...texts, text]);
    setSelected({ kind: 'text', id: text.id });
  }, [texts, onTextsChange]);

  const addPulse = useCallback(() => {
    const pulse: DrillPulse = { id: nextId('pu'), x: 20, y: 10, color: '#ff3b30', size: 1 };
    onPulsesChange([...pulses, pulse]);
    setSelected({ kind: 'pulse', id: pulse.id });
  }, [pulses, onPulsesChange]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    if (selected.kind === 'entity') onEntitiesChange(entities.filter((it) => it.id !== selected.id));
    else if (selected.kind === 'zone') onZonesChange(zones.filter((it) => it.id !== selected.id));
    else if (selected.kind === 'line') onLinesChange(lines.filter((it) => it.id !== selected.id));
    else if (selected.kind === 'text') onTextsChange(texts.filter((it) => it.id !== selected.id));
    else if (selected.kind === 'pulse') onPulsesChange(pulses.filter((it) => it.id !== selected.id));
    setSelected(null);
  }, [selected, entities, zones, lines, texts, pulses, onEntitiesChange, onZonesChange, onLinesChange, onTextsChange, onPulsesChange]);

  const handleSave = useCallback(async () => {
    if (!drill || !activeTeamId) return;
    setSaving(true);
    try {
      if (recordId) {
        await updateSchematic(recordId, drill);
      } else {
        const row = await createSchematic(activeTeamId, drill);
        setRecordId(row.id);
      }
      router.back();
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : "Échec de l'enregistrement du schéma");
    } finally {
      setSaving(false);
    }
  }, [drill, activeTeamId, recordId, router]);

  if (loading || !drill) {
    return (
      <Screen scroll={false}>
        <View style={s.center}>
          <ActivityIndicator color={theme.colors.accent.default} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={s.board}>
        <TacticsBoard
          pitch={drill.pitch}
          drill={drill}
          entities={entities}
          onEntitiesChange={onEntitiesChange}
          zones={zones}
          onZonesChange={onZonesChange}
          lines={lines}
          onLinesChange={onLinesChange}
          texts={texts}
          onTextsChange={onTextsChange}
          pulses={pulses}
          onPulsesChange={onPulsesChange}
          selected={selected}
          onSelect={setSelected}
        />
      </View>

      {selected && (
        <Button label="Supprimer la sélection" icon="trash-outline" variant="destructive" size="sm" onPress={deleteSelected} style={s.deleteBtn} />
      )}

      <Text variant="caption" tone="secondary" style={s.sectionLabel}>
        Joueurs
      </Text>
      <View style={s.addRow}>
        {ENTITY_BUTTONS.map((spec) => (
          <Button key={spec.label} label={spec.label} size="sm" variant="secondary" onPress={() => addEntity(spec)} />
        ))}
      </View>

      <Text variant="caption" tone="secondary" style={s.sectionLabel}>
        Matériel
      </Text>
      <View style={s.addRow}>
        {EQUIP_BUTTONS.map((spec) => (
          <Button key={spec.label} label={spec.label} size="sm" variant="secondary" onPress={() => addEquip(spec)} />
        ))}
      </View>

      <Text variant="caption" tone="secondary" style={s.sectionLabel}>
        Dessin
      </Text>
      <View style={s.addRow}>
        <Button label="Zone" size="sm" variant="secondary" onPress={addZone} />
        <Button label="Trait" size="sm" variant="secondary" onPress={addLine} />
        <Button label="Texte" size="sm" variant="secondary" onPress={addText} />
        <Button label="Pulse" size="sm" variant="secondary" onPress={addPulse} />
      </View>

      <Button label="Enregistrer" onPress={handleSave} loading={saving} disabled={saving} block style={s.saveBtn} />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  board: { marginBottom: t.space.md },
  sectionLabel: { marginBottom: t.space.xs, marginTop: t.space.sm },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, marginBottom: t.space.sm },
  deleteBtn: { marginBottom: t.space.sm },
  saveBtn: { marginTop: t.space.md },
}));
