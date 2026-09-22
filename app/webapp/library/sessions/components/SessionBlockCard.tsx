'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, X, FileText, Eye } from 'lucide-react';
import type { SessionBlock } from '@/lib/services/sessionsService';
import type { TrainingProcedureRecord } from '@/lib/services/trainingProceduresService';
import { blockMeta } from '../constants';

export interface SessionBlockCardProps {
  block: SessionBlock;
  index: number;
  total: number;
  procedure: TrainingProcedureRecord | null;
  onPatch: (patch: Partial<SessionBlock>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPickProcedure: () => void;
  onViewSchematic?: (schematicId: string) => void;
}

/**
 * Carte compacte : type + durée + contrôles sur une ligne, aperçu du
 * procédé, intention pédagogique repliée derrière un disclosure — permet un
 * scan rapide de toute la séance plutôt que des champs toujours ouverts.
 */
export function SessionBlockCard({
  block, index, total, procedure, onPatch, onRemove, onMoveUp, onMoveDown, onPickProcedure, onViewSchematic,
}: SessionBlockCardProps) {
  const [showIntention, setShowIntention] = useState(!!block.intentionPedagogique);
  const meta = blockMeta(block.type);

  return (
    <div className="fm-card" style={{ marginBottom: 0 }}>
      <div className="flex items-stretch">
        {meta.isCore && <span className="fm-card-accent" />}
        <div className="flex-1 p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            {meta.isCore && (
              <span
                style={{ backgroundColor: 'var(--fh-accent, #6C5CE0)' }}
                className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0"
              >
                Cœur
              </span>
            )}
            <span className="text-sm font-semibold text-gray-900">{meta.label}</span>
            <input
              type="number"
              min={0}
              className="fm-input w-16 py-1 text-xs ml-auto"
              value={block.duration}
              onChange={(e) => onPatch({ duration: parseInt(e.target.value, 10) || 0 })}
            />
            <span className="text-xs text-gray-500">min</span>
            <div className="flex items-center gap-0.5 border-l border-gray-200 pl-2 ml-1">
              <button
                onClick={onMoveUp}
                disabled={index === 0}
                aria-label="Monter le bloc"
                className="p-1 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onMoveDown}
                disabled={index === total - 1}
                aria-label="Descendre le bloc"
                className="p-1 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onRemove}
                aria-label="Retirer le bloc"
                className="p-1 rounded text-red-500 hover:bg-red-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <button
            onClick={onPickProcedure}
            className="w-full flex items-center gap-2 p-1.5 rounded-md bg-gray-50 hover:bg-gray-100 border border-gray-200 text-left transition-colors"
          >
            {procedure?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={procedure.image_url} alt="" className="w-9 h-6 object-cover rounded border border-gray-200 shrink-0" />
            ) : (
              <span className="w-9 h-6 rounded border border-gray-200 bg-white flex items-center justify-center shrink-0">
                <FileText className="h-3 w-3 text-gray-400" />
              </span>
            )}
            <span className="text-xs text-gray-800 truncate">
              {procedure ? (procedure.title || 'Sans titre') : 'Choisir un procédé (optionnel)'}
            </span>
            {procedure?.schematic_id && onViewSchematic && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onViewSchematic(procedure.schematic_id as string); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onViewSchematic(procedure.schematic_id as string); } }}
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline shrink-0"
              >
                <Eye className="h-3 w-3" /> Schéma
              </span>
            )}
          </button>

          {showIntention ? (
            <textarea
              className="fm-textarea text-xs"
              rows={2}
              value={block.intentionPedagogique}
              onChange={(e) => onPatch({ intentionPedagogique: e.target.value })}
              placeholder="Ce que ce bloc doit produire"
            />
          ) : (
            <button
              onClick={() => setShowIntention(true)}
              className="text-[11px] text-gray-400 hover:text-gray-600"
            >
              + Intention pédagogique (optionnel)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
