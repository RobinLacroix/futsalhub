/**
 * Tests physiques — modèle et règles de lecture.
 *
 * ## Fichier dupliqué verbatim web / mobile
 *
 * Jumeau : `lib/physicalTests.ts` (web). Même pattern que `lib/painMap.ts` et
 * `mobile/components/players/positions.ts` : les deux briques n'ont aucun code
 * partagé, et une règle de lecture recopiée à la main dans quatre écrans est
 * exactement le motif qui a produit quatre tables de couleurs de postes
 * divergentes. Toute modification ici se reporte dans le jumeau, sans exception.
 *
 * ## La règle qui justifie ce fichier : `direction`
 *
 * Un chrono BAS est une BONNE performance. Une détente BASSE est mauvaise. Un
 * poids n'est ni bon ni mauvais. Trois comportements différents pour la même
 * opération « comparer deux nombres », et le catalogue mélange les trois.
 *
 * Conséquence : aucun écran ne compare, ne trie ni ne colore une valeur de test
 * à la main. Tout passe par `progressDelta`, `compareValues` et `sortValues`.
 * Le jour où un écran écrit `after > before ? 'vert' : 'rouge'`, la moitié du
 * catalogue est fausse et personne ne le voit — un sprint amélioré s'affiche en
 * rouge, et le coach conclut l'inverse de la réalité.
 *
 * C'est la même famille de bug que le RPE coloré comme un jugement
 * (`components/player/ScaleSelector.tsx`) : avant de colorer une échelle,
 * vérifier ce que la métrique veut dire.
 */

export type PhysicalTestDirection = 'higher_is_better' | 'lower_is_better' | 'neutral';

export type PhysicalTestCategory =
  | 'vitesse'
  | 'agilite'
  | 'puissance'
  | 'endurance'
  | 'mobilite'
  | 'anthropometrie';

export type PhysicalTestAggregation = 'best' | 'mean' | 'last';

