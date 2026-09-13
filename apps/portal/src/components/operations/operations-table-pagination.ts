// apps/portal/src/components/operations/operations-table-pagination.ts
// Grupo de paginación exclusivo compartido por las dos tablas operativas de
// Operaciones (TasksTable · ExecutionOrdersTable) — contrato de componente
// docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md
// v1.0 §4.1 (AI-DS-OWNER, congelado). La unión discriminada sobre
// `randomAccess` hace error de compilación pasar los dos modos a la vez:
// garantía de tipo del invariante ADR-065 §6 (una tabla, un pie).
// El modo NO se decide aquí: lo calcula el cliente contenedor desde
// `meta.capabilities.randomAccess` y lo entrega por props (contrato §5.3).

/** Modo paginado — exige `meta.capabilities.randomAccess === true`. */
export interface OperationsTablePagedPagination {
  /** Discriminador. Sin valor por defecto; sin derivados locales. */
  randomAccess: true;
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Prohibidos en modo paginado — el error de tipo es la garantía del contrato. */
  hasMore?: never;
  onLoadMore?: never;
}

/** Modo «Cargar más» — `meta.capabilities.randomAccess === false` (ADR-064, vigente). */
export interface OperationsTableLoadMorePagination {
  randomAccess: false;
  hasMore: boolean;
  onLoadMore: () => void;
  page?: never;
  pageCount?: never;
  pageSize?: never;
  onPageChange?: never;
  onPageSizeChange?: never;
}

export type OperationsTablePagination =
  | OperationsTablePagedPagination
  | OperationsTableLoadMorePagination;
