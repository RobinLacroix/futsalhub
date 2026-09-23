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
import { BLOCS, FORMATS, PHASES_DE_JEU, INTENSITES } from '../../../lib/tactics/procedureTaxonomy';
import { createFolder, getFoldersByClub, type SchematicFolderRecord } from '../../../lib/services/schematicFoldersService';
import {
  getFullLibraryByClub,
  archiveProcedure,
  type LibraryCard,
  type TrainingProcedureType,
  type TrainingProcedureTheme,
  type TrainingProcedureIntensite,
} from '../../../lib/services/trainingProceduresService';
import { deleteSchematic } from '../../../lib/services/schematicsService';

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
 *
 * Recherche plein-contenu + filtres avancés + suppression (2026-09-23) —
 * miroir de app/webapp/library/page.tsx (filteredItems/handleDeleteCard).
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

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedFormats, setSelectedFormats] = useState<TrainingProcedureType[]>([]);
  const [selectedPhases, setSelectedPhases] = useState<TrainingProcedureTheme[]>([]);
  const [selectedIntensites, setSelectedIntensites] = useState<TrainingProcedureIntensite[]>([]);
  const [selectedPrincipes, setSelectedPrincipes] = useState<string[]>([]);

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
      const matchFormat = selectedFormats.length === 0 || (!!card.procedure && selectedFormats.includes(card.procedure.type));
      const matchPhase = selectedPhases.length === 0 || (!!card.procedure && selectedPhases.includes(card.procedure.theme));
      const matchIntensite =
        selectedIntensites.length === 0 ||
        (!!card.procedure?.intensite && selectedIntensites.includes(card.procedure.intensite));
      const matchPrincipes =
        selectedPrincipes.length === 0 ||
        (card.procedure?.principes || []).some((x) => selectedPrincipes.includes(x));

      if (!matchBloc || !matchFormat || !matchPhase || !matchIntensite || !matchPrincipes) return false;
      if (q.length === 0) return true;

      const p = card.procedure;
      return (
        card.title.toLowerCase().includes(q) ||
        (card.theme?.toLowerCase().includes(q) ?? false) ||
        (p?.objectives.toLowerCase().includes(q) ?? false) ||
        (p?.instructions?.toLowerCase().includes(q) ?? false) ||
        (p?.principes || []).some((x) => x.toLowerCase().includes(q)) ||
        (p?.scoring || []).some((x) => x.toLowerCase().includes(q)) ||
        (p?.comportements || []).some((x) => x.toLowerCase().includes(q)) ||
        (p?.variables_plus || []).some((x) => x.toLowerCase().includes(q)) ||
        (p?.variables_moins || []).some((x) => x.toLowerCase().includes(q)) ||
        (p?.mecanismes || []).some((m) => m.regle.toLowerCase().includes(q) || m.induit.toLowerCase().includes(q)) ||
        (p?.rapport_numerique?.toLowerCase().includes(q) ?? false)
      );
    },
    [activeBloc, selectedFormats, selectedPhases, selectedIntensites, selectedPrincipes],
  );

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;

  const flatResults = useMemo(() => cards.filter((card) => matches(card, q)), [cards, matches, q]);
  const rootCards = useMemo(() => cards.filter((card) => card.folder_id == null && matches(card, '')), [cards, matches]);
  const folderCount = useCallback((folderId: string) => cards.filter((card) => card.folder_id === folderId).length, [cards]);

  const availablePrincipes = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((card) => (card.procedure?.principes || []).forEach((x) => x && set.add(x)));
    return Array.from(set).sort();
  }, [cards]);

  const advancedFilterCount =
    selectedFormats.length + selectedPhases.length + selectedIntensites.length + selectedPrincipes.length;

  const resetAdvancedFilters = () => {
    setSelectedFormats([]);
    setSelectedPhases([]);
    setSelectedIntensites([]);
    setSelectedPrincipes([]);
  };

  function toggleFilter<T>(list: T[], setList: (v: T[]) => void, value: T) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  const handleDeleteCard = useCallback((card: LibraryCard) => {
    const label = card.title || 'sans titre';
    if (card.kind === 'procedure' && card.procedure) {
      Alert.alert('Supprimer ce procédé ?', `« ${label} » disparaîtra de la bibliothèque. Le schéma dessiné, s'il y en a un, n'est pas supprimé.`, [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveProcedure(card.procedure!.id);
              setCards((prev) => prev.filter((cc) => cc.key !== card.key));
            } catch (err) {
              Alert.alert('Erreur', err instanceof Error ? err.message : 'Impossible de supprimer ce procédé.');
            }
          },
        },
      ]);
    } else if (card.schematic) {
      Alert.alert('Supprimer ce schéma ?', `« ${label} » sera supprimé définitivement. Cette action est irréversible.`, [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSchematic(card.schematic!.id);
              setCards((prev) => prev.filter((cc) => cc.key !== card.key));
            } catch (err) {
              Alert.alert('Erreur', err instanceof Error ? err.message : 'Impossible de supprimer ce schéma.');
            }
          },
        },
      ]);
    }
  }, []);

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

      <View style={s.advancedRow}>
        <Pressable
          onPress={() => setShowAdvancedFilters((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Filtres"
          style={[
            s.advancedBtn,
            {
              backgroundColor: advancedFilterCount > 0 ? c.accent.subtle : c.bg.surface,
              borderColor: advancedFilterCount > 0 ? c.accent.border : c.border.subtle,
            },
          ]}
        >
          <Ionicons name="options-outline" size={15} color={advancedFilterCount > 0 ? c.accent.default : c.text.secondary} />
          <Text variant="callout" weight="600" tone={advancedFilterCount > 0 ? 'accent' : 'secondary'}>
            Filtres
          </Text>
          {advancedFilterCount > 0 && (
            <View style={[s.advancedBadge, { backgroundColor: c.accent.fill }]}>
              <Text variant="caption" tone="onFill" numeric>
                {advancedFilterCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      {showAdvancedFilters && (
        <View style={[s.filterPanel, { backgroundColor: c.bg.sunken, borderColor: c.border.subtle }]}>
          <Text variant="caption" tone="tertiary" weight="600">FORMAT</Text>
          <View style={s.chipRow}>
            {FORMATS.map((f) => (
              <FilterChip key={f} label={f} active={selectedFormats.includes(f)} onPress={() => toggleFilter(selectedFormats, setSelectedFormats, f)} />
            ))}
          </View>
          <Text variant="caption" tone="tertiary" weight="600">PHASE DE JEU</Text>
          <View style={s.chipRow}>
            {PHASES_DE_JEU.map((p) => (
              <FilterChip key={p} label={p} active={selectedPhases.includes(p)} onPress={() => toggleFilter(selectedPhases, setSelectedPhases, p)} />
            ))}
          </View>
          <Text variant="caption" tone="tertiary" weight="600">INTENSITÉ</Text>
          <View style={s.chipRow}>
            {INTENSITES.map((i) => (
              <FilterChip key={i} label={i} active={selectedIntensites.includes(i)} onPress={() => toggleFilter(selectedIntensites, setSelectedIntensites, i)} />
            ))}
          </View>
          {availablePrincipes.length > 0 && (
            <>
              <Text variant="caption" tone="tertiary" weight="600">PRINCIPES</Text>
              <View style={s.chipRow}>
                {availablePrincipes.map((p) => (
                  <FilterChip key={p} label={p} active={selectedPrincipes.includes(p)} onPress={() => toggleFilter(selectedPrincipes, setSelectedPrincipes, p)} />
                ))}
              </View>
            </>
          )}
          {advancedFilterCount > 0 && (
            <Pressable onPress={resetAdvancedFilters}>
              <Text variant="caption" tone="accent">Réinitialiser les filtres</Text>
            </Pressable>
          )}
        </View>
      )}

      {searching ? (
        flatResults.length === 0 ? (
          <EmptyState icon="search-outline" title="Aucun résultat" description="Essaie un autre titre ou une autre phase de jeu." />
        ) : (
          <View style={s.grid}>
            {flatResults.map((card) => (
              <ProcedureCard key={card.key} card={card} onPress={() => openCard(card)} onDelete={() => handleDeleteCard(card)} />
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
                <ProcedureCard key={card.key} card={card} onPress={() => openCard(card)} onDelete={() => handleDeleteCard(card)} />
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
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, marginBottom: t.space.md },
  advancedRow: { marginBottom: t.space.md },
  advancedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: t.space.xs,
    minHeight: 36,
    borderRadius: t.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: t.space.md,
  },
  advancedBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: t.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: t.radius.md,
    padding: t.space.md,
    gap: t.space.sm,
    marginBottom: t.space.lg,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
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
