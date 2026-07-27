import type {
  InventoryListMeta,
  InventoryPaginatedList,
  ListStockBalancesParams,
  StockBalanceRecord,
} from '@/lib/api-client';
import { INVENTORY_LIST_PAGE_SIZE } from '@/lib/api-client';
import { EMPTY_LIST_META } from '@/lib/list-meta';
import { PICKER_SOFT_CAP } from '@/lib/picker-soft-cap';

export { INVENTORY_LIST_PAGE_SIZE, PICKER_SOFT_CAP };

/**
 * Soft-cap histórico loans / write-offs (page/limit).
 */
export const INVENTORY_SOFT_CAP_PAGE_SIZE = 50;

/** Soft-cap proveedores (page/limit vigente). Residual fuera de entidades inventory F4. */
export const SUPPLIERS_SOFT_CAP_PAGE_SIZE = PICKER_SOFT_CAP;

/**
 * Matriz por bodega / ocupación: drenar balances (no page++ de la tabla de ubicaciones).
 * Elección ADR-064: fetch-all-pages al montar (limit 100) con tope de seguridad;
 * si queda nextCursor → load-more visible de balances (ocupación incompleta).
 */
export const INVENTORY_MATRIX_BALANCES_PAGE_SIZE = 100;
export const INVENTORY_MATRIX_BALANCES_MAX_PAGES = 50;

export const EMPTY_INVENTORY_LIST_META: InventoryListMeta = EMPTY_LIST_META;

export function inventoryHasMore(meta: InventoryListMeta | null | undefined): boolean {
  if (!meta) return false;
  if (typeof meta.hasMore === 'boolean') return meta.hasMore;
  return meta.nextCursor != null;
}

type ListBalancesFn = (
  params?: ListStockBalancesParams,
) => Promise<InventoryPaginatedList<StockBalanceRecord>>;

/**
 * Drena balances por cursor hasta `nextCursor == null` o el tope de páginas.
 * Si truncado, `meta.nextCursor` conserva el cursor para load-more.
 */
export async function drainInventoryBalances(
  listBalances: ListBalancesFn,
  options?: { maxPages?: number; pageSize?: number; initialCursor?: string | null },
): Promise<{
  data: StockBalanceRecord[];
  meta: InventoryListMeta;
  truncated: boolean;
}> {
  const maxPages = options?.maxPages ?? INVENTORY_MATRIX_BALANCES_MAX_PAGES;
  const pageSize = options?.pageSize ?? INVENTORY_MATRIX_BALANCES_PAGE_SIZE;
  const collected: StockBalanceRecord[] = [];
  let cursor: string | undefined = options?.initialCursor ?? undefined;
  let lastMeta: InventoryListMeta = EMPTY_INVENTORY_LIST_META;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await listBalances({
      limit: pageSize,
      ...(cursor ? { cursor } : {}),
    });
    const pageData = response.data ?? [];
    for (const row of pageData) {
      collected.push(row);
    }
    lastMeta = response.meta ?? {
      ...EMPTY_INVENTORY_LIST_META,
      nextCursor: null,
      total: collected.length,
    };
    if (!lastMeta.nextCursor) {
      return {
        data: mergeById([], collected),
        meta: { ...lastMeta, nextCursor: null },
        truncated: false,
      };
    }
    cursor = lastMeta.nextCursor;
  }

  return {
    data: mergeById([], collected),
    meta: lastMeta,
    truncated: true,
  };
}

/**
 * Conteo ADR-064: con hasMore → «{cargados} de {total} {recurso}»;
 * completo → «{total} {recurso}». Sin «Fin de resultados».
 */
export function formatInventoryResultsLabel(options: {
  loaded: number;
  total: number;
  hasMore: boolean;
  singular: string;
  plural: string;
}): string {
  const { loaded, total, hasMore, singular, plural } = options;
  const resource = total === 1 ? singular : plural;
  if (hasMore) {
    return `${loaded} de ${total} ${resource}`;
  }
  return `${total} ${resource}`;
}

export function mergeById<T extends { id: string }>(previous: T[], next: T[]): T[] {
  if (previous.length === 0) {
    return next;
  }

  const seen = new Set(previous.map((row) => row.id));
  const appended = next.filter((row) => !seen.has(row.id));
  return appended.length === 0 ? previous : [...previous, ...appended];
}
