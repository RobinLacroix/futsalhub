'use client';

/**
 * Matrice individuelle de charge — joueurs × dernières séances.
 *
 * Jumeau mobile : `mobile/components/performance/LoadMatrixSection.tsx`.
 *
 * `LoadPanel` répond à « comment va l'équipe ». Cette matrice répond à
 * « qui, dans l'équipe ». Une case par (joueur, séance) plutôt qu'une
 * moyenne : c'est ce qui permet de repérer en un coup d'oeil qu'un joueur a
 * ressenti un effort plus fort que le groupe, ou un plaisir en baisse, sans
 * ouvrir sa fiche individuelle une par une.
 *
 * ## Trois états de case, jamais confondus
 *
 * `!convoked` => absent/repos, case grisée pleine. `convoked && value ===
 * null` => convoqué mais questionnaire non répondu : ce n'est PAS une
 * absence, donc jamais la même couleur — case claire, juste un tiret.
 * `convoked && value !== null` => la donnée, colorée selon la métrique.
 *
 * ## Le RPE colore un ÉCART, pas la valeur brute
 *
 * Voir `rpeDeltaTone`/`RPE_DELTA_RAMP` dans `lib/trainingLoad.ts` : cette
 * matrice est un écran staff (`has_club_medical_access`), jamais vu par le
 * joueur qui a répondu, donc la règle « le RPE brut ne se colore jamais »
 * (qui protège la sincérité de sa déclaration) ne s'applique pas ici. Sans
 * cible sur la séance, on retombe sur la rampe neutre habituelle
 * (`RPE_BAND_RAMP`) plutôt que de laisser la case sans couleur.
 */

import { useMemo, useState } from 'react';
import {
  MATRIX_METRIC_LABELS,
  RPE_BAND_RAMP,
  RPE_DELTA_RAMP,
  buildPlayerMatrix,
  formatDelta,
  rpeBand,
  rpeDeltaIntensity,
  rpeDeltaTone,
  teamAverageRow,
  type MatrixCell,
  type MatrixMetric,
  type MatrixRow,
} from '@/lib/trainingLoad';
import { T } from '../theme';

interface LoadMatrixPanelProps {
  rows: MatrixRow[];
}

const METRIC_ORDER: MatrixMetric[] = ['rpe', 'physical_form', 'pleasure', 'auto_evaluation'];

