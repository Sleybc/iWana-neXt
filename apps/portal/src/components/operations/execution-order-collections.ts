// apps/portal/src/components/operations/execution-order-collections.ts
// Extracción verbatim de OperationsClient.tsx (:57-130, 273-305) — split F2
// (spec 2026-09-13 §4.5). Mismas funciones, mismo orden, cero cambio de
// comportamiento.
import type { ExecutionOrderEvidenceRecord } from '@/lib/api-client';
import { EMPTY_LIST_META, normalizeListMeta } from '@/lib/list-meta';
import type { ListMeta } from '@iwana/shared';

type EvidenceCollection =
  | { data?: ExecutionOrderEvidenceRecord[] | null; meta?: Partial<ListMeta> | null }
  | ExecutionOrderEvidenceRecord[]
  | null
  | undefined;

export function normalizeExecutionOrderEvidence(
  value: EvidenceCollection,
): ExecutionOrderEvidenceRecord[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value?.data ?? [];
}

type ExecutionOrderCollectionResponse<T> =
  | T[]
  | { data?: T[] | null; meta?: Partial<ListMeta> | null };

export interface CollectedExecutionOrderCollection<T> {
  data: T[];
  meta: ListMeta;
}

/**
 * Carga las páginas posteriores de una colección de OT sin convertirla en un
 * listado sin cota. Conserva el total del servidor y deja `hasMore` en true si
 * se alcanza el límite de seguridad antes de consumir todas las páginas.
 */
export async function collectExecutionOrderCollectionPages<T>(
  fetchPage: (page: number, limit: number) => Promise<ExecutionOrderCollectionResponse<T>>,
  options: { limit?: number; maxPages?: number } = {},
): Promise<CollectedExecutionOrderCollection<T>> {
  const limit = options.limit ?? 100;
  const maxPages = options.maxPages ?? 20;
  const data: T[] = [];
  let page = 1;
  let lastMeta = EMPTY_LIST_META;
  let serverHasMore = false;

  while (page <= maxPages) {
    const response = await fetchPage(page, limit);
    const pageData = Array.isArray(response) ? response : (response.data ?? []);
    const responseMeta = Array.isArray(response) ? undefined : response.meta;
    lastMeta = normalizeListMeta(responseMeta, { dataLength: pageData.length, limit });
    data.push(...pageData);
    serverHasMore = responseMeta
      ? (responseMeta.hasMore ??
        (responseMeta.nextCursor != null ||
          (responseMeta.total !== undefined && responseMeta.total > data.length)))
      : false;

    if (!serverHasMore) {
      break;
    }

    page += 1;
  }

  const reachedPageLimit = serverHasMore && page > maxPages;
  const total = Math.max(lastMeta.total, data.length);
  return {
    data,
    meta: {
      ...lastMeta,
      total,
      page: lastMeta.page ?? Math.min(page, maxPages),
      totalPages:
        lastMeta.limit > 0 ? Math.max(1, Math.ceil(total / lastMeta.limit)) : lastMeta.totalPages,
      hasMore: reachedPageLimit,
    },
  };
}

export function normalizeExecutionOrderCollection<T>(
  value: T[] | { data?: T[] | null; meta?: unknown } | null | undefined,
): T[] {
  return Array.isArray(value) ? value : (value?.data ?? []);
}

export async function loadMoreExecutionOrderCollection<T>(
  fetchPage: (page: number, limit: number) => Promise<ExecutionOrderCollectionResponse<T>>,
  currentMeta: ListMeta,
  currentLength: number,
): Promise<CollectedExecutionOrderCollection<T>> {
  const response = await fetchPage((currentMeta.page ?? 1) + 1, currentMeta.limit);
  const pageData = normalizeExecutionOrderCollection(response);
  const responseMeta = Array.isArray(response) ? undefined : response.meta;
  const nextMeta = normalizeListMeta(responseMeta, {
    dataLength: pageData.length,
    limit: currentMeta.limit,
  });

  return {
    data: pageData,
    meta: {
      ...nextMeta,
      total: Math.max(nextMeta.total, currentMeta.total, currentLength + pageData.length),
    },
  };
}
