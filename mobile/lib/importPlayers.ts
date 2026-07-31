import * as XLSX from 'xlsx';

// ─── Colonnes attendues (doivent matcher scripts/generate-import-template.js) ──
const POSITIONS = ['Gardien', 'Meneur', 'Ailier', 'Pivot'];
const FEET = ['Droit', 'Gauche', 'Ambidextre'];

const COLUMN_ALIASES: Record<string, string[]> = {
  first_name: ['prenom'],
  last_name: ['nom'],
  birth_date: ['date de naissance'],
  position: ['poste'],
  strong_foot: ['pied fort'],
  number: ['numero'],
};

export interface ImportRowInput {
  first_name: string;
  last_name: string;
  birth_date: string;
  position: string;
  strong_foot: string;
  number: string;
}

export interface ImportRowData {
  first_name: string;
  last_name: string;
  birth_date: string; // ISO yyyy-MM-dd
  position: string;
  strong_foot: string;
  number?: number;
}

export type ImportRowStatus = 'ok' | 'error' | 'duplicate';

export interface ParsedPlayerRow {
  rowNumber: number; // numéro de ligne dans le fichier Excel (1 = ligne de données juste sous l'en-tête)
  input: ImportRowInput;
  data: ImportRowData | null;
  status: ImportRowStatus;
  errorMessage: string | null;
  duplicateOf: 'existing' | 'file' | null;
}

export class ImportTemplateError extends Error {}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeHeader(s: string): string {
  return stripAccents(s.trim().toLowerCase()).replace(/\s*\(.*\)\s*$/, '').trim();
}

function findColumnIndexes(headerRow: unknown[]): Record<keyof typeof COLUMN_ALIASES, number> {
  const normalized = headerRow.map((h) => normalizeHeader(String(h ?? '')));
  const result = {} as Record<keyof typeof COLUMN_ALIASES, number>;
  const missing: string[] = [];

  for (const key of Object.keys(COLUMN_ALIASES) as Array<keyof typeof COLUMN_ALIASES>) {
    const aliases = COLUMN_ALIASES[key];
    const idx = normalized.findIndex((h) => aliases.some((a) => h === a));
    if (idx === -1) {
      missing.push(aliases[0]);
    } else {
      result[key] = idx;
    }
  }

  if (missing.length > 0) {
    throw new ImportTemplateError(
      `Colonne(s) introuvable(s) dans le fichier : ${missing.join(', ')}. Utilisez le modèle fourni sans renommer les colonnes.`
    );
  }
  return result;
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function normalizeBirthDate(value: unknown): string | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return isPlausibleDate(y, value.getUTCMonth() + 1, value.getUTCDate()) ? `${y}-${m}-${d}` : null;
  }
  const s = cellToString(value);
  if (!s) return null;

  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return isPlausibleDate(+y, +m, +d) ? s : null;
  }

  const frMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (frMatch) {
    const [, d, m, y] = frMatch;
    const day = +d, month = +m, year = +y;
    if (!isPlausibleDate(year, month, day)) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

function isPlausibleDate(year: number, month: number, day: number): boolean {
  if (year < 1930 || year > new Date().getFullYear()) return false;
  if (month < 1 || month > 12) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return false;
  return dt.getTime() <= Date.now();
}

function normalizeEnum(value: unknown, options: string[]): string | null {
  const s = stripAccents(cellToString(value).toLowerCase());
  const match = options.find((o) => stripAccents(o.toLowerCase()) === s);
  return match ?? null;
}

function normalizeNumber(value: unknown): { ok: boolean; value: number | undefined } {
  const s = cellToString(value);
  if (!s) return { ok: true, value: undefined };
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0 || n > 99) return { ok: false, value: undefined };
  return { ok: true, value: n };
}

/**
 * Parse un fichier Excel d'import d'effectif. Ne fait aucune requête réseau —
 * pure fonction sur les octets du fichier (base64, lu via expo-file-system).
 * Les doublons contre l'effectif existant sont marqués séparément par
 * markExistingDuplicates (nécessite les joueurs déjà chargés).
 */