export interface PhysicalTestType {
  id: string;
  club_id: string | null; // null = test système, non modifiable par un club
  code: string;
  label: string;
  category: PhysicalTestCategory;
  unit: string;
  direction: PhysicalTestDirection;
  decimals: number;
  attempts: number;
  aggregation: PhysicalTestAggregation;
  protocol_note: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface PhysicalTestSession {
  id: string;
  club_id: string;
  team_id: string | null;
  training_id: string | null;
  date: string; // ISO 'YYYY-MM-DD'
  label: string | null;
  season: string | null;
  conditions: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PhysicalTestResult {
  id: string;
  session_id: string;
  club_id: string;
  player_id: string;
  test_type_id: string;
  attempt: number;
  value: number;
  is_retained: boolean;
  note: string | null;
  created_at: string;
}

export const CATEGORY_LABELS: Record<PhysicalTestCategory, string> = {
  vitesse: 'Vitesse',
  agilite: 'Agilité',
  puissance: 'Puissance',
  endurance: 'Endurance',
  mobilite: 'Mobilité',
  anthropometrie: 'Anthropométrie',
};

export const CATEGORY_ORDER: PhysicalTestCategory[] = [
  'vitesse',
  'agilite',
  'puissance',
  'endurance',
  'mobilite',
  'anthropometrie',
];

/**
 * Une métrique `neutral` (poids, taille) ne porte AUCUN jugement. Aucun écran ne
 * doit la colorer en positif/négatif ni la faire entrer dans un classement.
 * Le rappel vaut surtout pour les catégories jeunes : un adolescent qui prend
 * 3 kg n'a rien fait de bien ni de mal, il grandit.
 */
export function carriesJudgement(direction: PhysicalTestDirection): boolean {
  return direction !== 'neutral';
}

/** Verdict de comparaison, sans couleur : le rendu décide de la teinte. */
export type Comparison = 'better' | 'worse' | 'equal' | 'neutral';

/**
 * Compare deux valeurs d'un même test en tenant compte de sa direction.
 * `a` est la valeur observée, `b` la référence.
 */
export function compareValues(
  a: number,
  b: number,
  direction: PhysicalTestDirection,
  epsilon = 1e-9,
): Comparison {
  if (direction === 'neutral') return 'neutral';
  const diff = a - b;
  if (Math.abs(diff) <= epsilon) return 'equal';
  const aIsHigher = diff > 0;
  const higherIsBetter = direction === 'higher_is_better';
  return aIsHigher === higherIsBetter ? 'better' : 'worse';
}

/**
 * Progression entre deux mesures, exprimée en « gain utile » et toujours
 * orientée dans le bon sens : positif = le joueur a progressé, quel que soit le
 * test.
 *
 *   sprint 10 m : 1.85 s -> 1.79 s  =>  +0.06 (lower_is_better)
 *   CMJ         : 41 cm  -> 44 cm   =>  +3    (higher_is_better)
 *   poids       : 74 kg  -> 76 kg   =>  null  (neutral, pas de progression)
 */
export function progressDelta(
  before: number,
  after: number,
  direction: PhysicalTestDirection,
): number | null {
  if (direction === 'neutral') return null;
  return direction === 'lower_is_better' ? before - after : after - before;
}

/** Variation brute signée, pour les métriques neutres qu'on suit sans juger. */
export function rawDelta(before: number, after: number): number {
  return after - before;
}

/** Progression en pourcentage de la valeur de départ. `null` si non pertinent. */
export function progressPercent(
  before: number,
  after: number,
  direction: PhysicalTestDirection,
): number | null {
  const delta = progressDelta(before, after, direction);
  if (delta === null || before === 0) return null;
  return (delta / Math.abs(before)) * 100;
}

/**
 * Trie des valeurs de la meilleure à la moins bonne selon la direction.
 * Comparateur à passer à `Array.prototype.sort`.
 * Une direction `neutral` trie en décroissant, sans signification de mérite.
 */
export function bestFirstComparator(direction: PhysicalTestDirection) {
  return (a: number, b: number): number =>
    direction === 'lower_is_better' ? a - b : b - a;
}

/**
 * Valeur retenue parmi les essais, selon la règle du protocole.
 * Retourne `null` si aucun essai exploitable.
 *
 * `best` dépend de la direction : le meilleur sprint est le plus court, le
 * meilleur saut est le plus haut. C'est le piège classique de cette feature.
 */
export function retainedValue(
  values: number[],
  aggregation: PhysicalTestAggregation,
  direction: PhysicalTestDirection,
): number | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return null;

  switch (aggregation) {
    case 'mean':
      return clean.reduce((sum, v) => sum + v, 0) / clean.length;
    case 'last':
      return clean[clean.length - 1];
    case 'best':
    default:
      return [...clean].sort(bestFirstComparator(direction))[0];
  }
}

/**
 * Indices des essais retenus (pour marquer `is_retained` en base).
 * `mean` retient tous les essais : la moyenne les utilise tous.
 */
export function retainedAttemptIndexes(
  values: number[],
  aggregation: PhysicalTestAggregation,
  direction: PhysicalTestDirection,
): number[] {
  const indexed = values
    .map((value, index) => ({ value, index }))
    .filter((entry) => Number.isFinite(entry.value));
  if (indexed.length === 0) return [];

  switch (aggregation) {
    case 'mean':
      return indexed.map((entry) => entry.index);
    case 'last':
      return [indexed[indexed.length - 1].index];
    case 'best':
    default: {
      const comparator = bestFirstComparator(direction);
      return [[...indexed].sort((a, b) => comparator(a.value, b.value))[0].index];
    }
  }
}

/** Formate une valeur avec la précision du test, sans unité. */
export function formatTestValue(
  value: number | null | undefined,
  type: Pick<PhysicalTestType, 'decimals'>,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(type.decimals);
}

/** Formate une valeur avec son unité. Espace insécable avant l'unité. */
export function formatTestValueWithUnit(
  value: number | null | undefined,
  type: Pick<PhysicalTestType, 'decimals' | 'unit'>,
): string {
  const formatted = formatTestValue(value, type);
  if (formatted === '—') return formatted;
  return `${formatted} ${type.unit}`;
}

/**
 * Formate un écart en conservant son signe explicite. Un « +0.06 s » sur un
 * sprint se lit mal : `progressDelta` a déjà orienté le signe, donc le `+`
 * signifie « a progressé » et pas « a augmenté ». Les écrans doivent afficher
 * le libellé qui va avec, jamais le nombre seul.
 */
export function formatDelta(
  delta: number | null,
  type: Pick<PhysicalTestType, 'decimals' | 'unit'>,
): string {
  if (delta === null || !Number.isFinite(delta)) return '—';
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return `${sign}${Math.abs(delta).toFixed(type.decimals)} ${type.unit}`;
}

/**
 * Saisie française : la virgule décimale est acceptée.
 *
 * Retourne `null` si la saisie est illisible, JAMAIS 0. C'est le bug corrigé le
 * 2026-08-04 sur les deux `RatingScaleEditor` : `parseFloat('0,5')` vaut 0, donc
 * une valeur saisie à la virgule était enregistrée à zéro sans le dire. Sur un
 * chrono où bas = bon, un 0 silencieux ferait du joueur le plus rapide du club.
 */
export function parseTestInput(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '' || trimmed === '-' || trimmed === '.') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Découpe un collage tableur en grille de cellules brutes.
 *
 * Excel, Numbers et Google Sheets mettent tous une tabulation entre colonnes et
 * un saut de ligne entre lignes ; c'est le seul format à gérer. Les cellules ne
 * sont PAS interprétées ici : elles repartent en texte, et c'est
 * `parseTestInput` qui décide plus tard si « 1,79 » est un nombre et si
 * « Dupont » n'en est pas un. Séparer les deux étapes permet à l'écran de
 * garder la saisie illisible affichée en erreur, au lieu de l'avaler en
 * silence.
 */
export function parsePastedGrid(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.map((line) => line.split('\t'));
}

/** Moyenne d'un échantillon, `null` si vide. Sert de référentiel d'effectif. */
export function mean(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return null;
  return clean.reduce((sum, v) => sum + v, 0) / clean.length;
}

/** Ordre d'affichage d'un catalogue : catégorie, puis `sort_order`, puis libellé. */
export function compareTestTypes(a: PhysicalTestType, b: PhysicalTestType): number {
  const categoryDiff =
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  if (categoryDiff !== 0) return categoryDiff;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.label.localeCompare(b.label, 'fr');
}

/** Trie un catalogue par catégorie puis par `sort_order`. */
export function sortTestTypes(types: PhysicalTestType[]): PhysicalTestType[] {
  return [...types].sort(compareTestTypes);
}

// ─── Séries de progression ───────────────────────────────────────────────────

/** Clé de regroupement d'une mesure : une campagne, un test. */
export function measureKey(sessionId: string, testTypeId: string): string {
  return `${sessionId}:${testTypeId}`;
}

/** Une campagne = un point. Les essais y sont déjà réduits à la valeur retenue. */
export interface TestSeriesPoint {
  sessionId: string;
  date: string; // ISO 'YYYY-MM-DD'
  value: number;
}

export interface PlayerTestSeries {
  type: PhysicalTestType;
  /** Chronologique croissant. Une campagne n'y apparaît qu'une fois. */
  points: TestSeriesPoint[];
  latest: TestSeriesPoint;
  previous: TestSeriesPoint | null;
  /** Meilleure valeur jamais mesurée, au sens de `direction`. */
  best: number;
  /**
   * Progression depuis la campagne précédente, orientée par `progressDelta` :
   * positif = le joueur a progressé. `null` s'il n'y a qu'un point ou si le test
   * est `neutral` — un poids ne progresse pas, il varie.
   */
  delta: number | null;
}

/** Ligne minimale attendue en entrée : un essai retenu, daté par sa campagne. */
export interface RetainedMeasure {
  session_id: string;
  test_type_id: string;
  value: number;
  date: string;
}

/**
 * Construit les séries de progression d'un joueur à partir de ses essais retenus.
 *
 * Deux pièges traités ici, et nulle part ailleurs :
 *
 * 1. **Un test à `aggregation: 'mean'` retient TOUS ses essais.** Les lignes de
 *    `physical_test_results` ne sont donc pas des points de courbe : il faut
 *    d'abord les réduire par campagne via `retainedValue`, sinon une campagne à
 *    3 essais produit 3 points au même abscisse.
 * 2. **Le meilleur résultat dépend de `direction`.** `best` passe par
 *    `bestFirstComparator`, jamais par `Math.max`.
 */
export function buildPlayerSeries(
  rows: RetainedMeasure[],
  types: PhysicalTestType[],
): PlayerTestSeries[] {
  const typeById = new Map(types.map((t) => [t.id, t]));

  const grouped = new Map<
    string,
    { sessionId: string; date: string; testTypeId: string; values: number[] }
  >();
  for (const row of rows) {
    if (!typeById.has(row.test_type_id)) continue;
    const key = measureKey(row.session_id, row.test_type_id);
    const entry = grouped.get(key);
    if (entry) entry.values.push(row.value);
    else
      grouped.set(key, {
        sessionId: row.session_id,
        date: row.date,
        testTypeId: row.test_type_id,
        values: [row.value],
      });
  }

  const pointsByType = new Map<string, TestSeriesPoint[]>();
  for (const entry of grouped.values()) {
    const type = typeById.get(entry.testTypeId)!;
    const value = retainedValue(entry.values, type.aggregation, type.direction);
    if (value === null) continue;
    const list = pointsByType.get(entry.testTypeId) ?? [];
    list.push({ sessionId: entry.sessionId, date: entry.date, value });
    pointsByType.set(entry.testTypeId, list);
  }

  const series: PlayerTestSeries[] = [];
  for (const [testTypeId, points] of pointsByType) {
    const type = typeById.get(testTypeId)!;
    points.sort((a, b) => a.date.localeCompare(b.date));
    const latest = points[points.length - 1];
    const previous = points.length > 1 ? points[points.length - 2] : null;
    series.push({
      type,
      points,
      latest,
      previous,
      best: [...points.map((pt) => pt.value)].sort(bestFirstComparator(type.direction))[0],
      delta: previous ? progressDelta(previous.value, latest.value, type.direction) : null,
    });
  }

  return series.sort((a, b) => compareTestTypes(a.type, b.type));
}

/** Repère d'effectif sur une campagne et un test. */
export interface SquadReference {
  mean: number;
  /** Nombre de JOUEURS mesurés, pas de lignes. */
  count: number;
}

/**
 * Sous ce nombre de joueurs, aucune moyenne n'est publiable : un « repère
 * d'effectif » calculé sur deux joueurs n'est pas un repère, c'est un
 * classement à deux, et il se lit comme un jugement alors qu'il n'en est pas un.
 */
export const MIN_SQUAD_REFERENCE = 3;

/**
 * Moyennes d'effectif par campagne et par test, en DEUX niveaux.
 *
 * Le niveau intermédiaire (réduire d'abord chaque joueur à sa valeur retenue)
 * n'est pas une précaution de style. Sur un test à `aggregation: 'mean'`, tous
 * les essais sont retenus : moyenner directement les lignes donnerait à un
 * joueur ayant fait 3 essais un poids triple de celui qui n'en a fait qu'un.
 * La moyenne du groupe pencherait vers les joueurs les plus testés.
 */
export function squadAverages(
  rows: Array<RetainedMeasure & { player_id: string }>,
  types: PhysicalTestType[],
): Map<string, SquadReference> {
  const typeById = new Map(types.map((t) => [t.id, t]));

  // Niveau 1 : (campagne, test, joueur) -> essais.
  const byPlayer = new Map<string, number[]>();
  for (const row of rows) {
    if (!typeById.has(row.test_type_id)) continue;
    const key = `${measureKey(row.session_id, row.test_type_id)}:${row.player_id}`;
    const list = byPlayer.get(key);
    if (list) list.push(row.value);
    else byPlayer.set(key, [row.value]);
  }

  // Niveau 2 : (campagne, test) -> une valeur par joueur.
  const byMeasure = new Map<string, number[]>();
  for (const [key, values] of byPlayer) {
    const [sessionId, testTypeId] = key.split(':');
    const type = typeById.get(testTypeId)!;
    const value = retainedValue(values, type.aggregation, type.direction);
    if (value === null) continue;
    const measure = measureKey(sessionId, testTypeId);
    const list = byMeasure.get(measure);
    if (list) list.push(value);
    else byMeasure.set(measure, [value]);
  }

  const out = new Map<string, SquadReference>();
  for (const [key, values] of byMeasure) {
    const avg = mean(values);
    if (avg === null) continue;
    out.set(key, { mean: avg, count: values.length });
  }
  return out;
}
