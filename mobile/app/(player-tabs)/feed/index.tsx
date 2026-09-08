import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { getMyPlayerTeamIds } from '../../../lib/services/playerConvocations';
import { FeedList } from '../../../components/feed/FeedList';

export default function PlayerFeedScreen() {
  const router = useRouter();
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    getMyPlayerTeamIds().then((ids) => setTeamId(ids[0] ?? null)).catch(() => setTeamId(null));
  }, []);

  return (
    <FeedList
      teamId={teamId}
      onOpenPost={(postId) => router.push(`/(player-tabs)/feed/${postId}`)}
      calendarPath="/(player-tabs)"
    />
  );
}
