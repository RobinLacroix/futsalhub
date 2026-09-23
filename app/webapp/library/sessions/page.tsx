'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { sessionsService, type TrainingSessionRecord, type LearningPhase } from '@/lib/services/sessionsService';
import { trainingsService } from '@/lib/services/trainingsService';
import { teamsService } from '@/lib/services/teamsService';
import type { Training } from '@/types';
import { SessionCard } from './components/SessionCard';
import { AttachTrainingDialog } from './components/AttachTrainingDialog';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const PHASE_FILTERS: { value: LearningPhase | ''; label: string }[] = [
  { value: '', label: 'Toutes' },
  { value: 'Phase 1', label: 'Phase 1' },
  { value: 'Phase 2', label: 'Phase 2' },
  { value: 'Mix', label: 'Mix' },
];

export default function SessionsListPage() {
  const router = useRouter();
  const { activeTeam } = useActiveTeam();
  const [sessions, setSessions] = useState<TrainingSessionRecord[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [teamNameById, setTeamNameById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<LearningPhase | ''>('');
  const [attachForSessionId, setAttachForSessionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const clubId = activeTeam?.club_id;
    if (!clubId) return;
    setLoading(true);
    setError(null);
    try {
      const [sess, teams] = await Promise.all([
        sessionsService.getSessionsByClub(clubId),
        teamsService.getTeamsByClub(clubId),
      ]);
      setSessions(sess);
      setTeamNameById(new Map(teams.map((t) => [t.id, t.name])));
      setTrainings(await trainingsService.getTrainingsByTeamIds(teams.map((t) => t.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement des séances impossible');
    } finally {
      setLoading(false);
    }
  }, [activeTeam?.club_id]);

  useEffect(() => { load(); }, [load]);

  const trainingsBySessionId = useMemo(() => {
    const map = new Map<string, Training[]>();
    for (const t of trainings) {
      if (!t.session_id) continue;
      const list = map.get(t.session_id) || [];
      list.push(t);
      map.set(t.session_id, list);
    }
    return map;
  }, [trainings]);

  const visibleSessions = useMemo(() => {
    let list = sessions;
    if (phaseFilter) list = list.filter((s) => s.meta?.phase === phaseFilter);
    if (search.trim()) {
      const q = norm(search);
      list = list.filter((s) =>
        norm(s.name || '').includes(q) ||
        norm(s.meta?.principe || '').includes(q) ||
        norm(s.meta?.moyen || '').includes(q) ||
        norm(s.meta?.theme || '').includes(q)
      );
    }
    return list;
  }, [sessions, search, phaseFilter]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`Supprimer définitivement la séance « ${name || 'sans titre'} » ?`)) return;
    try {
      await sessionsService.deleteSession(id);
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Échec de la suppression.');
    }
  }, [load]);

  const handleAttach = useCallback(async (trainingId: string) => {
    if (!attachForSessionId) return;
    try {
      await trainingsService.setTrainingSession(trainingId, attachForSessionId);
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Échec du rattachement.');
    }
  }, [attachForSessionId, load]);

  const handleDetach = useCallback(async (trainingId: string) => {
    try {
      await trainingsService.setTrainingSession(trainingId, null);
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Échec du détachement.');
    }
  }, [load]);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-base font-semibold text-gray-900">Séances</h1>
        <button
          onClick={() => router.push('/webapp/library/sessions/new')}
          className="fm-btn fm-btn-primary fm-btn-sm"
        >
          <Plus className="h-3.5 w-3.5" /> Nouvelle séance
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="search"
            className="fm-input pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, principe, moyen, thème…"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PHASE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setPhaseFilter(f.value)}
              className="px-2.5 py-1 rounded-full text-xs border transition-colors"
              style={
                phaseFilter === f.value
                  ? { backgroundColor: '#EFF6FF', color: 'var(--fh-accent, #2563EB)', borderColor: 'var(--fh-accent, #2563EB)', fontWeight: 600 }
                  : { backgroundColor: '#fff', color: '#6B7280', borderColor: '#E5E7EB' }
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="fm-alert fm-alert-error">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : visibleSessions.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          {sessions.length === 0
            ? 'Aucune séance — commence avec « Nouvelle séance ».'
            : 'Aucune séance ne correspond à cette recherche.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleSessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              attachedTrainings={trainingsBySessionId.get(s.id) || []}
              teamNameById={teamNameById}
              onOpen={() => router.push(`/webapp/library/sessions/${s.id}`)}
              onDelete={() => handleDelete(s.id, s.name)}
              onAttach={() => setAttachForSessionId(s.id)}
              onDetach={handleDetach}
            />
          ))}
        </div>
      )}

      <AttachTrainingDialog
        open={attachForSessionId != null}
        trainings={trainings}
        teamNameById={teamNameById}
        onSelect={handleAttach}
        onClose={() => setAttachForSessionId(null)}
      />
    </div>
  );
}
