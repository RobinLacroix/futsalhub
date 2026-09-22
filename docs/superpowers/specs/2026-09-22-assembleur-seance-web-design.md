# Assembleur de séance — Refonte web

Date : 2026-09-22
Statut : validé, prêt pour implémentation
Suite de : [PLAN_ASSEMBLEUR_SEANCE_PHASE2_2026-09.md](../../../PLAN_ASSEMBLEUR_SEANCE_PHASE2_2026-09.md) (Phase 2 en prod depuis le 2026-09-21) — cette refonte la remplace intégralement plutôt que de l'étendre.

## Contexte

L'assembleur de séance Phase 2 (commits `18e3e4a`/`12fb98a`/`4815f30`) est fonctionnel — 11 séances réelles créées en prod — mais Robin le juge non professionnel sur quatre axes à la fois : finition visuelle, structure pédagogique des blocs, expérience d'assemblage, et architecture technique. Décision : refonte complète côté web, pas une itération. Le mobile (tranche 1, fonctionnel) garde son état actuel et fera l'objet d'une spec séparée une fois ce web validé en usage réel — décision actée explicitement (séquencement web → mobile, pas les deux en parallèle).

Cadrage mené avec `futsal-coach` (structure pédagogique) et `ui-ux-pro-max` (densité de carte, hiérarchie visuelle) + un aller-retour visuel (mockups timeline et carte de bloc).

## Décisions actées

| Sujet | Décision |
|---|---|
| Architecture web | Composant React natif intégré à Next.js (pattern composant → service → RPC du reste du produit), **remplace** l'iframe vanilla-JS. `public/tools/tactics/seance.html` et `seance.js` sont supprimés. |
| Stockage | Aucun changement de schéma. `training_sessions.blocks` reste un JSONB libre — seule la forme des objets qu'on y écrit change. `lib/services/sessionsService.ts` est étendu, pas remplacé. |
| Trame pédagogique | 6 blocs par défaut à la création (Échauffement ludique, Problématisation, Situation isolée, Analytique, Jeu orienté, Match libre — cf. `futsal-coach`), **librement modifiable** ensuite (ajout/suppression/réordonnancement) — pas de trame figée, pour rester compatible avec les séances allégées (veille de match : blocs 1+2+5+6 seulement). |
| Champs par bloc | Type (parmi les 6), durée, procédé lié (optionnel), intention pédagogique (optionnel, replié par défaut). Pas de champs riches supplémentaires (supériorité locale, questions de débrief) — cette richesse reste dans la fiche procédé, pas dupliquée ici (YAGNI). |
| En-tête de séance | Principe servi, Moyen travaillé (optionnel), Thème libre (optionnel), Phase d'apprentissage (optionnel — Phase 1 / Phase 2 / Mix / non précisé), Durée totale (calculée, somme des blocs), Effectif. |
| Phase d'apprentissage | Optionnelle et non mise en avant par défaut — Robin ne maîtrise pas encore le concept lui-même ; un champ obligatoire deviendrait une case cochée sans valeur pédagogique réelle. |
| Timeline | Barre segmentée en tête de page, largeur de chaque segment proportionnelle à la durée du bloc, **reflète uniquement les blocs présents** (pas 6 cases fixes). |
| Carte de bloc | Format compact : ligne type + durée + contrôles, procédé en aperçu (vignette + titre), intention pédagogique repliée derrière un disclosure. Choisi contre le format détaillé (chips + champs toujours ouverts) pour permettre un scan rapide de toute la séance. |
| Mise en avant Bloc 3 | Badge "CŒUR" + accent visuel discret réutilisant le design system existant (`.fm-card-accent`, nouvelle variante `-primary` sur `var(--fh-accent)`) — pas de nouvelle couleur inventée, pas de traitement gadget. |
| Réordonnancement | Boutons monter/descendre uniquement, pas de drag — cohérent avec la contrainte WCAG 2.2 AA déjà actée sur l'éditeur de schémas et l'assembleur mobile. |
| Palette / typo | Réutilisation du design system `fm-*` existant (`fm-input`, `fm-btn-*`, `fm-card`) — pas de nouvelle identité visuelle pour cet écran isolé. |
| Accès depuis la bibliothèque | Ajout d'un onglet "Séances" dans `app/webapp/library/page.tsx` (liste + bouton "Nouvelle séance"), sur le même modèle que les onglets Schémas/Procédés existants. Aujourd'hui l'assembleur n'est atteignable que via le sélecteur du calendrier — pas assez pour un outil qu'on veut mettre en avant. |
| Données existantes (11 séances) | Aucune migration SQL. Normalisation à la lecture dans le service (cf. Migration des données ci-dessous) — réversible, pas d'étape manuelle pour Robin. |

## Modèle de données

