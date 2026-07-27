/**
 * Contrato único de paginación para todo el Modulith (ADR-065).
 *
 * Reemplaza las 6 formas de envelope previas y los tres archivos duplicados.
 * Superconjunto exacto de lo que ya devuelven commercial, inventory, taxation y visit-requests.
 *
 * @see ADR-065 §Decisión 10 — Contrato de API único
 */

export interface ListMeta {
  /** Cursor opaco base64url para la siguiente página (modo cursor). null en modo page. */
  nextCursor: string | null;
  /** Total de registros del conjunto filtrado. */
  total: number;
  /** true cuando total es una estimación (recursos de alto volumen como audit_logs). */
  totalIsEstimate: boolean;
  /** Número de página (1-based). null en modo cursor. */
  page: number | null;
  /** Tamaño de página aplicado. */
  limit: number;
  /** Total de páginas. null en modo cursor. */
  totalPages: number | null;
  /** true cuando hay más resultados disponibles. */
  hasMore: boolean;
  /** Modo de acceso: 'page' (offset) o 'cursor' (keyset). */
  mode: 'page' | 'cursor';
  /** Capacidades declaradas por el servidor. */
  capabilities: {
    /** true si el recurso soporta salto arbitrario a cualquier página. */
    randomAccess: boolean;
    /** Campos lógicos ordenables por el cliente. Vacío = tabla sin orden por columna. */
    sortableFields: string[];
  };
  /** Orden efectivamente aplicado; null = orden por defecto del recurso. */
  sort: { by: string; dir: 'asc' | 'desc' } | null;
}

/**
 * Envelope único de respuesta para todos los endpoints de listado del Modulith.
 *
 * Durante el dual-emit de la Ola 1 se emiten campos planos (`page`, `total`, `limit`)
 * además del `meta` completo. El frontend lee `meta`; los campos planos llevan
 * `@deprecated` en OpenAPI.
 */
export interface ListResponse<T> {
  data: T[];
  meta: ListMeta;
}
