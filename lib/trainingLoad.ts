/**
 * Charge d'entraînement et wellness — modèle et règles de lecture.
 *
 * ## Fichier dupliqué verbatim web / mobile
 *
 * Jumeau : `mobile/lib/trainingLoad.ts`. Même pattern que `lib/availability.ts`,
 * `lib/physicalTests.ts` et `lib/painMap.ts`. Toute modification ici se reporte
 * dans le jumeau, sans exception.
 *
 * ## Le piège central : la monotonie se calcule sur SEPT jours
 *
 * La monotonie de Foster est la moyenne des charges QUOTIDIENNES divisée par
 * leur écart-type, sur les sept jours de la semaine, **jours de repos inclus à
 * charge zéro**. C'est exactement ce qui lui donne son sens : une semaine à
 * trois séances et quatre jours de repos est très variable, donc peu monotone,
 * donc plutôt protectrice.
 *
 * L'erreur classique est de ne diviser que par le nombre de séances. Une semaine
 * à trois séances identiques donne alors un écart-type de zéro, donc une
 * monotonie infinie, alors que la même semaine calculée correctement descend
 * autour de 1,2. Le chiffre passe de « alerte maximale » à « rien à signaler ».
 * `weeklyMonotony` inclut donc toujours les sept jours.
 *
 * ## Une charge est une MESURE, jamais une note
 *
 * Aucun écran ne colore une charge en vert ou en rouge. Rampe d'intensité
 * neutre, comme le RPE (`components/player/ScaleSelector.tsx`, `kind:
 * 'intensity'`). Seul le PIC est signalé, et en `warning` : c'est une
 * information à traiter, pas une faute. Un joueur qui encaisse une grosse
 * semaine n'a rien fait de mal.
 *
 * Le wellness, lui, porte un jugement assumé (`kind: 'judgement'` dans le
 * questionnaire) : forme, plaisir et auto-évaluation peuvent être colorés.
 *
 * ## Le taux de réponse accompagne TOUT agrégat
 *
 * Une charge hebdomadaire calculée sur 40 % de réponses est un chiffre faux
 * présenté comme vrai. `isReliable` tranche, et l'écran doit griser ou masquer
 * ce qui ne l'est pas. Sans ça, la feature produit de la fausse confiance, ce
 * qui est pire que de ne rien afficher.
 */

// ─── Entrée ──────────────────────────────────────────────────────────────────

/** Une séance, telle que la renvoie `get_training_load`. */
export interface TrainingLoadRow {
  training_id: string;
  session_date: string; // ISO 'YYYY-MM-DD'
  team_id: string | null;
  theme: string | null;
  session_duration: number | null; // minutes
  convoked_count: number;
  response_count: number;
  rpe_mean: number | null;
  auto_evaluation_mean: number | null;
  physical_form_mean: number | null;
  pleasure_mean: number | null;
}

// ─── Charge de séance ────────────────────────────────────────────────────────

/**
 * Charge de séance (Foster) = RPE × durée, en unités arbitraires.
 *
 * Pas de discussion sur la formule, c'est le standard. `null` quand la donnée
 * manque : une séance sans durée saisie ou sans aucune réponse n'a pas de
 * charge, et lui en inventer une (durée par défaut, RPE médian) fabriquerait
 * une courbe qui a l'air vraie.
 */
export function sessionLoad(row: TrainingLoadRow): number | null {
  if (row.rpe_mean === null || row.session_duration === null) return null;
  if (!Number.isFinite(row.rpe_mean) || row.session_duration <= 0) return null;
  return row.rpe_mean * row.session_duration;
}

/** Taux de réponse d'une séance, entre 0 et 1. `null` si personne n'était convoqué. */
export function responseRate(row: Pick<TrainingLoadRow, 'convoked_count' | 'response_count'>) {
  if (!row.convoked_count) return null;
  return Math.min(1, row.response_count / row.convoked_count);
}

/**
 * Seuil sous lequel un agrégat n'est pas publiable tel quel.
 *
 * 60 % est le seuil retenu à la spécification. Il est exposé pour que l'écran
 * puisse l'afficher : « calculé sur 45 % de réponses » est une information, pas
 * un détail d'implémentation.
 */
export const MIN_RESPONSE_RATE = 0.6;

