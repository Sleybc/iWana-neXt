// apps/web/src/lib/api-client.ts

/**
 * Cliente HTTP para @iwana/web — Portal Administrativo.
 * Conecta con la API en /api/v1 (proxy Next.js o directo en dev).
 * Endpoint de autenticación de plataforma: POST /auth/platform/login
 */

function resolveApiBase(): string {
  const configuredApiBase = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (!configuredApiBase) {
    // En desarrollo usamos el mismo origen del frontend y delegamos el acceso
    // al backend al rewrite de Next.js para evitar acoplar el navegador a localhost:3000.
    return '/api/v1';
  }

  return configuredApiBase.replace(/\/$/, '');
}

const API_BASE = resolveApiBase();
const ACCESS_TOKEN_STORAGE_KEY = 'iwana.web.access-token';

interface PendingPlatformMfaLogin {
  email: string;
  password: string;
}

let pendingPlatformMfaLogin: PendingPlatformMfaLogin | null = null;
let refreshAccessTokenPromise: Promise<string> | null = null;

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

/**
 * Decodifica el payload de un JWT sin verificar la firma (solo cliente).
 * Retorna null si el token es inválido o está expirado.
 */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const encodedPayload = parts[1];
    if (!encodedPayload) return null;
    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    return payload;
  } catch {
    return null;
  }
}

/**
 * Verifica si el access token almacenado tiene payload válido y no está expirado.
 * Usa un margen de 30 segundos para anticipar expiración inminente.
 */
