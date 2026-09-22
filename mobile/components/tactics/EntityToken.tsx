import { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import type { DrillEntity } from '../../lib/tactics/types';
import type { Drill } from '../../lib/tactics/types';
import type { PitchGeo } from '../../lib/tactics/geometry';
import { teamStyle, BALL_COLOR } from '../../lib/tactics/teamStyle';

const SEL_COLOR = '#ffd21f';

/** Points d'un triangle/losange pointant vers le haut, rayon r — équivalent visuel de shapePoints() (web), pas une copie pixel-exacte. */
function shapePoints(shape: string, r: number): string | null {
  if (shape === 'triangle') {
    const h = r * 1.15;
    return `0,${-h} ${r},${h * 0.6} ${-r},${h * 0.6}`;
  }
  if (shape === 'diamond') {
    return `0,${-r} ${r},0 0,${r} ${-r},0`;
  }
  return null;
}

export function EntityToken({
  entity,
  drill,
  g,
  selected,
}: {
  entity: DrillEntity;
  drill: Pick<Drill, 'teams'>;
  g: PitchGeo;
  selected?: boolean;
}) {
  const x = g.px(entity.x);
  const y = g.py(entity.y);

  if (entity.type === 'ball') {
    return (
      <G x={x} y={y}>
        {selected && <Circle cx={0} cy={0} r={15} fill="none" stroke={SEL_COLOR} strokeWidth={2} />}
        <Circle cx={0} cy={0} r={6} fill={BALL_COLOR} stroke="#111" strokeWidth={1.5} />
      </G>
    );
  }

  if (entity.type === 'cone') {
    return (
      <G x={x} y={y}>
        {selected && <Circle cx={0} cy={0} r={15} fill="none" stroke={SEL_COLOR} strokeWidth={2} />}
        <Polygon points="0,-7 -6,6 6,6" fill={entity.color || '#ff8c1a'} stroke="#111" strokeWidth={1} />
      </G>
    );
  }

  if (entity.type === 'goal') {
    // Version simplifiée : cadre + poteaux, sans le maillage de filet du web (cosmétique, hors tranche 1).
    const halfW = 1.5 * g.sc;
    const dep = 1 * g.sc;
    const rot = entity.facing || 0;
    return (
      <G x={x} y={y} rotation={rot} origin="0,0">
        <Rect x={-dep} y={-halfW} width={dep} height={2 * halfW} fill="rgba(255,255,255,0.10)" />
        <Line x1={-dep} y1={-halfW} x2={0} y2={-halfW} stroke="#eafff0" strokeWidth={1.3} />
        <Line x1={-dep} y1={halfW} x2={0} y2={halfW} stroke="#eafff0" strokeWidth={1.3} />
        <Line x1={-dep} y1={-halfW} x2={-dep} y2={halfW} stroke="#eafff0" strokeWidth={1.3} />
        <Line x1={0} y1={-halfW} x2={0} y2={halfW} stroke="#eafff0" strokeWidth={4} />
        {selected && <Rect x={-dep - 4} y={-halfW - 4} width={dep + 8} height={2 * halfW + 8} fill="none" stroke={SEL_COLOR} strokeWidth={2} />}
      </G>
    );
  }

  // Joueur / appui : seules les formes rond/carré/triangle/losange (shape:"body" hors tranche 1, cf plan §7).
  const ts = teamStyle(drill, entity);
  const r = 11 * ts.size;
  const shape = ts.shape === 'body' ? 'circle' : ts.shape;
  const pts = shapePoints(shape, r);
  const fs = r * 0.9;

  return (
    <G x={x} y={y}>
      {selected && <Circle cx={0} cy={0} r={15 * ts.size} fill="none" stroke={SEL_COLOR} strokeWidth={2} />}
      {pts ? (
        <Polygon points={pts} fill={ts.fill} stroke={ts.stroke} strokeWidth={2} />
      ) : shape === 'square' ? (
        <Rect x={-r} y={-r} width={2 * r} height={2 * r} rx={4 * ts.size} fill={ts.fill} stroke={ts.stroke} strokeWidth={2} />
      ) : (
        <Circle cx={0} cy={0} r={r} fill={ts.fill} stroke={ts.stroke} strokeWidth={2} />
      )}
      {entity.label ? (
        <SvgText x={0} y={fs * 0.35} fontSize={fs} fontWeight="bold" fill={ts.text} textAnchor="middle">
          {entity.label}
        </SvgText>
      ) : null}
    </G>
  );
}
