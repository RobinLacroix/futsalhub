import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, makeStyles } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { Screen, Text, Button, Card, EmptyState } from '../../../components/ui';
import { SchematicThumbnail } from '../../../components/tactics/SchematicThumbnail';
import { getFoldersByTeam, type SchematicFolderRecord } from '../../../lib/services/schematicFoldersService';
import { getSchematicsByTeamId, type SchematicRecord } from '../../../lib/services/schematicsService';

/**
 * Bibliothèque de schémas — lecture seule (cf SPEC_TACTIQUE_NATIF_MOBILE_2026-09.md
 * §5 : l'édition/dessin de schémas reste une tâche web). Dossiers en filtre
 * horizontal, grille de vignettes statiques (SchematicThumbnail, sans geste).
 */
export default function LibraryScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const s = useStyles();
  const { activeTeam } = useActiveTeam();

  const [folders, setFolders] = useState<SchematicFolderRecord[]>([]);
  const [schematics, setSchematics] = useState<SchematicRecord[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null | 'all'>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeTeam?.id) return;
    setLoading(true);
    try {
      const [f, sc] = await Promise.all([getFoldersByTeam(activeTeam.id), getSchematicsByTeamId(activeTeam.id)]);
      setFolders(f);
      setSchematics(sc);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Chargement de la bibliothèque impossible');
    } finally {
      setLoading(false);
    }
  }, [activeTeam?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = schematics.filter((sc) => {
    if (activeFolder === 'all') return true;
    if (activeFolder === null) return sc.folder_id == null;
    return sc.folder_id === activeFolder;
  });

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={s.center}>
          <ActivityIndicator color={theme.colors.accent.default} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      {folders.length > 0 && (
        <View style={s.folderRow}>
          <Button label="Tout" size="sm" variant={activeFolder === 'all' ? 'primary' : 'secondary'} onPress={() => setActiveFolder('all')} />
          <Button label="Sans dossier" size="sm" variant={activeFolder === null ? 'primary' : 'secondary'} onPress={() => setActiveFolder(null)} />
          {folders.map((f) => (
            <Button
              key={f.id}
              label={f.name}
              size="sm"
              variant={activeFolder === f.id ? 'primary' : 'secondary'}
              onPress={() => setActiveFolder(f.id)}
            />
          ))}
        </View>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title="Aucun schéma"
          description="Les schémas créés sur le site FutsalHub apparaîtront ici."
        />
      ) : (
        <View style={s.grid}>
          {visible.map((sc) => (
            <Card
              key={sc.id}
              variant="flat"
              padding="sm"
              style={s.card}
              onPress={() => router.push(`/(tabs)/library/${sc.id}` as never)}
              accessibilityLabel={sc.name || 'Sans titre'}
            >
              <SchematicThumbnail drill={sc.data} />
              <Text variant="callout" numberOfLines={1} style={s.cardTitle}>
                {sc.name || 'Sans titre'}
              </Text>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  folderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, marginBottom: t.space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },
  card: { width: '47%', gap: t.space.xs },
  cardTitle: { paddingHorizontal: 2 },
}));