export function isStoredTokenValid(): boolean {
  const token = getStoredAccessToken();
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return payload.exp > nowSec + 30;
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

async function executeRefreshAccessToken(): Promise<string> {
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

async function refreshAccessToken(): Promise<string> {
  refreshAccessTokenPromise ??= executeRefreshAccessToken().finally(() => {
    refreshAccessTokenPromise = null;
  });

  return refreshAccessTokenPromise;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Operación cancelada.', 'AbortError'));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(resolve, ms);

    const abort = () => {
      globalThis.clearTimeout(timeoutId);
      reject(new DOMException('Operación cancelada.', 'AbortError'));
    };

    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const token = getStoredAccessToken();
  const headers = new Headers(options?.headers);
  const isFormDataBody = typeof FormData !== 'undefined' && options?.body instanceof FormData;

  if (!headers.has('Content-Type') && options?.body !== undefined && !isFormDataBody) {
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
    } catch (refreshError) {
      if (
        isBrowser() &&
        refreshError instanceof ApiError &&
        refreshError.code === 'SESSION_EXPIRED'
      ) {
        const nextPath = `${window.location.pathname}${window.location.search}`;
        const loginUrl = `/auth/login?next=${encodeURIComponent(nextPath)}&reason=session-expired`;
        window.location.replace(loginUrl);

        // Devolvemos una promesa pendiente para evitar que React muestre
        // un overlay de runtime mientras se completa la redirección.
        return new Promise<T>(() => {
          // Intencionalmente vacío.
        });
      }

      // El refresh falló: re-lanzamos para que el llamador reciba un error claro
      // en vez de caer en el bloque `if (!res.ok)` de la respuesta original.
      throw refreshError;
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
  email: string;
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

export interface ChangePlatformUserLoginEmailPayload {
  email: string;
  currentPassword: string;
}

export interface BootstrapStatusResponse {
  hasUsers: boolean;
  pendingUser: boolean;
}

export interface CreateBootstrapUserPayload {
  email: string;
  password: string;
  confirmPassword: string;
}

export const platformUsersApi = {
  me: () => request<PlatformUserProfile>('/platform-users/me'),

  updateMe: (data: UpdatePlatformUserPayload) =>
    request<PlatformUserProfile>('/platform-users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  changeLoginEmail: (data: ChangePlatformUserLoginEmailPayload) =>
    request<PlatformUserProfile>('/platform-users/me/login-email', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  bootstrapStatus: () =>
    request<BootstrapStatusResponse>('/platform-users/bootstrap/status', {
      skipAuth: true,
      skipRefreshRetry: true,
    }),

  createBootstrapUser: (data: CreateBootstrapUserPayload) =>
    request<{ accessToken: string }>('/platform-users/bootstrap', {
      method: 'POST',
      body: JSON.stringify(data),
      skipAuth: true,
      skipRefreshRetry: true,
    }),
};

export type PlatformBrandingUsage = 'logo' | 'favicon' | 'login_background';
export type PlatformBrandingThemeVariant = 'light' | 'dark';

export interface PlatformPublicBranding {
  productName: string;
  surfaceName: string;
  metadataTitle: string;
  metadataDescription: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  loginBackgroundLightUrl: string | null;
  loginBackgroundDarkUrl: string | null;
}

export interface PlatformBranding extends PlatformPublicBranding {
  logoAssetId: string | null;
  faviconAssetId: string | null;
  loginBackgroundLightAssetId: string | null;
  loginBackgroundDarkAssetId: string | null;
  updatedAt: string;
}

export interface UpdatePlatformBrandingPayload {
  productName?: string;
  surfaceName?: string;
  metadataTitle?: string;
  metadataDescription?: string;
  logoUrl?: string | null;
  logoAssetId?: string | null;
  faviconUrl?: string | null;
  faviconAssetId?: string | null;
  loginBackgroundLightUrl?: string | null;
  loginBackgroundLightAssetId?: string | null;
  loginBackgroundDarkUrl?: string | null;
  loginBackgroundDarkAssetId?: string | null;
}

export const platformBrandingApi = {
  getPublic: () =>
    request<PlatformPublicBranding>('/platform/branding/public', {
      skipAuth: true,
      skipRefreshRetry: true,
    }),

  get: () => request<PlatformBranding>('/platform/branding'),

  update: (data: UpdatePlatformBrandingPayload) =>
    request<PlatformBranding>('/platform/branding', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  reset: () =>
    request<PlatformBranding>('/platform/branding/reset', {
      method: 'POST',
    }),

  uploadAsset: (payload: {
    usage: PlatformBrandingUsage;
    themeVariant?: PlatformBrandingThemeVariant;
    file: File;
  }) => {
    const formData = new FormData();
    formData.append('usage', payload.usage);
    if (payload.themeVariant) {
      formData.append('themeVariant', payload.themeVariant);
    }
    formData.append('file', payload.file);

    return request<MediaAsset>('/platform/branding/assets', {
      method: 'POST',
      body: formData,
    });
  },
};

export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  status:
    | 'ACTIVE'
    | 'PROVISIONING'
    | 'PROVISIONING_FAILED'
    | 'SUSPENDED'
    | 'INACTIVE'
    | 'MARKED_FOR_DELETION';
  contactEmail: string;
  maxSubscribers: number | null;
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
  logoLightUrl?: string | null;
  logoLightAssetId?: string | null;
  logoDarkUrl?: string | null;
  logoDarkAssetId?: string | null;
  sealLightUrl?: string | null;
  sealLightAssetId?: string | null;
  sealDarkUrl?: string | null;
  sealDarkAssetId?: string | null;
  faviconLightUrl?: string | null;
  faviconLightAssetId?: string | null;
  faviconDarkUrl?: string | null;
  faviconDarkAssetId?: string | null;
  loginBackgroundLightUrl?: string | null;
  loginBackgroundLightAssetId?: string | null;
  loginBackgroundDarkUrl?: string | null;
  loginBackgroundDarkAssetId?: string | null;
  showTenantName?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BrandingUsage = 'logo' | 'seal' | 'favicon' | 'login_background';
export type BrandingThemeVariant = 'light' | 'dark';

export interface UpdateTenantBrandingPayload {
  logoLightUrl?: string | null;
  logoLightAssetId?: string | null;
  logoDarkUrl?: string | null;
  logoDarkAssetId?: string | null;
  sealLightUrl?: string | null;
  sealLightAssetId?: string | null;
  sealDarkUrl?: string | null;
  sealDarkAssetId?: string | null;
  faviconLightUrl?: string | null;
  faviconLightAssetId?: string | null;
  faviconDarkUrl?: string | null;
  faviconDarkAssetId?: string | null;
  loginBackgroundLightUrl?: string | null;
  loginBackgroundLightAssetId?: string | null;
  loginBackgroundDarkUrl?: string | null;
  loginBackgroundDarkAssetId?: string | null;
  showTenantName?: boolean;
}

export interface MediaAsset {
  id: string;
  usage: BrandingUsage | 'general';
  themeVariant: BrandingThemeVariant | null;
  mimeType: string;
  sizeBytes: number;
  publicUrl: string | null;
  createdAt: string;
}

interface TenantListParams {
  limit?: number;
  offset?: number;
  status?: TenantListItem['status'];
  search?: string;
}

interface TenantProvisioningWaitOptions {
  signal?: AbortSignal;
  maxAttempts?: number;
  onTick?: (tenant: TenantListItem) => void;
}

export const tenantApi = {
  list: (params?: TenantListParams) => {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) {
      searchParams.set('limit', String(params.limit));
    }
    if (params?.offset !== undefined) {
      searchParams.set('offset', String(params.offset));
    }
    if (params?.status) {
      searchParams.set('status', params.status);
    }
    if (params?.search?.trim()) {
      searchParams.set('search', params.search.trim());
    }

    const query = searchParams.toString();
    return request<TenantListItem[]>(`/tenants${query ? `?${query}` : ''}`);
  },

  getOne: (id: string, options?: { signal?: AbortSignal }) =>
    request<TenantListItem>(
      `/tenants/${encodeURIComponent(id)}`,
      options?.signal ? { signal: options.signal } : undefined,
    ),

  create: (data: CreateTenantPayload) =>
    request<TenantListItem>('/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getBootstrapCredentials: (id: string) =>
    request<AdminCredentials>(`/tenants/${encodeURIComponent(id)}/bootstrap-admin-credentials`, {
      method: 'POST',
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

  updateBranding: (id: string, data: UpdateTenantBrandingPayload) =>
    request<TenantListItem>(`/tenants/${encodeURIComponent(id)}/branding`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  uploadBrandingAsset: (
    id: string,
    payload: { usage: BrandingUsage; themeVariant: BrandingThemeVariant; file: File },
  ) => {
    const formData = new FormData();
    formData.append('usage', payload.usage);
    formData.append('themeVariant', payload.themeVariant);
    formData.append('file', payload.file);

    return request<MediaAsset>(`/tenants/${encodeURIComponent(id)}/branding/assets`, {
      method: 'POST',
      body: formData,
    });
  },

  regenerateCredentials: (id: string, idempotencyKey: string) =>
    request<AdminCredentials>(`/tenants/${encodeURIComponent(id)}/regenerate-admin-credentials`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  waitForProvisioning: async (id: string, options: TenantProvisioningWaitOptions = {}) => {
    const maxAttempts = options.maxAttempts ?? 24;
    const delaysMs = [2000, 3000, 5000, 8000];

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await wait(delaysMs[Math.min(attempt, delaysMs.length - 1)] ?? 8000, options.signal);
      const tenant = await tenantApi.getOne(
        id,
        options.signal ? { signal: options.signal } : undefined,
      );
      options.onTick?.(tenant);

      if (tenant.status === 'ACTIVE' || tenant.status === 'PROVISIONING_FAILED') {
        return tenant;
      }
    }

    return tenantApi.getOne(id, options.signal ? { signal: options.signal } : undefined);
  },

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
  maxSubscribers?: number | null;
  settings?: {
    timezone?: string;
    currency?: string;
    language?: string;
    country?: string;
    features?: {
      billing?: boolean;
      mfa_required_all?: boolean;
    };
  };
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
  maxSubscribers?: number | null;
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
  maxSubscribers: number | null;
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
  maxSubscribers?: number | null;
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
  email: string;
  role: string;
  status: string;
  tenantId: string;
  mfaEnabled: boolean;
  mfaRequired: boolean;
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
  mfaRequired?: boolean;
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
  mfaRequired?: boolean;
}

export interface ChangeLoginEmailAsAdminPayload {
  email: string;
  syncCompanyContactEmail?: boolean;
}

export interface ResetUserPasswordPayload {
  password?: string;
}

export interface ResetUserPasswordResponse {
  temporaryPassword: string;
}

// Entrada de audit log — registro de una operación CUD en el sistema
export interface AuditActorInfo {
  id: string | null;
  type: 'tenant' | 'platform' | 'system' | 'unknown';
  displayName: string;
  role?: string;
  status?: string;
  isDeleted?: boolean;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string | null;
  actor?: AuditActorInfo | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

// Parámetros de filtrado para consulta de audit logs
export interface AuditLogQueryParams {
  cursor?: string;
  limit?: number;
  entityType?: string;
  action?: string;
  from?: string;
  to?: string;
}

// API de audit logs — solo lectura (append-only por diseño)
export const auditApi = {
  list: (params?: AuditLogQueryParams, tenantSlug?: string) => {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) {
      searchParams.set('limit', String(params.limit));
    }
    if (params?.cursor) {
      searchParams.set('cursor', params.cursor);
    }
    if (params?.entityType) {
      searchParams.set('entityType', params.entityType);
    }
    if (params?.action) {
      searchParams.set('action', params.action);
    }
    if (params?.from) {
      searchParams.set('from', params.from);
    }
    if (params?.to) {
      searchParams.set('to', params.to);
    }

    const query = searchParams.toString();
    return request<AuditLogEntry[]>(`/audit-logs${query ? `?${query}` : ''}`, {
      headers: tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {},
    });
  },
};

// Platform audit log entry — sin tenantId (schema público)
export interface PlatformAuditLogEntry {
  id: string;
  userId: string | null;
  actor?: AuditActorInfo | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface PlatformAuditLogResponse {
  data: PlatformAuditLogEntry[];
  nextCursor: string | null;
}

export const platformAuditApi = {
  list: async (params?: {
    cursor?: string;
    limit?: number;
    action?: string;
    entityType?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.action) searchParams.set('action', params.action);
    if (params?.entityType) searchParams.set('entityType', params.entityType);
    const query = searchParams.toString();

    const token = getStoredAccessToken();
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${API_BASE}/platform-audit-logs${query ? `?${query}` : ''}`, {
      headers,
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, string>;
      throw new ApiError(
        res.status,
        body['code'] ?? 'UNKNOWN',
        body['message'] ?? 'Error del servidor',
      );
    }

    return res.json() as Promise<PlatformAuditLogResponse>;
  },
};

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

  changeLoginEmailAsAdmin: (
    tenantSlug: string,
    userId: string,
    data: ChangeLoginEmailAsAdminPayload,
    idempotencyKey: string,
  ) =>
    request<UserListItem>(`/users/${encodeURIComponent(userId)}/login-email/admin`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      headers: {
        'X-Tenant-Slug': tenantSlug,
        'Idempotency-Key': idempotencyKey,
      },
    }),

  resetPassword: (
    tenantSlug: string,
    userId: string,
    data: ResetUserPasswordPayload,
    idempotencyKey: string,
  ) =>
    request<ResetUserPasswordResponse>(`/users/${encodeURIComponent(userId)}/password`, {
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
