# Assembleur de séance web — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note d'environnement (ce projet) :** les skills `superpowers:subagent-driven-development` et `superpowers:executing-plans` ne sont pas installés dans cette session — seule `writing-plans` (lue directement depuis le clone du marketplace) l'est. Exécuter ce plan directement dans la session, tâche par tâche, avec les checkpoints `tsc` + vérification manuelle définis ci-dessous à la place de la sous-skill d'exécution.

**Goal:** Remplacer l'assembleur de séance actuel (iframe vanilla-JS) par un composant React natif intégré à `/webapp/library/sessions`, avec une trame pédagogique en 6 blocs modulable.

**Architecture:** Next.js App Router, composants client (`'use client'`) sous `app/webapp/library/sessions/`, service `lib/services/sessionsService.ts` étendu (types + normalisation des anciens blocs), pas de nouvelle RPC (le stockage `training_sessions.blocks` reste un JSONB libre).

**Tech Stack:** React 19 / Next.js 16, Tailwind + classes `fm-*` du design system existant (`app/globals.css`), `lucide-react` pour les icônes, `supabase-js` côté service (pattern déjà en place, pas de RPC).

## Global Constraints

- `tsc --noEmit` doit rester à 0 erreur après chaque tâche (oracle du projet, cf. CLAUDE.md).
- Aucun test automatisé dans ce repo — chaque tâche se termine par une vérification manuelle en navigateur à la place d'un test unitaire (cf. adaptation TDD ci-dessous).
- Suivre les classes `fm-*` existantes (`fm-input`, `fm-select`, `fm-btn-*`, `fm-overlay`/`fm-modal`, `fm-card*`) — ne pas introduire Radix Dialog (installé mais non utilisé nulle part dans le repo ; le pattern réel des modales est `fm-overlay`/`fm-modal`, cf. `OtherTeamPlayersModal.tsx`).
- Réordonnancement par boutons monter/descendre uniquement — jamais de drag-and-drop (contrainte WCAG 2.2 AA déjà actée sur l'éditeur de schémas et l'assembleur mobile).
- Pas de nouvelle couleur/CSS de marque : `.fm-card-accent` (sans suffixe) utilise déjà `var(--fh-accent)` — c'est la bonne classe pour le Bloc 3, aucun ajout CSS nécessaire (correction par rapport à la spec initiale qui prévoyait une variante `-primary` inexistante).
- Spec source : [docs/superpowers/specs/2026-09-22-assembleur-seance-web-design.md](../specs/2026-09-22-assembleur-seance-web-design.md).

