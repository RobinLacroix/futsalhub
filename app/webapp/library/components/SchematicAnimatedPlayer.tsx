'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Monitor, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { LedFrame, ledBtn } from '@/components/led/LedFrame';

declare global {
  interface Window {
    DrillRender?: {
      renderStatic: (svg: SVGSVGElement, drill: unknown, kfIndex: number) => { W: number; H: number };
      renderAnimated: (svg: SVGSVGElement, drill: unknown, p: number) => { W: number; H: number };
    };
  }
}

type DrillVariant = { id: string; name: string; keyframes: DrillKeyframe[]; timeline?: unknown; exportEndMs?: number; zones?: unknown };
type DrillKeyframe = { label?: string; durationMs?: number; [key: string]: unknown };
type DrillLike = { keyframes?: DrillKeyframe[]; variants?: DrillVariant[]; activeVariantIndex?: number; [key: string]: unknown };

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const DEFAULT_SPEED_INDEX = 2; // 1×

// Petite reprise locale du thème "FM light" (même valeurs que app/webapp/library/page.tsx
// et app/webapp/manager/performance/theme.ts) — chaque module garde sa propre copie dans
// ce codebase plutôt qu'un thème partagé unique, cf CLAUDE.md (types/styles non unifiés).
const T = {
  pageBg: '#EEF0F5',
  border: '#DDE1EA',
  text: '#1A2332',
  textMuted: '#697585',
  accent: '#3B82F6',
};

/**
 * Étapes actives d'un Drill : celles de la variante sélectionnée si le schéma
 * en a plusieurs (cf drill.variants côté éditeur, public/tools/tactics/
 * editor.js:ensureVariants), sinon drill.keyframes directement (schémas sans
 * variante ou anciens exports).
 */
function activeKeyframesOf(drill: DrillLike, variantIndex: number): DrillKeyframe[] {
  const variants = drill.variants;
  if (variants && variants.length > 0) {
    return (variants[variantIndex] ?? variants[0]).keyframes;
  }
  return drill.keyframes ?? [];
}

/**
 * Aperçu animé d'un schéma — même moteur que l'éditeur (render-core.js,
 * fonctions renderAnimated/renderStatic), même minuterie que son bouton
 * "Lecture" (cf play()/pAt() dans editor.js), pour un rendu et un rythme
 * identiques à ce que Robin voit en éditant. Contrôles calqués sur DrillPlayer
 * côté mobile (mobile/components/tactics/DrillPlayer.tsx) : chips de variante,
 * étape précédente/suivante, lecture/pause, vitesse — pour la même raison
 * (lecture seule, pas d'édition ici).
 *
 * Extrait de app/webapp/library/page.tsx (2026-09-27) pour être réutilisé
 * depuis l'assembleur de séances (voir le détail d'un procédé sans repasser
 * par la bibliothèque) — le composant appelant doit charger render-core.js
 * lui-même (`<Script src="/tools/tactics/render-core.js" onReady={...} />`)
 * et passer `ready` en conséquence, exactement comme app/webapp/library/page.tsx.
 */
