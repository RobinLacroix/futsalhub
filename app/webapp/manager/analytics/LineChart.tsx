/**
 * LineChart — courbe multi-séries en SVG, miroir de
 * mobile/components/charts/LineChart.tsx.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from './ui';

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  data: (number | null)[];
}

export interface LineChartProps {
  labels: string[];
  series: LineSeries[];
  height?: number;
  fromZero?: boolean;
  yMin?: number;
  yMax?: number;
  smooth?: boolean;
  accessibilityLabel?: string;
}

const PAD_L = 30;
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 34;

export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  const d: string[] = [`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`];
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 2] ?? pts[i - 1];
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const p3 = pts[i + 1] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`);
  }
  return d.join(' ');
}

function straightPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

export function labelledIndexes(n: number, max = 5): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const step = Math.floor((n - 1) / (max - 1));
  const out = [0];
  for (let k = 1; k < max - 1; k++) out.push(step * k);
  out.push(n - 1);
  return [...new Set(out)];
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (max <= min) return [min];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step / 2; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

export function LineChart({
  labels, series, height = 150, fromZero = false, yMin, yMax, smooth = true, accessibilityLabel,
}: LineChartProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = labels.length;
  const plotW = Math.max(0, width - PAD_L - PAD_R);
  const plotH = height;
  const svgH = PAD_T + plotH + PAD_B;

  const bounds = useMemo(() => {
    const values = series.flatMap((s) => s.data.filter((v): v is number => v != null));
    const lo = yMin ?? (fromZero ? 0 : Math.min(0, ...values));
    const hi = yMax ?? Math.max(1, ...values);
    return { lo, hi: hi === lo ? lo + 1 : hi };
  }, [series, yMin, yMax, fromZero]);

  const ticks = useMemo(() => niceTicks(bounds.lo, bounds.hi), [bounds]);
  const top = Math.max(bounds.hi, ticks[ticks.length - 1] ?? bounds.hi);

  const toY = (v: number) => PAD_T + plotH - ((v - bounds.lo) / (top - bounds.lo)) * plotH;
  const toX = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);

  const trace = smooth ? smoothPath : straightPath;

  return (
    <div ref={containerRef} style={{ width: '100%' }} role={accessibilityLabel ? 'img' : undefined} aria-label={accessibilityLabel}>
      {width > 0 && (
        <svg width={width} height={svgH}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD_L} y1={toY(v)} x2={PAD_L + plotW} y2={toY(v)} stroke={c.chartGrid} strokeWidth={1} />
              <text x={PAD_L - 6} y={toY(v) + 4} textAnchor="end" fontSize={11} fill={c.text.tertiary}>{v}</text>
            </g>
          ))}

          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke={c.border.strong} strokeWidth={1} />

          {series.map((s) => {
            const pts = s.data.reduce<{ x: number; y: number }[]>((acc, v, i) => {
              if (v != null) acc.push({ x: toX(i), y: toY(v) });
              return acc;
            }, []);
            const d = trace(pts);
            return d ? (
              <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            ) : null;
          })}

          {series.map((s) =>
            s.data.map((v, i) => (v == null ? null : <circle key={`${s.key}-${i}`} cx={toX(i)} cy={toY(v)} r={3} fill={s.color} />))
          )}

          {labelledIndexes(n).map((i) => (
            <text key={i} x={toX(i)} y={PAD_T + plotH + 18} textAnchor="middle" fontSize={11} fill={c.text.tertiary}>
              {labels[i]}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}

/** Puce de légende, pour afficher ou masquer une série. */
export function SeriesToggle({
  label, color, active, disabled = false, onPress,
}: {
  label: string; color: string; active: boolean; disabled?: boolean; onPress: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 11px',
        borderRadius: theme.radius.pill,
        border: `1.5px solid ${active ? color : c.border.subtle}`,
        backgroundColor: active ? c.bg.sunken : 'transparent',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: active ? color : c.border.strong }} />
      <Text variant="caption" color={active ? c.text.primary : c.text.tertiary} weight={600}>{label}</Text>
    </button>
  );
}
