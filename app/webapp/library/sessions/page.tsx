'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { sessionsService, type TrainingSessionRecord } from '@/lib/services/sessionsService';

export default function SessionsListPage() {
  const router = useRouter();
  const { activeTeam } = useActiveTeam();
  const [sessions, setSessions] = useState<TrainingSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const clubId = activeTeam?.club_id;
    if (!clubId) return;
    setLoading(true);
    setError(null);
    try {
      setSessions(await sessionsService.getSessionsByClub(clubId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement des séances impossible');
    } finally {
      setLoading(false);
    }
  }, [activeTeam?.club_id]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`Supprimer définitivement la séance « ${name || 'sans titre'} » ?`)) return;
    try {
      await sessionsService.deleteSession(id);
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Échec de la suppression.');
    }
  }, [load]);

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-gray-900">Séances</h1>
        <button
          onClick={() => router.push('/webapp/library/sessions/new')}
          className="fm-btn fm-btn-primary fm-btn-sm"
        >
          <Plus className="h-3.5 w-3.5" /> Nouvelle séance
        </button>
      </div>

      {error && <div className="fm-alert fm-alert-error">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          Aucune séance — commence avec &laquo; Nouvelle séance &raquo;.
        </p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="fm-card flex items-center justify-between p-3 cursor-pointer hover:border-gray-300"
              style={{ marginBottom: 0 }}
              onClick={() => router.push(`/webapp/library/sessions/${s.id}`)}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{s.name || 'Sans titre'}</p>
                <p className="text-xs text-gray-500">
                  {s.blocks?.length ?? 0} bloc{(s.blocks?.length ?? 0) > 1 ? 's' : ''}
                  {s.meta?.dureeTotaleMin ? ` · ${s.meta.dureeTotaleMin} min` : ''}
                  {s.meta?.principe ? ` · ${s.meta.principe}` : ''}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(s.id, s.name); }}
                aria-label="Supprimer la séance"
                className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
