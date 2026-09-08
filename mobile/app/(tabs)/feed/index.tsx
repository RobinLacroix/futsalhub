import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { useNotifications } from '../../../contexts/NotificationContext';
import { FeedList } from '../../../components/feed/FeedList';

export default function CoachFeedScreen() {
  const router = useRouter();
  const { activeTeamId, canEditActiveTeam } = useActiveTeam();
  const { markRead } = useNotifications();

  useEffect(() => { void markRead(['post_tag', 'post_comment']); }, [markRead]);

  return (
    <FeedList
      teamId={activeTeamId || null}
      onOpenPost={(postId) => router.push(`/(tabs)/feed/${postId}`)}
      onCompose={canEditActiveTeam ? () => router.push('/(tabs)/feed/new-post') : undefined}
      calendarPath="/(tabs)/calendar"
    />
  );
}
