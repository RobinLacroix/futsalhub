'use client';

/**
 * Historique d'un joueur sur UN test — modale ouverte depuis une cellule de
 * `TestOverviewPanel`.
 *
 * Volontairement un seul test à la fois : la matrice montre déjà tout
 * l'effectif sur une catégorie, cette modale répond à la question suivante,
 * « et lui, sur ce test précis, il progresse comment ? ». Mélanger plusieurs
 * tests ici referait la fiche joueur en plus petit.
 *
 * Même calcul que `mobile/components/players/PlayerTestsSection.tsx`
 * (tendance, `direction`), présentation différente — c'est la palette qui
 * diverge (thème de cette page vs palette FM de la fiche joueur), pas la
 * logique : tout passe par `progressDelta`/`carriesJudgement`, jamais une
 * comparaison à la main.
 */

import { X } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  carriesJudgement,
  formatTestValue,
  formatTestValueWithUnit,
  progressDelta,
  rawDelta,
  testSecondaryReading,
  type PlayerTestSeries,
} from '@/lib/physicalTests';
import { T } from '../theme';

const MAX_POINTS = 8;

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

const fmtLong = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export interface TestHistoryModalProps {
  open: boolean;
  onClose: () => void;
  playerName: string;
  series: PlayerTestSeries | null;
}

export default function TestHistoryModal({ open, onClose, playerName, series }: TestHistoryModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{playerName}</h2>
            {series && <p className="text-sm text-gray-500">{series.type.label}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!series ? (
          <p className="py-8 text-center text-sm text-gray-500">Aucune mesure disponible.</p>
        ) : (
          <TestHistoryBody series={series} />
        )}
      </div>
    </div>
  );
}

function TestHistoryBody({ series }: { series: PlayerTestSeries }) {
  const { type, points, latest, previous, best, delta } = series;
  const judges = carriesJudgement(type.direction);
  const secondary = testSecondaryReading(type, latest.value);

  const trend = (() => {
    if (!previous) return null;
    if (!judges) {
      const raw = rawDelta(previous.value, latest.value);
      if (raw === 0) return { text: `stable depuis le ${fmtShort(previous.date)}`, color: T.textMuted };
      const sign = raw > 0 ? '+' : '−';
      return {
        text: `${sign}${Math.abs(raw).toFixed(type.decimals)} ${type.unit} depuis le ${fmtShort(previous.date)}`,
        color: T.textMuted,
      };
    }
    if (delta === null || delta === 0) {
      return { text: `stable depuis le ${fmtShort(previous.date)}`, color: T.textMuted };
    }
    const amount = `${Math.abs(delta).toFixed(type.decimals)} ${type.unit}`;
    return delta > 0
      ? { text: `en progrès de ${amount} depuis le ${fmtShort(previous.date)}`, color: '#15803D' }
      : { text: `en recul de ${amount} depuis le ${fmtShort(previous.date)}`, color: '#B91C1C' };
  })();

  const chartPoints = points.slice(-MAX_POINTS).map((pt) => ({
    date: fmtShort(pt.date),
    value: pt.value,
  }));

  return (
    <div>
      <div className="mb-1 flex items-end gap-2">
        <span className="text-3xl font-bold tabular-nums" style={{ color: T.text }}>
          {formatTestValue(latest.value, type)}
        </span>
        <span className="mb-1 text-sm text-gray-500">{type.unit}</span>
        {secondary && (
          <span className="mb-1 text-sm text-gray-500">
            ({formatTestValue(secondary.value, { decimals: 1 })} {secondary.unit})
          </span>
        )}
        {trend && (
          <span className="mb-1 ml-auto text-sm font-semibold" style={{ color: trend.color }}>
            {trend.text}
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-gray-500">
        le {fmtLong(latest.date)} · {points.length} mesure{points.length > 1 ? 's' : ''}
        {points.length > 1 && judges ? ` · meilleure ${formatTestValueWithUnit(best, type)}` : ''}
      </p>

      {chartPoints.length > 1 && (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartPoints} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.textMuted }} />
              <YAxis tick={{ fontSize: 11, fill: T.textMuted }} domain={['auto', 'auto']} />
              <Tooltip
                formatter={(value: number) => [formatTestValueWithUnit(value, type), type.label]}
                contentStyle={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }}
              />
              {/* `linear`, jamais `monotone` : entre deux campagnes espacées de
                  plusieurs mois, une courbe lissée dessine une trajectoire que
                  personne n'a mesurée (même règle que le LineChart mobile,
                  `smooth={false}`). */}
              <Line type="linear" dataKey="value" stroke={T.accent} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {type.protocol_note && <p className="mt-3 text-xs text-gray-500">{type.protocol_note}</p>}
    </div>
  );
}
