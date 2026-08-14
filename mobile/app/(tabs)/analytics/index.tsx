/**
 * Enveloppe de route héritée. Le contenu vit dans `components/AnalyticsView`,
 * monté par l'onglet « Analyse » (segment Joueurs). Conservée pour ne casser
 * aucun lien profond existant.
 */

import { AnalyticsView } from '../../../components/AnalyticsView';
import { MatchAnalyticsProvider } from '../../../components/analytics/MatchAnalyticsContext';

export default function AnalyticsScreen() {
  return (
    <MatchAnalyticsProvider>
      <AnalyticsView />
    </MatchAnalyticsProvider>
  );
}
