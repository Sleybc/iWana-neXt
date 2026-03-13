// apps/web/src/lib/api-client.ts

/**
 * Cliente HTTP para @iwana/web — Portal Administrativo.
 * Conecta con la API en /api/v1 (proxy Next.js o directo en dev).
 * Endpoint de autenticación de plataforma: POST /auth/platform/login
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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.code ?? 'UNKNOWN', body.message ?? 'Error del servidor');
  }

  return res.json() as Promise<T>;
}

export interface PlatformLoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export const authApi = {
  platformLogin: (email: string, password: string) =>
    request<PlatformLoginResponse>('/auth/platform/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  mfaVerify: (code: string) =>
    request<{ accessToken: string }>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
};
