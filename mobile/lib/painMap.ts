// ─────────────────────────────────────────────────────────────────────────────
// painMap.ts — Géométrie et taxonomie partagées du body-map de douleur.
// Fichier sans dépendance UI : dupliqué à l'identique dans web (lib/) et
// mobile (mobile/lib/). Convention latéralité : gauche à l'écran = "G".
// Deux vues (face / dos) partagent la même silhouette, avec un découpage propre.
// ─────────────────────────────────────────────────────────────────────────────

export type PainSide = 'L' | 'R' | 'C';
export type PainMode = 'zone' | 'articulation';
export type PainView = 'front' | 'back';
export type PainIntensity = 1 | 2 | 3;

export interface PainShape {
  kind: 'ellipse' | 'rrect' | 'poly' | 'circle';
  cx?: number; cy?: number; rx?: number; ry?: number; r?: number;
  x?: number; y?: number; w?: number; h?: number;
  points?: [number, number][];
}

export interface PainZoneDef {
  id: string;        // identifiant stable stocké en base (unique tous modes/vues)
  label: string;     // ex "Ischio G" — sert de chip et d'étiquette staff
  side: PainSide;
  mode: PainMode;
  view: PainView;    // vue d'appartenance (les articulations valent pour les deux)
  anchor: { x: number; y: number };
  shape: PainShape;
}

export const PAIN_VIEWBOX = { w: 220, h: 470 } as const;

export const INTENSITY_COLORS: Record<PainIntensity, string> = {
  1: '#fbbf24', // jaune  — modérée
  2: '#f97316', // orange — assez intense
  3: '#dc2626', // rouge  — très intense
};

export const INTENSITY_LABELS: Record<PainIntensity, string> = {
  1: 'Modérée',
  2: 'Assez intense',
  3: 'Très intense',
};

export const BODY_STROKE = '#94a3b8';
export const BODY_FILL = '#ffffff';

