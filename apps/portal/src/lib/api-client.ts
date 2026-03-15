// apps/portal/src/lib/api-client.ts

/**
 * Cliente HTTP para @iwana/portal — Portal de Suscriptores.
 * Requiere header X-Tenant-Slug para identificar el tenant.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';
const TENANT_SLUG_STORAGE_KEY = 'iwana.portal.tenant-slug';
const ACCESS_TOKEN_STORAGE_KEY = 'iwana.portal.access-token';

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

function readStoredAccessToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) ?? '';
}

function persistAccessToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!token) {
    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
}

interface ApiEnvelope<T> {
  data: T;
}

export interface JwtProfile {
  sub: string;
  email: string;
  role: string;
  tenantId: string | null;
  schemaName: string | null;
  jti: string;
  type: 'platform' | 'tenant';
  iat?: number;
  exp?: number;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  skipRefreshRetry?: boolean;
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

async function refreshAccessToken(tenantSlug: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Slug': tenantSlug,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    persistAccessToken('');
    throw new ApiError(401, 'SESSION_EXPIRED', 'La sesión expiró. Inicia sesión de nuevo.');
  }

  const body = (await res.json()) as ApiEnvelope<{ accessToken: string }>;
  persistAccessToken(body.data.accessToken);
  return body.data.accessToken;
}

async function request<T>(
  path: string,
  options?: RequestOptions,
  tenantSlugOverride?: string,
): Promise<T> {
  const resolvedTenantSlug = getTenantSlug(tenantSlugOverride);
  const token = readStoredAccessToken();
  const headers = new Headers(options?.headers);

  if (!headers.has('Content-Type') && options?.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  headers.set('X-Tenant-Slug', resolvedTenantSlug);

  if (!options?.skipAuth && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !options?.skipAuth && !options?.skipRefreshRetry) {
    try {
      const renewedToken = await refreshAccessToken(resolvedTenantSlug);
      return request<T>(
        path,
        {
          ...options,
          headers: {
            ...Object.fromEntries(headers.entries()),
            Authorization: `Bearer ${renewedToken}`,
          },
          skipRefreshRetry: true,
        },
        resolvedTenantSlug,
      );
    } catch {
      // Si no se puede refrescar, dejamos que el error original se propague.
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, string>;
    throw new ApiError(
      res.status,
      body['code'] ?? 'UNKNOWN',
      body['message'] ?? 'Error del servidor',
    );
  }

  const body = (await res.json()) as ApiEnvelope<T>;
  return body.data;
}

export const authApi = {
  tenantLogin: async (email: string, password: string, tenantSlug?: string) => {
    const resolvedTenantSlug = getTenantSlug(tenantSlug);
    const response = await request<{
      accessToken: string;
      mfaRequired?: boolean;
    }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        skipAuth: true,
        skipRefreshRetry: true,
      },
      resolvedTenantSlug,
    );

    // Persistimos el ultimo tenant valido para reutilizarlo en MFA y reingresos.
    persistTenantSlug(resolvedTenantSlug);

    if (response.accessToken) {
      persistAccessToken(response.accessToken);
    }

    return response;
  },

  mfaVerify: async (code: string) => {
    const response = await request<{ accessToken: string }>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });

    if (response.accessToken) {
      persistAccessToken(response.accessToken);
    }

    return response;
  },

  me: (tenantSlug?: string) => request<JwtProfile>('/auth/me', undefined, tenantSlug),

  logout: async (tenantSlug?: string) => {
    try {
      await request<{ message: string }>('/auth/logout', { method: 'POST' }, tenantSlug);
    } catch {
      // El logout en cliente debe ser best-effort: limpiamos sesion local
      // aunque el backend falle para no bloquear al usuario en la UI.
    } finally {
      persistAccessToken('');
    }
  },
};

export const auditApi = {
  list: (params?: { limit?: number; cursor?: string }, tenantSlug?: string) => {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) {
      searchParams.set('limit', String(params.limit));
    }
    if (params?.cursor) {
      searchParams.set('cursor', params.cursor);
    }

    const query = searchParams.toString();
    return request<AuditLogEntry[]>(
      `/audit-logs${query ? `?${query}` : ''}`,
      undefined,
      tenantSlug,
    );
  },
};
