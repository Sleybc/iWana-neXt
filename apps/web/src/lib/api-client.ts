// apps/web/src/lib/api-client.ts

/**
 * Cliente HTTP para @iwana/web — Portal Administrativo.
 * Conecta con la API en /api/v1 (proxy Next.js o directo en dev).
 * Endpoint de autenticación de plataforma: POST /auth/platform/login
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';
const ACCESS_TOKEN_STORAGE_KEY = 'iwana.web.access-token';

interface PendingPlatformMfaLogin {
  email: string;
  password: string;
}

let pendingPlatformMfaLogin: PendingPlatformMfaLogin | null = null;

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
  /** Indica si el usuario debe cambiar su contrasena en el siguiente ingreso */
  passwordResetRequired?: boolean;
  iat?: number;
  exp?: number;
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  skipRefreshRetry?: boolean;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function getStoredAccessToken(): string {
  if (!isBrowser()) {
    return '';
  }

  return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) ?? '';
}

export function persistAccessToken(token: string): void {
  if (!isBrowser()) {
    return;
  }

  if (!token) {
    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
}

async function refreshAccessToken(): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const token = getStoredAccessToken();
  const headers = new Headers(options?.headers);

  if (!headers.has('Content-Type') && options?.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

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
      const renewedToken = await refreshAccessToken();
      return request<T>(path, {
        ...options,
        headers: {
          ...Object.fromEntries(headers.entries()),
          Authorization: `Bearer ${renewedToken}`,
        },
        skipRefreshRetry: true,
      });
    } catch {
      // El refresh falló; devolvemos el error original para mostrar feedback claro en UI.
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

  if (res.status === 204) {
    return undefined as T;
  }

  const body = (await res.json()) as ApiEnvelope<T>;
  return body.data;
}

export interface PlatformLoginResponse {
  accessToken: string;
  mfaRequired?: boolean;
}

export function setPendingPlatformMfaLogin(payload: PendingPlatformMfaLogin): void {
  pendingPlatformMfaLogin = payload;
}

export function getPendingPlatformMfaLogin(): PendingPlatformMfaLogin | null {
  return pendingPlatformMfaLogin;
}

export function clearPendingPlatformMfaLogin(): void {
  pendingPlatformMfaLogin = null;
}

export const authApi = {
  platformLogin: async (email: string, password: string, totpCode?: string) => {
    const response = await request<PlatformLoginResponse>('/auth/platform/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...(totpCode ? { totpCode } : {}) }),
      skipAuth: true,
      skipRefreshRetry: true,
    });

    if (response.accessToken && !response.mfaRequired) {
      persistAccessToken(response.accessToken);
    } else if (response.mfaRequired) {
      persistAccessToken('');
    }

    return response;
  },

  mfaVerifySetup: (code: string) =>
    request<{ mfaEnabled: boolean }>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ totpCode: code }),
    }),

  me: () => request<JwtProfile>('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  mfaSetup: () =>
    request<{ qrCodeBase64: string; otpauthUri: string }>('/auth/mfa/setup', {
      method: 'POST',
    }),

  mfaDisable: (password: string, code: string) =>
    request<{ mfaEnabled: boolean }>('/auth/mfa/disable', {
      method: 'POST',
      body: JSON.stringify({ password, totpCode: code }),
    }),

  logout: async () => {
    try {
      await request<{ message: string }>('/auth/logout', { method: 'POST' });
    } catch {
      // El logout en cliente debe ser best-effort: limpiamos sesion local
      // aunque el backend falle para no bloquear al usuario en la UI.
    } finally {
      persistAccessToken('');
      clearPendingPlatformMfaLogin();
    }
  },

  /**
   * Verifica el email del usuario con el token recibido por correo.
   * Requiere header X-Tenant-Slug para identificar el tenant.
   */
  verifyEmail: (token: string, tenantSlug: string) =>
    request<{ message: string }>('/auth/email/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
      skipAuth: true,
      skipRefreshRetry: true,
      headers: { 'X-Tenant-Slug': tenantSlug },
    }),

  /**
   * Reenvía el correo de verificacion de email.
   * Requiere header X-Tenant-Slug para identificar el tenant.
   */
  resendVerification: (email: string, tenantSlug: string) =>
    request<{ message: string }>('/auth/email/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
      skipAuth: true,
      skipRefreshRetry: true,
      headers: { 'X-Tenant-Slug': tenantSlug },
    }),
};

export interface PlatformUserProfile {
  id: string;
  role: string;
  status: string;
  mfaEnabled: boolean;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  timezone: string;
  language: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePlatformUserPayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
  timezone?: string;
  language?: string;
}

