'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Calendar, Link2, X } from 'lucide-react';
import { useActiveTeam } from '../../../hooks/useActiveTeam';
import {
  sessionsService,
  type SessionBlock,
  type SessionBlockType,
  type SessionMeta,
} from '@/lib/services/sessionsService';
import { trainingProceduresService, type TrainingProcedureRecord } from '@/lib/services/trainingProceduresService';
import { trainingsService } from '@/lib/services/trainingsService';
import { teamsService } from '@/lib/services/teamsService';
import type { Training } from '@/types';
import { buildDefaultBlocks, newBlock } from '../constants';
import { SessionTimeline } from '../components/SessionTimeline';
import { SessionHeaderForm } from '../components/SessionHeaderForm';
import { SessionBlockCard } from '../components/SessionBlockCard';
import { AddBlockMenu } from '../components/AddBlockMenu';
import { ProcedurePickerDialog } from '../components/ProcedurePickerDialog';
import { AttachTrainingDialog } from '../components/AttachTrainingDialog';

function formatShortDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function emptyMeta(): SessionMeta {
  return { principe: '', dureeTotaleMin: 0 };
}

export default function SessionEditorPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { activeTeam } = useActiveTeam();
  const isNew = params.sessionId === 'new';

  const [recordId, setRecordId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [meta, setMeta] = useState<SessionMeta>(emptyMeta());
  const [blocks, setBlocks] = useState<SessionBlock[]>([]);
  const [procedures, setProcedures] = useState<TrainingProcedureRecord[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [teamNameById, setTeamNameById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerForBlockId, setPickerForBlockId] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const loadTrainings = useCallback(async (clubId: string) => {
    const teams = await teamsService.getTeamsByClub(clubId);
    setTeamNameById(new Map(teams.map((t) => [t.id, t.name])));
    setTrainings(await trainingsService.getTrainingsByTeamIds(teams.map((t) => t.id)));
  }, []);

  useEffect(() => {
    const clubId = activeTeam?.club_id;
    if (!clubId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [procs, existing] = await Promise.all([
          trainingProceduresService.getProceduresByClub(clubId),
          isNew ? Promise.resolve(null) : sessionsService.getSessionById(params.sessionId),
          loadTrainings(clubId),
        ]);
        if (cancelled) return;
        setProcedures(procs);
        if (existing) {
          setRecordId(existing.id);
          setName(existing.name);
          setMeta(existing.meta ?? emptyMeta());
          setBlocks(existing.blocks ?? []);
        } else if (isNew) {
          setBlocks(buildDefaultBlocks());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chargement de la séance impossible');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTeam?.club_id, isNew, params.sessionId, loadTrainings]);

  const attachedTrainings = useMemo(
    () => (recordId ? trainings.filter((t) => t.session_id === recordId) : []),
    [trainings, recordId]
  );

  const handleAttach = useCallback(async (trainingId: string) => {
    try {
      await trainingsService.setTrainingSession(trainingId, recordId);
      if (activeTeam?.club_id) await loadTrainings(activeTeam.club_id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Échec du rattachement.');
    }
  }, [recordId, activeTeam?.club_id, loadTrainings]);

  const handleDetach = useCallback(async (trainingId: string) => {
    try {
      await trainingsService.setTrainingSession(trainingId, null);
      if (activeTeam?.club_id) await loadTrainings(activeTeam.club_id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Échec du détachement.');
    }
  }, [activeTeam?.club_id, loadTrainings]);

  const procedureById = useMemo(() => new Map(procedures.map((p) => [p.id, p])), [procedures]);
  const dureeTotaleMin = useMemo(() => blocks.reduce((sum, b) => sum + (b.duration || 0), 0), [blocks]);

  const patchBlock = useCallback((id: string, patch: Partial<SessionBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);

  const addBlock = useCallback((type: SessionBlockType) => {
    setBlocks((prev) => [...prev, newBlock(type)]);
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const moveBlock = useCallback((id: string, dir: -1 | 1) => {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeTeam?.club_id) return;
    if (!name.trim()) {
      setError('Donne un nom à la séance avant d’enregistrer.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await sessionsService.saveSession({
        id: recordId,
        clubId: activeTeam.club_id,
        name: name.trim(),
        meta: { ...meta, dureeTotaleMin },
        blocks,
      });
      setRecordId(saved.id);
      setJustSaved(true);
      // Reste sur l'éditeur (plus de redirection vers la liste) : une fois
      // enregistrée, la séance peut être rattachée à un entraînement sans
      // perdre le contexte — c'est précisément ce qui manquait à la création.
      if (isNew) router.replace(`/webapp/library/sessions/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’enregistrement de la séance');
    } finally {
      setSaving(false);
    }
  }, [activeTeam?.club_id, name, meta, blocks, recordId, dureeTotaleMin, isNew, router]);

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(t);
  }, [justSaved]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-sm text-gray-500">Chargement…</p>
      </div>
    );
  }

  const pickerBlock = blocks.find((b) => b.id === pickerForBlockId) ?? null;

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24 space-y-5">
      <button onClick={() => router.push('/webapp/library/sessions')} className="text-xs text-gray-500 hover:text-gray-700">
        ← Retour aux séances
      </button>

      {error && <div className="fm-alert fm-alert-error">{error}</div>}

      <SessionHeaderForm
        name={name}
        meta={meta}
        dureeTotaleMin={dureeTotaleMin}
        onNameChange={setName}
        onMetaChange={(patch) => setMeta((m) => ({ ...m, ...patch }))}
      />

      <div>
        <label className="block text-xs font-medium text-gray-800 mb-1.5">Rattachement au calendrier</label>
        {!recordId ? (
          <p className="text-xs text-gray-500">Enregistre la séance une première fois pour pouvoir la rattacher à un entraînement.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {attachedTrainings.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full pl-2 pr-1 py-0.5"
              >
                <Calendar className="h-3 w-3" />
                {formatShortDate(t.date)} · {teamNameById.get(t.team_id || '') || '—'}
                <button
                  onClick={() => handleDetach(t.id)}
                  aria-label="Détacher cet entraînement"
                  className="p-0.5 rounded-full hover:bg-blue-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            <button
              onClick={() => setAttachOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 border border-dashed border-gray-300 rounded-full px-2 py-0.5 hover:border-gray-400 hover:text-gray-700"
            >
              <Link2 className="h-3 w-3" /> Rattacher à un entraînement
            </button>
          </div>
        )}
      </div>

      <SessionTimeline blocks={blocks} />

      <div className="space-y-2.5">
        {blocks.map((block, i) => (
          <SessionBlockCard
            key={block.id}
            block={block}
            index={i}
            total={blocks.length}
            procedure={block.procedureId ? procedureById.get(block.procedureId) ?? null : null}
            onPatch={(patch) => patchBlock(block.id, patch)}
            onRemove={() => removeBlock(block.id)}
            onMoveUp={() => moveBlock(block.id, -1)}
            onMoveDown={() => moveBlock(block.id, 1)}
            onPickProcedure={() => setPickerForBlockId(block.id)}
            onViewSchematic={(schematicId) => window.open(`/webapp/library/schematics?schematic=${schematicId}`, '_blank')}
          />
        ))}
      </div>

      <AddBlockMenu onAdd={addBlock} />

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3">
        <div className="max-w-3xl mx-auto">
          <button onClick={handleSave} disabled={saving} className="fm-btn fm-btn-primary w-full justify-center">
            {saving ? 'Enregistrement…' : justSaved ? 'Enregistré ✓' : 'Enregistrer'}
          </button>
        </div>
      </div>

      <ProcedurePickerDialog
        open={pickerForBlockId != null}
        procedures={procedures}
        onSelect={(procedureId) => { if (pickerBlock) patchBlock(pickerBlock.id, { procedureId }); }}
        onClose={() => setPickerForBlockId(null)}
      />

      <AttachTrainingDialog
        open={attachOpen}
        trainings={trainings}
        teamNameById={teamNameById}
        onSelect={handleAttach}
        onClose={() => setAttachOpen(false)}
      />
    </div>
  );
}
