import {
  Target,
  Crosshair,
  Goal,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';

export const ACTIONS = [
  { id: 'shotsOnTarget', name: 'Tir cadré', acronym: 'TC', icon: Target, color: 'bg-green-500' },
  { id: 'shotsOffTarget', name: 'Tir non cadré', acronym: 'TnC', icon: Crosshair, color: 'bg-yellow-500' },
  { id: 'goals', name: 'But', acronym: 'B', icon: Goal, color: 'bg-blue-500' },
  { id: 'ballLoss', name: 'Perte de balle', acronym: 'PdB', icon: AlertTriangle, color: 'bg-red-500' },
  { id: 'ballRecovery', name: 'Récupération', acronym: 'R', icon: RefreshCw, color: 'bg-green-600' },
  { id: 'assists', name: 'Passe décisive', acronym: 'Pdec', icon: ArrowRight, color: 'bg-purple-500' },
];

export const DEFAULT_SEQUENCE_TIME_LIMIT = 180;
