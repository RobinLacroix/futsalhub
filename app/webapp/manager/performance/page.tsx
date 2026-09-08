'use client';

/**
 * Pôle Performance — disponibilité de l'effectif, infirmerie, signaux précoces.
 *
 * La question qu'un coach se pose le plus souvent dans la semaine n'est pas
 * tactique, c'est « qui est dispo samedi ». Aujourd'hui la réponse est éclatée
 * sur quatre supports : `players.status`, `player_events`, `pain_reports` et la
 * mémoire du kiné. Cette page est la réponse unique.
 *
 * ## Le point le plus important de l'écran
 *
 * `player_availability` ne contient QUE les états saisis : un joueur sans ligne
 * est disponible. La page croise donc systématiquement l'effectif complet avec
 * les états, via `resolveRoster`, et jamais l'inverse. Afficher les seules
 * lignes de la table annoncerait « 4 disponibles » sur un effectif de 18, ce qui
 * est faux et se voit tout de suite — ou pire, ne se voit pas.
 *
 * ## Orchestration seulement
 *
 * L'édition vit dans `AvailabilityEditor`, les signaux dans `PainSignalsPanel`.
 * Cette page choisit quoi afficher et ne parle jamais à Supabase directement.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dumbbell, HeartPulse, Loader2, Pencil, Timer, TrendingUp, Users } from 'lucide-react';
import {
  availabilityService,
  physicalTestsService,
  playersService,
  trainingLoadService,
  defaultLoadWindow,
} from '@/lib/services';
import { getClubPainReports } from '@/lib/services/painReportsService';
import { buildWeeklyLoads, type MatrixRow, type WeeklyLoad } from '@/lib/trainingLoad';
import type { PhysicalTestResult, PhysicalTestSession, PhysicalTestType } from '@/lib/physicalTests';
import { useUserClub } from '../../hooks/useUserClub';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { useActiveSeasonContext } from '../../contexts/ActiveSeasonContext';
import { zoneLabel } from '@/lib/painMap';
import {
  AVAILABILITY_META,
  countByStatus,
  GROUP_LABELS,
  GROUP_ORDER,
  groupOf,
  infirmary,
  PAIN_SIGNAL_DEFAULTS,
  recurrenceCount,
  resolveRoster,
  returnLabel,
  sinceLabel,
  SIDE_LABELS,
  type AvailabilityRow,
  type AvailabilityStatus,
  type PainSignalRow,
  type ResolvedPlayer,
} from '@/lib/availability';
import type { ClubPainReportGroup, Player } from '@/types';
import AvailabilityEditor from './components/AvailabilityEditor';
import LoadPanel from './components/LoadPanel';
import LoadMatrixPanel from './components/LoadMatrixPanel';
import PainSignalsPanel from './components/PainSignalsPanel';
import PainReportsPanel from './components/PainReportsPanel';
import TestOverviewPanel from './components/TestOverviewPanel';
import { T, TONE_COLORS } from './theme';

/** Charge : vue d'équipe (agrégée) ou d'un joueur (son RPE, pas une moyenne). */
type LoadScope = 'equipe' | 'joueur';

type PerformanceTab = 'infirmerie' | 'charge' | 'tests';

/** Même style que les onglets de la page Analyse (`analytics/page.tsx`) : icône + libellé, soulignement fin. */
const TABS: { id: PerformanceTab; label: string; icon: typeof HeartPulse }[] = [
  { id: 'infirmerie', label: 'Infirmerie', icon: HeartPulse },
  { id: 'charge', label: "Charge d'entraînement", icon: Dumbbell },
  { id: 'tests', label: 'Tests physiques', icon: Timer },
];

/** Ordre tactique, cf. `mobile/components/players/positions.ts` — même catalogue, pas de fichier partagé côté web. */
const POSITION_OPTIONS = ['Gardien', 'Meneur', 'Ailier', 'Pivot'] as const;

