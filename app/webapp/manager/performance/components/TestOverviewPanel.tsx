'use client';

/**
 * Tests physiques — vue d'ensemble effectif, panneau de la page Performance.
 *
 * Jumeau mobile : `mobile/components/performance/TestOverviewSection.tsx`.
 *
 * ## Ce que répond cet écran, et ce qu'il ne répond pas
 *
 * « Qui est fort, qui est faible, sur quelle qualité, DANS CET EFFECTIF » —
 * jamais dans l'absolu. Un temps de sprint ne veut rien dire sans un groupe de
 * comparaison, et le groupe pertinent pour un coach est toujours le sien, pas
 * une norme fédérale. C'est tout ce que fait `buildSquadTestOverview` :
 * dernière valeur retenue de chaque joueur, progression vs sa campagne
 * précédente, comparaison à la moyenne d'effectif de CETTE campagne-là.
 *
 * Pas de fiche joueur complète ici : la matrice suffit à la première lecture.
 * Deux compléments sont demandés (2026-08) sans en faire une seconde fiche :
 * le tri par colonne (clic sur un en-tête, meilleur d'abord, via
 * `bestFirstComparator`) et un clic sur une cellule qui ouvre l'historique
 * d'UN joueur sur CE test (`TestHistoryModal`, réutilise `buildPlayerSeries`
 * sur les données déjà chargées — aucun aller-retour réseau de plus).
 *
 * ## Trois états de case
 *
 * Jamais testé => case grisée. Testé mais test `neutral` (poids, taille) =>
 * valeur affichée, jamais colorée — même garde-fou que `carriesJudgement`
 * partout ailleurs dans `lib/physicalTests.ts`. Testé et jugeable => couleur
 * vs la moyenne d'effectif de sa propre campagne.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardList, Download, Loader2, Plus, X } from 'lucide-react';
import { physicalTestsService } from '@/lib/services';
import { exportSquadOverview } from '@/lib/physicalTestsExport';
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
} from '@/lib/physicalTests';
import { T } from '../theme';
import TestHistoryModal from './TestHistoryModal';

const todayIso = () => new Date().toISOString().slice(0, 10);

interface RosterPlayer {
  id: string;
  first_name: string;
  last_name: string;
  number: number | null;
}

interface TestOverviewPanelProps {
  clubId: string;
  teamId: string | null;
  clubSeason: string;
  types: PhysicalTestType[];
  sessions: PhysicalTestSession[];
  results: PhysicalTestResult[];
  players: RosterPlayer[];
  /** Campagne créée : à la page d'ajouter la session à son état et de router vers la saisie. */
  onCreated: (session: PhysicalTestSession) => void;
  /** Clic sur la date de la dernière campagne : router vers sa saisie. */
  onOpenSession: (sessionId: string) => void;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

function comparisonColor(cmp: Comparison): string {
  if (cmp === 'better') return '#15803D';
  if (cmp === 'worse') return '#B91C1C';
  return T.textMuted;
}

const NAME_COL_PX = 176;
const MIN_CELL_COL_PX = 96;

