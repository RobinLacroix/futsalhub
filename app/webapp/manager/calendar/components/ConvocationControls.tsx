'use client';

/**
 * Contrôles de convocation d'un joueur — extraits de `calendar/page.tsx`.
 *
 * La règle du dépôt sur ce fichier est explicite : « toute modif dessus,
 * décomposer la portion touchée en sous-composant avant d'ajouter du code, ne
 * jamais ajouter au monolithe ». 3 766 lignes, 26 `useState` : ajouter la
 * disponibilité en ligne aurait fait grossir le pire fichier du dépôt d'un
 * cran de plus. Ces boutons vivent donc ici, avec leur pastille.
 *
 * Le composant ne connaît que des callbacks : il ne touche ni à
 * `react-hook-form`, ni à Supabase, ni à l'état de la page. C'est ce qui rend
 * l'extraction sûre malgré l'absence de tests dans le dépôt.
 *
 * ## La pastille est absente pour un joueur disponible
 *
 * Sur un effectif de dix-huit, dix-huit pastilles vertes n'apprennent rien et
 * repoussent le nom du joueur ; deux pastilles ambre se lisent d'un coup d'oeil.
 * Une information qui apparaît partout cesse d'être une information.
 */

import {
  AVAILABILITY_META,
  returnLabel,
  type AvailabilityRow,
  type AvailabilityStatus,
} from '@/lib/availability';
import { TONE_COLORS } from '../../performance/theme';

export function AvailabilityPill({
  status,
  row,
}: {
  status: AvailabilityStatus;
  row: AvailabilityRow | null;
}) {
  if (status === 'disponible') return null;

  const meta = AVAILABILITY_META[status];
  const tone = TONE_COLORS[meta.tone];

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ color: tone.fg, backgroundColor: tone.bg, borderColor: tone.border }}
      title={row ? returnLabel(row) : meta.hint}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: tone.fg }}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}

interface ConvocationControlsProps {
  playerName: string;
  status: AvailabilityStatus;
  row: AvailabilityRow | null;
  /** Renvoie `false` si le coach annule après confirmation. */
  onConvoke: () => void;
  onMarkInjured: () => void;
  /** Glissement vers la droite sur mobile : raccourci « marquer blessé ». */
  onSwipeInjured: () => void;
}

export function ConvocationControls({
  playerName,
  status,
  row,
  onConvoke,
  onMarkInjured,
  onSwipeInjured,
}: ConvocationControlsProps) {
  return (
    <div
      className="flex touch-manipulation items-center gap-2"
      onTouchStart={(e) =>
        ((e.currentTarget as HTMLElement).dataset.touchX = String(
          e.changedTouches?.[0]?.clientX ?? 0,
        ))
      }
      onTouchEnd={(e) => {
        const el = e.currentTarget as HTMLElement;
        const start = Number(el.dataset.touchX) || 0;
        const end = e.changedTouches?.[0]?.clientX ?? 0;
        if (end - start > 60) onSwipeInjured();
      }}
    >
      <AvailabilityPill status={status} row={row} />
      <button
        type="button"
        onClick={onConvoke}
        aria-label={`Convoquer ${playerName}`}
        className="rounded bg-[#16a34a] px-3 py-1.5 text-xs text-white hover:bg-[#15803d]"
      >
        Convoquer
      </button>
      <button
        type="button"
        onClick={onMarkInjured}
        title="Marquer blessé (glisser à droite sur mobile)"
        className="rounded bg-rose-500 px-3 py-1.5 text-xs text-white hover:bg-rose-600"
      >
        Marquer blessé
      </button>
    </div>
  );
}
