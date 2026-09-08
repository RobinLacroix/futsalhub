import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, Alert, Linking, Image, ScrollView, Pressable, Switch } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { haptics } from '../../../lib/design/haptics';
import { getUserClubId, isClubAdmin } from '../../../lib/services/clubs';
import {
  getSharedContent,
  getSharedFolders,
  createSharedContent,
  createSharedFile,
  createSharedFolder,
  renameSharedFolder,
  updateSharedContent,
  deleteSharedContent,
  deleteSharedFolder,
  getSharedContentAnalytics,
  getSharedFileUrl,
  extractYoutubeId,
  isYoutubeUrl,
  youtubeThumbnail,
  type SharedContent,
  type SharedFolder,
  type ContentAnalyticsRow,
  type PickedFile,
} from '../../../lib/services/sharedContent';
import { shareVideoToFeed } from '../../../lib/services/teamFeed';
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

type ContentFilter = 'all' | 'youtube' | 'link' | 'file';
type ContentInputMode = 'link' | 'file';
type SheetKind = 'add-content' | 'add-folder' | 'rename-folder' | 'edit-content' | null;

const FILE_TYPES = ['application/pdf', 'image/*', 'video/mp4', 'video/quicktime'];

const CONTENT_MODES: readonly ChipOption<ContentInputMode>[] = [
  { value: 'link', label: 'Lien / vidéo', icon: 'link-outline' },
  { value: 'file', label: 'Fichier', icon: 'document-attach-outline' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function fileIcon(mime?: string | null): keyof typeof Ionicons.glyphMap {
  if (!mime) return 'document-outline';
  if (mime === 'application/pdf') return 'document-text-outline';
  if (mime.startsWith('image/')) return 'image-outline';
  if (mime.startsWith('video/')) return 'videocam-outline';
  return 'document-outline';
}

export default function ShareScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { activeTeamId } = useActiveTeam();

  const [clubId, setClubId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [folders, setFolders] = useState<SharedFolder[]>([]);
  const [items, setItems] = useState<SharedContent[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<SharedFolder[]>([]);
  const [filter, setFilter] = useState<ContentFilter>('all');

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [renameTarget, setRenameTarget] = useState<SharedFolder | null>(null);
  const [editTarget, setEditTarget] = useState<SharedContent | null>(null);

  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsRows, setAnalyticsRows] = useState<ContentAnalyticsRow[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [addFolderId, setAddFolderId] = useState<string | null>(null);
  const [shareToFeed, setShareToFeed] = useState(true);
  const [shareToAllTeams, setShareToAllTeams] = useState(false);
  const [contentMode, setContentMode] = useState<ContentInputMode>('link');
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
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
    (async () => {
      try {
        const cid = await getUserClubId();
        setClubId(cid);
        if (cid) setIsAdmin(await isClubAdmin(cid));
      } catch {
        // Non bloquant : le toggle « toutes les équipes » reste simplement masqué.
      }
    })();
  }, []);

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
    const file = inCurrent.filter((i) => i.content_type === 'file').length;
    const link = inCurrent.length - yt - file;
    return [
      { value: 'all', label: `Tous (${inCurrent.length})` },
      { value: 'youtube', label: `Vidéos (${yt})`, icon: 'logo-youtube' },
      { value: 'link', label: `Liens (${link})`, icon: 'link-outline' },
      { value: 'file', label: `Fichiers (${file})`, icon: 'document-outline' },
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
    setEditTarget(null);
    setShareToFeed(true);
    setShareToAllTeams(false);
    setContentMode('link');
    setPickedFile(null);
  };

  const pickFile = async () => {
    setFormError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: FILE_TYPES, copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.size != null && asset.size > 50 * 1024 * 1024) {
        setFormError('Fichier trop volumineux (50 Mo maximum).');
        return;
      }
      setPickedFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size });
    } catch {
      setFormError('Impossible de sélectionner ce fichier.');
    }
  };

  const addContent = async () => {
    if (!activeTeamId || !clubId || !title.trim()) return;
    if (contentMode === 'link' && !url.trim()) return;
    if (contentMode === 'file' && !pickedFile) return;
    setSaving(true);
    setFormError(null);
    try {
      const teamId = isAdmin && shareToAllTeams ? null : activeTeamId;
      const created =
        contentMode === 'file' && pickedFile
          ? await createSharedFile({ clubId, teamId, title, description, file: pickedFile, folderId: addFolderId })
          : await createSharedContent({ clubId, teamId, title, url, description, folderId: addFolderId });
      haptics.success();
      closeSheet();
      await load();
      // Un échec du partage ne remet pas en cause l'ajout du contenu, déjà
      // enregistré : on l'affiche quand même, pour ne pas le manquer en silence.
      if (shareToFeed) {
        const shareResult = await shareVideoToFeed(created.id);
        if (!shareResult.success) {
          Alert.alert('Contenu ajouté', `Le partage dans le fil d'équipe a échoué : ${shareResult.error ?? 'erreur inconnue'}.`);
        }
      }
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
          await deleteSharedContent(item);
          haptics.success();
          setItems((prev) => prev.filter((i) => i.id !== item.id));
        },
      },
    ]);
  };

  const saveEdit = async () => {
    if (!editTarget || !title.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const updated = await updateSharedContent(editTarget.id, { title, description });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      haptics.success();
      closeSheet();
    } catch (e) {
      haptics.error();
      setFormError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const addFolder = async () => {
    if (!activeTeamId || !clubId || !folderName.trim()) return;
    setSaving(true);
    try {
      const teamId = isAdmin && shareToAllTeams ? null : activeTeamId;
      const f = await createSharedFolder(clubId, teamId, folderName.trim(), currentFolderId);
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
              setShareToAllTeams(false);
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
              setContentMode('link');
              setPickedFile(null);
              setShareToAllTeams(false);
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
                  setContentMode('link');
                  setPickedFile(null);
                  setShareToAllTeams(false);
                  setSheet('add-content');
                },
              }}
            />
          ) : (
            <Section title={currentFolders.length > 0 ? 'Ressources' : undefined}>
              {currentItems.map((item) => (
                <ContentCard
                  key={item.id}
                  item={item}
                  onDelete={() => removeContent(item)}
                  onEdit={() => {
                    setEditTarget(item);
                    setTitle(item.title);
                    setDescription(item.description ?? '');
                    setFormError(null);
                    setSheet('edit-content');
                  }}
                />
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
        subtitle="Une vidéo YouTube, un lien, ou un fichier."
      >
        <View style={{ gap: theme.space.lg }}>
          <Input label="Titre" value={title} onChangeText={setTitle} placeholder="ex : Analyse défensive J12" />

          <ChipGroup
            label="Type de ressource"
            options={CONTENT_MODES}
            value={contentMode}
            onChange={(m) => {
              setContentMode(m);
              setFormError(null);
            }}
          />

          {contentMode === 'link' ? (
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
          ) : (
            <Field label="Fichier" hint="PDF, image ou vidéo. 50 Mo maximum.">
              {pickedFile ? (
                <View style={[styles.filePicked, { borderRadius: theme.radius.sm, backgroundColor: c.bg.sunken }]}>
                  <Ionicons name={fileIcon(pickedFile.mimeType)} size={20} color={c.text.secondary} />
                  <View style={styles.flex}>
                    <Text variant="callout" weight="600" numberOfLines={1}>
                      {pickedFile.name}
                    </Text>
                    {pickedFile.size != null && (
                      <Text variant="caption" tone="tertiary">
                        {formatFileSize(pickedFile.size)}
                      </Text>
                    )}
                  </View>
                  <IconButton icon="close-circle-outline" label="Retirer le fichier" onPress={() => setPickedFile(null)} size="sm" />
                </View>
              ) : (
                <Button label="Choisir un fichier" icon="document-attach-outline" variant="secondary" onPress={pickFile} />
              )}
            </Field>
          )}

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
          {isAdmin && (
            <View style={styles.shareRow}>
              <View style={styles.flex}>
                <Text variant="callout" weight="600">Partager à toutes les équipes du club</Text>
                <Text variant="caption" tone="tertiary">Visible par tous les joueurs du club, pas seulement cette équipe.</Text>
              </View>
              <Switch
                value={shareToAllTeams}
                onValueChange={setShareToAllTeams}
                trackColor={{ true: theme.colors.accent.default }}
                accessibilityLabel="Partager à toutes les équipes du club"
              />
            </View>
          )}
          <View style={styles.shareRow}>
            <View style={styles.flex}>
              <Text variant="callout" weight="600">Partager dans le fil d'équipe</Text>
              <Text variant="caption" tone="tertiary">L'équipe est prévenue avec un lien vers cette ressource.</Text>
            </View>
            <Switch
              value={shareToFeed}
              onValueChange={setShareToFeed}
              trackColor={{ true: theme.colors.accent.default }}
              accessibilityLabel="Partager dans le fil d'équipe"
            />
          </View>
          <Button
            label={saving ? (contentMode === 'file' ? 'Téléversement…' : 'Publication…') : 'Publier'}
            onPress={addContent}
            loading={saving}
            disabled={!title.trim() || (contentMode === 'link' ? !url.trim() : !pickedFile) || saving}
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
          {isAdmin && sheet === 'add-folder' && (
            <View style={styles.shareRow}>
              <View style={styles.flex}>
                <Text variant="callout" weight="600">Partager à toutes les équipes du club</Text>
                <Text variant="caption" tone="tertiary">Visible par tous les joueurs du club, pas seulement cette équipe.</Text>
              </View>
              <Switch
                value={shareToAllTeams}
                onValueChange={setShareToAllTeams}
                trackColor={{ true: theme.colors.accent.default }}
                accessibilityLabel="Partager à toutes les équipes du club"
              />
            </View>
          )}
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

      {/* ── Modification d'une ressource ──────────────────────────────── */}
      <Sheet visible={sheet === 'edit-content'} onClose={closeSheet} title="Modifier la ressource">
        <View style={{ gap: theme.space.lg }}>
          <Input label="Titre" value={title} onChangeText={setTitle} placeholder="ex : Analyse défensive J12" />
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
            label={saving ? 'Enregistrement…' : 'Enregistrer'}
            onPress={saveEdit}
            loading={saving}
            disabled={!title.trim() || saving}
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

function ContentCard({ item, onDelete, onEdit }: { item: SharedContent; onDelete: () => void; onEdit: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [opening, setOpening] = useState(false);
  const ytId = item.content_type === 'youtube' && item.url ? extractYoutubeId(item.url) : null;
  const isFile = item.content_type === 'file';

  const open = async () => {
    if (isFile) {
      if (!item.file_path) return;
      setOpening(true);
      try {
        const signedUrl = await getSharedFileUrl(item.file_path);
        await Linking.openURL(signedUrl);
      } catch {
        Alert.alert('Erreur', "Impossible d'ouvrir ce fichier.");
      } finally {
        setOpening(false);
      }
    } else if (item.url) {
      Linking.openURL(item.url);
    }
  };

  const typeLabel = ytId ? 'Vidéo' : isFile ? 'Fichier' : 'Lien';
  const typeIcon: keyof typeof Ionicons.glyphMap = ytId
    ? 'play-circle-outline'
    : isFile
      ? fileIcon(item.file_mime_type)
      : 'link-outline';
  const typeTone = ytId ? 'negative' : isFile ? 'warning' : 'accent';

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
            <Ionicons name={isFile ? fileIcon(item.file_mime_type) : 'link-outline'} size={26} color={c.text.tertiary} />
          </View>
        )}
        <View style={styles.typePill}>
          <Badge label={typeLabel} icon={typeIcon} tone={typeTone} size="sm" solid />
        </View>
      </Pressable>

      <View style={[styles.contentBody, { gap: theme.space.sm }]}>
        <View style={styles.titleRow}>
          <Text variant="headline" numberOfLines={2} style={styles.flex}>
            {item.title}
          </Text>
          {item.team_id === null && (
            <Badge label="Toutes les équipes" icon="people-outline" tone="accent" size="sm" />
          )}
        </View>
        {item.description ? (
          <Text variant="callout" tone="secondary" numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}

        <View style={[styles.contentFooter, { borderTopColor: c.border.subtle }]}>
          <Text variant="caption" tone="tertiary" style={styles.flex}>
            {new Date(item.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
          </Text>
          <Button
            label={opening ? 'Ouverture…' : 'Ouvrir'}
            icon="arrow-forward"
            iconAfter
            size="sm"
            loading={opening}
            onPress={open}
          />
          <IconButton icon="pencil-outline" label={`Modifier ${item.title}`} onPress={onEdit} size="sm" />
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
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  filePicked: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
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
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
