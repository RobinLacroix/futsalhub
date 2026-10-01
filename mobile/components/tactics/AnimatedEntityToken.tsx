import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg from 'react-native-svg';
import type { Drill, DrillEntity, DrillTimeline } from '../../lib/tactics/types';
import type { PitchGeo } from '../../lib/tactics/geometry';
import { sampleEntityAt } from '../../lib/tactics/timeline';
import { EntityTokenShape } from './EntityToken';

/**
 * Fenêtre locale (unités viewBox) dans laquelle la forme d'un jeton est
 * dessinée, centrée sur (0,0) — cf EntityTokenShape. Assez large pour
 * contenir le plus gros équipement (l'échelle fait jusqu'à 4m de large, soit
 * ~66 unités à sc≈16.5) et l'anneau de sélection, sans être rognée.
 */
const LOCAL_HALF = 70;
const LOCAL_SIZE = LOCAL_HALF * 2;

/** Points échantillonnés par clip pour construire la trajectoire interpolée — cf commentaire plus bas. */
const SAMPLES_PER_CLIP = 14;

export interface AnimatedEntityTokenHandle {
  /** Anime depuis l'instant `tMs` (ms, échelle de la timeline) jusqu'à la fin des clips restants, à la vitesse `speed`. */
  playFrom(tMs: number, speed: number): void;
  /** Arrête toute animation en cours — le jeton reste où il est. */
  stop(): void;
  /** Repositionne instantanément (pas d'animation) à l'instant `tMs` — utilisé par la navigation étape par étape. */
  seekTo(tMs: number): void;
}

interface Trajectory {
  /** Bornes (ms) strictement croissantes — cf contrainte d'Animated.interpolate. */
  inputRange: number[];
  outputX: number[];
  outputY: number[];
}

/**
 * Échantillonne la trajectoire RÉELLE de l'entité (courbes Catmull-Rom/chaîne
 * de Béziers incluses — même maths que `sampleEntityAt`, donc même rendu que
 * le web) en `SAMPLES_PER_CLIP` points par clip, en pixels écran. Sert de
 * table de correspondance à `Animated.Value.interpolate()`, qui tourne côté
 * natif (JSI) même avec `useNativeDriver: true` — une interpolation à N
 * points n'est pas plus "JS" qu'une interpolation à 2 points pour le natif,
 * seule la table change.
 */
function buildTrajectory(tl: DrillTimeline, id: string, toPxX: (v: number) => number, toPxY: (v: number) => number): Trajectory {
  const rec = tl.entities[id];
  const inputRange: number[] = [];
  const outputX: number[] = [];
  const outputY: number[] = [];
  const push = (ms: number) => {
    if (inputRange.length && ms <= inputRange[inputRange.length - 1]) return; // interpolate exige un ordre strictement croissant
    const pos = (rec && sampleEntityAt(tl, id, ms)) ?? rec?.spawn ?? { x: 0, y: 0 };
    inputRange.push(ms);
    outputX.push(toPxX(pos.x));
    outputY.push(toPxY(pos.y));
  };
  if (rec && rec.clips.length) {
    for (const clip of rec.clips) {
      for (let i = 0; i <= SAMPLES_PER_CLIP; i++) {
        push(clip.startMs + (clip.durationMs * i) / SAMPLES_PER_CLIP);
      }
    }
  } else {
    push(0);
  }
  if (inputRange.length < 2) {
    inputRange.push(inputRange[0] + 1);
    outputX.push(outputX[0]);
    outputY.push(outputY[0]);
  }
  return { inputRange, outputX, outputY };
}