export default function TestOverviewPanel({
  clubId,
  teamId,
  clubSeason,
  types,
  sessions,
  results,
  players,
  onCreated,
  onOpenSession,
}: TestOverviewPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({ date: todayIso(), label: '', conditions: '' });

  // Historique d'un joueur sur un test : ouvert au clic sur une cellule.
  const [historyTarget, setHistoryTarget] = useState<{ playerId: string; playerName: string; typeId: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const openModal = () => {
    setForm({ date: todayIso(), label: '', conditions: '' });
    setCreateError(null);
    setModalOpen(true);
  };

  const handleCreate = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const created = await physicalTestsService.createSession({
        clubId,
        teamId,
        trainingId: null,
        date: form.date,
        label: form.label.trim() || null,
        // Taggée sur la saison ACTIVE DU CLUB, pas sur la saison consultée :
        // créer une campagne en regardant les archives de l'an dernier ne
        // doit pas l'y ranger. Même règle que `tests/page.tsx`.
        season: clubSeason,
        conditions: form.conditions.trim() || null,
      });
      setModalOpen(false);
      onCreated(created);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Création impossible.');
    } finally {
      setCreating(false);
    }
  };

  // Base commune à la matrice ET à l'historique par joueur : un seul aller-
  // retour réseau (`results`/`sessions`, déjà chargés par la page) sert les
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
  // `buildSquadTestOverview` : la matrice les affiche en continu (plus de
  // choix d'un seul thème à la fois), regroupés visuellement par thème via
  // `categoryGroups` ci-dessous.
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

  // Première colonne de chaque thème : reçoit une bordure gauche pour
  // marquer la frontière entre groupes dans les lignes sous l'en-tête.
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
    const tested = new Set(results.filter((r) => r.session_id === latestSession.id).map((r) => r.player_id));
    return { tested: tested.size, total: players.length };
  }, [latestSession, results, players]);

  if (sessions.length === 0) {
    return (
      <section className="rounded-lg border p-4" style={{ backgroundColor: T.cardBg, borderColor: T.border }}>
        <h2 className="mb-2 text-base font-semibold" style={{ color: T.text }}>
          Tests physiques
        </h2>
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <ClipboardList className="h-8 w-8" style={{ color: T.textMuted }} />
          <p className="text-sm" style={{ color: T.textMuted }}>
            Aucune campagne de tests sur cette saison.
          </p>
          <button
            type="button"
            onClick={openModal}
            className="mt-1 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ backgroundColor: T.accent }}
          >
            <Plus className="h-4 w-4" />
            Nouvelle campagne
          </button>
        </div>
        {modalOpen && (
          <CreateSessionModal
            form={form}
            setForm={setForm}
            creating={creating}
            error={createError}
            onClose={() => setModalOpen(false)}
            onCreate={handleCreate}
          />
        )}
      </section>
    );
  }

  return (
    <section className="rounded-lg border p-4" style={{ backgroundColor: T.cardBg, borderColor: T.border }}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold" style={{ color: T.text }}>
          Tests physiques
        </h2>
        <div className="flex items-center gap-2">
          {overview.types.length > 0 && (
            <button
              type="button"
              onClick={() => exportSquadOverview(overview, players, clubSeason)}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium"
              style={{ borderColor: T.border, color: T.text }}
              title="Exporter la vue d'ensemble en Excel"
            >
              <Download className="h-4 w-4" />
              Exporter
            </button>
          )}
          <button
            type="button"
            onClick={openModal}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: T.border, color: T.text }}
          >
            <Plus className="h-4 w-4" />
            Nouvelle campagne
          </button>
        </div>
      </div>

      {/* ── Bandeau ───────────────────────────────────────────────────────── */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {latestSession ? (
          <button
            type="button"
            onClick={() => onOpenSession(latestSession.id)}
            className="rounded-md border px-3 py-2 text-left hover:bg-gray-50"
            style={{ borderColor: T.border }}
            title="Ouvrir la saisie de cette campagne"
          >
            <p className="text-xs" style={{ color: T.textMuted }}>
              Dernière campagne
            </p>
            <p className="text-lg font-bold underline-offset-2 hover:underline" style={{ color: T.text }}>
              {fmtDate(latestSession.date)}
            </p>
            {latestSession.label && (
              <p className="text-xs" style={{ color: T.textMuted }}>
                {latestSession.label}
              </p>
            )}
          </button>
        ) : (
          <div className="rounded-md border px-3 py-2" style={{ borderColor: T.border }}>
            <p className="text-xs" style={{ color: T.textMuted }}>
              Dernière campagne
            </p>
            <p className="text-lg font-bold" style={{ color: T.text }}>
              —
            </p>
          </div>
        )}
        <div className="rounded-md border px-3 py-2" style={{ borderColor: T.border }}>
          <p className="text-xs" style={{ color: T.textMuted }}>
            Couverture
          </p>
          <p className="text-lg font-bold tabular-nums" style={{ color: T.text }}>
            {coverage ? `${coverage.tested} / ${coverage.total}` : '—'}
          </p>
          <p className="text-xs" style={{ color: T.textMuted }}>
            joueurs testés à la dernière campagne
          </p>
        </div>
        <div className="rounded-md border px-3 py-2" style={{ borderColor: T.border }}>
          <p className="text-xs" style={{ color: T.textMuted }}>
            Tests actifs
          </p>
          <p className="text-lg font-bold tabular-nums" style={{ color: T.text }}>
            {types.length}
          </p>
          <p className="text-xs" style={{ color: T.textMuted }}>
            au catalogue du club
          </p>
        </div>
      </div>

      {overview.types.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: T.textMuted }}>
          Les campagnes existent mais n&apos;ont aucun résultat saisi.
        </p>
      ) : (
        <>
          {/* ── Matrice ───────────────────────────────────────────────────── */}
          <div className="overflow-x-auto">
            <table
              className="border-separate"
              style={{
                borderSpacing: 0,
                width: '100%',
                minWidth: NAME_COL_PX + columns.length * MIN_CELL_COL_PX,
                tableLayout: 'fixed',
              }}
            >
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    className="sticky left-0 whitespace-nowrap px-2 py-1 text-left text-xs font-medium"
                    style={{ backgroundColor: T.cardBg, color: T.textMuted, width: NAME_COL_PX }}
                  >
                    Joueur
                  </th>
                  {categoryGroups.map((group) => (
                    <th
                      key={group.category}
                      colSpan={group.types.length}
                      className="border-b border-l whitespace-nowrap px-2 py-1 text-center text-xs font-semibold"
                      style={{ color: T.text, borderColor: T.border }}
                    >
                      {CATEGORY_LABELS[group.category]}
                    </th>
                  ))}
                </tr>
                <tr>
                  {columns.map((type) => {
                    const sorted = sort?.testTypeId === type.id;
                    const isGroupStart = groupStartIds.has(type.id);
                    return (
                      <th
                        key={type.id}
                        className={`whitespace-nowrap px-2 py-1 text-center text-xs font-medium ${isGroupStart ? 'border-l' : ''}`}
                        style={{ color: T.textMuted, borderColor: T.border }}
                        title={type.protocol_note ?? undefined}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(type.id)}
                          className="inline-flex items-center gap-0.5"
                          aria-label={`Trier par ${type.label}`}
                        >
                          {type.label}
                          {sorted &&
                            (sort!.direction === 'best' ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            ))}
                        </button>
                        <div className="text-[10px] font-normal">{type.unit}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((player) => {
                  const row = overviewByPlayer.get(player.id);
                  return (
                    <tr key={player.id}>
                      <td
                        className="sticky left-0 truncate whitespace-nowrap px-2 py-1 text-sm"
                        style={{ backgroundColor: T.cardBg, color: T.text }}
                      >
                        {player.first_name} {player.last_name}
                      </td>
                      {columns.map((type) => {
                        const cell = row?.cells.get(type.id) ?? null;
                        const isGroupStart = groupStartIds.has(type.id);
                        return (
                          <td
                            key={type.id}
                            className={`px-1 py-1 text-center ${isGroupStart ? 'border-l' : ''}`}
                            style={isGroupStart ? { borderColor: T.border } : undefined}
                          >
                            {cell ? (
                              <button
                                type="button"
                                onClick={() =>
                                  openHistory(player.id, `${player.first_name} ${player.last_name}`, type.id)
                                }
                                aria-label={`Historique de ${player.first_name} ${player.last_name} sur ${type.label}`}
                              >
                                <TestCellView cell={cell} type={type} />
                              </button>
                            ) : (
                              <TestCellView cell={null} type={type} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td
                    className="sticky left-0 whitespace-nowrap border-t px-2 py-1 text-sm font-semibold"
                    style={{ backgroundColor: T.cardBg, color: T.text, borderColor: T.border }}
                  >
                    Moyenne équipe
                  </td>
                  {columns.map((type) => {
                    const values = overview.players
                      .map((p) => p.cells.get(type.id)?.latest.value)
                      .filter((v): v is number => v !== undefined);
                    const avg = mean(values);
                    const avgSecondary = avg !== null ? testSecondaryReading(type, avg) : null;
                    const isGroupStart = groupStartIds.has(type.id);
                    return (
                      <td
                        key={type.id}
                        className={`border-t px-1 py-1 text-center text-sm font-semibold tabular-nums ${isGroupStart ? 'border-l' : ''}`}
                        style={{ borderColor: T.border, color: T.text }}
                      >
                        {avg !== null ? formatTestValueWithUnit(avg, type) : '—'}
                        {avgSecondary && (
                          <div className="text-[10px] font-normal" style={{ color: T.textMuted }}>
                            {formatTestValue(avgSecondary.value, { decimals: 1 })} {avgSecondary.unit}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-3 text-xs" style={{ color: T.textMuted }}>
            Case grise = jamais testé. La couleur compare à la moyenne d&apos;effectif de la
            campagne du joueur (à partir de {MIN_SQUAD_REFERENCE} joueurs mesurés) ; les mesures
            neutres (poids, taille) ne sont jamais colorées.
          </p>
        </>
      )}

      {modalOpen && (
        <CreateSessionModal
          form={form}
          setForm={setForm}
          creating={creating}
          error={createError}
          onClose={() => setModalOpen(false)}
          onCreate={handleCreate}
        />
      )}

      <TestHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        playerName={historyTarget?.playerName ?? ''}
        series={historySeries}
      />
    </section>
  );
}

interface CreateSessionForm {
  date: string;
  label: string;
  conditions: string;
}

function CreateSessionModal({
  form,
  setForm,
  creating,
  error,
  onClose,
  onCreate,
}: {
  form: CreateSessionForm;
  setForm: (updater: (f: CreateSessionForm) => CreateSessionForm) => void;
  creating: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Nouvelle campagne</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="perf-test-date" className="mb-1 block text-sm font-medium text-gray-700">
              Date
            </label>
            <input
              id="perf-test-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="perf-test-label" className="mb-1 block text-sm font-medium text-gray-700">
              Intitulé <span className="font-normal text-gray-500">(optionnel)</span>
            </label>
            <input
              id="perf-test-label"
              type="text"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Tests de reprise"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="perf-test-conditions" className="mb-1 block text-sm font-medium text-gray-700">
              Conditions <span className="font-normal text-gray-500">(optionnel)</span>
            </label>
            <input
              id="perf-test-conditions"
              type="text"
              value={form.conditions}
              onChange={(e) => setForm((f) => ({ ...f, conditions: e.target.value }))}
              placeholder="Parquet, 21 °C"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {/* Même rappel que la page Tests physiques : les conditions ne sont
                pas de la décoration, elles conditionnent si deux campagnes se
                comparent. */}
            <p className="mt-1 text-xs text-gray-500">
              Surface, température, moment de la journée. Deux campagnes dans des conditions
              différentes ne se comparent pas à l&apos;identique.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onCreate}
            disabled={creating || !form.date}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            Créer et saisir
          </button>
        </div>
      </div>
    </div>
  );
}

function TestCellView({ cell, type }: { cell: SquadTestCell | null | undefined; type: PhysicalTestType }) {
  if (!cell) {
    return (
      <div
        className="mx-auto flex h-9 w-16 items-center justify-center rounded text-sm"
        style={{ backgroundColor: T.rowOdd, color: T.textMuted }}
        title="Jamais testé"
      >
        —
      </div>
    );
  }

  const color = comparisonColor(cell.vsSquad);
  const bg = cell.vsSquad === 'neutral' ? T.rowOdd : `${color}1a`;
  const secondary = testSecondaryReading(type, cell.latest.value);
  return (
    <div
      className="mx-auto flex min-h-9 w-16 flex-col items-center justify-center gap-px rounded py-1"
      style={{ backgroundColor: bg }}
      title={cell.squadMean !== null ? `Moyenne effectif : ${formatTestValueWithUnit(cell.squadMean, type)}` : undefined}
    >
      <span className="text-sm font-semibold tabular-nums" style={{ color: cell.vsSquad === 'neutral' ? T.text : color }}>
        {formatTestValueWithUnit(cell.latest.value, type)}
      </span>
      {secondary && (
        <span className="text-[10px] leading-none tabular-nums" style={{ color: T.textMuted }}>
          {formatTestValue(secondary.value, { decimals: 1 })} {secondary.unit}
        </span>
      )}
      {cell.delta !== null && (
        <span className="text-[10px] leading-none" style={{ color: T.textMuted }}>
          {formatDelta(cell.delta, type)}
        </span>
      )}
    </div>
  );
}
