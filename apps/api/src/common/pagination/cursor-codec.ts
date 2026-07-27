import { BadRequestException } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Payload primitives — idénticos en commercial, inventory y taxation.
// Unificados aquí como fuente única (ADR-065 §Paso 2).
// ---------------------------------------------------------------------------

/**
 * Codifica un payload como string base64url.
 * Usado internamente por todos los codificadores de cursor.
 */
export function encodePayload(payload: Record<string, string>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Decodifica un cursor base64url y retorna el payload como objeto.
 * Lanza BadRequestException si el formato es inválido.
 */
export function decodePayload(cursor: string): Record<string, unknown> {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new BadRequestException('Cursor de paginación inválido');
  }
}

// ---------------------------------------------------------------------------
// Cursor tipos — unificados de los tres módulos
// ---------------------------------------------------------------------------

/** Cursor keyset por (date DESC, id DESC). */
export type DateIdCursor = { d: string; i: string };

/** Cursor keyset por (name ASC, id ASC). */
export type NameIdCursor = { n: string; i: string };

/** Cursor keyset por (code ASC, id ASC). */
export type CodeIdCursor = { c: string; i: string };

/** Cursor keyset por (sortOrder ASC, name ASC, id ASC). */
export type SortNameIdCursor = { s: number; n: string; i: string };

/** Cursor keyset por (is_active DESC, name ASC, id ASC). */
export type ActiveNameIdCursor = { a: 0 | 1; n: string; i: string };

/** Cursor keyset por (categoryRank ASC, name ASC, id ASC). */
export type CategoryRankNameIdCursor = { r: number; n: string; i: string };

// ---------------------------------------------------------------------------
// Date+Id (commercial + inventory + taxation)
// ---------------------------------------------------------------------------

export function encodeDateIdCursor(date: Date | string, id: string): string {
  const d = typeof date === 'string' ? date : date.toISOString();
  return encodePayload({ d, i: id });
}

export function decodeDateIdCursor(cursor: string): DateIdCursor {
  const parsed = decodePayload(cursor);
  if (typeof parsed.d !== 'string' || typeof parsed.i !== 'string') {
    throw new BadRequestException('Cursor de paginación inválido');
  }
  return { d: parsed.d, i: parsed.i };
}

export function buildDateIdNextCursor(
  hasNext: boolean,
  last: { date: Date | string; id: string } | undefined,
): string | null {
  if (!hasNext || !last) return null;
  return encodeDateIdCursor(last.date, last.id);
}

/**
 * Predicado keyset para orden date DESC, id DESC.
 * `dateColumn` es el nombre de columna SQL (p. ej. `created_at`).
 */
export function dateIdDescCursorWhere(alias: string, dateColumn: string): string {
  return `(${alias}.${dateColumn} < :invCursorDate OR (${alias}.${dateColumn} = :invCursorDate AND ${alias}.id < :invCursorId))`;
}

export function dateIdDescCursorParams(cursor: string): {
  invCursorDate: string;
  invCursorId: string;
} {
  const decoded = decodeDateIdCursor(cursor);
  return { invCursorDate: decoded.d, invCursorId: decoded.i };
}

// ---------------------------------------------------------------------------
// Name+Id (commercial)
// ---------------------------------------------------------------------------

export function encodeNameIdCursor(name: string, id: string): string {
  return encodePayload({ n: name, i: id });
}

export function decodeNameIdCursor(cursor: string): NameIdCursor {
  const parsed = decodePayload(cursor);
  if (typeof parsed.n !== 'string' || typeof parsed.i !== 'string') {
    throw new BadRequestException('Cursor de paginación inválido');
  }
  return { n: parsed.n, i: parsed.i };
}

export function buildNameIdNextCursor(
  hasNext: boolean,
  last: { name: string; id: string } | undefined,
): string | null {
  if (!hasNext || !last) return null;
  return encodeNameIdCursor(last.name, last.id);
}

// ---------------------------------------------------------------------------
// Code+Id (taxation)
// ---------------------------------------------------------------------------

export function encodeCodeIdCursor(code: string, id: string): string {
  return encodePayload({ c: code, i: id });
}

export function decodeCodeIdCursor(cursor: string): CodeIdCursor {
  const parsed = decodePayload(cursor);
  if (typeof parsed.c !== 'string' || typeof parsed.i !== 'string') {
    throw new BadRequestException('Cursor de paginación inválido');
  }
  return { c: parsed.c, i: parsed.i };
}

export function buildCodeIdNextCursor(
  hasNext: boolean,
  last: { code: string; id: string } | undefined,
): string | null {
  if (!hasNext || !last) return null;
  return encodeCodeIdCursor(last.code, last.id);
}

