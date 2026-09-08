import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAppRole } from '../../../contexts/AppRoleContext';
import { PostDetail } from '../../../components/feed/PostDetail';

export default function PlayerPostDetailScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const { session } = useAppRole();

  if (!postId) return null;

  return (
    <PostDetail
      postId={postId}
      currentUserId={session?.user.id ?? null}
      isStaff={false}
      onPostDeleted={() => router.back()}
      calendarPath="/(player-tabs)"
    />
  );
}