export function isReliable(rate: number | null): boolean {
  return rate !== null && rate >= MIN_RESPONSE_RATE;
}

// ─── Semaines ────────────────────────────────────────────────────────────────

export interface WeeklyLoad {
  /** Lundi de la semaine, ISO 'YYYY-MM-DD'. */
  weekStart: string;
  sessions: number;
  /** Somme des charges de séance. `null` si aucune séance exploitable. */
  load: number | null;
  /**
   * Monotonie de Foster : moyenne / écart-type des charges des SEPT jours.
   * `null` si la semaine n'a pas assez de matière ou si l'écart-type est nul.
   */
  monotony: number | null;
  /** Contrainte = charge × monotonie. Le produit que la littérature suit. */
  strain: number | null;
  /** Couverture du questionnaire sur la semaine, entre 0 et 1. */
  responseRate: number | null;
  /** Moyennes de wellness, pondérées par le nombre de réponses. */
  wellness: {
    rpe: number | null;
    autoEvaluation: number | null;
    physicalForm: number | null;
    pleasure: number | null;
  };
  /** Charge > 1,5 × moyenne des 4 semaines précédentes. */
  isPeak: boolean;
}

/**
 * Formate une `Date` en 'YYYY-MM-DD' à partir de ses composantes LOCALES.
 *
 * `toISOString().slice(0, 10)` est faux ici et l'a été : `new Date('2026-08-10T00:00:00')`
 * est minuit heure locale, et `toISOString` le convertit en UTC, soit
 * 2026-08-09T22:00 en été à Paris. Toutes les semaines étaient décalées d'un
 * jour, ce qui déplaçait les séances du dimanche dans la semaine suivante et
 * faussait la monotonie de chaque semaine concernée.
 */
function toLocalIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Lundi de la semaine d'une date ISO, en ISO. Semaine française. */
export function weekStartOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  const day = date.getDay(); // 0 = dimanche
  const shift = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - shift);
  return toLocalIso(date);
}

/** Écart-type de population. Population et non échantillon : on décrit une semaine observée, on n'infère rien. */
export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Monotonie d'une semaine, à partir des charges de ses séances datées.
 *
 * Voir l'en-tête : les sept jours entrent dans le calcul, les jours sans séance
 * à zéro. Deux séances le même jour s'additionnent, ce qui est le comportement
 * attendu — c'est bien la charge du jour qui compte.
 */
export function weeklyMonotony(
  weekStart: string,
  dated: Array<{ date: string; load: number }>,
): number | null {
  if (dated.length === 0) return null;

  const byDay = new Map<string, number>();
  const start = new Date(`${weekStart}T00:00:00`);
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    byDay.set(toLocalIso(day), 0);
  }
  for (const entry of dated) {
    if (byDay.has(entry.date)) {
      byDay.set(entry.date, (byDay.get(entry.date) ?? 0) + entry.load);
    }
  }

  const daily = [...byDay.values()];
  const mean = daily.reduce((sum, v) => sum + v, 0) / daily.length;
  const sd = standardDeviation(daily);
  if (sd === 0 || mean === 0) return null;
  return mean / sd;
}

/** Moyenne pondérée par le nombre de réponses. Une séance à 12 répondants pèse plus qu'une à 2. */
function weightedMean(
  rows: TrainingLoadRow[],
  pick: (row: TrainingLoadRow) => number | null,
): number | null {
  let total = 0;
  let weight = 0;
  for (const row of rows) {
    const value = pick(row);
    if (value === null || !Number.isFinite(value) || row.response_count <= 0) continue;
    total += value * row.response_count;
    weight += row.response_count;
  }
  return weight > 0 ? total / weight : null;
}

/** Nombre de semaines antérieures utilisées pour détecter un pic. */
export const PEAK_BASELINE_WEEKS = 4;
/** Multiple de la moyenne des semaines précédentes au-delà duquel on signale un pic. */
export const PEAK_FACTOR = 1.5;

/**
 * Regroupe les séances en semaines et calcule charge, monotonie, contrainte,
 * couverture et pic.
 *
 * Les semaines sans aucune séance ne sont PAS fabriquées : une trêve hivernale
 * ne doit pas apparaître comme quatre semaines à charge nulle qui écraseraient
 * la moyenne de référence et déclencheraient un faux pic à la reprise.
 */