/**
 * Jeton animé pour la lecture continue (DrillPlayer) — pilote sa position via
 * l'API `Animated` du cœur de React Native (PAS Reanimated) avec
 * `useNativeDriver: true` : une fois `Animated.timing` démarrée, l'animation
 * tourne entièrement côté natif (Core Animation sur iOS), sans plus jamais
 * repasser par le thread JS jusqu'à la frame suivante. C'est le mécanisme
 * standard de React Native pour des animations fluides sur l'ancienne
 * architecture — actif bien avant Fabric/Reanimated.
 *
 * Tentatives précédentes qui n'ont PAS marché (2026-09-28) :
 * - `useState`/`requestAnimationFrame` (même throttlé à 20 fps, même avec
 *   `setTimeout` pour espacer les ticks) : chaque commit re-rend tout l'arbre
 *   <Svg>, et sur ce projet (ancienne architecture RN, confirmé même en build
 *   Xcode natif hors Expo Go) le pont ne peint jamais les états
 *   intermédiaires — repéré à l'image près sur un enregistrement Robin :
 *   aucune frame entre "avant déplacement" et "déplacement terminé", alors
 *   que `setT` était appelé ~15 fois dans l'intervalle.
 * - Reanimated (`useAnimatedProps` + `matrix`) : les worklets s'exécutent
 *   (shared values, runOnJS) mais aucune mise à jour n'atteint jamais le
 *   rendu natif — Reanimated 4 dépend de Fabric, indisponible ici.
 * - Une première version de cette approche animait `translateX`/`translateY`
 *   directement par `Animated.timing` PAR CLIP (ligne droite entre `from` et
 *   `to`) : ça a résolu le figement, mais perdait les courbes (mode avancé,
 *   `curve`/`ctrls`) — un mouvement courbe devenait un trajet en ligne droite.
 *   Cette version-ci anime une seule valeur de progression (ms) et en dérive
 *   x/y par `interpolate()` sur une trajectoire échantillonnée le long de la
 *   VRAIE courbe (cf `buildTrajectory`), donc le rendu redevient fidèle au
 *   web tout en restant piloté par le natif.
 *
 * Cette version ne re-rend JAMAIS le composant pendant la lecture : seule la
 * `Animated.View` bouge (via `transform`), le SVG interne (forme/couleur/
 * étiquette) ne change qu'aux frontières de clip, à basse fréquence.
 */
export const AnimatedEntityToken = forwardRef<
  AnimatedEntityTokenHandle,
  {
    id: string;
    entity: DrillEntity;
    drill: Pick<Drill, 'teams'>;
    g: PitchGeo;
    tl: DrillTimeline;
    /** Largeur du conteneur en pixels écran — sert à convertir les unités viewBox en pixels pour le `transform`. */
    containerWidthPx: number;
    selected?: boolean;
  }
>(function AnimatedEntityToken({ id, entity, drill, g, tl, containerWidthPx, selected }, ref) {
  const scale = containerWidthPx > 0 ? containerWidthPx / g.W : 0;
  const toPxX = (meterX: number) => g.px(meterX) * scale;
  const toPxY = (meterY: number) => g.py(meterY) * scale;

  const progress = useRef(new Animated.Value(0)).current;

  const trajectory = useMemo(
    () => buildTrajectory(tl, id, toPxX, toPxY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tl, id, scale],
  );

  const x = useMemo(
    () => progress.interpolate({ inputRange: trajectory.inputRange, outputRange: trajectory.outputX, extrapolate: 'clamp' }),
    [progress, trajectory.inputRange, trajectory.outputX],
  );
  const y = useMemo(
    () => progress.interpolate({ inputRange: trajectory.inputRange, outputRange: trajectory.outputY, extrapolate: 'clamp' }),
    [progress, trajectory.inputRange, trajectory.outputY],
  );

  useImperativeHandle(
    ref,
    () => ({
      playFrom(tMs: number, speed: number) {
        progress.stopAnimation();
        progress.setValue(tMs);
        const lastMs = trajectory.inputRange[trajectory.inputRange.length - 1];
        if (lastMs > tMs) {
          Animated.timing(progress, {
            toValue: lastMs,
            duration: (lastMs - tMs) / speed,
            easing: Easing.linear,
            useNativeDriver: true,
          }).start();
        }
      },
      stop() {
        progress.stopAnimation();
      },
      seekTo(tMs: number) {
        progress.stopAnimation();
        progress.setValue(tMs);
      },
    }),
    [progress, trajectory],
  );

  const tokenSizePx = LOCAL_SIZE * scale;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: -tokenSizePx / 2,
        top: -tokenSizePx / 2,
        width: tokenSizePx,
        height: tokenSizePx,
        transform: [{ translateX: x }, { translateY: y }],
      }}
    >
      <Svg width={tokenSizePx} height={tokenSizePx} viewBox={`${-LOCAL_HALF} ${-LOCAL_HALF} ${LOCAL_SIZE} ${LOCAL_SIZE}`}>
        <EntityTokenShape entity={entity} drill={drill} g={g} selected={selected} />
      </Svg>
    </Animated.View>
  );
});
