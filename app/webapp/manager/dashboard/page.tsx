/**
 * Route conservée pour ne casser aucun lien profond existant — le contenu vit
 * maintenant dans `DashboardView.tsx`, monté aussi par `/webapp/manager/analyse`
 * (segment « Séance »). Miroir du pattern mobile (voir
 * mobile/app/(tabs)/analyse.tsx et mobile/components/TeamDashboardView.tsx).
 */
'use client';

import { DashboardView } from './DashboardView';

export default function DashboardPage() {
  return <DashboardView />;
}
