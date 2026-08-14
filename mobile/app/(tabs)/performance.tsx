/**
 * Pôle Performance — disponibilité de l'effectif, infirmerie, signaux précoces.
 *
 * Jumeau web : `app/webapp/manager/performance/page.tsx`.
 *
 * La question qu'un coach se pose le plus souvent dans la semaine n'est pas
 * tactique, c'est « qui est dispo samedi ». La réponse était éclatée sur quatre
 * supports : `players.status`, `player_events`, `pain_reports` et la mémoire du
 * kiné. Cet écran est la réponse unique.
 *
 * ## Le point à ne pas rater
 *
 * `player_availability` ne contient QUE les états saisis : un joueur sans ligne
 * est disponible. L'écran croise donc l'effectif complet avec les états, via
 * `resolveRoster`, et jamais l'inverse. Afficher les seules lignes de la table
 * annoncerait « 4 disponibles » sur un effectif de 18.
 *
 * ## Pourquoi ici et pas dans l'onglet Analyse
 *
 * Les segments d'`Analyse` restent montés : une quatrième vue lourde
 * renchérirait chaque ouverture de l'onglet, pour un écran qu'on consulte deux
 * fois par semaine. Il vit donc dans « Plus », comme Partages et Équipes.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, RefreshControl, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';
import { Screen, Section, Card, Text, Badge, EmptyState, SkeletonList } from '../../components/ui';
import { PlayerIdentity } from '../../components/players/PlayerIdentity';
import { AvailabilitySheet } from '../../components/performance/AvailabilitySheet';
import { LoadSection } from '../../components/performance/LoadSection';
import { getPlayersByTeam } from '../../lib/services/players';
import { getUserClubId } from '../../lib/services/clubs';
import {
  getClubAvailability,
  getPainSignals,
} from '../../lib/services/availability';
import { getTrainingLoad, defaultLoadWindow } from '../../lib/services/trainingLoad';
import { buildWeeklyLoads, type WeeklyLoad } from '../../lib/trainingLoad';
import {
  AVAILABILITY_META,
  GROUP_LABELS,
  GROUP_ORDER,
  countByGroup,
  countByStatus,
  daysBetween,
  groupOf,
  infirmary,
  resolveRoster,
  returnLabel,
  sinceLabel,
  PAIN_SIGNAL_DEFAULTS,
  SIDE_LABELS,
  type AvailabilityRow,
  type AvailabilityStatus,
  type AvailabilityTone,
  type PainSignalRow,
  type ResolvedPlayer,
} from '../../lib/availability';
import { zoneLabel } from '../../lib/painMap';
import type { ThemeColors } from '../../lib/design/tokens';
import type { Player } from '../../types';

/**
 * Résolution des tons sur le thème.
 *
 * `injury` prend la teinte de `sessionColor('injured')` et NON `negative` :
 * `components/training/attendance.ts` a tranché ça, « un joueur blessé est une
 * information à traiter et non une erreur ». Seule la suspension est en rouge,
 * c'est le seul statut de la liste qui soit une sanction donc un jugement.
 */
function toneColor(tone: AvailabilityTone, c: ThemeColors): string {
  switch (tone) {
    case 'positive':
      return c.positive.default;
    case 'warning':
      return c.warning.default;
    case 'injury':
      return c.chartSeries[5] ?? c.warning.default;
    case 'negative':
      return c.negative.default;
    default:
      return c.neutralData;
  }
}

/** Ton de `Badge` correspondant. Le badge n'a pas de variante « blessure ». */
function badgeTone(tone: AvailabilityTone): 'positive' | 'warning' | 'negative' | 'neutral' {
  if (tone === 'positive') return 'positive';
  if (tone === 'negative') return 'negative';
  if (tone === 'warning' || tone === 'injury') return 'warning';
  return 'neutral';
}

