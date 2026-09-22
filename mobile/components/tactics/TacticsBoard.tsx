import { useCallback, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { Drill, DrillEntity, DrillLine, DrillPitch, DrillPulse, DrillText, DrillZone } from '../../lib/tactics/types';
import { geo, metersFromViewBox, clamp, round1, type PitchGeo } from '../../lib/tactics/geometry';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { PitchBackground } from './PitchBackground';
import { EntityToken } from './EntityToken';
import { ZoneShape } from './ZoneShape';
import { FreeLine } from './FreeLine';
import { FreeTextMarker } from './FreeTextMarker';
import { PulseMarker } from './PulseMarker';

export type SelectedItem = { kind: 'entity' | 'zone' | 'line' | 'text' | 'pulse'; id: string } | null;

/**
 * Canvas interactif : terrain + tout ce qui se positionne dessus (tranche 2 :
 * jetons, zones, traits, textes, pulses). Port de la mécanique de
 * `onEntityDown`/`dragLoop` (editor.js, web) réduit au strict nécessaire :
 * glisser déplace, tap sélectionne. Pas d'aimantation/alignement, pas de
 * dessin libre au doigt pour créer une zone/un trait courbé (création
 * limitée au rectangle/trait droit, cf lib/tactics/types.ts et
 * PLAN_TACTIQUE_NATIF_MOBILE_TRANCHE1_2026-09.md §5/§7 pour les écarts
 * assumés). Pas de panneau d'édition (couleur/taille/contenu du texte) —
 * tranche 3.
 *
 * Zones de toucher posées en <View> RN classiques, positionnées en absolu
 * PAR-DESSUS le SVG (pas en formes react-native-svg elles-mêmes) : un
 * <GestureDetector> posé directement sur une forme react-native-svg n'était
 * pas détecté au toucher dans cette combinaison de versions (testé en
 * conditions réelles, tranche 1). Chaque poignée fixe sa position de départ
 * dans une ref au tout début du geste (onStart) — jamais recalculée depuis
 * l'état courant à chaque frame, sinon le point dérive du doigt (translationX/Y
 * de react-native-gesture-handler est cumulé depuis le début du geste, pas un
 * delta par frame — même bug que tranche 1, corrigé une fois pour toutes ici).
 */
export function TacticsBoard({
  pitch,
  drill,
  entities,
  onEntitiesChange,
  zones,
  onZonesChange,
  lines,
  onLinesChange,
  texts,
  onTextsChange,
  pulses,
  onPulsesChange,
  selected,
  onSelect,
}: {
  pitch: DrillPitch;
  drill: Pick<Drill, 'teams'>;
  entities: DrillEntity[];
  onEntitiesChange: (entities: DrillEntity[]) => void;
  zones: DrillZone[];
  onZonesChange: (zones: DrillZone[]) => void;
  lines: DrillLine[];
  onLinesChange: (lines: DrillLine[]) => void;
  texts: DrillText[];
  onTextsChange: (texts: DrillText[]) => void;
  pulses: DrillPulse[];
  onPulsesChange: (pulses: DrillPulse[]) => void;
  selected: SelectedItem;
  onSelect: (item: SelectedItem) => void;
}) {
  const [width, setWidth] = useState(0);
  const g = geo(pitch);
  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);
  const viewBoxToScreenScale = width > 0 ? width / g.W : 1;

  const isSel = (kind: NonNullable<SelectedItem>['kind'], id: string) => !!selected && selected.kind === kind && selected.id === id;

  return (
    <View onLayout={onLayout} style={{ width: '100%', aspectRatio: g.W / g.H }}>
      {width > 0 && (
        <>
          <Svg width={width} height={width * (g.H / g.W)} viewBox={`0 0 ${g.W} ${g.H}`}>
            <PitchBackground pitch={pitch} g={g} />
            {zones.map((z) => (
              <ZoneShape key={z.id} zone={z} g={g} selected={isSel('zone', z.id)} />
            ))}
            {lines.map((ln) => (
              <FreeLine key={ln.id} line={ln} g={g} />
            ))}
            {texts.map((tx) => (
              <FreeTextMarker key={tx.id} item={tx} g={g} />
            ))}
            {pulses.map((pu) => (
              <PulseMarker key={pu.id} item={pu} g={g} selected={isSel('pulse', pu.id)} />
            ))}
            {entities.map((entity) => (
              <EntityToken key={entity.id} entity={entity} drill={drill} g={g} selected={isSel('entity', entity.id)} />
            ))}
          </Svg>
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {entities.map((entity) => (
              <PointHandle
                key={entity.id}
                x={entity.x}
                y={entity.y}
                g={g}
                pitch={pitch}
                viewBoxToScreenScale={viewBoxToScreenScale}
                onSelect={() => onSelect({ kind: 'entity', id: entity.id })}
                onMove={(nx, ny) => onEntitiesChange(entities.map((it) => (it.id === entity.id ? { ...it, x: nx, y: ny } : it)))}
              />
            ))}
            {pulses.map((pu) => (
              <PointHandle
                key={pu.id}
                x={pu.x}
                y={pu.y}
                g={g}
                pitch={pitch}
                viewBoxToScreenScale={viewBoxToScreenScale}
                onSelect={() => onSelect({ kind: 'pulse', id: pu.id })}
                onMove={(nx, ny) => onPulsesChange(pulses.map((it) => (it.id === pu.id ? { ...it, x: nx, y: ny } : it)))}
              />
            ))}
            {texts.map((tx) => (
              <PointHandle
                key={tx.id}
                x={tx.x}
                y={tx.y}
                g={g}
                pitch={pitch}
                viewBoxToScreenScale={viewBoxToScreenScale}
                onSelect={() => onSelect({ kind: 'text', id: tx.id })}
                onMove={(nx, ny) => onTextsChange(texts.map((it) => (it.id === tx.id ? { ...it, x: nx, y: ny } : it)))}
              />
            ))}
            {lines.map((ln) => (
              <View key={ln.id}>
                <PointHandle
                  x={ln.x1}
                  y={ln.y1}
                  g={g}
                  pitch={pitch}
                  viewBoxToScreenScale={viewBoxToScreenScale}
                  onSelect={() => onSelect({ kind: 'line', id: ln.id })}
                  onMove={(nx, ny) => onLinesChange(lines.map((it) => (it.id === ln.id ? { ...it, x1: nx, y1: ny } : it)))}
                />
                <PointHandle
                  x={ln.x2}
                  y={ln.y2}
                  g={g}
                  pitch={pitch}
                  viewBoxToScreenScale={viewBoxToScreenScale}
                  onSelect={() => onSelect({ kind: 'line', id: ln.id })}
                  onMove={(nx, ny) => onLinesChange(lines.map((it) => (it.id === ln.id ? { ...it, x2: nx, y2: ny } : it)))}
                />
              </View>
            ))}
            {zones.map((z) => (
              <View key={z.id}>
                {/* Déplace toute la zone (ancre bas-gauche x,y). */}
                <PointHandle
                  x={(z.x ?? 0) + (z.w ?? 4) / 2}
                  y={(z.y ?? 0) + (z.h ?? 4) / 2}
                  g={g}
                  pitch={pitch}
                  viewBoxToScreenScale={viewBoxToScreenScale}
                  onSelect={() => onSelect({ kind: 'zone', id: z.id })}
                  onMove={(nx, ny) =>
                    onZonesChange(zones.map((it) => (it.id === z.id ? { ...it, x: nx - (it.w ?? 4) / 2, y: ny - (it.h ?? 4) / 2 } : it)))
                  }
                />
                {/* Redimensionne depuis le coin haut-droit (x+w, y+h). */}
                <PointHandle
                  x={(z.x ?? 0) + (z.w ?? 4)}
                  y={(z.y ?? 0) + (z.h ?? 4)}
                  g={g}
                  pitch={pitch}
                  viewBoxToScreenScale={viewBoxToScreenScale}
                  onSelect={() => onSelect({ kind: 'zone', id: z.id })}
                  onMove={(nx, ny) =>
                    onZonesChange(
                      zones.map((it) =>
                        it.id === z.id ? { ...it, w: clamp(round1(nx - (it.x ?? 0)), 0.5, pitch.length), h: clamp(round1(ny - (it.y ?? 0)), 0.5, pitch.width) } : it
                      )
                    )
                  }
                  size={HIT_SLOP_MIN * 0.7}
                />
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

/**
 * Poignée de glisser générique : un point (x,y en mètres) qu'on peut
 * sélectionner et déplacer. Couvre entités/pulses/textes/extrémités de
 * trait/déplacement-et-redimensionnement de zone (cf commentaire de tête sur
 * l'ancrage stable — `startRef` fixé une seule fois dans onStart).
 */
function PointHandle({
  x,
  y,
  g,
  pitch,
  viewBoxToScreenScale,
  onSelect,
  onMove,
  size = HIT_SLOP_MIN,
}: {
  x: number;
  y: number;
  g: PitchGeo;
  pitch: DrillPitch;
  viewBoxToScreenScale: number;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  size?: number;
}) {
  const startRef = useRef({ x, y });

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => {
      startRef.current = { x, y };
      onSelect();
    })
    .onUpdate((e) => {
      const dvx = e.translationX / viewBoxToScreenScale;
      const dvy = e.translationY / viewBoxToScreenScale;
      const from = metersFromViewBox(g, g.px(startRef.current.x) + dvx, g.py(startRef.current.y) + dvy, pitch.width);
      onMove(clamp(round1(from.x), 0, pitch.length), clamp(round1(from.y), 0, pitch.width));
    });

  const cx = g.px(x) * viewBoxToScreenScale;
  const cy = g.py(y) * viewBoxToScreenScale;

  return (
    <GestureDetector gesture={pan}>
      <View style={{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size }} />
    </GestureDetector>
  );
}
