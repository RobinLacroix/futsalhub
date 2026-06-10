import { useRouter, useLocalSearchParams } from 'expo-router';
import { useIsTablet } from '../../../hooks/useIsTablet';
import TabletMatchRecorder from '../../../components/TabletMatchRecorder';
import PhoneMatchRecorder from '../../../components/PhoneMatchRecorder';

export default function MatchRecorderScreen() {
  const router = useRouter();
  const isTablet = useIsTablet();
  const { matchId: paramMatchId } = useLocalSearchParams<{ matchId?: string }>();

  const props = {
    initialMatchId: paramMatchId ?? null,
    onMatchFinished: () => router.replace('/(tabs)/tracker'),
    onBack: () => router.back(),
  };

  return isTablet
    ? <TabletMatchRecorder {...props} />
    : <PhoneMatchRecorder  {...props} />;
}
