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
import { View, Pressable } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { useIsTablet } from '../../hooks/useIsTablet';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';
import { useActiveSeason } from '../../contexts/ActiveSeasonContext';
import { haptics } from '../../lib/design/haptics';
import { Screen, Section, Card, Text, Badge, Button, EmptyState, SkeletonList, ChipGroup, type ChipOption } from '../../components/ui';
import { PlayerIdentity } from '../../components/players/PlayerIdentity';
import { POSITIONS } from '../../components/players/positions';
import { AvailabilitySheet } from '../../components/performance/AvailabilitySheet';
import { PlayerPickerSheet } from '../../components/performance/PlayerPickerSheet';
import { LoadSection } from '../../components/performance/LoadSection';
import { LoadMatrixSection } from '../../components/performance/LoadMatrixSection';
import { TestOverviewSection } from '../../components/performance/TestOverviewSection';
import { getPlayersByTeam } from '../../lib/services/players';
import { getUserClubId } from '../../lib/services/clubs';
import {
  getClubAvailability,
  getPainSignals,
  getPlayerAvailabilityHistory,
} from '../../lib/services/availability';
import { getClubPainReports } from '../../lib/services/painReports';
import {
  getTrainingLoad,
  getPlayerTrainingLoad,
  getTeamTrainingLoadMatrix,
} from '../../lib/services/trainingLoad';
import { seasonDateRange } from '../../lib/utils/season';
import {
  getTestTypes,
  getSessions as getTestSessions,
  getSquadRetainedResults,
} from '../../lib/services/physicalTests';
import { buildWeeklyLoads, type MatrixRow, type TrainingLoadRow, type WeeklyLoad } from '../../lib/trainingLoad';
import type { PhysicalTestResult, PhysicalTestSession, PhysicalTestType } from '../../lib/physicalTests';
import {
  AVAILABILITY_META,
  GROUP_LABELS,
  GROUP_ORDER,
  countByGroup,
  countByStatus,
  daysBetween,
  groupOf,
  infirmary,
  recurrenceCount,
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
import type { ClubPainReportGroup, Player } from '../../types';

type PerformanceTab = 'infirmerie' | 'charge' | 'tests';

/**
 * Onglets de section, au style de la barre principale d'Analyse
 * (`AnalyticsView.tsx`, `mainTabBar`/`mainTabItem`) : piste sombre, segments
 * égaux, icône + libellé. Pas de `ChipGroup` ici — le style demandé (piste
 * pleine largeur, segments actifs surélevés) n'est pas celui de ce composant
 * partagé, qui reste par ailleurs le bon choix pour la catégorie de tests
 * plus bas, un sous-filtre secondaire.
 */
const SECTION_TABS: readonly {
  value: PerformanceTab;
  label: string;
  icon: 'medkit-outline' | 'barbell-outline' | 'stopwatch-outline';
}[] = [
  { value: 'infirmerie', label: 'Infirmerie', icon: 'medkit-outline' },
  { value: 'charge', label: "Charge d'entraînement", icon: 'barbell-outline' },
  { value: 'tests', label: 'Tests physiques', icon: 'stopwatch-outline' },
];

/** Charge : vue d'équipe (agrégée) ou d'un joueur (son RPE, pas une moyenne). */
type LoadScope = 'equipe' | 'joueur';

const LOAD_SCOPE_CHIPS: readonly ChipOption<LoadScope>[] = [
  { value: 'equipe', label: 'Équipe' },
  { value: 'joueur', label: 'Joueur' },
];

/** 'questionnaire' recouvre fin de séance ET fin de match : `match_id` tranche. */
function sourceLabel(report: { source: 'questionnaire' | 'spontane'; match_id: string | null }): string {
  if (report.source !== 'questionnaire') return 'Spontané';
  return report.match_id ? 'Fin de match' : 'Fin de séance';
}

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

/**
 * Extraction des quatre panneaux de l'onglet Infirmerie en composants : le
 * rendu tablette les pose en deux colonnes, le rendu téléphone les empile.
 * Sans extraction, la même liste de cartes existerait deux fois dans le JSX.
 */

function InfirmarySection({
  outList,
  recurrence,
  onEdit,
  onViewLoad,
}: {
  outList: ResolvedPlayer[];
  recurrence: Record<string, number>;
  onEdit: (entry: ResolvedPlayer) => void;
  onViewLoad: (playerId: string) => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
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
                onPress={() => onEdit(entry)}
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
                {row.zone && recurrence[entry.player.id] >= 2 && (
                  <Text variant="caption" weight="600" color={c.warning.default}>
                    {recurrence[entry.player.id]}ᵉ épisode {zoneLabel(row.zone).toLowerCase()}
                    {row.side && row.side !== 'C' ? ` ${SIDE_LABELS[row.side]}` : ''} en 12 mois
                  </Text>
                )}
                {row.note ? (
                  <Text variant="caption" tone="tertiary">
                    {row.note}
                  </Text>
                ) : null}
                <Button
                  label="Voir sa charge"
                  icon="trending-up-outline"
                  variant="ghost"
                  size="sm"
                  onPress={() => onViewLoad(entry.player.id)}
                />
              </Card>
            );
          })}
        </View>
      )}
    </Section>
  );
}

