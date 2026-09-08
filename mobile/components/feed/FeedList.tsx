import { useCallback, useEffect, useState } from 'react';
import { View, FlatList, RefreshControl, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDistanceToNowStrict } from 'date-fns';
import { fr } from 'date-fns/locale';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { Text, Card, Badge, Button, IconButton, EmptyState, SkeletonList } from '../ui';
import { getTeamFeed } from '../../lib/services/teamFeed';
import { postTypeEmoji, linkButtonLabel } from './postType';
import type { TeamFeedPost } from '../../types';

const relativePostDate = (iso: string) =>
  formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: fr });

/**
 * Fil d'une équipe, partagé coach/joueur. Le bouton de composition n'apparaît
 * que si `onCompose` est fourni : c'est le seul point de variation staff/joueur,
 * la RPC create_team_post revérifie de toute façon has_team_write_access.
 */
export function FeedList({
  teamId,
  onOpenPost,
  onCompose,
  calendarPath,
}: {
  teamId: string | null;
  onOpenPost: (postId: string) => void;
  onCompose?: () => void;
  /** Route calendrier du rôle courant : un post 'planning' y renvoie toujours, quel que soit son link_url stocké (coach et joueur n'ont pas le même calendrier). */
  calendarPath: string;
}) {
  const s = useStyles();
  const { theme } = useTheme();
  const router = useRouter();
  const [posts, setPosts] = useState<TeamFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) { setPosts([]); setLoading(false); setRefreshing(false); return; }
    try {
      setError(null);
      setPosts(await getTeamFeed(teamId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const openLink = useCallback((url: string) => {
    if (url.startsWith('/')) router.push(url as never);
    else void Linking.openURL(url);
  }, [router]);

  if (loading && posts.length === 0) {
    return (
      <View style={s.loadingWrap}>
        <SkeletonList rows={4} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      {onCompose ? (
        <View style={s.composeRow}>
          <IconButton icon="add" label="Nouveau post" onPress={onCompose} variant="accent" />
        </View>
      ) : null}

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent.default} />
        }
        ItemSeparatorComponent={() => <View style={s.separator} />}
        ListEmptyComponent={
          error ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Fil indisponible"
              description={error}
              action={{ label: 'Réessayer', onPress: () => { setLoading(true); load(); } }}
              tone="negative"
            />
          ) : (
            <EmptyState
              icon="chatbubbles-outline"
              title="Aucun post pour l'instant"
              description={onCompose ? 'Publie une première annonce pour ton équipe.' : "Les annonces du staff apparaîtront ici."}
            />
          )
        }
        renderItem={({ item }) => {
          const emoji = postTypeEmoji(item.post_type);
          const isPlanning = item.post_type === 'planning';
          // Une convocation formatée (adresse, horaires, effectif, message) tient
          // rarement en 4 lignes : même traitement que planning, pas de troncature.
          const isUntruncated = isPlanning || item.post_type === 'convocation';
          return (
            <Card variant="raised" padding="lg" onPress={() => onOpenPost(item.id)} style={{ gap: theme.space.sm }}>
              <View style={s.headRow}>
                <Text variant="callout" weight="700">
                  {emoji ? `${emoji} ` : ''}{item.author_name}
                </Text>
                <Text variant="caption" tone="tertiary">{relativePostDate(item.created_at)}</Text>
              </View>
              <Text variant="body" numberOfLines={isUntruncated ? undefined : 4}>{item.content}</Text>
              {item.tags.length > 0 ? (
                <View style={s.tagRow}>
                  {item.tags.map((t) => (
                    <Badge key={t.player_id} label={`${t.first_name} ${t.last_name}`} tone="accent" size="sm" />
                  ))}
                </View>
              ) : null}
              {isPlanning ? (
                <Button
                  label={linkButtonLabel(item.post_type)}
                  onPress={() => openLink(calendarPath)}
                  variant="secondary"
                  size="sm"
                />
              ) : item.link_url ? (
                <Button
                  label={linkButtonLabel(item.post_type)}
                  onPress={() => openLink(item.link_url!)}
                  variant="secondary"
                  size="sm"
                />
              ) : null}
              <View style={s.footRow}>
                <Ionicons name="chatbubble-outline" size={14} color={theme.colors.text.tertiary} />
                <Text variant="caption" tone="tertiary">
                  {item.comment_count > 0 ? `${item.comment_count} commentaire${item.comment_count > 1 ? 's' : ''}` : 'Commenter'}
                </Text>
                {item.edited_at ? (
                  <Text variant="caption" tone="tertiary" style={s.editedFlag}>· modifié</Text>
                ) : null}
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.bg.canvas },
  loadingWrap: { flex: 1, padding: t.space.lg, backgroundColor: t.colors.bg.canvas },
  composeRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: t.space.lg, paddingTop: t.space.md },
  list: { padding: t.space.lg, paddingBottom: t.space.huge, flexGrow: 1 },
  separator: { height: t.space.md },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  editedFlag: { marginLeft: t.space.xs },
}));