export function parsePlayersWorkbook(base64: string): ParsedPlayerRow[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(base64, { type: 'base64', cellDates: true });
  } catch {
    throw new ImportTemplateError('Fichier illisible. Vérifiez qu\'il s\'agit bien d\'un fichier .xlsx non corrompu.');
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new ImportTemplateError('Le fichier ne contient aucune feuille.');

  const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  if (grid.length === 0) throw new ImportTemplateError('Le fichier est vide.');

  const cols = findColumnIndexes(grid[0]);
  const dataRows = grid.slice(1);

  const seenInFile = new Set<string>();
  const results: ParsedPlayerRow[] = [];

  dataRows.forEach((row, i) => {
    const isBlank = row.every((c) => cellToString(c) === '');
    if (isBlank) return;

    const input: ImportRowInput = {
      first_name: cellToString(row[cols.first_name]),
      last_name: cellToString(row[cols.last_name]),
      birth_date: cellToString(row[cols.birth_date]),
      position: cellToString(row[cols.position]),
      strong_foot: cellToString(row[cols.strong_foot]),
      number: cellToString(row[cols.number]),
    };

    const errors: string[] = [];
    if (!input.first_name) errors.push('Prénom manquant');
    if (!input.last_name) errors.push('Nom manquant');

    const birthDate = normalizeBirthDate(row[cols.birth_date]);
    if (!input.birth_date) errors.push('Date de naissance manquante');
    else if (!birthDate) errors.push('Date de naissance invalide');

    const position = normalizeEnum(row[cols.position], POSITIONS);
    if (!input.position) errors.push('Poste manquant');
    else if (!position) errors.push(`Poste invalide (attendu : ${POSITIONS.join(', ')})`);

    const strongFoot = normalizeEnum(row[cols.strong_foot], FEET);
    if (!input.strong_foot) errors.push('Pied fort manquant');
    else if (!strongFoot) errors.push(`Pied fort invalide (attendu : ${FEET.join(', ')})`);

    const numberResult = normalizeNumber(row[cols.number]);
    if (!numberResult.ok) errors.push('Numéro invalide (entier entre 0 et 99)');

    if (errors.length > 0) {
      results.push({
        rowNumber: i + 1,
        input,
        data: null,
        status: 'error',
        errorMessage: errors.join(' · '),
        duplicateOf: null,
      });
      return;
    }

    const nameKey = `${stripAccents(input.first_name.toLowerCase())}|${stripAccents(input.last_name.toLowerCase())}`;
    const duplicateInFile = seenInFile.has(nameKey);
    seenInFile.add(nameKey);

    results.push({
      rowNumber: i + 1,
      input,
      data: {
        first_name: input.first_name,
        last_name: input.last_name,
        birth_date: birthDate!,
        position: position!,
        strong_foot: strongFoot!,
        number: numberResult.value,
      },
      status: duplicateInFile ? 'duplicate' : 'ok',
      errorMessage: null,
      duplicateOf: duplicateInFile ? 'file' : null,
    });
  });

  return results;
}

/**
 * Marque comme doublons les lignes valides dont Prénom+Nom correspond déjà à
 * un joueur de l'équipe active. Étape séparée du parsing car elle dépend de
 * données déjà chargées côté appelant (pas de requête ici non plus).
 */
export function markExistingDuplicates(
  rows: ParsedPlayerRow[],
  existingPlayers: Array<{ first_name: string; last_name: string }>
): ParsedPlayerRow[] {
  const existingKeys = new Set(
    existingPlayers.map((p) => `${stripAccents(p.first_name.toLowerCase())}|${stripAccents(p.last_name.toLowerCase())}`)
  );
  return rows.map((row) => {
    if (row.status !== 'ok' || !row.data) return row;
    const key = `${stripAccents(row.data.first_name.toLowerCase())}|${stripAccents(row.data.last_name.toLowerCase())}`;
    if (existingKeys.has(key)) {
      return { ...row, status: 'duplicate' as const, duplicateOf: 'existing' as const };
    }
    return row;
  });
}
