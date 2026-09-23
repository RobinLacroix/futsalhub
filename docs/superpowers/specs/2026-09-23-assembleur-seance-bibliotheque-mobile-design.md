# Mobile — parité assembleur de séance + bibliothèque de procédés

**Date :** 2026-09-23
**Origine :** suite de [2026-09-22-assembleur-seance-web-design.md](2026-09-22-assembleur-seance-web-design.md) — le web a été entièrement reconstruit (trame 6 blocs, timeline segmentée, rattachement calendrier, sélecteur de procédé avec filtres avancés) puis la bibliothèque de procédés web a reçu recherche plein-contenu + filtres avancés + suppression. Le mobile a une tranche 1 antérieure à ce rework (services et écrans construits sur l'ancien modèle à 4 types de bloc, sans timeline, sans rattachement, sans filtres). Décision validée avec Robin : porter **les deux** (assembleur + bibliothèque) à parité.
**Statut :** cadrage avant code, à valider avec Robin.

---

## 1. Ce qui existe déjà côté mobile (tranche 1, à faire évoluer, pas à jeter)

- Navigation déjà en place : `mobile/lib/navigation.ts` (`SECONDARY_DESTINATIONS`, entrées `library`/`sessions`) et `mobile/app/(tabs)/_layout.tsx` (`HIDDEN_ROUTES`/`HIDDEN_ROUTE_TITLES`) — **rien à toucher ici**.
- `mobile/app/(tabs)/sessions/index.tsx` (83 lignes) et `[sessionId].tsx` (290 lignes) — écrans à réécrire (ancien modèle).
- `mobile/lib/services/sessionsService.ts` (83 lignes) — ancien `SessionMeta {theme?, phaseCible?, objectif?, effectif?, dureeTotaleMin?, intensite?, philosophyTags?}` et ancien `SessionBlock.type: 'Echauffement'|'Exercice'|'Situation'|'Jeu'` — à réécrire intégralement sur le modèle web.
- `mobile/app/(tabs)/library/index.tsx` (230 lignes) — **déjà callé sur le nouveau modèle Bloc** (6 valeurs, `BLOCS` de `lib/tactics/procedureTaxonomy`) suite au recadrage du 2026-09-22 ; recherche actuelle limitée à `card.title`/`card.theme` (ligne 64-67), pas de filtres avancés, pas de suppression. C'est une évolution, pas une réécriture.
- `mobile/components/tactics/ProcedureCard.tsx` (69 lignes) — carte de grille, pas de bouton supprimer.
- `mobile/components/tactics/FilterChip.tsx`, `mobile/components/ui/Sheet.tsx` — primitives réutilisables telles quelles.
- `mobile/components/training/ProcedurePickerSheet.tsx` (56 lignes) — liste plate, sans recherche ni filtres.
- `mobile/lib/services/trainingProceduresService.ts` / `schematicsService.ts` — aucune fonction de suppression/archivage aujourd'hui.
- `mobile/types/index.ts` `Training` — pas de `session_id`.
- `mobile/lib/services/trainings.ts` — pas d'équivalent `getTrainingsByTeamIds`/`setTrainingSession`. `mobile/lib/services/teams.ts` a déjà `getTeamsByClubId(clubId)`, directement réutilisable.

---

## 2. Partie A — Assembleur de séance mobile

### 2.1 Modèle de données

`mobile/lib/services/sessionsService.ts` réécrit en miroir exact du web (`app/webapp/library/sessions/lib/services/sessionsService.ts` puis `sessionsService.ts` web actuel) :

```ts
export type SessionBlockType = 'Echauffement' | 'Problematisation' | 'Situation' | 'Analytique' | 'JeuOriente' | 'MatchLibre';
export type LearningPhase = 'Phase 1' | 'Phase 2' | 'Mix';
export interface SessionBlock { id: string; type: SessionBlockType; duration: number; procedureId: string | null; intentionPedagogique?: string; }
export interface SessionMeta { principe: string; moyen?: string; theme?: string; phase?: LearningPhase; effectif?: string; dureeTotaleMin: number; }
export interface TrainingSessionRecord { id: string; club_id: string; created_by: string; name: string; meta: SessionMeta; blocks: SessionBlock[]; created_at: string; updated_at: string; }
```

Même `normalizeSessionBlocks(raw: unknown): SessionBlock[]` que le web (map `Echauffement→Echauffement, Exercice→Analytique, Situation→Situation, Jeu→JeuOriente`), appliqué dans `getSessionsByClub`/`getSessionById` — les séances déjà créées via la tranche 1 mobile (ancien modèle) doivent continuer à s'afficher sans migration de données. Fonctions libres (style actuel du fichier, pas un objet service) : `getSessionsByClub`, `getSessionById`, `saveSession`, `deleteSession` — signatures inchangées.

`mobile/lib/tactics/sessionBlocks.ts` (nouveau, miroir de `constants.ts` web) : `BLOCK_TYPES` (6 entrées, mêmes durées par défaut 15/15/20/10/15/15), `blockMeta(type)`, `buildDefaultBlocks()`, `newBlock(type)`.

### 2.2 Rattachement au calendrier

- `mobile/types/index.ts` : ajout `session_id?: string | null;` sur `Training`.
- `mobile/lib/services/trainings.ts` : ajout de `getTrainingsByTeamIds(teamIds: string[]): Promise<Training[]>` (même requête `.in('team_id', teamIds)` que le web) et `setTrainingSession(trainingId: string, sessionId: string | null): Promise<void>`.
- Écran assembleur : charge les trainings du club via `getTeamsByClubId(clubId)` → `getTrainingsByTeamIds(teamIds)`, filtre localement `t.session_id === recordId` pour l'affichage des rattachements, comme le web. Date affichée = celle de l'entraînement rattaché, jamais un champ séparé.
- `AttachTrainingSheet` (nouveau, `mobile/components/tactics/AttachTrainingSheet.tsx`) : `Sheet` listant les trainings **non rattachés** (`!t.session_id`) du club, recherche texte (date/thème/équipe), tap pour rattacher. Miroir de `AttachTrainingDialog.tsx` web, primitives RN.

### 2.3 Écrans

**`sessions/index.tsx`** — liste en cartes (RN `FlatList` ou `ScrollView` + `View` en grille selon ce qu'utilise déjà `library/index.tsx` pour rester cohérent — c'est un flex-wrap, pas de grid CSS natif) :
- Barre de recherche (nom/principe/moyen/thème) + chips de filtre par `LearningPhase` (Toutes/Phase 1/Phase 2/Mix), même logique que `sessions/page.tsx` web.
- Une carte par séance : nom, principe, mini-timeline segmentée (nouveau composant, §2.4), chips de rattachement (date + équipe, avec un bouton retirer), bouton "Rattacher" si aucun, bouton supprimer (icône poubelle) avec `Alert.alert` de confirmation.
- Bouton "Nouvelle séance" → `router.push('/(tabs)/sessions/new')`, déjà le comportement actuel (`sessions/index.tsx` ligne 47) ; `[sessionId].tsx` gère déjà `sessionId === 'new'` comme cas de création, à conserver tel quel.

**`sessions/[sessionId].tsx`** — l'éditeur :
- En-tête : nom (TextInput), principe (obligatoire), moyen, thème, effectif, phase (sélecteur optionnel à 3 valeurs + "non précisé"), durée totale calculée en lecture seule (somme des blocs).
- Section rattachement au calendrier (identique en logique à 2.2), affichée seulement si la séance est déjà enregistrée — même correctif que le web (rester sur l'éditeur après le premier enregistrement pour ne pas perdre l'accès au rattachement à la création).
- `SessionTimeline` (nouveau, §2.4).
- Liste de `SessionBlockCard` (nouveau, §2.4) : type, durée (stepper ou TextInput numérique), procédé lié (ouvre `ProcedurePickerSheet` enrichi, §3), aperçu du procédé (image si `image_url`, sinon icône placeholder), intention pédagogique (TextInput multiline repliable), monter/descendre/retirer.
- `AddBlockMenu` mobile (Sheet ou rangée de boutons — à trancher en implémentation selon l'espace disponible, pas un enjeu de design qui nécessite une décision amont) pour ajouter un des 6 types de bloc.
- Bouton "Enregistrer" fixé en bas (`position: absolute` + `SafeAreaView`, pattern déjà utilisé ailleurs dans le mobile pour les boutons d'action fixes).

### 2.4 Composants nouveaux

- `mobile/components/tactics/SessionTimeline.tsx` — barre segmentée horizontale (`View` avec des segments `flex: block.duration`), une couleur par type de bloc, uniquement les blocs présents (adaptable, pas de trame fixe à 6 segments) — même règle que le web.
- `mobile/components/tactics/SessionBlockCard.tsx` — carte compacte `Card` (déjà dans `components/ui`), badge "Cœur" sur le bloc Situation (couleur accent, pas de nouvelle couleur à inventer — réutiliser `theme.colors.accent.default`).
- Réordonnancement par boutons haut/bas uniquement (pas de drag), pattern déjà tranché dans le cadrage antérieur pour une raison d'accessibilité (WCAG 2.2 AA, alternative single-pointer) — conservé.

---

## 3. Partie B — Bibliothèque de procédés mobile

### 3.1 Recherche plein-contenu (`library/index.tsx`)

`matches()` (ligne 61-71) étendu pour chercher dans tout le contenu de la fiche, miroir du `filteredItems` web (`app/webapp/library/page.tsx`) : titre, `objectives`, `instructions`, `principes[]`, `scoring[]`, `comportements[]`, `variables_plus[]`, `variables_moins[]`, `mecanismes[].regle`/`.induit`, `type`, `theme`, `rapport_numerique`, `question_debriefing`. Ces champs existent déjà côté mobile sur `TrainingProcedureRecord` (confirmé — portés lors du rework bibliothèque mobile plus tôt dans ce chantier).

### 3.2 Filtres avancés

Panneau repliable (bouton "Filtres" avec badge de compte, même pattern que `ProcedurePickerDialog` web) ajouté sous la barre de recherche existante, au-dessus ou à la place de la ligne de chips Bloc actuelle (les deux coexistent : Bloc reste la ligne toujours visible, les filtres avancés — Type/Thème(phase de jeu)/Intensité/Principes — sont dans le panneau repliable, exactement la distinction déjà faite côté web entre la ligne Bloc et le panneau Filtres). `FilterChip` existant réutilisé tel quel. `availablePrincipes` dérivé des cartes chargées, comme le web.

### 3.3 Suppression

- `mobile/lib/services/trainingProceduresService.ts` : ajout de `archiveProcedure(id: string): Promise<void>` (miroir web — set `archived_at`).
- `mobile/lib/services/schematicsService.ts` : ajout de `deleteSchematic(id: string): Promise<void>` (miroir web — hard delete, pour les cartes `kind: 'schematic'` sans fiche liée).
- `ProcedureCard.tsx` : ajout d'un bouton poubelle (icône, coin de la carte, `hitSlop` pour respecter la cible tactile 44×44pt même si l'icône visuelle est plus petite) et d'une prop `onDelete?: () => void` (optionnelle — le composant est aussi utilisé ailleurs, ex. `ProcedurePickerSheet`, où on ne veut pas de bouton supprimer).
- Confirmation via `Alert.alert('Supprimer ?', ..., [{text:'Annuler', style:'cancel'}, {text:'Supprimer', style:'destructive', onPress}])` — pas de `window.confirm`, convention déjà établie ailleurs dans le mobile (`PlayerDetailView.tsx`, `PhoneMatchRecorder.tsx`).
- `library/index.tsx` : `handleDeleteCard(card: LibraryCard)` branchant sur `card.kind === 'procedure'` → `archiveProcedure` sinon `card.schematic` → `deleteSchematic`, retire la carte de l'état local après succès — miroir exact de `handleDeleteCard` web (`app/webapp/library/page.tsx`).

---

## 4. Sélecteur de procédé enrichi (partagé entre assembleur et picker existant)

`ProcedurePickerSheet.tsx` (56 lignes aujourd'hui, liste plate sans recherche) réécrit pour ajouter :
- Barre de recherche en tête de `Sheet` (même TextInput que `library/index.tsx`).
- Filtres à facettes (Type/Thème/Intensité/Principes) via `FilterChip`, repliables sous un bouton "Filtres" avec badge — miroir de `ProcedurePickerDialog.tsx` web.
- Utilisé à la fois par l'assembleur de séance (choix du procédé d'un bloc) et potentiellement ailleurs où ce composant est déjà appelé (à vérifier en implémentation qu'aucun autre appelant ne dépend de l'absence de recherche/filtres — impact attendu nul, ajout de fonctionnalité pure).

---

## 5. Explicitement hors scope

- Dessiner/éditer un schéma sur mobile (abandonné, décision antérieure toujours valable).
- Créer une nouvelle fiche procédure depuis mobile (lecture/suppression seulement, comme le web).
- Dossiers de séances, duplication, partage, export.
- Drag-and-drop de réordonnancement (boutons seulement, décision accessibilité déjà actée).

---

## 6. Fichiers touchés — récapitulatif

**Nouveaux :**
```
mobile/lib/tactics/sessionBlocks.ts
mobile/components/tactics/SessionTimeline.tsx
mobile/components/tactics/SessionBlockCard.tsx
mobile/components/tactics/AttachTrainingSheet.tsx
```

**Réécrits intégralement :**
```
mobile/lib/services/sessionsService.ts
mobile/app/(tabs)/sessions/index.tsx
mobile/app/(tabs)/sessions/[sessionId].tsx
mobile/components/training/ProcedurePickerSheet.tsx
```

**Modifiés (ajouts ciblés, pas de réécriture) :**
```
mobile/types/index.ts                              (+ session_id sur Training)
mobile/lib/services/trainings.ts                    (+ getTrainingsByTeamIds, setTrainingSession)
mobile/lib/services/trainingProceduresService.ts     (+ archiveProcedure)
mobile/lib/services/schematicsService.ts             (+ deleteSchematic)
mobile/components/tactics/ProcedureCard.tsx          (+ bouton supprimer, prop onDelete)
mobile/app/(tabs)/library/index.tsx                  (recherche plein-contenu, filtres avancés, handleDeleteCard)
```

**Non touchés** (déjà à jour) : `mobile/lib/navigation.ts`, `mobile/app/(tabs)/_layout.tsx`, `mobile/lib/tactics/procedureTaxonomy.ts`, `mobile/components/tactics/FilterChip.tsx`, `mobile/components/ui/Sheet.tsx`, `mobile/lib/services/teams.ts`.

---

## 7. Vérification

- `cd mobile && npx tsc --noEmit -p tsconfig.json` après chaque tâche — 0 erreur, pas de régression.
- Vérification live iOS Simulator (iPhone au minimum ; iPad si le temps le permet) : créer une séance avec plusieurs types de bloc, vérifier la timeline s'adapte, rattacher/détacher un entraînement, rechercher/filtrer/supprimer un procédé et un schéma sans fiche dans la bibliothèque.
