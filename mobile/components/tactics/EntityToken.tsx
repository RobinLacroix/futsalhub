import type { ReactNode } from 'react';
import { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import type { DrillEntity } from '../../lib/tactics/types';
import type { Drill } from '../../lib/tactics/types';
import type { PitchGeo } from '../../lib/tactics/geometry';
import { teamStyle, BALL_COLOR } from '../../lib/tactics/teamStyle';

const SEL_COLOR = '#ffd21f';

/** Port exact de shapePoints() (render-core.js, web). */
function shapePoints(shape: string, r: number): string | null {
  if (shape === 'triangle') return `0,${-1.2 * r} ${-1.05 * r},${0.75 * r} ${1.05 * r},${0.75 * r}`;
  if (shape === 'diamond') return `0,${-1.25 * r} ${1.25 * r},0 0,${1.25 * r} ${-1.25 * r},0`;
  return null;
}

/** Port de EQUIP (render-core.js, web) — labels/tailles réelles/rotation/couleurs par défaut. */
export const EQUIP: Record<string, { label: string; real: { w: number; h: number } | null; rot: boolean; front?: boolean; color: string }> = {
  saucer: { label: 'Coupelle', real: null, rot: false, color: '#f2c14e' },
  pole: { label: 'Piquet', real: null, rot: false, color: '#e8503a' },
  hoop: { label: 'Cerceau', real: { w: 0.6, h: 0.6 }, rot: false, color: '#3fc2d6' },
  hurdle: { label: 'Haie', real: { w: 0.5, h: 0.3 }, rot: true, color: '#f2c14e' },
  ladder: { label: 'Échelle', real: { w: 4, h: 0.5 }, rot: true, color: '#e6e2d6' },
  minigoal: { label: 'Mini-but', real: { w: 1.2, h: 0.5 }, rot: true, front: true, color: '#f4f4f1' },
};

function shadeColor(hex: string, factor: number): string {
  const h = (hex || '#c99a5b').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = Math.min(255, Math.round(parseInt(full.substr(0, 2), 16) * factor));
  const gr = Math.min(255, Math.round(parseInt(full.substr(2, 2), 16) * factor));
  const b = Math.min(255, Math.round(parseInt(full.substr(4, 2), 16) * factor));
  return `rgb(${r},${gr},${b})`;
}

/** Port de drawEquipment() (render-core.js, web). `scale` = e.size (défaut 1, pas de taille d'équipe pour le matériel). */
function Equipment({ entity, g, scale }: { entity: DrillEntity; g: PitchGeo; scale: number }) {
  const spec = EQUIP[entity.type];
  if (!spec) return null;
  const col = entity.color || spec.color;
  const ink = '#12140f';
  const rotation = spec.rot ? entity.facing || 0 : 0;

  let inner: ReactNode = null;
  if (entity.type === 'saucer') {
    const sr = 7 * scale;
    inner = (
      <>
        <Circle cx={0} cy={0} r={sr} fill={col} stroke={ink} strokeWidth={1} />
        <Circle cx={0} cy={0} r={sr * 0.48} fill={shadeColor(col, 0.8)} />
      </>
    );
  } else if (entity.type === 'pole') {
    const pr = 5 * scale;
    inner = (
      <>
        <Circle cx={0} cy={0} r={pr} fill={col} stroke="#fff" strokeWidth={1.6} />
        <Circle cx={0} cy={0} r={pr * 0.4} fill="#fff" />
      </>
    );
  } else if (entity.type === 'hoop' && spec.real) {
    const hr = (spec.real.w / 2) * g.sc * scale;
    inner = (
      <>
        <Circle cx={0} cy={0} r={hr} fill="none" stroke={ink} strokeWidth={Math.max(3.4, hr * 0.32)} />
        <Circle cx={0} cy={0} r={hr} fill="none" stroke={col} strokeWidth={Math.max(2, hr * 0.2)} />
      </>
    );
  } else if (entity.type === 'hurdle' && spec.real) {
    const hw = (spec.real.w / 2) * g.sc * scale;
    const hd = (spec.real.h / 2) * g.sc * scale;
    inner = (
      <>
        <Line x1={-hw} y1={-hd} x2={-hw} y2={hd} stroke={ink} strokeWidth={2.4} />
        <Line x1={hw} y1={-hd} x2={hw} y2={hd} stroke={ink} strokeWidth={2.4} />
        <Line x1={-hw} y1={0} x2={hw} y2={0} stroke={ink} strokeWidth={Math.max(4.2, hd * 1.1)} />
        <Line x1={-hw} y1={0} x2={hw} y2={0} stroke={col} strokeWidth={Math.max(2.6, hd * 0.7)} />
      </>
    );
  } else if (entity.type === 'ladder' && spec.real) {
    const lw = (spec.real.w / 2) * g.sc * scale;
    const lh = (spec.real.h / 2) * g.sc * scale;
    const rungs = Math.max(2, Math.round(spec.real.w / 0.4));
    const rungLines = [];
    for (let k = 0; k <= rungs; k++) {
      const rx = -lw + (2 * lw * k) / rungs;
      rungLines.push(<Line key={k} x1={rx} y1={-lh} x2={rx} y2={lh} stroke={col} strokeWidth={1.6} />);
    }
    inner = (
      <>
        <Rect x={-lw} y={-lh} width={2 * lw} height={2 * lh} fill="#000" fillOpacity={0.18} />
        {rungLines}
        <Line x1={-lw} y1={-lh} x2={lw} y2={-lh} stroke={col} strokeWidth={2} />
        <Line x1={-lw} y1={lh} x2={lw} y2={lh} stroke={col} strokeWidth={2} />
      </>
    );
  } else if (entity.type === 'minigoal' && spec.real) {
    const gw = (spec.real.w / 2) * g.sc * scale;
    const gd = spec.real.h * g.sc * scale;
    const vLines = [];
    for (let j = 1; j < 6; j++) {
      const mx = -gw + (2 * gw * j) / 6;
      vLines.push(<Line key={`v${j}`} x1={mx} y1={-gd} x2={mx} y2={0} stroke={col} strokeOpacity={0.5} strokeWidth={0.6} />);
    }
    const hLines = [];
    for (let j = 1; j < 3; j++) {
      const my = -gd + (gd * j) / 3;
      hLines.push(<Line key={`h${j}`} x1={-gw} y1={my} x2={gw} y2={my} stroke={col} strokeOpacity={0.5} strokeWidth={0.6} />);
    }
    inner = (
      <>
        <Rect x={-gw} y={-gd} width={2 * gw} height={gd} fill="#000" fillOpacity={0.22} />
        {vLines}
        {hLines}
        <Line x1={-gw} y1={-gd} x2={gw} y2={-gd} stroke={col} strokeWidth={1.8} />
        <Line x1={-gw} y1={-gd} x2={-gw} y2={0} stroke={col} strokeWidth={1.8} />
        <Line x1={gw} y1={-gd} x2={gw} y2={0} stroke={col} strokeWidth={1.8} />
        <Circle cx={-gw} cy={0} r={2.1} fill={col} />
        <Circle cx={gw} cy={0} r={2.1} fill={col} />
      </>
    );
  }

  return rotation ? <G rotation={rotation} origin="0,0">{inner}</G> : <>{inner}</>;
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

  if (EQUIP[entity.type]) {
    return (
      <G x={x} y={y}>
        {selected && <Circle cx={0} cy={0} r={15} fill="none" stroke={SEL_COLOR} strokeWidth={2} />}
        <Equipment entity={entity} g={g} scale={entity.size || 1} />
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
