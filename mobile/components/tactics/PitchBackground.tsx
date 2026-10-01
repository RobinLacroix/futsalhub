import { Circle, G, Line, Polygon, Rect } from 'react-native-svg';
import type { DrillPitch } from '../../lib/tactics/types';
import type { PitchGeo } from '../../lib/tactics/geometry';

/**
 * Port réduit de `drawPitchBase()` (render-core.js, web) : terrain uni,
 * touche/mi-terrain/rond central/surfaces de but/points de penalty/cadres de
 * but fixes/motif de repères (couloirs, zones). Pas de motif de surface
 * (bandes/damier/parquet), pas d'image de fond, pas de logo centre — hors
 * périmètre tranche 1 (cf PLAN_TACTIQUE_NATIF_MOBILE_TRANCHE1_2026-09.md §7).
 * Couleurs par défaut identiques au web (COL.pitch/COL.line).
 */
const DEFAULT_SURFACE = '#2f8f4e';
const DEFAULT_OUTER = '#171a15';
const DEFAULT_LINE = '#eafff0';
const GOAL_FRAME_COLOR = '#f4f4f1';

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

/**
 * Cadre du but fixe (structure hors terrain, filet), port de drawGoalMark()
 * (web). Indépendant de l'entité "but" déplaçable (EntityToken) — présent
 * même si aucun but mobile n'a été posé sur le schéma, comme sur un vrai
 * terrain. `dir` donne le sens dans lequel le filet se développe hors du
 * terrain (-1 côté gauche, +1 côté droit).
 */
function GoalMark({ g, goalX, dir, cy }: { g: PitchGeo; goalX: number; dir: 1 | -1; cy: number }) {
  const halfW = 1.5, depth = 1;
  const x0 = g.px(goalX), x1 = g.px(goalX + dir * depth);
  const yTop = g.py(cy + halfW), yBot = g.py(cy - halfW);
  const netCols = 9, netRows = 3;

  return (
    <G>
      <Rect
        x={Math.min(x0, x1)}
        y={Math.min(yTop, yBot)}
        width={Math.abs(x1 - x0)}
        height={Math.abs(yBot - yTop)}
        fill="#000"
        fillOpacity={0.22}
      />
      {Array.from({ length: netCols - 1 }, (_, idx) => {
        const i = idx + 1;
        const yy = yTop + ((yBot - yTop) * i) / netCols;
        return <Line key={`h${i}`} x1={x0} y1={yy} x2={x1} y2={yy} stroke={GOAL_FRAME_COLOR} strokeOpacity={0.5} strokeWidth={0.6} />;
      })}
      {Array.from({ length: netRows - 1 }, (_, idx) => {
        const i = idx + 1;
        const xx = x0 + ((x1 - x0) * i) / netRows;
        return <Line key={`v${i}`} x1={xx} y1={yTop} x2={xx} y2={yBot} stroke={GOAL_FRAME_COLOR} strokeOpacity={0.5} strokeWidth={0.6} />;
      })}
      <Line x1={x0} y1={yTop} x2={x1} y2={yTop} stroke={GOAL_FRAME_COLOR} strokeWidth={2} />
      <Line x1={x0} y1={yBot} x2={x1} y2={yBot} stroke={GOAL_FRAME_COLOR} strokeWidth={2} />
      <Line x1={x1} y1={yTop} x2={x1} y2={yBot} stroke={GOAL_FRAME_COLOR} strokeWidth={2} />
      <Circle cx={x0} cy={yTop} r={2.1} fill={GOAL_FRAME_COLOR} />
      <Circle cx={x0} cy={yBot} r={2.1} fill={GOAL_FRAME_COLOR} />
    </G>
  );
}

/**
 * Repères figés (couloirs/zones en profondeur), port de drawPitchPattern()
 * (web). Choisi par le coach dans les réglages du terrain (`pitch.pattern`) —
 * distinct des zones interactives déplaçables (ZoneShape).
 */
function PitchPattern({ g, pitch, lineColor }: { g: PitchGeo; pitch: DrillPitch; lineColor: string }) {
  const pattern = pitch.pattern;
  if (!pattern || pattern === 'none') return null;

  const dash = { stroke: lineColor, strokeOpacity: 0.55, strokeWidth: 1.5, strokeDasharray: '5 4' };
  const showCorridors = pattern === 'corridors3' || pattern === 'grid';
  const zoneCount = pattern === 'zones3' || pattern === 'grid' ? 3 : pattern === 'zones4' ? 4 : 0;

  return (
    <G>
      {showCorridors &&
        pitch.width > 10 &&
        [5, pitch.width - 5].map((yPos) => (
          <Line key={`corridor-${yPos}`} x1={g.px(0)} y1={g.py(yPos)} x2={g.px(pitch.length)} y2={g.py(yPos)} {...dash} />
        ))}
      {zoneCount > 0 &&
        Array.from({ length: zoneCount - 1 }, (_, idx) => {
          const j = idx + 1;
          const x = g.px((pitch.length / zoneCount) * j);
          return <Line key={`zone-${zoneCount}-${j}`} x1={x} y1={g.py(pitch.width)} x2={x} y2={g.py(0)} {...dash} />;
        })}
    </G>
  );
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
      <GoalMark g={g} goalX={0} dir={-1} cy={cy} />
      <GoalMark g={g} goalX={pitch.length} dir={1} cy={cy} />
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
      <PitchPattern g={g} pitch={pitch} lineColor={lineColor} />
    </G>
  );
}
