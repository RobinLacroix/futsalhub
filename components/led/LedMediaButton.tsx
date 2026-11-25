'use client';

import { useState } from 'react';
import { Loader2, Monitor } from 'lucide-react';
import { sharedContentService } from '@/lib/services';
import { LedMediaScreen } from './LedMediaScreen';
import { exitLedFullscreen, requestLedFullscreen } from './LedFrame';

/** Types projetables : vidéos et images (les PDF n'ont aucun intérêt sur l'écran LED). */
export const isLedProjectable = (mime: string | null | undefined): boolean =>
  !!mime && (mime.startsWith('video/') || mime.startsWith('image/'));

/**
 * Bouton "Projeter" d'un fichier partagé : récupère l'URL signée via le service puis ouvre la projection LED.
 * L'accès à Supabase reste dans `sharedContentService` (pattern composant -> service -> RPC).
 */
export function LedMediaButton({ title, filePath, mime }: { title: string; filePath: string | null | undefined; mime: string | null | undefined }) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!filePath || !isLedProjectable(mime)) return null;

  const open = async () => {
    requestLedFullscreen(); // dans le geste du clic, avant le chargement de l'URL : sinon Safari refuse
    setLoading(true); setError(null);
    try {
      setUrl(await sharedContentService.getSharedFileUrl(filePath));
    } catch {
      exitLedFullscreen();
      setError('Projection impossible');
    }
    setLoading(false);
  };

  return (
    <>
      {error && <span style={{ fontSize: 10, color: '#dc2626' }}>{error}</span>}
      <button
        type="button" onClick={open} disabled={loading} aria-label={`Projeter ${title} sur l'écran LED`}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1px solid #3B82F6', background: '#EFF6FF', fontSize: 11, fontWeight: 600, color: '#1D4ED8', cursor: loading ? 'default' : 'pointer' }}
      >
        {loading ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Monitor size={11} />}Projeter
      </button>
      {url && <LedMediaScreen url={url} mime={mime} title={title} onClose={() => setUrl(null)} />}
    </>
  );
}
