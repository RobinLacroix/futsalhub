/**
 * Enveloppe de route héritée. Le contenu vit dans
 * `components/TrackerAnalyticsView`, monté par l'onglet « Analyse » (segment
 * Matchs). Conservée pour ne casser aucun lien profond existant.
 */

import { TrackerAnalyticsView } from '../../../components/TrackerAnalyticsView';
import { MatchAnalyticsProvider } from '../../../components/analytics/MatchAnalyticsContext';

export default function TrackerDashboardScreen() {
  return (
    <MatchAnalyticsProvider>
      <TrackerAnalyticsView title="Tracker" showRecordButton />
    </MatchAnalyticsProvider>
  );
}
