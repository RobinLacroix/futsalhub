/**
 * Disponibilité des joueurs — modèle et règles de lecture.
 *
 * ## Fichier dupliqué verbatim web / mobile
 *
 * Jumeau : `lib/availability.ts` (web). Même pattern que `lib/painMap.ts`,
 * `lib/physicalTests.ts` et `mobile/components/players/positions.ts` : les deux
 * briques n'ont aucun code partagé, et une règle recopiée à la main dans quatre
 * écrans est exactement ce qui a produit quatre tables de couleurs de postes
 * divergentes. Toute modification ici se reporte dans le jumeau, sans exception.
 *
 * ## La règle qui compte : un joueur sans ligne est disponible
 *
 * `player_availability` n'enregistre que les états SAISIS. On n'écrit pas une
 * ligne « disponible » pour tout l'effectif au démarrage, sinon la table
 * contiendrait 85 lignes qui ne disent rien et l'historique serait illisible.
 * Conséquence : l'absence de ligne vaut `disponible`, et c'est l'application qui
 * complète. `resolveRoster` fait ça, et rien d'autre ne doit le refaire à la
 * main.
 *
 * ## Couleurs : une indisponibilité n'est pas une faute
 *
 * `components/training/attendance.ts` a déjà tranché : un joueur blessé est en
 * `warning`, pas en `negative`, parce que c'est « une information à traiter et
 * non une erreur ». On tient la même ligne ici. Seule la SUSPENSION est en
 * `negative` : c'est une sanction, donc un jugement, et c'est le seul statut de
 * la liste qui en soit un.
 */

export type AvailabilityStatus =
  | 'disponible'
  | 'amenage'
  | 'reprise_collective'
  | 'reathletisation'
  | 'soins'
  | 'indisponible'
  | 'suspendu';

/** Rôle sémantique d'une couleur, résolu par chaque plateforme sur son thème. */
export type AvailabilityTone = 'positive' | 'warning' | 'injury' | 'neutral' | 'negative';

/** Regroupement affiché dans le bandeau. Trois cases, pas sept. */
export type AvailabilityGroup = 'apte' | 'reprise' | 'absent';

export interface AvailabilityRow {
  player_id: string;
  first_name: string;
  last_name: string;
  number: number | null;
  team_id: string | null;
  status: AvailabilityStatus;
  since: string; // ISO 'YYYY-MM-DD'
  days_out: number;
  expected_return_date: string | null;
  days_until_return: number | null;
  return_confidence: 'estimee' | 'confirmee' | null;
  zone: string | null;
  side: 'L' | 'R' | 'C' | null;
  note: string | null;
  recorded_at: string;
}

export interface AvailabilityHistoryRow {
  id: string;
  status: AvailabilityStatus;
  since: string;
  ended_at: string | null;
  days_elapsed: number;
  expected_return_date: string | null;
  return_confidence: 'estimee' | 'confirmee' | null;
  zone: string | null;
  side: 'L' | 'R' | 'C' | null;
  note: string | null;
}

export interface PainSignalRow {
  player_id: string;
  first_name: string;
  last_name: string;
  zone: string;
  side: 'L' | 'R' | 'C';
  report_count: number;
  avg_intensity: number;
  max_intensity: number;
  first_reported: string;
  last_reported: string;
}

interface StatusMeta {
  label: string;
  /** Phrase courte affichée sous le libellé, quand la nuance n'est pas évidente. */
  hint: string;
  /**
   * Forme grammaticale pour une phrase : « Marc est __ ». Elle vit ici et pas
   * dans une manipulation de chaîne à l'appel, sinon « reprise collective »
   * produit « Marc est reprise collective ».
   */
  phrase: string;
  group: AvailabilityGroup;
  tone: AvailabilityTone;
  /** Peut-il être aligné en match sans réserve ? */
  selectable: boolean;
}

