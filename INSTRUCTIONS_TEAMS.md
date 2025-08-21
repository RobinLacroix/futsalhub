# 🔧 Instructions pour résoudre le problème du sélecteur d'équipe

## 🚨 **Problème identifié :**

Le sélecteur d'équipe n'apparaît pas car la table `teams` n'existe pas encore dans votre base de données Supabase.

## ✅ **Solution immédiate :**

J'ai créé un composant de test (`TestTeamSelector`) qui fonctionne avec des données fictives. Vous devriez maintenant voir le sélecteur d'équipe dans la sidebar.

## 🚀 **Pour activer la vraie fonctionnalité :**

### **Étape 1 : Exécuter la migration SQL**

1. Allez dans votre projet Supabase
2. Ouvrez l'éditeur SQL
3. Copiez et exécutez le contenu du fichier `supabase_migration_teams.sql`

### **Étape 2 : Vérifier la migration**

Exécutez cette requête pour vérifier que la table existe :
```sql
SELECT * FROM teams;
```

Vous devriez voir 4 équipes par défaut :
- Équipe A (Senior - Niveau A)
- Équipe B (Senior - Niveau B)  
- U19 (U19 - Niveau A)
- U17 (U17 - Niveau A)

### **Étape 3 : Activer le vrai sélecteur**

Une fois la migration effectuée, modifiez le fichier `app/webapp/components/Sidebar.tsx` :

**Remplacez :**
```tsx
<TestTeamSelector />
```

**Par :**
```tsx
{loading ? (
  <div className="text-center py-2">
    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto"></div>
    <span className="text-xs text-gray-500">Chargement...</span>
  </div>
) : teams.length > 0 ? (
  <TeamSelector
    selectedTeamId={activeTeamId}
    onTeamChange={changeActiveTeam}
    className="w-full"
  />
) : (
  <div className="text-center py-2">
    <span className="text-xs text-gray-500">Aucune équipe trouvée</span>
    <div className="mt-2">
      <Link 
        href="/webapp/manager/teams" 
        className="text-xs text-blue-600 hover:text-blue-800 underline"
      >
        Créer une équipe
      </Link>
    </div>
  </div>
)}
```

## 🧪 **Test de la fonctionnalité :**

1. **Avec le composant de test** : Vous devriez voir un sélecteur avec 3 équipes fictives
2. **Après la migration** : Le sélecteur se connectera à votre vraie base de données
3. **Changement d'équipe** : Cliquez sur le sélecteur pour voir le dropdown

## 🔍 **Débogage :**

Si le sélecteur n'apparaît toujours pas :

1. **Ouvrez la console du navigateur** (F12)
2. **Vérifiez les erreurs** dans l'onglet Console
3. **Regardez les logs** que j'ai ajoutés :
   - `useActiveTeam: Chargement des équipes...`
   - `Sidebar: activeTeamId: ...`
   - `Sidebar: teams: ...`

## 📱 **Ce que vous devriez voir maintenant :**

- ✅ Sélecteur d'équipe dans la sidebar (gauche)
- ✅ Dropdown avec 3 équipes de test
- ✅ Indicateur d'équipe active dans le header
- ✅ Page de gestion des équipes accessible

## 🎯 **Prochaines étapes :**

1. **Tester le composant de test** (fonctionne maintenant)
2. **Exécuter la migration SQL** dans Supabase
3. **Activer le vrai sélecteur** (remplacer TestTeamSelector)
4. **Tester avec de vraies données**

---

**Status actuel** : ✅ Sélecteur de test fonctionnel  
**Prochaine étape** : Migration SQL dans Supabase
