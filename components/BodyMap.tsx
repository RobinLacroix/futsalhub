'use client';

import { useState } from 'react';
import {
  zonesFor,
  bodyContextFor,
  zoneById,
  PAIN_VIEWBOX,
  INTENSITY_COLORS,
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
  /** Une seule zone à la fois, sans intensité — pour « zone concernée » (disponibilité), pas pour la douleur. */
  singleSelect?: boolean;
}

const SINGLE_SELECT_COLOR = '#1a2744';

const T = {
  cardBg2: '#F8FAFC',
  border: '#DDE1EA',
  text: '#0f172a',
  textMuted: '#475569',
  textFaint: '#94a3b8',
  navy: '#1a2744',
};

const INTENSITY_VALUES: PainIntensity[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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

export default function BodyMap({ value, onChange, maxHeight = 360, singleSelect = false }: BodyMapProps) {
  const [view, setView] = useState<PainView>('front');
  const [mode, setMode] = useState<PainMode>('zone');
  const zones = zonesFor(view, mode);
  const selectedIds = Object.keys(value);

  // Un clic sélectionne/désélectionne la zone (intensité par défaut 5/10,
  // ajustable ensuite via le sélecteur 1-10). Remplace l'ancien cycle de clics
  // (plafonné à 3) : le kiné veut un chiffre choisi explicitement.
  const toggle = (id: string) => {
    if (singleSelect) {
      onChange(value[id] ? {} : { [id]: 1 });
      return;
    }
    const copy = { ...value };
    if (copy[id]) delete copy[id];
    else copy[id] = 5;
    onChange(copy);
  };

  const setIntensity = (id: string, intensity: PainIntensity) => {
    onChange({ ...value, [id]: intensity });
  };

  const removeZone = (id: string) => {
    const copy = { ...value };
    delete copy[id];
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
            const fill = intensity ? (singleSelect ? SINGLE_SELECT_COLOR : INTENSITY_COLORS[intensity]) : BODY_FILL;
            const stroke = intensity ? (singleSelect ? SINGLE_SELECT_COLOR : INTENSITY_COLORS[intensity]) : BODY_STROKE;
            return (
              <ShapePath key={def.id} def={def} fill={fill} stroke={stroke}
                strokeWidth={intensity ? 2 : 1.2} onClick={() => toggle(def.id)} interactive />
            );
          })}
        </svg>
      </div>

      {/* Consigne — sans objet en sélection unique (pas de gravité à indiquer) */}
      {!singleSelect && (
        <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: T.textMuted }}>
          Cliquez une zone, puis choisissez son intensité de 1 à 10.
        </div>
      )}

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
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {selectedIds.map(id => {
            const intensity = value[id];
            const label = zoneById(id)?.label ?? id;
            const color = singleSelect ? SINGLE_SELECT_COLOR : INTENSITY_COLORS[intensity];
            return (
              <div key={id} style={{ border: `1px solid ${color}`, borderRadius: 12, padding: 10, background: T.cardBg2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color, fontWeight: 700, fontSize: 13 }}>{label}</span>
                  <button type="button" onClick={() => removeZone(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 12, fontWeight: 600 }}>
                    Retirer
                  </button>
                </div>
                {!singleSelect && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {INTENSITY_VALUES.map(n => {
                      const active = intensity === n;
                      const cellColor = INTENSITY_COLORS[n];
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setIntensity(id, n)}
                          aria-label={`Intensité ${n} sur 10 pour ${label}`}
                          style={{
                            width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
                            border: `1.5px solid ${active ? cellColor : T.border}`,
                            background: active ? cellColor : '#fff',
                            color: active ? '#fff' : T.textMuted,
                            fontSize: 13, fontWeight: 700,
                          }}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
