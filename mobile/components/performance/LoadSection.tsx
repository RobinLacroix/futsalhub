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
import { View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Text, Card, EmptyState } from '../ui';
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
} from '../../lib/trainingLoad';
import type { ThemeColors } from '../../lib/design/tokens';

const WELLNESS_ORDER: WellnessKey[] = ['rpe', 'physicalForm', 'pleasure', 'autoEvaluation'];

/** Le RPE ne prend JAMAIS de couleur sémantique. Voir l'en-tête. */
function wellnessColor(key: WellnessKey, value: number, c: ThemeColors): string {
  if (!wellnessCarriesJudgement(key)) return c.text.secondary;
  if (value < 4) return c.negative.default;
  if (value < 6.5) return c.warning.default;
  return c.positive.default;
}

export interface LoadSectionProps {
  weeks: WeeklyLoad[];
}

export function LoadSection({ weeks }: LoadSectionProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const recent = useMemo(() => weeks.slice(-6), [weeks]);
  const maxLoad = useMemo(() => Math.max(1, ...recent.map((w) => w.load ?? 0)), [recent]);
  const current = recent.length > 0 ? recent[recent.length - 1] : null;

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
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 96 }}>
          {recent.map((week) => {
            const ratio = week.load !== null ? Math.max(0.04, week.load / maxLoad) : 0.04;
            const weekReliable = isReliable(week.responseRate);
            return (
              <View
                key={week.weekStart}
                style={{ flex: 1, justifyContent: 'flex-end' }}
                accessible
                accessibilityLabel={`${weekLabel(week.weekStart)} : ${formatLoad(week.load)}, ${formatRate(week.responseRate)} de réponses${week.isPeak ? ', pic de charge' : ''}${weekReliable ? '' : ', couverture insuffisante'}`}
              >
                <View
                  style={{
                    height: `${ratio * 100}%`,
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
              </View>
            );
          })}
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
              return (
                <View
                  key={key}
                  style={{ flexBasis: '47%', flexGrow: 1 }}
                  accessible
                  accessibilityLabel={`${WELLNESS_LABELS[key]} : ${value === null ? 'non renseigné' : `${value.toFixed(1)} sur 10`}`}
                >
                  <Text variant="caption" tone="tertiary">
                    {WELLNESS_LABELS[key]}
                  </Text>
                  <Text
                    variant="title"
                    color={value === null ? c.text.tertiary : wellnessColor(key, value, c)}
                    numeric
                    style={{ opacity: reliable ? 1 : 0.45 }}
                  >
                    {value === null ? '—' : `${value.toFixed(1)}`}
                    {value !== null && (
                      <Text variant="caption" tone="tertiary">
                        {' '}
                        / 10
                      </Text>
                    )}
                  </Text>
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
