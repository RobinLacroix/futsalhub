# FutsalHub — App mobile (Expo)

Application iOS / Android / iPadOS. Phase 1 en cours.

**SDK 54** — compatible avec l’app Expo Go (App Store / Play Store).

## Configuration Supabase (une fois)

1. Copie le fichier d’exemple : `cp .env.example .env`
2. Ouvre `.env` et remplis avec les mêmes valeurs que la webapp :
   - **EXPO_PUBLIC_SUPABASE_URL** : Supabase → Project Settings → API → Project URL
   - **EXPO_PUBLIC_SUPABASE_ANON_KEY** : Project Settings → API → anon public

## Structure (Phases 2 + 3)

- **Expo Router** (fichiers dans `app/`) :
  - `app/index.tsx` — redirection selon auth (sign-in ou onglets)
  - `app/sign-in.tsx` — connexion email / mot de passe
  - `app/(tabs)/` — Accueil (sélecteur d’équipe + déconnexion), Calendrier (entraînements), Équipe (joueurs)
- **Données** : `contexts/ActiveTeamContext` (équipe active persistée), `lib/services` (teams, trainings, players) — même Supabase que la webapp.
- **Détail joueur** : clic sur un joueur (Équipe) → écran profil (infos, stats, dernières séances).
- **Détail entraînement** : clic sur un entraînement (Calendrier) → écran présences (Présent / Retard / Absent / Blessé) + bouton « Enregistrer les présences ».

## Lancer l’app (avec Expo Go)

1. Depuis la racine du repo : `cd mobile`
2. Démarrer le serveur : **`npm start`** (ou `npx expo start`)
3. Scanner le **QR code** avec :
   - **iPhone** : appareil photo → lien « Ouvrir dans Expo Go »
   - **Android** : app **Expo Go** → « Scan QR code »

Même réseau Wi‑Fi requis sur le téléphone et le Mac/PC.

## Commandes utiles

| Commande      | Effet                    |
|---------------|---------------------------|
| `npm start`   | Démarre Expo (QR code)     |
| `npm run ios` | Simulateur iOS (Mac + Xcode) |
| `npm run android` | Émulateur Android      |

## Prochaine étape (Phase 1.2)

Configurer Supabase dans ce projet (variables d’environnement + premier appel API).
