'use client';

/**
 * Charge d'entraînement et wellness — panneau de la page Performance.
 *
 * ## La couverture voyage avec le chiffre, toujours
 *
 * Une charge hebdomadaire calculée sur 40 % de réponses est un chiffre faux
 * présenté comme vrai. Chaque semaine affiche donc son taux de réponse, et sous
 * 60 % la valeur est grisée avec la mention explicite. C'est la règle qui
 * empêche cette section de produire de la fausse confiance, ce qui serait pire
 * que de ne rien afficher.
 *
 * ## Une charge est une mesure, pas une note
 *
 * Les barres suivent une rampe d'intensité monochrome, jamais vert-orange-rouge.
 * Seul le PIC est signalé, et en ambre : un joueur qui encaisse une grosse
 * semaine n'a rien fait de mal, c'est une information à traiter. Même
 * raisonnement que le RPE et que les intensités de douleur ailleurs dans
 * l'application.
 *
 * Le wellness, lui, porte un jugement assumé — c'est déjà la classification du
 * questionnaire côté joueur — sauf le RPE, qui reste une mesure.
 */

import { useMemo } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import {
  JUDGEMENT_BAND_LABELS,
  MIN_RESPONSE_RATE,
  MONOTONY_ELEVATED,
  RPE_BAND_LABELS,
  RPE_BAND_RAMP,
  WELLNESS_LABELS,
  formatDelta,
  formatLoad,
  formatMonotony,
  formatRate,
  isReliable,
  judgementBand,
  monotonyHint,
  rpeBand,
  weekLabel,
  wellnessCarriesJudgement,
  wellnessDelta,
  type WeeklyLoad,
  type WellnessKey,
} from '@/lib/trainingLoad';
import { T, INTENSITY_RAMP } from '../theme';

interface LoadPanelProps {
  weeks: WeeklyLoad[];
}

const WELLNESS_ORDER: WellnessKey[] = ['rpe', 'physicalForm', 'pleasure', 'autoEvaluation'];

/**
 * Bande de lecture d'une valeur de wellness sur 10 : couleur + libellé.
 *
 * Le RPE ne prend JAMAIS de couleur sémantique (rampe indigo monochrome,
 * `RPE_BAND_RAMP`) : colorer un effort ressenti élevé en rouge pousse le
 * joueur à sous-déclarer pour éviter le rouge, et détruit la donnée qu'on
 * cherche à récolter. Les trois autres métriques portent déjà un jugement
 * côté questionnaire joueur, elles gardent leur code couleur.
 */
function wellnessBand(key: WellnessKey, value: number): { label: string; color: string } {
  if (!wellnessCarriesJudgement(key)) {
    const band = rpeBand(value);
    return { label: RPE_BAND_LABELS[band], color: RPE_BAND_RAMP[band] };
  }
  const band = judgementBand(value);
  const color = band === 'bon' ? '#15803D' : band === 'moyen' ? '#B45309' : '#B91C1C';
  return { label: JUDGEMENT_BAND_LABELS[band], color };
}

/** Hauteur, en pixels, réservée aux barres + à la bande cible (hors ligne de valeurs). */
const CHART_HEIGHT = 96;
/** Repères de graduation, en fraction de l'échelle. Sobres : une échelle, pas un quadrillage. */
const GRIDLINE_RATIOS = [0.25, 0.5, 0.75];

