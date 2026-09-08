/**
 * Tests physiques — vue d'ensemble effectif, section mobile.
 *
 * Jumelle web : `app/webapp/manager/performance/components/TestOverviewPanel.tsx`.
 *
 * Même construction que `LoadMatrixSection` : colonne joueur fixe à gauche,
 * colonnes de tests défilantes à droite, hauteurs de ligne fixes pour rester
 * alignées sans synchroniser le scroll.
 *
 * Voir l'en-tête du jumeau web pour le raisonnement produit : comparaison
 * toujours relative à l'effectif du club, jamais une norme absolue. Pas de
 * fiche joueur complète ici, mais deux compléments (2026-08) sans en faire
 * une seconde fiche : le tri par colonne (toucher un en-tête range les
 * joueurs meilleur d'abord, via `bestFirstComparator`) et un tap sur une
 * cellule qui ouvre l'historique d'UN joueur sur CE test
 * (`PlayerTestHistorySheet`, réutilise `buildPlayerSeries` sur les données
 * déjà chargées — aucun aller-retour réseau de plus).
 *
 * ## Tous les tests en même temps, groupés par thème (2026-08)
 *
 * Plus de sélecteur de catégorie : les colonnes de `overview.types` (déjà
 * triées catégorie puis `sort_order`) s'affichent toutes en continu, avec une
 * ligne d'en-tête supplémentaire qui les regroupe visuellement par thème
 * (`categoryGroups`, calculée en repérant les ruptures de catégorie dans la
 * liste déjà triée). `cellWidth` n'est plus plafonnée : les colonnes se
 * partagent toute la largeur disponible à parts égales, et ne retombent sur
 * `MIN_CELL_WIDTH` (déclenchant le scroll horizontal du `ScrollView`) que
 * lorsque le nombre de tests dépasse ce que l'écran peut afficher.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { View, ScrollView, Pressable, Alert, ActivityIndicator, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Text, Card, Button, EmptyState } from '../ui';
import { CreateTestSessionSheet } from './CreateTestSessionSheet';
import { PlayerTestHistorySheet } from './PlayerTestHistorySheet';
import {
  bestFirstComparator,
  buildPlayerSeries,
  CATEGORY_LABELS,
  MIN_SQUAD_REFERENCE,
  buildSquadTestOverview,
  formatDelta,
  formatTestValue,
  formatTestValueWithUnit,
  mean,
  testSecondaryReading,
  type Comparison,
  type PhysicalTestCategory,
  type PhysicalTestResult,
  type PhysicalTestSession,
  type PhysicalTestType,
  type PlayerTestSeries,
  type RetainedMeasure,
  type SquadTestCell,
} from '../../lib/physicalTests';
import { exportSquadOverview } from '../../lib/physicalTestsExport';
import type { ThemeColors } from '../../lib/design/tokens';

interface RosterPlayer {
  id: string;
  first_name: string;
  last_name: string;
  number: number | null;
}

export interface TestOverviewSectionProps {
  clubId: string;
  /** Équipe active. `null` désactive la création — pas de saisie sans effectif à charger derrière. */
  teamId: string | null;
  clubSeason: string;
  types: PhysicalTestType[];
  sessions: PhysicalTestSession[];
  results: PhysicalTestResult[];
  players: RosterPlayer[];
  onCreated: (session: PhysicalTestSession) => void;
  /** Tap sur la date de la dernière campagne : router vers sa saisie. */
  onOpenSession: (sessionId: string) => void;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

function comparisonColor(cmp: Comparison, c: ThemeColors): string {
  if (cmp === 'better') return c.positive.default;
  if (cmp === 'worse') return c.negative.default;
  return c.text.tertiary;
}

/** Assez large pour un nom-prénom complet sans troncature dans l'immense majorité des cas. */
const NAME_WIDTH = 128;
const MIN_CELL_WIDTH = 64;
const GROUP_HEADER_H = 24;
const HEADER_H = 34;
/** Assez haut pour laisser un nom exceptionnellement long passer sur 2 lignes. */
const ROW_H = 48;

