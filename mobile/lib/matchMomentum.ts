/**
 * Momentum du match — indice de domination par minute, dérivé des events déjà
 * enregistrés par le tracker (`match_events`).
 *
 * ## Fichier dupliqué verbatim web / mobile
 *
 * Jumeau : `lib/matchMomentum.ts` (web). Même pattern que `lib/trainingLoad.ts`,
 * `lib/availability.ts`, `lib/physicalTests.ts` et `lib/painMap.ts`. Toute
 * modification ici (poids des events, demi-vie, seuils de domination) se
 * reporte dans le jumeau, sans exception.
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
 * qui permet à ce même calcul de tourner en LIVE (pendant le match, dans
 * `useMatchRecorder`) et en POST-MATCH (sur l'historique complet, dans l'écran
 * `app/(tabs)/tracker/match-report/[matchId].tsx`) sans deux implémentations
 * différentes. Une fenêtre centrée regarderait dans le futur, impossible en
 * live.
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
 * `halfDurations()` dans `components/MatchMomentsView.tsx` (et son jumeau
 * web) — à ne pas diverger, c'est la seule approximation disponible : aucun
 * event ne marque explicitement la fin de mi-temps.
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
    const list = events.filter((e) => e.half === half);
    return list.length > 0 ? Math.max(...list.map((e) => e.match_time_seconds)) : 0;
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
 * Le recorder restaure `half`/`seconds` depuis deux sources (base + instantané
 * local) qui peuvent se désynchroniser (cf. `useMatchRecorder.ts`, note sur
 * `applyHalfSecondsIfMoreAdvanced`). Si un de ces deux états régresse
 * (ex. "1ère mi-temps" affiché après la fin réelle du match), un graphique
 * capé sur `currentAbsoluteMinute` tronque à tort toute la 2ème mi-temps déjà
 * enregistrée. Ce plancher, calculé uniquement à partir des `events` bruts,
 * ne peut jamais être trompé de la même façon : `MomentumChart` doit toujours
 * afficher au moins jusque-là, quoi que dise le chrono.
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
): MomentumSeries {
  const halfDurations = halfDurationsMinutes(events);
  const totalMinutes = halfDurations.h1 + halfDurations.h2;
  const lastMinute = Math.max(0, Math.ceil(upToMinute ?? totalMinutes));

  const timedEvents = events
    .map(e => ({ minute: eventMinute(e, halfDurations.h1), weight: weightOf(e.event_type), isOpponent: isOpponentEvent(e.event_type) }))
    .filter(e => e.weight !== 0);

  const raw: number[] = [];
  for (let m = 0; m <= lastMinute; m++) {
    let net = 0;
    for (const e of timedEvents) {
      if (e.minute > m) continue; // causal : pas d'influence du futur
      const decay = Math.exp(-DECAY_RATE * (m - e.minute));
      net += (e.isOpponent ? -e.weight : e.weight) * decay;
    }
    raw.push(net);
  }

  const scale = Math.max(1e-6, ...raw.map(v => Math.abs(v)));
  const points: MomentumPoint[] = raw.map((v, minute) => ({ minute, value: v / scale }));

  return { points, dominantSpans: findDominantSpans(points), halfDurations };
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