// ── Vue de FACE — zones ───────────────────────────────────────────────────────
export const FRONT_ZONES: PainZoneDef[] = [
  { id: 'head',       label: 'Tête',         side: 'C', mode: 'zone', view: 'front', anchor: { x: 110, y: 34 },  shape: { kind: 'ellipse', cx: 110, cy: 34, rx: 19, ry: 23 } },
  { id: 'neck',       label: 'Cou',          side: 'C', mode: 'zone', view: 'front', anchor: { x: 110, y: 62 },  shape: { kind: 'rrect', x: 101, y: 54, w: 18, h: 15, r: 5 } },
  { id: 'shoulder_l', label: 'Épaule G',     side: 'L', mode: 'zone', view: 'front', anchor: { x: 74,  y: 86 },  shape: { kind: 'ellipse', cx: 74, cy: 86, rx: 17, ry: 14 } },
  { id: 'shoulder_r', label: 'Épaule D',     side: 'R', mode: 'zone', view: 'front', anchor: { x: 146, y: 86 },  shape: { kind: 'ellipse', cx: 146, cy: 86, rx: 17, ry: 14 } },
  { id: 'chest',      label: 'Pectoraux',    side: 'C', mode: 'zone', view: 'front', anchor: { x: 110, y: 106 }, shape: { kind: 'rrect', x: 80, y: 80, w: 60, h: 52, r: 16 } },
  { id: 'biceps_l',   label: 'Biceps G',     side: 'L', mode: 'zone', view: 'front', anchor: { x: 61,  y: 126 }, shape: { kind: 'rrect', x: 52, y: 92, w: 18, h: 68, r: 9 } },
  { id: 'biceps_r',   label: 'Biceps D',     side: 'R', mode: 'zone', view: 'front', anchor: { x: 159, y: 126 }, shape: { kind: 'rrect', x: 150, y: 92, w: 18, h: 68, r: 9 } },
  { id: 'abdomen',    label: 'Abdominaux',   side: 'C', mode: 'zone', view: 'front', anchor: { x: 110, y: 163 }, shape: { kind: 'rrect', x: 82, y: 134, w: 56, h: 58, r: 12 } },
  { id: 'forearm_l',  label: 'Avant-bras G', side: 'L', mode: 'zone', view: 'front', anchor: { x: 54,  y: 192 }, shape: { kind: 'rrect', x: 46, y: 162, w: 17, h: 60, r: 8 } },
  { id: 'forearm_r',  label: 'Avant-bras D', side: 'R', mode: 'zone', view: 'front', anchor: { x: 166, y: 192 }, shape: { kind: 'rrect', x: 157, y: 162, w: 17, h: 60, r: 8 } },
  { id: 'groin',      label: 'Aine / adducteurs', side: 'C', mode: 'zone', view: 'front', anchor: { x: 110, y: 214 }, shape: { kind: 'poly', points: [[84,192],[136,192],[126,232],[110,242],[94,232]] } },
  { id: 'hand_l',     label: 'Main G',       side: 'L', mode: 'zone', view: 'front', anchor: { x: 54,  y: 234 }, shape: { kind: 'ellipse', cx: 54, cy: 234, rx: 11, ry: 13 } },
  { id: 'hand_r',     label: 'Main D',       side: 'R', mode: 'zone', view: 'front', anchor: { x: 166, y: 234 }, shape: { kind: 'ellipse', cx: 166, cy: 234, rx: 11, ry: 13 } },
  { id: 'quad_l',     label: 'Quadriceps G', side: 'L', mode: 'zone', view: 'front', anchor: { x: 95,  y: 258 }, shape: { kind: 'rrect', x: 82, y: 206, w: 26, h: 104, r: 13 } },
  { id: 'quad_r',     label: 'Quadriceps D', side: 'R', mode: 'zone', view: 'front', anchor: { x: 125, y: 258 }, shape: { kind: 'rrect', x: 112, y: 206, w: 26, h: 104, r: 13 } },
  { id: 'knee_l',     label: 'Genou G',      side: 'L', mode: 'zone', view: 'front', anchor: { x: 95,  y: 322 }, shape: { kind: 'ellipse', cx: 95, cy: 322, rx: 14, ry: 12 } },
  { id: 'knee_r',     label: 'Genou D',      side: 'R', mode: 'zone', view: 'front', anchor: { x: 125, y: 322 }, shape: { kind: 'ellipse', cx: 125, cy: 322, rx: 14, ry: 12 } },
  { id: 'shin_l',     label: 'Tibia G',      side: 'L', mode: 'zone', view: 'front', anchor: { x: 95,  y: 374 }, shape: { kind: 'rrect', x: 84, y: 336, w: 22, h: 76, r: 10 } },
  { id: 'shin_r',     label: 'Tibia D',      side: 'R', mode: 'zone', view: 'front', anchor: { x: 125, y: 374 }, shape: { kind: 'rrect', x: 114, y: 336, w: 22, h: 76, r: 10 } },
  { id: 'ankle_l',    label: 'Cheville G',   side: 'L', mode: 'zone', view: 'front', anchor: { x: 95,  y: 420 }, shape: { kind: 'ellipse', cx: 95, cy: 420, rx: 9, ry: 8 } },
  { id: 'ankle_r',    label: 'Cheville D',   side: 'R', mode: 'zone', view: 'front', anchor: { x: 125, y: 420 }, shape: { kind: 'ellipse', cx: 125, cy: 420, rx: 9, ry: 8 } },
  { id: 'foot_l',     label: 'Pied G',       side: 'L', mode: 'zone', view: 'front', anchor: { x: 94,  y: 441 }, shape: { kind: 'poly', points: [[85,430],[105,430],[107,451],[82,451]] } },
  { id: 'foot_r',     label: 'Pied D',       side: 'R', mode: 'zone', view: 'front', anchor: { x: 126, y: 441 }, shape: { kind: 'poly', points: [[115,430],[135,430],[138,451],[113,451]] } },
];

