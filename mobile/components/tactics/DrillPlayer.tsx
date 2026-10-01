import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { Text } from '../ui';
import type { Drill } from '../../lib/tactics/types';
import { geo } from '../../lib/tactics/geometry';
import { buildOverlays, buildEntityTimeline, collectBoundaryMs, frameAt, resolveVariant, stepBoundariesMs } from '../../lib/tactics/timeline';
import { PitchBackground } from './PitchBackground';
import { AnimatedEntityToken, type AnimatedEntityTokenHandle } from './AnimatedEntityToken';
import { ZoneShape } from './ZoneShape';
import { MovementArrow } from './MovementArrow';
import { FreeLine } from './FreeLine';
import { FreeTextMarker } from './FreeTextMarker';
import { PulseMarker } from './PulseMarker';
import { FilterChip } from './FilterChip';

const SPEEDS = [1, 1.5, 2] as const;

/**
 * Lecteur d'animation en lecture seule — même mathématique que "Lecture" côté
 * éditeur web (public/tools/tactics/render-core.js : buildEntityTimeline +
 * sampleEntityAt, portés dans lib/tactics/timeline.ts). Un seul lecteur pour
 * les deux cas demandés par Robin : "step" (boutons étape précédente/suivante,
 * qui sautent aux frontières d'étape) et "mode avancé" (lecture continue —
 * si le schéma a été édité en mode avancé côté web, sa timeline porte des
 * clips courbes/désynchronisés que ce même lecteur restitue fidèlement, sans
 * code spécifique : il n'y a qu'une seule timeline canonique, cf commentaire
 * cleanDrill() dans editor.js).
 *
 * Sélecteur de variantes (2026-09-22, retour de Robin après premier test) :
 * un schéma peut porter plusieurs variantes (`drill.variants`), chacune avec
 * sa propre timeline — le lecteur ne jouait que la variante active par
 * défaut, les autres étaient invisibles côté mobile alors qu'elles existent
 * bien côté web.
 *
 * Jamais d'édition ici (pas de geste de déplacement) — cf SPEC_TACTIQUE_NATIF_
 * MOBILE_2026-09.md §5, le dessin/l'édition de schéma reste une tâche web.
 *
 * ## Position des jetons pendant la lecture (réécrit 2026-09-28)
 *
 * Deux approches essayées et abandonnées avant celle-ci, cf leur historique
 * dans AnimatedEntityToken.tsx : `useState`/`requestAnimationFrame` (même
 * throttlé, même avec `setTimeout`) et Reanimated (`useAnimatedProps`) — dans
 * les deux cas, confirmé sur un vrai build Xcode (donc pas une limite d'Expo
 * Go), le jeton ne bouge jamais pendant la lecture : il saute directement de
 * sa position de départ à sa position finale, sans aucune image
 * intermédiaire peinte (vérifié image par image sur un enregistrement écran).
 *
 * Ici, la position des jetons N'EST PLUS pilotée par le state React `t` du
 * tout : chaque <AnimatedEntityToken> gère sa propre `Animated.Value` (API
 * `Animated` du cœur de React Native, pas Reanimated) et se déplace via
 * `Animated.timing(..., { useNativeDriver: true })`, qui tourne côté natif
 * (Core Animation) sans jamais redemander au thread JS de peindre quoi que ce
 * soit frame par frame — le mécanisme standard de RN pour des animations
 * fluides sur l'ancienne architecture, utilisé en production depuis des
 * années, bien avant Fabric/Reanimated. `t` (state JS, throttlé) ne sert plus
 * qu'à ce qui n'a pas besoin d'être lissé à 60 fps : barre de progression,
 * libellé d'étape, flèches/traits/textes/pulses (qui restent re-rendus par
 * React à chaque tick, sujets au même figement que les jetons avant — mais
 * secondaires : Robin peut voir le joueur bouger, c'est ce qui compte).
 *
 * DrillPlayer pilote les jetons de façon impérative via des refs
 * (`entityRefs`) plutôt que par props réactives : appeler `playFrom`/`stop`/
 * `seekTo` directement évite tout re-rendu React lié à la position pendant
 * la lecture.
 */
