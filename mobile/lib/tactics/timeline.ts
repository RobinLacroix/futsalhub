import type {
  Drill,
  DrillEntity,
  DrillEntityTimelineRecord,
  DrillKeyframe,
  DrillLine,
  DrillPulse,
  DrillText,
  DrillTimeline,
  DrillTimelineClip,
  DrillVariant,
  DrillZone,
} from './types';

/**
 * Port fidèle des fonctions de `public/tools/tactics/render-core.js` qui
 * échantillonnent une position/un état à un instant t (ms) plutôt qu'à un
 * index d'étape — fondation du lecteur d'animation mobile (DrillPlayer).
 *
 * Ne PAS diverger des formules d'origine : c'est ce qui garantit qu'un
 * schéma animé se joue pareil sur le site et dans l'app (même mathématique
 * de courbe, même modèle de clips). Toute correction doit être portée dans
 * les deux fichiers.
 */

function findById<T extends { id: string }>(arr: T[], id: string): T | null {
  for (let i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
  return null;
}

/** Frontières temporelles (ms) de chaque étape — même calcul que stepBoundariesMs (web). */
export function stepBoundariesMs(keyframes: DrillKeyframe[]): number[] {
  const out = [0];
  for (let k = 0; k < keyframes.length - 1; k++) out.push(out[k] + (keyframes[k].durationMs || 1500));
  return out;
}

/** Port de buildEntityTimeline (web) — reconstruit la timeline canonique depuis des keyframes "snapshot". */
export function buildEntityTimeline(keyframes: DrillKeyframe[]): DrillTimeline {
  const N = keyframes.length;
  const ids: Record<string, true> = {};
  keyframes.forEach((kf) => kf.entities.forEach((e) => { ids[e.id] = true; }));
  const startMsAt = [0];
  for (let k = 0; k < N - 1; k++) startMsAt.push(startMsAt[k] + (keyframes[k].durationMs || 1500));

  const entities: DrillTimeline['entities'] = {};
  Object.keys(ids).forEach((id) => {
    const clips: DrillTimelineClip[] = [];
    let spawn: DrillEntity | null = null;
    for (let seg = 0; seg < N - 1; seg++) {
      const ea = findById(keyframes[seg].entities, id);
      const eb = findById(keyframes[seg + 1].entities, id);
      if (!ea || !eb) continue;
      if (spawn === null) spawn = JSON.parse(JSON.stringify(ea));
      const clip: DrillTimelineClip = {
        startMs: startMsAt[seg],
        durationMs: keyframes[seg].durationMs || 1500,
        toX: eb.x,
        toY: eb.y,
        to: JSON.parse(JSON.stringify(eb)),
      };
      if (ea.x !== eb.x || ea.y !== eb.y) {
        if (ea.curve) clip.curve = true;
        if (Array.isArray(ea.ctrls) && ea.ctrls.length) clip.ctrls = ea.ctrls as Array<{ x: number; y: number }>;
      }
      clips.push(clip);
    }
    if (spawn === null) {
      const first = findById(keyframes[0]?.entities ?? [], id);
      spawn = first ? JSON.parse(JSON.stringify(first)) : ({ id, type: 'player', team: 'none', x: 0, y: 0 } as DrillEntity);
    }
    entities[id] = { spawn: spawn as DrillEntity, clips };
  });

  return { totalMs: startMsAt[N - 1] || 0, entities };
}

/** La variante à jouer — celle demandée (sélecteur de variantes du lecteur), sinon la variante active du schéma, sinon les keyframes racine (schéma sans variante, format le plus ancien). */
export function resolveVariant(drill: Drill, variantIndex?: number): { name: string; keyframes: DrillKeyframe[]; timeline?: DrillTimeline } {
  const idx = variantIndex ?? drill.activeVariantIndex ?? 0;
  const variant = drill.variants?.[idx] as (DrillVariant & { keyframes: DrillKeyframe[] }) | undefined;
  if (variant) return { name: variant.name, keyframes: variant.keyframes, timeline: variant.timeline };
  return { name: 'Variante 1', keyframes: drill.keyframes ?? [] };
}

/** Lit `variant.timeline` s'il existe, le reconstruit depuis ses `keyframes` sinon (schéma jamais rouvert côté éditeur depuis l'ajout du mode avancé). */
export function getOrBuildTimeline(drill: Drill, variantIndex?: number): DrillTimeline {
  const { keyframes, timeline } = resolveVariant(drill, variantIndex);
  return timeline ?? buildEntityTimeline(keyframes);
}

// Catmull-Rom 1D (spline lissée passant par p1..p2, influencée par les voisins p0/p3).
function catmullRom1D(p0: number, p1: number, p2: number, p3: number, u: number): number {
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}

type Pt = { x: number; y: number };

function quadBezierPoint(p0: Pt, c: Pt, p1: Pt, u: number): Pt {
  const mu = 1 - u;
  return { x: mu * mu * p0.x + 2 * mu * u * c.x + u * u * p1.x, y: mu * mu * p0.y + 2 * mu * u * c.y + u * u * p1.y };
}

function quadChainSegments(from: Pt, ctrls: Pt[] | undefined, to: Pt): Array<{ p0: Pt; c: Pt | null; p1: Pt }> {
  if (!ctrls || !ctrls.length) return [{ p0: from, c: null, p1: to }];
  const segs: Array<{ p0: Pt; c: Pt | null; p1: Pt }> = [];
  let onCurve = from;
  for (let i = 0; i < ctrls.length; i++) {
    const c = ctrls[i];
    const nextOn = i < ctrls.length - 1 ? { x: (c.x + ctrls[i + 1].x) / 2, y: (c.y + ctrls[i + 1].y) / 2 } : to;
    segs.push({ p0: onCurve, c, p1: nextOn });
    onCurve = nextOn;
  }
  return segs;
}

function quadSegPoint(seg: { p0: Pt; c: Pt | null; p1: Pt }, u: number): Pt {
  return seg.c
    ? quadBezierPoint(seg.p0, seg.c, seg.p1, u)
    : { x: seg.p0.x + (seg.p1.x - seg.p0.x) * u, y: seg.p0.y + (seg.p1.y - seg.p0.y) * u };
}

/** Position à la fraction globale f (0..1) le long d'une chaîne de points de courbure — même convention que quadChainPointAt (web). */
function quadChainPointAt(from: Pt, ctrls: Pt[] | undefined, to: Pt, f: number): Pt {
  const segs = quadChainSegments(from, ctrls, to);
  const n = segs.length;
  const segF = f * n;
  const si = Math.max(0, Math.min(n - 1, Math.floor(segF)));
  return quadSegPoint(segs[si], segF - si);
}

/** Position d'une entité à l'instant absolu t (ms) — port exact de sampleEntityAt (web). */
export function sampleEntityAt(tl: DrillTimeline, id: string, t: number): Pt | null {
  const rec = tl.entities[id];
  if (!rec) return null;
  let pos: Pt = { x: rec.spawn.x, y: rec.spawn.y };
  for (let i = 0; i < rec.clips.length; i++) {
    const c = rec.clips[i];
    if (t < c.startMs) break;
    const end = c.startMs + c.durationMs;
    if (t >= end) { pos = { x: c.toX, y: c.toY }; continue; }
    const f = c.durationMs > 0 ? (t - c.startMs) / c.durationMs : 1;
    const fromX = pos.x, fromY = pos.y;
    if (c.curve) {
      const p0 = i >= 2 ? { x: rec.clips[i - 2].toX, y: rec.clips[i - 2].toY } : { x: rec.spawn.x, y: rec.spawn.y };
      const p3 = i + 1 < rec.clips.length ? { x: rec.clips[i + 1].toX, y: rec.clips[i + 1].toY } : { x: c.toX, y: c.toY };
      return { x: catmullRom1D(p0.x, fromX, c.toX, p3.x, f), y: catmullRom1D(p0.y, fromY, c.toY, p3.y, f) };
    }
    if (c.ctrls && c.ctrls.length) return quadChainPointAt({ x: fromX, y: fromY }, c.ctrls, { x: c.toX, y: c.toY }, f);
    return { x: fromX + (c.toX - fromX) * f, y: fromY + (c.toY - fromY) * f };
  }
  return pos;
}

/** État complet (position + style) d'une entité, figé au dernier clip atteint avant/à t — port de entityStateAtMs (web). */
export function entityStateAtMs(tl: DrillTimeline, id: string, t: number): DrillEntity | null {
  const rec = tl.entities[id];
  if (!rec) return null;
  let state = rec.spawn;
  for (let i = 0; i < rec.clips.length; i++) {
    const c = rec.clips[i];
    if (c.startMs + c.durationMs > t) break;
    state = c.to;
  }
  return state;
}

/** Flèche de déplacement (joueur/appui/ballon) — port de l'objet retourné par computeArrowsAtMs (web, render-core.js). */
export interface DrillArrow {
  type: 'run' | 'pass' | 'dribble';
  from: Pt;
  to: Pt;
  ctrls?: Array<{ x: number; y: number }>;
  pts?: Pt[] | null;
  width?: number;
  aerial?: boolean;
}

const ARROW_MOVED = 0.3;

/** Clip actif d'une entité à l'instant t — port de activeClipIndexAt (web, render-core.js). Borne haute EXCLUSIVE (cf commentaire web) : au ms partagé entre un clip qui se termine et le suivant qui démarre, on bascule immédiatement sur le nouveau plutôt que de laisser la flèche du précédent une image de plus. */
function activeClipIndexAt(rec: DrillEntityTimelineRecord, t: number, totalMs: number): number {
  for (let i = 0; i < rec.clips.length; i++) {
    const c = rec.clips[i];
    if (t >= c.startMs && t < c.startMs + c.durationMs) return i;
  }
  const n = rec.clips.length;
  if (n && t >= totalMs) return n - 1;
  return -1;
}

/** État "de départ" du clip ci — port de clipFromState (web). */
function clipFromState(rec: DrillEntityTimelineRecord, ci: number): DrillEntity {
  return ci > 0 ? rec.clips[ci - 1].to : rec.spawn;
}

/** Port de curvePointsForClip (web) : même spline Catmull-Rom que sampleEntityAt, échantillonnée sur toute la longueur du clip pour tracer la flèche. */
function curvePointsForClip(rec: DrillEntityTimelineRecord, ci: number, steps: number): Pt[] {
  const clips = rec.clips, c = clips[ci], from = clipFromState(rec, ci);
  const p0 = ci >= 2 ? { x: clips[ci - 2].toX, y: clips[ci - 2].toY } : { x: rec.spawn.x, y: rec.spawn.y };
  const p3 = ci + 1 < clips.length ? { x: clips[ci + 1].toX, y: clips[ci + 1].toY } : { x: c.toX, y: c.toY };
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    pts.push({ x: catmullRom1D(p0.x, from.x, c.toX, p3.x, u), y: catmullRom1D(p0.y, from.y, c.toY, p3.y, u) });
  }
  return pts;
}

