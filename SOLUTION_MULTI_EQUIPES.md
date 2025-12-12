# Solution : Joueurs dans plusieurs équipes

## 🎯 Objectif
Permettre à un joueur d'appartenir à plusieurs équipes (ex: Senior A et Senior B, ou Senior et U18) sans créer de doublons de profil.

## ✅ Solution implémentée

### 1. Migration de base de données
**Fichier** : `supabase/migrations/20250104000000_create_player_teams_relation.sql`

- Création d'une table de liaison `player_teams` (relation many-to-many)
- Migration automatique des données existantes
- `team_id` dans `players` rendu optionnel (gardé pour rétrocompatibilité comme équipe "principale")
- Fonctions helper pour faciliter les requêtes

### 2. Modifications de l'interface

#### Page Squad (`app/webapp/manager/squad/page.tsx`)
- ✅ Formulaire avec sélection multiple d'équipes (checkboxes)
- ✅ Affichage des équipes du joueur lors de l'édition
- ✅ Gestion automatique des relations lors de la création/modification
- ✅ Requêtes mises à jour pour utiliser `player_teams`

#### Page Dashboard (`app/webapp/manager/dashboard/page.tsx`)
- ✅ Requêtes mises à jour pour utiliser la table de liaison

#### Page Calendar (`app/webapp/manager/calendar/page.tsx`)
- ✅ Requêtes mises à jour pour utiliser la table de liaison

#### Page Match Recorder (`app/webapp/tracker/matchrecorder/page.tsx`)
- ✅ Chargement des joueurs filtré par équipe active via la table de liaison

## 📋 Structure de la base de données

### Table `player_teams`
```sql
CREATE TABLE player_teams (
  id UUID PRIMARY KEY,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(player_id, team_id)
);
```

### Table `players`
- `team_id` est maintenant **optionnel** (gardé pour rétrocompatibilité)
- La première équipe sélectionnée devient l'équipe "principale" (stockée dans `team_id`)

## 🚀 Utilisation

### Créer un joueur dans plusieurs équipes
1. Aller dans **Manager > Effectif**
2. Cliquer sur **"Ajouter un joueur"**
3. Remplir les informations du joueur
4. Dans la section **"Équipes"**, cocher toutes les équipes souhaitées
5. Enregistrer

### Modifier les équipes d'un joueur existant
1. Cliquer sur l'icône **✏️** à côté du joueur
2. Modifier les équipes sélectionnées dans la section **"Équipes"**
3. Enregistrer

### Exemples de cas d'usage
- **Joueur en double équipe** : Senior A + Senior B
- **Joueur inter-catégories** : Senior + U18
- **Joueur polyvalent** : U19 + U17 (si autorisé)

## 🔄 Migration des données existantes

La migration SQL migre automatiquement toutes les relations existantes :
- Chaque joueur avec un `team_id` existant est automatiquement ajouté dans `player_teams`
- Aucune perte de données
- Compatibilité ascendante maintenue

## ⚠️ Notes importantes

1. **Équipe principale** : La première équipe sélectionnée devient l'équipe "principale" (stockée dans `team_id` pour rétrocompatibilité)

2. **Filtrage** : Quand une équipe est active dans la sidebar, seuls les joueurs de cette équipe sont affichés (même s'ils appartiennent à d'autres équipes)

3. **Suppression** : Supprimer un joueur supprime automatiquement toutes ses relations avec les équipes (CASCADE)

4. **Numéro de maillot** : Le numéro de maillot est unique par joueur, pas par équipe. Si un joueur a le numéro 10 dans Senior A, il garde le même numéro dans Senior B.

## 🧪 Tests à effectuer

1. ✅ Créer un joueur dans plusieurs équipes
2. ✅ Modifier les équipes d'un joueur existant
3. ✅ Vérifier que le joueur apparaît dans toutes ses équipes
4. ✅ Vérifier que le filtrage par équipe fonctionne correctement
5. ✅ Vérifier que les stats sont calculées par équipe

## 📝 Prochaines améliorations possibles

- [ ] Numéro de maillot différent par équipe
- [ ] Statistiques séparées par équipe
- [ ] Badge visuel indiquant les équipes du joueur dans la liste
- [ ] Export des joueurs avec leurs équipes

