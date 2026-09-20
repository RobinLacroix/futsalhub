'use client';

// Éditeur de schémas tactiques — remplace l'ancienne implémentation React
// (conservée pour référence dans page.legacy.tsx.bak, non routée) par un
// pont vers l'outil vanilla-JS servi en statique sous /tools/tactics/
// (cf livrables/futsalhub/SPEC_INTEGRATION_EDITEUR_TACTIQUE_2026-09.md
// et PLAN_INTEGRATION_EDITEUR_TACTIQUE_PHASE0_2026-09.md, Phase 0).
//
// Ce composant est le SEUL point de contact avec Supabase pour cet éditeur :
// l'iframe ne voit jamais de session ni de clé. Protocole postMessage
// (même origine, /tools/tactics/ est servi par cette même app Next.js) :
//   -> INIT  { teamId, drillId, drill|null, roster, teamColors }
//   -> SAVED { drillId }
//   -> SAVE_ERROR { message }
//   <- READY {}
//   <- SAVE  { drillId: string|null, drill: unknown }
//   <- CLOSE {}

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { schematicsService } from '@/lib/services/schematicsService';
import { playersService } from '@/lib/services/playersService';

const TACTICS_TOOL_SRC = '/tools/tactics/index.html';

interface RosterEntry {
  id: string;
  label: string;
  role: string;
}

function SchematicsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const schematicId = searchParams.get('schematic');
  const { activeTeam } = useActiveTeam();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sendToIframe = useCallback((message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  const buildInitPayload = useCallback(async () => {
    if (!activeTeam) return null;

    // Effectif réel de l'équipe active -> format roster attendu par l'outil
    // (label = numéro affiché sur le jeton, role = poste, texte libre —
    // cf editor.js: addRosterPlayer/renderRoster).
    const players = await playersService.getPlayersByTeam(activeTeam.id);
    const roster: RosterEntry[] = players.map((p) => ({
      id: p.id,
      label: p.number != null ? String(p.number) : `${p.first_name} ${p.last_name}`.trim(),
      role: p.position || '',
    }));

    // teams n'a qu'une seule couleur en base (pas de detail home/away/support
    // ni de forme) — on ne renseigne que ce qu'on a de vrai, l'outil applique
    // ses propres valeurs par défaut pour le reste (cf teamDefault() dans
    // editor.js). Gap connu, documenté dans la spec §3.5/§4.
    const teamColors = activeTeam.color ? { home: { fill: activeTeam.color } } : null;

    let drill: unknown = null;
    if (schematicId) {
      const record = await schematicsService.getSchematicById(schematicId);
      // record.data est type SchematicData (ancien format circuits/sequences)
      // dans ce service, mais porte en réalité le format drill dès qu'un
      // schéma a été enregistré par le nouvel éditeur — le service ne
      // valide pas la forme du jsonb, il la fait juste transiter.
      drill = record?.data ?? null;
    }

    return { teamId: activeTeam.id, drillId: schematicId, drill, roster, teamColors };
  }, [activeTeam, schematicId]);

  useEffect(() => {
    function handleMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const msg = ev.data as { type?: string; drill?: unknown; drillId?: string | null };
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'READY') {
        buildInitPayload().then((payload) => {
          if (payload) { sendToIframe({ type: 'INIT', ...payload }); setStatus('ready'); }
          else { setStatus('error'); setErrorMessage("Aucune équipe active — impossible d'ouvrir l'éditeur."); }
        }).catch((err) => {
          console.error('schematics: échec de préparation INIT', err);
          setStatus('error');
          setErrorMessage("Impossible de charger le schéma ou l'effectif.");
        });
      } else if (msg.type === 'SAVE') {
        if (!activeTeam) return;
        const name = (msg.drill as { meta?: { title?: string } } | undefined)?.meta?.title || 'Sans titre';
        schematicsService.saveSchematic({
          id: msg.drillId || undefined,
          teamId: activeTeam.id,
          name,
          // saveSchematic attend SchematicData (ancien format) — le nouveau
          // format (drill) transite tel quel dans la colonne jsonb, le
          // service ne le valide pas. Cast assume et documenté ici plutôt
          // que d'élargir le type partagé (cf plan Phase 0, étape 5 —
          // ne pas toucher schematicsService pour rester surgical).
          data: msg.drill as never,
        }).then((record) => {
          sendToIframe({ type: 'SAVED', drillId: record.id });
          // Un premier enregistrement (id absent de l'URL) fixe l'URL sur le
          // nouvel id, pour qu'un rechargement de page rouvre ce schéma.
          if (!schematicId) router.replace(`/webapp/library/schematics?schematic=${record.id}`);
        }).catch((err) => {
          console.error('schematics: échec de sauvegarde', err);
          sendToIframe({ type: 'SAVE_ERROR', message: err instanceof Error ? err.message : 'Erreur inconnue' });
        });
      } else if (msg.type === 'CLOSE') {
        router.push('/webapp/library');
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeTeam, schematicId, buildInitPayload, sendToIframe, router]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#101214' }}>
      {status === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e9ebe6', flexDirection: 'column', gap: 12 }}>
          <p>{errorMessage}</p>
          <button onClick={() => router.push('/webapp/library')} style={{ padding: '8px 16px' }}>Retour à la bibliothèque</button>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={TACTICS_TOOL_SRC}
        title="Éditeur de schémas tactiques"
        style={{ width: '100%', height: '100%', border: 'none', visibility: status === 'error' ? 'hidden' : 'visible' }}
      />
    </div>
  );
}

export default function SchematicsPage() {
  return (
    <Suspense fallback={null}>
      <SchematicsPageContent />
    </Suspense>
  );
}
