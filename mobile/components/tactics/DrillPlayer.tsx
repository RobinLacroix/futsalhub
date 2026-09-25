import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import Svg from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { Text } from '../ui';
import type { Drill } from '../../lib/tactics/types';
import { geo } from '../../lib/tactics/geometry';
import { buildOverlays, buildEntityTimeline, frameAt, resolveVariant, stepBoundariesMs } from '../../lib/tactics/timeline';
import { PitchBackground } from './PitchBackground';
import { EntityToken } from './EntityToken';
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

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  // Changer de variante repart de zéro plutôt que de garder un `t` qui ne
  // correspond plus à rien sur la nouvelle timeline (durées différentes).
  useEffect(() => {
    setT(0);
    setPlaying(false);
  }, [variantIndex]);

  useEffect(() => {
    if (!playing) { lastTsRef.current = null; return undefined; }
    function tick(ts: number) {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      setT((prev) => Math.min(totalMs, prev + dt * SPEEDS[speedIndex]));
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speedIndex, totalMs]);

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
      setPlaying(false);
      setT(boundaries[clamped]);
    },
    [boundaries],
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
          <Svg width={width} height={width * (g.H / g.W)} viewBox={`0 0 ${g.W} ${g.H}`}>
            <PitchBackground pitch={drill.pitch} g={g} />
            {/* Clé composée id+index : cf SchematicThumbnail, des doublons
                d'id existent sur certains schémas historiques. */}
            {frame.zones.map((z, i) => (
              <ZoneShape key={`${z.id}-${i}`} zone={z} g={g} />
            ))}
            {/* Ordre calqué sur Z_BASE côté web (zone < arrow < line < text < entity) :
                la flèche d'un déplacement en cours doit rester sous le jeton qu'elle
                explique, pas par-dessus. */}
            {frame.arrows.map((a, i) => (
              <MovementArrow key={`arrow-${i}`} arrow={a} index={i} g={g} />
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
            {frame.entities.map((entity, i) => (
              <EntityToken key={`${entity.id}-${i}`} entity={entity} drill={drill} g={g} />
            ))}
          </Svg>
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
