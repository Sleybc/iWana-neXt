import type { SelectQueryBuilder } from 'typeorm';

export type AppliedSort = {
  appliedSortBy: string | null;
  appliedSortDir: 'asc' | 'desc' | null;
};

/**
 * Aplica orden dinámico a un SelectQueryBuilder con validación contra
 * una lista blanca de campos ordenables. Si sortBy no está en la lista,
 * o no se provee, no modifica el ORDER BY actual (conserva el default).
 *
 * ADR-065 §18 / Ola 1: `sortableFields` publica nombres lógicos; este helper
 * resuelve el prefijo con `qb.alias` (`${alias}.${campo}`). El nombre lógico
 * es lo que viaja en `meta.sort` y en la URL — nunca un identificador SQL crudo.
 *
 * TypeORM: `orderBy()` reemplaza el ORDER BY acumulado; por eso el caller debe
 * fijar el default **antes** de invocar este helper (patrón tasks.service).
 *
 * @param qb - SelectQueryBuilder con alias ya configurado
 * @param sortableFields - Lista blanca de campos lógicos ordenables
 * @param sortBy - Campo solicitado por el cliente (nombre lógico)
 * @param sortDir - Dirección solicitada ('asc' | 'desc')
 * @param idAlias - Alias de la columna ID para tie-breaker (por defecto 'id')
 * @returns Metadata del orden efectivamente aplicado (by/dir), o null si no se aplicó
 */
export function applySort<Entity extends object>(
  qb: SelectQueryBuilder<Entity>,
  sortableFields: string[],
  sortBy?: string,
  sortDir?: 'asc' | 'desc',
  idAlias: string = 'id',
): AppliedSort {
  if (sortBy && sortableFields.includes(sortBy)) {
    const dir = sortDir ?? 'asc';
    const sqlDir = dir.toUpperCase() as 'ASC' | 'DESC';
    // Nombres lógicos → columna calificada con el alias del QB (ADR-065 §18).
    qb.orderBy(`${qb.alias}.${sortBy}`, sqlDir);
    qb.addOrderBy(`${qb.alias}.${idAlias}`, sqlDir);
    return { appliedSortBy: sortBy, appliedSortDir: dir };
  }
  return { appliedSortBy: null, appliedSortDir: null };
}
