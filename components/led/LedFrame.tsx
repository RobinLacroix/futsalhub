'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Monitor, MonitorOff, X } from 'lucide-react';

/**
 * Mode "Écran LED" : projection sur l'écran LED du gymnase (500x280 pixels, sans mise à l'échelle,
 * qui n'affiche que le coin haut gauche de l'image reçue sur son entrée vidéo).
 *
 * Principe : la scène (vidéo, schéma...) occupe un rectangle W x H collé au pixel (0,0) de la page,
 * en plein écran. Tout le reste de la page est l'interface de contrôle, sur l'écran de l'appareil.
 * Le contour bleu est tracé hors du rectangle : il n'apparaît pas sur la LED.
 *
 * W et H sont mesurés une fois par appareil avec /tools/mire-ecran-led.html (derniers repères visibles
 * sur la LED), puis mémorisés localement. Spec : livrables/futsalhub/SPEC_ECRAN_GYMNASE_2026-11.md.
 */

const LED_KEY = 'fh.led';
const DEFAULT_ZONE = { w: 500, h: 280 };
const MIN = 100;
const MAX = 1920;

type Zone = { w: number; h: number };

const validDim = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= MIN && n <= MAX;

function readZone(): Zone {
  if (typeof window === 'undefined') return DEFAULT_ZONE;
  try {
    const p = JSON.parse(window.localStorage.getItem(LED_KEY) ?? 'null') as Partial<Zone> | null;
    if (p && validDim(p.w) && validDim(p.h)) return { w: p.w, h: p.h };
  } catch { /* stockage indisponible ou corrompu : valeurs par défaut */ }
  return DEFAULT_ZONE;
}

/** Taille de la zone visible sur la LED, mémorisée par appareil. */
export function useLedZone(): [Zone, (patch: Partial<Zone>) => void] {
  const [zone, setZone] = useState<Zone>(readZone);
  const update = useCallback((patch: Partial<Zone>) => {
    setZone((prev) => {
      const next = {
        w: validDim(patch.w) ? Math.round(patch.w) : prev.w,
        h: validDim(patch.h) ? Math.round(patch.h) : prev.h,
      };
      try { window.localStorage.setItem(LED_KEY, JSON.stringify(next)); } catch { /* on garde la session */ }
      return next;
    });
  }, []);
  return [zone, update];
}

type FsNode = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

function enterFullscreen(node: HTMLElement | null) {
  if (!node || document.fullscreenElement) return;
  const n = node as FsNode;
  try {
    const p = n.requestFullscreen ? n.requestFullscreen() : n.webkitRequestFullscreen?.();
    if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => { /* refusé : bouton Plein écran */ });
  } catch { /* idem */ }
}

function exitFullscreen() {
  if (!document.fullscreenElement) return;
  try {
    const p = document.exitFullscreen();
    if (p && typeof p.catch === 'function') p.catch(() => { /* déjà sorti */ });
  } catch { /* idem */ }
}

/**
 * À appeler SYNCHRONIQUEMENT dans le clic qui ouvre la projection, avant tout `await` : Safari n'accorde
 * le plein écran qu'à l'intérieur du geste de l'utilisateur. Demandé plus tard (useEffect après le
 * chargement d'une URL signée), il est refusé et la barre du navigateur part sur la LED.
 * On passe en plein écran la page entière : le cadre est un `position: fixed` qui la recouvre.
 */
export function requestLedFullscreen() { enterFullscreen(document.documentElement); }
/** Sort du plein écran (échec d'ouverture avant l'affichage du cadre). */
export function exitLedFullscreen() { exitFullscreen(); }

const C = { bg: '#05080c', panel: '#0b0f14', line: '#1f2937', text: '#e5e7eb', muted: '#94a3b8', accent: '#3B82F6' };

export const ledBtn = (on = false): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  minHeight: 44, minWidth: 44, padding: '0 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  border: `1px solid ${on ? C.accent : C.line}`, background: on ? C.accent : '#111827', color: on ? '#fff' : C.text,
});

