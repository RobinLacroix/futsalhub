'use client';

import type { SessionBlock } from '@/lib/services/sessionsService';
import { blockMeta } from '../constants';

/**
 * Barre segmentée proportionnelle aux blocs RÉELLEMENT présents dans la
 * séance (pas 6 cases fixes) — une séance de veille de match n'a que 4
 * blocs, la timeline doit le refléter.
 */
export function SessionTimeline({ blocks }: { blocks: SessionBlock[] }) {
  const total = blocks.reduce((sum, b) => sum + (b.duration || 0), 0);

  if (blocks.length === 0) {
    return (
      <p className="text-xs text-gray-500">Ajoute un premier bloc pour voir la timeline de la séance.</p>
    );
  }

  return (
    <div>
      <div className="flex h-5 rounded-md overflow-hidden border border-gray-200">
        {blocks.map((b) => {
          const meta = blockMeta(b.type);
          const pct = total > 0 ? (b.duration / total) * 100 : 0;
          return (
            <div
              key={b.id}
              title={`${meta.shortLabel} — ${b.duration} min`}
              style={{ width: `${pct}%`, backgroundColor: meta.color }}
              className="flex items-center justify-center text-[10px] font-semibold text-white overflow-hidden"
            >
              {pct > 8 ? `${b.duration}'` : ''}
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        {total} min · {blocks.length} bloc{blocks.length > 1 ? 's' : ''}
      </p>
    </div>
  );
}
