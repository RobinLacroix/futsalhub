import { useCallback, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { Drill, DrillEntity, DrillPitch } from '../../lib/tactics/types';
import { geo, metersFromViewBox, clamp, round1, type PitchGeo } from '../../lib/tactics/geometry';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { PitchBackground } from './PitchBackground';
import { EntityToken } from './EntityToken';

/**
 * Canvas interactif : terrain + jetons glissables. Port de la mécanique de
 * `onEntityDown`/`dragLoop` (editor.js, web) réduit au strict nécessaire
 * tranche 1 : glisser déplace, tap sélectionne. Pas d'aimantation/alignement,
 * pas de Ctrl+glisser pour dupliquer, pas de sélection multiple — cf
 * PLAN_TACTIQUE_NATIF_MOBILE_TRANCHE1_2026-09.md §5/§7, écarts assumés pour
 * cette tranche.
 *
 * Zones de toucher posées en <View> RN classiques, positionnées en absolu
 * PAR-DESSUS le SVG (pas en formes react-native-svg elles-mêmes) : testé en
 * conditions réelles (Robin, simulateur) qu'un <GestureDetector> posé
 * directement sur une forme react-native-svg n'était pas détecté au toucher
 * dans cette combinaison de versions. Le rendu visuel (jetons) reste dans le
 * SVG, seule la détection du geste est déplacée.
 */
export function TacticsBoard({
  pitch,
  drill,
  entities,
  onEntitiesChange,
  selectedId,
  onSelect,
}: {
  pitch: DrillPitch;
  drill: Pick<Drill, 'teams'>;
  entities: DrillEntity[];
  onEntitiesChange: (entities: DrillEntity[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [width, setWidth] = useState(0);
  const g = geo(pitch);
  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);
  // unités viewBox → points écran (inverse de screenToViewBoxScale utilisé pour convertir un geste en mètres).
  const viewBoxToScreenScale = width > 0 ? width / g.W : 1;

  return (
    <View onLayout={onLayout} style={{ width: '100%', aspectRatio: g.W / g.H }}>
      {width > 0 && (
        <>
          <Svg width={width} height={width * (g.H / g.W)} viewBox={`0 0 ${g.W} ${g.H}`}>
            <PitchBackground pitch={pitch} g={g} />
            {entities.map((entity) => (
              <EntityToken key={entity.id} entity={entity} drill={drill} g={g} selected={entity.id === selectedId} />
            ))}
          </Svg>
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {entities.map((entity) => (
              <EntityHitbox
                key={entity.id}
                entity={entity}
                entities={entities}
                onEntitiesChange={onEntitiesChange}
                onSelect={onSelect}
                g={g}
                pitch={pitch}
                viewBoxToScreenScale={viewBoxToScreenScale}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

/**
 * Zone de toucher d'un jeton. Composant à part (et non un simple .map() inline
 * dans TacticsBoard) précisément pour porter `startRef` : l'ancre du glisser
 * doit être fixée UNE SEULE FOIS au vrai début du geste (onStart), pas
 * recalculée depuis la position courante de l'entité à chaque frame — sinon
 * `e.translationX/Y` (cumulé depuis le début du geste par react-native-gesture-handler,
 * jamais un delta incrémental) s'additionne sur une ancre qui a déjà bougé,
 * et le jeton dérive loin du doigt au lieu de le suivre (bug constaté en test
 * réel avec l'ancienne version qui recalculait `start` à chaque rendu).
 */
function EntityHitbox({
  entity,
  entities,
  onEntitiesChange,
  onSelect,
  g,
  pitch,
  viewBoxToScreenScale,
}: {
  entity: DrillEntity;
  entities: DrillEntity[];
  onEntitiesChange: (entities: DrillEntity[]) => void;
  onSelect: (id: string) => void;
  g: PitchGeo;
  pitch: DrillPitch;
  viewBoxToScreenScale: number;
}) {
  const startRef = useRef({ x: entity.x, y: entity.y });

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => {
      startRef.current = { x: entity.x, y: entity.y };
      onSelect(entity.id);
    })
    .onUpdate((e) => {
      const dvx = e.translationX / viewBoxToScreenScale;
      const dvy = e.translationY / viewBoxToScreenScale;
      const from = metersFromViewBox(g, g.px(startRef.current.x) + dvx, g.py(startRef.current.y) + dvy, pitch.width);
      const nx = clamp(round1(from.x), 0, pitch.length);
      const ny = clamp(round1(from.y), 0, pitch.width);
      onEntitiesChange(entities.map((it) => (it.id === entity.id ? { ...it, x: nx, y: ny } : it)));
    });

  const cx = g.px(entity.x) * viewBoxToScreenScale;
  const cy = g.py(entity.y) * viewBoxToScreenScale;

  return (
    <GestureDetector gesture={pan}>
      <View
        style={{
          position: 'absolute',
          left: cx - HIT_SLOP_MIN / 2,
          top: cy - HIT_SLOP_MIN / 2,
          width: HIT_SLOP_MIN,
          height: HIT_SLOP_MIN,
        }}
      />
    </GestureDetector>
  );
}