export default function PerformancePage() {
  const router = useRouter();
  const { club, loading: clubLoading } = useUserClub();
  const { activeTeamId, activeTeam } = useActiveTeam();
  const { activeSeason, clubSeason } = useActiveSeasonContext();

  const [players, setPlayers] = useState<Player[]>([]);
  const [rows, setRows] = useState<AvailabilityRow[]>([]);
  const [signals, setSignals] = useState<PainSignalRow[]>([]);
  const [reports, setReports] = useState<ClubPainReportGroup[]>([]);
  const [weeks, setWeeks] = useState<WeeklyLoad[]>([]);
  const [windowDays, setWindowDays] = useState<number>(PAIN_SIGNAL_DEFAULTS.windowDays);
  const [minReports, setMinReports] = useState<number>(PAIN_SIGNAL_DEFAULTS.minReports);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ResolvedPlayer | null>(null);
  const [tab, setTab] = useState<PerformanceTab>('infirmerie');

  // Filtre par poste : demandé par le préparateur physique pour sortir les
  // gardiens (poste à part) de la moyenne RPE/tests. Vide = tous les postes.
  // S'applique à « Charge » et « Tests » uniquement — sans objet en Infirmerie.
  const [positionFilter, setPositionFilter] = useState<string[]>([]);

  // Charge : équipe (agrégée, `weeks`/`sessions` ci-dessus) ou un joueur — même
  // moteur de calcul (`buildWeeklyLoads`), deux sources de données (voir
  // `lib/trainingLoad.ts`, TrainingLoadRow).
  const [loadScope, setLoadScope] = useState<LoadScope>('equipe');
  const [loadPlayerId, setLoadPlayerId] = useState<string>('');
  const [playerWeeks, setPlayerWeeks] = useState<WeeklyLoad[]>([]);
  const [loadingPlayerLoad, setLoadingPlayerLoad] = useState(false);
  const [matrixRows, setMatrixRows] = useState<MatrixRow[]>([]);
  // Récidive : nombre d'épisodes passés sur la même zone/côté, par joueur en infirmerie.
  const [recurrence, setRecurrence] = useState<Record<string, number>>({});

  // Tests physiques : catalogue + campagnes + résultats retenus de la saison
  // affichée. `TestOverviewPanel` fait tout l'assemblage, cette page ne fait
  // que charger les trois briques brutes.
  const [testTypes, setTestTypes] = useState<PhysicalTestType[]>([]);
  const [testSessions, setTestSessions] = useState<PhysicalTestSession[]>([]);
  const [testResults, setTestResults] = useState<PhysicalTestResult[]>([]);

  const loadAvailability = useCallback(async () => {
    if (!club) return;
    const [roster, current] = await Promise.all([
      activeTeamId ? playersService.getPlayersByTeam(activeTeamId) : Promise.resolve([]),
      availabilityService.getClubAvailability(club.id, activeTeamId || null),
    ]);
    setPlayers(roster);
    setRows(current);
  }, [club, activeTeamId]);

  useEffect(() => {
    if (clubLoading) return;
    if (!club) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadAvailability();
        if (cancelled) return;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Chargement impossible.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clubLoading, club, loadAvailability]);

  // La charge est chargée à part : elle ne dépend ni de l'effectif ni du seuil
  // des signaux, et une fenêtre de 12 semaines n'a pas à être relue à chaque
  // changement de statut.
  useEffect(() => {
    if (!club) return;
    let cancelled = false;
    // Pas `window` comme nom : il masquerait l'objet global dans cette portée.
    const range = defaultLoadWindow(12);
    trainingLoadService
      .getTrainingLoad(club.id, {
        teamId: activeTeamId || null,
        from: range.from,
        to: range.to,
        positions: positionFilter.length ? positionFilter : null,
      })
      .then((rows) => {
        if (cancelled) return;
        setWeeks(buildWeeklyLoads(rows));
      })
      .catch(() => {
        if (!cancelled) setWeeks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [club, activeTeamId, positionFilter]);

  // Matrice par joueur : exige une équipe (la RPC scope sur l'effectif d'une
  // équipe précise, pas sur le club entier). Pas de RPC tant qu'aucune équipe
  // n'est active.
  useEffect(() => {
    if (!club || !activeTeamId) {
      setMatrixRows([]);
      return;
    }
    let cancelled = false;
    trainingLoadService
      .getTeamTrainingLoadMatrix(club.id, activeTeamId, 5)
      .then((rows) => {
        if (!cancelled) setMatrixRows(rows);
      })
      .catch(() => {
        if (!cancelled) setMatrixRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [club, activeTeamId]);

  // Tests physiques : catalogue puis campagnes de la saison affichée puis
  // leurs résultats retenus — trois allers-retours séquentiels parce que le
  // deuxième et le troisième dépendent du premier, jamais en parallèle à
  // l'aveugle.
  useEffect(() => {
    if (!club) {
      setTestTypes([]);
      setTestSessions([]);
      setTestResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const types = await physicalTestsService.getTestTypes(club.id);
        const sessions = await physicalTestsService.getSessions(club.id, {
          teamId: activeTeamId || null,
          season: activeSeason,
        });
        const results = await physicalTestsService.getSquadRetainedResults(
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
  }, [club, activeTeamId, activeSeason]);

  // Charge individuelle : ne se charge que si l'onglet Joueur est actif et
  // qu'un joueur est choisi — pas de RPC à chaque ouverture de la page.
  useEffect(() => {
    if (loadScope !== 'joueur' || !loadPlayerId) return;
    let cancelled = false;
    setLoadingPlayerLoad(true);
    const range = defaultLoadWindow(12);
    trainingLoadService
      .getPlayerTrainingLoad(loadPlayerId, { from: range.from, to: range.to })
      .then((rows) => {
        if (cancelled) return;
        setPlayerWeeks(buildWeeklyLoads(rows));
      })
      .catch(() => {
        if (!cancelled) setPlayerWeeks([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPlayerLoad(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadScope, loadPlayerId]);

  // Les signaux se rechargent seuls quand le seuil change : c'est un réglage de
  // lecture, il ne doit pas obliger à recharger l'effectif.
  useEffect(() => {
    if (!club) return;
    let cancelled = false;
    availabilityService
      .getPainSignals(club.id, windowDays, minReports, activeTeamId || null)
      .then((data) => {
        if (!cancelled) setSignals(data);
      })
      .catch(() => {
        if (!cancelled) setSignals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [club, windowDays, minReports, activeTeamId]);

  // Les déclarations brutes se rechargent avec le club et l'équipe active,
  // comme l'effectif — mais pas avec le seuil des signaux : ce n'est pas un
  // réglage de lecture ici, on veut le fil complet des soumissions récentes.
  useEffect(() => {
    if (!club) return;
    let cancelled = false;
    getClubPainReports(club.id, activeTeamId || null)
      .then((data) => {
        if (!cancelled) setReports(data);
      })
      .catch(() => {
        if (!cancelled) setReports([]);
      });
    return () => {
      cancelled = true;
    };
  }, [club, activeTeamId]);

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

  const statusCounts = useMemo(() => countByStatus(resolved), [resolved]);
  const outList = useMemo(() => infirmary(resolved), [resolved]);

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
        availabilityService
          .getPlayerAvailabilityHistory(entry.player.id, from)
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

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = { apte: 0, reprise: 0, absent: 0 };
    for (const entry of resolved) counts[groupOf(entry.status)] += 1;
    return counts;
  }, [resolved]);

  // Joueurs retenus par le filtre de poste. `null` = aucun filtre actif (tous
  // les joueurs), distinct d'un Set vide (aucun joueur, poste sans effectif).
  const filteredPlayerIds = useMemo(() => {
    if (positionFilter.length === 0) return null;
    return new Set(players.filter((p) => positionFilter.includes(p.position)).map((p) => p.id));
  }, [players, positionFilter]);

  // Matrice de charge : `LoadMatrixPanel` recalcule sa propre moyenne équipe à
  // partir des lignes reçues, donc filtrer l'entrée suffit — aucun changement
  // dans le composant.
  const filteredMatrixRows = useMemo(
    () => (filteredPlayerIds ? matrixRows.filter((r) => filteredPlayerIds.has(r.player_id)) : matrixRows),
    [matrixRows, filteredPlayerIds],
  );

  // Tests physiques : `TestOverviewPanel` construit sa moyenne équipe à partir
  // de `results` (pas de `players`), donc les deux doivent être filtrés pour
  // rester cohérents — lignes affichées ET moyenne du pied de tableau.
  const filteredTestResults = useMemo(
    () => (filteredPlayerIds ? testResults.filter((r) => filteredPlayerIds.has(r.player_id)) : testResults),
    [testResults, filteredPlayerIds],
  );
  const filteredTestPlayers = useMemo(
    () => (filteredPlayerIds ? players.filter((p) => filteredPlayerIds.has(p.id)) : players),
    [players, filteredPlayerIds],
  );

  if (clubLoading || loading) {
    return (
      <div className="flex items-center gap-2 p-6" style={{ color: T.textMuted }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement…
      </div>
    );
  }

  if (!club) {
    return (
      <div className="p-6" style={{ color: T.textMuted }}>
        Aucun club rattaché à votre compte.
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: T.text }}>
          Pôle Performance
        </h1>
        <p className="mt-1 text-sm" style={{ color: T.textMuted }}>
          {club.name}
          {activeTeam ? ` · ${activeTeam.name}` : ' · toutes équipes'}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {!activeTeamId && (
        <div
          className="mb-4 rounded-md border px-4 py-3 text-sm"
          style={{ borderColor: T.border, backgroundColor: T.rowOdd, color: T.textMuted }}
        >
          Sélectionnez une équipe pour voir la disponibilité de son effectif. Sans équipe active,
          seuls les états déjà saisis s&apos;affichent.
        </div>
      )}

      {/* ── Onglets ─────────────────────────────────────────────────────── */}
      <div className="mb-6" style={{ display: 'flex', gap: 6, borderBottom: `1px solid ${T.border}` }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-selected={active}
              role="tab"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                borderBottom: `2px solid ${active ? T.accent : 'transparent'}`,
                backgroundColor: 'transparent',
                color: active ? T.accent : T.textMuted,
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'infirmerie' && (
        <>
          {/* ── Bandeau ─────────────────────────────────────────────────── */}
          <section className="mb-4 grid gap-3 sm:grid-cols-3">
            {GROUP_ORDER.map((group) => {
              const tone =
                group === 'apte'
                  ? TONE_COLORS.positive
                  : group === 'reprise'
                    ? TONE_COLORS.warning
                    : TONE_COLORS.injury;
              return (
                <div
                  key={group}
                  className="rounded-lg border p-4"
                  style={{ backgroundColor: T.cardBg, borderColor: T.border }}
                >
                  <p className="text-3xl font-bold tabular-nums" style={{ color: tone.fg }}>
                    {groupCounts[group]}
                  </p>
                  <p className="text-sm font-medium" style={{ color: T.text }}>
                    {GROUP_LABELS[group]}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: T.textMuted }}>
                    {GROUP_ORDER.indexOf(group) === 0
                      ? 'Alignables, avec ou sans aménagement'
                      : detailLine(statusCounts, group)}
                  </p>
                </div>
              );
            })}
          </section>

          {/* Le rappel qui évite le contresens le plus probable de l'écran. */}
          <p className="mb-6 text-xs" style={{ color: T.textMuted }}>
            Un joueur sans statut saisi est compté comme disponible : {players.length} joueurs
            dans l&apos;effectif, {rows.length} avec un état enregistré.
          </p>

          {/* ── Infirmerie ──────────────────────────────────────────────── */}
          <section
            className="mb-4 rounded-lg border"
            style={{ backgroundColor: T.cardBg, borderColor: T.border }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: T.border }}>
              <h2 className="text-base font-semibold" style={{ color: T.text }}>
                Infirmerie
              </h2>
              <span className="text-sm" style={{ color: T.textMuted }}>
                {outList.length} joueur{outList.length > 1 ? 's' : ''}
              </span>
            </div>

            {outList.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm" style={{ color: T.textMuted }}>
                Aucun joueur indisponible. Utilisez la liste ci-dessous pour déclarer un statut.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: T.border }}>
                {outList.map((entry) => {
                  const row = entry.row!;
                  const meta = AVAILABILITY_META[entry.status];
                  const tone = TONE_COLORS[meta.tone];
                  return (
                    <li key={entry.player.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span
                        className="shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium"
                        style={{ color: tone.fg, backgroundColor: tone.bg, borderColor: tone.border }}
                      >
                        {meta.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" style={{ color: T.text }}>
                          {entry.player.number != null ? `${entry.player.number}. ` : ''}
                          {entry.player.first_name} {entry.player.last_name}
                        </p>
                        <p className="truncate text-sm" style={{ color: T.textMuted }}>
                          {sinceLabel(row.days_out)}
                          {row.zone ? ` · ${zoneLabel(row.zone)}` : ''}
                          {row.side && row.side !== 'C' ? ` (${SIDE_LABELS[row.side]})` : ''}
                          {' · '}
                          {returnLabel(row)}
                        </p>
                        {row.zone && recurrence[entry.player.id] >= 2 && (
                          <p className="truncate text-xs font-medium" style={{ color: TONE_COLORS.warning.fg }}>
                            {recurrence[entry.player.id]}ᵉ épisode {zoneLabel(row.zone).toLowerCase()}
                            {row.side && row.side !== 'C' ? ` ${SIDE_LABELS[row.side]}` : ''} en 12 mois
                          </p>
                        )}
                        {row.note && (
                          <p className="truncate text-xs italic" style={{ color: T.textMuted }}>
                            {row.note}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTab('charge');
                          setLoadScope('joueur');
                          setLoadPlayerId(entry.player.id);
                        }}
                        className="flex shrink-0 items-center gap-1 rounded-md border px-3 py-1.5 text-sm"
                        style={{ borderColor: T.border, color: T.text }}
                      >
                        <TrendingUp className="h-3.5 w-3.5" />
                        Sa charge
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(entry)}
                        className="flex shrink-0 items-center gap-1 rounded-md border px-3 py-1.5 text-sm"
                        style={{ borderColor: T.border, color: T.text }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Modifier
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Déclarations des joueurs ────────────────────────────────── */}
          <div className="mb-4">
            <PainReportsPanel
              reports={reports}
              onOpenPlayer={(playerId) => router.push(`/webapp/manager/squad/${playerId}`)}
            />
          </div>

          {/* ── Signaux précoces ────────────────────────────────────────── */}
          <div className="mb-4">
            <PainSignalsPanel
              signals={signals}
              windowDays={windowDays}
              minReports={minReports}
              onWindowChange={setWindowDays}
              onMinReportsChange={setMinReports}
              onOpenPlayer={(playerId) => router.push(`/webapp/manager/squad/${playerId}`)}
            />
          </div>

          {/* ── Effectif complet ─────────────────────────────────────────── */}
          <section className="rounded-lg border" style={{ backgroundColor: T.cardBg, borderColor: T.border }}>
            <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: T.border }}>
              <Users className="h-4 w-4" style={{ color: T.textMuted }} />
              <h2 className="text-base font-semibold" style={{ color: T.text }}>
                Effectif
              </h2>
            </div>
            {resolved.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm" style={{ color: T.textMuted }}>
                Aucun joueur dans l&apos;équipe active.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: T.border }}>
                {resolved.map((entry) => {
                  const meta = AVAILABILITY_META[entry.status];
                  const tone = TONE_COLORS[meta.tone];
                  return (
                    <li key={entry.player.id} className="flex items-center gap-3 px-4 py-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tone.fg }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-sm" style={{ color: T.text }}>
                        {entry.player.number != null ? `${entry.player.number}. ` : ''}
                        {entry.player.first_name} {entry.player.last_name}
                      </span>
                      <span className="shrink-0 text-sm" style={{ color: tone.fg }}>
                        {meta.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditing(entry)}
                        aria-label={`Modifier le statut de ${entry.player.first_name} ${entry.player.last_name}`}
                        className="shrink-0 rounded p-1.5 hover:bg-gray-100"
                        style={{ color: T.textMuted }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {(tab === 'charge' || tab === 'tests') && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium" style={{ color: T.textMuted }}>
            Postes
          </span>
          {POSITION_OPTIONS.map((position) => {
            const active = positionFilter.includes(position);
            return (
              <button
                key={position}
                type="button"
                onClick={() =>
                  setPositionFilter((prev) =>
                    prev.includes(position) ? prev.filter((p) => p !== position) : [...prev, position],
                  )
                }
                aria-pressed={active}
                className="rounded-full border px-3 py-1 text-sm font-medium"
                style={{
                  borderColor: active ? T.accent : T.border,
                  backgroundColor: active ? T.accent : 'transparent',
                  color: active ? '#fff' : T.text,
                }}
              >
                {position}
              </button>
            );
          })}
          {positionFilter.length > 0 && (
            <button
              type="button"
              onClick={() => setPositionFilter([])}
              className="text-xs font-medium underline"
              style={{ color: T.textMuted }}
            >
              Réinitialiser
            </button>
          )}
        </div>
      )}

      {tab === 'charge' && (
        <>
          {/* ── Équipe / joueur ─────────────────────────────────────────── */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border" style={{ borderColor: T.border }}>
              {(['equipe', 'joueur'] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setLoadScope(scope)}
                  aria-pressed={loadScope === scope}
                  className="px-3 py-1.5 text-sm font-medium"
                  style={{
                    backgroundColor: loadScope === scope ? T.accent : 'transparent',
                    color: loadScope === scope ? '#fff' : T.text,
                  }}
                >
                  {scope === 'equipe' ? 'Équipe' : 'Joueur'}
                </button>
              ))}
            </div>
            {loadScope === 'joueur' && (
              <select
                value={loadPlayerId}
                onChange={(e) => setLoadPlayerId(e.target.value)}
                aria-label="Choisir un joueur"
                className="rounded-md border px-2 py-1.5 text-sm"
                style={{ borderColor: T.border, color: T.text }}
              >
                <option value="">Choisir un joueur…</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {loadScope === 'equipe' ? (
            <>
              <div className="mb-4">
                <LoadPanel weeks={weeks} />
              </div>
              <LoadMatrixPanel
                rows={filteredMatrixRows}
                onSelectPlayer={(playerId) => {
                  setLoadScope('joueur');
                  setLoadPlayerId(playerId);
                }}
              />
            </>
          ) : !loadPlayerId ? (
            <p className="py-6 text-center text-sm" style={{ color: T.textMuted }}>
              Choisis un joueur pour voir sa charge individuelle.
            </p>
          ) : loadingPlayerLoad ? (
            <div className="flex items-center gap-2 py-6 text-sm" style={{ color: T.textMuted }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : (
            <>
              <LoadPanel weeks={playerWeeks} />
            </>
          )}
        </>
      )}

      {tab === 'tests' && (
        <TestOverviewPanel
          clubId={club.id}
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
            router.push(`/webapp/manager/tests/${session.id}`);
          }}
          onOpenSession={(sessionId) => router.push(`/webapp/manager/tests/${sessionId}`)}
        />
      )}

      {editing && (
        <AvailabilityEditor
          player={editing.player}
          current={editing.row}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            try {
              await loadAvailability();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Rechargement impossible.');
            }
          }}
        />
      )}
    </div>
  );
}

/** Détail d'un groupe : « 2 en soins, 1 suspendu ». */
function detailLine(
  counts: Partial<Record<AvailabilityStatus, number>>,
  group: string,
): string {
  const parts = (Object.entries(counts) as [AvailabilityStatus, number][])
    .filter(([status]) => groupOf(status) === group)
    .map(([status, count]) => `${count} ${AVAILABILITY_META[status].label.toLowerCase()}`);
  return parts.length > 0 ? parts.join(', ') : 'Personne';
}