function SignalsSection({ signals }: { signals: PainSignalRow[] }) {
  const { theme } = useTheme();
  return (
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
  );
}

function ReportsSection({
  reports,
  onOpenPlayer,
}: {
  reports: ClubPainReportGroup[];
  onOpenPlayer: (playerId: string) => void;
}) {
  const { theme } = useTheme();
  return (
    <Section
      title="Déclarations des joueurs"
      subtitle={`${reports.length} récente${reports.length > 1 ? 's' : ''} · 7 derniers jours`}
    >
      {reports.length === 0 ? (
        <EmptyState
          icon="body-outline"
          title="Aucune déclaration récente"
          description="Les signalements de douleur des 7 derniers jours apparaîtront ici."
          compact
        />
      ) : (
        <View style={{ gap: theme.space.sm }}>
          {reports.map((report) => (
            <Card
              key={report.report_group}
              variant="raised"
              padding="md"
              onPress={() => onOpenPlayer(report.player_id)}
              style={{ gap: 2 }}
            >
              <PlayerIdentity
                firstName={report.first_name}
                lastName={report.last_name}
                number={report.number}
              />
              <Text variant="caption" tone="secondary">
                {report.zones
                  .map(
                    (z) =>
                      `${zoneLabel(z.zone)}${z.side !== 'C' ? ` (${SIDE_LABELS[z.side]})` : ''}`,
                  )
                  .join(', ')}
              </Text>
              <Text variant="caption" tone="tertiary">
                {sourceLabel(report)} · {fmtDateTime(report.reported_at)}
                {report.onset ? ` · ${ONSET_LABELS[report.onset]}` : ''}
                {' · '}Intensité max {report.max_intensity}/10
              </Text>
              {report.note ? (
                <Text variant="caption" tone="tertiary">
                  {report.note}
                </Text>
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Section>
  );
}

/**
 * Effectif complet, toujours affiché : le toggle Tout voir/Réduire masquait
 * une partie du groupe par défaut, ce qui contredit l'usage réel de l'écran —
 * un coach y vient justement pour balayer tout le monde d'un regard.
 *
 * La grille (au lieu d'une colonne de lignes pleine largeur) est ce qui rend
 * ça tenable sans scroll interminable : 2 cartes par rangée sur téléphone,
 * 3 sur tablette, chaque rangée occupant toute la largeur disponible.
 */
function EffectifGrid({
  resolved,
  isTablet,
  onEdit,
}: {
  resolved: ResolvedPlayer[];
  isTablet: boolean;
  onEdit: (entry: ResolvedPlayer) => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <Section title="Effectif" subtitle="Appuie sur un joueur pour changer son statut">
      {resolved.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="Aucun joueur"
          description="L'équipe active n'a pas d'effectif."
          compact
        />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
          {resolved.map((entry) => {
            const meta = AVAILABILITY_META[entry.status];
            return (
              <Card
                key={entry.player.id}
                variant="flat"
                padding="sm"
                onPress={() => onEdit(entry)}
                accessibilityLabel={`${entry.player.first_name} ${entry.player.last_name}, ${meta.label}. Appuyer pour modifier`}
                style={{
                  flexBasis: isTablet ? '31%' : '47%',
                  flexGrow: 1,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
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
                </View>
                <Text variant="caption" color={toneColor(meta.tone, c)} weight="600">
                  {meta.label}
                </Text>
              </Card>
            );
          })}
        </View>
      )}
    </Section>
  );
}

export default function PerformanceScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const isTablet = useIsTablet();
  const router = useRouter();
  const { activeTeamId, activeTeam } = useActiveTeam();
  const { activeSeason, clubSeason } = useActiveSeason();
  // Raccourci depuis Analyse > Séance : ?tab=charge ouvre directement l'onglet.
  const params = useLocalSearchParams<{ tab?: string }>();

  const [clubId, setClubId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rows, setRows] = useState<AvailabilityRow[]>([]);
  const [signals, setSignals] = useState<PainSignalRow[]>([]);
  const [reports, setReports] = useState<ClubPainReportGroup[]>([]);
  const [weeks, setWeeks] = useState<WeeklyLoad[]>([]);
  // Séances brutes de la même fenêtre que `weeks` : l'histogramme RPE × durée
  // de `LoadSection` lit séance par séance, la monotonie/contrainte restent
  // hebdomadaires — les deux formes cohabitent, voir `lib/trainingLoad.ts`.
  const [loadRows, setLoadRows] = useState<TrainingLoadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ResolvedPlayer | null>(null);
  // Filtre par poste : demandé par le préparateur physique pour sortir les
  // gardiens (poste à part) de la moyenne RPE/tests. Vide = tous les postes.
  const [positionFilter, setPositionFilter] = useState<string[]>([]);
  const [tab, setTab] = useState<PerformanceTab>(
    (['infirmerie', 'charge', 'tests'] as const).includes(params.tab as PerformanceTab)
      ? (params.tab as PerformanceTab)
      : 'infirmerie',
  );

  // Charge : équipe (agrégée, `weeks`/`sessions` ci-dessus) ou un joueur — même
  // moteur de calcul (`buildWeeklyLoads`), deux sources de données.
  const [loadScope, setLoadScope] = useState<LoadScope>('equipe');
  const [loadPlayerId, setLoadPlayerId] = useState<string>('');
  const [playerWeeks, setPlayerWeeks] = useState<WeeklyLoad[]>([]);
  const [playerLoadRows, setPlayerLoadRows] = useState<TrainingLoadRow[]>([]);
  const [loadingPlayerLoad, setLoadingPlayerLoad] = useState(false);
  const [playerSheetOpen, setPlayerSheetOpen] = useState(false);
  const [matrixRows, setMatrixRows] = useState<MatrixRow[]>([]);
  // Récidive : nombre d'épisodes passés sur la même zone/côté, par joueur en infirmerie.
  const [recurrence, setRecurrence] = useState<Record<string, number>>({});

  // Tests physiques : catalogue + campagnes + résultats retenus de la saison
  // affichée. `TestOverviewSection` fait tout l'assemblage.
  const [testTypes, setTestTypes] = useState<PhysicalTestType[]>([]);
  const [testSessions, setTestSessions] = useState<PhysicalTestSession[]>([]);
  const [testResults, setTestResults] = useState<PhysicalTestResult[]>([]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const club = clubId ?? (await getUserClubId());
      if (!club) {
        setError('Aucun club rattaché à ce compte.');
        return;
      }
      setClubId(club);

      // Charge et wellness ne doivent montrer que la saison choisie, pas une
      // fenêtre glissante indifférente au sélecteur : sinon, choisir une
      // saison passée continuait d'afficher les 12 dernières semaines réelles.
      const range = seasonDateRange(activeSeason);
      const [roster, current, painSignals, loadRows] = await Promise.all([
        activeTeamId ? getPlayersByTeam(activeTeamId) : Promise.resolve([] as Player[]),
        getClubAvailability(club, activeTeamId || null),
        getPainSignals(
          club,
          PAIN_SIGNAL_DEFAULTS.windowDays,
          PAIN_SIGNAL_DEFAULTS.minReports,
          activeTeamId || null,
        ),
        getTrainingLoad(club, {
          teamId: activeTeamId || null,
          from: range.from,
          to: range.to,
          positions: positionFilter.length ? positionFilter : null,
        }),
      ]);
      setPlayers(roster);
      setRows(current);
      setSignals(painSignals);
      setWeeks(buildWeeklyLoads(loadRows));
      setLoadRows(loadRows);

      // Isolé du Promise.all ci-dessus : une déclaration en échec ne doit
      // jamais faire disparaître l'effectif ni la disponibilité.
      try {
        setReports(await getClubPainReports(club, activeTeamId || null));
      } catch {
        setReports([]);
      }
    } catch (e) {
      // Le message générique masquait les erreurs Postgrest réelles (accès
      // refusé, contrainte SQL...) : PostgrestError n'étend pas `Error`, donc
      // `e instanceof Error` était systématiquement faux ici.
      const detail = (e as { message?: unknown } | null)?.message;
      console.error('[performance] échec de chargement', e);
      setError(typeof detail === 'string' && detail ? detail : 'Chargement impossible.');
    }
  }, [clubId, activeTeamId, activeSeason, positionFilter]);

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

  // Matrice par joueur : exige une équipe (la RPC scope sur l'effectif d'une
  // équipe précise, pas sur le club entier).
  useEffect(() => {
    if (!clubId || !activeTeamId) {
      setMatrixRows([]);
      return;
    }
    let cancelled = false;
    const range = seasonDateRange(activeSeason);
    getTeamTrainingLoadMatrix(clubId, activeTeamId, 5, { from: range.from, to: range.to })
      .then((loadRows) => {
        if (!cancelled) setMatrixRows(loadRows);
      })
      .catch(() => {
        if (!cancelled) setMatrixRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId, activeTeamId, activeSeason]);

  // Tests physiques : catalogue puis campagnes de la saison affichée puis
  // leurs résultats retenus — séquentiel, le deuxième et le troisième appel
  // dépendent du premier.
  useEffect(() => {
    if (!clubId) {
      setTestTypes([]);
      setTestSessions([]);
      setTestResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const types = await getTestTypes(clubId);
        const sessions = await getTestSessions(clubId, {
          teamId: activeTeamId || null,
          season: activeSeason,
        });
        const results = await getSquadRetainedResults(
          sessions.map((s) => s.id),
          types.map((t) => t.id),
        );
        if (cancelled) return;
        setTestTypes(types);
        setTestSessions(sessions);
        setTestResults(results);
      } catch {
        if (!cancelled) {
          setTestTypes([]);
          setTestSessions([]);
          setTestResults([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId, activeTeamId, activeSeason]);

  // Charge individuelle : ne se charge que si l'onglet Joueur est actif et
  // qu'un joueur est choisi — pas de RPC à chaque ouverture de l'écran.
  useEffect(() => {
    if (loadScope !== 'joueur' || !loadPlayerId) return;
    let cancelled = false;
    setLoadingPlayerLoad(true);
    const range = seasonDateRange(activeSeason);
    getPlayerTrainingLoad(loadPlayerId, { from: range.from, to: range.to })
      .then((loadRows) => {
        if (cancelled) return;
        setPlayerWeeks(buildWeeklyLoads(loadRows));
        setPlayerLoadRows(loadRows);
      })
      .catch(() => {
        if (!cancelled) {
          setPlayerWeeks([]);
          setPlayerLoadRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPlayerLoad(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadScope, loadPlayerId, activeSeason]);

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

  const loadPlayer = useMemo(
    () => players.find((p) => p.id === loadPlayerId) ?? null,
    [players, loadPlayerId],
  );

  // Joueurs retenus par le filtre de poste. `null` = aucun filtre actif.
  const filteredPlayerIds = useMemo(() => {
    if (positionFilter.length === 0) return null;
    return new Set(players.filter((p) => positionFilter.includes(p.position)).map((p) => p.id));
  }, [players, positionFilter]);

  // `LoadMatrixSection` recalcule sa propre moyenne équipe à partir des lignes
  // reçues : filtrer l'entrée suffit.
  const filteredMatrixRows = useMemo(
    () => (filteredPlayerIds ? matrixRows.filter((r) => filteredPlayerIds.has(r.player_id)) : matrixRows),
    [matrixRows, filteredPlayerIds],
  );

  // `TestOverviewSection` construit sa moyenne équipe à partir de `results`
  // (pas de `players`) : les deux doivent être filtrés pour rester cohérents.
  const filteredTestResults = useMemo(
    () => (filteredPlayerIds ? testResults.filter((r) => filteredPlayerIds.has(r.player_id)) : testResults),
    [testResults, filteredPlayerIds],
  );
  const filteredTestPlayers = useMemo(
    () => (filteredPlayerIds ? players.filter((p) => filteredPlayerIds.has(p.id)) : players),
    [players, filteredPlayerIds],
  );

  const groupCounts = useMemo(() => countByGroup(resolved), [resolved]);
  const statusCounts = useMemo(() => countByStatus(resolved), [resolved]);
  const outList = useMemo(() => infirmary(resolved), [resolved]);
  // Le fil de déclarations n'a de valeur que récent : au-delà d'une semaine, une
  // douleur signalée est soit résolue soit déjà remontée en infirmerie — la
  // garder ici ne ferait qu'allonger la liste sans rien dire de la semaine en cours.
  const recentReports = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return reports.filter((r) => new Date(r.reported_at).getTime() >= cutoff);
  }, [reports]);
  // Retard de retour : le signal le plus actionnable de l'écran, mais jusqu'ici
  // enterré dans le texte de chaque carte Infirmerie — jamais compté nulle part.
  const lateReturns = useMemo(
    () => outList.filter((e) => (e.row?.days_until_return ?? 0) < 0).length,
    [outList],
  );

  // Récidive : un épisode isolé n'a rien à signaler, un 2e sur la même zone en
  // a. Une RPC par joueur en infirmerie avec zone renseignée — l'infirmerie
  // compte des unités, jamais des dizaines, l'appel N+1 est sans conséquence.
  useEffect(() => {
    const withZone = outList.filter((entry) => entry.row?.zone);
    if (withZone.length === 0) {
      setRecurrence({});
      return;
    }
    let cancelled = false;
    const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    Promise.all(
      withZone.map((entry) =>
        getPlayerAvailabilityHistory(entry.player.id, from)
          .then(
            (history) =>
              [entry.player.id, recurrenceCount(history, entry.row!.zone!, entry.row!.side ?? 'C')] as const,
          )
          .catch(() => [entry.player.id, 0] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) setRecurrence(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [outList]);

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
      <Screen
        onRefresh={handleRefresh}
        refreshing={refreshing}
        contentContainerStyle={{ gap: theme.space.lg }}
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

        {/* ── Onglets ───────────────────────────────────────────────────── */}
        <View
          style={{
            flexDirection: 'row',
            borderRadius: theme.radius.md,
            padding: 3,
            gap: 2,
            backgroundColor: c.bg.sunken,
          }}
          accessibilityRole="tablist"
        >
          {SECTION_TABS.map((t) => {
            const active = tab === t.value;
            return (
              <Pressable
                key={t.value}
                onPress={() => {
                  if (active) return;
                  haptics.select();
                  setTab(t.value);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t.label}
                style={{
                  flex: 1,
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  minHeight: 52,
                  paddingVertical: 6,
                  borderRadius: theme.radius.sm,
                  borderWidth: 1,
                  borderColor: active ? c.border.subtle : 'transparent',
                  backgroundColor: active ? c.bg.surface : 'transparent',
                }}
              >
                <Ionicons name={t.icon} size={16} color={active ? c.accent.default : c.text.secondary} />
                <Text
                  variant="caption"
                  weight="600"
                  tone={active ? 'accent' : 'secondary'}
                  numberOfLines={2}
                  style={{ textAlign: 'center', fontSize: 11, lineHeight: 13 }}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {(tab === 'charge' || tab === 'tests') && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.space.xs }}>
            <Text variant="caption" tone="tertiary">Postes</Text>
            {POSITIONS.map(({ key, label }) => {
              const active = positionFilter.includes(key);
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    haptics.select();
                    setPositionFilter((prev) =>
                      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
                    );
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Filtrer sur le poste ${label}`}
                  style={{
                    paddingHorizontal: theme.space.md,
                    paddingVertical: 6,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    borderColor: active ? c.accent.default : c.border.subtle,
                    backgroundColor: active ? c.accent.fill : c.bg.surface,
                  }}
                >
                  <Text variant="caption" weight="600" tone={active ? 'onFill' : 'secondary'}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
            {positionFilter.length > 0 && (
              <Pressable onPress={() => setPositionFilter([])} accessibilityRole="button">
                <Text variant="caption" tone="tertiary" style={{ textDecorationLine: 'underline' }}>
                  Réinitialiser
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {tab === 'infirmerie' && (
          <>
            {/* ── Bandeau ─────────────────────────────────────────────────── */}
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

            {/* Ce qui demande une action cette semaine, pas juste un état — le
                reste de l'écran détaille, cette ligne priorise. */}
            {(lateReturns > 0 || signals.length > 0) && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xs }}>
                {lateReturns > 0 && (
                  <Badge
                    icon="time-outline"
                    tone="warning"
                    label={`${lateReturns} retour${lateReturns > 1 ? 's' : ''} en retard`}
                  />
                )}
                {signals.length > 0 && (
                  <Badge
                    icon="pulse-outline"
                    tone="negative"
                    label={`${signals.length} signal${signals.length > 1 ? 'aux' : ''} précoce${signals.length > 1 ? 's' : ''}`}
                  />
                )}
              </View>
            )}

            {/* Le rappel qui évite le contresens le plus probable de l'écran. */}
            <Text variant="caption" tone="tertiary">
              Un joueur sans statut saisi compte comme disponible. {players.length} joueurs dans
              l&apos;effectif{activeTeam ? ` de ${activeTeam.name}` : ''}, {rows.length} avec un
              état enregistré.
            </Text>

            {/* ── Infirmerie · Signaux · Déclarations ─────────────────────────
                Sur tablette, deux colonnes côte à côte au lieu d'un empilement
                vertical : c'est ce qui donne l'aspect dashboard et évite de
                scroller trois écrans pour un point qu'on consulte en 30 s. */}
            {isTablet ? (
              <View style={{ flexDirection: 'row', gap: theme.space.lg, alignItems: 'flex-start' }}>
                <View style={{ flex: 3, minWidth: 0 }}>
                  <InfirmarySection
                    outList={outList}
                    recurrence={recurrence}
                    onEdit={setEditing}
                    onViewLoad={(playerId) => {
                      setTab('charge');
                      setLoadScope('joueur');
                      setLoadPlayerId(playerId);
                    }}
                  />
                </View>
                <View style={{ flex: 2, minWidth: 0, gap: theme.space.lg }}>
                  <SignalsSection signals={signals} />
                  <ReportsSection
                    reports={recentReports}
                    onOpenPlayer={(playerId) => router.push(`/(tabs)/squad/${playerId}` as never)}
                  />
                </View>
              </View>
            ) : (
              <>
                <InfirmarySection
                  outList={outList}
                  recurrence={recurrence}
                  onEdit={setEditing}
                  onViewLoad={(playerId) => {
                    setTab('charge');
                    setLoadScope('joueur');
                    setLoadPlayerId(playerId);
                  }}
                />
                <SignalsSection signals={signals} />
                <ReportsSection
                  reports={recentReports}
                  onOpenPlayer={(playerId) => router.push(`/(tabs)/squad/${playerId}` as never)}
                />
              </>
            )}

            {/* ── Effectif ──────────────────────────────────────────────────
                Toujours affiché en entier (plus de Tout voir/Réduire) : la
                grille pleine largeur absorbe l'effectif complet sans scroll
                disproportionné. */}
            <EffectifGrid resolved={resolved} isTablet={isTablet} onEdit={setEditing} />
          </>
        )}

        {tab === 'charge' && (
          <>
            {/* ── Équipe / joueur ─────────────────────────────────────────── */}
            <ChipGroup
              label="Vue de la charge"
              options={LOAD_SCOPE_CHIPS}
              value={loadScope}
              onChange={setLoadScope}
            />

            {loadScope === 'joueur' &&
              (players.length === 0 ? (
                <EmptyState
                  icon="people-outline"
                  title="Aucun joueur"
                  description="L'équipe active n'a pas d'effectif."
                  compact
                />
              ) : (
                <Card
                  variant="raised"
                  padding="md"
                  onPress={() => setPlayerSheetOpen(true)}
                  accessibilityLabel={
                    loadPlayer
                      ? `Joueur : ${loadPlayer.first_name} ${loadPlayer.last_name}. Appuyer pour changer`
                      : 'Choisir un joueur'
                  }
                  style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {loadPlayer ? (
                      <PlayerIdentity
                        firstName={loadPlayer.first_name}
                        lastName={loadPlayer.last_name}
                        number={loadPlayer.number}
                      />
                    ) : (
                      <Text variant="body" tone="tertiary">
                        Choisir un joueur
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
                </Card>
              ))}

            {loadScope === 'equipe' ? (
              <>
                <Section title="Charge d'entraînement" subtitle={`Saison ${activeSeason} · 6 dernières séances`}>
                  <LoadSection weeks={weeks} rows={loadRows} />
                </Section>
                <Section title="Vue par joueur" subtitle={`5 dernières séances · saison ${activeSeason}`}>
                  <LoadMatrixSection
                    rows={filteredMatrixRows}
                    onSelectPlayer={(playerId) => {
                      setLoadScope('joueur');
                      setLoadPlayerId(playerId);
                    }}
                  />
                </Section>
              </>
            ) : !loadPlayerId ? (
              <EmptyState
                icon="person-outline"
                title="Choisis un joueur"
                description="Pour voir sa charge individuelle."
                compact
              />
            ) : loadingPlayerLoad ? (
              <SkeletonList rows={3} />
            ) : (
              <Section title="Charge d'entraînement" subtitle="12 dernières semaines · 6 dernières séances">
                <LoadSection weeks={playerWeeks} rows={playerLoadRows} />
              </Section>
            )}
          </>
        )}

        {tab === 'tests' && clubId && (
          <TestOverviewSection
            clubId={clubId}
            teamId={activeTeamId || null}
            clubSeason={clubSeason}
            types={testTypes}
            sessions={testSessions}
            results={filteredTestResults}
            players={filteredTestPlayers.map((p) => ({
              id: p.id,
              first_name: p.first_name,
              last_name: p.last_name,
              number: p.number ?? null,
            }))}
            onCreated={(session) => {
              setTestSessions((prev) => [session, ...prev]);
              router.push(`/(tabs)/calendar/tests/${session.id}` as never);
            }}
            onOpenSession={(sessionId) => router.push(`/(tabs)/calendar/tests/${sessionId}` as never)}
          />
        )}
      </Screen>

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

      <PlayerPickerSheet
        visible={playerSheetOpen}
        onClose={() => setPlayerSheetOpen(false)}
        players={players}
        selectedId={loadPlayerId}
        onSelect={setLoadPlayerId}
      />
    </>
  );
}
