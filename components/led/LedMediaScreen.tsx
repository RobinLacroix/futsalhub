'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Pause, Pencil, Play, Repeat, SkipBack, SkipForward, Undo2 } from 'lucide-react';
import { LedFrame, ledBtn } from './LedFrame';

/** Projection d'un fichier partagé (vidéo ou image) sur l'écran LED. Voir LedFrame pour le principe de la zone. */

const SPEEDS = [1, 0.5, 0.25, 0.1];
const COLORS = ['#ef4444', '#facc15', '#ffffff', '#38bdf8'];
const FRAME = 1 / 30; // pas image par image (la cadence réelle du fichier n'est pas lisible depuis le navigateur)
const LINE_WIDTH = 9; // trait épais : une diode de la LED fait plusieurs centimètres

type Stroke = { color: string; pts: [number, number][] };

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

export function LedMediaScreen({ url, mime, title, onClose }: { url: string; mime: string | null | undefined; title: string; onClose: () => void }) {
  if (mime?.startsWith('image/')) {
    return (
      <LedFrame
        title={title}
        onClose={onClose}
        // eslint-disable-next-line @next/next/no-img-element
        stage={<img src={url} alt={title} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />}
      />
    );
  }
  return <LedVideoScreen url={url} title={title} onClose={onClose} />;
}

function LedVideoScreen({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [drawMode, setDrawMode] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [error, setError] = useState(false);
  const current = useRef<Stroke | null>(null);

  // Position de lecture lue en continu pendant que la vidéo tourne.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) { setTime((t) => (Math.abs(t - v.currentTime) > 0.03 ? v.currentTime : t)); setPlaying(!v.paused); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = LINE_WIDTH;
    for (const s of strokes) {
      g.strokeStyle = s.color; g.fillStyle = s.color; g.beginPath();
      s.pts.forEach(([x, y], i) => (i ? g.lineTo(x * r.width, y * r.height) : g.moveTo(x * r.width, y * r.height)));
      g.stroke();
      if (s.pts.length === 1) { g.beginPath(); g.arc(s.pts[0][0] * r.width, s.pts[0][1] * r.height, LINE_WIDTH / 1.6, 0, 7); g.fill(); }
    }
  }, [strokes]);

  useEffect(() => {
    redraw();
    const c = canvasRef.current;
    if (!c) return undefined;
    const ro = new ResizeObserver(redraw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [redraw]);

  const norm = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawMode) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const s: Stroke = { color, pts: [norm(e)] };
    current.current = s;
    setStrokes((p) => [...p, s]);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = current.current;
    if (!s) return;
    s.pts.push(norm(e));
    setStrokes((p) => [...p]); // même objet trait, nouvelle liste : déclenche le redessin
  };
  const onUp = () => { current.current = null; };

  const seek = (t: number) => { const v = videoRef.current; if (v) v.currentTime = Math.min(Math.max(t, 0), v.duration || t); };
  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { setStrokes([]); setDrawMode(false); v.play().catch(() => {}); } else v.pause();
  };
  const step = (dir: 1 | -1) => { const v = videoRef.current; if (!v) return; v.pause(); seek(v.currentTime + dir * FRAME); };
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };
  const toggleDraw = () => {
    const on = !drawMode;
    setDrawMode(on);
    if (on) videoRef.current?.pause();
  };

  const stage = (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <video
        ref={videoRef} src={url} autoPlay muted playsInline loop={loop} preload="auto"
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onError={() => setError(true)}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }}
      />
      <canvas
        ref={canvasRef}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', pointerEvents: drawMode ? 'auto' : 'none', cursor: drawMode ? 'crosshair' : 'default' }}
      />
    </div>
  );

  const timeline = (
    <div style={{ display: 'grid', gap: 4 }}>
      <input
        type="range" min={0} max={dur || 1} step={0.01} value={Math.min(time, dur || 1)} aria-label="Position dans la vidéo"
        onChange={(e) => { videoRef.current?.pause(); seek(e.currentTarget.valueAsNumber); }}
        style={{ width: '100%', height: 32 }}
      />
      <span style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>{fmt(time)} / {fmt(dur)}</span>
    </div>
  );

  const controls = (
    <div style={{ display: 'grid', gap: 10 }}>
      {error && <p style={{ margin: 0, fontSize: 12, color: '#fca5a5' }}>Vidéo illisible dans ce navigateur (format .mov ou H.265 ?). Essaie un MP4 H.264.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button type="button" onClick={() => step(-1)} aria-label="Image précédente" style={ledBtn()}><SkipBack size={18} /></button>
        <button type="button" onClick={() => step(1)} aria-label="Image suivante" style={ledBtn()}><SkipForward size={18} /></button>
        <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Lecture'} style={{ ...ledBtn(true), gridColumn: '1 / -1' }}>
          {playing ? <Pause size={18} /> : <Play size={18} />}{playing ? 'Pause' : 'Lecture'}
        </button>
        <button type="button" onClick={cycleSpeed} style={ledBtn()}>{speed}×</button>
        <button type="button" onClick={() => setLoop((l) => !l)} aria-pressed={loop} aria-label="Boucle" style={ledBtn(loop)}><Repeat size={16} /></button>
        <button type="button" onClick={toggleDraw} aria-pressed={drawMode} style={{ ...ledBtn(drawMode), gridColumn: '1 / -1' }}><Pencil size={16} />Dessiner</button>
      </div>
      {drawMode && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {COLORS.map((c) => (
              <button
                key={c} type="button" onClick={() => setColor(c)} aria-label={`Couleur ${c}`} aria-pressed={color === c}
                style={{ width: 44, height: 44, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '3px solid #3B82F6' : '2px solid #1f2937' }}
              />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button type="button" onClick={() => setStrokes((p) => p.slice(0, -1))} style={ledBtn()}><Undo2 size={16} />Annuler</button>
            <button type="button" onClick={() => setStrokes([])} style={ledBtn()}><Eraser size={16} />Effacer</button>
          </div>
        </div>
      )}
    </div>
  );

  return <LedFrame title={title} onClose={onClose} stage={stage} timeline={timeline} controls={controls} />;
}
