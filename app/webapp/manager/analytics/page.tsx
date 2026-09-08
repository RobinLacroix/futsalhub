/**
 * Route conservée pour ne casser aucun lien profond existant — le contenu vit
 * maintenant dans `AnalyticsView.tsx`, monté aussi par `/webapp/manager/analyse`
 * (segment « Matchs »). Miroir du pattern mobile (voir
 * mobile/app/(tabs)/analyse.tsx et mobile/components/AnalyticsView.tsx).
 */
'use client';

import { AnalyticsView } from './AnalyticsView';

export default function AnalyticsPage() {
  return <AnalyticsView />;
}
