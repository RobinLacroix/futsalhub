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
//   -> INIT           { teamId, drillId, drill|null, roster, teamColors }
//   -> CONTEXT_UPDATE { teamId, roster, teamColors }
//   -> SAVED          { drillId }
//   -> SAVE_ERROR     { message }
//   <- READY {}
//   <- SAVE  { drillId: string|null, drill: unknown }
//   <- CLOSE {}
//
// Deux courses distinctes a respecter (les deux reproduites et corrigees en
// session — ne pas "simplifier" sans revalider les deux) :
//
// 1) L'iframe (fichiers statiques, quasi instantané) peut envoyer READY
//    avant que l'écouteur "message" du parent n'existe : postMessage ne met
//    rien en attente pour un écouteur pas encore enregistré, le message
//    serait perdu en silence. D'où : src jamais dans le JSX de l'iframe,
//    posé après coup une fois l'écouteur en place (cf effets, ordre de
//    déclaration = ordre d'exécution des effets dans un même commit).
//
// 2) useActiveTeam() se résout en deux temps asynchrones (fetch de teams[],
//    PUIS un appel RPC séparé get_my_default_team_id pour la vraie équipe
//    par défaut — cf ActiveTeamContext.tsx, effet sur [teams]) : READY peut
//    arriver alors qu'aucune équipe n'est encore résolue du tout. Pas une
//    erreur : trySendContext() ci-dessous attend simplement qu'une équipe
//    soit disponible, et renvoie un CONTEXT_UPDATE (jamais le drill) si
//    l'équipe change après le premier INIT — sans quoi l'éditeur resterait
//    figé sur l'effectif d'une équipe transitoire.

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
  const iframeReadyRef = useRef(false); // true dès que READY est reçu
  const initSentRef = useRef(false);    // true dès que l'INIT complet (avec drill) est parti

  const sendToIframe = useCallback((message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  // Effectif + couleurs de l'équipe active -> format attendu par l'outil.
  const buildContext = useCallback(async (team: NonNullable<typeof activeTeam>) => {
    // label = numéro affiché sur le jeton, role = poste, texte libre —
    // cf editor.js: addRosterPlayer/renderRoster.
    const players = await playersService.getPlayersByTeam(team.id);
    const roster: RosterEntry[] = players.map((p) => ({
      id: p.id,
      label: p.number != null ? String(p.number) : `${p.first_name} ${p.last_name}`.trim(),
      role: p.position || '',
    }));
    // teams n'a qu'une seule couleur en base (pas de detail home/away/support
    // ni de forme) — on ne renseigne que ce qu'on a de vrai, l'outil applique
    // ses propres valeurs par défaut pour le reste (cf teamDefault() dans
    // editor.js). Gap connu, documenté dans la spec §3.5/§4.
    const teamColors = team.color ? { home: { fill: team.color } } : null;
    return { teamId: team.id, roster, teamColors };
  }, []);

  // Point d'entrée unique appelé (a) quand READY arrive, (b) quand activeTeam
  // change — couvre les deux ordres d'arrivée possibles (cf en-tête de
  // fichier). N'envoie l'INIT complet (avec drill) qu'une fois ; les appels
  // suivants n'envoient qu'un CONTEXT_UPDATE.
  const trySendContext = useCallback(async () => {
    if (!iframeReadyRef.current || !activeTeam) return;
    try {
      const context = await buildContext(activeTeam);
      if (!initSentRef.current) {
        let drill: unknown = null;
        if (schematicId) {
          const record = await schematicsService.getSchematicById(schematicId);
          // record.data est type SchematicData (ancien format circuits/sequences)
          // dans ce service, mais porte en réalité le format drill dès qu'un
          // schéma a été enregistré par le nouvel éditeur — le service ne
          // valide pas la forme du jsonb, il la fait juste transiter.
          drill = record?.data ?? null;
        }
        sendToIframe({ type: 'INIT', ...context, drillId: schematicId, drill });
        initSentRef.current = true;
        setStatus('ready');
      } else {
        sendToIframe({ type: 'CONTEXT_UPDATE', ...context });
      }
    } catch (err) {
      console.error('schematics: échec de préparation du contexte', err);
      if (!initSentRef.current) {
        setStatus('error');
        setErrorMessage("Impossible de charger le schéma ou l'effectif.");
      }
    }
  }, [activeTeam, schematicId, buildContext, sendToIframe]);

  useEffect(() => {
    function handleMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const msg = ev.data as { type?: string; drill?: unknown; drillId?: string | null };
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'READY') {
        iframeReadyRef.current = true;
        trySendContext();
      } else if (msg.type === 'SAVE') {
        if (!activeTeam) return;
        const name = (msg.drill as { meta?: { title?: string } } | undefined)?.meta?.title || 'Sans titre';
        schematicsService.saveSchematic({
          id: msg.drillId || undefined,
          teamId: activeTeam.id,
          name,
          // saveSchematic attend SchematicData (ancien format) — le nouveau
          // format (drill) transite tel quel dans la colonne jsonb, le
          // service ne le valide pas. Cast assumé et documenté ici plutôt
          // que d'élargir le type partagé (cf plan Phase 0, étape 5 — ne pas
          // toucher schematicsService pour rester chirurgical).
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
  }, [activeTeam, schematicId, trySendContext, sendToIframe, router]);

  // Reagit aux changements d'activeTeam (résolution tardive de l'équipe par
  // défaut, ou changement explicite par le coach) — no-op tant que READY
  // n'est pas encore arrivé (iframeReadyRef.current false).
  useEffect(() => {
    trySendContext();
  }, [trySendContext]);

  // Déclaré après les effets ci-dessus : React exécute les effets dans leur
  // ordre de déclaration à chaque commit, donc l'écouteur "message" est déjà
  // en place quand ce montage-ci pose src et lance le chargement de l'iframe.
  useEffect(() => {
    if (iframeRef.current) iframeRef.current.src = TACTICS_TOOL_SRC;
  }, []);

  // WebAppShell (app/webapp/layout.tsx) place ce composant dans <main>, qui
  // reserve deja la place de la sidebar (marginLeft: sidebarWidth, variable
  // selon replie/deplie) et de l'entete fixe (paddingTop: 2.75rem), puis dans
  // un conteneur avec 16px/20px de padding. Une marge negative annule ce
  // padding (l'editeur va jusqu'aux bords de la zone de contenu) et la
  // hauteur retire uniquement le paddingTop deja applique par <main> — la
  // sidebar, elle, n'a pas besoin d'etre soustraite ici : <main> le fait deja
  // via son marginLeft/width, donc rien a dupliquer ni a desynchroniser si sa
  // largeur change (repli/depli).
  return (
    <div style={{ position: 'relative', margin: '-16px -20px', height: 'calc(100dvh - 2.75rem)', background: '#101214' }}>
      {status === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e9ebe6', flexDirection: 'column', gap: 12 }}>
          <p>{errorMessage}</p>
          <button onClick={() => router.push('/webapp/library')} style={{ padding: '8px 16px' }}>Retour à la bibliothèque</button>
        </div>
      )}
      <iframe
        ref={iframeRef}
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