```ts
// lib/services/sessionsService.ts

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
  duration: number;              // minutes
  procedureId: string | null;
  intentionPedagogique: string;  // '' si vide, jamais undefined
}

export interface SessionMeta {
  principe: string;              // ex. "Supériorité collective offensive"
  moyen?: string;                // ex. "Dualité meneur → ailier (parallèle), structure 4-0"
  theme?: string;                // libre, ex. "Animer en 4-0 entre meneur et ailier"
  phase?: LearningPhase;         // absent = non précisé
  effectif?: string;
  dureeTotaleMin: number;        // dérivé, recalculé à chaque sauvegarde — jamais saisi
}

export interface TrainingSessionRecord {
  id: string;
  club_id: string;
  created_by: string;
  name: string;
  meta: SessionMeta;
  blocks: SessionBlock[];
  created_at: string;
  updated_at: string;
}
```

**Seed par défaut à la création** (somme = 90 min, ajustable ensuite bloc par bloc) :

| Ordre | Type | Durée par défaut |
|---|---|---|
| 1 | Echauffement | 15 min |
| 2 | Problematisation | 15 min |
| 3 | Situation | 20 min |
| 4 | Analytique | 10 min |
| 5 | JeuOriente | 15 min |
| 6 | MatchLibre | 15 min |

**Champs supprimés** : `SessionMeta.theme` était déjà présent (conservé) ; `SessionMeta.objectif` et `SessionMeta.philosophyTags` disparaissent — `objectif` est remplacé par le couple principe/moyen (plus précis), `philosophyTags` n'a jamais eu d'UI ni web ni mobile pour le lire ou l'écrire (champ mort, vérifié par grep avant suppression).

## Migration des données existantes

Les 11 séances en prod utilisent l'ancien type de bloc (`'Echauffement' | 'Exercice' | 'Situation' | 'Jeu'`). Plutôt qu'une migration SQL (le JSONB ne change pas de schéma, seulement de convention applicative), une fonction de normalisation dans `sessionsService.ts` mappe à la lecture :

| Ancien type | Nouveau type |
|---|---|
| `Echauffement` | `Echauffement` |
| `Exercice` | `Analytique` |
| `Situation` | `Situation` |
| `Jeu` | `JeuOriente` |

Une séance ancienne n'aura donc jamais de bloc `Problematisation` ou `MatchLibre` tant qu'elle n'est pas rouverte et complétée — cohérent avec "la timeline ne reflète que les blocs présents", pas une régression fonctionnelle.

## Composants

```
app/webapp/library/sessions/
  page.tsx                  # liste des séances du club + bouton "Nouvelle séance" (remplace l'iframe)
  [sessionId]/page.tsx      # l'assembleur (ou ?session= en query param, à trancher en plan selon le
                             # routing déjà en place — le point important est : plus d'iframe)
  components/
    SessionTimeline.tsx      # barre segmentée, proportionnelle aux blocs présents
    SessionHeaderForm.tsx    # principe / moyen / thème / phase / effectif / durée calculée
    SessionBlockCard.tsx     # carte compacte, badge CŒUR pour Bloc 3, disclosure intention
    ProcedurePickerDialog.tsx # sélection du procédé lié (Radix Dialog, recherche + vignette)
    AddBlockMenu.tsx         # "+ Ajouter un bloc", choix parmi les 6 types
```

`lib/services/sessionsService.ts` étendu avec la normalisation ci-dessus ; `trainingProceduresService.getProceduresByClub` réutilisé tel quel pour le picker.

## Flux de données

Identique au pattern déjà en place ailleurs dans le produit (plus d'iframe/postMessage) :

```
SessionEditorPage
  → charge la séance (getSessionById) + les procédés du club (getProceduresByClub) au montage
  → état local (useState) pour meta/blocks, dureeTotaleMin recalculé à chaque changement de blocks
  → handleSave() : saveSession(...) → redirige vers la liste ou reste sur l'id créé
```

Pas de RPC nouvelle — `saveSession`/`getSessionById`/`getSessionsByClub`/`deleteSession` existent déjà et scopent déjà sur `club_id` avec les gardes d'accès en place.

## Gestion des erreurs

- Chargement séance/procédés échoué → message d'erreur inline + bouton retour vers la liste (pas de page blanche).
- Sauvegarde échouée → toast d'erreur, formulaire conservé (pas de perte de saisie).
- Nom de séance vide → bloque la sauvegarde avec message inline, pas d'alerte native.

## Hors scope de cette spec

- Mobile (spec séparée après validation du web en usage réel).
- Champs riches par situation (supériorité locale, questions de débrief), presets par jour de semaine, export PDF/partage — non demandés, YAGNI.
- Migration SQL des 11 séances existantes (gérée par normalisation applicative, cf. ci-dessus).
- Refonte du sélecteur de séance dans le calendrier (`SessionPicker.tsx`) — reste tel quel, pointe déjà vers `/webapp/library/sessions`.

## Tests / validation

Pas de suite de tests dans ce repo (cf. CLAUDE.md). Validation :
- `tsc` à 0 erreur avant/après.
- Vérification manuelle en navigateur : création d'une séance neuve (6 blocs par défaut), suppression/réordonnancement, séance existante (une des 11) rouverte et confirmée lisible malgré l'ancien format de blocs, sauvegarde, suppression.
- Lien "Assembleur de séances →" dans `public/tools/tactics/index.html` (éditeur de schémas) mis à jour vers `/webapp/library/sessions` au lieu de `seance.html` supprimé.
