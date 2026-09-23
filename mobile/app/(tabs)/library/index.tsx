import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, Alert, TextInput, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { Screen, Text, EmptyState } from '../../../components/ui';
import { ProcedureCard } from '../../../components/tactics/ProcedureCard';
import { FilterChip } from '../../../components/tactics/FilterChip';
import { NewFolderSheet } from '../../../components/tactics/NewFolderSheet';
import { BLOCS } from '../../../lib/tactics/procedureTaxonomy';
import { createFolder, getFoldersByClub, type SchematicFolderRecord } from '../../../lib/services/schematicFoldersService';
import { getFullLibraryByClub, type LibraryCard } from '../../../lib/services/trainingProceduresService';

/**
 * Bibliothèque — même bibliothèque que la webapp (app/webapp/library/page.tsx,
 * recadrage 2026-09-22 puis demande explicite de Robin "la section librairie
 * [doit être] la même que dans la webapp") : une carte par procédé (avec sa
 * fiche complète, cf écran procedure/[procedureId]) OU par schéma sans fiche
 * liée ("Sans fiche"), jamais deux bibliothèques séparées. Lecture seule côté
 * mobile — dessiner/éditer un schéma reste une tâche web (cf DrillPlayer).
 *
 * Filtre par Bloc (Échauffement/Problématisation/Situation isolée/
 * Analytique/Jeu orienté/Match libre), pas par l'ancienne catégorie de schéma
 * (entrainement/cpa/animation) — ce n'est plus le même axe côté web depuis le
 * recadrage. Une recherche active aplatit la navigation par dossier.
 */
export default function LibraryScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const s = useStyles();
  const { activeTeam } = useActiveTeam();

  const [folders, setFolders] = useState<SchematicFolderRecord[]>([]);
  const [cards, setCards] = useState<LibraryCard[]>([]);
  const [search, setSearch] = useState('');
  const [activeBloc, setActiveBloc] = useState('');
  const [newFolderVisible, setNewFolderVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const clubId = activeTeam?.club_id;
    if (!clubId) return;
    setLoading(true);
    try {
      const [f, lib] = await Promise.all([getFoldersByClub(clubId), getFullLibraryByClub(clubId)]);
      setFolders(f);
      setCards(lib);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Chargement de la bibliothèque impossible');
    } finally {
      setLoading(false);
    }
  }, [activeTeam?.club_id]);

  useEffect(() => {
    load();
  }, [load]);

  const matches = useCallback(
    (card: LibraryCard, q: string) => {
      const matchBloc = !activeBloc || card.bloc === activeBloc;
      const matchSearch =
        q.length === 0 ||
        card.title.toLowerCase().includes(q) ||
        (card.theme?.toLowerCase().includes(q) ?? false);
      return matchBloc && matchSearch;
    },
    [activeBloc],
  );

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;

  const flatResults = useMemo(() => cards.filter((card) => matches(card, q)), [cards, matches, q]);
  const rootCards = useMemo(() => cards.filter((card) => card.folder_id == null && matches(card, '')), [cards, matches]);
  const folderCount = useCallback((folderId: string) => cards.filter((card) => card.folder_id === folderId).length, [cards]);

  const handleCreateFolder = async (name: string) => {
    if (!activeTeam?.id) return;
    try {
      await createFolder(activeTeam.id, name);
      await load();
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Création du dossier impossible');
    }
  };

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
        <View style={s.center}>
          <ActivityIndicator color={theme.colors.accent.default} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <View style={[s.searchBar, { backgroundColor: c.bg.surface, borderColor: c.border.subtle }]}>
        <Ionicons name="search-outline" size={16} color={c.text.tertiary} />
        <TextInput
          style={[s.searchInput, { color: c.text.primary }]}
          placeholder="Rechercher un titre, une phase de jeu…"
          accessibilityLabel="Rechercher"
          value={search}
          onChangeText={setSearch}
          placeholderTextColor={c.text.tertiary}
          clearButtonMode="while-editing"
        />
      </View>

      <View style={s.filterRow}>
        <FilterChip active={activeBloc === ''} label="Tous" onPress={() => setActiveBloc('')} />
        {BLOCS.map((bloc) => (
          <FilterChip key={bloc} active={activeBloc === bloc} label={bloc} onPress={() => setActiveBloc(bloc)} />
        ))}
      </View>

      {searching ? (
        flatResults.length === 0 ? (
          <EmptyState icon="search-outline" title="Aucun résultat" description="Essaie un autre titre ou une autre phase de jeu." />
        ) : (
          <View style={s.grid}>
            {flatResults.map((card) => (
              <ProcedureCard key={card.key} card={card} onPress={() => openCard(card)} />
            ))}
          </View>
        )
      ) : (
        <>
          <View style={s.sectionHead}>
            <Text variant="headline">Dossiers</Text>
          </View>
          <View style={s.folderRow}>
            {folders.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => router.push(`/(tabs)/library/folder/${f.id}` as never)}
                style={[s.folderTile, { backgroundColor: c.bg.surface, borderColor: c.border.subtle }]}
              >
                <Ionicons name="folder-outline" size={18} color={c.accent.default} />
                <Text variant="callout" weight="600" numberOfLines={1} style={s.folderTileLabel}>
                  {f.name}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {folderCount(f.id)}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setNewFolderVisible(true)}
              style={[s.folderTile, s.folderTileNew, { borderColor: c.border.strong }]}
            >
              <Ionicons name="add" size={18} color={c.text.secondary} />
              <Text variant="callout" weight="600" tone="secondary">
                Nouveau dossier
              </Text>
            </Pressable>
          </View>

          <View style={s.sectionHead}>
            <Text variant="headline">Sans dossier</Text>
          </View>
          {rootCards.length === 0 ? (
            <EmptyState
              icon="albums-outline"
              title="Aucun procédé"
              description="Les procédés et schémas créés sur le site FutsalHub apparaîtront ici."
              compact
            />
          ) : (
            <View style={s.grid}>
              {rootCards.map((card) => (
                <ProcedureCard key={card.key} card={card} onPress={() => openCard(card)} />
              ))}
            </View>
          )}
        </>
      )}

      <NewFolderSheet visible={newFolderVisible} onClose={() => setNewFolderVisible(false)} onCreate={handleCreateFolder} />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    borderRadius: t.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: t.space.md,
    height: 44,
    marginBottom: t.space.md,
  },
  searchInput: { flex: 1, fontSize: 15, height: '100%' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, marginBottom: t.space.lg },
  sectionHead: { marginBottom: t.space.md },
  folderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, marginBottom: t.space.xl },
  folderTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    minHeight: 44,
    borderRadius: t.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: t.space.md,
    paddingVertical: t.space.sm,
  },
  folderTileLabel: { maxWidth: 140 },
  folderTileNew: { borderStyle: 'dashed' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },
}));
