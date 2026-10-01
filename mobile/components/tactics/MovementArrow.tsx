import { Path, Polygon } from 'react-native-svg';
import { quadChainPath, type DrillArrow } from '../../lib/tactics/timeline';
import type { PitchGeo } from '../../lib/tactics/geometry';

function annoColor(type: DrillArrow['type']): string {
  return type === 'pass' ? '#ffe14d' : '#ffffff';
}

// "0" (pas `undefined`) pour la passe — port exact de annoDash (web,
// render-core.js l.864). `undefined` omet le prop `strokeDasharray` au lieu
// de forcer un trait plein, RNSVG peut alors garder le dasharray du dernier
// <Path> rendu dans le même <Svg> (constaté par Robin : passe pointillée).
function annoDash(type: DrillArrow['type']): string {
  return type === 'run' ? '7 5' : type === 'dribble' ? '2 4' : '0';
}

// Opacité des flèches de mouvement (demande Robin 2026-09-26, miroir du web
// — cf ARROW_OPACITY dans render-core.js) : moins criardes sur un schéma chargé.
const ARROW_OPACITY = 0.7;

type Px = { x: number; y: number };

function pathD(pts: Px[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

/**
 * Triangle de pointe — port du <Marker> web (path M0,0 L{7k},{3k} L0,{6k} Z,
 * refX={7k}, refY={3k}, orient="auto") mais dessiné ici en <Polygon> à la
 * position finale, PAS via le mécanisme <Marker>/markerEnd de
 * react-native-svg. Robin a constaté une flèche figée sur le tracé d'un step
 * antérieur alors que `t` et `frame.arrows` avaient bien avancé (barre de
 * progression et libellé d'étape corrects) — y compris en forçant un
 * remontage complet du composant à chaque step (clé incluant `t`). Ce n'est
 * donc ni un bug de state React ni un défaut de réconciliation : ça pointe
 * vers <Marker>/markerEnd et <Polyline>, deux primitives react-native-svg à
 * l'historique documenté de mises à jour perdues (issues #1410/#1739 sur
 * software-mansion/react-native-svg). Ce composant n'utilise donc plus ni
 * l'un ni l'autre : la ligne est un <Path> (comme le fallback tout droit
 * l'était déjà), la pointe un <Polygon> positionné/orienté en JS depuis les
 * deux derniers points du tracé.
 */
function arrowheadPoints(tip: Px, prev: Px, k: number): string {
  const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
  const backLen = 7 * k;
  const halfW = 3 * k;
  const bx = tip.x - backLen * Math.cos(angle);
  const by = tip.y - backLen * Math.sin(angle);
  const leftX = bx - halfW * Math.sin(angle);
  const leftY = by + halfW * Math.cos(angle);
  const rightX = bx + halfW * Math.sin(angle);
  const rightY = by - halfW * Math.cos(angle);
  return `${tip.x},${tip.y} ${leftX},${leftY} ${rightX},${rightY}`;
}

export function MovementArrow({ arrow, g }: { arrow: DrillArrow; g: PitchGeo }) {
  const color = annoColor(arrow.type);
  const sw = arrow.width || 2;
  const k = sw / 2.5;
  const dash = annoDash(arrow.type);

  const wayPts = arrow.pts && arrow.pts.length > 1
    ? arrow.pts
    : arrow.ctrls && arrow.ctrls.length
      ? quadChainPath(arrow.from, arrow.ctrls, arrow.to, 16)
      : null;

  const px: Px[] = (wayPts ?? [arrow.from, arrow.to]).map((p) => ({ x: g.px(p.x), y: g.py(p.y) }));
  const tip = px[px.length - 1];
  const prevPt = px[px.length - 2] ?? px[0];
  const headPoints = arrowheadPoints(tip, prevPt, k);

  return (
    <>
      {arrow.aerial && (
        <Path
          d={pathD(px.map((p) => ({ x: p.x + sw * 1.1 + 3.5, y: p.y + sw * 1.1 + 3.5 })))}
          fill="none"
          stroke="#000"
          strokeWidth={sw + 1.5}
          strokeDasharray={dash}
          opacity={0.35}
        />
      )}
      <Path d={pathD(px)} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={dash} opacity={ARROW_OPACITY} />
      <Polygon points={headPoints} fill={color} opacity={ARROW_OPACITY} />
    </>
  );
}
