/**
 * Couleurs d'identité d'équipe — catalogue unique
 *
 * Volontairement figées et hors du thème : elles sont **stockées en base** et
 * servent à reconnaître une équipe d'un écran à l'autre, comme un maillot. Les
 * faire suivre le thème changerait l'identité d'une équipe selon le mode
 * d'affichage. Elles sont choisies suffisamment saturées pour rester lisibles
 * sur fond clair comme sur fond sombre — l'ancienne série était calibrée pour
 * du blanc uniquement.
 *
 * ## Pourquoi ce fichier existe
 *
 * La palette vivait dans `app/(tabs)/teams/index.tsx`, mais elle a un second
 * émetteur : `createUserClub` (`lib/services/clubs.ts`), qui crée la première
 * équipe de tout nouveau club. Celui-ci écrivait `#3b82f6` en dur — un bleu qui
 * n'appartient plus à la palette depuis sa révision, et que l'écran Équipes ne
 * sait donc pas re-proposer.
 *
 * Effet concret : le tout premier club d'un coach recevait une équipe d'une
 * couleur introuvable dans le sélecteur. Il pouvait en changer, jamais y
 * revenir. C'est le même motif que la table des postes trouvée quatre fois :
 * une donnée catégorielle écrite à plusieurs endroits finit toujours par
 * diverger. Un seul émetteur, donc.
 */

export const TEAM_COLORS = [
  '#5B8DEF',
  '#2DBE8C',
  '#F2994A',
  '#EB5757',
  '#9B7BEA',
  '#20B8CE',
] as const;

export type TeamColor = (typeof TEAM_COLORS)[number];

/** Couleur attribuée par défaut à une équipe créée sans choix explicite. */
export const DEFAULT_TEAM_COLOR: TeamColor = TEAM_COLORS[0];
