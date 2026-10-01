import { Line, Path, Polygon } from 'react-native-svg';
import { quadChainPath } from '../../lib/tactics/timeline';
import type { DrillLine } from '../../lib/tactics/types';
import type { PitchGeo } from '../../lib/tactics/geometry';

type Px = { x: number; y: number };

function pathD(pts: Px[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

/** Triangle de pointe (tête "arrow") — mêmes proportions que le <Marker> web (path M0,0 L8,4 L0,8 Z, refX=7, refY=4). Cf MovementArrow pour le pourquoi (pas de <Marker>/markerEnd ici). */
function arrowHeadPoints(tip: Px, prev: Px): string {
  const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
  const backLen = 8, halfW = 4;
  const bx = tip.x - backLen * Math.cos(angle), by = tip.y - backLen * Math.sin(angle);
  const leftX = bx - halfW * Math.sin(angle), leftY = by + halfW * Math.cos(angle);
  const rightX = bx + halfW * Math.sin(angle), rightY = by - halfW * Math.cos(angle);
  return `${tip.x},${tip.y} ${leftX},${leftY} ${rightX},${rightY}`;
}

/** Barre perpendiculaire (tête "bar") — même proportions que le <Marker> web (Line x1=4 y1=0 x2=4 y2=8, refX=4, refY=4). */
function barHeadEnds(tip: Px, prev: Px): { x1: number; y1: number; x2: number; y2: number } {
  const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x) + Math.PI / 2;
  const halfLen = 4;
  return {
    x1: tip.x - halfLen * Math.cos(angle),
    y1: tip.y - halfLen * Math.sin(angle),
    x2: tip.x + halfLen * Math.cos(angle),
    y2: tip.y + halfLen * Math.sin(angle),
  };
}

/**
 * Port de drawFreeLine() (render-core.js, web). Un trait courbé déjà créé
 * côté web (`ctrls` non vide) reste visible ici, échantillonné via
 * quadChainPath le long de la vraie chaîne de Bézier quadratique — même
 * tracé que le web. La création mobile reste limitée au trait droit.
 *
 * Pas de <Marker>/markerEnd ni de <Polyline> (cf MovementArrow, même
 * historique de mises à jour perdues sur react-native-svg) : le trait est un
 * <Path>, la tête (flèche ou barre) un élément positionné/orienté en JS
 * depuis les deux derniers points du tracé.
 */
export function FreeLine({ line, g }: { line: DrillLine; g: PitchGeo }) {
  const color = line.color || '#ffffff';
  const sw = line.width || 2;
  const head = line.head || 'arrow';

  const pts = line.ctrls?.length
    ? quadChainPath({ x: line.x1, y: line.y1 }, line.ctrls, { x: line.x2, y: line.y2 }, 16)
    : [{ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }];
  const px: Px[] = pts.map((p) => ({ x: g.px(p.x), y: g.py(p.y) }));
  const tip = px[px.length - 1];
  const prevPt = px[px.length - 2] ?? px[0];

  return (
    <>
      <Path
        d={pathD(px)}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeDasharray={line.dash ? '7 5' : undefined}
      />
      {head === 'arrow' && <Polygon points={arrowHeadPoints(tip, prevPt)} fill={color} />}
      {head === 'bar' && (
        <Line {...barHeadEnds(tip, prevPt)} stroke={color} strokeWidth={1.8} />
      )}
    </>
  );
}
