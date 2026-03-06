# FutsalHub — Application mobile (iOS, Android, iPadOS)

Guide pas à pas pour développer l’app mobile en restant simple et maintenable.

---

## Choix technologique : **Expo (React Native)**

Pour un débutant avec un projet React/Next.js + Supabase, **Expo** est le plus adapté :

| Critère | Expo (React Native) |
|--------|----------------------|
| **Une seule codebase** | iOS + Android + iPadOS (tablettes) |
| **Stack connue** | React, JavaScript/TypeScript — même logique que ta webapp |
| **Supabase** | Même client `@supabase/supabase-js`, mêmes types et API |
| **Accessibilité** | Pas besoin de Xcode/Android Studio au début (build dans le cloud) |
| **Maintenabilité** | Un seul dépôt possible (monorepo) ou projet séparé selon préférence |

**Alternative** : *Capacitor* — enveloppe ta webapp Next.js dans une app native. Plus rapide pour avoir “une app” dans les stores, mais expérience plus “web dans une webview”. On peut y revenir plus tard si tu veux une version “wrap” en plus.

---

## Prérequis (à installer une seule fois)

- **Node.js** 18+ (déjà utilisé pour Next.js)
- **npm** ou **yarn**
- **Expo Go** (app sur ton téléphone) pour tester sans Mac/Android Studio
- **Optionnel** : compte **Expo** (gratuit) pour les builds cloud

Pour publier sur l’App Store / Play Store plus tard :
- **iOS** : Mac avec Xcode (ou Expo EAS Build dans le cloud)
- **Android** : Android Studio ou uniquement EAS Build

---

## Plan par étapes

### Phase 0 — Décision (maintenant)
- [x] Choisir Expo
- [ ] Décider où vivre le code : **dans ce repo** (dossier `apps/mobile` ou `mobile`) ou **nouveau repo** séparé

### Phase 1 — Projet de base
- [x] **Étape 1.1** — Créer le projet Expo (TypeScript, template “blank”) → dossier `mobile/`
- [ ] **Étape 1.2** — Configurer Supabase (même URL + clé anon, fichier env)
- [ ] **Étape 1.3** — Afficher un écran simple + appel Supabase (ex : liste ou auth)

### Phase 2 — Auth et navigation
- [ ] **Étape 2.1** — Écran de connexion (email/mot de passe ou magic link) avec Supabase Auth
- [ ] **Étape 2.2** — Navigation (onglets ou drawer) : Accueil, Calendrier, Équipe, etc.
- [ ] **Étape 2.3** — Protéger les écrans (redirection si non connecté)

### Phase 3 — Fonctionnalités métier
- [ ] **Étape 3.1** — Écrans prioritaires (ex : calendrier, effectif, un écran “player”)
- [ ] **Étape 3.2** — Réutiliser la logique / types existants (services, types partagés depuis le monorepo ou copie maîtrisée)
- [ ] **Étape 3.3** — Adapter l’UI au tactile et aux petites écrans (déjà prévu avec React Native)

### Phase 4 — Build et distribution
- [ ] **Étape 4.1** — Build de test (Expo EAS ou en local)
- [ ] **Étape 4.2** — Soumission TestFlight (iOS) / Internal testing (Android)
- [ ] **Étape 4.3** — Soumission App Store / Play Store (comptes développeur)

---

## Prochaine action : **Étape 1.2**

Le projet Expo est dans **`mobile/`**. Pour tester tout de suite :

```bash
cd mobile
npm start
```

Puis scanne le QR code avec **Expo Go** (même Wi‑Fi). Ensuite on enchaîne avec **1.2** (Supabase) et **1.3** (premier écran + appel API).
