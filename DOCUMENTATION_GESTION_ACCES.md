# 🔐 Documentation : Gestion d'accès par club

## 📋 Vue d'ensemble

Le système de gestion d'accès permet d'isoler les données par club. Chaque utilisateur n'a accès qu'aux données de son club, selon son rôle :

- **Administrateur de club** : Accès complet à toutes les données du club (équipes, joueurs, matches, entraînements, etc.)
- **Entraîneur d'équipe** : Accès limité aux données de son équipe assignée

## 🗄️ Structure de la base de données

### Table `clubs`
Stocke les informations des clubs.

```sql
CREATE TABLE clubs (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
);
```

### Table `club_members`
Lie les utilisateurs aux clubs avec leurs rôles.

```sql
CREATE TABLE club_members (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  club_id UUID REFERENCES clubs(id),
  role VARCHAR(50) CHECK (role IN ('admin', 'coach')),
  team_id UUID REFERENCES teams(id), -- NULL pour admin, UUID pour coach
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
);
```

**Rôles :**
- `admin` : Administrateur du club (accès total, `team_id` = NULL)
- `coach` : Entraîneur d'une équipe spécifique (`team_id` = UUID de l'équipe)

### Colonnes `club_id` ajoutées
Les tables suivantes ont maintenant une colonne `club_id` :
- `teams`
- `players`
- `matches`
- `trainings`
- `match_events`
- `player_teams`

## 🔒 Politiques de sécurité (RLS)

Toutes les tables sont protégées par Row Level Security (RLS) qui filtre automatiquement les données selon :
1. Le club de l'utilisateur
2. Le rôle de l'utilisateur (admin ou coach)

### Exemples de politiques

**Pour les joueurs :**
- Un utilisateur peut voir uniquement les joueurs de son club
- Un admin peut modifier tous les joueurs de son club
- Un coach peut modifier uniquement les joueurs de son équipe

**Pour les équipes :**
- Un utilisateur peut voir uniquement les équipes de son club
- Un admin peut gérer toutes les équipes de son club
- Un coach peut voir uniquement son équipe assignée

## 🛠️ Fonctions helper

### `get_user_club_id()`
Retourne le `club_id` de l'utilisateur connecté.

```sql
SELECT get_user_club_id();
```

### `is_club_admin(p_club_id UUID)`
Vérifie si l'utilisateur est administrateur d'un club.

```sql
SELECT is_club_admin('club-uuid-here');
-- ou sans paramètre (utilise le club de l'utilisateur)
SELECT is_club_admin();
```

### `is_team_coach(p_team_id UUID)`
Vérifie si l'utilisateur est entraîneur d'une équipe.

```sql
SELECT is_team_coach('team-uuid-here');
```

### `has_club_access(p_club_id UUID)`
Vérifie si l'utilisateur a accès à un club (admin ou coach).

```sql
SELECT has_club_access('club-uuid-here');
```

### `has_team_access(p_team_id UUID)`
Vérifie si l'utilisateur a accès à une équipe (admin du club ou coach de l'équipe).

```sql
SELECT has_team_access('team-uuid-here');
```

## 📝 Utilisation dans l'application

### 1. Créer un club

```typescript
const { data: club, error } = await supabase
  .from('clubs')
  .insert({
    name: 'Mon Club',
    description: 'Description du club'
  })
  .select()
  .single();
```

### 2. Ajouter un administrateur au club

```typescript
const { error } = await supabase
  .from('club_members')
  .insert({
    user_id: userId,
    club_id: clubId,
    role: 'admin',
    team_id: null
  });
```

### 3. Ajouter un entraîneur à une équipe

```typescript
const { error } = await supabase
  .from('club_members')
  .insert({
    user_id: userId,
    club_id: clubId,
    role: 'coach',
    team_id: teamId
  });
```

### 4. Récupérer les données filtrées automatiquement

Grâce aux politiques RLS, les requêtes sont automatiquement filtrées :

```typescript
// Récupère uniquement les joueurs du club de l'utilisateur
const { data: players } = await supabase
  .from('players')
  .select('*');

// Récupère uniquement les équipes du club de l'utilisateur
const { data: teams } = await supabase
  .from('teams')
  .select('*');
```

### 5. Vérifier les permissions côté client

```typescript
// Vérifier si l'utilisateur est admin
const { data: isAdmin } = await supabase
  .rpc('is_club_admin', { p_club_id: clubId });

// Vérifier si l'utilisateur est coach d'une équipe
const { data: isCoach } = await supabase
  .rpc('is_team_coach', { p_team_id: teamId });
```

## 🚀 Migration des données existantes

Lors de la première exécution des migrations :
1. Un club par défaut est créé automatiquement
2. Toutes les données existantes sont associées à ce club
3. Tous les utilisateurs existants deviennent administrateurs du club par défaut

## ⚠️ Points importants

1. **Isolation des données** : Les utilisateurs ne voient que les données de leur club
2. **Rôles** : Un utilisateur peut être admin d'un club ET coach d'une équipe d'un autre club
3. **Cohérence** : Les triggers maintiennent automatiquement la cohérence des `club_id` lors des insertions/mises à jour
4. **Performance** : Des index sont créés sur toutes les colonnes `club_id` pour optimiser les requêtes

## 🔧 Maintenance

### Ajouter un nouveau club

```sql
INSERT INTO clubs (name, description)
VALUES ('Nouveau Club', 'Description');
```

### Changer le rôle d'un utilisateur

```sql
-- Promouvoir un coach en admin
UPDATE club_members
SET role = 'admin', team_id = NULL
WHERE user_id = 'user-uuid' AND club_id = 'club-uuid';
```

### Assigner un entraîneur à une autre équipe

```sql
UPDATE club_members
SET team_id = 'new-team-uuid'
WHERE user_id = 'user-uuid' AND club_id = 'club-uuid' AND role = 'coach';
```

## 📚 Types TypeScript

Les types suivants sont disponibles dans `types/index.ts` :

```typescript
interface Club {
  id: string;
  name: string;
  description?: string;
  logo_url?: string;
  created_at?: string;
  updated_at?: string;
}

type ClubMemberRole = 'admin' | 'coach';

interface ClubMember {
  id: string;
  user_id: string;
  club_id: string;
  role: ClubMemberRole;
  team_id?: string | null;
  created_at?: string;
  updated_at?: string;
}
```

Toutes les interfaces existantes (`Team`, `Player`, `Match`, `Training`, etc.) ont maintenant un champ optionnel `club_id`.