export function SchematicAnimatedPlayer({ drill, ready, led }: {
  drill: unknown;
  ready: boolean;
  /**
   * Mode projection écran LED (cf components/led/LedFrame.tsx) : le schéma remplit la zone LED, les
   * commandes passent autour. Instancié par le bouton "Projeter" du lecteur normal, pas par les pages.
   */
  led?: { onClose: () => void; title?: string };
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [ledOpen, setLedOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const d = drill as DrillLike | null;
  const variants = d?.variants ?? [];
  const [variantIndex, setVariantIndex] = useState(d?.activeVariantIndex ?? 0);
  const keyframes = useMemo(() => (d ? activeKeyframesOf(d, variantIndex) : []), [d, variantIndex]);
  const N = keyframes.length;
  const canPlay = N > 1;

  const [step, setStep] = useState(0); // étape courante quand la lecture est arrêtée
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX);
  const rafRef = useRef<number | null>(null);

  // Changer de variante repart de zéro : durées et nombre d'étapes diffèrent.
  useEffect(() => { setStep(0); setPlaying(false); }, [variantIndex]);

  const renderAt = useCallback((p: number) => {
    if (!ready || !svgRef.current || !d || !window.DrillRender) return;
    try {
      const copy = JSON.parse(JSON.stringify(d)) as DrillLike;
      copy.keyframes = JSON.parse(JSON.stringify(keyframes));
      // Timeline canonique de la variante (mode avancé : clips désynchronisés
      // des étapes). Sans elle, le moteur la reconstruit depuis les étapes et
      // aplatit tout comme en mode simple.
      const tl = variants.length > 0 ? (variants[variantIndex] ?? variants[0]).timeline : undefined;
      if (tl) copy.timeline = JSON.parse(JSON.stringify(tl));
      else delete copy.timeline;
      // Zones propres à chaque variante (absentes des anciens schémas : zones racine).
      const vz = variants.length > 0 ? (variants[variantIndex] ?? variants[0]).zones : undefined;
      if (vz) copy.zones = JSON.parse(JSON.stringify(vz));
      const svg = svgRef.current;
      svg.innerHTML = '';
      const g = window.DrillRender.renderAnimated(svg, copy, p);
      svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [ready, d, keyframes, variants, variantIndex]);

  useEffect(() => { renderAt(step); }, [renderAt, step]);

  useEffect(() => {
    if (!playing || N < 2) return undefined;
    const speed = SPEEDS[speedIndex];
    let total = 0;
    for (let i = 0; i < N - 1; i++) total += (keyframes[i].durationMs || 1500) / speed;
    // Fin de vidéo posée dans l'éditeur (marqueur de la timeline avancée).
    const endMs = variants.length > 0 ? (variants[variantIndex] ?? variants[0]).exportEndMs : undefined;
    if (endMs && endMs > 0) total = Math.min(total, endMs / speed);
    let t0: number | null = null;
    function pAt(elapsed: number) {
      let acc = 0;
      for (let j = 0; j < N - 1; j++) {
        const dur = (keyframes[j].durationMs || 1500) / speed;
        if (elapsed < acc + dur) return j + (elapsed - acc) / dur;
        acc += dur;
      }
      return N - 1;
    }
    function frame(ts: number) {
      if (t0 == null) t0 = ts;
      const elapsed = ts - t0!;
      const p = pAt(elapsed);
      renderAt(p);
      if (elapsed < total) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        setPlaying(false);
        setStep(N - 1);
      }
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [playing, speedIndex, keyframes, N, renderAt, variants, variantIndex]);

  const togglePlay = useCallback(() => {
    if (!canPlay) return;
    if (step >= N - 1) setStep(0);
    setPlaying((p) => !p);
  }, [canPlay, step, N]);

  const stepTo = useCallback((idx: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(N - 1, idx)));
  }, [N]);

  if (!d) {
    return (
      <div className="w-full h-full flex items-center justify-center text-center px-3" style={{ color: T.textMuted }}>
        <span className="text-xs">Pas de schéma</span>
      </div>
    );
  }
  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ color: T.textMuted }}>
        <span className="text-xs">Aperçu indisponible</span>
      </div>
    );
  }

  if (led) {
    const stepLabel = canPlay ? `Étape ${step + 1}/${N}` : 'Schéma fixe';
    return (
      <LedFrame
        title={led.title ?? 'Schéma tactique'}
        onClose={led.onClose}
        stage={<svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="xMidYMid meet" />}
        controls={(
          <div style={{ display: 'grid', gap: 10 }}>
            {variants.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {variants.map((v, i) => (
                  <button key={v.id || i} type="button" onClick={() => setVariantIndex(i)} aria-pressed={i === variantIndex} style={ledBtn(i === variantIndex)}>
                    {v.name || `Variante ${i + 1}`}
                  </button>
                ))}
              </div>
            )}
            {canPlay && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button type="button" onClick={() => stepTo(step - 1)} disabled={step === 0} aria-label="Étape précédente" style={ledBtn()}><SkipBack size={18} /></button>
                <button type="button" onClick={() => stepTo(step + 1)} disabled={step >= N - 1} aria-label="Étape suivante" style={ledBtn()}><SkipForward size={18} /></button>
                <button type="button" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Lecture'} style={{ ...ledBtn(true), gridColumn: '1 / -1' }}>
                  {playing ? <Pause size={18} /> : <Play size={18} />}{playing ? 'Pause' : 'Lecture'}
                </button>
                <button type="button" onClick={() => setSpeedIndex((i) => (i + 1) % SPEEDS.length)} style={ledBtn()}>{SPEEDS[speedIndex]}×</button>
                <span style={{ alignSelf: 'center', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>{stepLabel}</span>
              </div>
            )}
          </div>
        )}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {variants.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {variants.map((v, i) => (
            <button
              key={v.id || i}
              type="button"
              onClick={() => setVariantIndex(i)}
              style={
                i === variantIndex
                  ? { backgroundColor: T.accent, color: '#fff', border: `1px solid ${T.accent}` }
                  : { backgroundColor: T.pageBg, color: T.textMuted, border: `1px solid ${T.border}` }
              }
              className="px-2.5 py-1 rounded-full text-xs font-medium"
            >
              {v.name || `Variante ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      <div style={{ backgroundColor: T.pageBg, border: `1px solid ${T.border}` }} className="rounded-lg overflow-hidden">
        <div style={{ aspectRatio: '16/9' }}>
          <svg ref={svgRef} className="w-full h-full" preserveAspectRatio="xMidYMid meet" />
        </div>
      </div>

      {canPlay && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => stepTo(step - 1)}
            disabled={step === 0}
            style={{ color: step === 0 ? T.border : T.text }}
            className="p-1.5 disabled:cursor-not-allowed"
            aria-label="Étape précédente"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            style={{ backgroundColor: T.accent, color: '#fff' }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            aria-label={playing ? 'Pause' : 'Lecture'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={() => stepTo(step + 1)}
            disabled={step >= N - 1}
            style={{ color: step >= N - 1 ? T.border : T.text }}
            className="p-1.5 disabled:cursor-not-allowed"
            aria-label="Étape suivante"
          >
            <SkipForward className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSpeedIndex((i) => (i + 1) % SPEEDS.length)}
            style={{ color: T.textMuted, border: `1px solid ${T.border}` }}
            className="ml-auto px-2 py-1 rounded-md text-xs font-semibold"
          >
            {SPEEDS[speedIndex]}×
          </button>
          <span className="text-xs" style={{ color: T.textMuted }}>
            Étape {step + 1}/{N}
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => { setPlaying(false); setLedOpen(true); }}
        style={{ color: T.accent, border: `1px solid ${T.accent}` }}
        className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold"
      >
        <Monitor className="h-3.5 w-3.5" />Projeter sur l&apos;écran LED
      </button>
      {ledOpen && <SchematicAnimatedPlayer drill={drill} ready={ready} led={{ onClose: () => setLedOpen(false) }} />}
    </div>
  );
}
