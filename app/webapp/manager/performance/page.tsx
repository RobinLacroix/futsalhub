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
import { Loader2, Pencil, Users } from 'lucide-react';
import { availabilityService, playersService, trainingLoadService, defaultLoadWindow } from '@/lib/services';
import { buildWeeklyLoads, type WeeklyLoad } from '@/lib/trainingLoad';
import { useUserClub } from '../../hooks/useUserClub';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { zoneLabel } from '@/lib/painMap';
import {
  AVAILABILITY_META,
  countByStatus,
  GROUP_LABELS,
  GROUP_ORDER,
  groupOf,
  infirmary,
  PAIN_SIGNAL_DEFAULTS,
  resolveRoster,
  returnLabel,
  sinceLabel,
  SIDE_LABELS,
  type AvailabilityRow,
  type AvailabilityStatus,
  type PainSignalRow,
  type ResolvedPlayer,
} from '@/lib/availability';
import type { Player } from '@/types';
import AvailabilityEditor from './components/AvailabilityEditor';
import LoadPanel from './components/LoadPanel';
import PainSignalsPanel from './components/PainSignalsPanel';
import { T, TONE_COLORS } from './theme';

export default function PerformancePage() {
  const router = useRouter();
  const { club, loading: clubLoading } = useUserClub();
  const { activeTeamId, activeTeam } = useActiveTeam();

  const [players, setPlayers] = useState<Player[]>([]);
  const [rows, setRows] = useState<AvailabilityRow[]>([]);
  const [signals, setSignals] = useState<PainSignalRow[]>([]);
  const [weeks, setWeeks] = useState<WeeklyLoad[]>([]);
  const [windowDays, setWindowDays] = useState<number>(PAIN_SIGNAL_DEFAULTS.windowDays);
  const [minReports, setMinReports] = useState<number>(PAIN_SIGNAL_DEFAULTS.minReports);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ResolvedPlayer | null>(null);

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
      .getTrainingLoad(club.id, { teamId: activeTeamId || null, from: range.from, to: range.to })
      .then((rows) => {
        if (!cancelled) setWeeks(buildWeeklyLoads(rows));
      })
      .catch(() => {
        if (!cancelled) setWeeks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [club, activeTeamId]);

  // Les signaux se rechargent seuls quand le seuil change : c'est un réglage de
  // lecture, il ne doit pas obliger à recharger l'effectif.
  useEffect(() => {
    if (!club) return;
    let cancelled = false;
    availabilityService
      .getPainSignals(club.id, windowDays, minReports)
      .then((data) => {
        if (!cancelled) setSignals(data);
      })
      .catch(() => {
        if (!cancelled) setSignals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [club, windowDays, minReports]);

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

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = { apte: 0, reprise: 0, absent: 0 };
    for (const entry of resolved) counts[groupOf(entry.status)] += 1;
    return counts;
  }, [resolved]);

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

      {/* ── Bandeau ─────────────────────────────────────────────────────── */}
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
        Un joueur sans statut saisi est compté comme disponible : {players.length} joueurs dans
        l&apos;effectif, {rows.length} avec un état enregistré.
      </p>

      {/* ── Infirmerie ──────────────────────────────────────────────────── */}
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
                    {row.note && (
                      <p className="truncate text-xs italic" style={{ color: T.textMuted }}>
                        {row.note}
                      </p>
                    )}
                  </div>
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

      {/* ── Charge et wellness ──────────────────────────────────────────── */}
      <div className="mb-4">
        <LoadPanel weeks={weeks} />
      </div>

      {/* ── Signaux précoces ────────────────────────────────────────────── */}
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

      {/* ── Effectif complet ────────────────────────────────────────────── */}
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
