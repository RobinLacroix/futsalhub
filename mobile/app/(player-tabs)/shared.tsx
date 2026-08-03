/**
 * Bibliothèque de contenus partagés par le staff (P1-7)
 *
 * ## Ce qui change
 *
 * - **La flèche de lecture YouTube était dessinée en bordures CSS** :
 *   `borderLeftWidth: 16` avec deux bordures transparentes pour fabriquer un
 *   triangle. Même bricolage que côté coach, corrigé de la même façon : une
 *   icône, qui suit la taille de police et se nomme pour VoiceOver.
 * - **La navigation en dossiers n'avait pas de retour matériel Android.** Le
 *   `chevron-back` du fil d'Ariane était le seul moyen de remonter ; le bouton
 *   retour du système quittait l'onglet et perdait la position.
 * - **Les vignettes YouTube n'avaient pas d'état d'échec.** Une vidéo
 *   supprimée affichait un rectangle noir sans explication.
 * - Les libellés de section descendaient à 10 px en capitales espacées.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Pressable, Linking, Image, ScrollView, BackHandler } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { haptics } from '../../lib/design/haptics';
import { Text, Card, Badge, EmptyState, Button } from '../../components/ui';
import { SkeletonList } from '../../components/ui/Skeleton';
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

export default function PlayerSharedScreen() {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  const { player, loading: roleLoading } = useAppRole();

  const [folders, setFolders] = useState<SharedFolder[]>([]);
  const [items, setItems] = useState<SharedContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState<SharedFolder[]>([]);

  const currentFolderId = path.length > 0 ? path[path.length - 1].id : null;

  useEffect(() => {
    if (roleLoading) return;
    if (!player) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [f, i] = await Promise.all([
          getSharedFoldersForPlayer(player.id),
          getSharedContentForPlayer(player.id),
        ]);
        setFolders(f);
        setItems(i);
      } catch {
        // Non bloquant : l'écran affiche son état vide plutôt qu'une erreur.
      } finally {
        setLoading(false);
      }
    })();
  }, [player, roleLoading]);

  const goBack = useCallback(() => {
    setPath((prev) => prev.slice(0, -1));
  }, []);

  // Le bouton retour Android remontait d'un onglet au lieu d'un dossier.
  useEffect(() => {
    if (path.length === 0) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [path.length, goBack]);

  const currentFolders = useMemo(
    () => folders.filter((f) => f.parent_id === currentFolderId),
    [folders, currentFolderId]
  );

  const currentItems = useMemo(
    () => items.filter((i) => (i.folder_id ?? null) === currentFolderId),
    [items, currentFolderId]
  );

  const countInFolder = useCallback(
    (fid: string | null): number => {
      const direct = items.filter((i) => (i.folder_id ?? null) === fid).length;
      const nested = folders
        .filter((f) => f.parent_id === fid)
        .reduce((sum, f) => sum + countInFolder(f.id), 0);
      return direct + nested;
    },
    [items, folders]
  );

  if (roleLoading || loading) {
    return (
      <View style={s.loadingWrap}>
        <SkeletonList rows={4} />
      </View>
    );
  }

  if (!player) {
    return (
      <EmptyState
        icon="person-circle-outline"
        title="Ton compte n’est pas relié à ta fiche"
        description="Demande à ton coach de relier ton compte à ta fiche joueur pour accéder aux contenus partagés."
      />
    );
  }

  return (
    <View style={s.root}>
      <View style={s.header}>
        {path.length > 0 ? (
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [s.headerBtn, pressed && s.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Revenir au dossier précédent"
          >
            <Ionicons name="chevron-back" size={20} color={c.positive.default} />
          </Pressable>
        ) : (
          <View style={[s.headerBtn, s.headerIcon]}>
            <Ionicons name="library" size={18} color={c.positive.default} />
          </View>
        )}

        <View style={s.flex}>
          <Text variant="headline" numberOfLines={1}>
            {path.length === 0 ? 'Bibliothèque' : path[path.length - 1].name}
          </Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {path.length === 0
              ? `${items.length} ressource${items.length !== 1 ? 's' : ''} au total`
              : ['Bibliothèque', ...path.map((f) => f.name)].join(' › ')}
          </Text>
        </View>

        {path.length > 1 && (
          <Button label="Racine" onPress={() => setPath([])} variant="ghost" size="sm" />
        )}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {currentFolders.length > 0 && (
          <View style={s.section}>
            <Text variant="caption" tone="secondary" weight="700">
              Dossiers
            </Text>
            {currentFolders.map((f) => {
              const count = countInFolder(f.id);
              return (
                <Pressable
                  key={f.id}
                  onPress={() => {
                    haptics.select();
                    setPath((prev) => [...prev, f]);
                  }}
                  style={({ pressed }) => [pressed && s.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Dossier ${f.name}, ${count} ressource${count !== 1 ? 's' : ''}`}
                >
                  <Card variant="flat" padding="md" style={s.folderRow}>
                    <View style={s.folderIcon}>
                      <Ionicons name="folder" size={20} color={c.positive.default} />
                    </View>
                    <View style={s.flex}>
                      <Text variant="body" weight="600" numberOfLines={1}>
                        {f.name}
                      </Text>
                      <Text variant="caption" tone="secondary">
                        {count} ressource{count !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={c.text.tertiary} />
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}

        {currentItems.length === 0 ? (
          <EmptyState
            icon={currentFolders.length > 0 ? 'document-outline' : 'library-outline'}
            title={
              currentFolders.length === 0 && items.length === 0
                ? 'Aucune ressource partagée'
                : 'Aucun fichier ici'
            }
            description={
              currentFolders.length === 0 && items.length === 0
                ? "Ton staff n'a pas encore publié de ressources."
                : 'Ce dossier ne contient que des sous-dossiers.'
            }
          />
        ) : (
          <View style={s.section}>
            <Text variant="caption" tone="secondary" weight="700">
              Fichiers
            </Text>
            {currentItems.map((item) => (
              <ContentCard key={item.id} item={item} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ContentCard({ item }: { item: SharedContent }) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;

  const [thumbFailed, setThumbFailed] = useState(false);
  const ytId = item.content_type === 'youtube' ? extractYoutubeId(item.url) : null;

  const open = useCallback(() => {
    haptics.select();
    logSharedContentView(item.id);
    Linking.openURL(item.url).catch(() => {});
  }, [item.id, item.url]);

  const dateLabel = new Date(item.created_at).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  });

  return (
    <Card variant="flat" padding="none" style={s.contentCard}>
      {ytId && (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`Lire la vidéo ${item.title}`}
          style={({ pressed }) => [pressed && s.pressed]}
        >
          <View style={s.thumbWrap}>
            {thumbFailed ? (
              <View style={s.thumbFallback}>
                <Ionicons name="videocam-off-outline" size={28} color={c.text.tertiary} />
                <Text variant="caption" tone="tertiary">
                  Aperçu indisponible
                </Text>
              </View>
            ) : (
              <Image
                source={{ uri: youtubeThumbnail(ytId) }}
                style={s.thumb}
                resizeMode="cover"
                onError={() => setThumbFailed(true)}
              />
            )}
            <View style={s.playLayer} pointerEvents="none">
              <View style={s.playBtn}>
                {/* Icône, et non plus un triangle fabriqué en bordures CSS. */}
                <Ionicons name="play" size={26} color="#FFFFFF" />
              </View>
            </View>
          </View>
        </Pressable>
      )}

      <View style={s.contentBody}>
        <Badge
          label={ytId ? 'Vidéo' : 'Lien externe'}
          tone={ytId ? 'negative' : 'accent'}
          size="sm"
        />
        <Text variant="headline" numberOfLines={2}>
          {item.title}
        </Text>
        {item.description ? (
          <Text variant="callout" tone="secondary" numberOfLines={3}>
            {item.description}
          </Text>
        ) : null}
        <View style={s.contentFooter}>
          <Text variant="caption" tone="tertiary">
            Publié le {dateLabel}
          </Text>
          <Button label="Ouvrir" onPress={open} size="sm" icon="open-outline" iconAfter />
        </View>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },

  root: { flex: 1, backgroundColor: t.colors.bg.canvas },
  loadingWrap: { flex: 1, padding: t.space.lg, backgroundColor: t.colors.bg.canvas },
  scroll: { padding: t.space.lg, paddingBottom: t.space.huge, gap: t.space.xl },
  section: { gap: t.space.sm },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.md,
    backgroundColor: t.colors.bg.surface,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border.subtle,
  },
  headerBtn: {
    width: HIT_SLOP_MIN,
    height: HIT_SLOP_MIN,
    borderRadius: t.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.positive.subtle,
  },
  headerIcon: { opacity: 0.9 },

  folderRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  folderIcon: {
    width: 40,
    height: 40,
    borderRadius: t.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.positive.subtle,
  },

  contentCard: { overflow: 'hidden' },
  thumbWrap: { width: '100%', height: 190, backgroundColor: t.colors.bg.sunken },
  thumb: { width: '100%', height: '100%' },
  thumbFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.space.sm },
  playLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
    backgroundColor: 'rgba(12,14,20,0.72)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },

  contentBody: { padding: t.space.lg, gap: t.space.sm, alignItems: 'flex-start' },
  contentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingTop: t.space.sm,
    borderTopWidth: 1,
    borderTopColor: t.colors.border.subtle,
  },
}));
