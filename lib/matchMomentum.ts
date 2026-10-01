/**
 * Momentum du match — indice de domination par minute, dérivé des events déjà
 * enregistrés par le tracker (`match_events` / `LocalMatchEvent`).
 *
 * ## Ce que c'est, et ce que ce n'est PAS
 *
 * C'est un PROXY heuristique, pas une probabilité mesurée. On n'a ni position
 * du ballon ni possession continue (contrairement à un vrai modèle xG/momentum
 * qui a le tracking complet) — seulement des events discrets (tir, but,
 * récupération, perte de balle) avec un horodatage. `buildMomentumSeries`
 * pondère ces events et les lisse par décroissance exponentielle pour
 * retrouver une courbe de domination lisible. Ne jamais présenter le résultat
 * comme une probabilité de but ("X% de chances de marquer") — le présenter
 * comme un indice relatif ("qui domine, et à quel point") est honnête ;
 * l'inverse ne l'est pas.
 *
 * ## Pourquoi une décroissance causale (et pas une fenêtre glissante centrée)
 *
 * Le momentum à la minute t ne doit dépendre que des events <= t : c'est ce
 * qui permet à ce même calcul de tourner en LIVE (pendant le match, sur les
 * events déjà enregistrés) et en POST-MATCH (sur l'historique complet) sans
 * deux implémentations différentes. Une fenêtre centrée regarderait dans le
 * futur, impossible en live.
 *
 * ## Le chrono est en temps COULÉ, pas temps arrêté
 *
 * Le futsal se joue en 2x20 min de temps arrêté, mais le tracker fait tourner
 * un chrono continu : une mi-temps « dure » en vrai le temps qu'elle a duré à
 * l'écran, souvent bien plus que 20 min. Un event de 2ème mi-temps à
 * `match_time_seconds = 300` ne tombe donc PAS forcément à la 25e minute
 * absolue du match — seulement si la 1ère mi-temps a duré pile 20 min.
 *
 * `halfDurationsMinutes` déduit la durée réelle de chaque mi-temps du plus
 * grand `match_time_seconds` observé dedans (repli sur 20 min nominales si
 * elle n'a encore aucun event). C'est exactement la méthode déjà utilisée par
 * `halfDurations()` dans `app/webapp/manager/analytics/MatchMomentsView.tsx`
 * (et son jumeau mobile) — à ne pas diverger, c'est la seule approximation
 * disponible : aucun event ne marque explicitement la fin de mi-temps.
 *
 * ## Fichier partagé web (report + tracker live)
 *
 * Utilisé par `app/webapp/tracker/match-report/[matchId]/page.tsx` (post-match)
 * et par `app/webapp/tracker/matchrecorder/components/LiveSummary.tsx` (live,
 * sur `localEvents` du hook `useOfflineSync`). Un seul calcul, deux usages —
 * ne pas dupliquer la logique dans un des deux appelants.
 *
 * ## Fichier dupliqué verbatim web / mobile
 *
 * Jumeau : `mobile/lib/matchMomentum.ts`. Même pattern que `lib/trainingLoad.ts`.
 * Toute modification ici (poids des events, demi-vie, seuils de domination) se
 * reporte dans le jumeau, sans exception.
 */

export interface MomentumEvent {
  event_type: string;
  match_time_seconds: number;
  half: number;
}

export interface MomentumPoint {
  /** Minute absolue du match (0 = coup d'envoi ; décalage de 2ème MT = durée réelle de la 1ère). */
  minute: number;
  /** -1..1 : signe = équipe dominante (positif = nous), magnitude = intensité. */
  value: number;
}

export interface HalfDurationsMinutes {
  h1: number;
  h2: number;
}