export function LedFrame({ title, onClose, stage, timeline, controls }: {
  title: string;
  onClose: () => void;
  /** Contenu projeté : doit remplir son parent (100 % x 100 %). */
  stage: ReactNode;
  /** Sous la zone (ex. barre de position), sur la largeur de la zone. */
  timeline?: ReactNode;
  /** Colonne de commandes, à droite. */
  controls?: ReactNode;
}) {
  const [zone, setZone] = useLedZone();
  const [blank, setBlank] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Filet de sécurité : le plein écran est normalement déjà demandé par le clic d'ouverture (requestLedFullscreen).
  // Sans lui, la barre du navigateur est envoyée sur la LED. No-op si on est déjà en plein écran.
  useEffect(() => { enterFullscreen(rootRef.current); }, []);

  const close = useCallback(() => { exitFullscreen(); onClose(); }, [onClose]);

  useEffect(() => {
    // Phase de capture + stopPropagation : Échap ferme la projection seule, pas le dialogue parent qui l'a ouverte.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey, true); document.body.style.overflow = prev; };
  }, [close]);

  const field = (label: string, key: keyof Zone) => (
    <label style={{ display: 'grid', gap: 2, fontSize: 11, color: C.muted }}>
      {label}
      <input
        type="number" min={MIN} max={MAX} step={10} defaultValue={zone[key]} aria-label={label}
        onChange={(e) => setZone({ [key]: e.currentTarget.valueAsNumber })}
        style={{ height: 40, padding: '0 8px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#111827', color: C.text, fontSize: 14, minWidth: 0 }}
      />
    </label>
  );

  return createPortal(
    <div
      ref={rootRef} role="dialog" aria-modal="true" aria-label="Projection écran LED"
      // Les événements React remontent à travers les portails : on isole les clics du dialogue parent (fond cliquable = fermeture).
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000, background: C.bg, color: C.text, overflow: 'hidden',
        display: 'grid', gridTemplateColumns: `${zone.w}px minmax(0, 1fr)`, gridTemplateRows: `${zone.h}px auto minmax(0, 1fr)`,
      }}
    >
      {/* Zone LED : rectangle au pixel (0,0). Le contour est hors du rectangle, donc invisible sur la LED. */}
      <div style={{ gridColumn: 1, gridRow: 1, position: 'relative' }}>
        <div
          data-led-zone
          style={{ position: 'absolute', left: 0, top: 0, width: zone.w, height: zone.h, background: '#000', outline: `2px solid ${C.accent}`, overflow: 'hidden' }}
        >
          <div style={{ width: '100%', height: '100%', visibility: blank ? 'hidden' : 'visible' }}>{stage}</div>
        </div>
      </div>

      <div style={{ gridColumn: 1, gridRow: 2, padding: '12px 12px 6px', minWidth: 0 }}>{timeline}</div>

      <div style={{ gridColumn: 1, gridRow: 3, padding: '8px 12px', display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
        <button type="button" onClick={close} aria-label="Fermer la projection" style={ledBtn()}><X size={18} /></button>
        <strong style={{ fontSize: 13, lineHeight: '44px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</strong>
      </div>

      <aside style={{ gridColumn: 2, gridRow: '1 / 4', overflowY: 'auto', padding: 12, borderLeft: `1px solid ${C.line}`, background: C.panel, display: 'grid', gap: 12, alignContent: 'start', minWidth: 0 }}>
        {controls}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
          {field('Largeur', 'w')}
          {field('Hauteur', 'h')}
          <button type="button" onClick={() => setBlank((b) => !b)} aria-pressed={blank} style={ledBtn(blank)}>
            {blank ? <MonitorOff size={16} /> : <Monitor size={16} />}Écran noir
          </button>
          <button type="button" onClick={() => enterFullscreen(rootRef.current)} style={ledBtn()}><Maximize2 size={16} />Plein écran</button>
          <a href="/tools/mire-ecran-led.html" target="_blank" rel="noopener noreferrer" style={{ ...ledBtn(), textDecoration: 'none', gridColumn: '1 / -1' }}>Mire de calibrage</a>
          <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 11, color: C.muted }}>Largeur et hauteur : derniers repères visibles sur la LED (page Mire).</p>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
