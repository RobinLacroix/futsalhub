import { Marker, Path, Polyline } from 'react-native-svg';
import type { DrillArrow } from '../../lib/tactics/timeline';
import type { PitchGeo } from '../../lib/tactics/geometry';

function annoColor(type: DrillArrow['type']): string {
  return type === 'pass' ? '#ffe14d' : '#ffffff';
}

function annoDash(type: DrillArrow['type']): string | undefined {
  return type === 'run' ? '7 5' : type === 'dribble' ? '2 4' : undefined;
}

// Opacité des flèches de mouvement (demande Robin 2026-09-26, miroir du web
// — cf ARROW_OPACITY dans render-core.js) : moins criardes sur un schéma chargé.
const ARROW_OPACITY = 0.7;

/**
 * Port de drawAnnotation() (render-core.js, web) : flèche de déplacement
 * (course/passe/conduite), dérivée du mouvement d'une entité — jamais posée
 * à la main. `a.pts` (spline lissée, mouvement courbe) prime sur `a.ctrls`
 * (point(s) de courbure posés sur ce clip), approximés ici en ligne brisée
 * passant par les points de contrôle plutôt que la vraie chaîne de Bézier
 * quadratique du web — même écart assumé que FreeLine (courbe non créable
 * depuis le natif cette tranche).
 */
export function MovementArrow({ arrow, index, g }: { arrow: DrillArrow; index: number; g: PitchGeo }) {
  const color = annoColor(arrow.type);
  const sw = arrow.width || 2;
  const k = sw / 2.5;
  const dash = annoDash(arrow.type);
  const markerId = `mv-${index}`;

  const wayPts = arrow.pts && arrow.pts.length > 1
    ? arrow.pts
    : arrow.ctrls && arrow.ctrls.length
      ? [{ x: arrow.from.x, y: arrow.from.y }, ...arrow.ctrls, { x: arrow.to.x, y: arrow.to.y }]
      : null;
  const pointsAttr = wayPts ? wayPts.map((p) => `${g.px(p.x)},${g.py(p.y)}`).join(' ') : undefined;

  const x1 = g.px(arrow.from.x), y1 = g.py(arrow.from.y), x2 = g.px(arrow.to.x), y2 = g.py(arrow.to.y);

  return (
    <>
      <Marker id={markerId} markerWidth={9 * k} markerHeight={9 * k} refX={7 * k} refY={3 * k} orient="auto">
        <Path d={`M0,0 L${7 * k},${3 * k} L0,${6 * k} Z`} fill={color} />
      </Marker>
      {arrow.aerial && (
        wayPts ? (
          <Polyline
            points={wayPts.map((p) => `${g.px(p.x) + sw * 1.1 + 3.5},${g.py(p.y) + sw * 1.1 + 3.5}`).join(' ')}
            fill="none"
            stroke="#000"
            strokeWidth={sw + 1.5}
            strokeDasharray={dash}
            opacity={0.35}
          />
        ) : (
          <Path
            d={`M${x1 + sw * 1.1 + 3.5},${y1 + sw * 1.1 + 3.5} L${x2 + sw * 1.1 + 3.5},${y2 + sw * 1.1 + 3.5}`}
            fill="none"
            stroke="#000"
            strokeWidth={sw + 1.5}
            strokeDasharray={dash}
            opacity={0.35}
          />
        )
      )}
      {wayPts ? (
        <Polyline points={pointsAttr} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={dash} markerEnd={`url(#${markerId})`} opacity={ARROW_OPACITY} />
      ) : (
        <Path d={`M${x1},${y1} L${x2},${y2}`} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={dash} markerEnd={`url(#${markerId})`} opacity={ARROW_OPACITY} />
      )}
    </>
  );
}
