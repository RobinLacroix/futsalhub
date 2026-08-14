/**
 * Charge d'entraînement et wellness — section mobile de la page Performance.
 *
 * Jumelle web : `app/webapp/manager/performance/components/LoadPanel.tsx`.
 *
 * ## La couverture voyage avec le chiffre, toujours
 *
 * Une charge hebdomadaire calculée sur 40 % de réponses est un chiffre faux
 * présenté comme vrai. Chaque semaine affiche son taux de réponse, et sous 60 %
 * la valeur est atténuée avec la mention explicite. C'est la règle qui empêche
 * cette section de produire de la fausse confiance, ce qui serait pire que de ne
 * rien afficher.
 *
 * ## Une charge est une mesure, pas une note
 *
 * Les barres prennent l'accent, jamais la rampe vert-orange-rouge. Seul le PIC
 * passe en `warning` : un joueur qui encaisse une grosse semaine n'a rien fait
 * de mal, c'est une information à traiter. Même raisonnement que le RPE et que
 * les intensités de douleur ailleurs dans l'application.
 *
 * Le wellness porte un jugement assumé — c'est déjà la classification du
 * questionnaire côté joueur — sauf le RPE, qui reste une mesure.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Text, Card, EmptyState } from '../ui';
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
} from '../../lib/trainingLoad';
import type { ThemeColors } from '../../lib/design/tokens';

const WELLNESS_ORDER: WellnessKey[] = ['rpe', 'physicalForm', 'pleasure', 'autoEvaluation'];

/**
 * Bande de lecture : couleur + libellé. Le RPE ne prend JAMAIS de couleur
 * sémantique (rampe indigo monochrome) — voir l'en-tête du fichier.
 */
function wellnessBand(
  key: WellnessKey,
  value: number,
  c: ThemeColors,
): { label: string; color: string } {
  if (!wellnessCarriesJudgement(key)) {
    const band = rpeBand(value);
    return { label: RPE_BAND_LABELS[band], color: RPE_BAND_RAMP[band] };
  }
  const band = judgementBand(value);
  const color =
    band === 'bon' ? c.positive.default : band === 'moyen' ? c.warning.default : c.negative.default;
  return { label: JUDGEMENT_BAND_LABELS[band], color };
}

export interface LoadSectionProps {
  weeks: WeeklyLoad[];
}

/** Hauteur, en pixels, réservée aux barres + à la bande cible. */
const CHART_HEIGHT = 96;
/** Repères de graduation, en fraction de l'échelle. Sobres : une échelle, pas un quadrillage. */
const GRIDLINE_RATIOS = [0.25, 0.5, 0.75];

