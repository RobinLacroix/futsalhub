'use client';

import { useState } from 'react';
import {
  zonesFor,
  bodyContextFor,
  zoneById,
  PAIN_VIEWBOX,
  INTENSITY_COLORS,
  INTENSITY_LABELS,
  BODY_STROKE,
  BODY_FILL,
  type PainMode,
  type PainView,
  type PainIntensity,
  type PainZoneDef,
} from '@/lib/painMap';

export type PainSelection = Record<string, PainIntensity>;

interface BodyMapProps {
  value: PainSelection;
  onChange: (next: PainSelection) => void;
  maxHeight?: number;
}

const T = {
  cardBg2: '#F8FAFC',
  border: '#DDE1EA',
  text: '#0f172a',
  textMuted: '#475569',
  textFaint: '#94a3b8',
  navy: '#1a2744',
};

// 1 clic → 1, 2 clics → 2, 3 clics → 3, 4e clic → désélection
function cycle(current: PainIntensity | undefined): PainIntensity | 0 {
  if (!current) return 1;
  if (current === 3) return 0;
  return (current + 1) as PainIntensity;
}

function ShapePath({
  def, fill, stroke, strokeWidth, onClick, interactive,
}: {
  def: PainZoneDef; fill: string; stroke: string; strokeWidth: number; onClick?: () => void; interactive: boolean;
}) {
  const common = {
    fill, stroke, strokeWidth, onClick,
    style: interactive ? { cursor: 'pointer' as const } : undefined,
  };
  const s = def.shape;
  switch (s.kind) {
    case 'ellipse': return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...common} />;
    case 'circle':  return <circle cx={s.cx} cy={s.cy} r={s.r} {...common} />;
    case 'rrect':   return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r ?? 0} ry={s.r ?? 0} {...common} />;
    case 'poly':    return <polygon points={(s.points ?? []).map(([x, y]) => `${x},${y}`).join(' ')} {...common} />;
  }
}

function Toggle<T extends string>({
  options, value, onChange,
}: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'inline-flex', background: '#F8FAFC', border: `1px solid ${'#DDE1EA'}`, borderRadius: 9, padding: 3 }}>
      {options.map(([v, lbl]) => {
        const active = value === v;
        return (
          <button key={v} type="button" onClick={() => onChange(v)}
            style={{ padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: active ? '#1a2744' : 'transparent', color: active ? '#fff' : '#475569' }}>
            {lbl}
          </button>
        );
      })}
    </div>
  );
}

export default function BodyMap({ value, onChange, maxHeight = 360 }: BodyMapProps) {
  const [view, setView] = useState<PainView>('front');
  const [mode, setMode] = useState<PainMode>('zone');
  const zones = zonesFor(view, mode);
  const selectedIds = Object.keys(value);

  const toggle = (id: string) => {
    const next = cycle(value[id]);
    const copy = { ...value };
    if (next === 0) delete copy[id];
    else copy[id] = next;
    onChange(copy);
  };

  return (
    <div>
      {/* Toggles vue + mode */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Toggle options={[['front', 'Face'], ['back', 'Dos']]} value={view} onChange={setView} />
        <Toggle options={[['zone', 'Zone'], ['articulation', 'Articulations']]} value={mode} onChange={setMode} />
      </div>

      {/* Silhouette */}
      <div style={{ background: T.cardBg2, border: `1px solid ${T.border}`, borderRadius: 14, padding: 8, display: 'flex', justifyContent: 'center' }}>
        <svg viewBox={`0 0 ${PAIN_VIEWBOX.w} ${PAIN_VIEWBOX.h}`} style={{ width: '100%', maxHeight, height: 'auto' }}>
          {mode === 'articulation' &&
            bodyContextFor(view).map(def => (
              <ShapePath key={`ctx-${def.id}`} def={def} fill="#eef1f6" stroke={T.border} strokeWidth={1} interactive={false} />
            ))}

          {zones.map(def => {
            const intensity = value[def.id];
            const fill = intensity ? INTENSITY_COLORS[intensity] : BODY_FILL;
            const stroke = intensity ? INTENSITY_COLORS[intensity] : BODY_STROKE;
            return (
              <ShapePath key={def.id} def={def} fill={fill} stroke={stroke}
                strokeWidth={intensity ? 2 : 1.2} onClick={() => toggle(def.id)} interactive />
            );
          })}
        </svg>
      </div>

      {/* Légende intensité */}
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 10 }}>
        {([1, 2, 3] as PainIntensity[]).map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: INTENSITY_COLORS[i], display: 'inline-block' }} />
            <span style={{ fontSize: 10, color: T.textMuted }}>{INTENSITY_LABELS[i]}</span>
          </div>
        ))}
      </div>

      {/* Sélection */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {selectedIds.length === 0
            ? 'Aucune zone sélectionnée'
            : `${selectedIds.length} zone${selectedIds.length > 1 ? 's' : ''} sélectionnée${selectedIds.length > 1 ? 's' : ''}`}
        </span>
        {selectedIds.length > 0 && (
          <button type="button" onClick={() => onChange({})} style={{ fontSize: 12, color: T.textMuted, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            ↺ Réinitialiser
          </button>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {selectedIds.map(id => {
            const intensity = value[id];
            const label = zoneById(id)?.label ?? id;
            const color = INTENSITY_COLORS[intensity];
            return (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${color}1a`, border: `1px solid ${color}`, color, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
                {label}
                <button type="button" onClick={() => toggle(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: 0, lineHeight: 1, fontSize: 13 }} aria-label={`Retirer ${label}`}>×</button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
