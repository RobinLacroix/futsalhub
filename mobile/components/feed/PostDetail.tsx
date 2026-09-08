import { useCallback, useEffect, useState } from 'react';
import { View, Alert, KeyboardAvoidingView, Platform, FlatList, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDistanceToNowStrict } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { Text, Card, Badge, Button, IconButton, Input, EmptyState, SkeletonDetail } from '../ui';
import { haptics } from '../../lib/design/haptics';
import { postTypeEmoji, linkButtonLabel } from './postType';
import {
  getTeamPost,
  getPostComments,
  addPostComment,
  deleteTeamPost,
  deletePostComment,
} from '../../lib/services/teamFeed';
import type { TeamFeedPost, TeamFeedComment } from '../../types';

const relativeDate = (iso: string) =>
  formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: fr });

/**
 * Post + commentaires, partagé coach/joueur. `isStaff` n'ouvre que la
 * modération (suppression des posts/commentaires d'autrui) : la RPC revérifie
 * has_team_write_access de toute façon, ce prop ne fait que masquer l'action.
 */
export function PostDetail({
  postId,
  currentUserId,
  isStaff,
  onPostDeleted,
  calendarPath,
}: {
  postId: string;
  currentUserId: string | null;
  isStaff: boolean;
  onPostDeleted: () => void;
  /** Route calendrier du rôle courant : un post 'planning' y renvoie toujours (cf. FeedList). */
  calendarPath: string;
}) {
  const s = useStyles();
  const { theme } = useTheme();
  const router = useRouter();
  const [post, setPost] = useState<TeamFeedPost | null>(null);
  const [comments, setComments] = useState<TeamFeedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [p, c] = await Promise.all([getTeamPost(postId), getPostComments(postId)]);
      if (!p) { setError('Ce post a été supprimé.'); return; }
      setPost(p);
      setComments(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au chargement');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  const confirmDeletePost = () => {
    Alert.alert('Supprimer ce post ?', 'Cette action est définitive.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const r = await deleteTeamPost(postId);
          if (r.success) { haptics.success(); onPostDeleted(); }
          else { haptics.error(); Alert.alert('Erreur', r.error ?? 'Suppression impossible'); }
        },
      },
    ]);
  };

  const confirmDeleteComment = (commentId: string) => {
    Alert.alert('Supprimer ce commentaire ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const r = await deletePostComment(commentId);
          if (r.success) { haptics.success(); setComments((cs) => cs.filter((c) => c.id !== commentId)); }
          else { haptics.error(); Alert.alert('Erreur', r.error ?? 'Suppression impossible'); }
        },
      },
    ]);
  };

  const submitComment = async () => {
    const content = draft.trim();
    if (!content) return;
    setSending(true);
    const r = await addPostComment(postId, content);
    setSending(false);
    if (r.success) {
      setDraft('');
      haptics.success();
      void load();
    } else {
      haptics.error();
      Alert.alert('Erreur', r.error ?? "Impossible d'envoyer le commentaire");
    }
  };

  if (loading) {
    return <View style={s.loadingWrap}><SkeletonDetail /></View>;
  }

  if (error || !post) {
    return (
      <View style={s.loadingWrap}>
        <EmptyState icon="alert-circle-outline" title="Post indisponible" description={error ?? undefined} tone="negative" />
      </View>
    );
  }

  const canManagePost = isStaff || post.author_user_id === currentUserId;
  const emoji = postTypeEmoji(post.post_type);
  const openLink = (url: string) => {
    if (url.startsWith('/')) router.push(url as never);
    else void Linking.openURL(url);
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        style={s.flex}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <Card variant="raised" padding="lg" style={{ gap: theme.space.sm, marginBottom: theme.space.lg }}>
            <View style={s.headRow}>
              <View style={s.flex}>
                <Text variant="callout" weight="700">
                  {emoji ? `${emoji} ` : ''}{post.author_name}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {relativeDate(post.created_at)}{post.edited_at ? ' · modifié' : ''}
                </Text>
              </View>
              {canManagePost ? (
                <IconButton icon="trash-outline" label="Supprimer le post" variant="destructive" onPress={confirmDeletePost} />
              ) : null}
            </View>
            <Text variant="body">{post.content}</Text>
            {post.tags.length > 0 ? (
              <View style={s.tagRow}>
                {post.tags.map((t) => (
                  <Badge key={t.player_id} label={`${t.first_name} ${t.last_name}`} tone="accent" size="sm" />
                ))}
              </View>
            ) : null}
            {post.post_type === 'planning' ? (
              <Button
                label={linkButtonLabel(post.post_type)}
                onPress={() => openLink(calendarPath)}
                variant="secondary"
                size="sm"
              />
            ) : post.link_url ? (
              <Button
                label={linkButtonLabel(post.post_type)}
                onPress={() => openLink(post.link_url!)}
                variant="secondary"
                size="sm"
              />
            ) : null}
          </Card>
        }
        data={comments}
        keyExtractor={(c) => c.id}
        ItemSeparatorComponent={() => <View style={{ height: theme.space.md }} />}
        ListEmptyComponent={
          <Text variant="callout" tone="tertiary" style={s.emptyComments}>Aucun commentaire pour l'instant.</Text>
        }
        renderItem={({ item }) => {
          const mine = isStaff || item.author_user_id === currentUserId;
          return (
            <Card variant="flat" padding="md" style={{ gap: 4 }}>
              <View style={s.headRow}>
                <Text variant="caption" weight="700" style={s.flex}>{item.author_name}</Text>
                <Text variant="caption" tone="tertiary">{relativeDate(item.created_at)}</Text>
                {mine ? (
                  <IconButton
                    icon="close"
                    label="Supprimer le commentaire"
                    size="sm"
                    onPress={() => confirmDeleteComment(item.id)}
                  />
                ) : null}
              </View>
              <Text variant="callout">{item.content}</Text>
            </Card>
          );
        }}
      />

      <View style={s.composerRow}>
        <Input
          label="Commentaire"
          containerStyle={s.flex}
          value={draft}
          onChangeText={setDraft}
          placeholder="Écrire un commentaire…"
          multiline
        />
        <Button label="Envoyer" onPress={submitComment} loading={sending} disabled={sending || !draft.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.bg.canvas },
  flex: { flex: 1 },
  loadingWrap: { flex: 1, padding: t.space.lg, backgroundColor: t.colors.bg.canvas },
  list: { padding: t.space.lg, paddingBottom: t.space.xl },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  emptyComments: { textAlign: 'center', paddingVertical: t.space.lg },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: t.space.sm,
    padding: t.space.lg,
    borderTopWidth: 1,
    borderTopColor: t.colors.border.subtle,
    backgroundColor: t.colors.bg.canvas,
  },
}));
