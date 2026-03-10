# Phase 4 : Build de test, TestFlight et Stores

Ce guide décrit comment générer un build de test (preview), le distribuer via TestFlight (iOS) puis soumettre l’app aux stores (App Store et Google Play).

## Prérequis

- **Compte Expo** : [expo.dev](https://expo.dev) → créer un compte si besoin.
- **EAS CLI** : `npm install -g eas-cli` puis `eas login`.
- **Lien du projet** : à la racine du dossier `mobile`, exécuter une fois :
  ```bash
  eas init
  ```
  (Choisir “Link to an existing project” si le projet est déjà sur Expo.)

- **iOS** : compte **Apple Developer** (99 €/an). Créer l’app dans [App Store Connect](https://appstoreconnect.apple.com) et noter l’**App ID** (ex. `1234567890`) pour `eas.json`.
- **Android** : compte **Google Play Console**. Pour la preview (APK interne), un compte suffit ; pour la prod, configurer la fiche d’application et la signature.

---

## 1. Configurer les identifiants

### `app.json` (déjà en place)

- **iOS** : `ios.bundleIdentifier` = `com.futsalhub.app` (modifiable si besoin).
- **Android** : `android.package` = `com.futsalhub.app`.

### `eas.json` – Submit iOS

Remplacer les placeholders dans `submit.preview.ios` et `submit.production.ios` :

- **`ascAppId`** : ID numérique de l’app dans App Store Connect (My Apps → FutsalHub → App Information → Apple ID).
- **`appleId`** (optionnel) : email du compte Apple Developer.

Exemple :

```json
"submit": {
  "preview": {
    "ios": { "ascAppId": "1234567890" }
  },
  "production": {
    "ios": { "ascAppId": "1234567890" },
    "android": { "track": "internal" }
  }
}
```

### Credentials EAS (première fois)

- **iOS** :  
  ```bash
  cd mobile && eas credentials --platform ios
  ```
  Suivre les prompts pour créer/gérer le certificat de distribution et le profil de provisioning (EAS peut les gérer automatiquement).

- **Android** :  
  ```bash
  eas credentials --platform android
  ```
  Pour la production, créer ou uploader un keystore (EAS peut en générer un).

---

## 2. Build de test (preview)

Build **interne** (testeurs sans passer par les stores).

- **iOS** (fichier `.ipa` pour installation ad hoc / TestFlight plus bas) :
  ```bash
  cd mobile && eas build --profile preview --platform ios
  ```

- **Android** (fichier `.apk` à partager) :
  ```bash
  eas build --profile preview --platform android
  ```

- **Les deux** :
  ```bash
  eas build --profile preview --platform all
  ```

À la fin du build, le tableau de bord Expo affiche un **lien de téléchargement** pour l’IPA (iOS) ou l’APK (Android). Les testeurs peuvent installer l’APK directement ; pour l’IPA, il faut soit passer par TestFlight (étape 3), soit utiliser une distribution ad hoc (UDID enregistrés).

---

## 3. TestFlight (iOS)

Pour mettre la **même** version que celle que vous enverrez à l’App Store (build “production”) :

1. **Build production iOS**  
   ```bash
   cd mobile && eas build --profile production --platform ios
   ```

2. **Envoi vers App Store Connect / TestFlight**  
   ```bash
   eas submit --platform ios --latest
   ```
   Ou avec un profil dédié TestFlight (si configuré dans `submit.preview`) :
   ```bash
   eas submit --platform ios --profile preview --latest
   ```
   (En général on envoie le build **production** avec `--latest` après un `eas build --profile production --platform ios`.)

3. Dans **App Store Connect** → TestFlight : une fois le build traité, ajouter les testeurs internes/externes et leur envoyer l’invitation.

---

## 4. Soumission aux stores

### App Store (iOS)

1. Build production déjà créé (étape 3) ou nouveau :
   ```bash
   eas build --profile production --platform ios
   ```
2. Soumettre le build à Apple :
   ```bash
   eas submit --platform ios --latest
   ```
3. Dans **App Store Connect** → FutsalHub → version de l’app : choisir le build reçu, remplir fiche (description, captures, confidentialité, etc.) et envoyer en **soumission pour révision**.

### Google Play (Android)

1. Build production Android (AAB) :
   ```bash
   eas build --profile production --platform android
   ```
2. Soumettre :
   ```bash
   eas submit --platform android --latest
   ```
   Indiquer le **track** (internal / alpha / beta / production) si demandé (défaut dans `eas.json` : `internal`).

3. Dans **Google Play Console** : créer la fiche de l’application si besoin, uploader le AAB (ou le faire via EAS Submit), remplir contenu et politique, puis lancer la mise en production ou une track de test.

---

## 5. Résumé des commandes

| Objectif              | Commande |
|-----------------------|----------|
| Build test iOS        | `eas build --profile preview --platform ios` |
| Build test Android    | `eas build --profile preview --platform android` |
| Build prod iOS        | `eas build --profile production --platform ios` |
| Build prod Android    | `eas build --profile production --platform android` |
| Envoyer vers TestFlight / App Store (iOS) | `eas submit --platform ios --latest` |
| Envoyer vers Play Store (Android)         | `eas submit --platform android --latest` |
| Build + submit iOS en une fois            | `eas build --profile production --platform ios --auto-submit` |

---

## 6. Variables d’environnement (build)

Les variables présentes dans `mobile/.env` (ex. `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SITE_URL`) doivent être disponibles lors du build EAS. Deux options :

- **Secrets EAS** (recommandé) :  
  [expo.dev](https://expo.dev) → projet → Settings → Secrets. Ajouter les clés/valeurs. Elles sont injectées comme variables d’environnement pendant le build.

- **`eas.json`** : dans le profil de build, ajouter par exemple :
  ```json
  "env": {
    "EXPO_PUBLIC_SUPABASE_URL": "https://xxx.supabase.co",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY": "...",
    "EXPO_PUBLIC_SITE_URL": "https://futsalhub-nu.vercel.app"
  }
  ```
  Ne pas commiter de vraies clés dans le dépôt ; préférer les Secrets.

---

## 7. Incrément de version

- **version “marketing”** (`app.json` → `expo.version`) : à mettre à jour manuellement pour chaque release (ex. 1.0.0 → 1.1.0).
- **build number** (iOS) / **versionCode** (Android) : `"autoIncrement": true` dans le profil `production` de `eas.json` permet à EAS d’incrémenter automatiquement à chaque build production.

Vous pouvez lancer la phase 4 en enchaînant : **build preview** → tests → **build production** → **TestFlight** → **soumission App Store / Play Store** comme ci-dessus.