export function TestOverviewSection({
  clubId,
  teamId,
  clubSeason,
  types,
  sessions,
  results,
  players,
  onCreated,
  onOpenSession,
}: TestOverviewSectionProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Base commune à la matrice ET à l'historique par joueur : un seul aller-
  // retour réseau (`results`/`sessions`, déjà chargés par l'écran) sert les
  // deux vues.
  const measures = useMemo(() => {
    const sessionDateById = new Map(sessions.map((s) => [s.id, s.date]));
    const out: (RetainedMeasure & { player_id: string })[] = results.map((r) => ({
      session_id: r.session_id,
      test_type_id: r.test_type_id,
      value: r.value,
      date: sessionDateById.get(r.session_id) ?? '',
      player_id: r.player_id,
    }));
    return out;
  }, [results, sessions]);

  const overview = useMemo(() => buildSquadTestOverview(measures, types), [measures, types]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportSquadOverview(overview, players, clubSeason);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'exporter.");
    } finally {
      setExporting(false);
    }
  }, [overview, players, clubSeason]);

  // Historique d'un joueur sur un test : ouvert au tap sur une cellule.
  const [historyTarget, setHistoryTarget] = useState<{
    playerId: string;
    playerName: string;
    typeId: string;
  } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const historySeries: PlayerTestSeries | null = useMemo(() => {
    if (!historyTarget) return null;
    const type = types.find((t) => t.id === historyTarget.typeId);
    if (!type) return null;
    const playerMeasures = measures.filter(
      (m) => m.player_id === historyTarget.playerId && m.test_type_id === historyTarget.typeId,
    );
    return buildPlayerSeries(playerMeasures, [type])[0] ?? null;
  }, [historyTarget, measures, types]);

  const openHistory = (playerId: string, playerName: string, typeId: string) => {
    setHistoryTarget({ playerId, playerName, typeId });
    setHistoryOpen(true);
  };

  const overviewByPlayer = useMemo(
    () => new Map(overview.players.map((p) => [p.player_id, p])),
    [overview],
  );

  // Tous les tests, déjà triés catégorie puis `sort_order` par
  // `buildSquadTestOverview` : la matrice les affiche en continu, regroupés
  // visuellement par thème via `categoryGroups` ci-dessous.
  const columns = overview.types;

  const categoryGroups = useMemo(() => {
    const groups: { category: PhysicalTestCategory; types: PhysicalTestType[] }[] = [];
    for (const type of columns) {
      const last = groups[groups.length - 1];
      if (last && last.category === type.category) last.types.push(type);
      else groups.push({ category: type.category, types: [type] });
    }
    return groups;
  }, [columns]);

  // Première colonne de chaque thème : reçoit une bordure gauche pour marquer
  // la frontière entre groupes.
  const groupStartIds = useMemo(
    () => new Set(categoryGroups.map((g) => g.types[0].id)),
    [categoryGroups],
  );

  const [sort, setSort] = useState<{ testTypeId: string; direction: 'best' | 'worst' } | null>(null);
  const toggleSort = (testTypeId: string) => {
    setSort((prev) =>
      prev?.testTypeId === testTypeId
        ? { testTypeId, direction: prev.direction === 'best' ? 'worst' : 'best' }
        : { testTypeId, direction: 'best' },
    );
  };

  const sortedPlayers = useMemo(() => {
    if (!sort) return players;
    const type = columns.find((t) => t.id === sort.testTypeId);
    if (!type) return players;
    const comparator = bestFirstComparator(type.direction);
    const tested: { player: RosterPlayer; value: number }[] = [];
    const untested: RosterPlayer[] = [];
    for (const player of players) {
      const value = overviewByPlayer.get(player.id)?.cells.get(type.id)?.latest.value;
      if (value === undefined) untested.push(player);
      else tested.push({ player, value });
    }
    tested.sort((a, b) => {
      const cmp = comparator(a.value, b.value);
      return sort.direction === 'best' ? cmp : -cmp;
    });
    return [...tested.map((t) => t.player), ...untested];
  }, [players, sort, columns, overviewByPlayer]);

  const latestSession = sessions[0] ?? null;
  const coverage = useMemo(() => {
    if (!latestSession) return null;
    const tested = new Set(
      results.filter((r) => r.session_id === latestSession.id).map((r) => r.player_id),
    );
    return { tested: tested.size, total: players.length };
  }, [latestSession, results, players]);

  const [containerWidth, setContainerWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width);
  const cellWidth =
    containerWidth > 0
      ? Math.max(MIN_CELL_WIDTH, (containerWidth - NAME_WIDTH) / Math.max(1, columns.length))
      : MIN_CELL_WIDTH;
  // Largeur du `ScrollView` : les lignes (fond zébré, séparateurs) doivent la
  // remplir même quand les colonnes sont plus étroites qu'elle, sinon le
  // zébrage s'arrête là où s'arrêtent les colonnes au lieu de courir jusqu'au
  // bord de la carte.
  const scrollAreaWidth = containerWidth > 0 ? Math.max(0, containerWidth - NAME_WIDTH) : 0;

  const createSheet = teamId ? (
    <CreateTestSessionSheet
      visible={creating}
      clubId={clubId}
      teamId={teamId}
      clubSeason={clubSeason}
      onClose={() => setCreating(false)}
      onCreated={(session) => {
        setCreating(false);
        onCreated(session);
      }}
    />
  ) : null;

  if (sessions.length === 0) {
    return (
      <View style={{ gap: theme.space.sm }}>
        <EmptyState
          icon="clipboard-outline"
          title="Aucune campagne de tests"
          description={
            teamId
              ? 'Lance la première campagne de la saison.'
              : "Sélectionne une équipe pour créer une campagne, ou crée-la depuis une séance."
          }
          compact
        />
        {teamId && (
          <Button
            label="Nouvelle campagne"
            icon="add-outline"
            variant="secondary"
            onPress={() => setCreating(true)}
          />
        )}
        {createSheet}
      </View>
    );
  }

  return (
    <View style={{ gap: theme.space.sm }}>
      <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
        {teamId && (
          <Button
            label="Nouvelle campagne"
            icon="add-outline"
            variant="secondary"
            size="sm"
            onPress={() => setCreating(true)}
          />
        )}
        {overview.types.length > 0 &&
          (exporting ? (
            <ActivityIndicator size="small" color={c.text.tertiary} />
          ) : (
            <Button
              label="Exporter"
              icon="share-outline"
              variant="secondary"
              size="sm"
              onPress={handleExport}
            />
          ))}
      </View>
      {createSheet}

      {/* ── Bandeau ───────────────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
        {latestSession ? (
          <Pressable
            onPress={() => onOpenSession(latestSession.id)}
            accessibilityRole="button"
            accessibilityLabel="Ouvrir la saisie de la dernière campagne"
            style={{ flex: 1 }}
          >
            <Card variant="raised" padding="sm">
              <Text variant="caption" tone="tertiary">
                Dernière campagne
              </Text>
              <Text variant="headline" tone="accent" numberOfLines={1}>
                {fmtDate(latestSession.date)}
              </Text>
            </Card>
          </Pressable>
        ) : (
          <Card variant="raised" padding="sm" style={{ flex: 1 }}>
            <Text variant="caption" tone="tertiary">
              Dernière campagne
            </Text>
            <Text variant="headline" numberOfLines={1}>
              —
            </Text>
          </Card>
        )}
        <Card variant="raised" padding="sm" style={{ flex: 1 }}>
          <Text variant="caption" tone="tertiary">
            Couverture
          </Text>
          <Text variant="headline" numeric>
            {coverage ? `${coverage.tested}/${coverage.total}` : '—'}
          </Text>
        </Card>
        <Card variant="raised" padding="sm" style={{ flex: 1 }}>
          <Text variant="caption" tone="tertiary">
            Tests actifs
          </Text>
          <Text variant="headline" numeric>
            {types.length}
          </Text>
        </Card>
      </View>

      {overview.types.length === 0 ? (
        <EmptyState
          icon="clipboard-outline"
          title="Aucun résultat saisi"
          description="Les campagnes existent mais n'ont aucune valeur enregistrée."
          compact
        />
      ) : (
        <>
          <Card
            variant="raised"
            padding="sm"
            style={{ flexDirection: 'row', alignSelf: 'stretch' }}
            onLayout={onLayout}
          >
            {/* ── Colonne fixe : joueurs ────────────────────────────────── */}
            <View style={{ width: NAME_WIDTH }}>
              <View
                style={{
                  height: GROUP_HEADER_H + HEADER_H,
                  borderBottomWidth: 1,
                  borderBottomColor: c.border.subtle,
                }}
              />
              {sortedPlayers.map((player, index) => (
                <View
                  key={player.id}
                  style={{
                    height: ROW_H,
                    justifyContent: 'center',
                    paddingLeft: 4,
                    paddingRight: 6,
                    backgroundColor: index % 2 === 1 ? c.bg.sunken : 'transparent',
                  }}
                >
                  <Text variant="caption" weight="600" numberOfLines={2}>
                    {player.first_name} {player.last_name}
                  </Text>
                </View>
              ))}
              <View
                style={{
                  height: ROW_H,
                  justifyContent: 'center',
                  paddingLeft: 4,
                  borderTopWidth: 1,
                  borderTopColor: c.border.subtle,
                }}
              >
                <Text variant="caption" weight="700" numberOfLines={1}>
                  Moyenne équipe
                </Text>
              </View>
            </View>

            {/* ── Partie défilante : tests ──────────────────────────────── */}
            <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
              <View style={{ minWidth: scrollAreaWidth }}>
                {/* Regroupement par thème : une case par groupe de colonnes contiguës. */}
                <View style={{ flexDirection: 'row', height: GROUP_HEADER_H }}>
                  {categoryGroups.map((group) => (
                    <View
                      key={group.category}
                      style={{
                        width: cellWidth * group.types.length,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderLeftWidth: 1,
                        borderLeftColor: c.border.subtle,
                      }}
                    >
                      <Text variant="caption" weight="700" numberOfLines={1}>
                        {CATEGORY_LABELS[group.category]}
                      </Text>
                    </View>
                  ))}
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    height: HEADER_H,
                    borderBottomWidth: 1,
                    borderBottomColor: c.border.subtle,
                  }}
                >
                  {columns.map((type) => {
                    const sorted = sort?.testTypeId === type.id;
                    const isGroupStart = groupStartIds.has(type.id);
                    return (
                      <Pressable
                        key={type.id}
                        onPress={() => toggleSort(type.id)}
                        style={{
                          width: cellWidth,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderLeftWidth: isGroupStart ? 1 : 0,
                          borderLeftColor: c.border.subtle,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Trier par ${type.label}`}
                      >
                        <Text variant="caption" tone="tertiary" numberOfLines={1}>
                          {type.label} ({type.unit})
                          {sorted ? (sort!.direction === 'best' ? ' ▲' : ' ▼') : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {sortedPlayers.map((player, index) => {
                  const row = overviewByPlayer.get(player.id);
                  return (
                    <View
                      key={player.id}
                      style={{
                        flexDirection: 'row',
                        height: ROW_H,
                        backgroundColor: index % 2 === 1 ? c.bg.sunken : 'transparent',
                      }}
                    >
                      {columns.map((type) => {
                        const cell = row?.cells.get(type.id) ?? null;
                        const isGroupStart = groupStartIds.has(type.id);
                        return (
                          <Pressable
                            key={type.id}
                            disabled={!cell}
                            onPress={() =>
                              openHistory(player.id, `${player.first_name} ${player.last_name}`, type.id)
                            }
                            accessibilityRole={cell ? 'button' : undefined}
                            accessibilityLabel={
                              cell
                                ? `Historique de ${player.first_name} ${player.last_name} sur ${type.label}`
                                : undefined
                            }
                            style={{
                              width: cellWidth,
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderLeftWidth: isGroupStart ? 1 : 0,
                              borderLeftColor: c.border.subtle,
                            }}
                          >
                            <TestCellView cell={cell} type={type} c={c} />
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })}

                <View
                  style={{
                    flexDirection: 'row',
                    height: ROW_H,
                    borderTopWidth: 1,
                    borderTopColor: c.border.subtle,
                  }}
                >
                  {columns.map((type) => {
                    const values = overview.players
                      .map((p) => p.cells.get(type.id)?.latest.value)
                      .filter((v): v is number => v !== undefined);
                    const avg = mean(values);
                    const avgSecondary = avg !== null ? testSecondaryReading(type, avg) : null;
                    const isGroupStart = groupStartIds.has(type.id);
                    return (
                      <View
                        key={type.id}
                        style={{
                          width: cellWidth,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderLeftWidth: isGroupStart ? 1 : 0,
                          borderLeftColor: c.border.subtle,
                        }}
                      >
                        <Text variant="caption" weight="700" numeric>
                          {avg !== null ? formatTestValueWithUnit(avg, type) : '—'}
                        </Text>
                        {avgSecondary && (
                          <Text variant="caption" tone="tertiary" style={{ fontSize: 9, lineHeight: 11 }} numeric>
                            {formatTestValue(avgSecondary.value, { decimals: 1 })} {avgSecondary.unit}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </Card>

          <Text variant="caption" tone="tertiary">
            Case grise = jamais testé. La couleur compare à la moyenne d’effectif de la campagne du
            joueur (à partir de {MIN_SQUAD_REFERENCE} joueurs mesurés) ; les mesures neutres (poids,
            taille) ne sont jamais colorées.
          </Text>
        </>
      )}

      <PlayerTestHistorySheet
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        playerName={historyTarget?.playerName ?? ''}
        series={historySeries}
      />
    </View>
  );
}

function TestCellView({
  cell,
  type,
  c,
}: {
  cell: SquadTestCell | null | undefined;
  type: PhysicalTestType;
  c: ThemeColors;
}) {
  const boxStyle = {
    width: 52,
    minHeight: 32,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  if (!cell) {
    return (
      <View style={[boxStyle, { backgroundColor: c.bg.sunken }]} accessibilityLabel="Jamais testé">
        <Text variant="caption" tone="tertiary">
          —
        </Text>
      </View>
    );
  }

  const color = comparisonColor(cell.vsSquad, c);
  const bg = cell.vsSquad === 'neutral' ? c.bg.sunken : `${color}26`;
  const secondary = testSecondaryReading(type, cell.latest.value);
  return (
    <View style={[boxStyle, { backgroundColor: bg, paddingVertical: 2 }]}>
      <Text
        variant="caption"
        weight="700"
        style={{ color: cell.vsSquad === 'neutral' ? c.text.primary : color, fontSize: 12 }}
        numeric
      >
        {formatTestValueWithUnit(cell.latest.value, type)}
      </Text>
      {secondary && (
        <Text variant="caption" tone="tertiary" style={{ fontSize: 9, lineHeight: 11 }} numeric>
          {formatTestValue(secondary.value, { decimals: 1 })} {secondary.unit}
        </Text>
      )}
      {cell.delta !== null && (
        <Text variant="caption" tone="tertiary" style={{ fontSize: 9, lineHeight: 11 }} numeric>
          {formatDelta(cell.delta, type)}
        </Text>
      )}
    </View>
  );
}
