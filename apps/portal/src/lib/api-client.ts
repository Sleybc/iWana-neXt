// apps/portal/src/lib/api-client.ts

/**
 * Cliente HTTP para @iwana/portal — Portal de Suscriptores.
 * Requiere header X-Tenant-Slug para identificar el tenant.
 */

function resolveApiBase(): string {
  const configuredApiBase = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (!configuredApiBase) {
    // En desarrollo usamos el mismo origen del portal y delegamos el salto al backend
    // al rewrite de Next.js para evitar acoplar el navegador a localhost:3000.
    return '/api/v1';
  }

  return configuredApiBase.replace(/\/$/, '');
}

const API_BASE = resolveApiBase();
const TENANT_SLUG_STORAGE_KEY = 'iwana.portal.tenant-slug';
const ACCESS_TOKEN_STORAGE_KEY = 'iwana.portal.access-token';

/**
 * Clave localStorage para el token de alcance limitado emitido cuando un rol critico
 * (ADMIN, NOC, ACCOUNTANT) no tiene MFA configurado.
 * Solo existe durante el flujo de MFA setup. Se elimina al activar MFA.
 * HLD-MOD02-ARQUITECTURA-v1.0 §6.3 (DA-MOD02-01)
 */
const MFA_SETUP_TOKEN_STORAGE_KEY = 'iwana.portal.mfa-setup-token';

interface PendingTenantMfaLogin {
  email: string;
  password: string;
  tenantSlug: string;
}

let pendingTenantMfaLogin: PendingTenantMfaLogin | null = null;

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
  const token = readStoredAccessToken();
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return payload.exp > nowSec + 30;
}

export function persistAccessToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!token) {
    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
}

/** Lee el token de alcance limitado para MFA setup desde localStorage. */
function readMfaSetupToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.localStorage.getItem(MFA_SETUP_TOKEN_STORAGE_KEY) ?? '';
}

