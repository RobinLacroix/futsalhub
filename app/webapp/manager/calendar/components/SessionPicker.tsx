'use client';

// Sélecteur de séance pour la modale training du calendrier — remplace
// l'ancien éditeur sessionParts intégré (cf SPEC_ASSEMBLEUR_SEANCE_PHASE2_2026-09.md
// §4). Ne fait que RÉFÉRENCER une séance de la bibliothèque du club (FK
// trainings.session_id) ; la construire/l'éditer se fait dans l'assembleur
// dédié (/webapp/library/sessions), ouvert dans un nouvel onglet.

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ExternalLink, Trash2 } from 'lucide-react';
import { sessionsService, type TrainingSessionRecord } from '@/lib/services/sessionsService';

interface SessionPickerProps {
  clubId: string | undefined;
  value: string | null | undefined;
  onChange: (sessionId: string | null) => void;
}

export function SessionPicker({ clubId, value, onChange }: SessionPickerProps) {
  const [sessions, setSessions] = useState<TrainingSessionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    try {
      const data = await sessionsService.getSessionsByClub(clubId);
      setSessions(data);
    } catch (err) {
      console.error('SessionPicker: erreur de chargement des séances', err);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const selected = sessions.find((s) => s.id === value);

  const handleDelete = async () => {
    if (!selected) return;
    if (!window.confirm(`Supprimer définitivement la séance « ${selected.name || 'sans titre'} » ? Les trainings qui la référencent la perdront (rien d'autre n'est touché).`)) return;
    setDeleting(true);
    try {
      await sessionsService.deleteSession(selected.id);
      onChange(null);
      await fetchSessions();
    } catch (err) {
      console.error('SessionPicker: erreur de suppression', err);
      window.alert('Échec de la suppression de la séance.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-800 mb-1.5">
        Séance
      </label>
      <div className="flex items-center gap-2">
        <select
          className="fm-input flex-1"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={!clubId || loading}
        >
          <option value="">— aucune séance —</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || '(sans titre)'} · {s.meta?.dureeTotaleMin || 0}′ · {s.blocks?.length || 0} bloc(s)
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={fetchSessions}
          disabled={!clubId || loading}
          title="Rafraîchir la liste"
          className="p-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={!selected || deleting}
          title="Supprimer cette séance"
          className="p-2 text-red-600 hover:text-red-800 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-40 disabled:cursor-default"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <a
          href={selected ? `/webapp/library/sessions?session=${selected.id}` : '/webapp/library/sessions'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-300 rounded-md hover:bg-green-100 whitespace-nowrap"
        >
          {selected ? 'Modifier' : 'Créer une séance'}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      {!clubId && (
        <p className="mt-1 text-xs text-gray-500">Équipe active non résolue — impossible de charger les séances.</p>
      )}
      {selected && (
        <p className="mt-1 text-xs text-gray-500">
          {selected.meta?.theme ? `Thème : ${selected.meta.theme}` : ''}
        </p>
      )}
    </div>
  );
}
