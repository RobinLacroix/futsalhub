import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTheme, makeStyles } from '../../../../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../../../../contexts/ActiveTeamContext';
import { Screen, Text, Button } from '../../../../../../components/ui';
import { TacticsBoard } from '../../../../../../components/tactics/TacticsBoard';
import { getSchematicById, createSchematic, updateSchematic } from '../../../../../../lib/services/schematicsService';
import { emptyDrill, type Drill, type DrillEntity } from '../../../../../../lib/tactics/types';

/**
 * Écran tranche 1 (cf PLAN_TACTIQUE_NATIF_MOBILE_TRANCHE1_2026-09.md) :
 * positionnement statique uniquement — un joueur "nous", un adversaire, un
 * appui, un ballon, un but. Pas de matériel complet, pas de bibliothèque de
 * schémas (liste), pas d'étapes multiples — cf §7 du plan pour tout le reste.
 *
 * `schematicId` vaut "new" pour un schéma vide (créé à l'enregistrement),
 * sinon l'id d'un schéma existant à charger. Le JSON complet est conservé en
 * mémoire et réécrit intégralement à la sauvegarde (règle §1 du plan) : seuls
 * `pitch` et `keyframes[0].entities` sont mutés ici, le reste (zones, traits,
 * variantes...) passe intact.
 */

let entitySeq = 0;
function nextId(prefix: string) {
  entitySeq += 1;
  return `${prefix}${Date.now() % 100000}${entitySeq}`;
}

const ADD_BUTTONS: Array<{ label: string; type: DrillEntity['type']; team: DrillEntity['team']; color: string }> = [
  { label: 'Nous', type: 'player', team: 'home', color: '#1e63d6' },
  { label: 'Adv.', type: 'player', team: 'away', color: '#d63b2f' },
  { label: 'Appui', type: 'support', team: 'support', color: '#e0a021' },
  { label: 'Ballon', type: 'ball', team: 'none', color: '#ffffff' },
  { label: 'But', type: 'goal', team: 'none', color: '#eafff0' },
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const entities = drill?.keyframes[0]?.entities ?? [];

  const onEntitiesChange = useCallback((next: DrillEntity[]) => {
    setDrill((d) => {
      if (!d) return d;
      const kf = [...d.keyframes];
      kf[0] = { ...kf[0], entities: next };
      return { ...d, keyframes: kf };
    });
  }, []);

  const addEntity = useCallback(
    (spec: (typeof ADD_BUTTONS)[number]) => {
      const homeCount = entities.filter((e) => e.team === 'home' && e.type === 'player').length;
      const label = spec.type === 'player' || spec.type === 'support' ? String(entities.filter((e) => e.type === spec.type).length + 1) : undefined;
      const entity: DrillEntity = {
        id: nextId(spec.type[0]),
        type: spec.type,
        team: spec.team,
        x: 20 + homeCount * 0.1,
        y: 10,
        label,
      };
      onEntitiesChange([...entities, entity]);
      setSelectedId(entity.id);
    },
    [entities, onEntitiesChange]
  );

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
    <Screen scroll={false}>
      <View style={s.board}>
        <TacticsBoard
          pitch={drill.pitch}
          drill={drill}
          entities={entities}
          onEntitiesChange={onEntitiesChange}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </View>
      <View style={s.addRow}>
        {ADD_BUTTONS.map((spec) => (
          <View key={spec.label} style={s.addBtnWrap}>
            <Button label={spec.label} size="sm" variant="secondary" onPress={() => addEntity(spec)} />
          </View>
        ))}
      </View>
      <Button label="Enregistrer" onPress={handleSave} loading={saving} disabled={saving} block />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  board: { marginBottom: t.space.md },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, marginBottom: t.space.lg },
  addBtnWrap: { minWidth: 0 },
}));
