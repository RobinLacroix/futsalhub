'use client';

/**
 * Déclarations des joueurs — le fil brut, distinct des Signaux précoces.
 *
 * `PainSignalsPanel` répond à « qui répète la même zone ». Ce panneau répond à
 * « qu'est-ce qui a été déclaré, dans l'ordre » — y compris une déclaration
 * isolée qui n'atteindra jamais le seuil de signal. Les deux coexistent sur
 * l'onglet Infirmerie, ils ne se remplacent pas.
 *
 * Même garde-fou que `PainSignalsPanel` : l'intensité est affichée sur une
 * rampe monochrome (`INTENSITY_RAMP`), jamais vert/rouge — c'est une mesure,
 * pas une note, et une couleur sémantique pousserait à sous-déclarer.
 */

import { zoneLabel } from '@/lib/painMap';
import { SIDE_LABELS } from '@/lib/availability';
import type { ClubPainReportGroup } from '@/types';
import { T, INTENSITY_RAMP } from '../theme';

interface PainReportsPanelProps {
  reports: ClubPainReportGroup[];
  onOpenPlayer: (playerId: string) => void;
}

const SOURCE_LABELS: Record<'questionnaire' | 'spontane', string> = {
  questionnaire: 'Fin de séance',
  spontane: 'Spontané',
};

const ONSET_LABELS: Record<'aigu' | 'chronique', string> = {
  aigu: 'Récent / aigu',
  chronique: 'Qui traîne',
};

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function PainReportsPanel({ reports, onOpenPlayer }: PainReportsPanelProps) {
  return (
    <section
      className="rounded-lg border p-4"
      style={{ backgroundColor: T.cardBg, borderColor: T.border }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold" style={{ color: T.text }}>
          Déclarations des joueurs
        </h2>
        <span className="text-sm" style={{ color: T.textMuted }}>
          {reports.length} récente{reports.length > 1 ? 's' : ''}
        </span>
      </div>

      {reports.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: T.textMuted }}>
          Aucune déclaration de douleur récente.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: T.border }}>
          {reports.map((report) => (
            <li key={report.report_group}>
              <button
                type="button"
                onClick={() => onOpenPlayer(report.player_id)}
                className="flex w-full items-start gap-3 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: T.text }}>
                    {report.number != null ? `${report.number}. ` : ''}
                    {report.first_name} {report.last_name}
                  </p>
                  <p className="truncate text-sm" style={{ color: T.textMuted }}>
                    {report.zones
                      .map(
                        (z) =>
                          `${zoneLabel(z.zone)}${z.side !== 'C' ? ` (${SIDE_LABELS[z.side]})` : ''}`,
                      )
                      .join(', ')}
                  </p>
                  <p className="mt-0.5 truncate text-xs" style={{ color: T.textMuted }}>
                    {SOURCE_LABELS[report.source]} · {fmtDateTime(report.reported_at)}
                    {report.onset ? ` · ${ONSET_LABELS[report.onset]}` : ''}
                  </p>
                  {report.note && (
                    <p className="mt-1 truncate text-xs italic" style={{ color: T.textMuted }}>
                      {report.note}
                    </p>
                  )}
                </div>
                <span
                  className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: INTENSITY_RAMP[report.max_intensity] }}
                  title="Intensité maximale déclarée dans cette soumission. C'est une mesure, pas une note."
                >
                  {report.max_intensity} / 3
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
