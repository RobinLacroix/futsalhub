import { Circle } from 'react-native-svg';
import type { DrillPulse } from '../../lib/tactics/types';
import type { PitchGeo } from '../../lib/tactics/geometry';

/**
 * Port réduit de drawPulse() (render-core.js, web) : le clignotement continu
 * y repose sur SMIL (<animate>), mal/pas supporté par react-native-svg —
 * rendu ici en anneau fixe plutôt qu'animé (écart assumé, cosmétique, pas
 * fonctionnel : le pulse reste visible et à sa place).
 */
export function PulseMarker({ item, g, selected }: { item: DrillPulse; g: PitchGeo; selected?: boolean }) {
  const cx = g.px(item.x);
  const cy = g.py(item.y);
  const color = item.color || '#ff3b30';
  const baseR = 6 * (item.size || 1);

  return (
    <>
      {selected && <Circle cx={cx} cy={cy} r={baseR + 16} fill="none" stroke="#ffd21f" strokeWidth={2} />}
      <Circle cx={cx} cy={cy} r={baseR} fill="none" stroke={color} strokeWidth={2.5} opacity={0.8} />
      <Circle cx={cx} cy={cy} r={baseR * 0.55} fill={color} opacity={0.95} />
    </>
  );
}
