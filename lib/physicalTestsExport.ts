/**
 * Export Excel des tests physiques — deux écrans, une seule fabrique de
 * classeur.
 *
 * `xlsx` (SheetJS) est déjà une dépendance du repo, utilisée en lecture par
 * `importPlayers.ts` : on la réutilise en écriture plutôt que d'ajouter
 * `exceljs` (listée en dépendance mais jamais importée nulle part). Même
 * règle que partout ailleurs dans ce fichier : ne jamais halluciner qu'une
 * valeur est « bonne » ou « mauvaise » sans passer par `direction` — cet
 * export ne fait qu'écrire des nombres, aucun jugement au passage.
 *
 * `XLSX.writeFile` déclenche le téléchargement lui-même côté navigateur
 * (Blob + clic généré en interne) : pas besoin de reprendre à la main le
 * mécanisme d'ancre déjà utilisé pour le CSV de `share/content/page.tsx`.
 */

import * as XLSX from 'xlsx';
import {
  testHasSecondaryReading,
  testSecondaryReading,
  parseTestInput,
  type PhysicalTestSession,
  type PhysicalTestType,
  type SquadTestOverview,
} from './physicalTests';

export interface ExportRosterPlayer {
  id: string;
  first_name: string;
  last_name: string;
}

type Cell = string | number | null;

const playerLabel = (p: ExportRosterPlayer) => `${p.first_name} ${p.last_name}`.trim();

/** Arrondi à la précision du test : évite les 1.7899999999999998 dans la feuille. */
const round = (value: number, decimals: number): number => Number(value.toFixed(decimals));

/** Nom de fichier sûr : accents et espaces retirés, pas d'extension. */
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function download(rows: Cell[][], sheetName: string, filename: string): void {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

/**
 * Export d'une campagne (page de saisie `tests/[sessionId]`) : reprend
 * exactement les tests affichés dans `TestGrid` (`selectedTypes`), pas le
 * catalogue entier — un test décoché de l'écran est décoché de l'export.
 * Une colonne par essai, une colonne « Retenu », et une colonne
 * complémentaire (ex. vitesse FIET) quand le test en a une.
 */
export function exportSessionResults(
  session: Pick<PhysicalTestSession, 'date' | 'label'>,
  players: ExportRosterPlayer[],
  selectedTypes: PhysicalTestType[],
  entries: Record<string, string[]>,
  retainedFor: (testTypeId: string, playerId: string) => number | null,
): void {
  type Column =
    | { type: PhysicalTestType; kind: 'attempt'; attemptIndex: number }
    | { type: PhysicalTestType; kind: 'retained' }
    | { type: PhysicalTestType; kind: 'secondary' };

  const header: string[] = ['Joueur'];
  const columns: Column[] = [];

  for (const type of selectedTypes) {
    for (let i = 0; i < type.attempts; i++) {
      header.push(`${type.label} — Essai ${i + 1} (${type.unit})`);
      columns.push({ type, kind: 'attempt', attemptIndex: i });
    }
    header.push(`${type.label} — Retenu (${type.unit})`);
    columns.push({ type, kind: 'retained' });
    if (testHasSecondaryReading(type)) {
      header.push(`${type.label} — Vitesse (km/h)`);
      columns.push({ type, kind: 'secondary' });
    }
  }

  const rows: Cell[][] = [header];
  for (const player of players) {
    const row: Cell[] = [playerLabel(player)];
    for (const col of columns) {
      const key = `${col.type.id}:${player.id}`;
      if (col.kind === 'attempt') {
        const raw = entries[key]?.[col.attemptIndex] ?? '';
        const parsed = parseTestInput(raw);
        row.push(parsed === null ? null : round(parsed, col.type.decimals));
      } else if (col.kind === 'retained') {
        const retained = retainedFor(col.type.id, player.id);
        row.push(retained === null ? null : round(retained, col.type.decimals));
      } else {
        const retained = retainedFor(col.type.id, player.id);
        const secondary = retained !== null ? testSecondaryReading(col.type, retained) : null;
        row.push(secondary === null ? null : round(secondary.value, 1));
      }
    }
    rows.push(row);
  }

  const datePart = session.date;
  const labelPart = session.label ? `-${slugify(session.label)}` : '';
  download(rows, 'Résultats', `tests-${datePart}${labelPart}.xlsx`);
}

/**
 * Export de la vue d'ensemble effectif (page Performance, `TestOverviewPanel`).
 * Contrairement à la matrice affichée, PAS limité à la catégorie active du
 * filtre : tous les tests du catalogue ayant au moins une donnée
 * (`overview.types`, déjà filtré par `buildSquadTestOverview`), pour un
 * export exploitable hors de l'écran sans dépendre de l'onglet ouvert.
 */
export function exportSquadOverview(
  overview: SquadTestOverview,
  players: ExportRosterPlayer[],
  filenameHint: string,
): void {
  type Column =
    | { type: PhysicalTestType; kind: 'value' }
    | { type: PhysicalTestType; kind: 'secondary' }
    | { type: PhysicalTestType; kind: 'delta' };

  const header: string[] = ['Joueur'];
  const columns: Column[] = [];

  for (const type of overview.types) {
    header.push(`${type.label} (${type.unit})`);
    columns.push({ type, kind: 'value' });
    if (testHasSecondaryReading(type)) {
      header.push(`${type.label} — Vitesse (km/h)`);
      columns.push({ type, kind: 'secondary' });
    }
    header.push(`${type.label} — Évolution`);
    columns.push({ type, kind: 'delta' });
  }

  const cellsByPlayer = new Map(overview.players.map((p) => [p.player_id, p.cells]));

  const rows: Cell[][] = [header];
  for (const player of players) {
    const cells = cellsByPlayer.get(player.id);
    const row: Cell[] = [playerLabel(player)];
    for (const col of columns) {
      const cell = cells?.get(col.type.id) ?? null;
      if (!cell) {
        row.push(null);
        continue;
      }
      if (col.kind === 'value') {
        row.push(round(cell.latest.value, col.type.decimals));
      } else if (col.kind === 'secondary') {
        const secondary = testSecondaryReading(col.type, cell.latest.value);
        row.push(secondary === null ? null : round(secondary.value, 1));
      } else {
        row.push(cell.delta === null ? null : round(cell.delta, col.type.decimals));
      }
    }
    rows.push(row);
  }

  download(rows, 'Tests physiques', `tests-effectif-${slugify(filenameHint)}.xlsx`);
}