// ── Vue de DOS — zones (même silhouette, découpage postérieur) ─────────────────
export const BACK_ZONES: PainZoneDef[] = [
  { id: 'head_back',    label: 'Crâne',        side: 'C', mode: 'zone', view: 'back', anchor: { x: 110, y: 34 },  shape: { kind: 'ellipse', cx: 110, cy: 34, rx: 19, ry: 23 } },
  { id: 'nape',         label: 'Nuque',        side: 'C', mode: 'zone', view: 'back', anchor: { x: 110, y: 62 },  shape: { kind: 'rrect', x: 101, y: 54, w: 18, h: 15, r: 5 } },
  { id: 'shoulder_bl',  label: 'Épaule G',     side: 'L', mode: 'zone', view: 'back', anchor: { x: 74,  y: 86 },  shape: { kind: 'ellipse', cx: 74, cy: 86, rx: 17, ry: 14 } },
  { id: 'shoulder_br',  label: 'Épaule D',     side: 'R', mode: 'zone', view: 'back', anchor: { x: 146, y: 86 },  shape: { kind: 'ellipse', cx: 146, cy: 86, rx: 17, ry: 14 } },
  { id: 'upper_back',   label: 'Haut du dos',  side: 'C', mode: 'zone', view: 'back', anchor: { x: 110, y: 106 }, shape: { kind: 'rrect', x: 80, y: 80, w: 60, h: 52, r: 16 } },
  { id: 'triceps_l',    label: 'Triceps G',    side: 'L', mode: 'zone', view: 'back', anchor: { x: 61,  y: 126 }, shape: { kind: 'rrect', x: 52, y: 92, w: 18, h: 68, r: 9 } },
  { id: 'triceps_r',    label: 'Triceps D',    side: 'R', mode: 'zone', view: 'back', anchor: { x: 159, y: 126 }, shape: { kind: 'rrect', x: 150, y: 92, w: 18, h: 68, r: 9 } },
  { id: 'lower_back',   label: 'Lombaires',    side: 'C', mode: 'zone', view: 'back', anchor: { x: 110, y: 163 }, shape: { kind: 'rrect', x: 82, y: 134, w: 56, h: 58, r: 12 } },
  { id: 'forearm_bl',   label: 'Avant-bras G', side: 'L', mode: 'zone', view: 'back', anchor: { x: 54,  y: 192 }, shape: { kind: 'rrect', x: 46, y: 162, w: 17, h: 60, r: 8 } },
  { id: 'forearm_br',   label: 'Avant-bras D', side: 'R', mode: 'zone', view: 'back', anchor: { x: 166, y: 192 }, shape: { kind: 'rrect', x: 157, y: 162, w: 17, h: 60, r: 8 } },
  { id: 'hand_bl',      label: 'Main G',       side: 'L', mode: 'zone', view: 'back', anchor: { x: 54,  y: 234 }, shape: { kind: 'ellipse', cx: 54, cy: 234, rx: 11, ry: 13 } },
  { id: 'hand_br',      label: 'Main D',       side: 'R', mode: 'zone', view: 'back', anchor: { x: 166, y: 234 }, shape: { kind: 'ellipse', cx: 166, cy: 234, rx: 11, ry: 13 } },
  { id: 'glute_l',      label: 'Fessier G',    side: 'L', mode: 'zone', view: 'back', anchor: { x: 95,  y: 216 }, shape: { kind: 'rrect', x: 82, y: 196, w: 26, h: 42, r: 12 } },
  { id: 'glute_r',      label: 'Fessier D',    side: 'R', mode: 'zone', view: 'back', anchor: { x: 125, y: 216 }, shape: { kind: 'rrect', x: 112, y: 196, w: 26, h: 42, r: 12 } },
  { id: 'hamstring_l',  label: 'Ischio G',     side: 'L', mode: 'zone', view: 'back', anchor: { x: 95,  y: 276 }, shape: { kind: 'rrect', x: 82, y: 242, w: 26, h: 68, r: 13 } },
  { id: 'hamstring_r',  label: 'Ischio D',     side: 'R', mode: 'zone', view: 'back', anchor: { x: 125, y: 276 }, shape: { kind: 'rrect', x: 112, y: 242, w: 26, h: 68, r: 13 } },
  { id: 'knee_bl',      label: 'Creux poplité G', side: 'L', mode: 'zone', view: 'back', anchor: { x: 95, y: 322 }, shape: { kind: 'ellipse', cx: 95, cy: 322, rx: 14, ry: 12 } },
  { id: 'knee_br',      label: 'Creux poplité D', side: 'R', mode: 'zone', view: 'back', anchor: { x: 125, y: 322 }, shape: { kind: 'ellipse', cx: 125, cy: 322, rx: 14, ry: 12 } },
  { id: 'calf_l',       label: 'Mollet G',     side: 'L', mode: 'zone', view: 'back', anchor: { x: 95,  y: 374 }, shape: { kind: 'rrect', x: 84, y: 336, w: 22, h: 76, r: 10 } },
  { id: 'calf_r',       label: 'Mollet D',     side: 'R', mode: 'zone', view: 'back', anchor: { x: 125, y: 374 }, shape: { kind: 'rrect', x: 114, y: 336, w: 22, h: 76, r: 10 } },
  { id: 'ankle_bl',     label: 'Cheville G',   side: 'L', mode: 'zone', view: 'back', anchor: { x: 95,  y: 420 }, shape: { kind: 'ellipse', cx: 95, cy: 420, rx: 9, ry: 8 } },
  { id: 'ankle_br',     label: 'Cheville D',   side: 'R', mode: 'zone', view: 'back', anchor: { x: 125, y: 420 }, shape: { kind: 'ellipse', cx: 125, cy: 420, rx: 9, ry: 8 } },
  { id: 'heel_l',       label: 'Talon G',      side: 'L', mode: 'zone', view: 'back', anchor: { x: 94,  y: 441 }, shape: { kind: 'poly', points: [[85,430],[105,430],[107,451],[82,451]] } },
  { id: 'heel_r',       label: 'Talon D',      side: 'R', mode: 'zone', view: 'back', anchor: { x: 126, y: 441 }, shape: { kind: 'poly', points: [[115,430],[135,430],[138,451],[113,451]] } },
];

