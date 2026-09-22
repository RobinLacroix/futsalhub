import type { SessionBlock, SessionBlockType } from '@/lib/services/sessionsService';

export interface BlockTypeMeta {
  value: SessionBlockType;
  label: string;
  shortLabel: string;
  color: string;       // segment de la timeline + point de couleur sur la carte
  isCore: boolean;      // Bloc 3 — mise en avant "CŒUR"
  defaultDuration: number;
}

export const BLOCK_TYPES: BlockTypeMeta[] = [
  { value: 'Echauffement', label: 'Échauffement ludique', shortLabel: 'Échauffement', color: '#94A3B8', isCore: false, defaultDuration: 15 },
  { value: 'Problematisation', label: 'Problématisation', shortLabel: 'Problématisation', color: '#60A5FA', isCore: false, defaultDuration: 15 },
  { value: 'Situation', label: 'Situation isolée', shortLabel: 'Situation', color: 'var(--fh-accent, #6C5CE0)', isCore: true, defaultDuration: 20 },
  { value: 'Analytique', label: 'Analytique', shortLabel: 'Analytique', color: '#C4B5FD', isCore: false, defaultDuration: 10 },
  { value: 'JeuOriente', label: 'Jeu orienté', shortLabel: 'Jeu orienté', color: '#FB923C', isCore: false, defaultDuration: 15 },
  { value: 'MatchLibre', label: 'Match libre', shortLabel: 'Match libre', color: '#A8A29E', isCore: false, defaultDuration: 15 },
];

const BLOCK_TYPE_BY_VALUE = new Map(BLOCK_TYPES.map((t) => [t.value, t]));

export function blockMeta(type: SessionBlockType): BlockTypeMeta {
  return BLOCK_TYPE_BY_VALUE.get(type) || BLOCK_TYPES[2];
}

let idSeq = 0;
function newBlockId(): string {
  idSeq += 1;
  return `b${Date.now()}${idSeq}`;
}

/** Seed par défaut d'une nouvelle séance — les 6 blocs dans l'ordre, durée totale 90 min. */
export function buildDefaultBlocks(): SessionBlock[] {
  return BLOCK_TYPES.map((t) => ({
    id: newBlockId(),
    type: t.value,
    duration: t.defaultDuration,
    procedureId: null,
    intentionPedagogique: '',
  }));
}

export function newBlock(type: SessionBlockType): SessionBlock {
  const meta = blockMeta(type);
  return { id: newBlockId(), type, duration: meta.defaultDuration, procedureId: null, intentionPedagogique: '' };
}