export const platformUsersApi = {
  me: () => request<PlatformUserProfile>('/platform-users/me'),

  updateMe: (data: UpdatePlatformUserPayload) =>
    request<PlatformUserProfile>('/platform-users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  status: 'ACTIVE' | 'PROVISIONING' | 'PROVISIONING_FAILED' | 'SUSPENDED' | 'INACTIVE';
  contactEmail: string;
  maxSubscribers: number;
  settings: Record<string, unknown>;
  // Datos legales
  legalName?: string | null;
  nit?: string | null;
  nitDv?: string | null;
  companyType?: string | null;
  // Dirección
  address?: string | null;
  city?: string | null;
  department?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;
  coordinates?: string | null;
  // Contacto adicional
  phone?: string | null;
  website?: string | null;
  economicSector?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const tenantApi = {
  list: (params?: { limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) {
      searchParams.set('limit', String(params.limit));
    }
    if (params?.offset !== undefined) {
      searchParams.set('offset', String(params.offset));
    }

    const query = searchParams.toString();
    return request<TenantListItem[]>(`/tenants${query ? `?${query}` : ''}`);
  },

  getOne: (id: string) => request<TenantListItem>(`/tenants/${encodeURIComponent(id)}`),

  create: (data: CreateTenantPayload) =>
    request<TenantListItem>('/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSettings: (id: string) =>
    request<TenantSettings>(`/tenants/${encodeURIComponent(id)}/settings`),

  updateSettings: (id: string, data: UpdateTenantSettingsPayload) =>
    request<TenantSettings>(`/tenants/${encodeURIComponent(id)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateTenantPayload) =>
    request<TenantListItem>(`/tenants/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  regenerateCredentials: (id: string, idempotencyKey: string) =>
    request<AdminCredentials>(`/tenants/${encodeURIComponent(id)}/regenerate-admin-credentials`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  suspend: (id: string) =>
    request<TenantListItem>(`/tenants/${encodeURIComponent(id)}/suspend`, {
      method: 'PATCH',
    }),

  activate: (id: string) =>
    request<TenantListItem>(`/tenants/${encodeURIComponent(id)}/activate`, {
      method: 'PATCH',
    }),

  retryProvisioning: (id: string) =>
    request<TenantListItem>(`/tenants/${encodeURIComponent(id)}/retry-provisioning`, {
      method: 'PATCH',
    }),

  delete: (id: string) =>
    request<void>(`/tenants/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};

export interface CreateTenantPayload {
  name: string;
  slug: string;
  contactEmail: string;
  maxSubscribers?: number;
  settings?: Record<string, unknown>;
  // Datos legales opcionales
  legalName?: string;
  nit?: string;
  nitDv?: string;
  companyType?: string;
  // Dirección opcionales
  address?: string;
  city?: string;
  department?: string;
  countryCode?: string;
  postalCode?: string;
  coordinates?: string;
  // Contacto adicional opcionales
  phone?: string;
  website?: string;
  economicSector?: string;
}

export interface UpdateTenantPayload {
  name?: string;
  contactEmail?: string;
  maxSubscribers?: number;
  settings?: Record<string, unknown>;
  // Datos legales opcionales
  legalName?: string;
  nit?: string;
  nitDv?: string;
  companyType?: string;
  // Dirección opcionales
  address?: string;
  city?: string;
  department?: string;
  countryCode?: string;
  postalCode?: string;
  coordinates?: string;
  // Contacto adicional opcionales
  phone?: string;
  website?: string;
  economicSector?: string;
}

export interface TenantSettings {
  tenantId: string;
  timezone: string;
  currency: string;
  language: string;
  country: string;
  maxSubscribers: number;
  features: {
    billing: boolean;
    mfa_required_all: boolean;
  };
}

export interface UpdateTenantSettingsPayload {
  timezone?: string;
  currency?: string;
  language?: string;
  country?: string;
  maxSubscribers?: number;
  features?: {
    billing?: boolean;
    mfa_required_all?: boolean;
  };
}

export interface AdminCredentials {
  message: string;
  adminEmail: string;
  temporaryPassword: string;
  expiresAt: string;
}

export interface UserListItem {
  id: string;
  role: string;
  status: string;
  tenantId: string;
  mfaEnabled: boolean;
  emailVerified: boolean;
  passwordResetRequired: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Campos de perfil (opcionales — solo presentes cuando el backend los retorna)
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  documentType?: string | null;
  avatarUrl?: string | null;
}

export interface UserListResponse {
  data: UserListItem[];
  meta: {
    nextCursor: string | null;
    total: number;
  };
}

export interface CreateUserPayload {
  email: string;
  role: string;
  password?: string;
  // Perfil opcional
  firstName?: string;
  lastName?: string;
  phone?: string;
  jobTitle?: string;
  documentType?: string;
  documentNumber?: string;
  avatarUrl?: string;
}

export interface UpdateUserPayload {
  status?: string;
  role?: string;
  // Perfil opcional
  firstName?: string;
  lastName?: string;
  phone?: string;
  jobTitle?: string;
  documentType?: string;
  documentNumber?: string;
  avatarUrl?: string;
}

export const usersApi = {
  list: (
    tenantSlug: string,
    params?: { cursor?: string; limit?: number; status?: string; role?: string },
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.role) searchParams.set('role', params.role);
    const query = searchParams.toString();

    return request<UserListResponse>(`/users${query ? `?${query}` : ''}`, {
      headers: { 'X-Tenant-Slug': tenantSlug },
    });
  },

  create: (tenantSlug: string, data: CreateUserPayload, idempotencyKey: string) =>
    request<UserListItem & { temporaryPassword?: string }>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'X-Tenant-Slug': tenantSlug,
        'Idempotency-Key': idempotencyKey,
      },
    }),

  getOne: (tenantSlug: string, userId: string) =>
    request<UserListItem>(`/users/${encodeURIComponent(userId)}`, {
      headers: { 'X-Tenant-Slug': tenantSlug },
    }),

  update: (tenantSlug: string, userId: string, data: UpdateUserPayload, idempotencyKey: string) =>
    request<UserListItem>(`/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      headers: {
        'X-Tenant-Slug': tenantSlug,
        'Idempotency-Key': idempotencyKey,
      },
    }),

  remove: (tenantSlug: string, userId: string) =>
    request<void>(`/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: {
        'X-Tenant-Slug': tenantSlug,
      },
    }),
};