// ---------------------------------------------------------------------------
// Sort+Name+Id (inventory)
// ---------------------------------------------------------------------------

export function encodeSortNameIdCursor(sortOrder: number, name: string, id: string): string {
  return encodePayload({ s: String(sortOrder), n: name, i: id });
}

export function decodeSortNameIdCursor(cursor: string): SortNameIdCursor {
  const parsed = decodePayload(cursor);
  const sortOrder = typeof parsed.s === 'string' ? Number(parsed.s) : Number.NaN;
  if (!Number.isFinite(sortOrder) || typeof parsed.n !== 'string' || typeof parsed.i !== 'string') {
    throw new BadRequestException('Cursor de paginación inválido');
  }
  return { s: sortOrder, n: parsed.n, i: parsed.i };
}

export function buildSortNameIdNextCursor(
  hasNext: boolean,
  last: { sortOrder: number; name: string; id: string } | undefined,
): string | null {
  if (!hasNext || !last) return null;
  return encodeSortNameIdCursor(last.sortOrder, last.name, last.id);
}

export function sortNameIdAscCursorWhere(alias: string): string {
  return `(
    ${alias}.sort_order > :invCursorSort
    OR (${alias}.sort_order = :invCursorSort AND ${alias}.name > :invCursorName)
    OR (${alias}.sort_order = :invCursorSort AND ${alias}.name = :invCursorName AND ${alias}.id > :invCursorId)
  )`;
}

export function sortNameIdAscCursorParams(cursor: string): {
  invCursorSort: number;
  invCursorName: string;
  invCursorId: string;
} {
  const decoded = decodeSortNameIdCursor(cursor);
  return {
    invCursorSort: decoded.s,
    invCursorName: decoded.n,
    invCursorId: decoded.i,
  };
}

// ---------------------------------------------------------------------------
// Active+Name+Id (commercial)
// ---------------------------------------------------------------------------

export function encodeActiveNameIdCursor(isActive: boolean, name: string, id: string): string {
  return encodePayload({ a: isActive ? '1' : '0', n: name, i: id });
}

export function decodeActiveNameIdCursor(cursor: string): ActiveNameIdCursor {
  const parsed = decodePayload(cursor);
  if (
    (parsed.a !== '0' && parsed.a !== '1') ||
    typeof parsed.n !== 'string' ||
    typeof parsed.i !== 'string'
  ) {
    throw new BadRequestException('Cursor de paginación inválido');
  }
  return { a: parsed.a === '1' ? 1 : 0, n: parsed.n, i: parsed.i };
}

export function buildActiveNameIdNextCursor(
  hasNext: boolean,
  last: { isActive: boolean; name: string; id: string } | undefined,
): string | null {
  if (!hasNext || !last) return null;
  return encodeActiveNameIdCursor(last.isActive, last.name, last.id);
}

// ---------------------------------------------------------------------------
// CategoryRank+Name+Id (commercial)
// ---------------------------------------------------------------------------

export function encodeCategoryRankNameIdCursor(rank: number, name: string, id: string): string {
  return encodePayload({ r: String(rank), n: name, i: id });
}

export function decodeCategoryRankNameIdCursor(cursor: string): CategoryRankNameIdCursor {
  const parsed = decodePayload(cursor);
  if (
    typeof parsed.r !== 'string' ||
    typeof parsed.n !== 'string' ||
    typeof parsed.i !== 'string'
  ) {
    throw new BadRequestException('Cursor de paginación inválido');
  }
  const rank = Number(parsed.r);
  if (!Number.isInteger(rank)) {
    throw new BadRequestException('Cursor de paginación inválido');
  }
  return { r: rank, n: parsed.n, i: parsed.i };
}

export function buildCategoryRankNameIdNextCursor(
  hasNext: boolean,
  last: { rank: number; name: string; id: string } | undefined,
): string | null {
  if (!hasNext || !last) return null;
  return encodeCategoryRankNameIdCursor(last.rank, last.name, last.id);
}

// ---------------------------------------------------------------------------
// Auditoría: cursor compuesto (createdAt, id) — DEF-3
// ---------------------------------------------------------------------------

export type AuditCursor = { d: string; i: string };

export function encodeAuditCursor(createdAt: Date | string, id: string): string {
  const d = typeof createdAt === 'string' ? createdAt : createdAt.toISOString();
  return encodePayload({ d, i: id });
}

export function decodeAuditCursor(cursor: string): AuditCursor {
  const parsed = decodePayload(cursor);
  if (typeof parsed.d !== 'string' || typeof parsed.i !== 'string') {
    throw new BadRequestException('Cursor de paginación inválido');
  }
  return { d: parsed.d, i: parsed.i };
}