export function buildWeeklyLoads(rows: TrainingLoadRow[]): WeeklyLoad[] {
  const byWeek = new Map<string, TrainingLoadRow[]>();
  for (const row of rows) {
    const key = weekStartOf(row.session_date);
    const list = byWeek.get(key);
    if (list) list.push(row);
    else byWeek.set(key, [row]);
  }

  const weeks: WeeklyLoad[] = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, weekRows]) => {
      const dated = weekRows
        .map((row) => ({ date: row.session_date, load: sessionLoad(row) }))
        .filter((entry): entry is { date: string; load: number } => entry.load !== null);

      const load = dated.length > 0 ? dated.reduce((sum, e) => sum + e.load, 0) : null;
      const monotony = weeklyMonotony(weekStart, dated);

      const convoked = weekRows.reduce((sum, r) => sum + r.convoked_count, 0);
      const responses = weekRows.reduce((sum, r) => sum + r.response_count, 0);

      return {
        weekStart,
        sessions: weekRows.length,
        load,
        monotony,
        strain: load !== null && monotony !== null ? load * monotony : null,
        responseRate: convoked > 0 ? Math.min(1, responses / convoked) : null,
        wellness: {
          rpe: weightedMean(weekRows, (r) => r.rpe_mean),
          autoEvaluation: weightedMean(weekRows, (r) => r.auto_evaluation_mean),
          physicalForm: weightedMean(weekRows, (r) => r.physical_form_mean),
          pleasure: weightedMean(weekRows, (r) => r.pleasure_mean),
        },
        isPeak: false,
      };
    });

  // Pic : charge > 1,5 × moyenne des 4 semaines précédentes EXPLOITABLES.
  // Les semaines sans charge sont sautées plutôt que comptées à zéro, sinon une
  // seule semaine sans questionnaire abaisse la référence et fabrique un pic.
  weeks.forEach((week, index) => {
    if (week.load === null) return;
    const baseline = weeks
      .slice(0, index)
      .map((w) => w.load)
      .filter((v): v is number => v !== null)
      .slice(-PEAK_BASELINE_WEEKS);
    if (baseline.length < 2) return;
    const mean = baseline.reduce((sum, v) => sum + v, 0) / baseline.length;
    week.isPeak = mean > 0 && week.load > PEAK_FACTOR * mean;
  });

  return weeks;
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

/**
 * Seuils de monotonie couramment cités. Volontairement exposés comme des
 * REPÈRES et non comme un verdict : la littérature les discute, et l'écran doit
 * dire « au-dessus de 2 » plutôt que « dangereux ».
 */
export const MONOTONY_ELEVATED = 2;

export function monotonyHint(monotony: number | null): string | null {
  if (monotony === null) return null;
  return monotony >= MONOTONY_ELEVATED
    ? 'Semaine peu variée : charges quotidiennes proches les unes des autres.'
    : 'Alternance de charges satisfaisante sur la semaine.';
}

/** Charge arrondie, sans décimale : l'unité est arbitraire, la précision serait fausse. */
export function formatLoad(load: number | null): string {
  if (load === null || !Number.isFinite(load)) return '—';
  return Math.round(load).toLocaleString('fr-FR');
}

export function formatMonotony(monotony: number | null): string {
  if (monotony === null || !Number.isFinite(monotony)) return '—';
  return monotony.toFixed(2);
}

export function formatRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)} %`;
}

/** Libellé court d'une semaine : « sem. du 11 août ». */
export function weekLabel(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00`);
  return `sem. du ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}

export const WELLNESS_LABELS = {
  rpe: 'Intensité ressentie',
  autoEvaluation: 'Auto-évaluation',
  physicalForm: 'Forme physique',
  pleasure: 'Plaisir',
} as const;

export type WellnessKey = keyof typeof WELLNESS_LABELS;

/**
 * Le RPE est une MESURE, les trois autres sont des jugements.
 *
 * C'est la classification que le questionnaire applique déjà côté joueur
 * (`kind: 'intensity'` contre `kind: 'judgement'`). La respecter évite de
 * colorer un RPE élevé en rouge, ce qui pousserait le joueur à sous-déclarer
 * pour éviter le rouge et détruirait la donnée qu'on cherche à récolter.
 */
export function wellnessCarriesJudgement(key: WellnessKey): boolean {
  return key !== 'rpe';
}