export const AVAILABILITY_META: Record<AvailabilityStatus, StatusMeta> = {
  disponible: {
    label: 'Disponible',
    hint: 'Apte, sans restriction',
    phrase: 'disponible',
    group: 'apte',
    tone: 'positive',
    selectable: true,
  },
  amenage: {
    label: 'Aménagé',
    hint: 'Apte, charge ou contenu adaptés',
    phrase: 'en charge aménagée',
    group: 'apte',
    tone: 'warning',
    selectable: true,
  },
  reprise_collective: {
    label: 'Reprise collective',
    hint: 'Réintègre le groupe, pas encore la compétition',
    phrase: 'en reprise collective',
    group: 'reprise',
    tone: 'warning',
    selectable: false,
  },
  reathletisation: {
    label: 'Réathlétisation',
    hint: 'Travail individuel avec le prépa physique',
    phrase: 'en réathlétisation',
    group: 'reprise',
    tone: 'injury',
    selectable: false,
  },
  soins: {
    label: 'Soins',
    hint: 'Indisponible, en traitement',
    phrase: 'en soins',
    group: 'absent',
    tone: 'injury',
    selectable: false,
  },
  indisponible: {
    label: 'Indisponible',
    hint: 'Hors soins : perso, pro, non justifié',
    phrase: 'indisponible',
    group: 'absent',
    tone: 'neutral',
    selectable: false,
  },
  suspendu: {
    label: 'Suspendu',
    hint: 'Décision disciplinaire ou sportive',
    phrase: 'suspendu',
    group: 'absent',
    tone: 'negative',
    selectable: false,
  },
};

/** Ordre de saisie et d'affichage : du plus apte au plus loin du terrain. */
export const AVAILABILITY_ORDER: AvailabilityStatus[] = [
  'disponible',
  'amenage',
  'reprise_collective',
  'reathletisation',
  'soins',
  'indisponible',
  'suspendu',
];

export const GROUP_LABELS: Record<AvailabilityGroup, string> = {
  apte: 'Aptes',
  reprise: 'En reprise',
  absent: 'Indisponibles',
};

export const GROUP_ORDER: AvailabilityGroup[] = ['apte', 'reprise', 'absent'];

export function statusLabel(status: AvailabilityStatus): string {
  return AVAILABILITY_META[status]?.label ?? status;
}

export function isSelectable(status: AvailabilityStatus): boolean {
  return AVAILABILITY_META[status]?.selectable ?? true;
}

/** Un joueur du groupe `apte` compte dans « qui est dispo samedi ». */
export function groupOf(status: AvailabilityStatus): AvailabilityGroup {
  return AVAILABILITY_META[status]?.group ?? 'apte';
}

// ─── Effectif résolu ─────────────────────────────────────────────────────────

export interface RosterPlayer {
  id: string;
  first_name: string;
  last_name: string;
  number?: number | null;
  team_id?: string | null;
}

/** Un joueur de l'effectif, avec son état courant. `row` null = jamais saisi. */
export interface ResolvedPlayer {
  player: RosterPlayer;
  status: AvailabilityStatus;
  row: AvailabilityRow | null;
}

/**
 * Croise l'effectif complet avec les états saisis.
 *
 * C'est LA fonction qui matérialise « pas de ligne = disponible ». Aucun écran
 * ne doit refaire ce croisement : le jour où l'un d'eux oublie les joueurs sans
 * ligne, le bandeau annonce 4 disponibles sur un effectif de 18.
 */
export function resolveRoster(
  players: RosterPlayer[],
  rows: AvailabilityRow[],
): ResolvedPlayer[] {
  const byPlayer = new Map(rows.map((r) => [r.player_id, r]));
  return players.map((player) => {
    const row = byPlayer.get(player.id) ?? null;
    return { player, status: row?.status ?? 'disponible', row };
  });
}

/** Compte par groupe, pour le bandeau. */
export function countByGroup(resolved: ResolvedPlayer[]): Record<AvailabilityGroup, number> {
  const counts: Record<AvailabilityGroup, number> = { apte: 0, reprise: 0, absent: 0 };
  for (const entry of resolved) counts[groupOf(entry.status)] += 1;
  return counts;
}

/** Compte par statut, pour le détail. */
export function countByStatus(
  resolved: ResolvedPlayer[],
): Partial<Record<AvailabilityStatus, number>> {
  const counts: Partial<Record<AvailabilityStatus, number>> = {};
  for (const entry of resolved) {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  }
  return counts;
}

/**
 * Liste d'infirmerie : tout ce qui n'est pas apte, du retour le plus proche au
 * plus lointain. Un retour inconnu ferme la marche — c'est l'ordre dans lequel
 * un coach prépare sa semaine, pas l'ordre alphabétique.
 */
