// apps/portal/src/lib/api-client.ts

/**
 * Cliente HTTP para @iwana/portal — Portal de Suscriptores.
 * Requiere header X-Tenant-Slug para identificar el tenant.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

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

function getTenantSlug(): string {
  return process.env.NEXT_PUBLIC_TENANT_SLUG ?? 'default';
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Slug': getTenantSlug(),
      ...options?.headers,
    },
    credentials: 'include',
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.code ?? 'UNKNOWN', body.message ?? 'Error del servidor');
  }

  return res.json() as Promise<T>;
}

export const authApi = {
  tenantLogin: (email: string, password: string) =>
    request<{
      accessToken: string;
      user: { id: string; email: string; name: string; role: string };
    }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  mfaVerify: (code: string) =>
    request<{ accessToken: string }>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
};