export interface MomentumSeries {
  points: MomentumPoint[];
  /** Plus longues séquences de domination continue, triées par intensité décroissante. */
  dominantSpans: DominantSpan[];
  /** Durée réelle (temps coulé) de chaque mi-temps, en minutes — pour placer le repère de mi-temps côté graphique. */
  halfDurations: HalfDurationsMinutes;
  /** Index (dans `points`) du premier point de la 2ème mi-temps. Absent tant qu'elle n'a pas commencé. À utiliser pour positionner le repère de mi-temps plutôt que de recalculer depuis `halfDurations` : c'est le seul repère qui reste juste quel que soit l'échantillonnage (`maxPointsPerHalf` ou non). */
  half2StartIndex?: number;
}

export interface BuildMomentumOptions {
  /**
   * Nombre max de points par mi-temps, répartis uniformément sur sa durée
   * réelle (temps coulé) plutôt qu'un point par minute entière. Sert à garder
   * un nombre de barres lisible quel que soit le nombre de matchs agrégés
   * (ex. `app/webapp/manager/analytics/MatchMomentsView.tsx`, qui somme les
   * events de plusieurs matchs de durées différentes). Omis = comportement
   * historique, un point par minute entière (bilan post-match, récap live).
   */
  maxPointsPerHalf?: number;
  /**
   * false : chaque point ne reflète que les events tombant dans sa propre
   * tranche de temps, sans décroissance ni influence des points voisins — un
   * but isolé produit UN pic isolé, pas une traînée qui s'étale sur plusieurs
   * points. Pertinent pour une déclinaison qui isole un seul type d'event rare
   * (ex. buts seuls) où la traînée de décroissance n'apporte rien et brouille
   * la lecture. Par défaut true (comportement historique : décroissance
   * causale, cf. note de tête de fichier).
   */
  decay?: boolean;
}

export interface DominantSpan {
  team: 'us' | 'opponent';
  startMinute: number;
  endMinute: number;
  /** Somme des magnitudes sur la séquence — sert à classer les séquences entre elles. */
  intensity: number;
}

// Poids par event — heuristique, ajustable. Un but pèse plus qu'un tir cadré,
// qui pèse plus qu'un tir non cadré ; une récupération/perte de balle a un
// poids faible (elle ne crée pas de danger direct, juste un terrain gagné).
const OUR_WEIGHTS: Record<string, number> = {
  goal: 5,
  shot_on_target: 3,
  shot: 1.5,
  recovery: 0.7,
  ball_recovery: 0.7,
};

const OPPONENT_WEIGHTS: Record<string, number> = {
  opponent_goal: 5,
  opponent_shot_on_target: 3,
  opponent_shot: 1.5,
};

// Une perte de balle nous appartient mais profite à l'adversaire (transition) :
// elle vient donc en négatif chez nous, pas en positif chez l'adversaire — pas
// d'event symétrique "opponent_ball_loss" côté tracker.
const OUR_BALL_LOSS_WEIGHT = -0.7;

const HALF_LIFE_MINUTES = 3;
const DECAY_RATE = Math.LN2 / HALF_LIFE_MINUTES;

// Repli nominal futsal (2x20 min), utilisé uniquement quand une mi-temps n'a
// encore strictement aucun event (avant le coup d'envoi, ou 2ème MT pas
// commencée) — jamais une fois qu'il y a au moins un event pour s'appuyer sur
// le temps coulé réel.
const NOMINAL_HALF_DURATION_SEC = 20 * 60;

/**
 * Durée réelle de chaque mi-temps (temps coulé), en minutes. Voir la note de
 * tête de fichier — même méthode que `halfDurations()` dans
 * `MatchMomentsView.tsx`, à ne pas diverger.
 */
export function halfDurationsMinutes(events: MomentumEvent[]): HalfDurationsMinutes {
  const maxSecondsOf = (half: number) => {
    const list = events.filter(e => e.half === half);
    return list.length > 0 ? Math.max(...list.map(e => e.match_time_seconds)) : 0;
  };
  const h1Sec = maxSecondsOf(1);
  const h2Sec = maxSecondsOf(2);
  return {
    h1: (h1Sec > 0 ? h1Sec : NOMINAL_HALF_DURATION_SEC) / 60,
    h2: (h2Sec > 0 ? h2Sec : NOMINAL_HALF_DURATION_SEC) / 60,
  };
}

