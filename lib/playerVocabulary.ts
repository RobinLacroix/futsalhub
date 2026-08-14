/**
 * Vocabulaire des attributs joueur — source unique côté web
 *
 * ## Le problème
 *
 * `strong_foot` est une colonne texte libre, écrite depuis quatre endroits qui
 * ne se sont jamais accordés :
 *
 *   - mobile `new-player`        → `"Droit et gauche"`
 *   - mobile modale d'édition    → `"Les deux"`   (corrigé le 2026-08-03)
 *   - web création / édition     → `"Ambidextre"`
 *   - import CSV web             → n'accepte que `"Ambidextre"`
 *
 * Ce n'est pas un défaut cosmétique. Les filtres « pied fort » du web
 * (`season-planning`, `PlayerFilters`) proposent la liste web : **un joueur
 * créé sur mobile n'apparaît sous aucun filtre**, il est simplement absent des
 * résultats. `footDistribution` du tableau de bord compte la même réalité dans
 * deux colonnes séparées. Et l'import CSV rejette « Droit et gauche » comme
 * valeur invalide.
 *
 * ## La valeur retenue
 *
 * `"Droit et gauche"`, c'est-à-dire celle de mobile. Deux raisons : c'est la
 * plus ancienne, donc la plus représentée dans les données existantes, et
 * l'application mobile a déjà été alignée dessus le 2026-08-03 — la changer
 * ici imposerait une seconde bascule côté mobile pour rien.
 *
 * Le libellé affiché reste court (« Les deux »). Valeur stockée et libellé
 * affiché sont deux choses distinctes ; les confondre est précisément ce qui a
 * produit trois vocabulaires.
 *
 * `normalizeStrongFoot` accepte les quatre orthographes historiques et les
 * ramène à la valeur canonique. Elle sert à l'import, et elle protège la
 * lecture tant que la base n'est pas normalisée.
 */

export const STRONG_FOOT_OPTIONS = [
  { value: 'Droit', label: 'Droit' },
  { value: 'Gauche', label: 'Gauche' },
  { value: 'Droit et gauche', label: 'Les deux' },
] as const;

export type StrongFoot = (typeof STRONG_FOOT_OPTIONS)[number]['value'];

export const STRONG_FOOT_VALUES: readonly string[] = STRONG_FOOT_OPTIONS.map((o) => o.value);

/** Orthographes rencontrées en base ou dans les fichiers importés. */
const STRONG_FOOT_ALIASES: Record<string, StrongFoot> = {
  droit: 'Droit',
  'pied droit': 'Droit',
  d: 'Droit',
  gauche: 'Gauche',
  'pied gauche': 'Gauche',
  g: 'Gauche',
  ambidextre: 'Droit et gauche',
  'les deux': 'Droit et gauche',
  'droit et gauche': 'Droit et gauche',
  'deux pieds': 'Droit et gauche',
};

/** Renvoie la valeur canonique, ou `null` si la saisie n'est pas reconnue. */
export function normalizeStrongFoot(raw: unknown): StrongFoot | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  return STRONG_FOOT_ALIASES[key] ?? null;
}

/** Libellé d'affichage d'une valeur stockée, y compris non normalisée. */
export function strongFootLabel(raw: unknown): string {
  const value = normalizeStrongFoot(raw);
  if (!value) return typeof raw === 'string' && raw.trim() ? raw : '—';
  return STRONG_FOOT_OPTIONS.find((o) => o.value === value)!.label;
}
