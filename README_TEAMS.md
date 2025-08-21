# 🏆 Gestion des équipes - FutsalHub

## 📋 **Vue d'ensemble**

Cette fonctionnalité permet de gérer plusieurs équipes du même club (ex: Équipe A, Équipe B, U19, U17) avec toutes les fonctionnalités existantes (joueurs, matchs, entraînements, statistiques) filtrées par équipe.

## 🚀 **Installation**

### **1. Exécuter la migration SQL**

Dans votre projet Supabase, exécutez le script `supabase_migration_teams.sql` :

```sql
-- Copier et exécuter le contenu du fichier supabase_migration_teams.sql
```

### **2. Vérifier la structure**

Après la migration, vous devriez avoir :
- ✅ Table `teams` créée
- ✅ Champs `team_id` ajoutés aux tables existantes
- ✅ Équipes par défaut créées
- ✅ Index et politiques RLS configurés

## 🎯 **Fonctionnalités**

### **Sélecteur d'équipe**
- **Emplacement** : Sidebar (gauche de l'écran)
- **Fonction** : Choisir l'équipe active
- **Persistance** : L'équipe sélectionnée est sauvegardée dans le localStorage

### **Indicateur d'équipe active**
- **Emplacement** : Header (gauche)
- **Affichage** : Nom de l'équipe + couleur d'identification
- **Mise à jour** : Automatique lors du changement d'équipe

### **Gestion des équipes**
- **Page** : `/webapp/manager/teams`
- **Actions** : Créer, modifier, supprimer des équipes
- **Attributs** : Nom, catégorie, niveau, couleur

## 🔧 **Configuration des équipes**

### **Équipes par défaut créées :**
1. **Équipe A** (Senior - Niveau A) - 🔵 Bleu
2. **Équipe B** (Senior - Niveau B) - 🟢 Vert  
3. **U19** (U19 - Niveau A) - 🟠 Orange
4. **U17** (U17 - Niveau A) - 🔴 Rouge

### **Attributs configurables :**
- **Nom** : Nom de l'équipe
- **Catégorie** : Senior, U19, U17, U15, U13
- **Niveau** : A, B, C, D
- **Couleur** : Couleur hexadécimale pour l'identification

## 📱 **Interface utilisateur**

### **Sidebar**
```
┌─────────────────┐
│ [Équipe A ▼]    │ ← Sélecteur d'équipe
├─────────────────┤
│ 🏠 Accueil      │
│ 📅 Calendrier   │
│ 👥 Effectif     │
│ 📊 Dashboard    │
│ 🛡️ Équipes      │ ← Nouvelle section
└─────────────────┘
```

### **Header**
```
┌─────────────────────────────────────┐
│ 🔵 Équipe A                    👤 U │
└─────────────────────────────────────┘
```

## 🔄 **Filtrage automatique**

Une fois l'équipe sélectionnée, **toutes les données** sont automatiquement filtrées :

- **Joueurs** : Seuls les joueurs de l'équipe active
- **Matchs** : Seuls les matchs de l'équipe active  
- **Entraînements** : Seuls les entraînements de l'équipe active
- **Statistiques** : Calculées uniquement pour l'équipe active
- **Événements** : Seuls les événements de l'équipe active

## 📊 **Statistiques par équipe**

Chaque équipe affiche ses statistiques :
- 👥 Nombre de joueurs
- 🏆 Nombre de matchs
- 📅 Nombre d'entraînements
- ⚽ Total des buts marqués
- 📈 Taux de présence

## 🚨 **Points d'attention**

### **Données existantes**
- Les données existantes sont automatiquement assignées à l'**Équipe A**
- Aucune perte de données lors de la migration

### **Sécurité**
- Politiques RLS configurées pour la table `teams`
- Accès limité aux utilisateurs authentifiés

### **Performance**
- Index créés sur `team_id` pour optimiser les requêtes
- Fonctions SQL optimisées pour les statistiques

## 🧪 **Test de la fonctionnalité**

### **1. Vérifier la migration**
```sql
-- Vérifier que la table teams existe
SELECT * FROM teams;

-- Vérifier que les champs team_id sont présents
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'players' AND column_name = 'team_id';
```

### **2. Tester le sélecteur**
- Aller sur `/webapp/manager/teams`
- Créer une nouvelle équipe
- Changer d'équipe dans la sidebar
- Vérifier que les données se filtrent

### **3. Vérifier le filtrage**
- Changer d'équipe
- Vérifier que seules les données de cette équipe s'affichent
- Tester sur différentes pages (Effectif, Calendrier, Dashboard)

## 🔮 **Évolutions futures**

### **Fonctionnalités envisagées :**
- [ ] Transferts de joueurs entre équipes
- [ ] Matchs inter-équipes
- [ ] Statistiques comparatives entre équipes
- [ ] Gestion des staffs par équipe
- [ ] Permissions par équipe

### **Améliorations techniques :**
- [ ] Cache des données par équipe
- [ ] Synchronisation en temps réel
- [ ] Export des données par équipe
- [ ] API REST pour les équipes

## 📞 **Support**

En cas de problème :
1. Vérifier les logs de la console
2. Contrôler la migration SQL
3. Vérifier les politiques RLS
4. Tester avec une équipe par défaut

---

**Version** : 1.0.0  
**Date** : Décembre 2024  
**Auteur** : Assistant IA
