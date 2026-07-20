import { Between, FindOperator, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';

/** Máximo de filas en export CSV sync (sin BullMQ). */
export const AUDIT_EXPORT_MAX_ROWS = 5000;

export const AUDIT_EXPORT_TRUNCATED_HEADER = 'X-Export-Truncated';

export interface AuditCsvRowInput {
  createdAt: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  /** displayName del actor, o userId, o "Sistema" */
  actorLabel: string;
  ipAddress: string | null;
  requestId: string | null;
}

export interface AuditCsvExportResult {
  csv: string;
  truncated: boolean;
  rowCount: number;
}

/**
 * Construye filtro TypeORM sobre `createdAt` a partir de ISO from/to.
 * Rango inclusivo en ambos extremos cuando hay fechas.
 */
export function buildCreatedAtFilter(
  fromDate?: string,
  toDate?: string,
): FindOperator<Date> | undefined {
  if (fromDate && toDate) {
    return Between(new Date(fromDate), new Date(toDate));
  }
  if (fromDate) {
    return MoreThanOrEqual(new Date(fromDate));
  }
  if (toDate) {
    return LessThanOrEqual(new Date(toDate));
  }
  return undefined;
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * CSV de auditoría: headers en español, sin PII extra (sin email/UA/valores old/new).
 * Si `truncated`, primera fila es comentario de alcance.
 */
export function buildAuditCsv(
  rows: AuditCsvRowInput[],
  options?: { truncated?: boolean; maxRows?: number },
): string {
  const headers = ['Fecha', 'Acción', 'Entidad', 'ID de entidad', 'Actor', 'IP', 'ID de solicitud'];
  const lines: string[] = [];

  if (options?.truncated) {
    const max = options.maxRows ?? AUDIT_EXPORT_MAX_ROWS;
    lines.push(escapeCsvCell(`Export limitado a ${max} registros`));
  }

  lines.push(headers.map(escapeCsvCell).join(','));

  for (const row of rows) {
    const cells = [
      row.createdAt.toISOString(),
      row.action,
      row.entityType,
      row.entityId ?? '',
      row.actorLabel,
      row.ipAddress ?? '',
      row.requestId ?? '',
    ].map(escapeCsvCell);
    lines.push(cells.join(','));
  }

  return lines.join('\r\n');
}
