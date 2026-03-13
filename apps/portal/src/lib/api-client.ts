// apps/portal/src/lib/api-client.ts

/**
 * Cliente HTTP para @iwana/portal — Portal de Suscriptores.
 * Requiere header X-Tenant-Slug para identificar el tenant.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';
const TENANT_SLUG_STORAGE_KEY = 'iwana.portal.tenant-slug';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function normalizeTenantSlug(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function readStoredTenantSlug(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return normalizeTenantSlug(window.localStorage.getItem(TENANT_SLUG_STORAGE_KEY));
}

function persistTenantSlug(tenantSlug: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(TENANT_SLUG_STORAGE_KEY, tenantSlug);
}

function getTenantSlug(tenantSlugOverride?: string): string {
  const overrideSlug = normalizeTenantSlug(tenantSlugOverride);
  if (overrideSlug) {
    return overrideSlug;
  }

  const envSlug = normalizeTenantSlug(process.env.NEXT_PUBLIC_TENANT_SLUG);
  if (envSlug) {
    return envSlug;
  }

  const storedSlug = readStoredTenantSlug();
  if (storedSlug) {
    return storedSlug;
  }

  throw new ApiError(
    400,
    'TENANT_SLUG_REQUIRED',
    'Falta el tenant. Ingresa el slug del tenant en el login o configura NEXT_PUBLIC_TENANT_SLUG.',
  );
}

async function request<T>(path: string, options?: RequestInit, tenantSlugOverride?: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Slug': getTenantSlug(tenantSlugOverride),
      ...options?.headers,
    },
    credentials: 'include',
    ...options,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, string>;
    throw new ApiError(res.status, body['code'] ?? 'UNKNOWN', body['message'] ?? 'Error del servidor');
  }

  return res.json() as Promise<T>;
}

export const authApi = {
  tenantLogin: async (email: string, password: string, tenantSlug?: string) => {
    const resolvedTenantSlug = getTenantSlug(tenantSlug);
    const response = await request<{
      accessToken: string;
      user: { id: string; email: string; name: string; role: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, resolvedTenantSlug);

    // Persistimos el ultimo tenant valido para reutilizarlo en MFA y reingresos.
    persistTenantSlug(resolvedTenantSlug);
    return response;
  },
  mfaVerify: (code: string) =>
    request<{ accessToken: string }>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
};