export function DrillPlayer({ drill }: { drill: Drill }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const s = useStyles();

  const variants = drill.variants ?? [];
  const [variantIndex, setVariantIndex] = useState(drill.activeVariantIndex ?? 0);

  const g = useMemo(() => geo(drill.pitch), [drill.pitch]);
  const { keyframes, timeline: storedTimeline } = useMemo(() => resolveVariant(drill, variantIndex), [drill, variantIndex]);
  const boundaries = useMemo(() => stepBoundariesMs(keyframes), [keyframes]);
  const tl = useMemo(() => storedTimeline ?? buildEntityTimeline(keyframes), [storedTimeline, keyframes]);
  const overlays = useMemo(() => buildOverlays(keyframes), [keyframes]);
  const totalMs = tl.totalMs;
  const canPlay = totalMs > 0 && keyframes.length > 1;

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [width, setWidth] = useState(0);

  // Refs impératives vers chaque jeton animé — persistent tant que le composant
  // ne démonte pas, indépendamment des re-rendus déclenchés par `t`.
  const entityRefs = useRef(new Map<string, AnimatedEntityTokenHandle>()).current;
  const refCallbacks = useRef(new Map<string, (h: AnimatedEntityTokenHandle | null) => void>()).current;
  const getRefCallback = useCallback(
    (id: string) => {
      let cb = refCallbacks.get(id);
      if (!cb) {
        cb = (h) => {
          if (h) entityRefs.set(id, h);
          else entityRefs.delete(id);
        };
        refCallbacks.set(id, cb);
      }
      return cb;
    },
    [entityRefs, refCallbacks],
  );

  // Changer de variante repart de zéro plutôt que de garder un `t` qui ne
  // correspond plus à rien sur la nouvelle timeline (durées différentes) —
  // et repositionne tous les jetons déjà montés (une instance peut survivre
  // au changement de variante si les ids d'entités se recoupent).
  useEffect(() => {
    setT(0);
    setPlaying(false);
    entityRefs.forEach((h) => h.seekTo(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantIndex]);

  // Lance/arrête l'animation native des jetons — volontairement PAS dépendant
  // de `t` (qui change ~10x/s pendant la lecture) : ne réagit qu'aux
  // transitions play/pause et aux changements de vitesse en cours de lecture,
  // en lisant `t` au moment du déclenchement (fermeture sur sa valeur du
  // rendu courant, exactement ce qu'il faut pour reprendre depuis la position
  // actuelle).
  useEffect(() => {
    if (playing) {
      entityRefs.forEach((h) => h.playFrom(t, SPEEDS[speedIndex]));
    } else {
      entityRefs.forEach((h) => h.stop());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speedIndex]);

  // Bornes (ms) où le contenu non continu du schéma change réellement — cf
  // collectBoundaryMs (timeline.ts). Sert à ne réveiller `t` (state JS) qu'à
  // ces instants précis pendant la lecture, pas à intervalle fixe.
  const boundaryMsList = useMemo(() => collectBoundaryMs(tl, overlays, totalMs), [tl, overlays, totalMs]);

  useEffect(() => {
    if (!playing) return undefined;
    // Un sondage à intervalle fixe (même à 30ms, même à 100ms) reste un flux
    // CONTINU de commits React tant que la lecture tourne — flèches/traits/
    // textes/pulses restent rendus par React (contrairement aux jetons,
    // passés au natif dans AnimatedEntityToken), et sur ce projet (ancienne
    // architecture RN) un tel flux continu a empêché le pont natif de peindre
    // au-delà du tout premier état, quelle que soit la fréquence — constaté
    // par Robin après le passage à 30ms : "seule la première flèche
    // apparaît, en ligne droite" (figée sur le premier clip, jamais mis à
    // jour vers un clip suivant, courbe ou non). Ici, `t` n'est mis à jour
    // qu'aux instants EXACTS où une flèche/un survol apparaît ou disparaît
    // (`boundaryMsList`, cf collectBoundaryMs) — entre deux bornes, rien n'est
    // programmé sur le thread JS, qui reste donc réellement inactif, et le
    // pont a une vraie fenêtre pour peindre chaque changement.
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    function scheduleFrom(fromMs: number) {
      const speed = SPEEDS[speedIndex];
      const next = boundaryMsList.find((ms) => ms > fromMs + 0.5) ?? totalMs;
      const delayMs = Math.max(0, (next - fromMs) / speed);
      timeoutId = setTimeout(() => {
        setT(next);
        if (next < totalMs) scheduleFrom(next);
      }, delayMs);
    }
    scheduleFrom(t);
    return () => {
      if (timeoutId != null) clearTimeout(timeoutId);
    };
    // `t` volontairement absent des deps : ne relancer la programmation que sur
    // play/pause/vitesse, pas à chaque borne franchie (scheduleFrom s'enchaîne
    // lui-même) — sinon l'effet se redéclencherait en boucle à chaque setT.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speedIndex, totalMs, boundaryMsList]);

  // Coupe la lecture une fois la fin atteinte, plutôt que de boucler sans le dire.
  useEffect(() => {
    if (playing && t >= totalMs) setPlaying(false);
  }, [playing, t, totalMs]);

  const frame = useMemo(() => frameAt(drill, tl, overlays, Math.min(t, totalMs)), [drill, tl, overlays, t, totalMs]);

  const currentStep = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < boundaries.length; i++) if (t >= boundaries[i] - 1) idx = i;
    return idx;
  }, [t, boundaries]);

  const togglePlay = useCallback(() => {
    if (!canPlay) return;
    if (t >= totalMs) setT(0);
    setPlaying((p) => !p);
  }, [canPlay, t, totalMs]);

  const stepTo = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(boundaries.length - 1, idx));
      const ms = boundaries[clamped];
      setPlaying(false);
      setT(ms);
      entityRefs.forEach((h) => h.seekTo(ms));
    },
    [boundaries, entityRefs],
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);

  return (
    <View>
      {variants.length > 1 && (
        <View style={s.variantRow}>
          {variants.map((v, i) => (
            <FilterChip key={v.id || i} active={i === variantIndex} label={v.name || `Variante ${i + 1}`} onPress={() => setVariantIndex(i)} />
          ))}
        </View>
      )}

      <View onLayout={onLayout} style={{ width: '100%', aspectRatio: g.W / g.H }}>
        {width > 0 && (
          <>
            <Svg width={width} height={width * (g.H / g.W)} viewBox={`0 0 ${g.W} ${g.H}`}>
              <PitchBackground pitch={drill.pitch} g={g} />
              {/* Clé composée id+index : cf SchematicThumbnail, des doublons
                  d'id existent sur certains schémas historiques. */}
              {frame.zones.map((z, i) => (
                <ZoneShape key={`${z.id}-${i}`} zone={z} g={g} />
              ))}
              {/* Ordre calqué sur Z_BASE côté web (zone < arrow < line < text < entity) :
                  la flèche d'un déplacement en cours doit rester sous le jeton qu'elle
                  explique, pas par-dessus. Les jetons eux-mêmes sont maintenant hors de ce
                  <Svg>, dans le calque animé ci-dessous. */}
              {frame.arrows.map((a, i) => (
                <MovementArrow key={`arrow-${i}`} arrow={a} g={g} />
              ))}
              {frame.lines.map((ln, i) => (
                <FreeLine key={`${ln.id}-${i}`} line={ln} g={g} />
              ))}
              {frame.texts.map((tx, i) => (
                <FreeTextMarker key={`${tx.id}-${i}`} item={tx} g={g} />
              ))}
              {frame.pulses.map((pu, i) => (
                <PulseMarker key={`${pu.id}-${i}`} item={pu} g={g} />
              ))}
            </Svg>
            {/* Calque des jetons — au-dessus du <Svg>, chacun positionné par sa propre
                Animated.View (cf AnimatedEntityToken). */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {frame.entities.map((entity, i) => (
                <AnimatedEntityToken
                  key={`${entity.id}-${i}`}
                  ref={getRefCallback(entity.id)}
                  id={entity.id}
                  entity={entity}
                  drill={drill}
                  g={g}
                  tl={tl}
                  containerWidthPx={width}
                />
              ))}
            </View>
          </>
        )}
      </View>

      {canPlay && (
        <>
          <View style={[s.progressTrack, { backgroundColor: c.bg.sunken }]}>
            <View
              style={[
                s.progressFill,
                { backgroundColor: c.accent.default, width: `${totalMs > 0 ? Math.min(100, (t / totalMs) * 100) : 0}%` },
              ]}
            />
          </View>

          <View style={s.controls}>
            <Pressable
              onPress={() => stepTo(currentStep - 1)}
              disabled={currentStep === 0}
              style={s.ctrlBtn}
              accessibilityLabel="Étape précédente"
            >
              <Ionicons name="play-skip-back" size={18} color={currentStep === 0 ? c.text.tertiary : c.text.primary} />
            </Pressable>
            <Pressable onPress={togglePlay} style={[s.playBtn, { backgroundColor: c.accent.default }]} accessibilityLabel={playing ? 'Pause' : 'Lecture'}>
              <Ionicons name={playing ? 'pause' : 'play'} size={20} color={c.text.onFill} />
            </Pressable>
            <Pressable
              onPress={() => stepTo(currentStep + 1)}
              disabled={currentStep >= boundaries.length - 1}
              style={s.ctrlBtn}
              accessibilityLabel="Étape suivante"
            >
              <Ionicons name="play-skip-forward" size={18} color={currentStep >= boundaries.length - 1 ? c.text.tertiary : c.text.primary} />
            </Pressable>

            <Pressable onPress={() => setSpeedIndex((i) => (i + 1) % SPEEDS.length)} style={[s.speedBtn, { borderColor: c.border.strong }]}>
              <Text variant="caption" weight="600">
                {SPEEDS[speedIndex]}×
              </Text>
            </Pressable>
          </View>

          <Text variant="caption" tone="tertiary" style={s.stepLabel} numberOfLines={1}>
            Étape {currentStep + 1}/{keyframes.length}
            {keyframes[currentStep]?.label ? ` · ${keyframes[currentStep].label}` : ''}
          </Text>
        </>
      )}

      {/* Sans ça, une variante à une seule étape (rien à animer, cf coach qui
          pose "Variante 1" comme simple dispositif de départ et met le
          mouvement dans une autre variante) n'affiche RIEN sous le terrain —
          ni contrôles ni explication — et se lit comme un bug plutôt que
          comme l'absence d'animation. Même message que côté web (editor.js,
          "1 seule étape — ajoute une étape pour animer"). */}
      {!canPlay && (
        <Text variant="caption" tone="tertiary" style={s.stepLabel}>
          {variants.length > 1
            ? 'Étape unique sur cette variante — rien à animer. Essaie une autre variante ci-dessus.'
            : 'Étape unique — rien à animer.'}
        </Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  variantRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, marginBottom: t.space.md },
  progressTrack: { height: 4, borderRadius: 2, marginTop: t.space.md, overflow: 'hidden' },
  progressFill: { height: '100%' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, marginTop: t.space.md },
  ctrlBtn: { padding: t.space.sm },
  playBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  speedBtn: {
    marginLeft: 'auto',
    borderWidth: 1,
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space.sm,
    paddingVertical: t.space.xs,
  },
  stepLabel: { marginTop: t.space.xs },
}));