export function infirmary(resolved: ResolvedPlayer[]): ResolvedPlayer[] {
  return resolved
    .filter((entry) => groupOf(entry.status) !== 'apte' && entry.row !== null)
    .sort((a, b) => {
      const da = a.row?.expected_return_date ?? null;
      const db = b.row?.expected_return_date ?? null;
      if (da && db) return da.localeCompare(db);
      if (da) return -1;
      if (db) return 1;
      return (b.row?.days_out ?? 0) - (a.row?.days_out ?? 0);
    });
}

// ─── Formatage ───────────────────────────────────────────────────────────────

/**
 * Retour prévu, en clair. Le retard est dit explicitement : une date de retour
 * dépassée est le signal le plus utile de l'écran, et l'afficher comme une date
 * ordinaire la rendrait invisible.
 */
export function returnLabel(row: AvailabilityRow): string {
  if (!row.expected_return_date) return 'Retour non estimé';
  const days = row.days_until_return;
  const confidence = row.return_confidence === 'confirmee' ? 'confirmé' : 'estimé';
  if (days === null) return `Retour ${confidence}`;
  if (days < 0) return `Retour ${confidence} dépassé de ${Math.abs(days)} j`;
  if (days === 0) return `Retour ${confidence} aujourd'hui`;
  if (days === 1) return `Retour ${confidence} demain`;
  return `Retour ${confidence} dans ${days} j`;
}

export function sinceLabel(days: number): string {
  if (days <= 0) return "Depuis aujourd'hui";
  if (days === 1) return 'Depuis hier';
  return `Depuis ${days} jours`;
}

export const SIDE_LABELS: Record<'L' | 'R' | 'C', string> = {
  L: 'gauche',
  R: 'droit',
  C: 'central',
};

// ─── Convocation ─────────────────────────────────────────────────────────────

/**
 * Faut-il confirmer avant de convoquer ce joueur ?
 *
 * C'est LE point de valeur du lot A. La page Performance est une consultation :
 * on y va quand on se pose la question. La convocation est le moment où on ne se
 * la pose pas — on coche vite, la veille du match, et on découvre l'erreur au
 * gymnase. Convoquer un blessé par inattention est le bug métier que cette
 * feature élimine, et il ne s'élimine qu'ici.
 *
 * `amenage` ne déclenche RIEN : le joueur est apte, sa charge est adaptée, le
 * convoquer est normal. Confirmer pour lui apprendrait au coach à valider sans
 * lire, et le jour où c'est un joueur en soins il validerait pareil. Une
 * confirmation qui se déclenche trop souvent ne protège plus de rien.
 */
export function needsConvocationWarning(status: AvailabilityStatus): boolean {
  return !isSelectable(status);
}

/**
 * Phrase de confirmation, identique sur les deux plateformes.
 *
 * Elle dit le statut ET l'échéance : « en soins » seul pousse à convoquer quand
 * même par défaut, « retour estimé dans 17 j » donne l'information qui fait
 * renoncer. Le nom du joueur est répété parce que la boîte de dialogue arrive
 * après un tap dans une liste de dix-huit lignes.
 */
export function convocationWarning(
  playerName: string,
  status: AvailabilityStatus,
  row: AvailabilityRow | null,
): string {
  const phrase = AVAILABILITY_META[status]?.phrase ?? statusLabel(status).toLowerCase();
  const detail = row ? `, ${returnLabel(row).toLowerCase()}` : '';
  return `${playerName} est ${phrase}${detail}. Le convoquer quand même ?`;
}

// ─── Signaux précoces ────────────────────────────────────────────────────────

/** Valeurs par défaut de `get_pain_signals`, affichées à l'écran. */
export const PAIN_SIGNAL_DEFAULTS = { windowDays: 21, minReports: 3 } as const;

/**
 * Formule un signal, JAMAIS un diagnostic.
 *
 * « 4 signalements ischio gauche en 18 jours » se vérifie, se discute avec le
 * joueur et engage le staff sur un fait. « Risque de lésion » est une assertion
 * médicale que ni l'application ni le coach ne sont en position de produire, et
 * qui expose le club le jour où elle se trompe dans un sens ou dans l'autre.
 */
export function signalSentence(
  signal: PainSignalRow,
  zoneLabelOf: (zone: string) => string,
): string {
  const span = daysBetween(signal.first_reported, signal.last_reported);
  const window = span <= 1 ? 'le même jour' : `en ${span} jours`;
  return `${signal.report_count} signalements ${zoneLabelOf(signal.zone).toLowerCase()} ${window}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.max(0, Math.round((to - from) / 86400000));
}
