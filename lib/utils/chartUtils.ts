import type { Player, ChartData } from '@/types';

/**
 * Agrège les données par un champ spécifique
 */
export const aggregateByField = (data: Player[], field: keyof Player): ChartData[] => {
  const counts = data.reduce((acc: { [key: string]: number }, item) => {
    const value = item[field];
    if (value) {
      acc[value.toString()] = (acc[value.toString()] || 0) + 1;
    }
    return acc;
  }, {});

  return Object.entries(counts).map(([name, value]) => ({ name, value }));
};

/**
 * Calcule la moyenne d'un champ par groupe
 */
export const calculateAverageByField = (
  data: Player[],
  groupField: keyof Player,
  valueField: keyof Player
): ChartData[] => {
  const groups = data.reduce((acc: { [key: string]: number[] }, item) => {
    const groupValue = item[groupField];
    const value = item[valueField];
    
    if (groupValue && typeof value === 'number') {
      if (!acc[groupValue.toString()]) {
        acc[groupValue.toString()] = [];
      }
      acc[groupValue.toString()].push(value);
    }
    return acc;
  }, {});

  return Object.entries(groups).map(([name, values]) => ({
    name,
    value: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1))
  }));
};

/**
 * Couleurs par défaut pour les graphiques
 */
export const CHART_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];



