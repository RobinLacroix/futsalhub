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
//   -> INIT           { teamId, drillId, drill|null, procedure|null, roster, teamColors, library }
//   -> CONTEXT_UPDATE { teamId, roster, teamColors, library }
//   -> SAVED          { drillId }
//   -> SAVE_ERROR     { message }
//   -> LIBRARY_UPDATE { folders, procedures }
//   -> PROCEDURE_SAVED       { procedure }   (fiche liée créée/mise à jour)
//   -> PROCEDURE_SAVE_ERROR  { message }
//   <- READY          {}
//   <- SAVE           { drillId: string|null, drill: unknown }
//   <- CLOSE          {}
//   <- LIBRARY_ACTION { action, payload }  (bibliothèque/dossiers — actions :
//                        createFolder/renameFolder/deleteFolder/setFolder
//                        (payload.procedureId)/deleteProcedure/
//                        duplicateProcedure ; procedures depuis le recadrage
//                        2026-09-22, avant : schémas bruts)
//   <- PROCEDURE_SAVE { procedureId: string|null, patch }  (panneau "Séance &
//                        données", ajout 2026-09 : la fiche liée au schéma
//                        (training_procedures.schematic_id) devient la
//                        référence unique — le panneau n'écrit plus dans
//                        schematics.data.meta/.rules pour ces champs-là. Le
//                        schéma doit déjà être enregistré (drillId non nul) :
//                        pas de fiche sans schéma à lier.
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
import { schematicFoldersService } from '@/lib/services/schematicFoldersService';
import { playersService } from '@/lib/services/playersService';
import { trainingProceduresService, type ProcedureUpsertInput } from '@/lib/services/trainingProceduresService';

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
  // Ouvre l'éditeur sur une fiche SANS schéma, pour en dessiner un et le lier
  // (cf carte "Dessiner un schéma" de la bibliothèque quand hasSchematic est
  // faux) — ignoré si `schematic` est aussi présent (un schéma déjà là prime).
  const procedureIdParam = searchParams.get('procedure');
  const { activeTeam } = useActiveTeam();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const iframeReadyRef = useRef(false); // true dès que READY est reçu
  const initSentRef = useRef(false);    // true dès que l'INIT complet (avec drill) est parti
  // Miroir synchrone de schematicId : sur le tout premier enregistrement d'un
  // schéma neuf, le handler SAVE ci-dessous connaît l'id immédiatement (reçu
  // de saveSchematic), mais router.replace() qui met `schematicId` (état,
  // dérivé de l'URL) à jour ne re-render qu'après coup. Or l'éditeur poste
  // PROCEDURE_SAVE quasi aussitôt après SAVED (cf sendProcedureSave côté
  // editor.js) : le handler PROCEDURE_SAVE, qui capture `schematicId` par
  // closure, le voyait donc encore à null et abandonnait en silence — la
  // fiche du procédé n'était jamais créée au tout premier enregistrement
  // (cf conversation 2026-09-22, "je veux que ce soit directement un procédé
  // de la librairie avec fiche"). La ref est mise à jour de façon synchrone
  // dans le handler SAVE, avant même l'appel à router.replace.
  const schematicIdRef = useRef<string | null>(schematicId);
  useEffect(() => {
    schematicIdRef.current = schematicId;
  }, [schematicId]);

  const sendToIframe = useCallback((message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  // Bibliothèque (dossiers + cartes) de TOUT LE CLUB — alimente le panneau
  // "Bibliothèque" de l'éditeur embarqué (cf editor.js embeddedLibrary).
  // Recadrage 2026-09-22 : une seule bibliothèque, même donnée que
  // /webapp/library — procédés (avec schéma joint) UNION schémas sans fiche
  // liée (cf getFullLibraryByClub). Sans l'union, un schéma jamais rattaché
  // à une fiche disparaissait purement et simplement du panneau.
  const fetchLibrary = useCallback(async (clubId: string) => {
    const [folders, procedures] = await Promise.all([
      schematicFoldersService.getFoldersByClub(clubId),
      trainingProceduresService.getFullLibraryByClub(clubId),
    ]);
    return { folders, procedures };
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
    const library = await fetchLibrary(team.club_id);
    return { teamId: team.id, roster, teamColors, library };
  }, [fetchLibrary]);

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
        let procedure = null;
        if (schematicId) {
          const [record, proc] = await Promise.all([
            schematicsService.getSchematicById(schematicId),
            trainingProceduresService.getProcedureBySchematicId(schematicId),
          ]);
          // record.data est type SchematicData (ancien format circuits/sequences)
          // dans ce service, mais porte en réalité le format drill dès qu'un
          // schéma a été enregistré par le nouvel éditeur — le service ne
          // valide pas la forme du jsonb, il la fait juste transiter.
          drill = record?.data ?? null;
          procedure = proc;
        } else if (procedureIdParam) {
          procedure = await trainingProceduresService.getProcedureById(procedureIdParam);
        }
        sendToIframe({ type: 'INIT', ...context, drillId: schematicId, drill, procedure });
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
  }, [activeTeam, schematicId, procedureIdParam, buildContext, sendToIframe]);

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
          // Synchrone, avant tout : PROCEDURE_SAVE peut arriver avant que
          // router.replace() ci-dessous n'ait fait re-rendre `schematicId`.
          schematicIdRef.current = record.id;
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
      } else if (msg.type === 'LIBRARY_ACTION') {
        if (!activeTeam) return;
        const action = (msg as { action?: string }).action;
        const payload = (msg as { payload?: Record<string, unknown> }).payload || {};
        const run = async () => {
          if (action === 'createFolder') {
            await schematicFoldersService.createFolder(activeTeam.id, String(payload.name || ''));
          } else if (action === 'renameFolder') {
            await schematicFoldersService.renameFolder(String(payload.id), String(payload.name || ''));
          } else if (action === 'deleteFolder') {
            await schematicFoldersService.deleteFolder(String(payload.id));
          } else if (action === 'setFolder') {
            // kind distingue une carte procédé (training_procedures.folder_id)
            // d'un schéma sans fiche liée (schematics.folder_id) — les deux
            // cas existent dans la bibliothèque unifiée (cf getFullLibraryByClub).
            const folderId = (payload.folderId as string | null) || null;
            if (payload.kind === 'schematic') await schematicsService.setSchematicFolder(String(payload.id), folderId);
            else await trainingProceduresService.setProcedureFolder(String(payload.id), folderId);
          } else if (action === 'deleteProcedure') {
            if (payload.kind === 'schematic') await schematicsService.deleteSchematic(String(payload.id));
            else await trainingProceduresService.archiveProcedure(String(payload.id));
          } else if (action === 'duplicateProcedure') {
            if (payload.kind === 'schematic') await schematicsService.duplicateSchematic(String(payload.id));
            else await trainingProceduresService.duplicateProcedure(String(payload.id));
          }
        };
        run()
          .catch((err) => console.error('schematics: échec LIBRARY_ACTION ' + action, err))
          .finally(() => {
            fetchLibrary(activeTeam.club_id)
              .then(({ folders, procedures }) => sendToIframe({ type: 'LIBRARY_UPDATE', folders, procedures }))
              .catch((err) => console.error('schematics: échec de rafraîchissement de la bibliothèque', err));
          });
      } else if (msg.type === 'PROCEDURE_SAVE') {
        const savedSchematicId = schematicIdRef.current;
        if (!activeTeam || !savedSchematicId) return;
        const procedureId = (msg as { procedureId?: string | null }).procedureId || undefined;
        const patch = ((msg as { patch?: Partial<ProcedureUpsertInput> }).patch || {}) as Partial<ProcedureUpsertInput>;
        trainingProceduresService
          .createOrUpdateProcedure({
            ...patch,
            id: procedureId,
            schematic_id: savedSchematicId,
            club_id: activeTeam.club_id,
            title: patch.title || 'Sans titre',
            objectives: patch.objectives || '',
            instructions: patch.instructions || '',
            type: patch.type || 'Exercice',
            theme: patch.theme || 'Offensif',
          })
          .then((procedure) => sendToIframe({ type: 'PROCEDURE_SAVED', procedure }))
          .catch((err) => {
            console.error('schematics: échec de sauvegarde de la fiche procédé', err);
            sendToIframe({ type: 'PROCEDURE_SAVE_ERROR', message: err instanceof Error ? err.message : 'Erreur inconnue' });
          });
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeTeam, schematicId, trySendContext, sendToIframe, router, fetchLibrary]);

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