export default function LoadPanel({ weeks }: LoadPanelProps) {
  const recent = useMemo(() => weeks.slice(-8), [weeks]);

  // L'échelle couvre aussi la cible : sinon une bande cible plus haute que
  // toutes les barres serait coupée en haut du graphique.
  const maxScale = useMemo(
    () =>
      Math.max(
        1,
        ...recent.map((w) => w.load ?? 0),
        ...recent.map((w) => w.targetLoadMax ?? 0),
      ),
    [recent],
  );

  const current = recent.length > 0 ? recent[recent.length - 1] : null;
  const previous = recent.length > 1 ? recent[recent.length - 2] : null;

  if (weeks.length === 0) {
    return (
      <section
        className="rounded-lg border p-4"
        style={{ backgroundColor: T.cardBg, borderColor: T.border }}
      >
        <h2 className="mb-2 text-base font-semibold" style={{ color: T.text }}>
          Charge d&apos;entraînement
        </h2>
        <p className="py-6 text-center text-sm" style={{ color: T.textMuted }}>
          Aucune séance sur la période. La charge se calcule à partir du RPE des questionnaires
          et de la durée de séance.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border p-4"
      style={{ backgroundColor: T.cardBg, borderColor: T.border }}
    >
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold" style={{ color: T.text }}>
          Charge d&apos;entraînement
        </h2>
        <span className="text-xs" style={{ color: T.textMuted }}>
          RPE × durée (Foster), unités arbitraires
        </span>
      </div>

      {/* ── Semaine en cours ─────────────────────────────────────────────── */}
      {current && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Metric
            label="Charge de la semaine"
            value={formatLoad(current.load)}
            reliable={isReliable(current.responseRate)}
            footnote={`${current.sessions} séance${current.sessions > 1 ? 's' : ''} · ${formatRate(current.responseRate)} de réponses`}
          />
          <Metric
            label="Monotonie"
            value={formatMonotony(current.monotony)}
            reliable={isReliable(current.responseRate)}
            footnote={monotonyHint(current.monotony) ?? 'Pas assez de séances pour la calculer.'}
            alert={current.monotony !== null && current.monotony >= MONOTONY_ELEVATED}
          />
          <Metric
            label="Contrainte"
            value={formatLoad(current.strain)}
            reliable={isReliable(current.responseRate)}
            footnote="Charge × monotonie"
          />
        </div>
      )}

      {/* ── Histogramme ──────────────────────────────────────────────────── */}
      <div className="mb-1 flex gap-2">
        {recent.map((week) => (
          <span
            key={week.weekStart}
            className="flex-1 text-center text-[10px] tabular-nums"
            style={{ color: T.textMuted }}
          >
            {week.load !== null ? formatLoad(week.load) : ''}
          </span>
        ))}
      </div>
      <div className="relative mb-2" style={{ height: CHART_HEIGHT }}>
        {/* Graduation légère : une échelle de lecture, pas un jugement. */}
        {GRIDLINE_RATIOS.map((ratio) => (
          <div
            key={ratio}
            className="absolute inset-x-0"
            style={{ bottom: ratio * CHART_HEIGHT, borderTop: `1px dashed ${T.border}` }}
          >
            <span
              className="absolute left-0 -translate-y-full text-[9px] tabular-nums"
              style={{ color: T.textMuted, opacity: 0.7 }}
            >
              {formatLoad(ratio * maxScale)}
            </span>
          </div>
        ))}

        <div className="flex h-full items-end gap-2">
          {recent.map((week) => {
            const barPx = week.load !== null ? Math.max(4, (week.load / maxScale) * CHART_HEIGHT) : 4;
            const targetTopPx =
              week.targetLoadMax !== null ? (week.targetLoadMax / maxScale) * CHART_HEIGHT : null;
            const targetBottomPx =
              week.targetLoadMin !== null ? (week.targetLoadMin / maxScale) * CHART_HEIGHT : null;
            const reliable = isReliable(week.responseRate);
            return (
              <div key={week.weekStart} className="relative h-full flex-1">
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t"
                  style={{
                    height: barPx,
                    // Rampe d'intensité : une charge n'est ni bonne ni mauvaise.
                    backgroundColor:
                      week.load === null
                        ? T.border
                        : week.isPeak
                          ? '#FFB020'
                          : INTENSITY_RAMP[3],
                    opacity: reliable ? 1 : 0.35,
                  }}
                  title={
                    week.load === null
                      ? 'Aucune donnée exploitable cette semaine'
                      : `${formatLoad(week.load)} · ${formatRate(week.responseRate)} de réponses${week.isPeak ? ' · pic' : ''}`
                  }
                  aria-label={`${weekLabel(week.weekStart)} : ${formatLoad(week.load)}, ${formatRate(week.responseRate)} de réponses${week.isPeak ? ', pic de charge' : ''}${reliable ? '' : ', couverture insuffisante'}`}
                />
                {/* Rendue APRÈS la barre : sinon une charge réalisée haute cache
                    entièrement le pourtour de la bande cible en dessous. */}
                {targetTopPx !== null && targetBottomPx !== null && (
                  <div
                    className="pointer-events-none absolute inset-x-0 rounded-sm"
                    style={{
                      bottom: targetBottomPx,
                      height: Math.max(2, targetTopPx - targetBottomPx),
                      border: '1px dashed rgba(100,116,139,0.55)',
                    }}
                    aria-hidden
                    title={`Cible de la semaine : ${formatLoad(week.targetLoadMin)} à ${formatLoad(week.targetLoadMax)}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mb-4 flex gap-2">
        {recent.map((week) => (
          <span
            key={week.weekStart}
            className="flex-1 text-center text-[10px]"
            style={{ color: T.textMuted }}
          >
            {weekLabel(week.weekStart).replace('sem. du ', '')}
          </span>
        ))}
      </div>

      {recent.some((w) => w.isPeak) && (
        <div className="mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
             style={{ borderColor: 'rgba(255,176,32,0.35)', backgroundColor: 'rgba(255,176,32,0.10)', color: '#B45309' }}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Pic de charge : plus de 1,5 fois la moyenne des 4 semaines précédentes. À rapprocher
            des signalements de douleur de la même période.
          </span>
        </div>
      )}

      {recent.some((w) => !isReliable(w.responseRate)) && (
        <div className="mb-4 flex items-center gap-2 text-xs" style={{ color: T.textMuted }}>
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            Les barres pâles sont calculées sur moins de {Math.round(MIN_RESPONSE_RATE * 100)} % de
            réponses au questionnaire. Le chiffre existe, mais il ne représente pas le groupe.
          </span>
        </div>
      )}

      {/* ── Wellness ─────────────────────────────────────────────────────── */}
      {current && (
        <div>
          <h3 className="mb-2 text-sm font-medium" style={{ color: T.text }}>
            Ressenti de la semaine
          </h3>
          <div className="grid gap-3 sm:grid-cols-4">
            {WELLNESS_ORDER.map((key) => {
              const value = current.wellness[key];
              const band = value !== null ? wellnessBand(key, value) : null;
              const reliable = isReliable(current.responseRate);
              const delta = wellnessDelta(current, previous, key);
              return (
                <div
                  key={key}
                  className="rounded-md border px-3 py-3"
                  style={{ borderColor: T.border }}
                >
                  <p className="text-xs" style={{ color: T.textMuted }}>
                    {WELLNESS_LABELS[key]}
                  </p>
                  <p
                    className="text-3xl font-black tabular-nums"
                    style={{
                      color: band ? band.color : T.textMuted,
                      opacity: reliable ? 1 : 0.45,
                    }}
                  >
                    {value === null ? '—' : value.toFixed(1)}
                    <span className="text-xs font-normal" style={{ color: T.textMuted }}>
                      {value === null ? '' : ' /10'}
                    </span>
                    {delta !== null && (
                      <span
                        className="ml-1 text-xs font-semibold tabular-nums"
                        style={{ color: T.textMuted }}
                        title="Évolution vs la semaine précédente"
                      >
                        {formatDelta(delta)}
                      </span>
                    )}
                  </p>
                  {band && (
                    <>
                      <span
                        className="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          backgroundColor: `${band.color}1a`,
                          color: band.color,
                          opacity: reliable ? 1 : 0.45,
                        }}
                      >
                        {band.label}
                      </span>
                      <div
                        className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                        style={{ backgroundColor: T.rowOdd }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (value! / 10) * 100)}%`,
                            backgroundColor: band.color,
                            opacity: reliable ? 1 : 0.45,
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {!isReliable(current.responseRate) && (
            <p className="mt-2 text-xs" style={{ color: T.textMuted }}>
              Calculé sur {formatRate(current.responseRate)} de réponses : à lire avec prudence.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  footnote,
  reliable,
  alert = false,
}: {
  label: string;
  value: string;
  footnote: string;
  reliable: boolean;
  alert?: boolean;
}) {
  return (
    <div className="rounded-md border px-3 py-2" style={{ borderColor: T.border }}>
      <p className="text-xs" style={{ color: T.textMuted }}>
        {label}
      </p>
      <p
        className="text-2xl font-bold tabular-nums"
        style={{ color: alert ? '#B45309' : T.text, opacity: reliable ? 1 : 0.45 }}
      >
        {value}
      </p>
      <p className="text-xs" style={{ color: T.textMuted }}>
        {footnote}
      </p>
    </div>
  );
}