/**
 * Minute absolue "maintenant", pour capper l'affichage en LIVE aux minutes
 * déjà jouées. `secondsInHalf` est le chrono affiché au coach dans la
 * mi-temps en cours (remis à 0 à la mi-temps).
 *
 * Fragile par construction : `half`/`secondsInHalf` viennent d'un état de
 * recorder qui peut se tromper (reprise après plantage, restauration
 * concurrente...), alors que les `events` eux-mêmes ne mentent jamais sur ce
 * qui a été enregistré. Pour l'affichage du graphique, préférer
 * `lastEventAbsoluteMinute` (ou le maximum des deux) plutôt que cette
 * fonction seule — voir sa note.
 */
export function currentAbsoluteMinute(
  events: MomentumEvent[],
  half: number,
  secondsInHalf: number,
): number {
  const { h1 } = halfDurationsMinutes(events);
  return (half === 2 ? h1 : 0) + secondsInHalf / 60;
}

function eventMinute(e: MomentumEvent, h1Minutes: number): number {
  const offset = e.half === 2 ? h1Minutes : 0;
  return offset + e.match_time_seconds / 60;
}

/**
 * Minute absolue du dernier event enregistré — un plancher fiable pour
 * l'affichage LIVE, qui ne dépend d'aucun état de chrono externe.
 *
 * Le recorder (web comme mobile) restaure `half`/`matchTime` depuis plusieurs
 * sources qui peuvent se désynchroniser. Si l'une régresse (ex. "1ère
 * mi-temps" affiché après la fin réelle du match), un graphique capé sur
 * `currentAbsoluteMinute` tronque à tort toute la 2ème mi-temps déjà
 * enregistrée. Ce plancher, calculé uniquement à partir des `events` bruts,
 * ne peut jamais être trompé de la même façon : `MatchMomentumChart` doit
 * toujours afficher au moins jusque-là, quoi que dise le chrono.
 */
export function lastEventAbsoluteMinute(events: MomentumEvent[]): number {
  if (events.length === 0) return 0;
  const { h1 } = halfDurationsMinutes(events);
  return Math.max(...events.map(e => eventMinute(e, h1)));
}

function weightOf(eventType: string): number {
  if (eventType === 'ball_loss') return OUR_BALL_LOSS_WEIGHT;
  return OUR_WEIGHTS[eventType] ?? OPPONENT_WEIGHTS[eventType] ?? 0;
}

function isOpponentEvent(eventType: string): boolean {
  return eventType in OPPONENT_WEIGHTS;
}

/**
 * @param events Events du match, dans n'importe quel ordre.
 * @param upToMinute Dernière minute absolue à calculer (en LIVE, passer
 *   `currentAbsoluteMinute(...)` pour ne pas afficher de minutes futures).
 *   Omis = match entier, jusqu'à la fin de la 2ème mi-temps déduite des events.
 */
