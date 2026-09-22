import type { Drill, DrillEntity, DrillTeamStyle } from './types';

/**
 * Port de TEAM_DEFAULTS/teamKeyOf/teamStyle (render-core.js, web) — mêmes
 * couleurs par défaut (COL.home/away/support), même règle de résolution.
 * `e.color`/`e.size` restent prioritaires sur `drill.teams` : un jeton
 * recoloré à la main ne doit pas bouger si la couleur d'équipe change.
 */
const TEAM_DEFAULTS: Record<'home' | 'away' | 'support', Required<Pick<DrillTeamStyle, 'name' | 'fill' | 'stroke' | 'text' | 'size'>>> = {
  home: { name: 'Nous', fill: '#1e63d6', stroke: '#ffffff', text: '#ffffff', size: 0.9 },
  away: { name: 'Adversaire', fill: '#d63b2f', stroke: '#ffffff', text: '#ffffff', size: 0.9 },
  support: { name: 'Appuis', fill: '#e0a021', stroke: '#ffffff', text: '#ffffff', size: 0.9 },
};

export const BALL_COLOR = '#ffffff';

export function teamKeyOf(e: Pick<DrillEntity, 'type' | 'team'>): 'home' | 'away' | 'support' {
  if (e.type === 'support') return 'support';
  return e.team === 'home' ? 'home' : e.team === 'away' ? 'away' : 'support';
}

export interface ResolvedTeamStyle {
  key: 'home' | 'away' | 'support';
  name: string;
  fill: string;
  stroke: string;
  text: string;
  size: number;
  shape: 'circle' | 'square' | 'triangle' | 'diamond' | 'body';
}

export function teamStyle(drill: Pick<Drill, 'teams'>, e: DrillEntity): ResolvedTeamStyle {
  const key = teamKeyOf(e);
  const d = TEAM_DEFAULTS[key];
  const t = drill.teams?.[key] ?? {};
  // Forme par défaut : appui = carré, le reste rond — comme côté web (independant de l'équipe).
  const defaultShape = key === 'support' ? 'square' : 'circle';
  return {
    key,
    name: t.name || d.name,
    fill: e.color || t.fill || d.fill,
    stroke: t.stroke || d.stroke,
    text: t.text || d.text,
    size: e.size || t.size || d.size,
    shape: (e.shape || (t.shape as ResolvedTeamStyle['shape']) || defaultShape) as ResolvedTeamStyle['shape'],
  };
}
