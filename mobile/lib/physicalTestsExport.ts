/**
 * Export Excel des tests physiques — jumeau mobile de
 * `lib/physicalTestsExport.ts` (web).
 *
 * Mobile n'a pas de « téléchargement » : `XLSX.write` produit le classeur en
 * base64, écrit dans le cache (`expo-file-system`), puis `expo-sharing` ouvre
 * la feuille de partage native (AirDrop, Fichiers, mail...). Exactement le
 * mécanisme déjà utilisé pour partager le modèle d'import
 * (`app/(tabs)/squad/import-players.tsx`, `shareTemplate`) — pas une nouvelle
 * dépendance, `xlsx`/`expo-file-system`/`expo-sharing` sont déjà du repo.
 *
 * Différence avec le web au-delà du mécanisme de sortie : l'écran de saisie
 * mobile affiche UN test à la fois (`selectedType`), mais charge les
 * résultats de TOUS les tests de la campagne dès l'ouverture. L'export prend
 * donc directement « les tests ayant une donnée sur cette campagne », pas
 * « le test actuellement affiché ».
 */

import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  parseTestInput,
  retainedValue,
  sortTestTypes,
  testHasSecondaryReading,
  testSecondaryReading,
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

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

async function shareWorkbook(rows: Cell[][], sheetName: string, filename: string): Promise<void> {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;

  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Le partage de fichiers n'est pas disponible sur cet appareil.");
  }
  await Sharing.shareAsync(uri, { mimeType: XLSX_MIME, dialogTitle: filename });
}

/**
 * Export d'une campagne (écran de saisie `tests/[sessionId]`). `types` doit
 * être pré-filtré par l'appelant aux tests ayant au moins une donnée sur
 * cette campagne (`filledCountByType`) — exporter les 13 tests du catalogue
 * à chaque fois produirait une feuille à moitié vide.
 */
export async function exportSessionResults(
  session: Pick<PhysicalTestSession, 'date' | 'label'>,
  players: ExportRosterPlayer[],
  types: PhysicalTestType[],
  entries: Record<string, string[]>,
): Promise<void> {
  const orderedTypes = sortTestTypes(types);

  type Column =
    | { type: PhysicalTestType; kind: 'attempt'; attemptIndex: number }
    | { type: PhysicalTestType; kind: 'retained' }
    | { type: PhysicalTestType; kind: 'secondary' };

  const header: string[] = ['Joueur'];
  const columns: Column[] = [];

  for (const type of orderedTypes) {
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

  const retainedFor = (type: PhysicalTestType, playerId: string): number | null => {
    const raw = entries[`${type.id}:${playerId}`] ?? [];
    const values = raw.map((v) => parseTestInput(v)).filter((v): v is number => v !== null);
    return retainedValue(values, type.aggregation, type.direction);
  };

  const rows: Cell[][] = [header];
  for (const player of players) {
    const row: Cell[] = [playerLabel(player)];
    for (const col of columns) {
      if (col.kind === 'attempt') {
        const raw = entries[`${col.type.id}:${player.id}`]?.[col.attemptIndex] ?? '';
        const parsed = parseTestInput(raw);
        row.push(parsed === null ? null : round(parsed, col.type.decimals));
      } else if (col.kind === 'retained') {
        const retained = retainedFor(col.type, player.id);
        row.push(retained === null ? null : round(retained, col.type.decimals));
      } else {
        const retained = retainedFor(col.type, player.id);
        const secondary = retained !== null ? testSecondaryReading(col.type, retained) : null;
        row.push(secondary === null ? null : round(secondary.value, 1));
      }
    }
    rows.push(row);
  }

  const datePart = session.date;
  const labelPart = session.label ? `-${slugify(session.label)}` : '';
  await shareWorkbook(rows, 'Résultats', `tests-${datePart}${labelPart}.xlsx`);
}

/**
 * Export de la vue d'ensemble effectif (section Performance,
 * `TestOverviewSection`). Comme le jumeau web : tous les tests du catalogue
 * ayant au moins une donnée (`overview.types`), pas seulement la catégorie
 * affichée à l'écran.
 */
export async function exportSquadOverview(
  overview: SquadTestOverview,
  players: ExportRosterPlayer[],
  filenameHint: string,
): Promise<void> {
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

  await shareWorkbook(rows, 'Tests physiques', `tests-effectif-${slugify(filenameHint)}.xlsx`);
}
