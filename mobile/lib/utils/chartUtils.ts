import type { Player } from '../../types';

export interface ChartDataItem {
  name: string;
  value: number;
}

/** Agrège les joueurs par un champ (ex: status, strong_foot). */
export function aggregateByField(
  data: Player[],
  field: keyof Player
): ChartDataItem[] {
  const counts: Record<string, number> = {};
  data.forEach((item) => {
    const value = item[field];
    if (value != null && value !== '') {
      const key = String(value);
      counts[key] = (counts[key] || 0) + 1;
    }
  });
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

/** Moyenne d'un champ numérique par groupe (ex: matches_played par status). */
export function calculateAverageByField(
  data: Player[],
  groupField: keyof Player,
  valueField: string
): ChartDataItem[] {
  const groups: Record<string, number[]> = {};
  data.forEach((item) => {
    const groupVal = item[groupField];
    const numVal = (item as Record<string, unknown>)[valueField];
    if (groupVal != null && typeof numVal === 'number') {
      const key = String(groupVal);
      if (!groups[key]) groups[key] = [];
      groups[key].push(numVal);
    }
  });
  return Object.entries(groups).map(([name, values]) => ({
    name,
    value: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)),
  }));
}

export const CHART_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