**Adaptation TDD → ce repo :** chaque tâche "Write the failing test" devient "Écrire le composant/la fonction", "Run test" devient "`npx tsc --noEmit -p tsconfig.json`" + une vérification manuelle précise et observable (ce qu'on doit voir/pouvoir faire dans le navigateur). C'est la même discipline (petite étape, vérification immédiate, commit) appliquée avec les outils réellement disponibles ici.

---

## Task 1: Modèle de données — `sessionsService.ts`

**Files:**
- Modify: `lib/services/sessionsService.ts` (fichier entier, 116 lignes actuelles)

**Interfaces:**
- Produces: `SessionBlockType`, `LearningPhase`, `SessionBlock`, `SessionMeta`, `TrainingSessionRecord`, `normalizeSessionBlocks(raw: unknown[]): SessionBlock[]`, `sessionsService.getSessionsByClub/getSessionById/saveSession/deleteSession` (signatures inchangées, mais `saveSession`/`getSessionById` passent les blocs par `normalizeSessionBlocks` en lecture).

- [ ] **Step 1: Remplacer les types et ajouter la normalisation**

```ts
// lib/services/sessionsService.ts
import { supabase } from '../supabaseClient';

export type SessionBlockType =
  | 'Echauffement'      // Bloc 1 — échauffement ludique
  | 'Problematisation'  // Bloc 2
  | 'Situation'         // Bloc 3 — cœur de séance
  | 'Analytique'        // Bloc 4 — optionnel
  | 'JeuOriente'        // Bloc 5
  | 'MatchLibre';       // Bloc 6

export type LearningPhase = 'Phase 1' | 'Phase 2' | 'Mix';

export interface SessionBlock {
  id: string;
  type: SessionBlockType;
  duration: number;
  procedureId: string | null;
  intentionPedagogique: string;
}

export interface SessionMeta {
  principe: string;
  moyen?: string;
  theme?: string;
  phase?: LearningPhase;
  effectif?: string;
  dureeTotaleMin: number;
}

export interface TrainingSessionRecord {
  id: string;
  club_id: string;
  created_by: string | null;
  name: string;
  meta: SessionMeta;
  blocks: SessionBlock[];
  created_at: string;
  updated_at: string;
}

/**
 * Mappe les anciens types de bloc (Phase 2, 2026-09-21 → 22) vers la nouvelle
 * trame à 6 blocs — cf. spec §Migration des données existantes. Les 11
 * séances déjà en prod n'ont jamais de bloc Problematisation/MatchLibre tant
 * qu'elles ne sont pas rouvertes et complétées : pas une régression, la
 * timeline ne reflète que les blocs présents.
 */
const LEGACY_TYPE_MAP: Record<string, SessionBlockType> = {
  Echauffement: 'Echauffement',
  Exercice: 'Analytique',
  Situation: 'Situation',
  Jeu: 'JeuOriente',
};

const VALID_TYPES = new Set<SessionBlockType>([
  'Echauffement', 'Problematisation', 'Situation', 'Analytique', 'JeuOriente', 'MatchLibre',
]);

export function normalizeSessionBlocks(raw: unknown): SessionBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((b, i) => {
    const block = b as Partial<SessionBlock> & { type?: string };
    const rawType = block.type || 'Situation';
    const type: SessionBlockType = VALID_TYPES.has(rawType as SessionBlockType)
      ? (rawType as SessionBlockType)
      : LEGACY_TYPE_MAP[rawType] || 'Situation';
    return {
      id: block.id || `b${Date.now()}${i}`,
      type,
      duration: typeof block.duration === 'number' ? block.duration : 0,
      procedureId: block.procedureId ?? null,
      intentionPedagogique: block.intentionPedagogique || '',
    };
  });
}

export const sessionsService = {
  async getSessionsByClub(clubId: string): Promise<TrainingSessionRecord[]> {
    const { data, error } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('club_id', clubId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((r) => ({ ...r, blocks: normalizeSessionBlocks(r.blocks) }));
  },

  async getSessionById(id: string): Promise<TrainingSessionRecord | null> {
    const { data, error } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return null;
    return { ...data, blocks: normalizeSessionBlocks(data.blocks) };
  },

  async saveSession(payload: {
    id?: string | null;
    clubId: string;
    name: string;
    meta: SessionMeta;
    blocks: SessionBlock[];
  }): Promise<TrainingSessionRecord> {
    if (payload.id) {
      const { data, error } = await supabase
        .from('training_sessions')
        .update({
          name: payload.name,
          meta: payload.meta,
          blocks: payload.blocks,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('training_sessions')
        .insert({
          club_id: payload.clubId,
          name: payload.name,
          meta: payload.meta,
          blocks: payload.blocks,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  async deleteSession(id: string): Promise<void> {
    const { error } = await supabase.from('training_sessions').delete().eq('id', id);
    if (error) throw error;
  },
};
```

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur (ce fichier n'est encore consommé par personne d'autre que `SessionPicker.tsx`, dont le seul usage est `s.meta?.dureeTotaleMin`/`s.blocks?.length` — compatible avec les nouveaux types).

- [ ] **Step 3: Commit**

```bash
git add lib/services/sessionsService.ts
git commit -m "feat(sessions): modèle de données en 6 blocs + normalisation des séances existantes"
```

---

## Task 2: Métadonnées des types de bloc — `constants.ts`

**Files:**
- Create: `app/webapp/library/sessions/constants.ts`

**Interfaces:**
- Consumes: `SessionBlockType`, `SessionBlock` (Task 1)
- Produces: `BLOCK_TYPES` (array ordonné avec label/couleur), `blockMeta(type)`, `buildDefaultBlocks()`

- [ ] **Step 1: Écrire le fichier**

```ts
// app/webapp/library/sessions/constants.ts
import type { SessionBlock, SessionBlockType } from '@/lib/services/sessionsService';

export interface BlockTypeMeta {
  value: SessionBlockType;
  label: string;
  shortLabel: string;
  color: string;       // segment de la timeline + point de couleur sur la carte
  isCore: boolean;      // Bloc 3 — mise en avant "CŒUR"
  defaultDuration: number;
}

export const BLOCK_TYPES: BlockTypeMeta[] = [
  { value: 'Echauffement', label: 'Échauffement ludique', shortLabel: 'Échauffement', color: '#94A3B8', isCore: false, defaultDuration: 15 },
  { value: 'Problematisation', label: 'Problématisation', shortLabel: 'Problématisation', color: '#60A5FA', isCore: false, defaultDuration: 15 },
  { value: 'Situation', label: 'Situation isolée', shortLabel: 'Situation', color: 'var(--fh-accent, #6C5CE0)', isCore: true, defaultDuration: 20 },
  { value: 'Analytique', label: 'Analytique', shortLabel: 'Analytique', color: '#C4B5FD', isCore: false, defaultDuration: 10 },
  { value: 'JeuOriente', label: 'Jeu orienté', shortLabel: 'Jeu orienté', color: '#FB923C', isCore: false, defaultDuration: 15 },
  { value: 'MatchLibre', label: 'Match libre', shortLabel: 'Match libre', color: '#A8A29E', isCore: false, defaultDuration: 15 },
];

const BLOCK_TYPE_BY_VALUE = new Map(BLOCK_TYPES.map((t) => [t.value, t]));

export function blockMeta(type: SessionBlockType): BlockTypeMeta {
  return BLOCK_TYPE_BY_VALUE.get(type) || BLOCK_TYPES[2];
}

let idSeq = 0;
function newBlockId(): string {
  idSeq += 1;
  return `b${Date.now()}${idSeq}`;
}

/** Seed par défaut d'une nouvelle séance — les 6 blocs dans l'ordre, durée totale 90 min (cf. spec). */
export function buildDefaultBlocks(): SessionBlock[] {
  return BLOCK_TYPES.map((t) => ({
    id: newBlockId(),
    type: t.value,
    duration: t.defaultDuration,
    procedureId: null,
    intentionPedagogique: '',
  }));
}

export function newBlock(type: SessionBlockType): SessionBlock {
  const meta = blockMeta(type);
  return { id: newBlockId(), type, duration: meta.defaultDuration, procedureId: null, intentionPedagogique: '' };
}
```

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur.

- [ ] **Step 3: Commit**

```bash
git add app/webapp/library/sessions/constants.ts
git commit -m "feat(sessions): métadonnées des 6 types de bloc + seed par défaut"
```

---

## Task 3: `SessionTimeline` — barre segmentée

**Files:**
- Create: `app/webapp/library/sessions/components/SessionTimeline.tsx`

**Interfaces:**
- Consumes: `SessionBlock[]` (Task 1), `blockMeta` (Task 2)
- Produces: `<SessionTimeline blocks={blocks} />`

- [ ] **Step 1: Écrire le composant**

```tsx
// app/webapp/library/sessions/components/SessionTimeline.tsx
'use client';

import type { SessionBlock } from '@/lib/services/sessionsService';
import { blockMeta } from '../constants';

/**
 * Barre segmentée proportionnelle aux blocs RÉELLEMENT présents dans la
 * séance (pas 6 cases fixes) — décision actée avec Robin : une séance de
 * veille de match n'a que 4 blocs, la timeline doit le refléter.
 */
export function SessionTimeline({ blocks }: { blocks: SessionBlock[] }) {
  const total = blocks.reduce((sum, b) => sum + (b.duration || 0), 0);

  if (blocks.length === 0) {
    return (
      <p className="text-xs text-gray-500">Ajoute un premier bloc pour voir la timeline de la séance.</p>
    );
  }

  return (
    <div>
      <div className="flex h-5 rounded-md overflow-hidden border border-gray-200">
        {blocks.map((b) => {
          const meta = blockMeta(b.type);
          const pct = total > 0 ? (b.duration / total) * 100 : 0;
          return (
            <div
              key={b.id}
              title={`${meta.shortLabel} — ${b.duration} min`}
              style={{ width: `${pct}%`, backgroundColor: meta.color }}
              className="flex items-center justify-center text-[10px] font-semibold text-white overflow-hidden"
            >
              {pct > 8 ? `${b.duration}'` : ''}
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        {total} min · {blocks.length} bloc{blocks.length > 1 ? 's' : ''}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur (composant pas encore monté nulle part, mais doit se type-checker isolément).

- [ ] **Step 3: Commit**

```bash
git add app/webapp/library/sessions/components/SessionTimeline.tsx
git commit -m "feat(sessions): SessionTimeline — barre segmentée adaptative"
```

---

## Task 4: `SessionHeaderForm` — en-tête de séance

**Files:**
- Create: `app/webapp/library/sessions/components/SessionHeaderForm.tsx`

**Interfaces:**
- Consumes: `SessionMeta`, `LearningPhase` (Task 1)
- Produces: `<SessionHeaderForm name meta onNameChange onMetaChange dureeTotaleMin />`

- [ ] **Step 1: Écrire le composant**

```tsx
// app/webapp/library/sessions/components/SessionHeaderForm.tsx
'use client';

import type { SessionMeta, LearningPhase } from '@/lib/services/sessionsService';

const PHASE_OPTIONS: { value: LearningPhase | ''; label: string }[] = [
  { value: '', label: 'Non précisé' },
  { value: 'Phase 1', label: 'Phase 1 — structure contrainte' },
  { value: 'Phase 2', label: 'Phase 2 — jeu libre' },
  { value: 'Mix', label: 'Mix' },
];

export interface SessionHeaderFormProps {
  name: string;
  meta: SessionMeta;
  dureeTotaleMin: number;
  onNameChange: (name: string) => void;
  onMetaChange: (patch: Partial<SessionMeta>) => void;
}

/**
 * En-tête de séance : Principe servi / Moyen travaillé / Thème / Phase
 * d'apprentissage / Effectif. Durée totale affichée en lecture seule,
 * dérivée de la somme des blocs — jamais saisie ici (cf. spec).
 *
 * Phase d'apprentissage volontairement optionnelle et non mise en avant :
 * Robin ne maîtrise pas encore le concept (Phase 1/2, école espagnole) —
 * un champ obligatoire deviendrait une case cochée sans valeur réelle.
 */
export function SessionHeaderForm({ name, meta, dureeTotaleMin, onNameChange, onMetaChange }: SessionHeaderFormProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-800 mb-1.5">Nom de la séance</label>
        <input
          className="fm-input"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Ex : Semaine 3 — sortie de pression"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-800 mb-1.5">Principe servi</label>
          <input
            className="fm-input"
            value={meta.principe}
            onChange={(e) => onMetaChange({ principe: e.target.value })}
            placeholder="Ex : Supériorité collective offensive"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-800 mb-1.5">
            Moyen travaillé <span className="font-normal text-gray-500">(optionnel)</span>
          </label>
          <input
            className="fm-input"
            value={meta.moyen || ''}
            onChange={(e) => onMetaChange({ moyen: e.target.value })}
            placeholder="Ex : Dualité meneur → ailier (parallèle)"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-800 mb-1.5">
            Thème <span className="font-normal text-gray-500">(optionnel)</span>
          </label>
          <input
            className="fm-input"
            value={meta.theme || ''}
            onChange={(e) => onMetaChange({ theme: e.target.value })}
            placeholder="Titre libre de la séance"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-800 mb-1.5">Effectif</label>
          <input
            className="fm-input"
            value={meta.effectif || ''}
            onChange={(e) => onMetaChange({ effectif: e.target.value })}
            placeholder="Ex : 12 joueurs"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-800 mb-1.5">
            Phase d&apos;apprentissage <span className="font-normal text-gray-500">(optionnel)</span>
          </label>
          <select
            className="fm-select"
            value={meta.phase || ''}
            onChange={(e) => onMetaChange({ phase: (e.target.value || undefined) as LearningPhase | undefined })}
          >
            {PHASE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-500 pb-2.5">
          Durée totale : <span className="font-semibold text-gray-800">{dureeTotaleMin} min</span> (calculée automatiquement)
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur.

- [ ] **Step 3: Commit**

```bash
git add app/webapp/library/sessions/components/SessionHeaderForm.tsx
git commit -m "feat(sessions): SessionHeaderForm — en-tête principe/moyen/phase"
```

---

## Task 5: `ProcedurePickerDialog` — sélection du procédé lié

**Files:**
- Create: `app/webapp/library/sessions/components/ProcedurePickerDialog.tsx`

**Interfaces:**
- Consumes: `TrainingProcedureRecord` (`@/lib/services/trainingProceduresService`)
- Produces: `<ProcedurePickerDialog open procedures onSelect onClose />`

- [ ] **Step 1: Écrire le composant**

```tsx
// app/webapp/library/sessions/components/ProcedurePickerDialog.tsx
'use client';

import { useState } from 'react';
import { Search, X, FileText } from 'lucide-react';
import type { TrainingProcedureRecord } from '@/lib/services/trainingProceduresService';

export interface ProcedurePickerDialogProps {
  open: boolean;
  procedures: TrainingProcedureRecord[];
  onSelect: (procedureId: string) => void;
  onClose: () => void;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Sélection du procédé lié à un bloc — même pattern de modale que le reste
 * du produit (fm-overlay/fm-modal, cf. OtherTeamPlayersModal.tsx). Pas de
 * Radix Dialog : la dépendance est installée mais non utilisée nulle part
 * dans le repo, autant suivre le pattern réel plutôt qu'en introduire un
 * second pour ce seul écran.
 */
export function ProcedurePickerDialog({ open, procedures, onSelect, onClose }: ProcedurePickerDialogProps) {
  const [search, setSearch] = useState('');

  if (!open) return null;

  const filtered = search.trim()
    ? procedures.filter((p) => norm(p.title).includes(norm(search)) || norm(p.theme || '').includes(norm(search)))
    : procedures;

  return (
    <div className="fm-overlay fm-overlay-top" onClick={onClose}>
      <div className="fm-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="fm-modal-header">
          <div className="fm-modal-title">
            <span className="fm-modal-title-bar" />
            Choisir un procédé
          </div>
          <button className="fm-modal-close" onClick={onClose} aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="fm-modal-body">
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="search"
              className="fm-input pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un procédé…"
              autoFocus
            />
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Aucun procédé ne correspond à cette recherche.</p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p.id); onClose(); }}
                  className="w-full flex items-center gap-3 p-2 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-left transition-colors"
                >
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="" className="w-10 h-7 object-cover rounded border border-gray-200 shrink-0" />
                  ) : (
                    <span className="w-10 h-7 rounded border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0">
                      <FileText className="h-3.5 w-3.5 text-gray-400" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate">{p.title || 'Sans titre'}</span>
                    <span className="block text-xs text-gray-500">
                      {p.theme}{p.duration_minutes ? ` · ${p.duration_minutes} min` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur.

- [ ] **Step 3: Commit**

```bash
git add app/webapp/library/sessions/components/ProcedurePickerDialog.tsx
git commit -m "feat(sessions): ProcedurePickerDialog — sélection du procédé lié à un bloc"
```

---

## Task 6: `SessionBlockCard` + `AddBlockMenu`

**Files:**
- Create: `app/webapp/library/sessions/components/SessionBlockCard.tsx`
- Create: `app/webapp/library/sessions/components/AddBlockMenu.tsx`

**Interfaces:**
- Consumes: `SessionBlock`, `SessionBlockType` (Task 1), `blockMeta`, `BLOCK_TYPES` (Task 2), `TrainingProcedureRecord`
- Produces: `<SessionBlockCard block index total procedure onPatch onRemove onMoveUp onMoveDown onPickProcedure />`, `<AddBlockMenu onAdd />`

- [ ] **Step 1: Écrire `SessionBlockCard`**

```tsx
// app/webapp/library/sessions/components/SessionBlockCard.tsx
'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, X, FileText, Eye } from 'lucide-react';
import type { SessionBlock } from '@/lib/services/sessionsService';
import type { TrainingProcedureRecord } from '@/lib/services/trainingProceduresService';
import { blockMeta } from '../constants';

export interface SessionBlockCardProps {
  block: SessionBlock;
  index: number;
  total: number;
  procedure: TrainingProcedureRecord | null;
  onPatch: (patch: Partial<SessionBlock>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPickProcedure: () => void;
  onViewSchematic?: (schematicId: string) => void;
}

/**
 * Carte compacte : type + durée + contrôles sur une ligne, aperçu du
 * procédé, intention pédagogique repliée derrière un disclosure — choisi
 * contre le format détaillé pour permettre un scan rapide de toute la
 * séance (cf. brainstorming, option A retenue).
 */
export function SessionBlockCard({
  block, index, total, procedure, onPatch, onRemove, onMoveUp, onMoveDown, onPickProcedure, onViewSchematic,
}: SessionBlockCardProps) {
  const [showIntention, setShowIntention] = useState(!!block.intentionPedagogique);
  const meta = blockMeta(block.type);

  return (
    <div className={`fm-card ${meta.isCore ? 'fm-card-accent-host' : ''}`} style={{ marginBottom: 0 }}>
      <div className="flex items-stretch">
        {meta.isCore && <span className="fm-card-accent" />}
        <div className="flex-1 p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            {meta.isCore && (
              <span
                style={{ backgroundColor: 'var(--fh-accent, #6C5CE0)' }}
                className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0"
              >
                Cœur
              </span>
            )}
            <span className="text-sm font-semibold text-gray-900">{meta.label}</span>
            <input
              type="number"
              min={0}
              className="fm-input w-16 py-1 text-xs ml-auto"
              value={block.duration}
              onChange={(e) => onPatch({ duration: parseInt(e.target.value, 10) || 0 })}
            />
            <span className="text-xs text-gray-500">min</span>
            <div className="flex items-center gap-0.5 border-l border-gray-200 pl-2 ml-1">
              <button
                onClick={onMoveUp}
                disabled={index === 0}
                aria-label="Monter le bloc"
                className="p-1 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onMoveDown}
                disabled={index === total - 1}
                aria-label="Descendre le bloc"
                className="p-1 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onRemove}
                aria-label="Retirer le bloc"
                className="p-1 rounded text-red-500 hover:bg-red-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <button
            onClick={onPickProcedure}
            className="w-full flex items-center gap-2 p-1.5 rounded-md bg-gray-50 hover:bg-gray-100 border border-gray-200 text-left transition-colors"
          >
            {procedure?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={procedure.image_url} alt="" className="w-9 h-6 object-cover rounded border border-gray-200 shrink-0" />
            ) : (
              <span className="w-9 h-6 rounded border border-gray-200 bg-white flex items-center justify-center shrink-0">
                <FileText className="h-3 w-3 text-gray-400" />
              </span>
            )}
            <span className="text-xs text-gray-800 truncate">
              {procedure ? (procedure.title || 'Sans titre') : 'Choisir un procédé (optionnel)'}
            </span>
            {procedure?.schematic_id && onViewSchematic && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onViewSchematic(procedure.schematic_id as string); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onViewSchematic(procedure.schematic_id as string); } }}
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline shrink-0"
              >
                <Eye className="h-3 w-3" /> Schéma
              </span>
            )}
          </button>

          {showIntention ? (
            <textarea
              className="fm-textarea text-xs"
              rows={2}
              value={block.intentionPedagogique}
              onChange={(e) => onPatch({ intentionPedagogique: e.target.value })}
              placeholder="Ce que ce bloc doit produire"
            />
          ) : (
            <button
              onClick={() => setShowIntention(true)}
              className="text-[11px] text-gray-400 hover:text-gray-600"
            >
              + Intention pédagogique (optionnel)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Écrire `AddBlockMenu`**

```tsx
// app/webapp/library/sessions/components/AddBlockMenu.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import type { SessionBlockType } from '@/lib/services/sessionsService';
import { BLOCK_TYPES } from '../constants';

/** "+ Ajouter un bloc" — trame librement modifiable, aucun des 6 types n'est verrouillé ni unique. */
export function AddBlockMenu({ onAdd }: { onAdd: (type: SessionBlockType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-center gap-1.5 p-2.5 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
      >
        <Plus className="h-4 w-4" /> Ajouter un bloc
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {BLOCK_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => { onAdd(t.value); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur.

- [ ] **Step 4: Commit**

```bash
git add app/webapp/library/sessions/components/SessionBlockCard.tsx app/webapp/library/sessions/components/AddBlockMenu.tsx
git commit -m "feat(sessions): SessionBlockCard compacte + AddBlockMenu"
```

---

## Task 7: L'éditeur — `sessions/[sessionId]/page.tsx`

**Files:**
- Create: `app/webapp/library/sessions/[sessionId]/page.tsx`
- Delete: `app/webapp/library/sessions/page.tsx` (contenu actuel — recréé en liste dans Task 8, mais le fichier doit être vidé de son contenu iframe avant que Task 8 y écrive la liste, pour ne pas laisser un routage ambigu entre les deux tâches)

**Interfaces:**
- Consumes: tous les composants des Tasks 3-6, `sessionsService`, `trainingProceduresService.getProceduresByClub`, `useActiveTeam` (`../../hooks/useActiveTeam`)
- Produces: route `/webapp/library/sessions/[sessionId]` (`sessionId === 'new'` pour une création)

- [ ] **Step 1: Supprimer l'ancien pont iframe**

```bash
rm app/webapp/library/sessions/page.tsx
```

(Recréé en Task 8 comme page de liste — le supprimer ici évite qu'il continue de matcher `/webapp/library/sessions` avec son ancien contenu iframe pendant que l'éditeur ci-dessous est écrit.)

- [ ] **Step 2: Écrire l'éditeur**

```tsx
// app/webapp/library/sessions/[sessionId]/page.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useActiveTeam } from '../../../hooks/useActiveTeam';
import {
  sessionsService,
  type SessionBlock,
  type SessionBlockType,
  type SessionMeta,
} from '@/lib/services/sessionsService';
import { trainingProceduresService, type TrainingProcedureRecord } from '@/lib/services/trainingProceduresService';
import { buildDefaultBlocks, newBlock } from '../constants';
import { SessionTimeline } from '../components/SessionTimeline';
import { SessionHeaderForm } from '../components/SessionHeaderForm';
import { SessionBlockCard } from '../components/SessionBlockCard';
import { AddBlockMenu } from '../components/AddBlockMenu';
import { ProcedurePickerDialog } from '../components/ProcedurePickerDialog';

function emptyMeta(): SessionMeta {
  return { principe: '', dureeTotaleMin: 0 };
}

export default function SessionEditorPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { activeTeam } = useActiveTeam();
  const isNew = params.sessionId === 'new';

  const [recordId, setRecordId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [meta, setMeta] = useState<SessionMeta>(emptyMeta());
  const [blocks, setBlocks] = useState<SessionBlock[]>([]);
  const [procedures, setProcedures] = useState<TrainingProcedureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerForBlockId, setPickerForBlockId] = useState<string | null>(null);

  useEffect(() => {
    const clubId = activeTeam?.club_id;
    if (!clubId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [procs, existing] = await Promise.all([
          trainingProceduresService.getProceduresByClub(clubId),
          isNew ? Promise.resolve(null) : sessionsService.getSessionById(params.sessionId),
        ]);
        if (cancelled) return;
        setProcedures(procs);
        if (existing) {
          setRecordId(existing.id);
          setName(existing.name);
          setMeta(existing.meta ?? emptyMeta());
          setBlocks(existing.blocks ?? []);
        } else if (isNew) {
          setBlocks(buildDefaultBlocks());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chargement de la séance impossible');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTeam?.club_id, isNew, params.sessionId]);

  const procedureById = useMemo(() => new Map(procedures.map((p) => [p.id, p])), [procedures]);
  const dureeTotaleMin = useMemo(() => blocks.reduce((sum, b) => sum + (b.duration || 0), 0), [blocks]);

  const patchBlock = useCallback((id: string, patch: Partial<SessionBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);

  const addBlock = useCallback((type: SessionBlockType) => {
    setBlocks((prev) => [...prev, newBlock(type)]);
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const moveBlock = useCallback((id: string, dir: -1 | 1) => {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeTeam?.club_id) return;
    if (!name.trim()) {
      setError('Donne un nom à la séance avant d’enregistrer.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await sessionsService.saveSession({
        id: recordId,
        clubId: activeTeam.club_id,
        name: name.trim(),
        meta: { ...meta, dureeTotaleMin },
        blocks,
      });
      setRecordId(saved.id);
      router.push('/webapp/library/sessions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’enregistrement de la séance');
    } finally {
      setSaving(false);
    }
  }, [activeTeam?.club_id, name, meta, blocks, recordId, dureeTotaleMin, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-sm text-gray-500">Chargement…</p>
      </div>
    );
  }

  const pickerBlock = blocks.find((b) => b.id === pickerForBlockId) ?? null;

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24 space-y-5">
      <button onClick={() => router.push('/webapp/library/sessions')} className="text-xs text-gray-500 hover:text-gray-700">
        ← Retour aux séances
      </button>

      {error && <div className="fm-alert fm-alert-error">{error}</div>}

      <SessionHeaderForm
        name={name}
        meta={meta}
        dureeTotaleMin={dureeTotaleMin}
        onNameChange={setName}
        onMetaChange={(patch) => setMeta((m) => ({ ...m, ...patch }))}
      />

      <SessionTimeline blocks={blocks} />

      <div className="space-y-2.5">
        {blocks.map((block, i) => (
          <SessionBlockCard
            key={block.id}
            block={block}
            index={i}
            total={blocks.length}
            procedure={block.procedureId ? procedureById.get(block.procedureId) ?? null : null}
            onPatch={(patch) => patchBlock(block.id, patch)}
            onRemove={() => removeBlock(block.id)}
            onMoveUp={() => moveBlock(block.id, -1)}
            onMoveDown={() => moveBlock(block.id, 1)}
            onPickProcedure={() => setPickerForBlockId(block.id)}
            onViewSchematic={(schematicId) => window.open(`/webapp/library/schematics?schematic=${schematicId}`, '_blank')}
          />
        ))}
      </div>

      <AddBlockMenu onAdd={addBlock} />

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3">
        <div className="max-w-3xl mx-auto">
          <button onClick={handleSave} disabled={saving} className="fm-btn fm-btn-primary w-full justify-center">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      <ProcedurePickerDialog
        open={pickerForBlockId != null}
        procedures={procedures}
        onSelect={(procedureId) => { if (pickerBlock) patchBlock(pickerBlock.id, { procedureId }); }}
        onClose={() => setPickerForBlockId(null)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur. (`/webapp/library/sessions` renvoie temporairement un 404 jusqu'à Task 8 — attendu à ce stade, pas un bug.)

- [ ] **Step 4: Commit**

```bash
git add app/webapp/library/sessions/
git commit -m "feat(sessions): éditeur de séance natif (remplace le pont iframe)"
```

---

## Task 8: La liste — `sessions/page.tsx`

**Files:**
- Create: `app/webapp/library/sessions/page.tsx`

**Interfaces:**
- Consumes: `sessionsService.getSessionsByClub/deleteSession`, `useActiveTeam`
- Produces: route `/webapp/library/sessions`

- [ ] **Step 1: Écrire la liste**

```tsx
// app/webapp/library/sessions/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { sessionsService, type TrainingSessionRecord } from '@/lib/services/sessionsService';

export default function SessionsListPage() {
  const router = useRouter();
  const { activeTeam } = useActiveTeam();
  const [sessions, setSessions] = useState<TrainingSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const clubId = activeTeam?.club_id;
    if (!clubId) return;
    setLoading(true);
    setError(null);
    try {
      setSessions(await sessionsService.getSessionsByClub(clubId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement des séances impossible');
    } finally {
      setLoading(false);
    }
  }, [activeTeam?.club_id]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`Supprimer définitivement la séance « ${name || 'sans titre'} » ?`)) return;
    try {
      await sessionsService.deleteSession(id);
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Échec de la suppression.');
    }
  }, [load]);

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-gray-900">Séances</h1>
        <button
          onClick={() => router.push('/webapp/library/sessions/new')}
          className="fm-btn fm-btn-primary fm-btn-sm"
        >
          <Plus className="h-3.5 w-3.5" /> Nouvelle séance
        </button>
      </div>

      {error && <div className="fm-alert fm-alert-error">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          Aucune séance — commence avec &laquo; Nouvelle séance &raquo;.
        </p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="fm-card flex items-center justify-between p-3 cursor-pointer hover:border-gray-300"
              style={{ marginBottom: 0 }}
              onClick={() => router.push(`/webapp/library/sessions/${s.id}`)}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{s.name || 'Sans titre'}</p>
                <p className="text-xs text-gray-500">
                  {s.blocks?.length ?? 0} bloc{(s.blocks?.length ?? 0) > 1 ? 's' : ''}
                  {s.meta?.dureeTotaleMin ? ` · ${s.meta.dureeTotaleMin} min` : ''}
                  {s.meta?.principe ? ` · ${s.meta.principe}` : ''}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(s.id, s.name); }}
                aria-label="Supprimer la séance"
                className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur.

**Vérification manuelle (checkpoint du chemin complet)** :
1. `npm run dev`, ouvrir `/webapp/library/sessions` → liste des 11 séances existantes visible, chacune affiche son principe (vide pour les anciennes, normal — champ nouveau).
2. Cliquer une séance existante → l'éditeur s'ouvre, les blocs legacy apparaissent avec leur type normalisé (`Exercice` → affiché comme "Analytique", etc.), pas d'erreur console.
3. « Nouvelle séance » → les 6 blocs par défaut apparaissent dans l'ordre, timeline à 90 min, Bloc 3 marqué "CŒUR".
4. Retirer un bloc, réordonner avec les flèches → la timeline se met à jour immédiatement.
5. Choisir un procédé sur un bloc → la modale s'ouvre, recherche filtre correctement, sélection referme la modale et met à jour l'aperçu.
6. Enregistrer → redirection vers la liste, la nouvelle séance apparaît en tête (triée par `updated_at`).
7. Supprimer une séance → confirmation, disparition de la liste.

- [ ] **Step 3: Commit**

```bash
git add app/webapp/library/sessions/page.tsx
git commit -m "feat(sessions): liste des séances du club (remplace l'accès iframe uniquement)"
```

---

## Task 9: Reliures — `SessionPicker` et `library/page.tsx`

**Files:**
- Modify: `app/webapp/manager/calendar/components/SessionPicker.tsx:96-104` (les deux `href`)
- Modify: `app/webapp/library/page.tsx` (bouton d'entrée vers les séances, dans la top bar à côté de « Nouveau procédé »)

**Interfaces:**
- Consumes: routes créées en Task 7/8 (`/webapp/library/sessions`, `/webapp/library/sessions/[id]`, `/webapp/library/sessions/new`)

- [ ] **Step 1: Mettre à jour les liens de `SessionPicker.tsx`**

```tsx
// app/webapp/manager/calendar/components/SessionPicker.tsx
// Remplacer le bloc <a> existant (lignes 96-104) par :
        <a
          href={selected ? `/webapp/library/sessions/${selected.id}` : '/webapp/library/sessions/new'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-300 rounded-md hover:bg-green-100 whitespace-nowrap"
        >
          {selected ? 'Modifier' : 'Créer une séance'}
          <ExternalLink className="h-3 w-3" />
        </a>
```

- [ ] **Step 2: Ajouter le bouton d'entrée dans `library/page.tsx`**

Localiser le bloc du bouton « Nouveau procédé » (`app/webapp/library/page.tsx:1732-1739`) et ajouter juste avant :

```tsx
          <button
            onClick={() => window.open('/webapp/library/sessions', '_blank')}
            style={{ backgroundColor: T.cardBg, color: T.text, border: `1px solid ${T.border}` }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity shrink-0"
          >
            <span className="hidden sm:inline">Séances</span>
          </button>
```

(Même pattern que le lien existant vers l'éditeur de schémas à la ligne 1044 — `window.open(..., '_blank')` — pour rester cohérent avec la seule autre entrée d'outil tactique déjà présente sur cette page.)

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur.

**Vérification manuelle** : depuis le calendrier, ouvrir la modale d'entraînement, sélectionner une séance dans `SessionPicker` → « Modifier » ouvre bien l'éditeur natif dans un nouvel onglet (plus l'iframe). Depuis `/webapp/library`, le bouton « Séances » ouvre la liste dans un nouvel onglet.

- [ ] **Step 4: Commit**

```bash
git add app/webapp/manager/calendar/components/SessionPicker.tsx app/webapp/library/page.tsx
git commit -m "feat(sessions): relie SessionPicker et la bibliothèque au nouvel assembleur"
```

---

## Task 10: Suppression de l'outil vanilla-JS

**Files:**
- Delete: `public/tools/tactics/seance.html`
- Delete: `public/tools/tactics/seance.js`
- Modify: `public/tools/tactics/index.html:555`

**Interfaces:** aucune — nettoyage final, plus aucune référence active à ces deux fichiers après Task 9.

- [ ] **Step 1: Vérifier qu'aucune référence active ne subsiste**

Run: `grep -rn "seance\.html\|seance\.js" app/ public/ mobile/ --include="*.tsx" --include="*.ts" --include="*.html" --include="*.js"`
Expected: seule occurrence restante = `public/tools/tactics/index.html:555` (traité à l'étape suivante). Si `app/webapp/library/sessions/page.tsx` apparaît encore, Task 7/Step 1 n'a pas été appliqué — s'arrêter et corriger avant de continuer.

- [ ] **Step 2: Mettre à jour le lien croisé depuis l'éditeur de schémas**

```html
<!-- public/tools/tactics/index.html:555 — remplacer -->
<a class="navlink hide-embedded" href="seance.html" style="margin-left:0">Assembleur de séances →</a>
<!-- par -->
<a class="navlink hide-embedded" href="/webapp/library/sessions" target="_blank" style="margin-left:0">Assembleur de séances →</a>
```

- [ ] **Step 3: Supprimer les fichiers**

```bash
git rm public/tools/tactics/seance.html public/tools/tactics/seance.js
```

- [ ] **Step 4: Vérifier**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur (fichiers statiques, hors compilation TS — la vérification porte sur le grep de l'étape 1, déjà fait).

**Vérification manuelle finale** : `npm run dev`, parcourir une dernière fois le chemin complet calendrier → SessionPicker → éditeur natif → retour liste → bibliothèque → bouton Séances, confirmer qu'aucune iframe ne se charge plus nulle part (inspecter l'onglet Réseau : plus de requête vers `seance.html`/`seance.js`).

- [ ] **Step 5: Commit**

```bash
git add public/tools/tactics/index.html
git commit -m "chore(sessions): supprime l'outil vanilla-JS remplacé par l'assembleur natif"
```

---

## Self-Review (fait en écrivant ce plan)

**Couverture de la spec** : architecture React native (Tasks 7-8), modèle de données + migration (Task 1), 6 blocs + trame modulable (Task 2, 6), en-tête complet (Task 4), timeline adaptative (Task 3), carte compacte + CŒUR (Task 6), réordonnancement par boutons (Task 6), palette `fm-*` sans nouvelle couleur (Task 6, correction de la variante `-primary` inexistante), accès depuis la bibliothèque (Task 9), suppression de l'iframe (Task 7 Step 1 + Task 10). Tout couvert.

**Incohérence corrigée en écrivant ce plan** : la spec prévoyait une nouvelle classe CSS `.fm-card-accent-primary` ; la lecture de `app/globals.css` a montré que `.fm-card-accent` (sans suffixe) utilise déjà `var(--fh-accent)` — aucune CSS nouvelle nécessaire, Task 6 utilise directement la classe existante.

**Cohérence des types** : `SessionBlockType`/`LearningPhase`/`SessionBlock`/`SessionMeta` définis une seule fois (Task 1) et réimportés partout ailleurs — pas de redéfinition locale divergente dans les composants.