/** Verte/ambre/rouge : même palette que `wellnessBand` dans `LoadPanel`, métriques de jugement uniquement. */
function judgementColor(value: number): string {
  if (value >= 7) return '#15803D';
  if (value >= 5) return '#B45309';
  return '#B91C1C';
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Largeur plancher, en pixels, sous laquelle le tableau défile plutôt que d'écraser ses colonnes. */
const NAME_COL_PX = 176;
const MIN_CELL_COL_PX = 72;

export default function LoadMatrixPanel({ rows }: LoadMatrixPanelProps) {
  const [metric, setMetric] = useState<MatrixMetric>('rpe');
  const matrix = useMemo(() => buildPlayerMatrix(rows, metric), [rows, metric]);
  const team = useMemo(() => (matrix.sessions.length > 0 ? teamAverageRow(matrix, metric) : null), [matrix, metric]);

  if (matrix.sessions.length === 0) {
    return (
      <section
        className="rounded-lg border p-4"
        style={{ backgroundColor: T.cardBg, borderColor: T.border }}
      >
        <h2 className="mb-2 text-base font-semibold" style={{ color: T.text }}>
          Vue par joueur
        </h2>
        <p className="py-6 text-center text-sm" style={{ color: T.textMuted }}>
          Aucune séance récente sur cette équipe.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border p-4"
      style={{ backgroundColor: T.cardBg, borderColor: T.border }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold" style={{ color: T.text }}>
          Vue par joueur
        </h2>
        <div className="inline-flex rounded-md border" style={{ borderColor: T.border }}>
          {METRIC_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              aria-pressed={metric === m}
              className="px-3 py-1.5 text-sm font-medium"
              style={{
                backgroundColor: metric === m ? T.accent : 'transparent',
                color: metric === m ? '#fff' : T.text,
              }}
            >
              {MATRIX_METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table
          className="border-separate"
          style={{
            borderSpacing: 0,
            width: '100%',
            minWidth: NAME_COL_PX + (matrix.sessions.length + 1) * MIN_CELL_COL_PX,
            tableLayout: 'fixed',
          }}
        >
          <thead>
            <tr>
              <th
                className="sticky left-0 whitespace-nowrap px-2 py-1 text-left text-xs font-medium"
                style={{ backgroundColor: T.cardBg, color: T.textMuted, width: NAME_COL_PX }}
              >
                Joueur
              </th>
              {matrix.sessions.map((session) => (
                <th
                  key={session.training_id}
                  className="whitespace-nowrap px-2 py-1 text-center text-xs font-medium"
                  style={{ color: T.textMuted }}
                >
                  <div>{shortDate(session.session_date)}</div>
                  {metric === 'rpe' && session.target_rpe_min !== null && session.target_rpe_max !== null && (
                    <div className="text-[10px] font-normal">
                      cible {session.target_rpe_min}-{session.target_rpe_max}
                    </div>
                  )}
                </th>
              ))}
              <th
                className="whitespace-nowrap border-l px-2 py-1 text-center text-xs font-semibold"
                style={{ borderColor: T.border, color: T.text }}
              >
                Moyenne
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.players.map((player) => (
              <tr key={player.player_id}>
                <td
                  className="sticky left-0 truncate whitespace-nowrap px-2 py-1 text-sm"
                  style={{ backgroundColor: T.cardBg, color: T.text }}
                >
                  {player.number != null ? `${player.number}. ` : ''}
                  {player.first_name} {player.last_name}
                </td>
                {player.cells.map((cell, i) => (
                  <td key={matrix.sessions[i].training_id} className="px-1 py-1 text-center">
                    <MatrixCellView cell={cell} metric={metric} digits={0} />
                  </td>
                ))}
                <td className="border-l px-1 py-1 text-center" style={{ borderColor: T.border }}>
                  <MatrixCellView cell={player.average} metric={metric} digits={1} />
                </td>
              </tr>
            ))}
          </tbody>
          {team && (
            <tfoot>
              <tr>
                <td
                  className="sticky left-0 whitespace-nowrap border-t px-2 py-1 text-sm font-semibold"
                  style={{ backgroundColor: T.cardBg, color: T.text, borderColor: T.border }}
                >
                  Moyenne équipe
                </td>
                {team.cells.map((cell, i) => (
                  <td
                    key={matrix.sessions[i].training_id}
                    className="border-t px-1 py-1 text-center"
                    style={{ borderColor: T.border }}
                  >
                    <MatrixCellView cell={cell} metric={metric} digits={0} />
                  </td>
                ))}
                <td
                  className="border-l border-t px-1 py-1 text-center"
                  style={{ borderColor: T.border }}
                >
                  <MatrixCellView cell={team.average} metric={metric} digits={1} />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="mt-3 text-xs" style={{ color: T.textMuted }}>
        Case grise = absent ou repos. Case claire avec un tiret = convoqué mais questionnaire non
        répondu.
        {metric === 'rpe' && ' Le chiffre en petit est l’écart au RPE cible de la séance.'}
      </p>
    </section>
  );
}

function MatrixCellView({
  cell,
  metric,
  digits,
}: {
  cell: MatrixCell;
  metric: MatrixMetric;
  digits: number;
}) {
  if (!cell.convoked) {
    return (
      <div
        className="mx-auto flex h-9 w-12 items-center justify-center rounded"
        style={{ backgroundColor: T.rowOdd }}
        title="Absent / repos"
        aria-label="Absent ou repos"
      />
    );
  }

  if (cell.value === null) {
    return (
      <div
        className="mx-auto flex h-9 w-12 items-center justify-center rounded text-sm"
        style={{ color: T.textMuted }}
        title="Convoqué, questionnaire non répondu"
      >
        —
      </div>
    );
  }

  if (metric === 'rpe') {
    if (cell.delta === null) {
      const band = rpeBand(cell.value);
      return (
        <div
          className="mx-auto flex h-9 w-12 flex-col items-center justify-center rounded text-sm font-semibold"
          style={{ backgroundColor: `${RPE_BAND_RAMP[band]}33`, color: T.text }}
          title={`RPE ${cell.value}/10, séance sans cible`}
        >
          {cell.value}
        </div>
      );
    }
    const tone = rpeDeltaTone(cell.delta);
    const color = tone === 'in_zone' ? T.textMuted : RPE_DELTA_RAMP[tone][rpeDeltaIntensity(cell.delta)];
    const bg = tone === 'in_zone' ? T.rowOdd : `${color}26`;
    return (
      <div
        className="mx-auto flex h-9 w-12 flex-col items-center justify-center rounded"
        style={{ backgroundColor: bg }}
        title={`RPE ${cell.value}/10, écart à la cible : ${formatDelta(cell.delta, digits === 1 ? 1 : 0)}`}
      >
        <span className="text-[11px] leading-none" style={{ color: T.textMuted }}>
          {digits === 1 ? cell.value.toFixed(1) : cell.value}
        </span>
        <span className="text-xs font-semibold leading-none" style={{ color }}>
          {formatDelta(cell.delta, digits === 1 ? 1 : 0)}
        </span>
      </div>
    );
  }

  const color = judgementColor(cell.value);
  return (
    <div
      className="mx-auto flex h-9 w-12 items-center justify-center rounded text-sm font-semibold"
      style={{ backgroundColor: `${color}1a`, color }}
      title={`${MATRIX_METRIC_LABELS[metric]} : ${digits === 1 ? cell.value.toFixed(1) : cell.value}/10`}
    >
      {digits === 1 ? cell.value.toFixed(1) : cell.value}
    </div>
  );
}
