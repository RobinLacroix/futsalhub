/**
 * Analyse — destination unique des données (miroir de
 * mobile/app/(tabs)/analyse.tsx)
 *
 * Fusionne Dashboard et Analytics, qui occupaient deux places de premier
 * niveau pour une seule intention : voir ses données. Deux segments,
 * découpés par domaine — Séance (entraînement) et Matchs — plutôt que par
 * granularité.
 *
 * Les deux vues restent montées (`display: none` sur celle masquée, pas de
 * démontage) : changer de segment ne redéclenche aucun fetch. Les anciennes
 * routes /webapp/manager/dashboard et /webapp/manager/analytics subsistent
 * pour ne casser aucun lien profond.
 */
'use client';

import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { DashboardView } from '../dashboard/DashboardView';
import { AnalyticsView } from '../analytics/AnalyticsView';

type Segment = 'seance' | 'matchs';

const SEGMENTS: { key: Segment; label: string; hint: string }[] = [
  { key: 'seance', label: 'Séance', hint: 'Présence, thèmes, assiduité' },
  { key: 'matchs', label: 'Matchs', hint: "Vue d'ensemble, joueurs, tracker" },
];

export default function AnalysePage() {
  const { theme } = useTheme();
  const c = theme.colors;
  const [segment, setSegment] = useState<Segment>('seance');

  return (
    <div>
      <div
        role="tablist"
        aria-label="Analyse"
        style={{
          display: 'flex',
          gap: theme.space.xs,
          padding: theme.space.xs,
          borderRadius: theme.radius.md,
          backgroundColor: c.bg.sunken,
          border: `1px solid ${c.border.subtle}`,
          marginBottom: theme.space.lg,
          maxWidth: 420,
        }}
      >
        {SEGMENTS.map((seg) => {
          const active = seg.key === segment;
          return (
            <button
              key={seg.key}
              type="button"
              role="tab"
              aria-selected={active}
              title={seg.hint}
              onClick={() => setSegment(seg.key)}
              style={{
                flex: 1,
                padding: `${theme.space.sm}px 0`,
                borderRadius: theme.radius.sm,
                border: `1px solid ${active ? c.accent.border : 'transparent'}`,
                backgroundColor: active ? c.accent.subtle : 'transparent',
                color: active ? c.accent.default : c.text.secondary,
                fontSize: theme.typography.callout.fontSize,
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                transition: 'background-color 120ms, border-color 120ms',
              }}
            >
              {seg.label}
            </button>
          );
        })}
      </div>

      {/* Les deux vues restent montées : changer de segment ne recharge rien. */}
      <div style={{ display: segment === 'seance' ? 'block' : 'none' }}>
        <DashboardView />
      </div>
      <div style={{ display: segment === 'matchs' ? 'block' : 'none' }}>
        <AnalyticsView />
      </div>
    </div>
  );
}
