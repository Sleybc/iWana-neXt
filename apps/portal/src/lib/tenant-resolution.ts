export type TenantResolutionSource = 'input' | 'env' | 'storage' | 'none';

export interface ResolvedTenantSlug {
  slug: string;
  source: TenantResolutionSource;
  isLocked: boolean;
}

export const TENANT_SLUG_STORAGE_KEY = 'iwana.portal.tenant-slug';

const LEGACY_TEST_TENANT_SLUG = 'test-isp';

export function normalizeTenantSlug(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function sanitizeStoredSlug(value: string): string {
  if (value === LEGACY_TEST_TENANT_SLUG) {
    return '';
  }

  return value;
}

export function readStoredTenantSlug(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const storedSlug = normalizeTenantSlug(window.localStorage.getItem(TENANT_SLUG_STORAGE_KEY));
  return sanitizeStoredSlug(storedSlug);
}

export function persistTenantSlug(tenantSlug: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!tenantSlug) {
    window.localStorage.removeItem(TENANT_SLUG_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(TENANT_SLUG_STORAGE_KEY, tenantSlug);
}

export function clearTenantSlugFromStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(TENANT_SLUG_STORAGE_KEY);
}

export function resolveTenantSlug(inputSlug?: string | null): ResolvedTenantSlug {
  const envSlug = normalizeTenantSlug(process.env.NEXT_PUBLIC_TENANT_SLUG);
  if (envSlug) {
    return {
      slug: envSlug,
      source: 'env',
      isLocked: true,
    };
  }

  const normalizedInput = normalizeTenantSlug(inputSlug);
  if (normalizedInput) {
    return {
      slug: normalizedInput,
      source: 'input',
      isLocked: false,
    };
  }

  const storedSlug = readStoredTenantSlug();
  if (storedSlug) {
    return {
      slug: storedSlug,
      source: 'storage',
      isLocked: false,
    };
  }

  return {
    slug: '',
    source: 'none',
    isLocked: false,
  };
}