/**
 * Flèches visibles à l'instant absolu t (ms) — port de computeArrowsAtMs
 * (web, render-core.js) : chaque entité n'a une flèche que pendant la
 * fenêtre [startMs, startMs+durationMs) de son propre clip actif, exactement
 * synchronisée avec sampleEntityAt qui déplace son jeton (contrairement à
 * l'ancien calcul par étape entière, qui aurait affiché la flèche avant que
 * le jeton ne bouge réellement en mode avancé désynchronisé).
 */
export function computeArrowsAtMs(tl: DrillTimeline, t: number): DrillArrow[] {
  const out: DrillArrow[] = [];
  const ids = Object.keys(tl.entities);
  const states: Record<string, DrillEntity | null> = {};
  ids.forEach((id) => { states[id] = entityStateAtMs(tl, id, t); });

  const carriers: Record<string, string> = {};
  ids.forEach((id) => {
    const st = states[id];
    if (st && st.type === 'ball' && st.attachedTo) carriers[st.attachedTo as string] = id;
  });

  const ballHandled: Record<string, true> = {};
  ids.forEach((id) => {
    const st = states[id];
    if (!st || (st.type !== 'player' && st.type !== 'support')) return;
    const rec = tl.entities[id];
    const ci = activeClipIndexAt(rec, t, tl.totalMs);
    if (ci < 0) return;
    const clip = rec.clips[ci], from = clipFromState(rec, ci);
    const d = Math.hypot(clip.toX - from.x, clip.toY - from.y);
    if (d < ARROW_MOVED) return;
    const arrowWidth = typeof st.arrowWidth === 'number' ? st.arrowWidth : undefined;

    const ballId = carriers[id];
    const brec = ballId ? tl.entities[ballId] : null;
    const bci = brec ? activeClipIndexAt(brec, t, tl.totalMs) : -1;
    if (brec && bci >= 0) {
      const bclip = brec.clips[bci], bfrom = clipFromState(brec, bci);
      const bd = Math.hypot(bclip.toX - bfrom.x, bclip.toY - bfrom.y);
      const together = Math.hypot((bclip.toX - bfrom.x) - (clip.toX - from.x), (bclip.toY - bfrom.y) - (clip.toY - from.y)) < 0.7;
      if (bd >= ARROW_MOVED && together) {
        out.push({
          type: 'dribble',
          from: { x: from.x, y: from.y },
          to: { x: clip.toX, y: clip.toY },
          ctrls: clip.ctrls,
          width: arrowWidth,
          pts: clip.curve ? curvePointsForClip(rec, ci, 16) : null,
        });
        ballHandled[ballId as string] = true;
        return;
      }
    }
    out.push({
      type: 'run',
      from: { x: from.x, y: from.y },
      to: { x: clip.toX, y: clip.toY },
      ctrls: clip.ctrls,
      width: arrowWidth,
      pts: clip.curve ? curvePointsForClip(rec, ci, 16) : null,
    });
  });

  ids.forEach((id) => {
    if (ballHandled[id]) return;
    const st = states[id];
    if (!st || st.type !== 'ball') return;
    const rec = tl.entities[id];
    const ci = activeClipIndexAt(rec, t, tl.totalMs);
    if (ci < 0) return;
    const clip = rec.clips[ci], from = clipFromState(rec, ci);
    const d = Math.hypot(clip.toX - from.x, clip.toY - from.y);
    if (d < ARROW_MOVED) return;
    const arrowWidth = typeof st.arrowWidth === 'number' ? st.arrowWidth : undefined;
    out.push({
      type: 'pass',
      from: { x: from.x, y: from.y },
      to: { x: clip.toX, y: clip.toY },
      ctrls: clip.ctrls,
      width: arrowWidth,
      pts: clip.curve ? curvePointsForClip(rec, ci, 16) : null,
      aerial: !!st.aerial,
    });
  });

  return out;
}

