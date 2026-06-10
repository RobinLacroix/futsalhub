import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Image,
  ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppRole } from '../../contexts/AppRoleContext';
import {
  getSharedContentForPlayer,
  getSharedFoldersForPlayer,
  logSharedContentView,
  extractYoutubeId,
  youtubeThumbnail,
  type SharedContent,
  type SharedFolder,
} from '../../lib/services/sharedContent';

// ─── Design tokens ─────────────────────────────────────────────────────────

const C = {
  bg:       '#edf0f5',
  surface:  '#ffffff',
  surface2: '#f4f6fa',
  border:   '#dde3ec',
  navy:     '#1a2744',
  navyLight:'#e8eef8',
  red:      '#dc2626',
  blue:     '#1e40af',
  blueLt:   '#eff6ff',
  text1:    '#0f172a',
  text2:    '#475569',
  text3:    '#94a3b8',
  divider:  '#e8edf4',
} as const;

// ─── Screen ────────────────────────────────────────────────────────────────

export default function PlayerSharedScreen() {
  const { player, loading: roleLoading } = useAppRole();

  const [folders, setFolders] = useState<SharedFolder[]>([]);
  const [items,   setItems]   = useState<SharedContent[]>([]);
  const [loading, setLoading] = useState(true);

  // Folder navigation
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath,       setFolderPath]       = useState<SharedFolder[]>([]);

  useEffect(() => {
    if (roleLoading) return;
    if (!player) { setLoading(false); return; }
    (async () => {
      try {
        const [fData, iData] = await Promise.all([
          getSharedFoldersForPlayer(player.id),
          getSharedContentForPlayer(player.id),
        ]);
        setFolders(fData);
        setItems(iData);
      } catch { /* non-critical */ }
      finally { setLoading(false); }
    })();
  }, [player, roleLoading]);

  const currentFolders = useMemo(
    () => folders.filter(f => f.parent_id === currentFolderId),
    [folders, currentFolderId]
  );

  const currentItems = useMemo(
    () => items.filter(i => (i.folder_id ?? null) === currentFolderId),
    [items, currentFolderId]
  );

  const countInFolder = useCallback(
    (fid: string | null): number => {
      const direct = items.filter(i => (i.folder_id ?? null) === fid).length;
      const children = folders.filter(f => f.parent_id === fid).reduce((sum, f) => sum + countInFolder(f.id), 0);
      return direct + children;
    },
    [items, folders]
  );

  const enterFolder = (f: SharedFolder) => {
    setCurrentFolderId(f.id);
    setFolderPath(prev => [...prev, f]);
  };

  const goBack = () => {
    if (folderPath.length === 0) return;
    const newPath = folderPath.slice(0, -1);
    setFolderPath(newPath);
    setCurrentFolderId(newPath.length > 0 ? newPath[newPath.length - 1].id : null);
  };

  const goRoot = () => { setCurrentFolderId(null); setFolderPath([]); };

  if (roleLoading || loading) {
    return <View style={s.centered}><ActivityIndicator size="large" color={C.navy} /></View>;
  }

  if (!player) {
    return (
      <View style={s.centered}>
        <Ionicons name="person-circle-outline" size={40} color={C.text3} style={{ marginBottom: 10 }} />
        <Text style={s.emptyTitle}>Profil joueur introuvable</Text>
      </View>
    );
  }

  const totalItems = items.length;

  return (
    <View style={s.root}>
      {/* ── Header / Breadcrumb ─────────────────────────────────── */}
      <View style={s.header}>
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
              ? `${totalItems} ressource${totalItems !== 1 ? 's' : ''}`
              : `${currentItems.length} fichier${currentItems.length !== 1 ? 's' : ''}`}
          </Text>
        </View>
      </View>

      {/* ── Content ──────────────────────────────────────────────── */}
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Folders */}
        {currentFolders.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={s.sectionLabel}>DOSSIERS</Text>
            <View style={{ gap: 8 }}>
              {currentFolders.map(f => {
                const count = countInFolder(f.id);
                return (
                  <TouchableOpacity key={f.id} style={folder_s.row} onPress={() => enterFolder(f)} activeOpacity={0.8}>
                    <View style={folder_s.icon}>
                      <Ionicons name="folder" size={18} color={C.navy} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={folder_s.name} numberOfLines={1}>{f.name}</Text>
                      <Text style={folder_s.count}>{count} ressource{count !== 1 ? 's' : ''}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={C.text3} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Files */}
        {(currentFolders.length > 0 || currentItems.length > 0) && (
          <Text style={s.sectionLabel}>FICHIERS</Text>
        )}
        {currentItems.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons name={currentFolders.length > 0 ? 'document-outline' : 'library-outline'} size={42} color={C.text3} style={{ marginBottom: 14 }} />
            <Text style={s.emptyTitle}>
              {currentFolders.length === 0 && totalItems === 0 ? 'Aucune ressource partagée' : 'Aucun fichier ici'}
            </Text>
            <Text style={s.emptyText}>
              {currentFolders.length === 0 && totalItems === 0
                ? 'Ton staff n\'a pas encore publié de ressources.'
                : 'Ce dossier ne contient pas de fichiers directs.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {currentItems.map(item => <ContentCard key={item.id} item={item} />)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── ContentCard ─────────────────────────────────────────────────────────────

function ContentCard({ item }: { item: SharedContent }) {
  const ytId   = item.content_type === 'youtube' ? extractYoutubeId(item.url) : null;
  const isYt   = item.content_type === 'youtube';
  const typeColor = isYt ? C.red  : C.blue;
  const typeBg    = isYt ? '#fef2f2' : C.blueLt;
  const typeBorder= isYt ? '#fca5a5' : '#bfdbfe';

  const openContent = () => {
    logSharedContentView(item.id);
    Linking.openURL(item.url);
  };

  return (
    <View style={card.wrap}>
      {ytId && (
        <TouchableOpacity onPress={openContent} activeOpacity={0.85}>
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

      <View style={card.body}>
        {!ytId && (
          <View style={[card.badge, { backgroundColor: typeBg, borderColor: typeBorder }]}>
            <Ionicons name="link-outline" size={12} color={typeColor} />
            <Text style={[card.badgeText, { color: typeColor }]}>Lien externe</Text>
          </View>
        )}
        <Text style={card.title} numberOfLines={2}>{item.title}</Text>
        {item.description ? <Text style={card.desc} numberOfLines={2}>{item.description}</Text> : null}
        <View style={card.footer}>
          <Text style={card.date}>{new Date(item.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</Text>
          <TouchableOpacity onPress={openContent} style={card.openBtn} activeOpacity={0.8}>
            <Text style={card.openBtnText}>Ouvrir</Text>
            <Ionicons name="arrow-forward" size={12} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const folder_s = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.navy, paddingHorizontal: 12, paddingVertical: 12 },
  icon: { width: 36, height: 36, borderRadius: 8, backgroundColor: C.navyLight, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 13, fontWeight: '700', color: C.text1 },
  count:{ fontSize: 11, color: C.text3, marginTop: 1 },
});

const card = StyleSheet.create({
  wrap:        { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  thumbWrap:   { width: '100%', height: 190, backgroundColor: '#000', position: 'relative' },
  thumb:       { width: '100%', height: '100%' },
  playOverlay: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center' },
  playBtn:     { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(220,38,38,0.9)', justifyContent: 'center', alignItems: 'center' },
  playTriangle:{ width: 0, height: 0, borderTopWidth: 9, borderBottomWidth: 9, borderLeftWidth: 16, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff', marginLeft: 3 },
  typePill:    { position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  typePillText:{ fontSize: 11, fontWeight: '700', color: '#fff' },
  body:        { padding: 14, gap: 8 },
  badge:       { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  badgeText:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  title:       { fontSize: 15, fontWeight: '700', color: C.text1, lineHeight: 21 },
  desc:        { fontSize: 13, color: C.text2, lineHeight: 18 },
  footer:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: C.divider },
  date:        { fontSize: 11, color: C.text3 },
  openBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.navy, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  openBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: C.bg },
  scroll:   { padding: 14, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  sectionLabel: { fontSize: 10, fontWeight: '800', color: C.text3, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: C.navy, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  backBtn:    { width: 34, height: 34, borderRadius: 9, backgroundColor: C.navyLight, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  headerTitle:{ fontSize: 15, fontWeight: '800', color: C.text1, letterSpacing: -0.2 },
  headerSub:  { fontSize: 11, color: C.text3, marginTop: 1 },

  emptyWrap:  { paddingTop: 60, alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.text1, marginBottom: 6, textAlign: 'center' },
  emptyText:  { fontSize: 13, color: C.text2, textAlign: 'center', lineHeight: 19 },
});
