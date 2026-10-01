// ─── Taxonomie pédagogique partagée (bloc / format / phase de jeu / intensité) ──
// Extrait de app/webapp/library/page.tsx (2026-09-27) pour être réutilisé par
// le détail d'un procédé côté assembleur de séances (ProcedureDetailsDialog) —
// sans ça, les couleurs/labels des badges auraient fini par diverger entre les
// deux endroits (cf CLAUDE.md, "types/styles non unifiés" déjà source de bugs
// ailleurs dans ce repo).

const MUTED = '#697585';

export const BLOCS = [
  { value: 'Échauffement',      color: '#ea580c', bg: '#FFF7ED', label: 'Éch.'  },
  { value: 'Problématisation',  color: '#2563eb', bg: '#EFF6FF', label: 'Prob.' },
  { value: 'Situation isolée',  color: '#16a34a', bg: '#F0FDF4', label: 'Sit.'  },
  { value: 'Analytique',        color: '#6b7280', bg: '#F9FAFB', label: 'Anal.' },
  { value: 'Jeu orienté',       color: '#7c3aed', bg: '#F5F3FF', label: 'Jeu'   },
  { value: 'Match libre',       color: '#d97706', bg: '#FFFBEB', label: 'Match' },
] as const;

// Format (ex-"type" legacy) : forme de l'exercice, axe distinct du bloc
// (place dans la séance) — décidé avec Robin le 2026-09-22. Colonne DB
// toujours `type`, enum `training_type` + "Rondo/Toro" (migration 20260922110000).
export const FORMATS = [
  { value: 'Echauffement', color: '#d97706', bg: '#FFFBEB', label: 'Éch.' },
  { value: 'Exercice',     color: '#64748b', bg: '#F8FAFC', label: 'Exo'  },
  { value: 'Situation',    color: '#059669', bg: '#ECFDF5', label: 'Sit.' },
  { value: 'Jeu',          color: '#7c3aed', bg: '#F5F3FF', label: 'Jeu'  },
  { value: 'Rondo/Toro',   color: '#0891b2', bg: '#ECFEFF', label: 'Rondo' },
] as const;

// Phase de jeu (ex-"theme" legacy). Colonne DB toujours `theme`, enum
// `training_theme` + "Powerplay".
export const PHASES_DE_JEU = [
  { value: 'Offensif',  color: '#dc2626', bg: '#FEF2F2', label: 'Off.'  },
  { value: 'Transition', color: '#d97706', bg: '#FFFBEB', label: 'Trans.' },
  { value: 'Defensif',  color: '#2563eb', bg: '#EFF6FF', label: 'Déf.'  },
  { value: 'CPA',        color: '#7c3aed', bg: '#F5F3FF', label: 'CPA'   },
  { value: 'Powerplay',  color: '#db2777', bg: '#FDF2F8', label: 'PP'    },
] as const;

export const INTENSITES = [
  { value: 'Légère',  color: '#059669', bg: '#ECFDF5', label: 'Légère'  },
  { value: 'Modérée', color: '#d97706', bg: '#FFFBEB', label: 'Modérée' },
  { value: 'Haute',   color: '#dc2626', bg: '#FEF2F2', label: 'Haute'   },
] as const;

export interface TaxoStyle { value: string; color: string; bg: string; label: string }

export function getTaxoStyle(list: readonly TaxoStyle[], value?: string | null): TaxoStyle {
  const found = list.find((b) => b.value === value);
  if (found) return found;
  return { value: value || '—', color: MUTED, bg: '#F1F2F5', label: value || '—' };
}

export function getBlocStyle(bloc?: string | null): TaxoStyle {
  return getTaxoStyle(BLOCS as unknown as TaxoStyle[], bloc);
}

export function TaxoBadge({ list, value, short = false }: { list: readonly TaxoStyle[]; value?: string | null; short?: boolean }) {
  if (!value) return null;
  const style = getTaxoStyle(list, value);
  return (
    <span
      style={{ backgroundColor: style.bg, color: style.color, border: `1px solid ${style.color}22` }}
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
    >
      {short ? style.label : style.value}
    </span>
  );
}

export function BlocBadge({ bloc, short = false }: { bloc?: string | null; short?: boolean }) {
  if (!bloc) return null;
  const style = getBlocStyle(bloc);
  return (
    <span
      style={{ backgroundColor: style.bg, color: style.color, border: `1px solid ${style.color}22` }}
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
    >
      {short ? style.label : style.value}
    </span>
  );
}
