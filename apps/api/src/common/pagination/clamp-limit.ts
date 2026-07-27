import { BadRequestException } from '@nestjs/common';

/**
 * Helper clamp de limit para endpoints cursor-based (sin page).
 * Clampa el límite entre 1 y max.
 */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function clampLimit(
  limit: number | undefined | null,
  max = MAX_LIMIT,
  defaultLimit = DEFAULT_LIMIT,
): number {
  if (limit === undefined || limit === null || !Number.isFinite(limit)) {
    return defaultLimit;
  }
  const floored = Math.floor(limit);
  if (floored < 1) return defaultLimit;
  return Math.min(floored, max);
}

/** @deprecated Usar clampLimit del helper común. */
export const clampCommercialLimit = clampLimit;
/** @deprecated Usar clampLimit del helper común. */
export const clampInventoryLimit = clampLimit;
/** @deprecated Usar clampLimit del helper común. */
export const clampTaxationLimit = clampLimit;

// ---------------------------------------------------------------------------
// Constantes legacy — se mantienen en dual-emit hasta Ola 2
// ---------------------------------------------------------------------------

/** @deprecated Usar DEFAULT_LIMIT del helper común. */
export const COMMERCIAL_LIST_DEFAULT_LIMIT = DEFAULT_LIMIT;
/** @deprecated Usar MAX_LIMIT del helper común. */
export const COMMERCIAL_LIST_MAX_LIMIT = MAX_LIMIT;
/** @deprecated Usar DEFAULT_LIMIT del helper común. */
export const INVENTORY_LIST_DEFAULT_LIMIT = DEFAULT_LIMIT;
/** @deprecated Usar MAX_LIMIT del helper común. */
export const INVENTORY_LIST_MAX_LIMIT = MAX_LIMIT;
/** @deprecated Usar DEFAULT_LIMIT del helper común. */
export const TAXATION_LIST_DEFAULT_LIMIT = DEFAULT_LIMIT;
/** @deprecated Usar MAX_LIMIT del helper común. */
export const TAXATION_LIST_MAX_LIMIT = MAX_LIMIT;

// ---------------------------------------------------------------------------
// Tipos legacy de meta — dual-emit hasta Ola 2
// ---------------------------------------------------------------------------

/** @deprecated Migrar a ListMeta de @iwana/shared. */
export type CommercialListMeta = {
  nextCursor: string | null;
  total: number;
};

/** @deprecated Migrar a ListResponse<T> de @iwana/shared. */
export type CommercialPaginatedResult<T> = {
  data: T[];
  meta: CommercialListMeta;
};

/** @deprecated Migrar a ListMeta de @iwana/shared. */
export type InventoryListMeta = {
  nextCursor: string | null;
  total: number;
};

/** @deprecated Migrar a ListResponse<T> de @iwana/shared. */
export type InventoryPaginatedResult<T> = {
  data: T[];
  meta: InventoryListMeta;
};

/** @deprecated Migrar a ListMeta de @iwana/shared. */
export type TaxationListMeta = {
  nextCursor: string | null;
  total: number;
};

/** @deprecated Migrar a ListResponse<T> de @iwana/shared. */
export type TaxationPaginatedResult<T> = {
  data: T[];
  meta: TaxationListMeta;
};

// ---------------------------------------------------------------------------
// Zod fragment reutilizable para listados inventory (legacy)
// ---------------------------------------------------------------------------

import { z } from 'zod';

/** @deprecated Migrar a DTOs tipados con el contrato unificado. */
export const inventoryListPaginationZod = {
  cursor: z.string().min(1).optional(),
  limit: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  ),
};

/**
 * ADR-065 Ola 6: paginación híbrida (page aditivo + cursor).
 * Usar solo en endpoints que ya implementan modo `page`.
 */
export const inventoryHybridPaginationZod = {
  ...inventoryListPaginationZod,
  page: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().min(1).optional(),
  ),
};

/**
 * ADR-065 Ola 6: `page` y `cursor` son excluyentes.
 * Lanza BadRequestException si ambos llegan en la misma query.
 */
export function assertExclusivePageCursor(query: {
  page?: number | undefined;
  cursor?: string | undefined;
}): void {
  if (query.page !== undefined && query.cursor !== undefined) {
    throw new BadRequestException('Los parámetros page y cursor son excluyentes; envíe solo uno.');
  }
}

// ---------------------------------------------------------------------------
// Helpers legacy de inventory (slice en memoria para cursor keyset)
// ---------------------------------------------------------------------------

import { buildDateIdNextCursor } from './cursor-codec';

/** @deprecated Usar paginación en base de datos con el contrato unificado. */
export function sliceDateIdDescPage<T extends { id: string }>(
  rows: T[],
  limit: number,
  getDate: (row: T) => Date | string,
): { data: T[]; nextCursor: string | null } {
  const hasNext = rows.length > limit;
  const data = hasNext ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return {
    data,
    nextCursor: buildDateIdNextCursor(
      hasNext,
      last ? { date: getDate(last), id: last.id } : undefined,
    ),
  };
}
