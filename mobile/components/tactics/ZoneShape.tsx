import { Ellipse, G, Polygon, Rect } from 'react-native-svg';
import type { DrillZone } from '../../lib/tactics/types';
import type { PitchGeo } from '../../lib/tactics/geometry';

const ZFILL: Record<string, string> = {
  corridor: 'rgba(255,255,255,0.06)',
  area: 'rgba(255,255,255,0.10)',
  target: 'rgba(242,193,78,0.18)',
  neutral: 'rgba(255,255,255,0.05)',
};
const SEL_COLOR = '#ffd21f';

/**
 * Port de drawZone() (render-core.js, web) — rect/ellipse/polygon affichés
 * fidèlement (un polygone créé côté web reste visible et déplaçable ici),
 * mais la création côté natif se limite au rectangle (cf types.ts). Pas de
 * hachures (mode `fill:"hatch"`) : rendu simplifié en remplissage plein à la
 * même opacité — motif de trame hors périmètre tranche 2.
 */
export function ZoneShape({ zone, g, selected }: { zone: DrillZone; g: PitchGeo; selected?: boolean }) {
  const baseW = typeof zone.strokeWidth === 'number' ? zone.strokeWidth : 1.5;
  const strokeWidth = selected ? baseW + 1 : baseW;
  const dash = zone.stroke !== 'solid' ? '5 5' : undefined;
  const tint = zone.color || null;
  const mode = zone.fill || 'solid';

  let fill: string;
  let fillOpacity: number | undefined;
  if (mode === 'none') {
    fill = 'none';
  } else if (tint) {
    fill = tint;
    fillOpacity = typeof zone.fillOpacity === 'number' ? zone.fillOpacity : mode === 'hatch' ? 0.55 : 0.28;
  } else {
    fill = ZFILL[zone.kind] || ZFILL.neutral;
    fillOpacity = typeof zone.fillOpacity === 'number' ? zone.fillOpacity : undefined;
  }
  const stroke = selected ? SEL_COLOR : tint || 'rgba(255,255,255,0.6)';

  if (zone.shape === 'polygon' && zone.pts?.length) {
    const points = zone.pts.map((p) => `${g.px(p.x)},${g.py(p.y)}`).join(' ');
    return <Polygon points={points} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />;
  }

  const x = zone.x ?? 0;
  const y = zone.y ?? 0;
  const w = zone.w ?? 4;
  const h = zone.h ?? 4;
  const px = g.px(x);
  const py = g.py(y + h);
  const pw = w * g.sc;
  const ph = h * g.sc;

  return (
    <G x={px} y={py}>
      {zone.shape === 'ellipse' ? (
        <Ellipse cx={pw / 2} cy={ph / 2} rx={pw / 2} ry={ph / 2} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />
      ) : (
        <Rect x={0} y={0} width={pw} height={ph} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />
      )}
    </G>
  );
}
