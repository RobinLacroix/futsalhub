# Plan App iPad – Parité avec la Webapp

Objectif : avoir **toutes les fonctionnalités de la webapp** dans l’app mobile, avec une **UX/UI optimisée iPad** (sidebar, grilles, master-detail).

---

## État des lieux

### Webapp (référence)

| Zone       | Fonctionnalité              | Route / Contexte                    |
|-----------|-----------------------------|-------------------------------------|
| **Accueil** | Tableau de bord             | `/webapp`                           |
| **Joueur**  | Calendrier / Présences     | `/webapp/player/calendar`           |
|            | Ma fiche                    | `/webapp/player/profile`            |
|            | Questionnaires              | `/webapp/player/questionnaires`     |
| **Manager** | Calendrier / Résultats      | `/webapp/manager/calendar`          |
|            | Effectif (liste + fiche)    | `/webapp/manager/squad` + `[playerId]` |
|            | Dashboard                   | `/webapp/manager/dashboard`          |
|            | Équipes (club)              | `/webapp/manager/teams`              |
| **Tracker** | Dashboard                   | `/webapp/tracker/dashboard`          |
|            | Enregistrer match           | `/webapp/tracker/matchrecorder`     |
| **Scout**   | Annonce                     | `/webapp/scout/opening`             |
|            | Recrutement / Profils       | `/webapp/scout/profiles`            |
| **Share**   | Librairie                   | `/webapp/library`                   |
|            | Schémas tactiques          | `/webapp/library/schematics`        |
|            | Forum                       | `/webapp/share/forum`               |
| **Commun**  | Paramètres                  | `/webapp/settings`                  |
|            | Déconnexion                 | -                                   |

### App mobile actuelle

| Zone       | Écran / Route                    | Statut        |
|-----------|-----------------------------------|---------------|
| **Accueil** | `(tabs)/index`                   | OK            |
| **Joueur**  | `(player-tabs)/index`, profile, questionnaires | OK |
| **Manager** | `(tabs)/calendar` (liste, détail entraînement, match, création) | OK |
|            | `(tabs)/squad` (liste, détail joueur, nouveau joueur) | OK (fiche joueur sans bloc Équipes comme en webapp) |
|            | Dashboard manager               | À faire        |
|            | Équipes du club                 | À faire        |
| **Tracker** | Dashboard + Enregistrer match    | À faire        |
| **Scout**   | Annonce + Recrutement            | À faire        |
| **Share**   | Librairie, Schémas, Forum       | À faire        |
| **Commun**  | Paramètres (compte, club, équipes, déco) | À faire  |

---

## Fondations iPad (fait / en cours)

- **Détection tablette** : `useIsTablet()` + `LAYOUT` dans `hooks/useIsTablet.ts`.
- **Navigation** : sur iPad, sidebar à gauche (équivalent webapp) à la place de la barre d’onglets en bas.
- **Constantes** : `LAYOUT.SIDEBAR_WIDTH`, `CONTENT_PADDING`, `MAX_CONTENT_WIDTH` pour cohérence.

---

## Roadmap par phase

### Phase 1 – Fondations iPad (actuelle)
- [x] Hook `useIsTablet` + constantes `LAYOUT`.
- [x] Sidebar navigation sur tablette (remplace les tabs en bas) — `TabletSidebar` + layout conditionnel dans `(tabs)/_layout.tsx`.
- [ ] Padding / largeur max du contenu sur tablette pour lisibilité (utiliser `LAYOUT.CONTENT_PADDING` / `MAX_CONTENT_WIDTH` dans les écrans).
- [ ] Étendre la sidebar avec Dashboard, Équipes, Tracker, Paramètres au fur et à mesure des écrans.

### Phase 2 – Parité Manager
- [x] **Équipes** : écran liste des équipes du club (création / édition / suppression) — `(tabs)/teams/index.tsx` + `lib/services/teams.ts` (getTeamsByClubId, createTeam, updateTeam, deleteTeam).
- [x] **Dashboard manager** : résumés (effectif, prochains entraînements/matchs), liens vers calendrier — `(tabs)/dashboard/index.tsx`.
- [x] Fiche joueur : bloc « Équipes » (associer / dissocier) — déjà présent dans `(tabs)/squad/[playerId].tsx` (Gestion équipes + modal Assigner).

### Phase 3 – Tracker
- [ ] Dashboard tracker.
- [ ] Enregistrer match (saisie score, joueurs, buts).

### Phase 4 – Scout + Share
- [ ] Scout : annonce, recrutement / profils.
- [ ] Librairie, Schémas tactiques, Forum (selon priorité produit).

### Phase 5 – Paramètres & polish
- [ ] Écran Paramètres (profil, club, équipes, déconnexion).
- [ ] Master-detail sur iPad où pertinent (ex. liste joueurs | fiche joueur).
- [ ] Grilles 2 colonnes sur tablette pour listes (effectif, calendrier, équipes).

---

## UX/UI iPad – Principes

1. **Sidebar** : navigation principale à gauche, toujours visible (comme webapp).
2. **Contenu** : zone unique à droite, padding et largeur max pour ne pas étirer à l’infini.
3. **Master-detail** : sur liste → détail (effectif, calendrier), privilégier split horizontal (liste | détail) quand la place le permet.
4. **Touch targets** : boutons et lignes cliquables suffisamment grands (min 44pt).
5. **Typo** : tailles lisibles sur grand écran, hiérarchie claire (titres, sous-titres, corps).

---

## Fichiers clés

- `mobile/hooks/useIsTablet.ts` – détection tablette + constantes.
- `mobile/app/(tabs)/_layout.tsx` – layout conditionnel (tabs vs sidebar + contenu).
- `mobile/components/` – composants réutilisables (ex. sidebar nav, cartes, listes).
- Ce plan : `mobile/docs/IPAD_APP_PLAN.md`.