interface VisibilityWindow {
  visibleFrom?: number | null;
  visibleTo?: number | null;
}

/** Port de visibleAt (web) : sans bornes, visible sur tout le procédé (comportement historique). */
export function visibleAt(o: VisibilityWindow, t: number): boolean {
  return (o.visibleFrom == null || t >= o.visibleFrom) && (o.visibleTo == null || t < o.visibleTo);
}

/**
 * Reconstruit un tableau global (avec fenêtres de présence) d'un type de
 * survol par-étape (lignes/textes/pulses) depuis `keyframes[].<key>` — port
 * de buildOverlayGlobal (web), utilisé côté mobile en permanence puisque le
 * JSON sauvegardé ne porte QUE la vue aplatie par étape (drill.lines/textes/
 * pulses "globaux" avec visibleFrom/To sont un état interne à l'éditeur web,
 * jamais persistés tels quels).
 */
export function buildOverlayGlobal<T extends { id: string }>(
  keyframes: DrillKeyframe[],
  key: 'lines' | 'texts' | 'pulses',
): Array<T & VisibilityWindow> {
  const bm = stepBoundariesMs(keyframes);
  const byId: Record<string, { obj: T; first: number; last: number }> = {};
  const order: string[] = [];
  keyframes.forEach((kf, i) => {
    const items = (kf[key] as unknown as T[]) || [];
    items.forEach((o) => {
      if (!byId[o.id]) { byId[o.id] = { obj: JSON.parse(JSON.stringify(o)), first: i, last: i }; order.push(o.id); }
      else byId[o.id].last = i;
    });
  });
  return order.map((id) => {
    const e = byId[id];
    const o: T & VisibilityWindow = e.obj as T & VisibilityWindow;
    if (e.first > 0) o.visibleFrom = bm[e.first];
    if (e.last < keyframes.length - 1) o.visibleTo = bm[e.last + 1];
    return o;
  });
}

