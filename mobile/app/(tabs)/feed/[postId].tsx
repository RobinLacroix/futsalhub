import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { useAppRole } from '../../../contexts/AppRoleContext';
import { PostDetail } from '../../../components/feed/PostDetail';

export default function CoachPostDetailScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const { canEditActiveTeam } = useActiveTeam();
  const { session } = useAppRole();

  if (!postId) return null;

  return (
    <PostDetail
      postId={postId}
      currentUserId={session?.user.id ?? null}
      isStaff={canEditActiveTeam}
      onPostDeleted={() => router.back()}
      calendarPath="/(tabs)/calendar"
    />
  );
}
