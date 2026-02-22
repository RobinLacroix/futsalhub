# Guide de migration : Système de gestion d'accès par club

## 📋 Vue d'ensemble

Ce guide explique comment migrer vers le système de gestion d'accès par club, étape par étape.

## 🏗️ Structure simplifiée

La structure est simplifiée pour éviter la redondance :
- **Clubs** → **Teams** (club_id sur teams uniquement)
- **Teams** → **Players** (pas de club_id sur players, hérité via team)
- **Teams** → **Matches** (pas de club_id sur matches, hérité via team)
- **Teams** → **Trainings** (pas de club_id sur trainings, hérité via team)
- **Matches** → **Match Events** (pas de club_id sur match_events, hérité via match → team)

## 📝 Étapes de migration

### Étape 1 : Créer la table clubs
**Fichier** : `20250118000000_step1_create_clubs_table.sql`

Crée la table `clubs` avec les colonnes de base.

### Étape 2 : Ajouter club_id à teams
**Fichier** : `20250118000001_step2_add_club_id_to_teams.sql`

Ajoute la colonne `club_id` à la table `teams` avec une référence vers `clubs`.

### Étape 3 : Créer la table club_members
**Fichier** : `20250118000002_step3_create_club_members.sql`

Crée la table `club_members` pour gérer les rôles (admin ou coach) des utilisateurs dans les clubs.

### Étape 4 : Créer les fonctions de permissions
**Fichier** : `20250118000003_step4_create_permission_functions.sql`

Crée les fonctions helper pour vérifier les permissions :
- `get_user_club_id()` : Récupère le club de l'utilisateur
- `is_club_admin()` : Vérifie si l'utilisateur est admin
- `is_team_coach()` : Vérifie si l'utilisateur est entraîneur
- `has_club_access()` : Vérifie l'accès au club
- `has_team_access()` : Vérifie l'accès à une équipe
- `create_user_club()` : Crée un club pour un nouvel utilisateur

### Étape 5 : Ajouter les politiques RLS pour clubs et teams
**Fichier** : `20250118000004_step5_add_rls_policies.sql`

Ajoute les politiques RLS pour :
- `clubs` : Les utilisateurs voient uniquement leurs clubs
- `club_members` : Les utilisateurs voient leurs membreships
- `teams` : Les utilisateurs voient uniquement les équipes de leur club

### Étape 6 : Ajouter les politiques RLS pour les tables liées
**Fichier** : `20250118000005_step6_add_rls_for_related_tables.sql`

Ajoute les politiques RLS pour les tables qui héritent du club via leur équipe :
- `players` : Accès via `team_id → teams.club_id`
- `matches` : Accès via `team_id → teams.club_id`
- `trainings` : Accès via `team_id → teams.club_id`
- `match_events` : Accès via `match_id → matches.team_id → teams.club_id`
- `player_teams` : Accès via `team_id → teams.club_id`

### Étape 7 : Migrer les données existantes
**Fichier** : `20250118000006_step7_migrate_existing_data.sql`

- Crée un club pour chaque utilisateur existant
- Crée un club par défaut pour les équipes existantes
- Assigne le rôle admin à chaque utilisateur dans son club

## 🚀 Exécution des migrations

Exécutez les migrations dans l'ordre dans Supabase SQL Editor :

1. `20250118000000_step1_create_clubs_table.sql`
2. `20250118000001_step2_add_club_id_to_teams.sql`
3. `20250118000002_step3_create_club_members.sql`
4. `20250118000003_step4_create_permission_functions.sql`
5. `20250118000004_step5_add_rls_policies.sql`
6. `20250118000005_step6_add_rls_for_related_tables.sql`
7. `20250118000006_step7_migrate_existing_data.sql`

## 🔧 Utilisation dans l'application

### Créer un club pour un nouvel utilisateur

Lors de l'inscription, appelez la fonction `create_user_club` :

```typescript
const { data: authData, error: authError } = await supabase.auth.signUp({
  email: formData.email,
  password: formData.password,
});

if (authData.user) {
  // Créer un club pour le nouvel utilisateur
  const { data: clubId, error: clubError } = await supabase
    .rpc('create_user_club', {
      p_user_id: authData.user.id,
      p_user_email: formData.email
    });
}
```

### Les requêtes sont automatiquement filtrées

Grâce aux politiques RLS, toutes les requêtes sont automatiquement filtrées par club :

```typescript
// Récupère uniquement les équipes du club de l'utilisateur
const { data: teams } = await supabase
  .from('teams')
  .select('*');

// Récupère uniquement les joueurs des équipes du club de l'utilisateur
const { data: players } = await supabase
  .from('players')
  .select('*');
```

## 📊 Structure des données

```
clubs
  └── club_id (UUID)
      │
      ├── teams (club_id)
      │   ├── players (team_id → teams.club_id)
      │   ├── matches (team_id → teams.club_id)
      │   ├── trainings (team_id → teams.club_id)
      │   └── player_teams (team_id → teams.club_id)
      │
      └── club_members (club_id)
          └── user_id → auth.users
```

## ⚠️ Points importants

1. **Pas de club_id direct** sur players, matches, trainings, match_events
2. **Héritage via relations** : Le club est toujours accessible via `team_id → teams.club_id`
3. **Isolation automatique** : Les politiques RLS filtrent automatiquement par club
4. **Un club par utilisateur** : Chaque utilisateur a son propre club créé automatiquement

## 🔍 Vérification

Après la migration, vérifiez que :

1. ✅ Tous les utilisateurs ont un club
2. ✅ Toutes les équipes ont un `club_id`
3. ✅ Les politiques RLS fonctionnent (testez avec différents utilisateurs)
4. ✅ Les requêtes retournent uniquement les données du club de l'utilisateur
