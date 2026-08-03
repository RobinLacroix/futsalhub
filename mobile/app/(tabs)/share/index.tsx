import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, Alert, Linking, Image, ScrollView, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { haptics } from '../../../lib/design/haptics';
import {
  getSharedContent,
  getSharedFolders,
  createSharedContent,
  createSharedFolder,
  renameSharedFolder,
  deleteSharedContent,
  deleteSharedFolder,
  getSharedContentAnalytics,
  extractYoutubeId,
  isYoutubeUrl,
  youtubeThumbnail,
  type SharedContent,
  type SharedFolder,
  type ContentAnalyticsRow,
} from '../../../lib/services/sharedContent';
import {
  Text,
  Card,
  Button,
  IconButton,
  Badge,
  Field,
  Input,
  ChipGroup,
  Sheet,
  Section,
  EmptyState,
  SkeletonList,
  type ChipOption,
} from '../../../components/ui';
import { ShareAnalyticsSheet } from '../../../components/share/ShareAnalyticsSheet';

type ContentFilter = 'all' | 'youtube' | 'link';
type SheetKind = 'add-content' | 'add-folder' | 'rename-folder' | null;

export default function ShareScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { activeTeamId } = useActiveTeam();

  const [folders, setFolders] = useState<SharedFolder[]>([]);
  const [items, setItems] = useState<SharedContent[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<SharedFolder[]>([]);
  const [filter, setFilter] = useState<ContentFilter>('all');

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [renameTarget, setRenameTarget] = useState<SharedFolder | null>(null);

  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsRows, setAnalyticsRows] = useState<ContentAnalyticsRow[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [addFolderId, setAddFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Chargement ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!activeTeamId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [f, i] = await Promise.all([getSharedFolders(activeTeamId), getSharedContent(activeTeamId)]);
      setFolders(f);
      setItems(i);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de charger la bibliothèque');
    } finally {
      setLoading(false);
    }
  }, [activeTeamId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setAddFolderId(currentFolderId);
  }, [currentFolderId]);

  // ── Dérivés ───────────────────────────────────────────────────────────────

  const currentFolders = useMemo(
    () => folders.filter((f) => f.parent_id === currentFolderId),
    [folders, currentFolderId]
  );

  const inCurrent = useMemo(
    () => items.filter((i) => (i.folder_id ?? null) === currentFolderId),
    [items, currentFolderId]
  );

  const currentItems = useMemo(
    () => (filter === 'all' ? inCurrent : inCurrent.filter((i) => i.content_type === filter)),
    [inCurrent, filter]
  );

  const countInFolder = useCallback(
    (fid: string | null): number => {
      const direct = items.filter((i) => (i.folder_id ?? null) === fid).length;
      const children = folders
        .filter((f) => f.parent_id === fid)
        .reduce((sum, f) => sum + countInFolder(f.id), 0);
      return direct + children;
    },
    [items, folders]
  );

  const FILTERS: readonly ChipOption<ContentFilter>[] = useMemo(() => {
    const yt = inCurrent.filter((i) => i.content_type === 'youtube').length;
    return [
      { value: 'all', label: `Tous (${inCurrent.length})` },
      { value: 'youtube', label: `Vidéos (${yt})`, icon: 'logo-youtube' },
      { value: 'link', label: `Liens (${inCurrent.length - yt})`, icon: 'link-outline' },
    ];
  }, [inCurrent]);

  // ── Navigation ────────────────────────────────────────────────────────────

  const enterFolder = (f: SharedFolder) => {
    haptics.tapLight();
    setCurrentFolderId(f.id);
    setFolderPath((prev) => [...prev, f]);
    setFilter('all');
  };

  const goBack = () => {
    if (folderPath.length === 0) return;
    const next = folderPath.slice(0, -1);
    setFolderPath(next);
    setCurrentFolderId(next.length > 0 ? next[next.length - 1].id : null);
    setFilter('all');
  };

  const goRoot = () => {
    setCurrentFolderId(null);
    setFolderPath([]);
    setFilter('all');
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  const closeSheet = () => {
    setSheet(null);
    setTitle('');
    setUrl('');
    setDescription('');
    setFolderName('');
    setFormError(null);
    setRenameTarget(null);
  };

  const addContent = async () => {
    if (!activeTeamId || !title.trim() || !url.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      await createSharedContent({ teamId: activeTeamId, title, url, description, folderId: addFolderId });
      haptics.success();
      closeSheet();
      await load();
    } catch (e) {
      haptics.error();
      setFormError(e instanceof Error ? e.message : 'Impossible de publier');
    } finally {
      setSaving(false);
    }
  };

  const removeContent = (item: SharedContent) => {
    Alert.alert('Supprimer', `Supprimer « ${item.title} » de la bibliothèque ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteSharedContent(item.id);
          haptics.success();
          setItems((prev) => prev.filter((i) => i.id !== item.id));
        },
      },
    ]);
  };

  const addFolder = async () => {
    if (!activeTeamId || !folderName.trim()) return;
    setSaving(true);
    try {
      const f = await createSharedFolder(activeTeamId, folderName.trim(), currentFolderId);
      setFolders((prev) => [...prev, f].sort((a, b) => a.name.localeCompare(b.name, 'fr')));
      haptics.success();
      closeSheet();
    } catch (e) {
      haptics.error();
      setFormError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const renameFolder = async () => {
    if (!renameTarget || !folderName.trim()) return;
    setSaving(true);
    try {
      const name = folderName.trim();
      await renameSharedFolder(renameTarget.id, name);
      setFolders((prev) =>
        prev
          .map((f) => (f.id === renameTarget.id ? { ...f, name } : f))
          .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      );
      setFolderPath((prev) => prev.map((f) => (f.id === renameTarget.id ? { ...f, name } : f)));
      haptics.success();
      closeSheet();
    } catch (e) {
      haptics.error();
      setFormError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const removeFolder = (f: SharedFolder) => {
    const count = countInFolder(f.id);
    Alert.alert(
      'Supprimer le dossier',
      count > 0
        ? `Supprimer « ${f.name} » ? Ses ${count} ressource(s) remontent à la racine, elles ne sont pas supprimées.`
        : `Supprimer le dossier « ${f.name} » ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteSharedFolder(f.id);
            haptics.success();
            setFolders((prev) => prev.filter((x) => x.id !== f.id));
            if (currentFolderId === f.id) goRoot();
            await load();
          },
        },
      ]
    );
  };

  const openAnalytics = async () => {
    setAnalyticsOpen(true);
    if (!activeTeamId) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      setAnalyticsRows(await getSharedContentAnalytics(activeTeamId));
    } catch (e) {
      setAnalyticsError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // ── État non nominal ──────────────────────────────────────────────────────

  if (!activeTeamId) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <EmptyState
          icon="people-outline"
          title="Aucune équipe sélectionnée"
          description="Choisissez une équipe depuis l'accueil pour voir sa bibliothèque."
        />
      </View>
    );
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
      <View style={[styles.header, { backgroundColor: c.bg.surface, borderBottomColor: c.border.subtle }]}>
        <View style={styles.headerTop}>
          {folderPath.length > 0 && (
            <IconButton icon="chevron-back" label="Dossier parent" onPress={goBack} />
          )}
          <View style={styles.flex}>
            <View style={styles.breadcrumb}>
              <Pressable
                onPress={goRoot}
                disabled={folderPath.length === 0}
                accessibilityRole={folderPath.length > 0 ? 'button' : undefined}
                accessibilityLabel={folderPath.length > 0 ? 'Revenir à la racine' : undefined}
              >
                <Text
                  variant={folderPath.length === 0 ? 'title' : 'callout'}
                  tone={folderPath.length === 0 ? 'primary' : 'tertiary'}
                >
                  Bibliothèque
                </Text>
              </Pressable>
              {folderPath.map((f, i) => {
                const last = i === folderPath.length - 1;
                return (
                  <View key={f.id} style={styles.crumb}>
                    <Ionicons name="chevron-forward" size={12} color={c.text.tertiary} />
                    <Text
                      variant={last ? 'title' : 'callout'}
                      tone={last ? 'primary' : 'tertiary'}
                      numberOfLines={1}
                    >
                      {f.name}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text variant="caption" tone="tertiary">
              {folderPath.length === 0
                ? `${items.length} ressource${items.length !== 1 ? 's' : ''} au total`
                : `${inCurrent.length} ici`}
            </Text>
          </View>

          <IconButton icon="bar-chart-outline" label="Voir l'audience" onPress={openAnalytics} />
          <IconButton
            icon="folder-outline"
            label="Nouveau dossier"
            onPress={() => {
              setFormError(null);
              setFolderName('');
              setSheet('add-folder');
            }}
          />
          <Button
            label="Ajouter"
            icon="add"
            size="sm"
            onPress={() => {
              setAddFolderId(currentFolderId);
              setTitle('');
              setUrl('');
              setDescription('');
              setFormError(null);
              setSheet('add-content');
            }}
          />
        </View>

        {inCurrent.length > 0 && (
          <ChipGroup label="Filtrer par type" options={FILTERS} value={filter} onChange={setFilter} />
        )}
      </View>

      {loading ? (
        <SkeletonList rows={4} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { gap: theme.space.md }]}>
          {currentFolders.length > 0 && (
            <Section title="Dossiers">
              {currentFolders.map((f) => (
                <FolderRow
                  key={f.id}
                  folder={f}
                  count={countInFolder(f.id)}
                  onOpen={() => enterFolder(f)}
                  onRename={() => {
                    setRenameTarget(f);
                    setFolderName(f.name);
                    setFormError(null);
                    setSheet('rename-folder');
                  }}
                  onDelete={() => removeFolder(f)}
                />
              ))}
            </Section>
          )}

          {currentItems.length === 0 ? (
            <EmptyState
              icon={currentFolders.length > 0 ? 'document-outline' : 'library-outline'}
              title={
                items.length === 0 && currentFolders.length === 0
                  ? 'Bibliothèque vide'
                  : 'Aucune ressource ici'
              }
              description="Ajoutez une vidéo ou un lien à partager avec vos joueurs."
              action={{
                label: 'Ajouter une ressource',
                onPress: () => {
                  setAddFolderId(currentFolderId);
                  setSheet('add-content');
                },
              }}
            />
          ) : (
            <Section title={currentFolders.length > 0 ? 'Ressources' : undefined}>
              {currentItems.map((item) => (
                <ContentCard key={item.id} item={item} onDelete={() => removeContent(item)} />
              ))}
            </Section>
          )}
        </ScrollView>
      )}

      {/* ── Ajout de ressource ─────────────────────────────────────────── */}
      <Sheet
        visible={sheet === 'add-content'}
        onClose={closeSheet}
        title="Nouvelle ressource"
        subtitle="Une vidéo YouTube ou n'importe quel lien."
      >
        <View style={{ gap: theme.space.lg }}>
          <Input label="Titre" value={title} onChangeText={setTitle} placeholder="ex : Analyse défensive J12" />
          <Input
            label="Lien"
            value={url}
            onChangeText={setUrl}
            placeholder="https://…"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            hint={url.length > 0 && isYoutubeUrl(url) ? 'Vidéo YouTube détectée, la miniature sera affichée.' : undefined}
          />
          <Field label="Dossier" hint="Où ranger cette ressource.">
            <View style={styles.folderPicker}>
              <FolderChip label="Racine" icon="home-outline" active={addFolderId === null} onPress={() => setAddFolderId(null)} />
              {folders.map((f) => (
                <FolderChip
                  key={f.id}
                  label={f.name}
                  icon="folder-outline"
                  active={addFolderId === f.id}
                  onPress={() => setAddFolderId(f.id)}
                />
              ))}
            </View>
          </Field>
          <Input
            label="Description"
            optional
            value={description}
            onChangeText={setDescription}
            placeholder="Contexte, points à observer…"
            multiline
            inputStyle={styles.textarea}
            error={formError ?? undefined}
          />
          <Button
            label={saving ? 'Publication…' : 'Publier'}
            onPress={addContent}
            loading={saving}
            disabled={!title.trim() || !url.trim() || saving}
            size="lg"
            block
          />
        </View>
      </Sheet>

      {/* ── Dossier : création et renommage ────────────────────────────── */}
      <Sheet
        visible={sheet === 'add-folder' || sheet === 'rename-folder'}
        onClose={closeSheet}
        title={sheet === 'rename-folder' ? 'Renommer le dossier' : 'Nouveau dossier'}
      >
        <View style={{ gap: theme.space.lg }}>
          <Input
            label="Nom"
            value={folderName}
            onChangeText={setFolderName}
            placeholder="ex : Tactique défensive"
            error={formError ?? undefined}
            autoFocus
          />
          <Button
            label={
              saving ? 'Enregistrement…' : sheet === 'rename-folder' ? 'Renommer' : 'Créer le dossier'
            }
            onPress={sheet === 'rename-folder' ? renameFolder : addFolder}
            loading={saving}
            disabled={!folderName.trim() || saving}
            size="lg"
            block
          />
        </View>
      </Sheet>

      <ShareAnalyticsSheet
        visible={analyticsOpen}
        onClose={() => setAnalyticsOpen(false)}
        rows={analyticsRows}
        loading={analyticsLoading}
        error={analyticsError}
        onRetry={openAnalytics}
      />
    </View>
  );
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function FolderChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active, checked: active }}
      accessibilityLabel={label}
      style={[
        styles.folderChip,
        {
          borderRadius: theme.radius.pill,
          backgroundColor: active ? c.accent.fill : c.bg.sunken,
          borderColor: active ? c.accent.fill : c.border.subtle,
        },
      ]}
    >
      <Ionicons name={icon} size={14} color={active ? c.text.onFill : c.text.secondary} />
      <Text variant="caption" tone={active ? 'onFill' : 'secondary'} weight="600" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function FolderRow({
  folder,
  count,
  onOpen,
  onRename,
  onDelete,
}: {
  folder: SharedFolder;
  count: number;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  /**
   * Le menu n'était accessible qu'au **appui long**, un geste invisible et non
   * annoncé. Il a maintenant un bouton dédié, l'appui long restant un raccourci.
   */
  const menu = () =>
    Alert.alert(folder.name, `${count} ressource${count !== 1 ? 's' : ''}`, [
      { text: 'Ouvrir', onPress: onOpen },
      { text: 'Renommer', onPress: onRename },
      { text: 'Supprimer', style: 'destructive', onPress: onDelete },
      { text: 'Annuler', style: 'cancel' },
    ]);

  return (
    <Card variant="flat" padding="none">
      <Pressable
        onPress={onOpen}
        onLongPress={menu}
        accessibilityRole="button"
        accessibilityLabel={`Dossier ${folder.name}, ${count} ressource${count !== 1 ? 's' : ''}`}
        style={styles.folderRow}
      >
        <View style={[styles.folderIcon, { backgroundColor: c.accent.subtle, borderRadius: theme.radius.sm }]}>
          <Ionicons name="folder" size={18} color={c.accent.default} />
        </View>
        <View style={styles.flex}>
          <Text variant="body" weight="700" numberOfLines={1}>
            {folder.name}
          </Text>
          <Text variant="caption" tone="tertiary">
            {count} ressource{count !== 1 ? 's' : ''}
          </Text>
        </View>
        <IconButton icon="ellipsis-horizontal" label={`Actions du dossier ${folder.name}`} onPress={menu} size="sm" />
        <Ionicons name="chevron-forward" size={15} color={c.text.tertiary} />
      </Pressable>
    </Card>
  );
}

function ContentCard({ item, onDelete }: { item: SharedContent; onDelete: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const ytId = item.content_type === 'youtube' ? extractYoutubeId(item.url) : null;
  const open = () => Linking.openURL(item.url);

  return (
    <Card variant="raised" padding="none" style={styles.contentCard}>
      <Pressable
        onPress={open}
        accessibilityRole="link"
        accessibilityLabel={`Ouvrir ${item.title}`}
        style={styles.mediaWrap}
      >
        {ytId ? (
          <>
            <Image source={{ uri: youtubeThumbnail(ytId) }} style={styles.thumb} resizeMode="cover" />
            <View style={styles.playOverlay}>
              <View style={[styles.playBtn, { backgroundColor: c.negative.fill }]}>
                <Ionicons name="play" size={22} color={c.text.onFill} />
              </View>
            </View>
          </>
        ) : (
          <View style={[styles.linkBanner, { backgroundColor: c.bg.sunken }]}>
            <Ionicons name="link-outline" size={26} color={c.text.tertiary} />
          </View>
        )}
        <View style={styles.typePill}>
          <Badge
            label={ytId ? 'Vidéo' : 'Lien'}
            icon={ytId ? 'play-circle-outline' : 'link-outline'}
            tone={ytId ? 'negative' : 'accent'}
            size="sm"
            solid
          />
        </View>
      </Pressable>

      <View style={[styles.contentBody, { gap: theme.space.sm }]}>
        <Text variant="headline" numberOfLines={2}>
          {item.title}
        </Text>
        {item.description ? (
          <Text variant="callout" tone="secondary" numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}

        <View style={[styles.contentFooter, { borderTopColor: c.border.subtle }]}>
          <Text variant="caption" tone="tertiary" style={styles.flex}>
            {new Date(item.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
          </Text>
          <Button label="Ouvrir" icon="arrow-forward" iconAfter size="sm" onPress={open} />
          <IconButton icon="trash-outline" label={`Supprimer ${item.title}`} onPress={onDelete} variant="destructive" size="sm" />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 14, paddingBottom: 40 },

  header: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  folderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 60 },
  folderIcon: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },

  contentCard: { overflow: 'hidden' },
  mediaWrap: { position: 'relative' },
  thumb: { width: '100%', height: 190 },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBtn: { width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center' },
  linkBanner: { height: 84, justifyContent: 'center', alignItems: 'center' },
  typePill: { position: 'absolute', top: 10, left: 10 },
  contentBody: { padding: 14 },
  contentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  folderPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  folderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 180,
  },
  textarea: { minHeight: 84, paddingTop: 12, textAlignVertical: 'top' },
});
