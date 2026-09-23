import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTheme, makeStyles } from '../../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../../contexts/ActiveTeamContext';
import { useIsTablet } from '../../../../hooks/useIsTablet';
import { Screen, Text, EmptyState, HeaderBackButton, BackLink } from '../../../../components/ui';
import { ProcedureCard } from '../../../../components/tactics/ProcedureCard';
import { FilterChip } from '../../../../components/tactics/FilterChip';
import { BLOCS } from '../../../../lib/tactics/procedureTaxonomy';
import { getFoldersByClub, type SchematicFolderRecord } from '../../../../lib/services/schematicFoldersService';
import { getFullLibraryByClub, type LibraryCard } from '../../../../lib/services/trainingProceduresService';

/** Contenu d'un dossier de la bibliothèque — même grille/filtres que l'écran racine, portée réduite au dossier (club-wide, cf index.tsx). */
export default function LibraryFolderScreen() {
  const { folderId } = useLocalSearchParams<{ folderId: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { theme } = useTheme();
  const isTablet = useIsTablet();
  const s = useStyles();
  const { activeTeam } = useActiveTeam();

  const [folder, setFolder] = useState<SchematicFolderRecord | null>(null);
  const [cards, setCards] = useState<LibraryCard[]>([]);
  const [activeBloc, setActiveBloc] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const clubId = activeTeam?.club_id;
    if (!clubId) return;
    setLoading(true);
    try {
      const [folders, lib] = await Promise.all([getFoldersByClub(clubId), getFullLibraryByClub(clubId)]);
      setFolder(folders.find((f) => f.id === folderId) ?? null);
      setCards(lib.filter((card) => card.folder_id === folderId));
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Chargement du dossier impossible');
    } finally {
      setLoading(false);
    }
  }, [activeTeam?.club_id, folderId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    navigation.setOptions({
      title: folder?.name || 'Dossier',
      headerLeft: () => <HeaderBackButton onPress={() => router.back()} />,
    });
  }, [navigation, folder, router]);

  const visible = activeBloc ? cards.filter((card) => card.bloc === activeBloc) : cards;

  const openCard = useCallback(
    (card: LibraryCard) => {
      if (card.kind === 'procedure' && card.procedure) {
        router.push(`/(tabs)/library/procedure/${card.procedure.id}` as never);
      } else if (card.schematic) {
        router.push(`/(tabs)/library/${card.schematic.id}` as never);
      }
    },
    [router],
  );

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

  return (
    <Screen onRefresh={load} refreshing={loading}>
      {isTablet && (
        <>
          <BackLink onPress={() => router.back()} />
          <Text variant="title" style={s.title}>
            {folder?.name || 'Dossier'}
          </Text>
        </>
      )}
      <View style={s.filterRow}>
        <FilterChip active={activeBloc === ''} label="Tous" onPress={() => setActiveBloc('')} />
        {BLOCS.map((bloc) => (
          <FilterChip key={bloc} active={activeBloc === bloc} label={bloc} onPress={() => setActiveBloc(bloc)} />
        ))}
      </View>

      {visible.length === 0 ? (
        <EmptyState icon="albums-outline" title="Aucun procédé" description="Ce dossier ne contient rien pour ce filtre." />
      ) : (
        <View style={s.grid}>
          {visible.map((card) => (
            <ProcedureCard key={card.key} card={card} onPress={() => openCard(card)} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { marginBottom: t.space.lg },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, marginBottom: t.space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },
}));
