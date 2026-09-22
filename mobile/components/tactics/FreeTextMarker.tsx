import { G, Text as SvgText, TSpan } from 'react-native-svg';
import type { DrillText } from '../../lib/tactics/types';
import type { PitchGeo } from '../../lib/tactics/geometry';

/** Port de drawFreeText() (render-core.js, web) — multi-ligne via TSpan, même convention. */
export function FreeTextMarker({ item, g }: { item: DrillText; g: PitchGeo }) {
  const size = item.size || 13;
  const color = item.color || '#ffffff';
  const anchor = item.align === 'left' ? 'start' : item.align === 'right' ? 'end' : 'middle';
  const lines = (item.text || '').split('\n');
  const lineH = size * 1.2;
  const blockH = (lines.length - 1) * lineH;
  const outline = item.outline !== false;

  return (
    <G x={g.px(item.x)} y={g.py(item.y)}>
      <SvgText
        x={0}
        y={size * 0.35 - blockH / 2}
        fontSize={size}
        fontWeight={item.bold === false ? 'normal' : 'bold'}
        fill={color}
        textAnchor={anchor}
        stroke={outline ? 'rgba(0,0,0,0.55)' : undefined}
        strokeWidth={outline ? 3 : undefined}
      >
        {lines.map((ln, i) => (
          <TSpan key={i} x={0} dy={i === 0 ? 0 : lineH}>
            {ln}
          </TSpan>
        ))}
      </SvgText>
    </G>
  );
}