export interface DrillFrame {
  entities: DrillEntity[];
  arrows: DrillArrow[];
  lines: DrillLine[];
  texts: DrillText[];
  pulses: DrillPulse[];
  zones: DrillZone[];
}

/** Overlays globaux (lignes/textes/pulses) pré-calculés une fois par schéma — cf buildOverlayGlobal. */
export interface DrillOverlays {
  lines: Array<DrillLine & VisibilityWindow>;
  texts: Array<DrillText & VisibilityWindow>;
  pulses: Array<DrillPulse & VisibilityWindow>;
}

export function buildOverlays(keyframes: DrillKeyframe[]): DrillOverlays {
  return {
    lines: buildOverlayGlobal<DrillLine>(keyframes, 'lines'),
    texts: buildOverlayGlobal<DrillText>(keyframes, 'texts'),
    pulses: buildOverlayGlobal<DrillPulse>(keyframes, 'pulses'),
  };
}

/** État complet du schéma à l'instant t (ms) — entités interpolées + overlays/zones filtrés par fenêtre de présence. */
export function frameAt(drill: Drill, tl: DrillTimeline, overlays: DrillOverlays, t: number): DrillFrame {
  const entities: DrillEntity[] = Object.keys(tl.entities).map((id) => {
    const state = entityStateAtMs(tl, id, t);
    const pos = sampleEntityAt(tl, id, t);
    if (!state) return null;
    return pos ? { ...state, x: pos.x, y: pos.y } : state;
  }).filter((e): e is DrillEntity => !!e);

  return {
    entities,
    arrows: computeArrowsAtMs(tl, t),
    lines: overlays.lines.filter((ln) => visibleAt(ln, t)),
    texts: overlays.texts.filter((tx) => visibleAt(tx, t)),
    pulses: overlays.pulses.filter((pu) => visibleAt(pu, t)),
    zones: (drill.zones ?? []).filter((z) => visibleAt(z as unknown as VisibilityWindow, t)),
  };
}
