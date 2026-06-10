import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Dimensions,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
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

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:      '#edf0f5',
  surface: '#ffffff',
  surface2:'#f4f6fa',
  border:  '#dde3ec',
  navy:    '#1a2744',
  navyLight:'#e8eef8',
  amber:   '#d97706',
  red:     '#dc2626',
  redBg:   '#fef2f2',
  blue:    '#2563eb',
  text1:   '#0f172a',
  text2:   '#475569',
  text3:   '#94a3b8',
  divider: '#e8edf4',
} as const;

type ContentFilter = 'all' | 'youtube' | 'link';
type ModalType = 'add-content' | 'add-folder' | 'rename-folder' | null;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ShareScreen() {
  const { activeTeamId } = useActiveTeam();

  const [folders, setFolders] = useState<SharedFolder[]>([]);
  const [items,   setItems]   = useState<SharedContent[]>([]);
  const [loading, setLoading] = useState(true);

  // Folder navigation
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath,       setFolderPath]       = useState<SharedFolder[]>([]);

  // Filters
  const [filter, setFilter] = useState<ContentFilter>('all');

  // Modal state
  const [modalType,    setModalType]    = useState<ModalType>(null);
  const [renameTarget, setRenameTarget] = useState<SharedFolder | null>(null);

  // Analytics modal
  const [showAnalytics,     setShowAnalytics]     = useState(false);
  const [analyticsRows,     setAnalyticsRows]     = useState<ContentAnalyticsRow[]>([]);
  const [analyticsLoading,  setAnalyticsLoading]  = useState(false);
  const [analyticsError,    setAnalyticsError]    = useState<string | null>(null);
  const [expandedContentId, setExpandedContentId] = useState<string | null>(null);
  const [mDateRange,     setMDateRange]     = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [mFilterPlayer,  setMFilterPlayer]  = useState<string | null>(null);
  const [mFilterContent, setMFilterContent] = useState<string[]>([]);
  const [pickerOpen,     setPickerOpen]     = useState<'player' | 'content' | null>(null);

  // Form fields
  const [title,       setTitle]       = useState('');
  const [url,         setUrl]         = useState('');
  const [description, setDescription] = useState('');
  const [addFolderId, setAddFolderId] = useState<string | null>(null);
  const [folderName,  setFolderName]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!activeTeamId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [fData, iData] = await Promise.all([
        getSharedFolders(activeTeamId),
        getSharedContent(activeTeamId),
      ]);
      setFolders(fData);
      setItems(iData);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de charger');
    } finally {
      setLoading(false);
    }
  }, [activeTeamId]);

  useEffect(() => { load(); }, [load]);

  // Sync addFolderId default when currentFolder changes
  useEffect(() => { setAddFolderId(currentFolderId); }, [currentFolderId]);

  // ── Computed ────────────────────────────────────────────────────────────────

  const currentFolders = useMemo(
    () => folders.filter(f => f.parent_id === currentFolderId),
    [folders, currentFolderId]
  );

  const currentItems = useMemo(() => {
    let out = items.filter(i => (i.folder_id ?? null) === currentFolderId);
    if (filter !== 'all') out = out.filter(i => i.content_type === filter);
    return out;
  }, [items, currentFolderId, filter]);

  const countInFolder = useCallback(
    (fid: string | null): number => {
      const direct = items.filter(i => (i.folder_id ?? null) === fid).length;
      const children = folders
        .filter(f => f.parent_id === fid)
        .reduce((sum, f) => sum + countInFolder(f.id), 0);
      return direct + children;
    },
    [items, folders]
  );

  // ── Navigation ──────────────────────────────────────────────────────────────

  const enterFolder = (f: SharedFolder) => {
    setCurrentFolderId(f.id);
    setFolderPath(prev => [...prev, f]);
    setFilter('all');
  };

  const goBack = () => {
    if (folderPath.length === 0) return;
    const newPath = folderPath.slice(0, -1);
    setFolderPath(newPath);
    setCurrentFolderId(newPath.length > 0 ? newPath[newPath.length - 1].id : null);
    setFilter('all');
  };

  const goRoot = () => { setCurrentFolderId(null); setFolderPath([]); setFilter('all'); };

  // ── Add content ─────────────────────────────────────────────────────────────

  const openAddContent = () => {
    setAddFolderId(currentFolderId);
    setTitle(''); setUrl(''); setDescription(''); setFormError(null);
    setModalType('add-content');
  };

  const handleAddContent = async () => {
    if (!activeTeamId || !title.trim() || !url.trim()) return;
    setSaving(true); setFormError(null);
    try {
      await createSharedContent({ teamId: activeTeamId, title, url, description, folderId: addFolderId });
      setModalType(null);
      setTitle(''); setUrl(''); setDescription('');
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Impossible de publier');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: SharedContent) => {
    Alert.alert('Supprimer', `Supprimer "${item.title}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        await deleteSharedContent(item.id);
        setItems(prev => prev.filter(i => i.id !== item.id));
      }},
    ]);
  };

  // ── Folder CRUD ─────────────────────────────────────────────────────────────

  const handleCreateFolder = async () => {
    if (!activeTeamId || !folderName.trim()) return;
    setSaving(true);
    try {
      const f = await createSharedFolder(activeTeamId, folderName.trim(), currentFolderId);
      setFolders(prev => [...prev, f].sort((a, b) => a.name.localeCompare(b.name, 'fr')));
      setFolderName(''); setModalType(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const openRenameFolder = (f: SharedFolder) => {
    setRenameTarget(f); setFolderName(f.name); setFormError(null);
    setModalType('rename-folder');
  };

  const handleRenameFolder = async () => {
    if (!renameTarget || !folderName.trim()) return;
    setSaving(true);
    try {
      await renameSharedFolder(renameTarget.id, folderName.trim());
      setFolders(prev => prev.map(f => f.id === renameTarget.id ? { ...f, name: folderName.trim() } : f).sort((a, b) => a.name.localeCompare(b.name, 'fr')));
      setFolderPath(prev => prev.map(f => f.id === renameTarget.id ? { ...f, name: folderName.trim() } : f));
      setRenameTarget(null); setFolderName(''); setModalType(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFolder = (f: SharedFolder) => {
    const count = countInFolder(f.id);
    const msg = count > 0
      ? `Supprimer "${f.name}" et déplacer ses ${count} ressource(s) à la racine ?`
      : `Supprimer le dossier "${f.name}" ?`;
    Alert.alert('Supprimer', msg, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        await deleteSharedFolder(f.id);
        setFolders(prev => prev.filter(x => x.id !== f.id));
        if (currentFolderId === f.id) goRoot();
        await load();
      }},
    ]);
  };

  const closeModal = () => {
    setModalType(null);
    setTitle(''); setUrl(''); setDescription('');
    setFolderName(''); setFormError(null); setRenameTarget(null);
  };

  // ── Analytics computed ──────────────────────────────────────────────────────

  const mPlayers = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of analyticsRows) {
      if (r.player_id && r.player_name) map.set(r.player_id, r.player_name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  }, [analyticsRows]);

  const mContentList = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of analyticsRows) {
      if (r.content_id && r.content_title) map.set(r.content_id, r.content_title);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  }, [analyticsRows]);

  const mFilteredRows = useMemo(() => {
    let rows = analyticsRows.filter(r => r.viewed_at && r.player_id);
    if (mDateRange !== 'all') {
      const days = mDateRange === '7d' ? 7 : mDateRange === '30d' ? 30 : 90;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      rows = rows.filter(r => new Date(r.viewed_at!) >= cutoff);
    }
    if (mFilterPlayer)             rows = rows.filter(r => r.player_id  === mFilterPlayer);
    if (mFilterContent.length > 0) rows = rows.filter(r => mFilterContent.includes(r.content_id));
    return rows;
  }, [analyticsRows, mDateRange, mFilterPlayer, mFilterContent]);

  const mTimeSeriesData = useMemo(() => {
    const map = new Map<string, number>();
    const days = mDateRange === '7d' ? 7 : mDateRange === '30d' ? 30 : mDateRange === '90d' ? 90 : null;
    if (days !== null) {
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        map.set(d.toISOString().slice(0, 10), 0);
      }
    }
    for (const r of mFilteredRows) {
      const key = r.viewed_at!.slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, views]) => ({
        date: new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        views,
      }));
  }, [mFilteredRows, mDateRange]);

  const mPlayerStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of mFilteredRows) {
      if (r.player_name) map.set(r.player_name, (map.get(r.player_name) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [mFilteredRows]);

  const mContentStats = useMemo(() => {
    const map = new Map<string, { id: string; title: string; type: string; folder: string | null; totalViews: number; uniqueViewers: number; lastViewed: string | null; views: { name: string; at: string }[]; pSet: Set<string> }>();
    for (const row of analyticsRows) {
      if (!map.has(row.content_id)) {
        map.set(row.content_id, { id: row.content_id, title: row.content_title, type: row.content_type, folder: row.folder_name, totalViews: 0, uniqueViewers: 0, lastViewed: null, views: [], pSet: new Set() });
      }
    }
    for (const row of mFilteredRows) {
      const cs = map.get(row.content_id);
      if (!cs) continue;
      cs.totalViews++;
      cs.pSet.add(row.player_id!);
      cs.uniqueViewers = cs.pSet.size;
      cs.views.push({ name: row.player_name!, at: row.viewed_at! });
      if (!cs.lastViewed || row.viewed_at! > cs.lastViewed) cs.lastViewed = row.viewed_at!;
    }
    const hasFilter = mDateRange !== 'all' || !!mFilterPlayer || mFilterContent.length > 0;
    return [...map.values()]
      .filter(s => !hasFilter || s.totalViews > 0)
      .sort((a, b) => b.totalViews - a.totalViews);
  }, [analyticsRows, mFilteredRows, mDateRange, mFilterPlayer, mFilterContent]);

  const openAnalytics = async () => {
    setShowAnalytics(true);
    if (!activeTeamId) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const data = await getSharedContentAnalytics(activeTeamId);
      setAnalyticsRows(data);
    } catch (e) {
      setAnalyticsError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  if (!activeTeamId) {
    return (
      <View style={s.centered}>
        <Ionicons name="people-outline" size={40} color={C.text3} style={{ marginBottom: 12 }} />
        <Text style={s.emptyTitle}>Aucune équipe sélectionnée</Text>
        <Text style={s.emptyText}>Choisis une équipe dans l'onglet Accueil</Text>
      </View>
    );
  }

  const ytCount   = items.filter(i => (i.folder_id ?? null) === currentFolderId && i.content_type === 'youtube').length;
  const linkCount = items.filter(i => (i.folder_id ?? null) === currentFolderId && i.content_type === 'link').length;
  const totalCurrent = items.filter(i => (i.folder_id ?? null) === currentFolderId).length;

  const FILTERS: { value: ContentFilter; label: string; count: number }[] = [
    { value: 'all',     label: 'Tous',  count: totalCurrent },
    { value: 'youtube', label: 'Vidéo', count: ytCount },
    { value: 'link',    label: 'Lien',  count: linkCount },
  ];

  return (
    <View style={s.root}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          {folderPath.length > 0 ? (
            <TouchableOpacity onPress={goBack} style={s.backBtn} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={20} color={C.navy} />
            </TouchableOpacity>
          ) : (
            <View style={s.headerIcon}>
              <Ionicons name="library-outline" size={16} color="#fff" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            {/* Breadcrumb */}
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
              <TouchableOpacity onPress={goRoot} activeOpacity={0.7} disabled={folderPath.length === 0}>
                <Text style={[s.headerTitle, folderPath.length > 0 && { color: C.text3, fontSize: 13 }]}>
                  Bibliothèque
                </Text>
              </TouchableOpacity>
              {folderPath.map((f, i) => (
                <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="chevron-forward" size={12} color={C.text3} />
                  <Text style={[s.headerTitle, i < folderPath.length - 1 && { color: C.text3, fontSize: 13 }]}>
                    {f.name}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={s.headerSub}>
              {folderPath.length === 0
                ? `${items.length} ressource${items.length !== 1 ? 's' : ''}`
                : `${totalCurrent} fichier${totalCurrent !== 1 ? 's' : ''}`}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={s.folderBtn} onPress={openAnalytics} activeOpacity={0.8}>
            <Ionicons name="bar-chart-outline" size={14} color={C.navy} />
          </TouchableOpacity>
          <TouchableOpacity style={s.folderBtn} onPress={() => { setFormError(null); setFolderName(''); setModalType('add-folder'); }} activeOpacity={0.8}>
            <Ionicons name="folder-outline" size={14} color={C.navy} />
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={openAddContent} activeOpacity={0.8}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={s.addBtnText}>Ajouter</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Filter chips ─────────────────────────────────────────────── */}
      <View style={s.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.value} onPress={() => setFilter(f.value)} style={[s.filterChip, filter === f.value && s.filterChipActive]} activeOpacity={0.7}>
            <Text style={[s.filterChipText, filter === f.value && s.filterChipTextActive]}>{f.label}</Text>
            {f.count > 0 && (
              <View style={[s.filterBadge, filter === f.value && s.filterBadgeActive]}>
                <Text style={[s.filterBadgeText, filter === f.value && s.filterBadgeTextActive]}>{f.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Content ──────────────────────────────────────────────────── */}
      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={C.navy} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Folders section */}
          {currentFolders.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={s.sectionLabel}>DOSSIERS</Text>
              <View style={s.foldersGrid}>
                {currentFolders.map(f => (
                  <FolderRow
                    key={f.id}
                    folder={f}
                    count={countInFolder(f.id)}
                    onOpen={() => enterFolder(f)}
                    onRename={() => openRenameFolder(f)}
                    onDelete={() => handleDeleteFolder(f)}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Items section */}
          {(currentFolders.length > 0 || currentItems.length > 0) && (
            <Text style={s.sectionLabel}>FICHIERS</Text>
          )}
          {currentItems.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name={currentFolders.length > 0 ? 'document-outline' : 'library-outline'} size={42} color={C.text3} style={{ marginBottom: 14 }} />
              <Text style={s.emptyTitle}>{currentFolders.length === 0 && items.length === 0 ? 'Bibliothèque vide' : 'Aucun fichier ici'}</Text>
              <Text style={s.emptyText}>
                {currentFolders.length === 0 && items.length === 0
                  ? 'Crée un dossier ou ajoute une ressource.'
                  : 'Ajoute une ressource dans ce dossier.'}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {currentItems.map(item => (
                <CoachContentCard key={item.id} item={item} onDelete={() => handleDelete(item)} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Analytics Modal ──────────────────────────────────────────── */}
      <Modal visible={showAnalytics} transparent animationType="slide" onRequestClose={() => setShowAnalytics(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setShowAnalytics(false)}>
          <Pressable style={[s.modalSheet, { maxHeight: '88%', overflow: 'hidden' }]} onPress={() => {}}>
            <View style={s.sheetHandle} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 16 }}>
              <Text style={s.sheetTitle}>Analytiques</Text>
              <TouchableOpacity onPress={() => setShowAnalytics(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color={C.text2} />
              </TouchableOpacity>
            </View>

            {analyticsLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={C.navy} />
              </View>
            ) : analyticsError ? (
              <View style={{ margin: 20, padding: 12, borderRadius: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5' }}>
                <Text style={{ fontSize: 13, color: '#dc2626' }}>{analyticsError}</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>

                {/* ── Date range chips ── */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {(['7d', '30d', '90d', 'all'] as const).map(r => (
                      <TouchableOpacity key={r} onPress={() => setMDateRange(r)} activeOpacity={0.7}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: mDateRange === r ? C.navy : C.border, backgroundColor: mDateRange === r ? C.navy : C.surface }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: mDateRange === r ? '#fff' : C.text3 }}>
                          {r === '7d' ? '7 jours' : r === '30d' ? '30 jours' : r === '90d' ? '3 mois' : 'Tout'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {/* ── Dropdowns joueur + contenu ── */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  <TouchableOpacity
                    onPress={() => setPickerOpen('player')}
                    activeOpacity={0.8}
                    style={[dd.btn, mFilterPlayer && dd.btnActive, { flex: 1 }]}
                  >
                    <Text numberOfLines={1} style={[dd.label, mFilterPlayer && dd.labelActive]}>
                      {mFilterPlayer ? (mPlayers.find(([id]) => id === mFilterPlayer)?.[1] ?? 'Joueur') : 'Tous les joueurs'}
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={mFilterPlayer ? C.navy : C.text3} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setPickerOpen('content')}
                    activeOpacity={0.8}
                    style={[dd.btn, mFilterContent.length > 0 && dd.btnActive, { flex: 1 }]}
                  >
                    <Text numberOfLines={1} style={[dd.label, mFilterContent.length > 0 && dd.labelActive]}>
                      {mFilterContent.length === 0
                        ? 'Tout le contenu'
                        : mFilterContent.length === 1
                          ? (mContentList.find(([id]) => id === mFilterContent[0])?.[1] ?? '1 contenu')
                          : `${mFilterContent.length} contenus`}
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={mFilterContent.length > 0 ? C.navy : C.text3} />
                  </TouchableOpacity>
                </View>

                {/* ── KPI strip ── */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  {[
                    { label: 'Ouvertures', value: mFilteredRows.length },
                    { label: 'Joueurs', value: new Set(mFilteredRows.map(r => r.player_id)).size },
                    { label: 'Contenus', value: new Set(mFilteredRows.map(r => r.content_id)).size },
                  ].map(stat => (
                    <View key={stat.label} style={{ flex: 1, backgroundColor: '#f0f4ff', borderRadius: 10, padding: 10, alignItems: 'center' }}>
                      <Text style={{ fontSize: 20, fontWeight: '800', color: C.navy }}>{stat.value}</Text>
                      <Text style={{ fontSize: 10, color: C.text3, fontWeight: '700', marginTop: 2 }}>{stat.label}</Text>
                    </View>
                  ))}
                </View>

                {/* ── Timeline chart ── */}
                {mTimeSeriesData.length > 1 && mTimeSeriesData.some(d => d.views > 0) && (() => {
                  const chartW = Dimensions.get('window').width - 48;
                  const step = Math.max(1, Math.ceil(mTimeSeriesData.length / 6));
                  const labels = mTimeSeriesData.map((d, i) => i % step === 0 ? d.date : '');
                  return (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                        OUVERTURES PAR JOUR
                      </Text>
                      <View style={{ backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, overflow: 'hidden', paddingTop: 8 }}>
                        <LineChart
                          data={{ labels, datasets: [{ data: mTimeSeriesData.map(d => d.views) }] }}
                          width={chartW}
                          height={140}
                          withInnerLines
                          withOuterLines={false}
                          withShadow={false}
                          bezier
                          chartConfig={{
                            backgroundColor: C.surface,
                            backgroundGradientFrom: C.surface,
                            backgroundGradientTo: C.surface,
                            decimalPlaces: 0,
                            color: (opacity = 1) => `rgba(26, 39, 68, ${opacity})`,
                            labelColor: () => C.text3,
                            propsForDots: { r: '3', strokeWidth: '1.5', stroke: C.navy },
                            propsForBackgroundLines: { stroke: C.divider, strokeDasharray: '3 3' },
                          }}
                          style={{ borderRadius: 8, marginLeft: -4 }}
                        />
                      </View>
                    </View>
                  );
                })()}

                {/* ── Player chart ── */}
                {mPlayerStats.length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                      OUVERTURES PAR JOUEUR
                    </Text>
                    <View style={{ backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 12, gap: 10 }}>
                      {mPlayerStats.map(([name, count]) => {
                        const maxCount = mPlayerStats[0][1];
                        const pct = maxCount > 0 ? count / maxCount : 0;
                        return (
                          <View key={name}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: C.text1, flex: 1 }} numberOfLines={1}>{name}</Text>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: C.navy, marginLeft: 8 }}>{count}</Text>
                            </View>
                            <View style={{ height: 7, borderRadius: 4, backgroundColor: C.surface2, overflow: 'hidden' }}>
                              <View style={{ height: '100%', borderRadius: 4, backgroundColor: C.navy, width: `${Math.round(pct * 100)}%` }} />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* ── Per-content rows ── */}
                {mContentStats.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingTop: 24, paddingBottom: 16 }}>
                    <Ionicons name="eye-off-outline" size={36} color={C.text3} style={{ marginBottom: 10 }} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.text1, marginBottom: 4 }}>Aucune ouverture sur cette période</Text>
                    <Text style={{ fontSize: 12, color: C.text3, textAlign: 'center' }}>Essayez une période plus longue.</Text>
                  </View>
                ) : mContentStats.map(stat => (
                  <View key={stat.id} style={{ backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginBottom: 8, overflow: 'hidden' }}>
                    <TouchableOpacity
                      onPress={() => setExpandedContentId(prev => prev === stat.id ? null : stat.id)}
                      activeOpacity={0.8}
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 }}
                    >
                      <View style={{ width: 32, height: 32, borderRadius: 7, backgroundColor: stat.type === 'youtube' ? '#fef2f2' : '#eff6ff', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                        <Ionicons name={stat.type === 'youtube' ? 'logo-youtube' : 'link-outline'} size={15} color={stat.type === 'youtube' ? '#dc2626' : '#1e40af'} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.text1 }} numberOfLines={1}>{stat.title}</Text>
                        {stat.folder && <Text style={{ fontSize: 10, color: C.text3 }}>{stat.folder}</Text>}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="eye-outline" size={11} color={C.text3} />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: stat.totalViews > 0 ? C.navy : C.text3 }}>{stat.totalViews}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="people-outline" size={11} color={C.text3} />
                          <Text style={{ fontSize: 11, color: C.text3 }}>{stat.uniqueViewers}</Text>
                        </View>
                      </View>
                      {stat.totalViews > 0 && (
                        <Ionicons name={expandedContentId === stat.id ? 'chevron-up' : 'chevron-down'} size={14} color={C.text3} />
                      )}
                    </TouchableOpacity>

                    {expandedContentId === stat.id && stat.views.length > 0 && (
                      <View style={{ backgroundColor: C.surface2, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 14, paddingVertical: 10, gap: 7 }}>
                        {stat.views.map((v, vi) => (
                          <View key={vi} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="checkmark-circle" size={13} color="#059669" />
                            <Text style={{ fontSize: 12, fontWeight: '600', color: C.text1, flex: 1 }}>{v.name}</Text>
                            <Text style={{ fontSize: 11, color: C.text3 }}>
                              {new Date(v.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}

            {/* ── Picker overlay (dans le même modal, pas de 2e Modal) ── */}
            {pickerOpen !== null && (
              <Pressable
                onPress={() => setPickerOpen(null)}
                style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)', zIndex: 10, justifyContent: 'flex-end' }]}
              >
                <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%', borderTopWidth: 1, borderTopColor: C.border }}>
                  <View style={s.sheetHandle} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 4 }}>
                    <Text style={s.sheetTitle}>
                      {pickerOpen === 'player' ? 'Filtrer par joueur' : 'Filtrer par contenu'}
                    </Text>
                    {pickerOpen === 'content' && (
                      <TouchableOpacity onPress={() => setPickerOpen(null)} activeOpacity={0.7}
                        style={{ backgroundColor: C.navy, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>OK</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {pickerOpen === 'content' && (
                    <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.divider }}>
                      <TouchableOpacity onPress={() => setMFilterContent(mContentList.map(([id]) => id))} activeOpacity={0.7}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: C.navy }}>Tout sélectionner</Text>
                      </TouchableOpacity>
                      {mFilterContent.length > 0 && (
                        <TouchableOpacity onPress={() => setMFilterContent([])} activeOpacity={0.7}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: C.text2 }}>Effacer</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                    {pickerOpen === 'player' && (
                      <TouchableOpacity
                        onPress={() => { setMFilterPlayer(null); setPickerOpen(null); }}
                        style={[pick.row, !mFilterPlayer && pick.rowActive]}
                      >
                        <Text style={[pick.label, !mFilterPlayer && pick.labelActive]}>Tous les joueurs</Text>
                        {!mFilterPlayer && <Ionicons name="checkmark" size={16} color={C.navy} />}
                      </TouchableOpacity>
                    )}

                    {(pickerOpen === 'player' ? mPlayers : mContentList).map(([id, label]) => {
                      const isActive = pickerOpen === 'player'
                        ? mFilterPlayer === id
                        : mFilterContent.includes(id);
                      return (
                        <TouchableOpacity
                          key={id}
                          onPress={() => {
                            if (pickerOpen === 'player') {
                              setMFilterPlayer(isActive ? null : id);
                              setPickerOpen(null);
                            } else {
                              setMFilterContent(prev =>
                                isActive ? prev.filter(x => x !== id) : [...prev, id]
                              );
                            }
                          }}
                          style={[pick.row, isActive && pick.rowActive]}
                        >
                          {pickerOpen === 'content' && (
                            <View style={pick.checkbox}>
                              {isActive && <View style={pick.checkboxInner} />}
                            </View>
                          )}
                          <Text style={[pick.label, isActive && pick.labelActive]} numberOfLines={2}>{label}</Text>
                          {pickerOpen === 'player' && isActive && <Ionicons name="checkmark" size={16} color={C.navy} />}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </Pressable>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modals ───────────────────────────────────────────────────── */}
      <Modal
        visible={modalType !== null}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <Pressable style={s.modalOverlay} onPress={closeModal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <Pressable style={s.modalSheet} onPress={() => {}}>
              <View style={s.sheetHandle} />

              {/* ── Add content modal ─────────────────────────── */}
              {modalType === 'add-content' && (
                <>
                  <Text style={s.sheetTitle}>Nouvelle ressource</Text>
                  <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <View style={s.sheetBody}>
                      <Text style={s.fieldLabel}>TITRE *</Text>
                      <TextInput style={s.input} placeholder="Ex: Analyse défensive" placeholderTextColor={C.text3} value={title} onChangeText={setTitle} />

                      <Text style={[s.fieldLabel, { marginTop: 12 }]}>URL *</Text>
                      <TextInput style={s.input} placeholder="https://youtube.com/... ou autre lien" placeholderTextColor={C.text3} value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
                      {url.length > 0 && isYoutubeUrl(url) && (
                        <View style={s.ytHint}>
                          <Ionicons name="logo-youtube" size={12} color={C.red} />
                          <Text style={s.ytHintText}>Vidéo YouTube détectée</Text>
                        </View>
                      )}

                      <Text style={[s.fieldLabel, { marginTop: 12 }]}>DOSSIER</Text>
                      <View style={s.folderPicker}>
                        <TouchableOpacity
                          style={[s.folderPickerItem, addFolderId === null && s.folderPickerItemActive]}
                          onPress={() => setAddFolderId(null)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="home-outline" size={13} color={addFolderId === null ? '#fff' : C.text2} />
                          <Text style={[s.folderPickerText, addFolderId === null && s.folderPickerTextActive]}>Racine</Text>
                        </TouchableOpacity>
                        {folders.map(f => (
                          <TouchableOpacity
                            key={f.id}
                            style={[s.folderPickerItem, addFolderId === f.id && s.folderPickerItemActive]}
                            onPress={() => setAddFolderId(f.id)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="folder-outline" size={13} color={addFolderId === f.id ? '#fff' : C.text2} />
                            <Text style={[s.folderPickerText, addFolderId === f.id && s.folderPickerTextActive]} numberOfLines={1}>{f.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={[s.fieldLabel, { marginTop: 12 }]}>DESCRIPTION (optionnel)</Text>
                      <TextInput style={[s.input, { minHeight: 64, textAlignVertical: 'top' }]} placeholder="Contexte, points à observer..." placeholderTextColor={C.text3} value={description} onChangeText={setDescription} multiline numberOfLines={2} />

                      {formError && <View style={s.errorBox}><Text style={s.errorText}>{formError}</Text></View>}

                      <View style={s.sheetActions}>
                        <TouchableOpacity style={[s.btnPublish, (!title.trim() || !url.trim() || saving) && s.btnDisabled]} onPress={handleAddContent} disabled={!title.trim() || !url.trim() || saving} activeOpacity={0.8}>
                          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnPublishText}>Publier</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={s.btnCancel} onPress={closeModal} activeOpacity={0.7}>
                          <Text style={s.btnCancelText}>Annuler</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </ScrollView>
                </>
              )}

              {/* ── Create folder modal ───────────────────────── */}
              {modalType === 'add-folder' && (
                <>
                  <Text style={s.sheetTitle}>Nouveau dossier</Text>
                  <View style={s.sheetBody}>
                    <Text style={s.fieldLabel}>NOM *</Text>
                    <TextInput style={s.input} placeholder="Ex: Tactique défensive" placeholderTextColor={C.text3} value={folderName} onChangeText={setFolderName} autoFocus />
                    {formError && <View style={s.errorBox}><Text style={s.errorText}>{formError}</Text></View>}
                    <View style={s.sheetActions}>
                      <TouchableOpacity style={[s.btnPublish, (!folderName.trim() || saving) && s.btnDisabled]} onPress={handleCreateFolder} disabled={!folderName.trim() || saving} activeOpacity={0.8}>
                        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnPublishText}>Créer</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity style={s.btnCancel} onPress={closeModal} activeOpacity={0.7}>
                        <Text style={s.btnCancelText}>Annuler</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}

              {/* ── Rename folder modal ───────────────────────── */}
              {modalType === 'rename-folder' && (
                <>
                  <Text style={s.sheetTitle}>Renommer</Text>
                  <View style={s.sheetBody}>
                    <Text style={s.fieldLabel}>NOUVEAU NOM *</Text>
                    <TextInput style={s.input} placeholderTextColor={C.text3} value={folderName} onChangeText={setFolderName} autoFocus />
                    {formError && <View style={s.errorBox}><Text style={s.errorText}>{formError}</Text></View>}
                    <View style={s.sheetActions}>
                      <TouchableOpacity style={[s.btnPublish, (!folderName.trim() || saving) && s.btnDisabled]} onPress={handleRenameFolder} disabled={!folderName.trim() || saving} activeOpacity={0.8}>
                        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnPublishText}>Renommer</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity style={s.btnCancel} onPress={closeModal} activeOpacity={0.7}>
                        <Text style={s.btnCancelText}>Annuler</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── FolderRow ────────────────────────────────────────────────────────────────

function FolderRow({ folder, count, onOpen, onRename, onDelete }: {
  folder: SharedFolder; count: number;
  onOpen: () => void; onRename: () => void; onDelete: () => void;
}) {
  const showMenu = () => {
    Alert.alert(folder.name, `${count} ressource${count !== 1 ? 's' : ''}`, [
      { text: 'Ouvrir',    onPress: onOpen },
      { text: 'Renommer',  onPress: onRename },
      { text: 'Supprimer', style: 'destructive', onPress: onDelete },
      { text: 'Annuler',   style: 'cancel' },
    ]);
  };

  return (
    <TouchableOpacity style={folder_s.row} onPress={onOpen} onLongPress={showMenu} activeOpacity={0.8}>
      <View style={folder_s.icon}>
        <Ionicons name="folder" size={18} color={C.navy} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={folder_s.name} numberOfLines={1}>{folder.name}</Text>
        <Text style={folder_s.count}>{count} ressource{count !== 1 ? 's' : ''}</Text>
      </View>
      <TouchableOpacity onPress={showMenu} style={folder_s.moreBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="ellipsis-horizontal" size={16} color={C.text3} />
      </TouchableOpacity>
      <Ionicons name="chevron-forward" size={14} color={C.text3} />
    </TouchableOpacity>
  );
}

const folder_s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.navy,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  icon: { width: 36, height: 36, borderRadius: 8, backgroundColor: C.navyLight, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 13, fontWeight: '700', color: C.text1 },
  count:{ fontSize: 11, color: C.text3, marginTop: 1 },
  moreBtn: { padding: 4 },
});

// ─── CoachContentCard ─────────────────────────────────────────────────────────

function CoachContentCard({ item, onDelete }: { item: SharedContent; onDelete: () => void }) {
  const ytId   = item.content_type === 'youtube' ? extractYoutubeId(item.url) : null;
  const isYt   = item.content_type === 'youtube';

  return (
    <View style={card.wrap}>
      {ytId && (
        <TouchableOpacity onPress={() => Linking.openURL(item.url)} activeOpacity={0.85}>
          <View style={card.thumbWrap}>
            <Image source={{ uri: youtubeThumbnail(ytId) }} style={card.thumb} resizeMode="cover" />
            <View style={card.playOverlay}>
              <View style={card.playBtn}>
                <View style={card.playTriangle} />
              </View>
            </View>
            <View style={card.typePill}>
              <Ionicons name="play-circle-outline" size={13} color="#fff" />
              <Text style={card.typePillText}>Vidéo</Text>
            </View>
          </View>
        </TouchableOpacity>
      )}
      {!isYt && (
        <TouchableOpacity onPress={() => Linking.openURL(item.url)} activeOpacity={0.85}>
          <View style={card.linkHeader}>
            <Ionicons name="link-outline" size={26} color="rgba(255,255,255,0.35)" />
            <View style={card.typePill}>
              <Ionicons name="link-outline" size={11} color="#fff" />
              <Text style={card.typePillText}>Lien externe</Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      <View style={card.body}>
        <Text style={card.title} numberOfLines={2}>{item.title}</Text>
        {item.description ? <Text style={card.desc} numberOfLines={2}>{item.description}</Text> : null}

        <View style={card.footer}>
          <Text style={card.date}>
            {new Date(item.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => Linking.openURL(item.url)} style={card.openBtn} activeOpacity={0.8}>
              <Text style={card.openBtnText}>Ouvrir</Text>
              <Ionicons name="arrow-forward" size={12} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} style={card.deleteBtn} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={14} color={C.red} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  centered:{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  scroll:  { padding: 14, paddingBottom: 40 },

  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: C.text3,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 8,
  },

  foldersGrid: { gap: 8 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
    gap: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: C.navy, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  backBtn:    { width: 34, height: 34, borderRadius: 9, backgroundColor: C.navyLight, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  headerTitle:{ fontSize: 15, fontWeight: '800', color: C.text1, letterSpacing: -0.2 },
  headerSub:  { fontSize: 11, color: C.text3, marginTop: 1 },

  folderBtn: {
    width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center',
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.navy, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  filterRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  filterChip:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  filterChipActive:    { backgroundColor: C.navy, borderColor: C.navy },
  filterChipText:      { fontSize: 12, fontWeight: '600', color: C.text2 },
  filterChipTextActive:{ color: '#fff' },
  filterBadge:         { backgroundColor: '#e4e9f0', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  filterBadgeActive:   { backgroundColor: 'rgba(255,255,255,0.2)' },
  filterBadgeText:     { fontSize: 10, fontWeight: '700', color: C.text2 },
  filterBadgeTextActive:{ color: '#fff' },

  emptyWrap:  { paddingTop: 60, alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.text1, marginBottom: 6, textAlign: 'center' },
  emptyText:  { fontSize: 13, color: C.text2, textAlign: 'center', lineHeight: 19 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 24, maxHeight: '90%' },
  sheetHandle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  sheetTitle:   { fontSize: 16, fontWeight: '800', color: C.text1, paddingHorizontal: 20, marginBottom: 4 },
  sheetBody:    { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },

  fieldLabel:   { fontSize: 10, fontWeight: '700', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  input:        { backgroundColor: C.surface2, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, color: C.text1, fontSize: 14, borderWidth: 1, borderColor: C.border },

  folderPicker:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 2 },
  folderPickerItem:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  folderPickerItemActive:{ backgroundColor: C.navy, borderColor: C.navy },
  folderPickerText:     { fontSize: 12, fontWeight: '600', color: C.text2, maxWidth: 100 },
  folderPickerTextActive:{ color: '#fff' },

  ytHint:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, marginBottom: 2 },
  ytHintText:   { fontSize: 11, fontWeight: '600', color: '#dc2626' },
  errorBox:     { marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5' },
  errorText:    { fontSize: 12, color: '#dc2626' },

  sheetActions: { flexDirection: 'row', gap: 8, marginTop: 20, marginBottom: 4 },
  btnPublish:   { flex: 1, backgroundColor: C.navy, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnDisabled:  { opacity: 0.5 },
  btnPublishText:{ color: '#fff', fontWeight: '700', fontSize: 14 },
  btnCancel:    { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  btnCancelText: { color: C.text2, fontSize: 14, fontWeight: '600' },
});

const card = StyleSheet.create({
  wrap:         { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  thumbWrap:    { width: '100%', height: 190, backgroundColor: '#000', position: 'relative' },
  thumb:        { width: '100%', height: '100%' },
  playOverlay:  { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center' },
  playBtn:      { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(220,38,38,0.9)', justifyContent: 'center', alignItems: 'center' },
  playTriangle: { width: 0, height: 0, borderTopWidth: 9, borderBottomWidth: 9, borderLeftWidth: 16, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff', marginLeft: 3 },
  linkHeader:   { height: 80, backgroundColor: '#1a2744', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  typePill:     { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  typePillText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  body:         { padding: 14, gap: 6 },
  title:        { fontSize: 15, fontWeight: '700', color: C.text1, lineHeight: 21 },
  desc:         { fontSize: 13, color: C.text2, lineHeight: 18 },
  footer:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: C.divider, marginTop: 2 },
  date:         { fontSize: 11, color: C.text3 },
  openBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.navy, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  openBtnText:  { color: '#fff', fontWeight: '700', fontSize: 12 },
  deleteBtn:    { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#fef2f2', justifyContent: 'center', alignItems: 'center' },
});

const dd = StyleSheet.create({
  btn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  btnActive:  { borderColor: C.navy, backgroundColor: C.navyLight },
  label:      { fontSize: 12, fontWeight: '600', color: C.text3, flexShrink: 1 },
  labelActive:{ color: C.navy, fontWeight: '700' },
});

const pick = StyleSheet.create({
  row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.divider, gap: 10 },
  rowActive:    { backgroundColor: C.navyLight },
  label:        { fontSize: 14, color: C.text2, flex: 1 },
  labelActive:  { fontWeight: '700', color: C.navy },
  checkbox:     { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkboxInner:{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.navy },
});
