/**
 * Couleurs de chasubles. Le `token` est ce qui part en base (`training_squads.color_token`), jamais l'hex.
 * Ce sont des couleurs physiques : elles ne suivent pas le thème clair/sombre, sinon l'aplat ne
 * ressemblerait plus à la chasuble que le joueur porte.
 * Les anciens tokens numériques (index dans `chartSeries`) restent lisibles.
 */
export interface BibColor {
  token: string;
  /** Nom de l'équipe par défaut quand on choisit cette couleur. */
  label: string;
  hex: string;
}

export const BIB_COLORS: readonly BibColor[] = [
  { token: 'jaune', label: 'Jaunes', hex: '#FFD400' },
  { token: 'orange', label: 'Oranges', hex: '#FF7A00' },
  { token: 'rouge', label: 'Rouges', hex: '#E5252A' },
  { token: 'rose', label: 'Roses', hex: '#FF5FA2' },
  { token: 'violet', label: 'Violets', hex: '#7B3FC9' },
  { token: 'bleu', label: 'Bleus', hex: '#1E6FE0' },
  { token: 'ciel', label: 'Bleu ciel', hex: '#4CC3F0' },
  { token: 'vert', label: 'Verts', hex: '#22B14C' },
  { token: 'blanc', label: 'Blancs', hex: '#FFFFFF' },
  { token: 'noir', label: 'Noirs', hex: '#1A1A1D' },
];

export const bibByToken = (token: string): BibColor | undefined => BIB_COLORS.find((b) => b.token === token);

/** Hex d'un token de plateau ; repli sur `chartSeries` pour les anciens tokens numériques. */
export function squadColor(token: string, chartSeries: readonly string[]): string {
  const bib = bibByToken(token);
  if (bib) return bib.hex;
  return chartSeries[(Number(token) || 0) % chartSeries.length];
}

/** Premier token de chasuble encore libre. */
export function firstFreeBib(used: string[]): BibColor {
  return BIB_COLORS.find((b) => !used.includes(b.token)) ?? BIB_COLORS[0];
}
