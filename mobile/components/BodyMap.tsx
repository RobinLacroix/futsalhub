import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Ellipse, Circle, Rect, Polygon } from 'react-native-svg';
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
} from '../lib/painMap';

export type PainSelection = Record<string, PainIntensity>;

const C = {
  surface2: '#f4f6fa',
  border: '#dde3ec',
  navy: '#1a2744',
  text2: '#475569',
  text3: '#94a3b8',
} as const;

const SINGLE_SELECT_COLOR = C.navy;

function cycle(current: PainIntensity | undefined): PainIntensity | 0 {
  if (!current) return 1;
  if (current === 3) return 0;
  return (current + 1) as PainIntensity;
}

function ZoneShape({
  def, fill, stroke, strokeWidth, onPress,
}: {
  def: PainZoneDef; fill: string; stroke: string; strokeWidth: number; onPress?: () => void;
}) {
  const s = def.shape;
  const p = { fill, stroke, strokeWidth, onPress };
  switch (s.kind) {
    case 'ellipse': return <Ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...p} />;
    case 'circle':  return <Circle cx={s.cx} cy={s.cy} r={s.r} {...p} />;
    case 'rrect':   return <Rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r ?? 0} ry={s.r ?? 0} {...p} />;
    case 'poly':    return <Polygon points={(s.points ?? []).map(([x, y]) => `${x},${y}`).join(' ')} {...p} />;
  }
}

function Toggle<T extends string>({
  options, value, onChange,
}: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={st.segment}>
      {options.map(([v, lbl]) => {
        const active = value === v;
        return (
          <TouchableOpacity key={v} onPress={() => onChange(v)} style={[st.segBtn, active && st.segBtnActive]} activeOpacity={0.8}>
            <Text style={[st.segTxt, active && st.segTxtActive]}>{lbl}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function BodyMap({
  value, onChange, height = 340, singleSelect = false,
}: {
  value: PainSelection; onChange: (next: PainSelection) => void; height?: number;
  /** Une seule zone à la fois, sans intensité — pour « zone concernée » (disponibilité), pas pour la douleur. */
  singleSelect?: boolean;
}) {
  const [view, setView] = useState<PainView>('front');
  const [mode, setMode] = useState<PainMode>('zone');
  const zones = zonesFor(view, mode);
  const selectedIds = Object.keys(value);
  const width = height * (PAIN_VIEWBOX.w / PAIN_VIEWBOX.h);

  const toggle = (id: string) => {
    if (singleSelect) {
      onChange(value[id] ? {} : { [id]: 1 });
      return;
    }
    const next = cycle(value[id]);
    const copy = { ...value };
    if (next === 0) delete copy[id];
    else copy[id] = next;
    onChange(copy);
  };

  return (
    <View>
      {/* Toggles vue + mode */}
      <View style={st.togglesRow}>
        <Toggle options={[['front', 'Face'], ['back', 'Dos']]} value={view} onChange={setView} />
        <Toggle options={[['zone', 'Zone'], ['articulation', 'Articul.']]} value={mode} onChange={setMode} />
      </View>

      {/* Silhouette */}
      <View style={st.canvas}>
        <Svg width={width} height={height} viewBox={`0 0 ${PAIN_VIEWBOX.w} ${PAIN_VIEWBOX.h}`}>
          {mode === 'articulation' &&
            bodyContextFor(view).map(def => (
              <ZoneShape key={`ctx-${def.id}`} def={def} fill="#eef1f6" stroke={C.border} strokeWidth={1} />
            ))}
          {zones.map(def => {
            const intensity = value[def.id];
            const fill = intensity ? (singleSelect ? SINGLE_SELECT_COLOR : INTENSITY_COLORS[intensity]) : BODY_FILL;
            const stroke = intensity ? (singleSelect ? SINGLE_SELECT_COLOR : INTENSITY_COLORS[intensity]) : BODY_STROKE;
            return (
              <ZoneShape key={def.id} def={def} fill={fill} stroke={stroke}
                strokeWidth={intensity ? 2 : 1.2} onPress={() => toggle(def.id)} />
            );
          })}
        </Svg>
      </View>

      {/* Légende — sans objet en sélection unique (pas de gravité à indiquer) */}
      {!singleSelect && (
        <View style={st.legend}>
          {([1, 2, 3] as PainIntensity[]).map(i => (
            <View key={i} style={st.legendItem}>
              <View style={[st.legendDot, { backgroundColor: INTENSITY_COLORS[i] }]} />
              <Text style={st.legendTxt}>{INTENSITY_LABELS[i]}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Sélection */}
      <View style={st.selRow}>
        <Text style={st.selCount}>
          {selectedIds.length === 0
            ? 'Aucune zone sélectionnée'
            : `${selectedIds.length} zone${selectedIds.length > 1 ? 's' : ''} sélectionnée${selectedIds.length > 1 ? 's' : ''}`}
        </Text>
        {selectedIds.length > 0 && (
          <TouchableOpacity onPress={() => onChange({})}>
            <Text style={st.reset}>↺ Réinitialiser</Text>
          </TouchableOpacity>
        )}
      </View>

      {selectedIds.length > 0 && (
        <View style={st.chips}>
          {selectedIds.map(id => {
            const intensity = value[id];
            const label = zoneById(id)?.label ?? id;
            const color = singleSelect ? SINGLE_SELECT_COLOR : INTENSITY_COLORS[intensity];
            return (
              <TouchableOpacity key={id} onPress={() => toggle(id)} style={[st.chip, { borderColor: color, backgroundColor: color + '1a' }]} activeOpacity={0.7}>
                <Text style={[st.chipTxt, { color }]}>{label}  ×</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  togglesRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  segment: { flexDirection: 'row', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 9, padding: 3 },
  segBtn: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 7 },
  segBtnActive: { backgroundColor: C.navy },
  segTxt: { fontSize: 12, fontWeight: '700', color: C.text2 },
  segTxtActive: { color: '#fff' },

  canvas: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 8, alignItems: 'center' },

  legend: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendTxt: { fontSize: 10, color: C.text2 },

  selRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  selCount: { fontSize: 11, fontWeight: '700', color: C.text3, letterSpacing: 0.6 },
  reset: { fontSize: 12, color: C.text2, fontWeight: '600' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipTxt: { fontSize: 12, fontWeight: '700' },
});
