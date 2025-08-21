# 🗄️ Migration SQL dans Supabase

## 🎯 **Objectif :**

Créer la table `teams` et ajouter le support multi-équipes dans votre base de données Supabase.

## 📋 **Étapes à suivre :**

### **1. Ouvrir Supabase Dashboard**

1. Allez sur [supabase.com](https://supabase.com)
2. Connectez-vous à votre compte
3. Sélectionnez votre projet FutsalHub

### **2. Accéder à l'éditeur SQL**

1. Dans le menu de gauche, cliquez sur **"SQL Editor"**
2. Cliquez sur **"New query"**

### **3. Copier et exécuter la migration**

Copiez tout le contenu du fichier `supabase_migration_teams.sql` et collez-le dans l'éditeur SQL.

### **4. Exécuter la migration**

1. Cliquez sur **"Run"** (bouton play ▶️)
2. Attendez que l'exécution se termine
3. Vérifiez qu'il n'y a pas d'erreurs

## 🔍 **Vérification de la migration :**

### **Vérifier que la table `teams` existe :**

```sql
SELECT * FROM teams;
```

**Résultat attendu :**
```
id | name      | category | level | color    | created_at
---+-----------+----------+-------+----------+------------
...| Équipe A  | Senior   | A     | #3B82F6  | 2024-...
...| Équipe B  | Senior   | B     | #10B981  | 2024-...
...| U19       | U19      | A     | #F59E0B  | 2024-...
...| U17       | U17      | A     | #EF4444  | 2024-...
```

### **Vérifier que les colonnes `team_id` ont été ajoutées :**

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'players' 
AND column_name = 'team_id';
```

## 🚨 **En cas d'erreur :**

### **Erreur "relation does not exist" :**
- Vérifiez que vous êtes dans le bon projet Supabase
- Vérifiez que la base de données est active

### **Erreur de permissions :**
- Vérifiez que vous êtes connecté avec un compte admin
- Vérifiez les politiques RLS

### **Erreur de contrainte :**
- Les données existantes seront automatiquement associées à l'équipe A par défaut

## ✅ **Après la migration réussie :**

1. **Rechargez votre application** webapp
2. **Le sélecteur d'équipe** devrait maintenant afficher :
   - 🔵 **Équipe A** (Senior - Niveau A)
   - 🟢 **Équipe B** (Senior - Niveau B)
   - 🟡 **U19** (U19 - Niveau A)
   - 🔴 **U17** (U17 - Niveau A)

3. **Testez la fonctionnalité** :
   - Cliquez sur une équipe pour la sélectionner
   - Vérifiez que l'équipe active change
   - Vérifiez que l'indicateur dans le header se met à jour

## 🚀 **Prochaines étapes :**

Une fois la migration réussie :
1. **Tester** le sélecteur d'équipe
2. **Vérifier** que l'équipe active est sauvegardée
3. **Implémenter** le filtrage des données par équipe

---

**Status** : 🗄️ Migration SQL à exécuter  
**Fichier** : `supabase_migration_teams.sql`  
**Action** : Exécuter dans Supabase SQL Editor
