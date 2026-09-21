'use client';

// Assembleur de séances — pont vers l'outil vanilla-JS servi en statique sous
// /tools/tactics/ (cf livrables/futsalhub/SPEC_ASSEMBLEUR_SEANCE_PHASE2_2026-09.md
// et PLAN_ASSEMBLEUR_SEANCE_PHASE2_2026-09.md, Phase 2). Exact miroir de
// app/webapp/library/schematics/page.tsx (Phase 0) : mêmes deux courses à
// respecter (src de l'iframe posé après l'enregistrement du listener message,
// trySendContext réactif à READY et au changement d'équipe active).
//
// Ce composant est le SEUL point de contact avec Supabase pour cet éditeur :
// l'iframe ne voit jamais de session ni de clé. Protocole postMessage :
//   -> INIT           { clubId, sessionId, session|null, procedures }
//   -> CONTEXT_UPDATE { clubId, procedures }
//   -> SAVED          { sessionId }
//   -> SAVE_ERROR     { message }
//   <- READY {}
//   <- SAVE  { session: unknown }
//   <- CLOSE {}
//
// club actif dérivé de l'équipe active (teams.club_id, cf. Team dans
// ActiveTeamContext.tsx) plutôt qu'un ActiveClubContext dédié — une séance
// est partagée au niveau club, mais rien n'exige aujourd'hui de "changer de
// club" indépendamment de l'équipe active.

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { sessionsService } from '@/lib/services/sessionsService';
import { trainingProceduresService } from '@/lib/services/trainingProceduresService';

const TACTICS_TOOL_SRC = '/tools/tactics/seance.html';

function SessionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');
  const { activeTeam } = useActiveTeam();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const iframeReadyRef = useRef(false);
  const initSentRef = useRef(false);

  const sendToIframe = useCallback((message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  const buildContext = useCallback(async (clubId: string) => {
    const procedures = await trainingProceduresService.getProceduresByClub(clubId);
    return { clubId, procedures };
  }, []);

  const trySendContext = useCallback(async () => {
    if (!iframeReadyRef.current || !activeTeam) return;
    const clubId = activeTeam.club_id;
    if (!clubId) return;
    try {
      const context = await buildContext(clubId);
      if (!initSentRef.current) {
        let session: unknown = null;
        if (sessionId) {
          const record = await sessionsService.getSessionById(sessionId);
          session = record ? { name: record.name, meta: record.meta, blocks: record.blocks } : null;
        }
        sendToIframe({ type: 'INIT', ...context, sessionId, session });
        initSentRef.current = true;
        setStatus('ready');
      } else {
        sendToIframe({ type: 'CONTEXT_UPDATE', ...context });
      }
    } catch (err) {
      console.error('sessions: échec de préparation du contexte', err);
      if (!initSentRef.current) {
        setStatus('error');
        setErrorMessage("Impossible de charger la séance ou la bibliothèque de procédés.");
      }
    }
  }, [activeTeam, sessionId, buildContext, sendToIframe]);

  useEffect(() => {
    function handleMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const msg = ev.data as { type?: string; session?: { name?: string } };
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'READY') {
        iframeReadyRef.current = true;
        trySendContext();
      } else if (msg.type === 'SAVE') {
        if (!activeTeam?.club_id) return;
        const payload = msg.session as { name?: string; meta?: unknown; blocks?: unknown } | undefined;
        sessionsService.saveSession({
          id: sessionId || undefined,
          clubId: activeTeam.club_id,
          name: payload?.name || 'Sans titre',
          meta: (payload?.meta as never) || {},
          blocks: (payload?.blocks as never) || [],
        }).then((record) => {
          sendToIframe({ type: 'SAVED', sessionId: record.id });
          if (!sessionId) router.replace(`/webapp/library/sessions?session=${record.id}`);
        }).catch((err) => {
          console.error('sessions: échec de sauvegarde', err);
          sendToIframe({ type: 'SAVE_ERROR', message: err instanceof Error ? err.message : 'Erreur inconnue' });
        });
      } else if (msg.type === 'CLOSE') {
        router.push('/webapp/library');
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeTeam, sessionId, trySendContext, sendToIframe, router]);

  useEffect(() => {
    trySendContext();
  }, [trySendContext]);

  // Déclaré après les effets ci-dessus : l'écouteur "message" est déjà en
  // place quand ce montage-ci pose src et lance le chargement de l'iframe
  // (cf en-tête de fichier / schematics/page.tsx).
  useEffect(() => {
    if (iframeRef.current) iframeRef.current.src = TACTICS_TOOL_SRC;
  }, []);

  return (
    <div style={{ position: 'relative', margin: '-16px -20px', height: 'calc(100dvh - 2.75rem)', background: '#f4f5f3' }}>
      {status === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1c1e1a', flexDirection: 'column', gap: 12 }}>
          <p>{errorMessage}</p>
          <button onClick={() => router.push('/webapp/library')} style={{ padding: '8px 16px' }}>Retour à la bibliothèque</button>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Assembleur de séances"
        style={{ width: '100%', height: '100%', border: 'none', visibility: status === 'error' ? 'hidden' : 'visible' }}
      />
    </div>
  );
}

export default function SessionsPage() {
  return (
    <Suspense fallback={null}>
      <SessionsPageContent />
    </Suspense>
  );
}