export default function PerformanceScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { activeTeamId, activeTeam } = useActiveTeam();

  const [clubId, setClubId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rows, setRows] = useState<AvailabilityRow[]>([]);
  const [signals, setSignals] = useState<PainSignalRow[]>([]);
  const [weeks, setWeeks] = useState<WeeklyLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ResolvedPlayer | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const club = clubId ?? (await getUserClubId());
      if (!club) {
        setError('Aucun club rattaché à ce compte.');
        return;
      }
      setClubId(club);

      const range = defaultLoadWindow(12);
      const [roster, current, painSignals, loadRows] = await Promise.all([
        activeTeamId ? getPlayersByTeam(activeTeamId) : Promise.resolve([] as Player[]),
        getClubAvailability(club, activeTeamId || null),
        getPainSignals(club, PAIN_SIGNAL_DEFAULTS.windowDays, PAIN_SIGNAL_DEFAULTS.minReports),
        getTrainingLoad(club, { teamId: activeTeamId || null, from: range.from, to: range.to }),
      ]);
      setPlayers(roster);
      setRows(current);
      setSignals(painSignals);
      setWeeks(buildWeeklyLoads(loadRows));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.');
    }
  }, [clubId, activeTeamId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Le statut se modifie aussi depuis le web et depuis la fiche joueur : on
  // recharge au retour sur l'écran plutôt que de faire confiance à un cache.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const resolved = useMemo(
    () =>
      resolveRoster(
        players.map((p) => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          number: p.number ?? null,
          team_id: p.team_id ?? null,
        })),
        rows,
      ),
    [players, rows],
  );

  const groupCounts = useMemo(() => countByGroup(resolved), [resolved]);
  const statusCounts = useMemo(() => countByStatus(resolved), [resolved]);
  const outList = useMemo(() => infirmary(resolved), [resolved]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <Screen>
        <SkeletonList rows={5} />
      </Screen>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg.canvas }}
        contentContainerStyle={{ padding: theme.space.lg, gap: theme.space.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {error && (
          <Card variant="raised" padding="md">
            <Text variant="body" color={c.negative.default}>
              {error}
            </Text>
          </Card>
        )}

        {!activeTeamId && (
          <Card variant="flat" padding="md">
            <Text variant="caption" tone="tertiary">
              Sélectionne une équipe pour voir la disponibilité de son effectif. Sans équipe
              active, seuls les états déjà saisis s&apos;affichent.
            </Text>
          </Card>
        )}

        {/* ── Bandeau ───────────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
          {GROUP_ORDER.map((group) => {
            const tone =
              group === 'apte' ? 'positive' : group === 'reprise' ? 'warning' : 'injury';
            return (
              <Card key={group} variant="raised" padding="md" style={{ flex: 1 }}>
                <Text variant="display" color={toneColor(tone as AvailabilityTone, c)} numeric>
                  {groupCounts[group]}
                </Text>
                <Text variant="caption" tone="secondary" weight="600">
                  {GROUP_LABELS[group]}
                </Text>
              </Card>
            );
          })}
        </View>

        {/* Le rappel qui évite le contresens le plus probable de l'écran. */}
        <Text variant="caption" tone="tertiary">
          Un joueur sans statut saisi compte comme disponible. {players.length} joueurs dans
          l&apos;effectif{activeTeam ? ` de ${activeTeam.name}` : ''}, {rows.length} avec un état
          enregistré.
        </Text>

        {/* ── Infirmerie ────────────────────────────────────────────────── */}
        <Section title="Infirmerie" subtitle={`${outList.length} joueur${outList.length > 1 ? 's' : ''}`}>
          {outList.length === 0 ? (
            <EmptyState
              icon="medkit-outline"
              title="Aucun joueur indisponible"
              description="Ouvre l'effectif ci-dessous pour déclarer un statut."
              compact
            />
          ) : (
            <View style={{ gap: theme.space.sm }}>
              {outList.map((entry) => {
                const row = entry.row!;
                const meta = AVAILABILITY_META[entry.status];
                return (
                  <Card
                    key={entry.player.id}
                    variant="raised"
                    padding="md"
                    onPress={() => setEditing(entry)}
                    accessibilityLabel={`${entry.player.first_name} ${entry.player.last_name}, ${meta.label}, ${sinceLabel(row.days_out)}, ${returnLabel(row)}`}
                    style={{ gap: theme.space.xs }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <PlayerIdentity
                          firstName={entry.player.first_name}
                          lastName={entry.player.last_name}
                          number={entry.player.number}
                        />
                      </View>
                      <Badge label={meta.label} tone={badgeTone(meta.tone)} size="sm" />
                    </View>
                    <Text variant="caption" tone="tertiary">
                      {sinceLabel(row.days_out)}
                      {row.zone ? ` · ${zoneLabel(row.zone)}` : ''}
                      {row.side && row.side !== 'C' ? ` (${SIDE_LABELS[row.side]})` : ''}
                    </Text>
                    <Text
                      variant="caption"
                      color={
                        row.days_until_return !== null && row.days_until_return < 0
                          ? c.warning.default
                          : c.text.secondary
                      }
                      weight="600"
                    >
                      {returnLabel(row)}
                    </Text>
                    {row.note ? (
                      <Text variant="caption" tone="tertiary">
                        {row.note}
                      </Text>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          )}
        </Section>

        {/* ── Charge et wellness ────────────────────────────────────────── */}
        <Section
          title="Charge d'entraînement"
          subtitle="12 dernières semaines"
        >
          <LoadSection weeks={weeks} />
        </Section>

        {/* ── Signaux précoces ──────────────────────────────────────────── */}
        <Section
          title="Signaux précoces"
          subtitle={`${PAIN_SIGNAL_DEFAULTS.minReports} signalements sur ${PAIN_SIGNAL_DEFAULTS.windowDays} jours`}
        >
          {signals.length === 0 ? (
            <EmptyState
              icon="pulse-outline"
              title="Aucune répétition détectée"
              description="Aucune zone ne dépasse le seuil sur la période."
              compact
            />
          ) : (
            <View style={{ gap: theme.space.sm }}>
              {signals.map((signal) => {
                const span = daysBetween(signal.first_reported, signal.last_reported);
                return (
                  <Card
                    key={`${signal.player_id}:${signal.zone}:${signal.side}`}
                    variant="raised"
                    padding="md"
                    style={{ gap: 2 }}
                  >
                    <Text variant="headline">
                      {signal.first_name} {signal.last_name}
                    </Text>
                    {/* Un fait, jamais un diagnostic : « 4 signalements ischio
                        gauche en 18 jours » se vérifie et ouvre une
                        conversation ; « risque de lésion » est une assertion
                        médicale que personne ici n'est en position de produire. */}
                    <Text variant="caption" tone="secondary">
                      {signal.report_count} signalements {zoneLabel(signal.zone).toLowerCase()}
                      {signal.side !== 'C' ? ` (${SIDE_LABELS[signal.side]})` : ''}
                      {span <= 1 ? ' le même jour' : ` en ${span} jours`}
                    </Text>
                    <Text variant="caption" tone="tertiary" numeric>
                      Intensité moyenne déclarée {signal.avg_intensity.toFixed(1)} sur 3
                    </Text>
                  </Card>
                );
              })}
            </View>
          )}
        </Section>

        {/* ── Effectif ──────────────────────────────────────────────────── */}
        <Section
          title="Effectif"
          subtitle="Appuie sur un joueur pour changer son statut"
          action={
            resolved.length > 8
              ? {
                  label: showAll ? 'Réduire' : 'Tout voir',
                  onPress: () => setShowAll((v) => !v),
                }
              : undefined
          }
        >
          {resolved.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Aucun joueur"
              description="L'équipe active n'a pas d'effectif."
              compact
            />
          ) : (
            <View style={{ gap: theme.space.xs }}>
              {(showAll ? resolved : resolved.slice(0, 8)).map((entry) => {
                const meta = AVAILABILITY_META[entry.status];
                return (
                  <Card
                    key={entry.player.id}
                    variant="flat"
                    padding="sm"
                    onPress={() => setEditing(entry)}
                    accessibilityLabel={`${entry.player.first_name} ${entry.player.last_name}, ${meta.label}. Appuyer pour modifier`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: toneColor(meta.tone, c),
                      }}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <PlayerIdentity
                        firstName={entry.player.first_name}
                        lastName={entry.player.last_name}
                        number={entry.player.number}
                        muted={entry.status === 'disponible'}
                      />
                    </View>
                    <Text variant="caption" color={toneColor(meta.tone, c)} weight="600">
                      {meta.label}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={c.text.tertiary} />
                  </Card>
                );
              })}
            </View>
          )}
        </Section>
      </ScrollView>

      <AvailabilitySheet
        visible={editing !== null}
        player={editing?.player ?? null}
        current={editing?.row ?? null}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
    </>
  );
}
