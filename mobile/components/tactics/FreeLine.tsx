import { Line, Marker, Path, Polyline } from 'react-native-svg';
import type { DrillLine } from '../../lib/tactics/types';
import type { PitchGeo } from '../../lib/tactics/geometry';

/**
 * Port de drawFreeLine() (render-core.js, web). Un trait courbé déjà créé
 * côté web (`ctrls` non vide) reste visible ici — approximé en ligne brisée
 * passant par les points de contrôle plutôt que la vraie chaîne de Bézier
 * quadratique du web (quadChainPath) : différence visuelle mineure sur une
 * courbe prononcée, évite de porter ~40 lignes de maths de spline pour un
 * cas non créable depuis le natif cette tranche (cf types.ts). La création
 * mobile reste limitée au trait droit.
 */
export function FreeLine({ line, g }: { line: DrillLine; g: PitchGeo }) {
  const color = line.color || '#ffffff';
  const sw = line.width || 2;
  const head = line.head || 'arrow';
  const markerId = `fl-${line.id}`;

  const pts = line.ctrls?.length ? [{ x: line.x1, y: line.y1 }, ...line.ctrls, { x: line.x2, y: line.y2 }] : null;
  const pointsAttr = pts ? pts.map((p) => `${g.px(p.x)},${g.py(p.y)}`).join(' ') : undefined;

  const markerEnd = head !== 'none' ? `url(#${markerId})` : undefined;

  return (
    <>
      {head !== 'none' && (
        <Marker id={markerId} markerWidth={9} markerHeight={9} refX={head === 'bar' ? 4 : 7} refY={4} orient="auto">
          {head === 'bar' ? (
            <Line x1={4} y1={0} x2={4} y2={8} stroke={color} strokeWidth={1.8} />
          ) : (
            <Path d="M0,0 L8,4 L0,8 Z" fill={color} />
          )}
        </Marker>
      )}
      {pts ? (
        <Polyline
          points={pointsAttr}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={line.dash ? '7 5' : undefined}
          markerEnd={markerEnd}
        />
      ) : (
        <Line
          x1={g.px(line.x1)}
          y1={g.py(line.y1)}
          x2={g.px(line.x2)}
          y2={g.py(line.y2)}
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={line.dash ? '7 5' : undefined}
          markerEnd={markerEnd}
        />
      )}
    </>
  );
}
