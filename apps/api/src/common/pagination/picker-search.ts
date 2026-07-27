import { BadRequestException } from '@nestjs/common';
import { clampLimit } from './clamp-limit';

/** Límite canónico E-4 typeahead (plan pickers + spec UX §3.3). */
export const PICKER_SEARCH_DEFAULT_LIMIT = 20;
export const PICKER_SEARCH_MAX_LIMIT = 20;

/** Ítem canónico del listbox — alineado a SearchablePickerItem (DS). */
export type PickerSearchItem = {
  id: string;
  label: string;
  sublabel?: string | null;
};

/**
 * Respuesta HTTP de lookup typeahead.
 * FE mapea a `SearchablePickerSearchResult`: `{ items: data, total }`.
 * No usa envelope ListMeta (sin page/cursor): el picker no pagina.
 */
export type PickerSearchResult = {
  data: PickerSearchItem[];
  total: number;
};

export function clampPickerSearchLimit(limit?: number | null): number {
  return clampLimit(limit, PICKER_SEARCH_MAX_LIMIT, PICKER_SEARCH_DEFAULT_LIMIT);
}

/** Normaliza `q` (trim + colapso de espacios). Vacío → string vacío. */
export function normalizePickerQuery(q?: string | null): string {
  return (q ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * Escapa metacaracteres LIKE. No aplica NFD aquí: cada dominio decide
 * normalización (users usa pg_trgm + NFD; catalog/inventory usan ILIKE crudo).
 */
export function escapePickerLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function assertPickerLimit(limit: number): void {
  if (!Number.isFinite(limit) || limit < 1 || limit > PICKER_SEARCH_MAX_LIMIT) {
    throw new BadRequestException(`limit debe ser un entero entre 1 y ${PICKER_SEARCH_MAX_LIMIT}.`);
  }
}
