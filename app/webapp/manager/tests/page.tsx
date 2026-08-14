'use client';

/**
 * Campagnes de tests physiques — liste et création.
 *
 * Une campagne peut naître de deux endroits, et les deux sont légitimes :
 *
 * - **depuis une séance** (mobile, bouton « Tests physiques ») : le cas courant,
 *   le groupe testé est celui des convoqués ;
 * - **ici, sans séance rattachée** : les tests de reprise passés un samedi
 *   matin hors créneau, ou une campagne rejouée à partir d'une feuille papier.
 *   Le groupe testé est alors tout l'effectif de l'équipe.
 *
 * Une seule campagne par séance est garantie côté mobile par un `maybeSingle` :
 * deux campagnes sur la même séance donneraient deux jeux de résultats sans
 * qu'on sache lequel fait foi. Rien n'empêche en revanche deux campagnes
 * autonomes le même jour, et c'est voulu : matin athlétique, soir technique.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Loader2, Plus, X } from 'lucide-react';
import { physicalTestsService } from '@/lib/services';
import { useUserClub } from '../../hooks/useUserClub';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { useActiveSeasonContext } from '../../contexts/ActiveSeasonContext';
import type { PhysicalTestSession } from '@/lib/physicalTests';

const todayIso = () => new Date().toISOString().slice(0, 10);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function PhysicalTestsPage() {
  const { club, loading: clubLoading } = useUserClub();
  const { activeTeamId, teams, canEditTeam } = useActiveTeam();
  const { activeSeason, clubSeason } = useActiveSeasonContext();

  const [sessions, setSessions] = useState<PhysicalTestSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    date: todayIso(),
    label: '',
    conditions: '',
    teamId: '',
  });

  const load = useCallback(async () => {
    if (!club) {
      setSessions([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await physicalTestsService.getSessions(club.id, { season: activeSeason });
      setSessions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [club, activeSeason]);

  useEffect(() => {
    if (!clubLoading) load();
  }, [clubLoading, load]);

  const openModal = () => {
    setForm({ date: todayIso(), label: '', conditions: '', teamId: activeTeamId || '' });
    setModalOpen(true);
  };

  const handleCreate = async () => {
    if (!club) return;
    setCreating(true);
    try {
      const created = await physicalTestsService.createSession({
        clubId: club.id,
        teamId: form.teamId || null,
        trainingId: null,
        date: form.date,
        label: form.label.trim() || null,
        // La campagne est taggée sur la saison ACTIVE DU CLUB, pas sur la saison
        // consultée : créer une campagne en regardant les archives de l'an
        // dernier ne doit pas l'y ranger.
        season: clubSeason,
        conditions: form.conditions.trim() || null,
      });
      setModalOpen(false);
      setSessions((prev) => [created, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création impossible.');
    } finally {
      setCreating(false);
    }
  };

  const teamName = (teamId: string | null) =>
    teamId ? (teams.find((t) => t.id === teamId)?.name ?? 'Équipe supprimée') : 'Tout le club';

  if (clubLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement…
      </div>
    );
  }

  if (!club) {
    return (
      <div className="p-6">
        <p className="text-gray-600">Aucun club rattaché à votre compte.</p>
      </div>
    );
  }

  const canCreate = !form.teamId || canEditTeam(form.teamId);

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tests physiques</h1>
          <p className="mt-1 text-sm text-gray-600">
            {club.name} · saison {activeSeason}
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-5 w-5" />
          Nouvelle campagne
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement des campagnes…
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-400 bg-white py-12 text-center">
          <p className="mb-1 text-gray-600">Aucune campagne sur cette saison.</p>
          <p className="text-sm text-gray-500">
            Créez-en une ici, ou ouvrez « Tests physiques » depuis une séance sur mobile.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <ul className="divide-y divide-gray-200">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/webapp/manager/tests/${session.id}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-gray-50"
                >
                  <CalendarDays className="h-5 w-5 shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900">
                      {session.label || 'Campagne de tests'}
                    </p>
                    <p className="truncate text-sm text-gray-600">
                      {fmtDate(session.date)} · {teamName(session.team_id)}
                      {session.training_id ? ' · rattachée à une séance' : ''}
                      {session.conditions ? ` · ${session.conditions}` : ''}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Nouvelle campagne</h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Fermer"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="test-date" className="mb-1 block text-sm font-medium text-gray-700">
                  Date
                </label>
                <input
                  id="test-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="test-team" className="mb-1 block text-sm font-medium text-gray-700">
                  Équipe
                </label>
                <select
                  id="test-team"
                  value={form.teamId}
                  onChange={(e) => setForm((f) => ({ ...f, teamId: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Tout le club</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                {!canCreate && (
                  <p className="mt-1 text-sm text-red-600">
                    Vous ne pouvez pas créer de campagne sur cette équipe.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="test-label" className="mb-1 block text-sm font-medium text-gray-700">
                  Intitulé <span className="font-normal text-gray-500">(optionnel)</span>
                </label>
                <input
                  id="test-label"
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="Tests de reprise"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="test-conditions"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Conditions <span className="font-normal text-gray-500">(optionnel)</span>
                </label>
                <input
                  id="test-conditions"
                  type="text"
                  value={form.conditions}
                  onChange={(e) => setForm((f) => ({ ...f, conditions: e.target.value }))}
                  placeholder="Parquet, 21 °C"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {/* Les conditions ne sont pas de la décoration : un sprint sur
                    parquet froid et un sprint sur synthétique ne se comparent
                    pas, et sans la note personne ne s'en souviendra en juin. */}
                <p className="mt-1 text-xs text-gray-500">
                  Surface, température, moment de la journée. Deux campagnes passées dans des
                  conditions différentes ne se comparent pas à l&apos;identique.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !form.date || !canCreate}
                className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Créer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
