import { useCallback, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg from 'react-native-svg';
import type { Drill } from '../../lib/tactics/types';
import { geo } from '../../lib/tactics/geometry';
import { PitchBackground } from './PitchBackground';
import { EntityToken } from './EntityToken';
import { ZoneShape } from './ZoneShape';
import { FreeLine } from './FreeLine';
import { FreeTextMarker } from './FreeTextMarker';
import { PulseMarker } from './PulseMarker';

/**
 * Rendu STATIQUE d'un schéma (première étape uniquement, aucun geste) —
 * réutilisé pour la grille de la bibliothèque (taille fixe, `size`) et
 * l'aperçu plein écran (`size` omis, se dimensionne à la largeur
 * disponible via onLayout, même mécanique que l'ancien TacticsBoard mais
 * sans la couche de glisser). Seule cette version en lecture seule survit à
 * l'abandon de l'éditeur interactif sur mobile (cf
 * SPEC_TACTIQUE_NATIF_MOBILE_2026-09.md §5).
 */
export function SchematicThumbnail({ drill, size }: { drill: Drill; size?: number }) {
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const width = size ?? measuredWidth;
  const g = geo(drill.pitch);
  const kf = drill.keyframes?.[0];

  const onLayout = useCallback((e: LayoutChangeEvent) => setMeasuredWidth(e.nativeEvent.layout.width), []);

  return (
    <View onLayout={size ? undefined : onLayout} style={size ? { width: size, aspectRatio: g.W / g.H } : { width: '100%', aspectRatio: g.W / g.H }}>
      {width > 0 && kf && (
        <Svg width={width} height={width * (g.H / g.W)} viewBox={`0 0 ${g.W} ${g.H}`}>
          <PitchBackground pitch={drill.pitch} g={g} />
          {(drill.zones ?? []).map((z) => (
            <ZoneShape key={z.id} zone={z} g={g} />
          ))}
          {kf.lines.map((ln) => (
            <FreeLine key={ln.id} line={ln} g={g} />
          ))}
          {kf.texts.map((tx) => (
            <FreeTextMarker key={tx.id} item={tx} g={g} />
          ))}
          {kf.pulses.map((pu) => (
            <PulseMarker key={pu.id} item={pu} g={g} />
          ))}
          {kf.entities.map((entity) => (
            <EntityToken key={entity.id} entity={entity} drill={drill} g={g} />
          ))}
        </Svg>
      )}
    </View>
  );
}
