import { ApiError, auditApi, type AuditLogEntry } from '@/lib/api-client';

/** Cota compartida: cubre el inicio (8) y la campana (5). Una sola lectura por oleada. */
export const AUDIT_FEED_LIMIT = 8;

export interface AuditFeedSnapshot {
  entries: AuditLogEntry[];
  error: string | null;
  fetchedAt: string | null;
}

let inFlight: Promise<AuditLogEntry[]> | null = null;
let snapshot: AuditFeedSnapshot | null = null;
const listeners = new Set<(next: AuditFeedSnapshot | null) => void>();

function notify(): void {
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function mapAuditFeedError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'Sin permisos para ver el historial de cambios.';
  }
  return 'No pudimos cargar el historial de cambios. Reintenta en unos minutos.';
}

export function getAuditFeedSnapshot(): AuditFeedSnapshot | null {
  return snapshot;
}

export function subscribeAuditFeed(listener: (next: AuditFeedSnapshot | null) => void): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

export async function loadAuditFeed(options?: {
  slug?: string;
  force?: boolean;
}): Promise<AuditLogEntry[]> {
  if (inFlight) {
    return inFlight;
  }
  if (snapshot && snapshot.error === null && !options?.force) {
    return snapshot.entries;
  }

  const request = (async () => {
    try {
      const entries = await auditApi.list({ limit: AUDIT_FEED_LIMIT }, options?.slug);
      snapshot = {
        entries,
        error: null,
        fetchedAt: new Date().toISOString(),
      };
      notify();
      return entries;
    } catch (error) {
      snapshot = {
        entries: snapshot?.entries ?? [],
        error: mapAuditFeedError(error),
        fetchedAt: snapshot?.fetchedAt ?? null,
      };
      notify();
      throw error;
    }
  })();

  inFlight = request.finally(() => {
    if (inFlight === request) {
      inFlight = null;
    }
  });

  return inFlight;
}

/** Limpieza de módulo para pruebas. */
export function __resetAuditFeedCacheForTests(): void {
  inFlight = null;
  snapshot = null;
}
