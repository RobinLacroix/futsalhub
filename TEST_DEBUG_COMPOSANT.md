# 🔍 Test du Composant de Debug

## 🎯 **Objectif :**

Diagnostiquer pourquoi le filtrage par équipe ne fonctionne pas en utilisant un composant de debug détaillé.

## 🧪 **Composant de debug activé :**

J'ai remplacé temporairement `SimpleTeamSelector` par `DebugTeamSelector` dans la sidebar.

## 🔍 **Ce que vous devriez voir maintenant :**

### **Dans la sidebar (quand elle est étendue) :**
- **Composant PURPLE** avec "🔍 DEBUG HOOK"
- **État du hook** : Loading, Teams count, Active team
- **Équipe active** (si définie) avec tous les détails
- **Liste des équipes** disponibles avec boutons de sélection
- **Bouton de test** 🧪 Test Console

### **Dans la console (F12) :**
```
🔍 DebugTeamSelector - Hook complet: {
  activeTeam: {...},
  teamsCount: 4,
  loading: false,
  teams: [...],
  activeTeamId: "uuid-...",
  activeTeamName: "Équipe A"
}
```

## 📊 **Diagnostic étape par étape :**

### **Étape 1 : Vérifier l'affichage**
1. **Allez sur** `/webapp/manager/squad`
2. **Étendez la sidebar** (bouton chevron)
3. **Vérifiez** que le composant purple s'affiche

### **Étape 2 : Vérifier la console**
1. **Ouvrez la console** (F12)
2. **Rechargez la page**
3. **Vérifiez** les logs du composant de debug

### **Étape 3 : Tester la sélection d'équipe**
1. **Cliquez** sur une équipe différente
2. **Observez** les changements dans le composant
3. **Vérifiez** que l'équipe active change

## 🔍 **Points de diagnostic :**

### **Si le composant ne s'affiche pas :**
- Problème avec le layout ou les imports
- Vérifier la console pour les erreurs

### **Si `teams.length === 0` :**
- Migration SQL pas exécutée
- Problème avec la table `teams` dans Supabase

### **Si `activeTeam` est `null` :**
- Problème avec la sélection d'équipe par défaut
- Vérifier le localStorage et la logique du hook

### **Si les équipes s'affichent mais pas de filtrage :**
- Problème avec les requêtes Supabase
- Vérifier que les `team_id` sont corrects

## 🚨 **Messages d'erreur possibles :**

### **"Aucune équipe trouvée" :**
- Exécuter la migration SQL dans Supabase
- Vérifier que la table `teams` existe

### **"Hook data undefined" :**
- Problème avec le hook `useActiveTeam`
- Vérifier les imports et la structure

### **"Requête Supabase échoue" :**
- Problème de connexion à Supabase
- Vérifier les variables d'environnement

## 🎯 **Résultat attendu :**

- ✅ **Composant purple** visible dans la sidebar
- ✅ **4 équipes** affichées (Équipe A, B, U19, U17)
- ✅ **Équipe active** sélectionnée par défaut
- ✅ **Logs détaillés** dans la console
- ✅ **Changement d'équipe** fonctionnel

## 🚀 **Actions après diagnostic :**

1. **Confirmer** que le composant de debug s'affiche
2. **Vérifier** les logs de la console
3. **Tester** le changement d'équipe
4. **Identifier** le point de blocage exact

---

**Status** : 🔍 Composant de debug activé  
**Test** : Vérifier l'affichage du composant purple et les logs de la console  
**Action** : Diagnostiquer le problème avec le hook useActiveTeam