export function LoadSection({ weeks }: LoadSectionProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const recent = useMemo(() => weeks.slice(-6), [weeks]);
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
      <EmptyState
        icon="barbell-outline"
        title="Aucune charge calculable"
        description="La charge se calcule à partir du RPE des questionnaires et de la durée de séance."
        compact
      />
    );
  }

  const reliable = current ? isReliable(current.responseRate) : false;

  return (
    <View style={{ gap: theme.space.md }}>
      {current && (
        <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
          <Metric
            label="Charge"
            value={formatLoad(current.load)}
            footnote={`${current.sessions} séance${current.sessions > 1 ? 's' : ''}`}
            reliable={reliable}
          />
          <Metric
            label="Monotonie"
            value={formatMonotony(current.monotony)}
            footnote={formatRate(current.responseRate) + ' de réponses'}
            reliable={reliable}
            alert={current.monotony !== null && current.monotony >= MONOTONY_ELEVATED}
          />
          <Metric
            label="Contrainte"
            value={formatLoad(current.strain)}
            footnote="Charge × monotonie"
            reliable={reliable}
          />
        </View>
      )}

      {/* ── Histogramme ──────────────────────────────────────────────────── */}
      <Card variant="raised" padding="md" style={{ gap: theme.space.sm }}>
        <Text variant="caption" tone="tertiary">
          RPE × durée (Foster), unités arbitraires
        </Text>
        <View style={{ height: CHART_HEIGHT }}>
          {/* Graduation légère : une échelle de lecture, pas un jugement. */}
          {GRIDLINE_RATIOS.map((ratio) => (
            <View
              key={ratio}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: ratio * CHART_HEIGHT,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderColor: c.border.subtle,
              }}
            >
              <Text
                variant="caption"
                tone="tertiary"
                style={{ position: 'absolute', left: 0, bottom: 2, fontSize: 9, opacity: 0.7 }}
              >
                {formatLoad(ratio * maxScale)}
              </Text>
            </View>
          ))}

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: '100%' }}>
            {recent.map((week) => {
              const barPx = week.load !== null ? Math.max(4, (week.load / maxScale) * CHART_HEIGHT) : 4;
              const targetTopPx =
                week.targetLoadMax !== null ? (week.targetLoadMax / maxScale) * CHART_HEIGHT : null;
              const targetBottomPx =
                week.targetLoadMin !== null ? (week.targetLoadMin / maxScale) * CHART_HEIGHT : null;
              const weekReliable = isReliable(week.responseRate);
              return (
                <View
                  key={week.weekStart}
                  style={{ flex: 1, height: '100%' }}
                  accessible
                  accessibilityLabel={`${weekLabel(week.weekStart)} : ${formatLoad(week.load)}, ${formatRate(week.responseRate)} de réponses${week.isPeak ? ', pic de charge' : ''}${weekReliable ? '' : ', couverture insuffisante'}`}
                >
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: barPx,
                      borderRadius: theme.radius.sm,
                      // Accent et non rampe sémantique : une charge n'est ni bonne
                      // ni mauvaise. Seul le pic se signale, en warning.
                      backgroundColor:
                        week.load === null
                          ? c.border.subtle
                          : week.isPeak
                            ? c.warning.default
                            : c.accent.default,
                      opacity: weekReliable ? 1 : 0.35,
                    }}
                  />
                  {/* Rendue APRÈS la barre : sinon une charge réalisée haute
                      cache entièrement le pourtour de la bande cible en dessous. */}
                  {targetTopPx !== null && targetBottomPx !== null && (
                    <View
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: targetBottomPx,
                        height: Math.max(2, targetTopPx - targetBottomPx),
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderColor: 'rgba(100,116,139,0.55)',
                        borderRadius: theme.radius.sm,
                      }}
                    />
                  )}
                </View>
              );
            })}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {recent.map((week) => (
            <Text
              key={week.weekStart}
              variant="caption"
              tone="tertiary"
              style={{ flex: 1, textAlign: 'center' }}
              numberOfLines={1}
            >
              {weekLabel(week.weekStart).replace('sem. du ', '')}
            </Text>
          ))}
        </View>
      </Card>

      {recent.some((w) => w.isPeak) && (
        <Card variant="flat" padding="md">
          <Text variant="caption" color={c.warning.default} weight="600">
            Pic de charge : plus de 1,5 fois la moyenne des 4 semaines précédentes. À rapprocher
            des signalements de douleur de la même période.
          </Text>
        </Card>
      )}

      {recent.some((w) => !isReliable(w.responseRate)) && (
        <Text variant="caption" tone="tertiary">
          Les barres pâles sont calculées sur moins de {Math.round(MIN_RESPONSE_RATE * 100)} % de
          réponses au questionnaire. Le chiffre existe, mais il ne représente pas le groupe.
        </Text>
      )}

      {/* ── Wellness ─────────────────────────────────────────────────────── */}
      {current && (
        <Card variant="raised" padding="md" style={{ gap: theme.space.sm }}>
          <Text variant="headline">Ressenti de la semaine</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
            {WELLNESS_ORDER.map((key) => {
              const value = current.wellness[key];
              const band = value !== null ? wellnessBand(key, value, c) : null;
              const delta = wellnessDelta(current, previous, key);
              return (
                <View
                  key={key}
                  style={{ flexBasis: '47%', flexGrow: 1, gap: 4 }}
                  accessible
                  accessibilityLabel={`${WELLNESS_LABELS[key]} : ${value === null ? 'non renseigné' : `${value.toFixed(1)} sur 10, ${band?.label}`}`}
                >
                  <Text variant="caption" tone="tertiary">
                    {WELLNESS_LABELS[key]}
                  </Text>
                  <Text
                    variant="display"
                    color={band ? band.color : c.text.tertiary}
                    numeric
                    style={{ opacity: reliable ? 1 : 0.45 }}
                  >
                    {value === null ? '—' : `${value.toFixed(1)}`}
                    {value !== null && (
                      <Text variant="caption" tone="tertiary">
                        {' '}
                        /10
                      </Text>
                    )}
                    {delta !== null && (
                      <Text variant="caption" tone="tertiary" weight="600">
                        {' '}
                        {formatDelta(delta)}
                      </Text>
                    )}
                  </Text>
                  {band && (
                    <>
                      <View
                        style={{
                          alignSelf: 'flex-start',
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          backgroundColor: band.color + '1a',
                          opacity: reliable ? 1 : 0.45,
                        }}
                      >
                        <Text variant="caption" weight="600" style={{ color: band.color }}>
                          {band.label}
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: c.border.subtle,
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            height: '100%',
                            width: `${Math.min(100, (value! / 10) * 100)}%`,
                            borderRadius: 3,
                            backgroundColor: band.color,
                            opacity: reliable ? 1 : 0.45,
                          }}
                        />
                      </View>
                    </>
                  )}
                </View>
              );
            })}
          </View>
          {!reliable && (
            <Text variant="caption" tone="tertiary">
              Calculé sur {formatRate(current.responseRate)} de réponses : à lire avec prudence.
            </Text>
          )}
        </Card>
      )}
    </View>
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
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <Card
      variant="raised"
      padding="md"
      style={{ flex: 1 }}
      accessibilityLabel={`${label} : ${value}. ${footnote}`}
    >
      <Text variant="caption" tone="tertiary" numberOfLines={1}>
        {label}
      </Text>
      <Text
        variant="title"
        color={alert ? c.warning.default : c.text.primary}
        numeric
        style={{ opacity: reliable ? 1 : 0.45 }}
      >
        {value}
      </Text>
      <Text variant="caption" tone="tertiary" numberOfLines={2}>
        {footnote}
      </Text>
    </Card>
  );
}
