import { parse } from 'csv-parse/browser/esm/sync';
import { USERS_EXPORT_IMPORTABLE_HEADERS } from './users-export';

export interface ParsedUserImportRow {
  rowIndex: number;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  phone: string;
  jobTitle: string;
  documentType: string;
  documentNumber: string;
}

type Field = Exclude<keyof ParsedUserImportRow, 'rowIndex'>;

const FIELDS: readonly Field[] = [
  'email',
  'role',
  'firstName',
  'lastName',
  'phone',
  'jobTitle',
  'documentType',
  'documentNumber',
];

/** Minúsculas, sin tildes y con un solo espacio: «Número de documento» = «numero de documento». */
function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Cada campo se reconoce por su clave técnica de la plantilla (`email`) o por
 * el encabezado del archivo de «Exportar» (`Correo`).
 */
const HEADER_TO_FIELD = new Map<string, Field>(
  FIELDS.flatMap((field) => [
    [normalizeHeader(field), field] as const,
    [normalizeHeader(USERS_EXPORT_IMPORTABLE_HEADERS[field]), field] as const,
  ]),
);

/**
 * Deshace la protección contra fórmulas de la exportación: un valor que empieza
 * por `=`, `+`, `-` o `@` sale con `'` delante (`'+573001234567`).
 */
function unescapeExportedCell(value: string): string {
  return /^'(\s*[=+\-@]|[\t\r\n])/.test(value) ? value.slice(1) : value;
}

export type UsersImportCsvResult =
  | { ok: true; rows: ParsedUserImportRow[] }
  | { ok: false; error: string };

export function parseUsersImportCsv(text: string, maxRows: number): UsersImportCsvResult {
  const records: string[][] = parse(text, {
    bom: true,
    delimiter: ',',
    skip_empty_lines: true,
    relax_column_count: true,
  });

  if (records.length < 2) {
    return { ok: false, error: 'El archivo no contiene datos (solo encabezados o vacío).' };
  }

  const indexes = new Map<Field, number>();
  (records[0] ?? []).forEach((header, index) => {
    const field = HEADER_TO_FIELD.get(normalizeHeader(header));
    if (field && !indexes.has(field)) indexes.set(field, index);
  });

  if (!indexes.has('email') || !indexes.has('role')) {
    return {
      ok: false,
      error:
        'El archivo debe tener al menos las columnas "email" y "role" de la plantilla, o "Correo" y "Rol" del archivo exportado.',
    };
  }

  const dataRows = records.slice(1).filter((r) => r.some((c) => c.trim() !== ''));
  if (dataRows.length === 0) {
    return { ok: false, error: 'El archivo no contiene filas de datos.' };
  }
  if (dataRows.length > maxRows) {
    return {
      ok: false,
      error: `El archivo supera el límite de ${maxRows} usuarios por importación. Divide el archivo en lotes más pequeños.`,
    };
  }

  const cell = (row: string[], field: Field): string => {
    const index = indexes.get(field);
    return index === undefined ? '' : unescapeExportedCell((row[index] ?? '').trim());
  };

  return {
    ok: true,
    rows: dataRows.map((row, i) => ({
      rowIndex: i + 2,
      email: cell(row, 'email'),
      role: cell(row, 'role'),
      firstName: cell(row, 'firstName'),
      lastName: cell(row, 'lastName'),
      phone: cell(row, 'phone'),
      jobTitle: cell(row, 'jobTitle'),
      documentType: cell(row, 'documentType'),
      documentNumber: cell(row, 'documentNumber'),
    })),
  };
}
