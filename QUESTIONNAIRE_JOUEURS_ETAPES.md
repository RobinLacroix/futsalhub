# Questionnaire de fin de séance – étapes

## Ce qui a été mis en place

- **Page mobile** : `/feedback/session/[token]` – questionnaire avec 4 curseurs (1–10, défaut 5) : auto-évaluation globale, RPE, forme physique ressentie, plaisir.
- **Liens uniques** : à chaque enregistrement d’un entraînement (création ou modification), des liens sont générés pour chaque joueur **Présent** ou **Retard**. Chaque lien ne peut servir qu’une fois.
- **Calendrier** : en modifiant un entraînement, une section « Liens questionnaire » liste les liens à envoyer aux joueurs (bouton « Copier »).

---

## Étapes à suivre de ton côté

### 1. Appliquer les migrations Supabase

Exécuter les migrations dans l’ordre (Dashboard Supabase → SQL Editor ou `supabase db push`) :

- `20250222000001_create_training_player_feedback.sql` (si pas déjà fait)
- `20250222000002_training_feedback_tokens_and_rpc.sql`

Sans ces migrations, la création de tokens et la page questionnaire ne fonctionneront pas.

### 2. Déployer l’app

- Faire un build / déploiement (ex. Vercel) pour que la route **publique** `/feedback/session/[token]` soit disponible.
- Vérifier que l’URL de production est bien utilisée partout (ex. variable d’environnement `NEXT_PUBLIC_APP_URL` si tu construis les liens côté serveur plus tard).

### 3. Utilisation au quotidien

1. **Créer ou modifier un entraînement** (Calendrier → clic sur un entraînement ou « Ajouter »).
2. Renseigner les présences : **Présent**, **Retard**, **Absent**, **Blessé**.
3. Enregistrer la séance.
4. **Récupérer les liens** : rouvrir le même entraînement (clic sur l’événement) → dans la section bleue « Liens questionnaire », copier le lien pour chaque joueur (Présent / Retard).
5. **Envoyer les liens aux joueurs** (SMS, WhatsApp, email, etc.). Chaque joueur ouvre le lien sur son téléphone, remplit les 4 notes et envoie. Le lien expire après 7 jours et ne peut être utilisé qu’une fois.

### 4. (Optionnel) Rendre l’app « type app mobile »

- **PWA** : ajouter un `manifest.json` et un service worker pour que les utilisateurs puissent « Ajouter à l’écran d’accueil » et ouvrir le questionnaire en plein écran.
- **Viewport** : la page questionnaire est déjà en `viewport-fit=cover` et utilise les safe areas (encoche, barre de gestes).
- Plus tard : **notifications push** (Web Push ou app native) pour envoyer automatiquement le lien aux joueurs après la séance (nécessite une couche supplémentaire : abonnements push, envoi de notifications côté serveur).

### 5. (Optionnel) Notifications automatiques

Pour que les joueurs reçoivent une notif avec le lien sans que tu copies/colles à la main :

- Soit **Web Push** : enregistrer les abonnements push des joueurs (après connexion ou identification) et envoyer la notif depuis ton backend (ou un service type OneSignal, Firebase) avec l’URL du questionnaire.
- Soit **email / SMS** : après enregistrement de l’entraînement, appeler un service (SendGrid, Twilio, etc.) qui envoie un email ou SMS contenant le lien, en utilisant la liste des joueurs présents/retard et les URLs générées (à exposer via une API ou une action serveur qui appelle `getFeedbackLinksForTraining` et envoie les messages).

---

## Récap technique

| Élément | Détail |
|--------|--------|
| URL questionnaire | `https://ton-domaine.com/feedback/session/{token}` |
| Validité du lien | 7 jours après création/mise à jour de l’entraînement |
| Usage | Une seule soumission par lien (après envoi, le token est marqué utilisé) |
| Données enregistrées | `training_player_feedback` : auto_evaluation, rpe, physical_form, pleasure (1–10) |
