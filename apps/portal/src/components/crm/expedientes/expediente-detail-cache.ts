import type { ContactAttemptRecord, ExpedienteTimelinePageResponse } from '@/lib/api-client';
import {
  resolveTenantSlug,
  TENANT_SCOPE_CHANGED_EVENT,
  TENANT_SCOPE_CHANGED_STORAGE_KEY,
  TENANT_SLUG_STORAGE_KEY,
} from '@/lib/tenant-resolution';

const RESOURCE_TTL_MS = 5 * 60 * 1000;
type CacheEntry = { value: unknown; expiresAt: number };

const resourceCache = new Map<string, CacheEntry>();
const resourceRequests = new Map<string, Promise<unknown>>();
const resourceVersions = new Map<string, number>();
let cacheGeneration = 0;

if (typeof window !== 'undefined') {
  window.addEventListener(TENANT_SCOPE_CHANGED_EVENT, () => {
    clearExpedienteDetailCache();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === TENANT_SLUG_STORAGE_KEY || event.key === TENANT_SCOPE_CHANGED_STORAGE_KEY) {
      clearExpedienteDetailCache();
    }
  });
}

export function resolveExpedienteCacheScope(tenantId?: string | null): string {
  const normalizedTenantId = tenantId?.trim();
  if (normalizedTenantId) {
    return `tenant-id:${normalizedTenantId}`;
  }

  const tenantSlug = resolveTenantSlug().slug;
  return tenantSlug ? `tenant-slug:${tenantSlug}` : '';
}

export function getCachedExpedienteResource<T>(
  tenantScope: string,
  key: string,
  loader: () => Promise<T>,
  force = false,
): Promise<T> {
  if (!tenantScope) {
    return loader();
  }

  const scopedKey = `${tenantScope}:${key}`;
  const now = Date.now();
  const cached = resourceCache.get(scopedKey);
  if (!force && cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value as T);
  }
  if (cached && cached.expiresAt <= now) {
    resourceCache.delete(scopedKey);
  }

  if (!force) {
    const pending = resourceRequests.get(scopedKey);
    if (pending) {
      return pending.then((value) => value as T);
    }
  }

  const generation = cacheGeneration;
  const requestVersion = (resourceVersions.get(scopedKey) ?? 0) + 1;
  resourceVersions.set(scopedKey, requestVersion);
  const request = loader()
    .then((value) => {
      if (generation === cacheGeneration && resourceVersions.get(scopedKey) === requestVersion) {
        resourceCache.set(scopedKey, { value, expiresAt: Date.now() + RESOURCE_TTL_MS });
      }
      return value;
    })
    .finally(() => {
      if (resourceRequests.get(scopedKey) === request) {
        resourceRequests.delete(scopedKey);
      }
    });

  resourceRequests.set(scopedKey, request);
  return request;
}

export function getCachedContactAttempts(
  tenantScope: string,
  expedienteId: string,
  loader: () => Promise<ContactAttemptRecord[]>,
  force = false,
): Promise<ContactAttemptRecord[]> {
  return getCachedExpedienteResource(
    tenantScope,
    `contact-attempts:${expedienteId}`,
    loader,
    force,
  );
}

export function getCachedExpedienteTimelinePage(
  tenantScope: string,
  expedienteId: string,
  page: number,
  limit: number,
  filter: string,
  loader: () => Promise<ExpedienteTimelinePageResponse>,
  force = false,
): Promise<ExpedienteTimelinePageResponse> {
  return getCachedExpedienteResource(
    tenantScope,
    `timeline-page:${expedienteId}:${page}:${limit}:${filter}`,
    loader,
    force,
  );
}

export function invalidateExpedienteTimelineCache(tenantScope: string, expedienteId: string): void {
  if (!tenantScope || !expedienteId) {
    return;
  }

  const prefix = `${tenantScope}:timeline-page:${expedienteId}:`;
  const timelineKeys = new Set(
    [...resourceCache.keys(), ...resourceRequests.keys(), ...resourceVersions.keys()].filter(
      (key) => key.startsWith(prefix),
    ),
  );

  for (const key of timelineKeys) {
    resourceCache.delete(key);
    resourceRequests.delete(key);
    resourceVersions.set(key, (resourceVersions.get(key) ?? 0) + 1);
  }
}

export function invalidateExpedienteFieldWorkCache(
  tenantScope: string,
  expedienteId: string,
): void {
  if (!tenantScope || !expedienteId) {
    return;
  }

  const scopedKey = `${tenantScope}:field-work:${expedienteId}`;
  resourceCache.delete(scopedKey);
  resourceRequests.delete(scopedKey);
  resourceVersions.set(scopedKey, (resourceVersions.get(scopedKey) ?? 0) + 1);
}

export function clearExpedienteDetailCache(): void {
  cacheGeneration += 1;
  resourceCache.clear();
  resourceRequests.clear();
  resourceVersions.clear();
}
