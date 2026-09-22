import { Circle, G, Line, Polygon, Rect } from 'react-native-svg';
import type { DrillPitch } from '../../lib/tactics/types';
import type { PitchGeo } from '../../lib/tactics/geometry';

/**
 * Port réduit de `drawPitchBase()` (render-core.js, web) : terrain uni,
 * touche/mi-terrain/rond central/surfaces de but/points de penalty. Pas de
 * motif de surface (bandes/damier/parquet), pas d'image de fond, pas de logo
 * centre — hors périmètre tranche 1 (cf PLAN_TACTIQUE_NATIF_MOBILE_TRANCHE1_2026-09.md
 * §7). Couleurs par défaut identiques au web (COL.pitch/COL.line).
 */
const DEFAULT_SURFACE = '#2f8f4e';
const DEFAULT_OUTER = '#171a15';
const DEFAULT_LINE = '#eafff0';

/** Points d'une surface de but (quart de cercle + rectangle + quart de cercle), port de penArea(). */
function goalAreaPoints(g: PitchGeo, pitch: DrillPitch, goalX: number, dir: 1 | -1): string {
  const R = 6, cy = pitch.width / 2, N = 14;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const a = ((-90 + (90 * i) / N) * Math.PI) / 180;
    pts.push(`${g.px(goalX + dir * R * Math.cos(a))},${g.py(cy - 1.5 + R * Math.sin(a))}`);
  }
  for (let i = 0; i <= N; i++) {
    const a = ((90 * i) / N) * Math.PI / 180;
    pts.push(`${g.px(goalX + dir * R * Math.cos(a))},${g.py(cy + 1.5 + R * Math.sin(a))}`);
  }
  return pts.join(' ');
}

export function PitchBackground({ pitch, g }: { pitch: DrillPitch; g: PitchGeo }) {
  const lineColor = pitch.lineColor || DEFAULT_LINE;
  const goalAreaFill = pitch.goalAreaColor || lineColor;
  const goalAreaOpacity = typeof pitch.goalAreaOpacity === 'number' ? pitch.goalAreaOpacity : 0.16;
  const cy = pitch.width / 2;

  return (
    <G>
      <Rect x={0} y={0} width={g.W} height={g.H} fill={pitch.outerColor || DEFAULT_OUTER} />
      <Rect x={g.px(0)} y={g.py(pitch.width)} width={pitch.length * g.sc} height={pitch.width * g.sc} fill={pitch.color || DEFAULT_SURFACE} />
      <Rect
        x={g.px(0)}
        y={g.py(pitch.width)}
        width={pitch.length * g.sc}
        height={pitch.width * g.sc}
        fill="none"
        stroke={lineColor}
        strokeWidth={2}
      />
      <Line x1={g.px(pitch.length / 2)} y1={g.py(pitch.width)} x2={g.px(pitch.length / 2)} y2={g.py(0)} stroke={lineColor} strokeWidth={2} />
      <Circle cx={g.px(pitch.length / 2)} cy={g.py(cy)} r={3 * g.sc} fill="none" stroke={lineColor} strokeWidth={2} />
      {pitch.markings === 'full' && (
        <>
          <Polygon points={goalAreaPoints(g, pitch, 0, 1)} fill={goalAreaFill} fillOpacity={goalAreaOpacity} stroke={lineColor} strokeWidth={2} />
          <Polygon points={goalAreaPoints(g, pitch, pitch.length, -1)} fill={goalAreaFill} fillOpacity={goalAreaOpacity} stroke={lineColor} strokeWidth={2} />
          {[0, pitch.length].map((goalX, i) => {
            const dir = i === 0 ? 1 : -1;
            return [6, 10]
              .filter((dist) => dist * 2 < pitch.length)
              .map((dist) => (
                <Circle key={`${goalX}-${dist}`} cx={g.px(goalX + dir * dist)} cy={g.py(cy)} r={1.6} fill={lineColor} />
              ));
          })}
        </>
      )}
    </G>
  );
}