// ── Articulations (valables pour les deux vues) ───────────────────────────────
const mkJoint = (id: string, label: string, side: PainSide, cx: number, cy: number, r: number, view: PainView): PainZoneDef =>
  ({ id, label, side, mode: 'articulation', view, anchor: { x: cx, y: cy }, shape: { kind: 'circle', cx, cy, r } });

export const JOINT_ZONES: PainZoneDef[] = [
  mkJoint('j_shoulder_l', 'Épaule G',  'L', 74,  88,  11, 'front'),
  mkJoint('j_shoulder_r', 'Épaule D',  'R', 146, 88,  11, 'front'),
  mkJoint('j_elbow_l',    'Coude G',   'L', 58,  160, 10, 'front'),
  mkJoint('j_elbow_r',    'Coude D',   'R', 162, 160, 10, 'front'),
  mkJoint('j_wrist_l',    'Poignet G', 'L', 54,  222, 9,  'front'),
  mkJoint('j_wrist_r',    'Poignet D', 'R', 166, 222, 9,  'front'),
  mkJoint('j_hip_l',      'Hanche G',  'L', 96,  200, 11, 'front'),
  mkJoint('j_hip_r',      'Hanche D',  'R', 124, 200, 11, 'front'),
  mkJoint('j_knee_l',     'Genou G',   'L', 95,  322, 11, 'front'),
  mkJoint('j_knee_r',     'Genou D',   'R', 125, 322, 11, 'front'),
  mkJoint('j_ankle_l',    'Cheville G','L', 95,  420, 9,  'front'),
  mkJoint('j_ankle_r',    'Cheville D','R', 125, 420, 9,  'front'),
];

const ALL_ZONES: PainZoneDef[] = [...FRONT_ZONES, ...BACK_ZONES, ...JOINT_ZONES];
const ZONE_INDEX: Record<string, PainZoneDef> = Object.fromEntries(ALL_ZONES.map(z => [z.id, z]));

/** Zones interactives pour une vue + un mode donnés. */
export function zonesFor(view: PainView, mode: PainMode): PainZoneDef[] {
  if (mode === 'articulation') return JOINT_ZONES;
  return view === 'back' ? BACK_ZONES : FRONT_ZONES;
}

/** Silhouette de contexte (faible opacité) pour le mode articulation. */
export function bodyContextFor(view: PainView): PainZoneDef[] {
  return view === 'back' ? BACK_ZONES : FRONT_ZONES;
}

export function zoneById(id: string): PainZoneDef | undefined {
  return ZONE_INDEX[id];
}

export function zoneLabel(id: string): string {
  return ZONE_INDEX[id]?.label ?? id;
}

// Payload envoyé aux RPC report_my_pain / report_pain_by_token
export interface PainZonePayload {
  zone: string;
  side: PainSide;
  intensity: PainIntensity;
  mode: PainMode;
}

export function toPayload(selection: Record<string, PainIntensity>): PainZonePayload[] {
  return Object.entries(selection)
    .filter(([, intensity]) => intensity >= 1 && intensity <= 3)
    .map(([id, intensity]) => {
      const z = ZONE_INDEX[id];
      return { zone: id, side: z?.side ?? 'C', intensity, mode: z?.mode ?? 'zone' };
    });
}
