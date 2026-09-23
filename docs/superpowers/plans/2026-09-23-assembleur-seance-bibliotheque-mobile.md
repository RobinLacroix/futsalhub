# Mobile — Assembleur de séance + bibliothèque de procédés — Implementation Plan

> **For agentic workers:** Ce repo n'a pas les skills `subagent-driven-development`/`executing-plans` installés — exécuter task par task directement en session, dans l'ordre. Pas de suite de tests dans ce repo (`CLAUDE.md` : "Zéro test... `tsc` comme oracle") : chaque étape "test" ci-dessous est remplacée par une vérification `tsc --noEmit` + vérification manuelle simulateur en fin de plan. Cases à cocher (`- [ ]`) pour le suivi.

**Goal:** Porter le mobile à parité avec le rework web : assembleur de séance sur le nouveau modèle à 6 blocs (timeline segmentée, rattachement calendrier, sélecteur de procédé avec filtres avancés) + bibliothèque de procédés avec recherche plein-contenu, filtres avancés et suppression.

**Architecture:** Composant écran → service (`mobile/lib/services/*.ts`) → `supabase-js` → RPC/table Postgres, même flux que le reste du mobile (pas de React Query, refetch manuel via `useCallback`+`useEffect`). Fonctions libres dans les services mobile (pas d'objet `xxxService` comme le web) — convention déjà en place dans ce fichier.

**Tech Stack:** Expo / React Native, TypeScript, Supabase, primitives `mobile/components/ui/*` (Screen, Card, Text, Button, IconButton, Input, ChipGroup, Badge, Sheet, EmptyState).

## Global Constraints

- `cd mobile && npx tsc --noEmit -p tsconfig.json` doit rester à 0 erreur après chaque tâche — pas de régression, même transitoire entre deux commits.
- Zéro nouveau test : vérification par `tsc` + simulateur iOS (cf tâche finale).
- Pas de `window.confirm` : toute confirmation destructive passe par `Alert.alert` (`{text:'Annuler', style:'cancel'}` / `{text:'Supprimer', style:'destructive', onPress}}`).
- Pas de drag-and-drop pour réordonner les blocs — boutons monter/descendre uniquement (accessibilité, décision déjà actée deux fois).
- Import unique des primitives UI depuis `mobile/components/ui` (barrel), jamais un fichier de primitive directement.
- Spec de référence : [2026-09-23-assembleur-seance-bibliotheque-mobile-design.md](../specs/2026-09-23-assembleur-seance-bibliotheque-mobile-design.md).

---

## Task 1: Rattachement calendrier — types et service `trainings`

**Files:**
- Modify: `mobile/types/index.ts:117-133` (interface `Training`)
- Modify: `mobile/lib/services/trainings.ts`

**Interfaces:**
- Produces: `Training.session_id?: string | null`, `getTrainingsByTeamIds(teamIds: string[]): Promise<Training[]>`, `setTrainingSession(trainingId: string, sessionId: string | null): Promise<void>` — consommés par Task 5 (écrans assembleur).

- [ ] **Step 1: Ajouter `session_id` à `Training`**

Dans `mobile/types/index.ts`, sur l'interface `Training` (ligne 117), ajouter le champ après `target_rpe_max` :

```ts
export interface Training {
  id: string;
  date: string;
  location: string;
  theme: string;
  key_principle?: string;
  attendance?: Record<string, PlayerStatus>;
  attendance_excused?: Record<string, boolean>;
  convoked_players?: { id: string }[];
  team_id?: string;
  season?: string | null;
  session_duration?: number | null;
  target_rpe_min?: number | null;
  target_rpe_max?: number | null;
  /** Séance de l'assembleur rattachée à cet entraînement (training_sessions.id), ou aucune. */
  session_id?: string | null;
}
```

- [ ] **Step 2: Ajouter `getTrainingsByTeamIds` et `setTrainingSession`**

Dans `mobile/lib/services/trainings.ts`, ajouter à la fin du fichier (après `sendQuestionnairesForTraining`), miroir exact de `trainingsService.getTrainingsByTeamIds`/`setTrainingSession` côté web (`lib/services/trainingsService.ts:269-289`) :

```ts
/**
 * Entraînements pour un ensemble d'équipes (club entier, via getTeamsByClubId)
 * — utilisé par l'assembleur de séance pour retrouver à quel(s) entraînement(s)
 * une séance est rattachée, toutes équipes confondues.
 */
export async function getTrainingsByTeamIds(teamIds: string[]): Promise<Training[]> {
  if (teamIds.length === 0) return [];
  const { data, error } = await supabase
    .from('trainings')
    .select('*')
    .in('team_id', teamIds)
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Rattache (ou détache avec `null`) une séance de l'assembleur à un entraînement. */
export async function setTrainingSession(trainingId: string, sessionId: string | null): Promise<void> {
  const { error } = await supabase
    .from('trainings')
    .update({ session_id: sessionId })
    .eq('id', trainingId);
  if (error) throw error;
}
```

- [ ] **Step 3: Vérifier et committer**

Run: `cd mobile && npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur.

```bash
git add mobile/types/index.ts mobile/lib/services/trainings.ts
git commit -m "feat(mobile): session_id sur Training, getTrainingsByTeamIds/setTrainingSession"
```

---

## Task 2: Suppression — services procédés et schémas

**Files:**
- Modify: `mobile/lib/services/trainingProceduresService.ts`
- Modify: `mobile/lib/services/schematicsService.ts`

**Interfaces:**
- Produces: `archiveProcedure(id: string): Promise<void>`, `deleteSchematic(id: string): Promise<void>` — consommés par Task 4 (`library/index.tsx`).

- [ ] **Step 1: Ajouter `archiveProcedure`**

Dans `mobile/lib/services/trainingProceduresService.ts`, ajouter après `updateProcedure` (après la ligne 92), miroir exact de `trainingProceduresService.archiveProcedure` côté web (`lib/services/trainingProceduresService.ts:236-242`) :

```ts
/** Archive une fiche (soft-delete) — disparaît de la bibliothèque, le schéma dessiné lié n'est pas touché. */
export async function archiveProcedure(id: string): Promise<void> {
  const { error } = await supabase
    .from('training_procedures')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 2: Ajouter `deleteSchematic`**

Dans `mobile/lib/services/schematicsService.ts`, ajouter à la fin du fichier (après `getSchematicsByClub`), miroir exact du web (`lib/services/schematicsService.ts:114-121`) :

```ts
/** Suppression définitive d'un schéma sans fiche liée (orphelin) — irréversible, contrairement à archiveProcedure. */
export async function deleteSchematic(id: string): Promise<void> {
  const { error } = await supabase.from('schematics').delete().eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 3: Vérifier et committer**

Run: `cd mobile && npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur.

```bash
git add mobile/lib/services/trainingProceduresService.ts mobile/lib/services/schematicsService.ts
git commit -m "feat(mobile): archiveProcedure et deleteSchematic"
```

---

## Task 3: `ProcedureCard` — bouton supprimer

**Files:**
- Modify: `mobile/components/tactics/ProcedureCard.tsx`

**Interfaces:**
- Consumes: rien de nouveau (composant déjà existant).
- Produces: prop `onDelete?: () => void` sur `ProcedureCard` — consommé par Task 4 (`library/index.tsx`). Optionnelle : les autres appelants de `ProcedureCard` (s'il y en a) continuent de fonctionner sans changement.

- [ ] **Step 1: Ajouter le bouton et la prop**

Remplacer le contenu de `mobile/components/tactics/ProcedureCard.tsx` :

```tsx
import { View, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { Card, Text, Badge } from '../ui';
import { SchematicThumbnail } from './SchematicThumbnail';
import { phaseTone } from '../../lib/tactics/procedureTaxonomy';
import type { LibraryCard } from '../../lib/services/trainingProceduresService';

/**
 * Carte de la grille bibliothèque — même densité d'info que ProcedureCard/
 * .lib-card côté web (app/webapp/library/page.tsx) : vignette + titre + Bloc/
 * Phase de jeu si c'est un procédé avec fiche, badge "Sans fiche" sinon (cf
 * LibraryCard, qui unifie les deux cas — recadrage 2026-09-22).
 *
 * `onDelete` optionnelle : la bibliothèque (2026-09-23) l'utilise, un futur
 * appelant en lecture seule (ex. un picker) peut s'en passer.
 */
export function ProcedureCard({
  card,
  onPress,
  onDelete,
}: {
  card: LibraryCard;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const s = useStyles();
  const proc = card.procedure;
  const sch = card.schematic;

  const bits = [
    proc?.rapport_numerique || '',
    proc?.duration_minutes ? `${proc.duration_minutes} min` : '',
  ].filter(Boolean);

  return (
    <Card variant="raised" padding="none" style={s.card} onPress={onPress} accessibilityLabel={card.title || 'Sans titre'}>
      <View style={[s.thumb, { backgroundColor: c.bg.sunken, borderBottomColor: c.border.subtle }]}>
        {sch ? (
          <SchematicThumbnail drill={sch.data} />
        ) : (
          <View style={s.noThumb}>
            <Text variant="caption" tone="tertiary">
              Pas de schéma
            </Text>
          </View>
        )}
        {onDelete && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            accessibilityRole="button"
            accessibilityLabel="Supprimer"
            hitSlop={8}
            style={[s.deleteBtn, { backgroundColor: c.bg.elevated, borderColor: c.border.subtle }]}
          >
            <Ionicons name="trash-outline" size={14} color={c.negative.default} />
          </Pressable>
        )}
      </View>
      <View style={s.meta}>
        <Text variant="callout" weight="600" numberOfLines={1}>
          {card.title || 'Sans titre'}
        </Text>
        {bits.length > 0 && (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {bits.join(' · ')}
          </Text>
        )}
        <View style={s.badgeRow}>
          {card.kind === 'schematic' ? (
            <Badge label="Sans fiche" tone="warning" size="sm" />
          ) : (
            <>
              {card.bloc && <Badge label={card.bloc} tone="neutral" size="sm" />}
              {card.theme && <Badge label={card.theme} tone={phaseTone(card.theme)} size="sm" />}
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { width: '47%', overflow: 'hidden' },
  thumb: { borderBottomWidth: StyleSheet.hairlineWidth },
  noThumb: { width: '100%', aspectRatio: 1.8, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: t.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { padding: t.space.md, gap: 3 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs, marginTop: 2 },
}));
```

- [ ] **Step 2: Vérifier et committer**

Run: `cd mobile && npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur (prop optionnelle, aucun appelant existant ne casse).

```bash
git add mobile/components/tactics/ProcedureCard.tsx
git commit -m "feat(mobile): bouton supprimer sur ProcedureCard"
```

---

## Task 4: Bibliothèque — recherche plein-contenu, filtres avancés, suppression

**Files:**
- Modify: `mobile/app/(tabs)/library/index.tsx`

**Interfaces:**
- Consumes: `archiveProcedure`, `deleteSchematic` (Task 2), `ProcedureCard`'s `onDelete` (Task 3), `FORMATS`/`PHASES_DE_JEU`/`INTENSITES` (déjà dans `lib/tactics/procedureTaxonomy.ts`), `FilterChip` (déjà existant).

- [ ] **Step 1: Étendre la recherche à tout le contenu de la fiche**

Dans `mobile/app/(tabs)/library/index.tsx`, remplacer la fonction `matches` (lignes 61-71) :

```tsx
  const matches = useCallback(
    (card: LibraryCard, q: string) => {
      const matchBloc = !activeBloc || card.bloc === activeBloc;
      const matchFormat = selectedFormats.length === 0 || (!!card.procedure && selectedFormats.includes(card.procedure.type));
      const matchPhase = selectedPhases.length === 0 || (!!card.procedure && selectedPhases.includes(card.procedure.theme));
      const matchIntensite =
        selectedIntensites.length === 0 ||
        (!!card.procedure?.intensite && selectedIntensites.includes(card.procedure.intensite));
      const matchPrincipes =
        selectedPrincipes.length === 0 ||
        (card.procedure?.principes || []).some((x) => selectedPrincipes.includes(x));

      if (!matchBloc || !matchFormat || !matchPhase || !matchIntensite || !matchPrincipes) return false;
      if (q.length === 0) return true;

      const p = card.procedure;
      return (
        card.title.toLowerCase().includes(q) ||
        (card.theme?.toLowerCase().includes(q) ?? false) ||
        (p?.objectives.toLowerCase().includes(q) ?? false) ||
        (p?.instructions?.toLowerCase().includes(q) ?? false) ||
        (p?.principes || []).some((x) => x.toLowerCase().includes(q)) ||
        (p?.scoring || []).some((x) => x.toLowerCase().includes(q)) ||
        (p?.comportements || []).some((x) => x.toLowerCase().includes(q)) ||
        (p?.variables_plus || []).some((x) => x.toLowerCase().includes(q)) ||
        (p?.variables_moins || []).some((x) => x.toLowerCase().includes(q)) ||
        (p?.mecanismes || []).some((m) => m.regle.toLowerCase().includes(q) || m.induit.toLowerCase().includes(q)) ||
        (p?.rapport_numerique?.toLowerCase().includes(q) ?? false) ||
        (p?.question_debriefing?.toLowerCase().includes(q) ?? false)
      );
    },
    [activeBloc, selectedFormats, selectedPhases, selectedIntensites, selectedPrincipes],
  );
```

- [ ] **Step 2: Ajouter l'état des filtres avancés et les imports**

En haut du fichier, étendre les imports :

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, Alert, TextInput, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { Screen, Text, EmptyState } from '../../../components/ui';
import { ProcedureCard } from '../../../components/tactics/ProcedureCard';
import { FilterChip } from '../../../components/tactics/FilterChip';
import { NewFolderSheet } from '../../../components/tactics/NewFolderSheet';
import { BLOCS, FORMATS, PHASES_DE_JEU, INTENSITES } from '../../../lib/tactics/procedureTaxonomy';
import { createFolder, getFoldersByClub, type SchematicFolderRecord } from '../../../lib/services/schematicFoldersService';
import {
  getFullLibraryByClub,
  archiveProcedure,
  type LibraryCard,
} from '../../../lib/services/trainingProceduresService';
import { deleteSchematic } from '../../../lib/services/schematicsService';
import type { TrainingProcedureType, TrainingProcedureTheme, TrainingProcedureIntensite } from '../../../lib/services/trainingProceduresService';
```

Juste après les états existants (après `const [loading, setLoading] = useState(true);`, ligne 40), ajouter :

```tsx
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedFormats, setSelectedFormats] = useState<TrainingProcedureType[]>([]);
  const [selectedPhases, setSelectedPhases] = useState<TrainingProcedureTheme[]>([]);
  const [selectedIntensites, setSelectedIntensites] = useState<TrainingProcedureIntensite[]>([]);
  const [selectedPrincipes, setSelectedPrincipes] = useState<string[]>([]);
```

- [ ] **Step 3: `availablePrincipes`, compteur de filtres, réinitialisation, suppression**

Après le bloc `handleCreateFolder` (ligne 88), ajouter :

```tsx
  const availablePrincipes = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((card) => (card.procedure?.principes || []).forEach((x) => x && set.add(x)));
    return Array.from(set).sort();
  }, [cards]);

  const advancedFilterCount =
    selectedFormats.length + selectedPhases.length + selectedIntensites.length + selectedPrincipes.length;

  const resetAdvancedFilters = () => {
    setSelectedFormats([]);
    setSelectedPhases([]);
    setSelectedIntensites([]);
    setSelectedPrincipes([]);
  };

  const toggleFilter = <T,>(list: T[], setList: (v: T[]) => void, value: T) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const handleDeleteCard = useCallback((card: LibraryCard) => {
    const label = card.title || 'sans titre';
    if (card.kind === 'procedure' && card.procedure) {
      Alert.alert('Supprimer ce procédé ?', `« ${label} » disparaîtra de la bibliothèque. Le schéma dessiné, s'il y en a un, n'est pas supprimé.`, [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveProcedure(card.procedure!.id);
              setCards((prev) => prev.filter((c) => c.key !== card.key));
            } catch (err) {
              Alert.alert('Erreur', err instanceof Error ? err.message : 'Impossible de supprimer ce procédé.');
            }
          },
        },
      ]);
    } else if (card.schematic) {
      Alert.alert('Supprimer ce schéma ?', `« ${label} » sera supprimé définitivement. Cette action est irréversible.`, [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSchematic(card.schematic!.id);
              setCards((prev) => prev.filter((c) => c.key !== card.key));
            } catch (err) {
              Alert.alert('Erreur', err instanceof Error ? err.message : 'Impossible de supprimer ce schéma.');
            }
          },
        },
      ]);
    }
  }, []);
```

- [ ] **Step 4: Panneau de filtres avancés dans le JSX + `onDelete` sur les cartes**

Juste après la ligne du bloc `filterRow` existant (chips Bloc, lignes 126-131), ajouter le bouton et le panneau :

```tsx
      <View style={s.advancedRow}>
        <Pressable
          onPress={() => setShowAdvancedFilters((v) => !v)}
          style={[
            s.advancedBtn,
            {
              backgroundColor: advancedFilterCount > 0 ? c.accent.subtle : c.bg.surface,
              borderColor: advancedFilterCount > 0 ? c.accent.border : c.border.subtle,
            },
          ]}
        >
          <Ionicons name="options-outline" size={15} color={advancedFilterCount > 0 ? c.accent.default : c.text.secondary} />
          <Text variant="callout" weight="600" tone={advancedFilterCount > 0 ? 'accent' : 'secondary'}>
            Filtres
          </Text>
          {advancedFilterCount > 0 && (
            <View style={[s.advancedBadge, { backgroundColor: c.accent.fill }]}>
              <Text variant="caption" tone="onFill" numeric>
                {advancedFilterCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      {showAdvancedFilters && (
        <View style={[s.filterPanel, { backgroundColor: c.bg.sunken, borderColor: c.border.subtle }]}>
          <Text variant="caption" tone="tertiary" weight="600">FORMAT</Text>
          <View style={s.chipRow}>
            {FORMATS.map((f) => (
              <FilterChip key={f} label={f} active={selectedFormats.includes(f)} onPress={() => toggleFilter(selectedFormats, setSelectedFormats, f)} />
            ))}
          </View>
          <Text variant="caption" tone="tertiary" weight="600">PHASE DE JEU</Text>
          <View style={s.chipRow}>
            {PHASES_DE_JEU.map((p) => (
              <FilterChip key={p} label={p} active={selectedPhases.includes(p)} onPress={() => toggleFilter(selectedPhases, setSelectedPhases, p)} />
            ))}
          </View>
          <Text variant="caption" tone="tertiary" weight="600">INTENSITÉ</Text>
          <View style={s.chipRow}>
            {INTENSITES.map((i) => (
              <FilterChip key={i} label={i} active={selectedIntensites.includes(i)} onPress={() => toggleFilter(selectedIntensites, setSelectedIntensites, i)} />
            ))}
          </View>
          {availablePrincipes.length > 0 && (
            <>
              <Text variant="caption" tone="tertiary" weight="600">PRINCIPES</Text>
              <View style={s.chipRow}>
                {availablePrincipes.map((p) => (
                  <FilterChip key={p} label={p} active={selectedPrincipes.includes(p)} onPress={() => toggleFilter(selectedPrincipes, setSelectedPrincipes, p)} />
                ))}
              </View>
            </>
          )}
          {advancedFilterCount > 0 && (
            <Pressable onPress={resetAdvancedFilters}>
              <Text variant="caption" tone="accent">Réinitialiser les filtres</Text>
            </Pressable>
          )}
        </View>
      )}
```

Puis, sur les deux occurrences de `<ProcedureCard key={card.key} card={card} onPress={() => openCard(card)} />` (lignes ~139 et ~188), ajouter `onDelete` :

```tsx
              <ProcedureCard key={card.key} card={card} onPress={() => openCard(card)} onDelete={() => handleDeleteCard(card)} />
```

- [ ] **Step 5: Styles**

Dans `useStyles` (fin du fichier), ajouter :

```tsx
  advancedRow: { marginBottom: t.space.md },
  advancedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: t.space.xs,
    minHeight: 36,
    borderRadius: t.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: t.space.md,
  },
  advancedBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: t.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: t.radius.md,
    padding: t.space.md,
    gap: t.space.sm,
    marginBottom: t.space.lg,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
```

- [ ] **Step 6: Vérifier et committer**

Run: `cd mobile && npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur.

```bash
git add mobile/app/\(tabs\)/library/index.tsx
git commit -m "feat(mobile): recherche plein-contenu, filtres avancés et suppression dans la bibliothèque"
```

---

## Task 5: Assembleur de séance — modèle, composants et écrans (réécriture complète)

Unité atomique : le service, les constantes de taxonomie, les 4 composants et les 2 écrans se référencent mutuellement sur le nouveau modèle. Les découper en tâches séparées laisserait `tsc` cassé entre deux commits (interdit par les contraintes globales) — un seul commit en fin de tâche.

**Files:**
- Modify (réécriture complète) : `mobile/lib/services/sessionsService.ts`
- Create: `mobile/lib/tactics/sessionBlocks.ts`
- Create: `mobile/components/tactics/SessionTimeline.tsx`
- Create: `mobile/components/tactics/SessionBlockCard.tsx`
- Create: `mobile/components/tactics/AddBlockSheet.tsx`
- Create: `mobile/components/tactics/SessionCard.tsx`
- Create: `mobile/components/tactics/AttachTrainingSheet.tsx`
- Modify (réécriture complète) : `mobile/components/training/ProcedurePickerSheet.tsx`
- Modify (réécriture complète) : `mobile/app/(tabs)/sessions/index.tsx`
- Modify (réécriture complète) : `mobile/app/(tabs)/sessions/[sessionId].tsx`

**Interfaces:**
- Consumes: `getTrainingsByTeamIds`/`setTrainingSession` (Task 1), `getTeamsByClubId` (déjà existant, `mobile/lib/services/teams.ts`).
- Produces: aucun autre écran mobile ne dépend de `sessionsService.ts` — vérifié (seuls `sessions/index.tsx` et `sessions/[sessionId].tsx` l'importent).

### Step 1: Réécrire `sessionsService.ts` (nouveau modèle à 6 blocs)

Remplacer tout le contenu de `mobile/lib/services/sessionsService.ts`, miroir du web (`lib/services/sessionsService.ts`) adapté au style fonctions libres déjà en place côté mobile :

```ts
import { supabase } from '../supabase';

/**
 * Miroir mobile de lib/services/sessionsService.ts (web) — même table
 * training_sessions, même modèle à 6 blocs (trame futsal-coach : Échauffement
 * ludique / Problématisation / Situation isolée [cœur] / Analytique optionnel /
 * Jeu orienté / Match libre), portée club (pas équipe).
 */

export type SessionBlockType =
  | 'Echauffement'
  | 'Problematisation'
  | 'Situation'
  | 'Analytique'
  | 'JeuOriente'
  | 'MatchLibre';

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

/** Mappe les anciens types de bloc (tranche 1, avant le rework 2026-09-22) vers la nouvelle trame — mêmes règles que le web. */
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

/** Migre l'ancien SessionMeta (theme/objectif/phaseCible/intensite/philosophyTags) vers le nouveau — les anciennes séances gardent leur `theme` comme principe de secours. */
function normalizeSessionMeta(raw: unknown): SessionMeta {
  const m = (raw ?? {}) as Record<string, unknown>;
  const dureeTotaleMin = typeof m.dureeTotaleMin === 'number' ? m.dureeTotaleMin : 0;
  if (typeof m.principe === 'string') {
    return {
      principe: m.principe,
      moyen: typeof m.moyen === 'string' ? m.moyen : undefined,
      theme: typeof m.theme === 'string' ? m.theme : undefined,
      phase: m.phase as LearningPhase | undefined,
      effectif: typeof m.effectif === 'string' ? m.effectif : undefined,
      dureeTotaleMin,
    };
  }
  return {
    principe: typeof m.objectif === 'string' ? m.objectif : '',
    theme: typeof m.theme === 'string' ? m.theme : undefined,
    effectif: typeof m.effectif === 'string' ? m.effectif : undefined,
    dureeTotaleMin,
  };
}

export async function getSessionsByClub(clubId: string): Promise<TrainingSessionRecord[]> {
  const { data, error } = await supabase
    .from('training_sessions')
    .select('*')
    .eq('club_id', clubId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, meta: normalizeSessionMeta(r.meta), blocks: normalizeSessionBlocks(r.blocks) }));
}

export async function getSessionById(id: string): Promise<TrainingSessionRecord | null> {
  const { data, error } = await supabase.from('training_sessions').select('*').eq('id', id).single();
  if (error) throw error;
  if (!data) return null;
  return { ...data, meta: normalizeSessionMeta(data.meta), blocks: normalizeSessionBlocks(data.blocks) };
}

export async function saveSession(payload: {
  id?: string | null;
  clubId: string;
  name: string;
  meta: SessionMeta;
  blocks: SessionBlock[];
}): Promise<TrainingSessionRecord> {
  if (payload.id) {
    const { data, error } = await supabase
      .from('training_sessions')
      .update({ name: payload.name, meta: payload.meta, blocks: payload.blocks, updated_at: new Date().toISOString() })
      .eq('id', payload.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('training_sessions')
    .insert({ club_id: payload.clubId, name: payload.name, meta: payload.meta, blocks: payload.blocks })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('training_sessions').delete().eq('id', id);
  if (error) throw error;
}
```

### Step 2: Créer `mobile/lib/tactics/sessionBlocks.ts`

```ts
import type { SessionBlock, SessionBlockType } from '../services/sessionsService';

export interface BlockTypeMeta {
  value: SessionBlockType;
  label: string;
  shortLabel: string;
  /** Couleur de segment de timeline — table dédiée à cette taxonomie fixe à 6 valeurs, même principe que phaseTone/intensiteTone (procedureTaxonomy.ts) mais en couleur directe : la timeline a besoin de 6 teintes distinctes, hors des 5 tons sémantiques du thème. */
  color: string;
  isCore: boolean;
  defaultDuration: number;
}

export const BLOCK_TYPES: BlockTypeMeta[] = [
  { value: 'Echauffement', label: 'Échauffement ludique', shortLabel: 'Échauffement', color: '#94A3B8', isCore: false, defaultDuration: 15 },
  { value: 'Problematisation', label: 'Problématisation', shortLabel: 'Problématisation', color: '#60A5FA', isCore: false, defaultDuration: 15 },
  { value: 'Situation', label: 'Situation isolée', shortLabel: 'Situation', color: '#6C5CE0', isCore: true, defaultDuration: 20 },
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

/** Seed par défaut d'une nouvelle séance — les 6 blocs dans l'ordre, 90 min au total. */
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

### Step 3: Créer `mobile/components/tactics/SessionTimeline.tsx`

```tsx
import { View, StyleSheet } from 'react-native';
import { makeStyles } from '../../contexts/ThemeContext';
import { Text } from '../ui';
import { blockMeta } from '../../lib/tactics/sessionBlocks';
import type { SessionBlock } from '../../lib/services/sessionsService';

/** Barre segmentée proportionnelle aux blocs réellement présents — pas 6 cases fixes, une séance de veille de match n'a que 4 blocs. */
export function SessionTimeline({ blocks }: { blocks: SessionBlock[] }) {
  const s = useStyles();
  const total = blocks.reduce((sum, b) => sum + (b.duration || 0), 0);

  if (blocks.length === 0) {
    return (
      <Text variant="caption" tone="tertiary">
        Ajoute un premier bloc pour voir la timeline de la séance.
      </Text>
    );
  }

  return (
    <View>
      <View style={s.track}>
        {blocks.map((b) => {
          const meta = blockMeta(b.type);
          const pct = total > 0 ? (b.duration / total) * 100 : 0;
          return (
            <View key={b.id} style={[s.segment, { flex: b.duration || 0.001, backgroundColor: meta.color }]}>
              {pct > 12 ? (
                <Text variant="caption" tone="onFill" weight="700" numberOfLines={1}>
                  {b.duration}&apos;
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      <Text variant="caption" tone="tertiary" style={s.caption}>
        {total} min · {blocks.length} bloc{blocks.length > 1 ? 's' : ''}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  track: {
    flexDirection: 'row',
    height: 22,
    borderRadius: t.radius.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border.subtle,
  },
  segment: { alignItems: 'center', justifyContent: 'center' },
  caption: { marginTop: t.space.xs },
}));
```

### Step 4: Créer `mobile/components/tactics/SessionBlockCard.tsx`

```tsx
import { useState } from 'react';
import { View } from 'react-native';
import { makeStyles } from '../../contexts/ThemeContext';
import { Card, Text, Badge, Input, IconButton, Button } from '../ui';
import { blockMeta } from '../../lib/tactics/sessionBlocks';
import type { SessionBlock } from '../../lib/services/sessionsService';
import type { TrainingProcedureRecord } from '../../lib/services/trainingProceduresService';

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

/** Carte compacte : type + durée + réordonnancement sur une ligne, aperçu du procédé, intention pédagogique repliée. */
export function SessionBlockCard({
  block, index, total, procedure, onPatch, onRemove, onMoveUp, onMoveDown, onPickProcedure, onViewSchematic,
}: SessionBlockCardProps) {
  const s = useStyles();
  const [showIntention, setShowIntention] = useState(!!block.intentionPedagogique);
  const meta = blockMeta(block.type);

  return (
    <Card variant={meta.isCore ? 'accent' : 'raised'} padding="md" style={s.card}>
      <View style={s.header}>
        {meta.isCore && <Badge label="Cœur" tone="accent" size="sm" solid />}
        <Text variant="headline" numberOfLines={1} style={s.title}>{meta.label}</Text>
      </View>

      <View style={s.durationRow}>
        <Input
          label="Durée (min)"
          numeric
          keyboardType="number-pad"
          value={String(block.duration || 0)}
          onChangeText={(v) => onPatch({ duration: parseInt(v, 10) || 0 })}
          containerStyle={s.durationField}
        />
        <View style={s.orderActions}>
          <IconButton icon="chevron-up" label="Monter le bloc" variant="plain" size="sm" disabled={index === 0} onPress={onMoveUp} />
          <IconButton icon="chevron-down" label="Descendre le bloc" variant="plain" size="sm" disabled={index === total - 1} onPress={onMoveDown} />
          <IconButton icon="close" label="Retirer le bloc" variant="destructive" size="sm" onPress={onRemove} />
        </View>
      </View>

      <Button
        label={procedure ? (procedure.title || 'Sans titre') : 'Choisir un procédé (optionnel)'}
        icon="document-text-outline"
        variant="secondary"
        onPress={onPickProcedure}
        block
      />

      {procedure?.schematic_id && onViewSchematic ? (
        <Button
          label="Voir le schéma"
          icon="albums-outline"
          variant="ghost"
          size="sm"
          onPress={() => onViewSchematic(procedure.schematic_id as string)}
        />
      ) : null}

      {showIntention ? (
        <Input
          label="Intention pédagogique"
          value={block.intentionPedagogique}
          onChangeText={(v) => onPatch({ intentionPedagogique: v })}
          placeholder="Ce que ce bloc doit produire"
          multiline
          optional
        />
      ) : (
        <Button label="+ Intention pédagogique (optionnel)" variant="ghost" size="sm" onPress={() => setShowIntention(true)} />
      )}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  title: { flex: 1 },
  durationRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: t.space.sm },
  durationField: { width: 110 },
  orderActions: { flexDirection: 'row', gap: t.space.xs },
}));
```

### Step 5: Créer `mobile/components/tactics/AddBlockSheet.tsx`

```tsx
import { View, Pressable } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, Text } from '../ui';
import { BLOCK_TYPES } from '../../lib/tactics/sessionBlocks';
import type { SessionBlockType } from '../../lib/services/sessionsService';

/** Choix du type de bloc à ajouter — 6 types, aucun verrouillé ni unique (trame librement modifiable). */
export function AddBlockSheet({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (type: SessionBlockType) => void;
}) {
  const { theme } = useTheme();

  return (
    <Sheet visible={visible} onClose={onClose} title="Ajouter un bloc" maxHeight="60%">
      <View style={{ gap: theme.space.sm }}>
        {BLOCK_TYPES.map((t) => (
          <Pressable
            key={t.value}
            onPress={() => {
              onAdd(t.value);
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space.sm,
              minHeight: 48,
              borderRadius: theme.radius.sm,
              paddingHorizontal: theme.space.md,
              backgroundColor: theme.colors.bg.surface,
              borderWidth: 1,
              borderColor: theme.colors.border.subtle,
            }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.color }} />
            <Text variant="headline">{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
```

### Step 6: Créer `mobile/components/tactics/SessionCard.tsx`

```tsx
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { makeStyles } from '../../contexts/ThemeContext';
import { Card, Text, IconButton } from '../ui';
import { SessionTimeline } from './SessionTimeline';
import type { TrainingSessionRecord } from '../../lib/services/sessionsService';
import type { Training } from '../../types';

export interface SessionCardProps {
  session: TrainingSessionRecord;
  attachedTrainings: Training[];
  teamNameById: Map<string, string>;
  onOpen: () => void;
  onDelete: () => void;
}

function formatShortDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/** Carte de la liste des séances — timeline miniature + statut de rattachement. */
export function SessionCard({ session, attachedTrainings, teamNameById, onOpen, onDelete }: SessionCardProps) {
  const s = useStyles();

  return (
    <Card variant="raised" padding="md" onPress={onOpen} accessibilityLabel={session.name || 'Sans titre'} style={s.card}>
      <View style={s.headerRow}>
        <View style={s.headerText}>
          <Text variant="headline" numberOfLines={1}>{session.name || 'Sans titre'}</Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {session.meta?.principe || session.meta?.theme || 'Aucun principe précisé'}
          </Text>
        </View>
        <IconButton icon="trash-outline" label="Supprimer la séance" variant="destructive" size="sm" onPress={onDelete} />
      </View>

      <SessionTimeline blocks={session.blocks} />

      {attachedTrainings.length > 0 && (
        <View style={s.attachRow}>
          {attachedTrainings.map((t) => (
            <View key={t.id} style={s.attachChip}>
              <Ionicons name="calendar-outline" size={12} color="#2563EB" />
              <Text variant="caption" style={s.attachText} numberOfLines={1}>
                {formatShortDate(t.date)} · {teamNameById.get(t.team_id || '') || '—'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.sm },
  headerText: { flex: 1, gap: 2 },
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  attachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: t.space.sm,
    paddingVertical: 3,
    borderRadius: t.radius.pill,
    backgroundColor: '#EFF6FF',
  },
  attachText: { color: '#1D4ED8' },
}));
```

Note : `#EFF6FF`/`#1D4ED8`/`#2563EB` sont les mêmes valeurs fixes que la puce de rattachement web (`SessionCard.tsx` web, bleu "rattaché au calendrier") — teinte dédiée à ce badge précis, hors de la rampe sémantique à 5 tons (même exception scoping que `sessionBlocks.ts`), pas une couleur choisie au hasard dans l'écran.

### Step 7: Créer `mobile/components/tactics/AttachTrainingSheet.tsx`

```tsx
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, Text, Card, Input, EmptyState } from '../ui';
import type { Training } from '../../types';

export interface AttachTrainingSheetProps {
  visible: boolean;
  trainings: Training[];
  teamNameById: Map<string, string>;
  onSelect: (trainingId: string) => void;
  onClose: () => void;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/** Rattache la séance à un entraînement existant, toutes équipes du club confondues — n'affiche que les entraînements pas encore rattachés à une autre séance. */
export function AttachTrainingSheet({ visible, trainings, teamNameById, onSelect, onClose }: AttachTrainingSheetProps) {
  const { theme } = useTheme();
  const [search, setSearch] = useState('');

  const available = useMemo(() => trainings.filter((t) => !t.session_id), [trainings]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (t) =>
        (t.theme || '').toLowerCase().includes(q) ||
        (teamNameById.get(t.team_id || '') || '').toLowerCase().includes(q) ||
        formatDate(t.date).toLowerCase().includes(q),
    );
  }, [available, search, teamNameById]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Rattacher à un entraînement" maxHeight="80%">
      <Input
        label="Rechercher"
        value={search}
        onChangeText={setSearch}
        placeholder="Date, thème, équipe…"
        containerStyle={{ marginBottom: theme.space.md }}
      />
      {filtered.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Aucun entraînement disponible"
          description={
            available.length === 0
              ? 'Tous les entraînements ont déjà une séance rattachée.'
              : 'Aucun entraînement ne correspond à cette recherche.'
          }
          compact
        />
      ) : (
        <View style={{ gap: theme.space.sm }}>
          {filtered.map((t) => (
            <Card
              key={t.id}
              variant="flat"
              padding="md"
              onPress={() => {
                onSelect(t.id);
                onClose();
              }}
              accessibilityLabel={formatDate(t.date)}
              style={{ gap: theme.space.xs }}
            >
              <Text variant="headline" numberOfLines={1}>{formatDate(t.date)}</Text>
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {teamNameById.get(t.team_id || '') || 'Équipe inconnue'}{t.theme ? ` · ${t.theme}` : ''}
              </Text>
            </Card>
          ))}
        </View>
      )}
    </Sheet>
  );
}
```

### Step 8: Réécrire `mobile/components/training/ProcedurePickerSheet.tsx` (recherche + filtres avancés)

```tsx
import { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { Sheet, Card, Text, Badge, EmptyState, Input } from '../ui';
import { FilterChip } from '../tactics/FilterChip';
import { FORMATS, PHASES_DE_JEU, INTENSITES } from '../../lib/tactics/procedureTaxonomy';
import type {
  TrainingProcedureRecord,
  TrainingProcedureType,
  TrainingProcedureTheme,
  TrainingProcedureIntensite,
} from '../../lib/services/trainingProceduresService';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Choix d'un procédé (fiche pédagogique) pour un bloc de séance — miroir de
 * ProcedurePickerDialog.tsx côté web : recherche texte + filtres à facettes
 * (type/thème/intensité/principes) repliés par défaut.
 */
export function ProcedurePickerSheet({
  visible,
  onClose,
  procedures,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  procedures: TrainingProcedureRecord[];
  onSelect: (procedureId: string) => void;
}) {
  const { theme } = useTheme();
  const s = useStyles();
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [types, setTypes] = useState<TrainingProcedureType[]>([]);
  const [themes, setThemes] = useState<TrainingProcedureTheme[]>([]);
  const [intensites, setIntensites] = useState<TrainingProcedureIntensite[]>([]);
  const [principes, setPrincipes] = useState<string[]>([]);

  const availablePrincipes = useMemo(() => {
    const set = new Set<string>();
    procedures.forEach((p) => (p.principes || []).forEach((x) => x && set.add(x)));
    return Array.from(set).sort();
  }, [procedures]);

  const activeFilterCount = types.length + themes.length + intensites.length + principes.length;

  const filtered = useMemo(() => {
    const q = norm(search);
    return procedures.filter((p) => {
      if (types.length && !types.includes(p.type)) return false;
      if (themes.length && !themes.includes(p.theme)) return false;
      if (intensites.length && (!p.intensite || !intensites.includes(p.intensite))) return false;
      if (principes.length && !(p.principes || []).some((x) => principes.includes(x))) return false;
      if (q && !norm(p.title).includes(q) && !norm(p.theme || '').includes(q)) return false;
      return true;
    });
  }, [procedures, search, types, themes, intensites, principes]);

  const resetFilters = () => {
    setTypes([]);
    setThemes([]);
    setIntensites([]);
    setPrincipes([]);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Choisir un procédé" maxHeight="85%">
      <View style={s.searchRow}>
        <Input label="Rechercher" value={search} onChangeText={setSearch} placeholder="Titre, phase de jeu…" containerStyle={s.searchField} />
        <Pressable
          onPress={() => setShowFilters((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Filtres"
          style={[s.filterBtn, { borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.bg.surface }]}
        >
          <Ionicons name="options-outline" size={18} color={theme.colors.text.secondary} />
          {activeFilterCount > 0 && (
            <View style={[s.filterBadge, { backgroundColor: theme.colors.accent.fill }]}>
              <Text variant="caption" tone="onFill" numeric>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {showFilters && (
        <View style={[s.filterPanel, { backgroundColor: theme.colors.bg.sunken, borderColor: theme.colors.border.subtle }]}>
          <Text variant="caption" tone="tertiary" weight="600">TYPE</Text>
          <View style={s.chipRow}>
            {FORMATS.map((t) => (
              <FilterChip key={t} label={t} active={types.includes(t)} onPress={() => setTypes(toggle(types, t))} />
            ))}
          </View>
          <Text variant="caption" tone="tertiary" weight="600">PHASE DE JEU</Text>
          <View style={s.chipRow}>
            {PHASES_DE_JEU.map((t) => (
              <FilterChip key={t} label={t} active={themes.includes(t)} onPress={() => setThemes(toggle(themes, t))} />
            ))}
          </View>
          <Text variant="caption" tone="tertiary" weight="600">INTENSITÉ</Text>
          <View style={s.chipRow}>
            {INTENSITES.map((t) => (
              <FilterChip key={t} label={t} active={intensites.includes(t)} onPress={() => setIntensites(toggle(intensites, t))} />
            ))}
          </View>
          {availablePrincipes.length > 0 && (
            <>
              <Text variant="caption" tone="tertiary" weight="600">PRINCIPES</Text>
              <View style={s.chipRow}>
                {availablePrincipes.map((p) => (
                  <FilterChip key={p} label={p} active={principes.includes(p)} onPress={() => setPrincipes(toggle(principes, p))} />
                ))}
              </View>
            </>
          )}
          {activeFilterCount > 0 && (
            <Pressable onPress={resetFilters}>
              <Text variant="caption" tone="accent">Réinitialiser les filtres</Text>
            </Pressable>
          )}
        </View>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon="document-text-outline" title="Aucun procédé" description="Essaie un autre titre ou élargis les filtres." compact />
      ) : (
        <View style={{ gap: theme.space.sm }}>
          {filtered.map((p) => (
            <Card
              key={p.id}
              variant="flat"
              padding="md"
              onPress={() => {
                onSelect(p.id);
                onClose();
              }}
              accessibilityLabel={p.title || 'Sans titre'}
              style={{ gap: theme.space.xs }}
            >
              <Text variant="headline" numberOfLines={1}>{p.title || 'Sans titre'}</Text>
              <View style={{ flexDirection: 'row', gap: theme.space.xs, flexWrap: 'wrap' }}>
                <Badge label={p.type} tone="neutral" size="sm" />
                <Badge label={p.theme} tone="neutral" size="sm" />
                {p.intensite && <Badge label={p.intensite} tone="neutral" size="sm" />}
              </View>
            </Card>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((t) => ({
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: t.space.sm, marginBottom: t.space.md },
  searchField: { flex: 1 },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: t.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterPanel: {
    borderWidth: 1,
    borderRadius: t.radius.md,
    padding: t.space.md,
    gap: t.space.sm,
    marginBottom: t.space.md,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
}));
```

### Step 9: Réécrire `mobile/app/(tabs)/sessions/index.tsx`

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, makeStyles } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { Screen, Text, Button, EmptyState, Input } from '../../../components/ui';
import { FilterChip } from '../../../components/tactics/FilterChip';
import { SessionCard } from '../../../components/tactics/SessionCard';
import {
  getSessionsByClub,
  deleteSession,
  type TrainingSessionRecord,
  type LearningPhase,
} from '../../../lib/services/sessionsService';
import { getTrainingsByTeamIds, setTrainingSession } from '../../../lib/services/trainings';
import { getTeamsByClubId } from '../../../lib/services/teams';
import type { Training } from '../../../types';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const PHASE_FILTERS: { value: LearningPhase | ''; label: string }[] = [
  { value: '', label: 'Toutes' },
  { value: 'Phase 1', label: 'Phase 1' },
  { value: 'Phase 2', label: 'Phase 2' },
  { value: 'Mix', label: 'Mix' },
];

/** Liste des séances du club (portée club, pas équipe — cf sessionsService.ts). */
export default function SessionsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const s = useStyles();
  const { activeTeam } = useActiveTeam();

  const [sessions, setSessions] = useState<TrainingSessionRecord[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [teamNameById, setTeamNameById] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<LearningPhase | ''>('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const clubId = activeTeam?.club_id;
    if (!clubId) return;
    setLoading(true);
    try {
      const teams = await getTeamsByClubId(clubId);
      setTeamNameById(new Map(teams.map((t) => [t.id, t.name])));
      const [sess, trs] = await Promise.all([getSessionsByClub(clubId), getTrainingsByTeamIds(teams.map((t) => t.id))]);
      setSessions(sess);
      setTrainings(trs);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Chargement des séances impossible');
    } finally {
      setLoading(false);
    }
  }, [activeTeam?.club_id]);

  useEffect(() => {
    load();
  }, [load]);

  const trainingsBySessionId = useMemo(() => {
    const map = new Map<string, Training[]>();
    for (const t of trainings) {
      if (!t.session_id) continue;
      const list = map.get(t.session_id) || [];
      list.push(t);
      map.set(t.session_id, list);
    }
    return map;
  }, [trainings]);

  const visibleSessions = useMemo(() => {
    let list = sessions;
    if (phaseFilter) list = list.filter((se) => se.meta?.phase === phaseFilter);
    const q = norm(search);
    if (q) {
      list = list.filter(
        (se) =>
          norm(se.name || '').includes(q) ||
          norm(se.meta?.principe || '').includes(q) ||
          norm(se.meta?.moyen || '').includes(q) ||
          norm(se.meta?.theme || '').includes(q),
      );
    }
    return list;
  }, [sessions, search, phaseFilter]);

  const handleDelete = useCallback(
    (id: string, name: string) => {
      Alert.alert('Supprimer la séance ?', `« ${name || 'sans titre'} » sera supprimée définitivement.`, [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSession(id);
              await load();
            } catch (err) {
              Alert.alert('Erreur', err instanceof Error ? err.message : 'Échec de la suppression.');
            }
          },
        },
      ]);
    },
    [load],
  );

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={s.center}>
          <ActivityIndicator color={theme.colors.accent.default} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <Button label="Nouvelle séance" icon="add" onPress={() => router.push('/(tabs)/sessions/new' as never)} block style={s.newBtn} />

      <Input label="Rechercher" value={search} onChangeText={setSearch} placeholder="Nom, principe, moyen, thème…" containerStyle={s.searchField} />

      <View style={s.filterRow}>
        {PHASE_FILTERS.map((f) => (
          <FilterChip key={f.value} active={phaseFilter === f.value} label={f.label} onPress={() => setPhaseFilter(f.value)} />
        ))}
      </View>

      {visibleSessions.length === 0 ? (
        <EmptyState
          icon="list-outline"
          title={sessions.length === 0 ? 'Aucune séance' : 'Aucun résultat'}
          description={
            sessions.length === 0
              ? 'Assemble ta première séance à partir des procédés du club.'
              : 'Essaie un autre mot-clé ou une autre phase.'
          }
        />
      ) : (
        <View style={s.list}>
          {visibleSessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              attachedTrainings={trainingsBySessionId.get(session.id) || []}
              teamNameById={teamNameById}
              onOpen={() => router.push(`/(tabs)/sessions/${session.id}` as never)}
              onDelete={() => handleDelete(session.id, session.name)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  newBtn: { marginBottom: t.space.lg },
  searchField: { marginBottom: t.space.md },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, marginBottom: t.space.lg },
  list: { gap: t.space.md },
}));
```

`setTrainingSession` est importé mais pas encore utilisé dans cet écran (le rattachement se fait depuis l'éditeur, Step 10) — retirer cet import s'il n'est pas utilisé pour éviter un avertissement `noUnusedLocals` s'il est actif dans `tsconfig.json` (vérifier au Step 11 ; sinon le laisser, il ne casse pas `tsc` seul).

### Step 10: Réécrire `mobile/app/(tabs)/sessions/[sessionId].tsx`

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { useIsTablet, LAYOUT } from '../../../hooks/useIsTablet';
import { Screen, Text, Button, Card, Section, Input, ChipGroup, HeaderBackButton, BackLink, type ChipOption } from '../../../components/ui';
import { ProcedurePickerSheet } from '../../../components/training/ProcedurePickerSheet';
import { SessionTimeline } from '../../../components/tactics/SessionTimeline';
import { SessionBlockCard } from '../../../components/tactics/SessionBlockCard';
import { AddBlockSheet } from '../../../components/tactics/AddBlockSheet';
import { AttachTrainingSheet } from '../../../components/tactics/AttachTrainingSheet';
import { buildDefaultBlocks, newBlock } from '../../../lib/tactics/sessionBlocks';
import {
  getSessionById,
  saveSession,
  type SessionBlock,
  type SessionBlockType,
  type SessionMeta,
  type LearningPhase,
} from '../../../lib/services/sessionsService';
import { getProceduresByClub, type TrainingProcedureRecord } from '../../../lib/services/trainingProceduresService';
import { getTrainingsByTeamIds, setTrainingSession } from '../../../lib/services/trainings';
import { getTeamsByClubId } from '../../../lib/services/teams';
import type { Training } from '../../../types';

const PHASE_OPTIONS: readonly ChipOption<LearningPhase | ''>[] = [
  { value: '', label: 'Non précisé' },
  { value: 'Phase 1', label: 'Phase 1' },
  { value: 'Phase 2', label: 'Phase 2' },
  { value: 'Mix', label: 'Mix' },
];

function emptyMeta(): SessionMeta {
  return { principe: '', dureeTotaleMin: 0 };
}

function formatShortDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Assembleur de séance — modèle à 6 blocs (trame futsal-coach), timeline
 * segmentée, rattachement au calendrier, sélecteur de procédé avec filtres.
 * Réordonnancement par boutons monter/descendre uniquement (pas de drag,
 * décision accessibilité).
 */
export default function SessionEditorScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { theme } = useTheme();
  const isTablet = useIsTablet();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { activeTeam } = useActiveTeam();

  const isNew = sessionId === 'new';
  const [recordId, setRecordId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [meta, setMeta] = useState<SessionMeta>(emptyMeta());
  const [blocks, setBlocks] = useState<SessionBlock[]>([]);
  const [procedures, setProcedures] = useState<TrainingProcedureRecord[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [teamNameById, setTeamNameById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [pickerForBlock, setPickerForBlock] = useState<string | null>(null);
  const [addBlockOpen, setAddBlockOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      title: 'Assembleur de séance',
      headerLeft: () => <HeaderBackButton onPress={() => router.back()} />,
    });
  }, [navigation, router]);

  const loadTrainings = useCallback(async (clubId: string) => {
    const teams = await getTeamsByClubId(clubId);
    setTeamNameById(new Map(teams.map((t) => [t.id, t.name])));
    setTrainings(await getTrainingsByTeamIds(teams.map((t) => t.id)));
  }, []);

  useEffect(() => {
    const clubId = activeTeam?.club_id;
    if (!clubId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [procs, existing] = await Promise.all([
          getProceduresByClub(clubId),
          isNew ? Promise.resolve(null) : getSessionById(sessionId),
          loadTrainings(clubId),
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
        Alert.alert('Erreur', err instanceof Error ? err.message : 'Chargement impossible');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTeam?.club_id, isNew, sessionId, loadTrainings]);

  const attachedTrainings = useMemo(
    () => (recordId ? trainings.filter((t) => t.session_id === recordId) : []),
    [trainings, recordId],
  );

  const handleAttach = useCallback(
    async (trainingId: string) => {
      try {
        await setTrainingSession(trainingId, recordId);
        if (activeTeam?.club_id) await loadTrainings(activeTeam.club_id);
      } catch (err) {
        Alert.alert('Erreur', err instanceof Error ? err.message : 'Échec du rattachement.');
      }
    },
    [recordId, activeTeam?.club_id, loadTrainings],
  );

  const handleDetach = useCallback(
    async (trainingId: string) => {
      try {
        await setTrainingSession(trainingId, null);
        if (activeTeam?.club_id) await loadTrainings(activeTeam.club_id);
      } catch (err) {
        Alert.alert('Erreur', err instanceof Error ? err.message : 'Échec du détachement.');
      }
    },
    [activeTeam?.club_id, loadTrainings],
  );

  const procedureById = useMemo(() => new Map(procedures.map((p) => [p.id, p])), [procedures]);
  const totalMin = useMemo(() => blocks.reduce((sum, b) => sum + (b.duration || 0), 0), [blocks]);

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
      Alert.alert('Nom manquant', 'Donne un nom à la séance avant d’enregistrer.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveSession({
        id: recordId,
        clubId: activeTeam.club_id,
        name: name.trim(),
        meta: { ...meta, dureeTotaleMin: totalMin },
        blocks,
      });
      setRecordId(saved.id);
      setJustSaved(true);
      if (isNew) router.replace(`/(tabs)/sessions/${saved.id}` as never);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : "Échec de l'enregistrement de la séance");
    } finally {
      setSaving(false);
    }
  }, [activeTeam?.club_id, name, meta, blocks, recordId, totalMin, isNew, router]);

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(t);
  }, [justSaved]);

  if (loading) {
    return (
      <Screen scroll={false}>
        {isTablet && <BackLink onPress={() => router.back()} />}
        <View style={s.center}>
          <ActivityIndicator color={theme.colors.accent.default} />
        </View>
      </Screen>
    );
  }

  const pickerBlock = blocks.find((b) => b.id === pickerForBlock) ?? null;

  return (
    <View style={[s.root, { backgroundColor: theme.colors.bg.canvas }]}>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {isTablet && <BackLink onPress={() => router.back()} />}

        <Input label="Nom de la séance" value={name} onChangeText={setName} placeholder="Ex : Semaine 3 — sortie de pression" />

        <Section title="Détails">
          <View style={s.metaRow}>
            <Input label="Principe servi" value={meta.principe} onChangeText={(v) => setMeta((m) => ({ ...m, principe: v }))} containerStyle={s.metaField} placeholder="Ex : Supériorité collective offensive" />
            <Input label="Moyen travaillé" value={meta.moyen ?? ''} onChangeText={(v) => setMeta((m) => ({ ...m, moyen: v }))} containerStyle={s.metaField} optional placeholder="Ex : Dualité meneur → ailier" />
          </View>
          <View style={s.metaRow}>
            <Input label="Thème" value={meta.theme ?? ''} onChangeText={(v) => setMeta((m) => ({ ...m, theme: v }))} containerStyle={s.metaField} optional placeholder="Titre libre" />
            <Input label="Effectif" value={meta.effectif ?? ''} onChangeText={(v) => setMeta((m) => ({ ...m, effectif: v }))} containerStyle={s.metaField} placeholder="Ex : 12 joueurs" />
          </View>
          <ChipGroup
            label="Phase d'apprentissage"
            options={PHASE_OPTIONS}
            value={(meta.phase || '') as LearningPhase | ''}
            onChange={(v) => setMeta((m) => ({ ...m, phase: (v || undefined) as LearningPhase | undefined }))}
          />
          <Text variant="caption" tone="tertiary">
            Durée totale : {totalMin} min ({blocks.length} bloc{blocks.length > 1 ? 's' : ''}) — calculée automatiquement
          </Text>
        </Section>

        <Section title="Rattachement au calendrier">
          {!recordId ? (
            <Text variant="caption" tone="tertiary">
              Enregistre la séance une première fois pour pouvoir la rattacher à un entraînement.
            </Text>
          ) : (
            <View style={s.attachWrap}>
              {attachedTrainings.map((t) => (
                <View key={t.id} style={[s.attachChip, { backgroundColor: theme.colors.accent.subtle, borderColor: theme.colors.accent.border }]}>
                  <Ionicons name="calendar-outline" size={12} color={theme.colors.accent.default} />
                  <Text variant="caption" tone="accent" numberOfLines={1}>
                    {formatShortDate(t.date)} · {teamNameById.get(t.team_id || '') || '—'}
                  </Text>
                  <Ionicons
                    name="close"
                    size={12}
                    color={theme.colors.accent.default}
                    onPress={() => handleDetach(t.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Détacher cet entraînement"
                  />
                </View>
              ))}
              <Button label="Rattacher à un entraînement" icon="link-outline" variant="secondary" size="sm" onPress={() => setAttachOpen(true)} />
            </View>
          )}
        </Section>

        <Section title="Timeline">
          <SessionTimeline blocks={blocks} />
        </Section>

        <Section title="Blocs">
          <View style={s.blocksList}>
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
                onPickProcedure={() => setPickerForBlock(block.id)}
                onViewSchematic={(schematicId) => router.push(`/(tabs)/library/${schematicId}` as never)}
              />
            ))}
          </View>

          <Button label="Ajouter un bloc" icon="add" variant="secondary" onPress={() => setAddBlockOpen(true)} block />
        </Section>
      </ScrollView>

      <View
        style={[
          s.footer,
          { paddingBottom: Math.max(insets.bottom, theme.space.md), maxWidth: isTablet ? LAYOUT.MAX_CONTENT_WIDTH : undefined },
        ]}
      >
        <Button label={justSaved ? 'Enregistré ✓' : 'Enregistrer'} onPress={handleSave} loading={saving} disabled={saving} block />
      </View>

      <ProcedurePickerSheet
        visible={pickerForBlock != null}
        onClose={() => setPickerForBlock(null)}
        procedures={procedures}
        onSelect={(procedureId) => {
          if (pickerBlock) patchBlock(pickerBlock.id, { procedureId });
        }}
      />

      <AddBlockSheet visible={addBlockOpen} onClose={() => setAddBlockOpen(false)} onAdd={addBlock} />

      <AttachTrainingSheet
        visible={attachOpen}
        trainings={trainings}
        teamNameById={teamNameById}
        onSelect={handleAttach}
        onClose={() => setAttachOpen(false)}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: t.space.lg, paddingBottom: t.space.xl, gap: t.space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', gap: t.space.md },
  metaField: { flex: 1 },
  attachWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, alignItems: 'center' },
  attachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: t.space.sm,
    paddingVertical: 4,
    borderRadius: t.radius.pill,
    borderWidth: 1,
  },
  blocksList: { gap: t.space.md, marginBottom: t.space.md },
  footer: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.md,
    backgroundColor: t.colors.bg.surface,
    borderTopWidth: 1,
    borderTopColor: t.colors.border.subtle,
  },
}));
```

