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
  MIN_RESPONSE_RATE,
  MONOTONY_ELEVATED,
  WELLNESS_LABELS,
  formatLoad,
  formatMonotony,
  formatRate,
  isReliable,
  monotonyHint,
  weekLabel,
  wellnessCarriesJudgement,
  type WeeklyLoad,
  type WellnessKey,
} from '@/lib/trainingLoad';
import { T, INTENSITY_RAMP } from '../theme';

interface LoadPanelProps {
  weeks: WeeklyLoad[];
}

const WELLNESS_ORDER: WellnessKey[] = ['rpe', 'physicalForm', 'pleasure', 'autoEvaluation'];

/**
 * Couleur d'une valeur de wellness sur 10.
 *
 * Le RPE ne prend JAMAIS de couleur sémantique : colorer un effort ressenti
 * élevé en rouge pousse le joueur à sous-déclarer pour éviter le rouge, et
 * détruit la donnée qu'on cherche à récolter.
 */
function wellnessColor(key: WellnessKey, value: number): string {
  if (!wellnessCarriesJudgement(key)) return T.textMuted;
  if (value < 4) return '#B91C1C';
  if (value < 6.5) return '#B45309';
  return '#15803D';
}

export default function LoadPanel({ weeks }: LoadPanelProps) {
  const recent = useMemo(() => weeks.slice(-8), [weeks]);

  const maxLoad = useMemo(
    () => Math.max(1, ...recent.map((w) => w.load ?? 0)),
    [recent],
  );

  const current = recent.length > 0 ? recent[recent.length - 1] : null;

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
      <div className="mb-2 flex items-end gap-2" style={{ height: 120 }}>
        {recent.map((week) => {
          const height = week.load !== null ? Math.max(4, (week.load / maxLoad) * 100) : 4;
          const reliable = isReliable(week.responseRate);
          return (
            <div key={week.weekStart} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] tabular-nums" style={{ color: T.textMuted }}>
                {week.load !== null ? formatLoad(week.load) : ''}
              </span>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${height}%`,
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
            </div>
          );
        })}
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
              return (
                <div
                  key={key}
                  className="rounded-md border px-3 py-2"
                  style={{ borderColor: T.border }}
                >
                  <p className="text-xs" style={{ color: T.textMuted }}>
                    {WELLNESS_LABELS[key]}
                  </p>
                  <p
                    className="text-xl font-semibold tabular-nums"
                    style={{
                      color: value === null ? T.textMuted : wellnessColor(key, value),
                      opacity: isReliable(current.responseRate) ? 1 : 0.45,
                    }}
                  >
                    {value === null ? '—' : value.toFixed(1)}
                    <span className="text-xs font-normal" style={{ color: T.textMuted }}>
                      {value === null ? '' : ' / 10'}
                    </span>
                  </p>
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
