# FutsalHub3

Application de gestion et de suivi de matchs de futsal avec analyse de données en temps réel.

## Composants Principaux

### EventsTimelineChart

Un composant React spécialisé pour visualiser l'évolution des événements par type en fonction du temps de match.

#### Fonctionnalités

- **Segments de 5 minutes** : Divise le temps de match en segments de 5 minutes (0-5, 5-10, 10-15, etc.)
- **6 types d'événements** avec couleurs distinctes :
  - 🟢 **But** (goal) - Vert
  - 🔵 **Tir cadré** (shot_on_target) - Bleu  
  - ⚫ **Tir** (shot) - Gris
  - 🔴 **But concédé** (opponent_goal) - Rouge
  - 🟠 **Tir cadré concédé** (opponent_shot_on_target) - Orange
  - 🟣 **Tir concédé** (opponent_shot) - Rose
- **Données cumulatives** : Chaque segment affiche le nombre total d'événements jusqu'à ce moment
- **Filtrage par match** : Possibilité de filtrer les données par match spécifique
- **Responsive** : Optimisé pour tablette et desktop
- **Tooltips informatifs** : Affiche "Segment X-Y min - [Type] : [Valeur cumulée]"

#### Utilisation

```tsx
import EventsTimelineChart from '@/app/webapp/components/EventsTimelineChart'

// Pour tous les matchs
<EventsTimelineChart />

// Pour des matchs spécifiques
<EventsTimelineChart selectedMatchIds={['match-id-1', 'match-id-2']} />
```

#### Structure des données

Le composant récupère les données depuis la table Supabase `match_events` avec les colonnes :
- `id` : Identifiant unique
- `match_id` : ID du match
- `event_type` : Type d'événement
- `match_time_seconds` : Temps du match en secondes
- `half` : Mi-temps (1 ou 2)
- `player_id` : ID du joueur (optionnel)
- `players_on_field` : Array des joueurs sur le terrain
- `created_at` : Timestamp de création

#### Algorithme de traitement

1. **Récupération** : Récupère tous les événements depuis Supabase
2. **Segmentation** : Calcule l'index de segment = `floor(match_time_seconds / 300)`
3. **Cumul** : Pour chaque événement, incrémente le segment actuel et tous les suivants
4. **Visualisation** : Crée des courbes lissées avec Chart.js

## Installation et Démarrage

```bash
npm install
npm run dev
```

## Technologies Utilisées

- **Frontend** : Next.js 15, React 19, TypeScript
- **Graphiques** : Chart.js 4, react-chartjs-2
- **Base de données** : Supabase
- **Styling** : Tailwind CSS
- **Icons** : Lucide React