Point d'attention : `Ionicons` avec `onPress` direct — vérifier au Step 11 si `Ionicons` accepte `onPress`/`accessibilityRole` (c'est un composant SVG d'`@expo/vector-icons`, généralement compatible `Pressable`-like via `onPress` car il étend les props tactiles de React Native, déjà utilisé ainsi ailleurs dans le repo — cf. `mobile/lib/design/haptics` usages). Si `tsc` ou le rendu signale un souci, remplacer par un `Pressable` enveloppant l'icône (pattern déjà utilisé dans `SessionCard.tsx` de ce même plan pour la cohérence).

### Step 11: Vérifier et committer

Run: `cd mobile && npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur. Si `Ionicons onPress` (Step 10) ou l'import `setTrainingSession` inutilisé (Step 9) remonte une erreur, corriger inline avant de committer (retirer l'import inutilisé, ou remplacer l'icône cliquable par un `Pressable`).

```bash
git add mobile/lib/services/sessionsService.ts mobile/lib/tactics/sessionBlocks.ts mobile/components/tactics/SessionTimeline.tsx mobile/components/tactics/SessionBlockCard.tsx mobile/components/tactics/AddBlockSheet.tsx mobile/components/tactics/SessionCard.tsx mobile/components/tactics/AttachTrainingSheet.tsx mobile/components/training/ProcedurePickerSheet.tsx mobile/app/\(tabs\)/sessions/index.tsx mobile/app/\(tabs\)/sessions/\[sessionId\].tsx
git commit -m "feat(mobile): assembleur de séance sur le modèle à 6 blocs, rattachement calendrier, picker de procédé avec filtres"
```

---

## Task 6: Vérification manuelle (simulateur iOS)

Pas de code — dernier filet avant de considérer le chantier terminé. Repo sans suite de tests (cf. contraintes globales) : c'est la seule vérification fonctionnelle.

- [ ] **Step 1: `tsc` global**

Run: `cd mobile && npx tsc --noEmit -p tsconfig.json`
Expected: 0 erreur.

- [ ] **Step 2: Assembleur de séance (iPhone simulateur)**

- Créer une nouvelle séance : vérifier que les 6 blocs par défaut apparaissent (90 min), que la timeline reflète les durées.
- Retirer 2 blocs, vérifier que la timeline s'adapte (barre proportionnelle, pas de segments vides).
- Ajouter un bloc via `AddBlockSheet`, vérifier le type et la durée par défaut appliqués.
- Choisir un procédé sur un bloc via `ProcedurePickerSheet`, vérifier la recherche texte et au moins un filtre (Type ou Intensité).
- Enregistrer, vérifier que l'écran reste sur l'éditeur (pas de retour à la liste) et que "Rattachement au calendrier" apparaît.
- Rattacher à un entraînement existant, vérifier la chip qui apparaît, puis détacher.
- Retour à la liste, vérifier que la séance apparaît avec sa mini-timeline et sa chip de rattachement (si rattachée), et que la suppression déclenche bien une `Alert.alert` de confirmation.

- [ ] **Step 3: Bibliothèque (iPhone simulateur)**

- Rechercher un terme qui n'apparaît que dans un champ profond d'une fiche (ex. un mot d'`objectives` ou de `principes`, pas le titre) — vérifier que la carte remonte.
- Ouvrir le panneau "Filtres", cocher un Format et une Intensité, vérifier le compteur de badge et le résultat filtré.
- Supprimer une carte de test (procédé et, séparément, un schéma sans fiche si disponible) — vérifier l'`Alert.alert` de confirmation et la disparition de la carte après confirmation.

- [ ] **Step 4: iPad (si le temps le permet)**

Répéter Step 2/3 sur le simulateur iPad — vérifier notamment `BackLink`/layout tablette sur l'éditeur de séance (`isTablet` déjà géré par le code existant, pas de nouveau cas à couvrir, juste à confirmer visuellement).

## Self-Review

**1. Couverture de la spec :** modèle de données (Task 5 Step 1-2) ✓, rattachement calendrier (Task 1 + Task 5 Step 7/10) ✓, écrans assembleur (Task 5 Step 9-10) ✓, composants (Task 5 Step 3-8) ✓, recherche plein-contenu bibliothèque (Task 4 Step 1) ✓, filtres avancés bibliothèque (Task 4 Step 2-5) ✓, suppression bibliothèque (Task 2 + Task 3 + Task 4 Step 3) ✓, hors-scope (dessin, création de fiche, dossiers de séances, drag) — aucune tâche n'y touche, conforme.

**2. Placeholders :** aucun `TBD`/`TODO` dans le code livré ; les deux points d'attention (Step 9 import possiblement inutilisé, Step 10 `Ionicons onPress`) sont des vérifications concrètes avec une correction déjà indiquée, pas des trous.

**3. Cohérence des types :** `SessionBlockType`/`SessionMeta`/`SessionBlock`/`TrainingSessionRecord` définis une seule fois (Task 5 Step 1) et réutilisés à l'identique dans Step 2-10 ; `LibraryCard`/`TrainingProcedureRecord` inchangés (déjà existants) ; `Training.session_id` (Task 1) utilisé de façon cohérente dans Task 5 Step 6, 7, 9, 10.
