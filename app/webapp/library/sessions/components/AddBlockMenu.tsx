'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import type { SessionBlockType } from '@/lib/services/sessionsService';
import { BLOCK_TYPES } from '../constants';

/** "+ Ajouter un bloc" — trame librement modifiable, aucun des 6 types n'est verrouillé ni unique. */
export function AddBlockMenu({ onAdd }: { onAdd: (type: SessionBlockType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-center gap-1.5 p-2.5 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
      >
        <Plus className="h-4 w-4" /> Ajouter un bloc
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {BLOCK_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => { onAdd(t.value); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