export function buildMomentumSeries(
  events: MomentumEvent[],
  upToMinute?: number,
  options?: BuildMomentumOptions,
): MomentumSeries {
  const halfDurations = halfDurationsMinutes(events);
  const totalMinutes = halfDurations.h1 + halfDurations.h2;
  const lastMinute = Math.max(0, Math.ceil(upToMinute ?? totalMinutes));
  const decay = options?.decay ?? true;
  const half2Started = events.some(e => e.half === 2);

  const timedEvents = events
    .map(e => ({ minute: eventMinute(e, halfDurations.h1), weight: weightOf(e.event_type), isOpponent: isOpponentEvent(e.event_type) }))
    .filter(e => e.weight !== 0);

  // Grille d'échantillonnage : soit un point par minute entière (historique),
  // soit `maxPointsPerHalf` points par mi-temps répartis sur sa durée réelle
  // (temps coulé) — indépendant du nombre de minutes réellement jouées, pour
  // qu'un match de 25 min et un match de 45 min produisent le même nombre de
  // barres. `half2StartIndex` reste l'unique repère fiable pour positionner la
  // mi-temps côté graphique quel que soit le mode.
  let sampleMinutes: number[];
  let half2StartIndex: number | undefined;

  if (options?.maxPointsPerHalf && options.maxPointsPerHalf > 0) {
    const n = options.maxPointsPerHalf;
    const h1Cap = Math.min(lastMinute, halfDurations.h1);
    const h1Minutes = Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * halfDurations.h1)
      .filter(m => m <= h1Cap + 1e-9);
    half2StartIndex = half2Started ? h1Minutes.length : undefined;
    const h2Minutes = half2Started
      ? Array.from({ length: n }, (_, i) => halfDurations.h1 + ((i + 0.5) / n) * halfDurations.h2)
          .filter(m => m <= lastMinute + 1e-9)
      : [];
    sampleMinutes = [...h1Minutes, ...h2Minutes];
  } else {
    sampleMinutes = Array.from({ length: lastMinute + 1 }, (_, m) => m);
    half2StartIndex = half2Started ? Math.round(halfDurations.h1) : undefined;
  }

  // Demi-largeur de tranche pour le mode sans décroissance (chaque point ne
  // compte que les events tombant dans sa propre tranche) : la moitié du pas
  // d'échantillonnage, quel que soit le mode.
  const bucketHalfWidth = options?.maxPointsPerHalf
    ? Math.max(halfDurations.h1, halfDurations.h2) / options.maxPointsPerHalf / 2
    : 0.5;

  const raw = sampleMinutes.map(m => {
    let net = 0;
    for (const e of timedEvents) {
      if (decay) {
        if (e.minute > m) continue; // causal : pas d'influence du futur
        net += (e.isOpponent ? -e.weight : e.weight) * Math.exp(-DECAY_RATE * (m - e.minute));
      } else if (Math.abs(e.minute - m) <= bucketHalfWidth) {
        net += e.isOpponent ? -e.weight : e.weight;
      }
    }
    return net;
  });

  const scale = Math.max(1e-6, ...raw.map(v => Math.abs(v)));
  // `minute` reste non arrondi ici (entier de toute façon en mode historique,
  // fractionnaire en mode échantillonné) : c'est la clé de catégorie utilisée
  // par les graphiques pour positionner chaque barre, et deux buckets
  // arrondis au même entier fusionneraient à tort sur un axe catégoriel.
  // L'arrondi pour l'affichage (ticks, tooltip) est la responsabilité du
  // composant de rendu.
  const points: MomentumPoint[] = raw.map((v, i) => ({ minute: sampleMinutes[i], value: v / scale }));

  return { points, dominantSpans: findDominantSpans(points), halfDurations, half2StartIndex };
}

// Seuil sous lequel une minute est considérée neutre (pas assez de signal pour
// compter dans une séquence de domination) — évite qu'une séquence se prolonge
// sur du bruit quasi nul.
const DOMINANCE_THRESHOLD = 0.15;
const MIN_SPAN_MINUTES = 2;

function findDominantSpans(points: MomentumPoint[]): DominantSpan[] {
  const spans: DominantSpan[] = [];
  let current: { team: 'us' | 'opponent'; start: number; intensity: number } | null = null;

  const flush = (endMinute: number) => {
    if (current && endMinute - current.start >= MIN_SPAN_MINUTES) {
      spans.push({ team: current.team, startMinute: current.start, endMinute, intensity: current.intensity });
    }
    current = null;
  };

  points.forEach((p, i) => {
    const team: 'us' | 'opponent' | null =
      p.value >= DOMINANCE_THRESHOLD ? 'us' : p.value <= -DOMINANCE_THRESHOLD ? 'opponent' : null;

    if (team === null) {
      flush(p.minute);
      return;
    }
    if (current && current.team === team) {
      current.intensity += Math.abs(p.value);
    } else {
      flush(p.minute);
      current = { team, start: p.minute, intensity: Math.abs(p.value) };
    }
    if (i === points.length - 1) flush(p.minute + 1);
  });

  return spans.sort((a, b) => b.intensity - a.intensity);
}