/** Persiste el token limitado de MFA setup en localStorage. */
function persistMfaSetupToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (!token) {
    window.localStorage.removeItem(MFA_SETUP_TOKEN_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(MFA_SETUP_TOKEN_STORAGE_KEY, token);
}

/** Elimina el token limitado de MFA setup del localStorage. */
function clearMfaSetupTokenFromStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(MFA_SETUP_TOKEN_STORAGE_KEY);
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

export function setPendingTenantMfaLogin(payload: PendingTenantMfaLogin): void {
  pendingTenantMfaLogin = payload;
}

export function getPendingTenantMfaLogin(): PendingTenantMfaLogin | null {
  return pendingTenantMfaLogin;
}

export function clearPendingTenantMfaLogin(): void {
  pendingTenantMfaLogin = null;
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
    } catch (refreshError) {
      // Si no se puede refrescar, re-lanzamos para que el llamador reciba un error claro.
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

  const body = (await res.json()) as ApiEnvelope<T>;
  return body.data;
}

export const authApi = {
  tenantLogin: async (email: string, password: string, tenantSlug?: string, totpCode?: string) => {
    const resolvedTenantSlug = getTenantSlug(tenantSlug);
    const response = await request<{
      accessToken: string;
      mfaRequired?: boolean;
      mfaSetupRequired?: boolean;
    }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, ...(totpCode ? { totpCode } : {}) }),
        skipAuth: true,
        skipRefreshRetry: true,
      },
      resolvedTenantSlug,
    );

    // Persistimos el ultimo tenant valido para reutilizarlo en MFA y reingresos.
    persistTenantSlug(resolvedTenantSlug);

    if (response.mfaSetupRequired && response.accessToken) {
      // Token de alcance limitado: almacenar por separado, NO como token de sesion
      persistMfaSetupToken(response.accessToken);
      persistAccessToken('');
    } else if (response.accessToken && !response.mfaRequired) {
      persistAccessToken(response.accessToken);
    } else if (response.mfaRequired) {
      persistAccessToken('');
    }

    return response;
  },

  mfaVerify: async (code: string) => {
    const response = await request<{ accessToken: string }>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ totpCode: code }),
    });

    if (response.accessToken) {
      persistAccessToken(response.accessToken);
    }

    return response;
  },

  forgotPassword: (email: string, tenantSlug?: string) =>
    request<{ message: string }>(
      '/auth/forgot-password',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
        skipAuth: true,
        skipRefreshRetry: true,
      },
      tenantSlug,
    ),

  resetPassword: (token: string, newPassword: string, email?: string, tenantSlug?: string) =>
    request<{ message: string }>(
      '/auth/reset-password',
      {
        method: 'POST',
        body: JSON.stringify({ token, newPassword, ...(email ? { email } : {}) }),
        skipAuth: true,
        skipRefreshRetry: true,
      },
      tenantSlug,
    ),

  me: (tenantSlug?: string) => request<JwtProfile>('/auth/me', undefined, tenantSlug),

  /**
   * Cambia la contrasena del usuario autenticado.
   * Invalida todos los refresh tokens al completar.
   */
  changePassword: (currentPassword: string, newPassword: string, tenantSlug?: string) =>
    request<{ message: string }>(
      '/auth/change-password',
      {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      },
      tenantSlug,
    ),

  logout: async (tenantSlug?: string) => {
    try {
      await request<{ message: string }>('/auth/logout', { method: 'POST' }, tenantSlug);
    } catch {
      // El logout en cliente debe ser best-effort: limpiamos sesion local
      // aunque el backend falle para no bloquear al usuario en la UI.
    } finally {
      persistAccessToken('');
      clearPendingTenantMfaLogin();
      clearMfaSetupTokenFromStorage();
    }
  },

  /**
   * Verifica el email del usuario con el token recibido por correo.
   */
  verifyEmail: (token: string, tenantSlug?: string) =>
    request<{ message: string }>(
      '/auth/email/verify',
      {
        method: 'POST',
        body: JSON.stringify({ token }),
        skipAuth: true,
        skipRefreshRetry: true,
      },
      tenantSlug,
    ),

  /**
   * Reenvía el correo de verificacion de email.
   */
  resendVerification: (email: string, tenantSlug?: string) =>
    request<{ message: string }>(
      '/auth/email/resend-verification',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
        skipAuth: true,
        skipRefreshRetry: true,
      },
      tenantSlug,
    ),

  /**
   * Inicia el setup de MFA: genera el QR code y el secret TOTP.
   * Requiere el token de alcance limitado (scope='mfa-setup') almacenado en localStorage.
   * Solo disponible para roles criticos (ADMIN, NOC, ACCOUNTANT) sin MFA configurado.
   * HLD-MOD02-ARQUITECTURA-v1.0 §3.1 (Paso 4)
   */
  mfaSetup: async (tenantSlug?: string) => {
    const mfaSetupToken = readMfaSetupToken();
    if (!mfaSetupToken) {
      throw new ApiError(
        401,
        'MFA_SETUP_TOKEN_MISSING',
        'No hay token de configuración MFA. Inicia sesión de nuevo.',
      );
    }

    const resolvedTenantSlug = getTenantSlug(tenantSlug);
    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-Tenant-Slug': resolvedTenantSlug,
      Authorization: `Bearer ${mfaSetupToken}`,
    });

    const res = await fetch(`${API_BASE}/auth/mfa/setup`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, string>;
      throw new ApiError(
        res.status,
        body['code'] ?? 'UNKNOWN',
        body['message'] ?? 'Error al iniciar configuración MFA',
      );
    }

    const body = (await res.json()) as { data: { qrCodeBase64: string; otpauthUri: string } };
    return body.data;
  },

  /**
   * Verifica el primer codigo TOTP para activar MFA.
   * Usa el token de alcance limitado almacenado durante el flujo de setup.
   * Tras activacion exitosa, el frontend debe llamar clearMfaSetupToken().
   * HLD-MOD02-ARQUITECTURA-v1.0 §3.1 (Paso 4)
   */
  mfaVerifySetup: async (totpCode: string, tenantSlug?: string) => {
    const mfaSetupToken = readMfaSetupToken();
    if (!mfaSetupToken) {
      throw new ApiError(
        401,
        'MFA_SETUP_TOKEN_MISSING',
        'No hay token de configuración MFA. Inicia sesión de nuevo.',
      );
    }

    const resolvedTenantSlug = getTenantSlug(tenantSlug);
    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-Tenant-Slug': resolvedTenantSlug,
      Authorization: `Bearer ${mfaSetupToken}`,
    });

    const res = await fetch(`${API_BASE}/auth/mfa/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ totpCode }),
      credentials: 'include',
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, string>;
      throw new ApiError(
        res.status,
        body['code'] ?? 'UNKNOWN',
        body['message'] ?? 'Error al verificar código MFA',
      );
    }

    const body = (await res.json()) as { data: { mfaEnabled: boolean } };
    return body.data;
  },

  /**
   * Elimina el token de alcance limitado de MFA setup del localStorage.
   * Llamar despues de activar MFA exitosamente para no dejar token residual.
   */
  clearMfaSetupToken: clearMfaSetupTokenFromStorage,
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

// ─────────────────────────────────────────────────────────────────────────────
// CONTRATOS SELF-SERVICE DEL TENANT AUTENTICADO
// Endpoints exclusivos del portal empresarial — nunca usar tenants/:id desde portal.
// HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §3.2
// ─────────────────────────────────────────────────────────────────────────────

/** Estado del tenant — alineado con TenantStatus del backend */
export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'PROVISIONING' | 'PROVISIONING_FAILED';

/** Datos base del tenant autenticado para el dashboard empresarial */
export interface TenantSelf {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  contactEmail: string;
  legalName: string | null;
  nit: string | null;
  nitDv: string | null;
  city: string | null;
  department: string | null;
  countryCode: string | null;
  phone: string | null;
  website: string | null;
  createdAt: string;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  sealLightUrl: string | null;
  sealDarkUrl: string | null;
  showTenantName: boolean;
}

export interface UpdateTenantSelfProfileDto {
  contactEmail?: string;
  legalName?: string | null;
  nit?: string | null;
  nitDv?: string | null;
  city?: string | null;
  department?: string | null;
  countryCode?: string | null;
  phone?: string | null;
  website?: string | null;
}

export interface UpdateTenantSelfBrandingDto {
  logoLightUrl?: string | null;
  logoDarkUrl?: string | null;
  sealLightUrl?: string | null;
  sealDarkUrl?: string | null;
  showTenantName?: boolean;
}

/** Configuración operativa del tenant autenticado */
export interface TenantSelfSettings {
  timezone: string;
  currency: string;
  language: string;
  country: string;
  features: {
    billing: boolean;
    mfa_required_all: boolean;
  };
}

export interface UpdateTenantSelfSettingsDto {
  timezone?: string;
  currency?: string;
  language?: string;
  country?: string;
  features?: {
    mfa_required_all?: boolean;
  };
}

/** Alerta de onboarding del dashboard del tenant */
export interface DashboardAlert {
  id: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  href?: string;
}

/** Métricas iniciales del dashboard — los campos opcionales son null si la fuente no existe */
export interface DashboardMetrics {
  configuredUsers: number | null;
  mfaCoverage: number | null;
  pendingAlerts: number;
  auditEventsLast7d: number | null;
}

/** Respuesta completa del summary del dashboard empresarial */
export interface DashboardSummary {
  tenant: TenantSelf;
  settings: TenantSelfSettings;
  metrics: DashboardMetrics;
  alerts: DashboardAlert[];
}

/**
 * API de tenant self-service para el portal empresarial.
 *
 * IMPORTANTE: estos métodos consumen contratos propios del tenant autenticado.
 * Nunca usan /tenants/:id — ese contrato es de administración de plataforma.
 */
export const tenantSelfApi = {
  /** Retorna los datos base del tenant autenticado. */
  getMe: (tenantSlug?: string) => request<TenantSelf>('/tenants/me', undefined, tenantSlug),

  /** Alias semántico para la lectura del perfil empresarial del tenant autenticado. */
  getProfile: (tenantSlug?: string) => request<TenantSelf>('/tenants/me', undefined, tenantSlug),

  /** Actualiza el perfil empresarial self-service del tenant autenticado (solo ADMIN). */
  updateMeProfile: (dto: UpdateTenantSelfProfileDto, tenantSlug?: string) =>
    request<TenantSelf>(
      '/tenants/me/profile',
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Actualiza el branding self-service del tenant autenticado (solo ADMIN). */
  updateBranding: (dto: UpdateTenantSelfBrandingDto, tenantSlug?: string) =>
    request<TenantSelf>(
      '/tenants/me/branding',
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Retorna la configuración operativa del tenant autenticado. */
  getMeSettings: (tenantSlug?: string) =>
    request<TenantSelfSettings>('/tenants/me/settings', undefined, tenantSlug),

  /** Alias semántico para la configuración operativa self-service. */
  getSettings: (tenantSlug?: string) =>
    request<TenantSelfSettings>('/tenants/me/settings', undefined, tenantSlug),

  /** Actualiza la configuración operativa del tenant autenticado (solo ADMIN). */
  updateMeSettings: (dto: UpdateTenantSelfSettingsDto, tenantSlug?: string) =>
    request<TenantSelfSettings>(
      '/tenants/me/settings',
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Alias semántico para la mutación de settings self-service. */
  updateSettings: (dto: UpdateTenantSelfSettingsDto, tenantSlug?: string) =>
    request<TenantSelfSettings>(
      '/tenants/me/settings',
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),
};

/**
 * API del dashboard empresarial del portal.
 * El summary agrega datos del tenant, métricas y alertas de onboarding.
 * Solo disponible para el rol ADMIN — otros roles ven fallback controlado.
 */
export const dashboardApi = {
  /** Retorna el summary completo del dashboard (solo ADMIN). */
  getSummary: (tenantSlug?: string) =>
    request<DashboardSummary>('/tenants/me/summary', undefined, tenantSlug),
};

// ─────────────────────────────────────────────────────────────────────────────
// PERFIL DEL USUARIO AUTENTICADO
// Contratos para /users/:id consumidos por el portal empresarial.
// ─────────────────────────────────────────────────────────────────────────────

/** Campos de perfil retornados por GET /users/:id */
export interface UserProfile {
  id: string;
  email: string;
  role: string;
  status: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  mfaEnabled: boolean;
  emailVerified: boolean;
  createdAt: string;
}

/** Campos actualizables por el usuario autenticado */
export interface UpdateProfileDto {
  firstName?: string;
  lastName?: string;
  phone?: string;
  jobTitle?: string;
}

export interface ChangeLoginEmailDto {
  email: string;
  currentPassword: string;
  syncCompanyContactEmail?: boolean;
}

/**
 * API de perfil del usuario autenticado.
 * El userId debe provenir del claim sub del JWT vigente.
 */
export const userApi = {
  /** Obtiene el perfil del usuario autenticado */
  getMe: (userId: string, tenantSlug?: string) =>
    request<UserProfile>(`/users/${userId}`, undefined, tenantSlug),

  /** Actualiza los datos personales del usuario autenticado */
  updateMe: (userId: string, dto: UpdateProfileDto, tenantSlug?: string) =>
    request<UserProfile>(
      `/users/${userId}`,
      {
        method: 'PATCH',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(dto),
      },
      tenantSlug,
    ),

  /** Actualiza el email de acceso del usuario autenticado */
  changeLoginEmail: (userId: string, dto: ChangeLoginEmailDto, tenantSlug?: string) =>
    request<UserProfile>(
      `/users/${userId}/login-email`,
      {
        method: 'PATCH',
        body: JSON.stringify(dto),
      },
      tenantSlug,
    ),
};
