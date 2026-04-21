// apps/portal/src/lib/api-client.ts

import {
  AcquisitionChannel,
  ConsentChannel,
  AttributionRole,
  CatalogItemType,
  ChargeType,
  CompatibilityRuleType,
  InstallationRule,
  CreateSubscriberPayload,
  CustomerSegment,
  DiscountType,
  DocumentType,
  EvaluationSource,
  PersonType,
  PromotionScope,
  ProductCategory,
  SubscriberStatus,
  TaxType,
  TechnicalConfidence,
  TechnicalViabilityResult,
  TaxRegime,
  TechnologyOption,
  TransitionStatusPayload,
  UpdateSubscriberPayload,
  VatTreatment,
} from '@iwana/shared';

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
const TEST_TENANT_SLUG = 'test-isp';
const DEFAULT_DEV_TENANT_SLUG = 'iwana';

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
    public readonly details?: unknown,
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

  const storedSlug = normalizeTenantSlug(window.localStorage.getItem(TENANT_SLUG_STORAGE_KEY));

  // En entorno local algunos flujos E2E antiguos pudieron persistir "test-isp"
  // en el mismo navegador de desarrollo. Ese tenant no existe en la instalación
  // real y genera requests inconsistentes. Lo descartamos para forzar resolución
  // por tenant real (env/login) y evitar errores operativos.
  if (storedSlug === TEST_TENANT_SLUG) {
    return '';
  }

  return storedSlug;
}

function persistTenantSlug(tenantSlug: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!tenantSlug) {
    window.localStorage.removeItem(TENANT_SLUG_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(TENANT_SLUG_STORAGE_KEY, tenantSlug);
}

/** Limpia el tenant slug del localStorage — usado en logout y en flujos de error. */
function clearTenantSlugFromStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(TENANT_SLUG_STORAGE_KEY);
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
  returnFullResponse?: boolean;
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

  // Fallback local para no depender de un tenant temporal de pruebas.
  // En producción se exige configuración explícita o selección en login.
  if (process.env.NODE_ENV !== 'production') {
    return DEFAULT_DEV_TENANT_SLUG;
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
  const isFormDataBody = typeof FormData !== 'undefined' && options?.body instanceof FormData;

  if (!headers.has('Content-Type') && options?.body !== undefined && !isFormDataBody) {
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
      const retryOptions: RequestOptions = {
        ...options,
        headers: {
          ...Object.fromEntries(headers.entries()),
          Authorization: `Bearer ${renewedToken}`,
        },
        skipRefreshRetry: true,
      };

      if (options?.returnFullResponse !== undefined) {
        retryOptions.returnFullResponse = options.returnFullResponse;
      }

      return request<T>(path, retryOptions, resolvedTenantSlug);
    } catch (refreshError) {
      // Si no se puede refrescar, re-lanzamos para que el llamador reciba un error claro.
      throw refreshError;
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(
      res.status,
      typeof body['code'] === 'string' ? body['code'] : 'UNKNOWN',
      typeof body['message'] === 'string' ? body['message'] : 'Error del servidor',
      body['details'],
    );
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }

  const body = (await res.json()) as ApiEnvelope<T> | T;
  if (options?.returnFullResponse) {
    return body as T;
  }

  return (body as ApiEnvelope<T>).data;
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
      persistTenantSlug('');
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
  fiberInstallationThresholdMeters: number;
  features: {
    billing: boolean;
    mfa_required_all: boolean;
  };
}

export type PlanInstallationRule = InstallationRule;

export interface PlanCatalogItem {
  id: string;
  name: string;
  technology: string;
  installationRule: PlanInstallationRule;
  downloadSpeedMbps: number;
  uploadSpeedMbps: number;
  basePrice: number;
  installationFee: number;
  currentPrice?: string | null;
  description?: string | null;
  retentionApplicable?: boolean;
  taxClassificationId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanCatalogItemDto {
  name: string;
  technology: string;
  installationRule?: PlanInstallationRule;
  downloadSpeedMbps: number;
  uploadSpeedMbps: number;
  basePrice: number;
  installationFee?: number;
  validFrom?: string;
  validTo?: string;
  isActive?: boolean;
}

export interface UpdatePlanCatalogItemDto {
  name?: string;
  technology?: string;
  installationRule?: PlanInstallationRule;
  downloadSpeedMbps?: number;
  uploadSpeedMbps?: number;
  basePrice?: number;
  installationFee?: number;
  validFrom?: string;
  validTo?: string;
  isActive?: boolean;
}

// Additional Products types
export interface AdditionalProduct {
  id: string;
  name: string;
  category: ProductCategory;
  isLoan: boolean;
  requiresInventory: boolean;
  isActive: boolean;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdditionalService {
  id: string;
  name: string;
  chargeType: ChargeType;
  isActive: boolean;
  description?: string | null;
  currentPrice: string | null;
  basePrice: number;
  installationFee: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialBundle {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: string;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialBundleItemDetail {
  itemId: string;
  isRequired: boolean;
  sortOrder: number;
  item: {
    id: string;
    type: CatalogItemType;
    name: string;
    isActive: boolean;
  } | null;
}

export interface CommercialBundleDetail extends CommercialBundle {
  items: CommercialBundleItemDetail[];
}

export interface BundlePriceResult {
  bundleId: string;
  segment: CustomerSegment;
  subtotal: string;
  discount: string;
  total: string;
  breakdown: Array<{
    itemId: string;
    name: string;
    price: string;
  }>;
}

export interface CreateBundleDto {
  name: string;
  description?: string;
  discountType: Extract<DiscountType, DiscountType.PERCENTAGE | DiscountType.FIXED_AMOUNT>;
  discountValue: string;
  validFrom: string;
  validTo?: string;
  itemIds: string[];
  optionalItemIds?: string[];
}

export interface CommercialPromotion {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: string;
  appliesTo: PromotionScope;
  targetItemId: string | null;
  targetBundleId: string | null;
  targetSegments: CustomerSegment[] | null;
  maxUses: number | null;
  currentUses: number;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromotionDto {
  name: string;
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: string;
  appliesTo: PromotionScope;
  targetItemId?: string;
  targetBundleId?: string;
  targetSegments?: CustomerSegment[];
  maxUses?: number;
  validFrom: string;
  validTo: string;
}

// ── Compatibilidad ────────────────────────────────────────────────────────────

export interface CompatibilityRule {
  id: string;
  tenantId: string;
  ruleType: 'REQUIRES' | 'EXCLUDES' | 'REPLACES';
  sourceItemId: string;
  targetItemId: string;
  isActive: boolean;
  effectiveFrom: string | null;
  note: string | null;
  updatedAt: string;
  createdAt: string;
  sourceItem?: { id: string; name: string } | null;
  targetItem?: { id: string; name: string } | null;
}

export interface CreateCompatibilityRuleDto {
  ruleType: 'REPLACES';
  sourceItemId: string;
  targetItemId: string;
  effectiveFrom?: string;
  note?: string;
}

export interface UpdateCompatibilityRuleDto {
  note?: string;
  effectiveFrom?: string;
  isActive?: boolean;
}

// ── Tributarias ───────────────────────────────────────────────────────────────

export interface TaxClassification {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  appliesIva: boolean;
  appliesRetefuente: boolean;
  appliesReteIca: boolean;
  appliesEstampillas: boolean;
  createdAt: string;
}

export interface CreateTaxClassificationDto {
  code: string;
  name: string;
  description?: string;
  appliesIva?: boolean;
  appliesRetefuente?: boolean;
  appliesReteIca?: boolean;
  appliesEstampillas?: boolean;
}

export interface UpdateTaxClassificationDto {
  name?: string;
  description?: string;
  isActive?: boolean;
  appliesIva?: boolean;
  appliesRetefuente?: boolean;
  appliesReteIca?: boolean;
  appliesEstampillas?: boolean;
}

export interface TaxRule {
  id: string;
  tenantId: string;
  taxClassificationId: string;
  taxClassification?: TaxClassification | null;
  customerSegment: string | null;
  taxType: string;
  ratePercentage: string;
  stratumFrom: number | null;
  stratumTo: number | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
}

export interface CreateTaxRuleDto {
  taxClassificationId: string;
  taxType: string;
  ratePercentage: string;
  customerSegment?: string;
  stratumFrom?: number;
  stratumTo?: number;
  priority?: number;
}

export interface UpdateTaxRuleDto {
  taxClassificationId?: string;
  taxType?: string;
  ratePercentage?: string;
  customerSegment?: string;
  stratumFrom?: number;
  stratumTo?: number;
  priority?: number;
  isActive?: boolean;
}

export interface ResolveTaxDto {
  segment: string;
  stratum?: number;
}

export interface CreateAdditionalProductDto {
  name: string;
  description?: string | undefined;
  category: AdditionalProduct['category'];
  isLoan?: boolean;
  requiresInventory?: boolean;
  isActive?: boolean;
}

export interface UpdateAdditionalProductDto {
  name?: string;
  description?: string | undefined;
  category?: AdditionalProduct['category'];
  isLoan?: boolean;
  requiresInventory?: boolean;
  isActive?: boolean;
}

export interface CreateAdditionalServiceDto {
  name: string;
  description?: string | undefined;
  chargeType: ChargeType;
  basePrice?: number;
  installationFee?: number;
  isActive?: boolean;
}

export interface UpdateAdditionalServiceDto {
  name?: string;
  description?: string | undefined;
  chargeType?: ChargeType;
  basePrice?: number;
  installationFee?: number;
  isActive?: boolean;
}

function mapCommercialBundle(bundle: CommercialBundle): CommercialBundle {
  return {
    ...bundle,
    discountValue: bundle.discountValue ?? '0.00',
    validFrom: bundle.validFrom ?? new Date(0).toISOString(),
    validTo: bundle.validTo ?? null,
    createdAt: bundle.createdAt ?? new Date(0).toISOString(),
    updatedAt: bundle.updatedAt ?? new Date(0).toISOString(),
  };
}

function mapCommercialPromotion(promotion: CommercialPromotion): CommercialPromotion {
  return {
    ...promotion,
    code: promotion.code ?? '',
    discountValue: promotion.discountValue ?? '0.00',
    validFrom: promotion.validFrom ?? new Date(0).toISOString(),
    validTo: promotion.validTo ?? new Date(0).toISOString(),
    createdAt: promotion.createdAt ?? new Date(0).toISOString(),
    updatedAt: promotion.updatedAt ?? new Date(0).toISOString(),
  };
}

interface CommercialCatalogListResponse<T> {
  data: T[];
  meta: {
    total: number;
  };
}

interface CommercialCatalogItemPayload {
  id: string;
  type: CatalogItemType;
  name: string;
  description: string | null;
  taxClassificationId: string | null;
  retentionApplicable: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  downloadSpeedMbps?: number;
  uploadSpeedMbps?: number;
  technology?: string;
  installationRule?: InstallationRule;
  currentPrice?: string | null;
  installationFee?: string | null;
  category?: ProductCategory;
  chargeType?: ChargeType;
  isLoan?: boolean;
  requiresInventory?: boolean;
}

function mapCommercialPlan(item: CommercialCatalogItemPayload): PlanCatalogItem {
  return {
    id: item.id,
    name: item.name,
    technology: item.technology ?? 'N/A',
    installationRule: item.installationRule ?? InstallationRule.ALWAYS,
    downloadSpeedMbps: item.downloadSpeedMbps ?? 0,
    uploadSpeedMbps: item.uploadSpeedMbps ?? 0,
    basePrice: Number(item.currentPrice ?? 0),
    installationFee: Number(item.installationFee ?? 0),
    currentPrice: item.currentPrice ?? null,
    description: item.description,
    retentionApplicable: item.retentionApplicable,
    taxClassificationId: item.taxClassificationId,
    isActive: item.isActive,
    createdAt: item.createdAt ?? new Date(0).toISOString(),
    updatedAt: item.updatedAt ?? new Date(0).toISOString(),
  };
}

function mapCommercialProduct(item: CommercialCatalogItemPayload): AdditionalProduct {
  return {
    id: item.id,
    name: item.name,
    category: item.category ?? ProductCategory.CONNECTIVITY,
    isLoan: item.isLoan ?? false,
    requiresInventory: item.requiresInventory ?? false,
    isActive: item.isActive,
    description: item.description,
    createdAt: item.createdAt ?? new Date(0).toISOString(),
    updatedAt: item.updatedAt ?? new Date(0).toISOString(),
  };
}

function mapCommercialService(item: CommercialCatalogItemPayload): AdditionalService {
  return {
    id: item.id,
    name: item.name,
    chargeType: item.chargeType ?? ChargeType.ONE_TIME,
    isActive: item.isActive,
    description: item.description,
    currentPrice: item.currentPrice ?? null,
    basePrice: Number(item.currentPrice ?? 0),
    installationFee: Number(item.installationFee ?? 0),
    createdAt: item.createdAt ?? new Date(0).toISOString(),
    updatedAt: item.updatedAt ?? new Date(0).toISOString(),
  };
}

async function setCommercialCatalogPrice(
  itemId: string,
  dto: { basePrice: number; installationFee?: number },
  tenantSlug?: string,
): Promise<void> {
  await request(
    `/commercial/catalog/${itemId}/prices`,
    {
      method: 'POST',
      body: JSON.stringify({
        customerSegment: CustomerSegment.RESIDENTIAL,
        basePrice: dto.basePrice.toFixed(2),
        installationFee: (dto.installationFee ?? 0).toFixed(2),
      }),
    },
    tenantSlug,
  );
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

export interface CoverageNodeConfig {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CoverageZoneConfig {
  id: string;
  name: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CoverageAdminConfig {
  nodes: CoverageNodeConfig[];
  zones: CoverageZoneConfig[];
}

export interface CoverageCheckResponse {
  available: boolean;
  reason: string;
  matches: Array<{
    id: string;
    name: string;
    type: 'NODE' | 'ZONE';
    available: boolean;
  }>;
}

export interface CreateCommercialNodeDto {
  name: string;
  latitude: number;
  longitude: number;
  isActive?: boolean;
}

export interface UpdateCommercialNodeDto {
  name?: string;
  latitude?: number;
  longitude?: number;
  isActive?: boolean;
}

export interface CreateCoverageZoneDto {
  name: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
  isActive?: boolean;
}

export interface UpdateCoverageZoneDto {
  name?: string;
  centerLatitude?: number;
  centerLongitude?: number;
  radiusKm?: number;
  isActive?: boolean;
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

  getCoverage: (tenantSlug?: string) =>
    request<CoverageAdminConfig>('/tenants/me/coverage', undefined, tenantSlug),

  checkCoverage: (
    params: {
      address: string;
      latitude?: number;
      longitude?: number;
    },
    tenantSlug?: string,
  ) => {
    const search = new URLSearchParams({ address: params.address });
    if (params.latitude !== undefined) search.set('latitude', String(params.latitude));
    if (params.longitude !== undefined) search.set('longitude', String(params.longitude));
    return request<CoverageCheckResponse>(
      `/tenants/me/coverage/check?${search.toString()}`,
      undefined,
      tenantSlug,
    );
  },

  createCoverageNode: (dto: CreateCommercialNodeDto, tenantSlug?: string) =>
    request<CoverageAdminConfig>(
      '/tenants/me/coverage/nodes',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  updateCoverageNode: (nodeId: string, dto: UpdateCommercialNodeDto, tenantSlug?: string) =>
    request<CoverageAdminConfig>(
      `/tenants/me/coverage/nodes/${nodeId}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  deleteCoverageNode: (nodeId: string, tenantSlug?: string) =>
    request<CoverageAdminConfig>(
      `/tenants/me/coverage/nodes/${nodeId}`,
      { method: 'DELETE' },
      tenantSlug,
    ),

  createCoverageZone: (dto: CreateCoverageZoneDto, tenantSlug?: string) =>
    request<CoverageAdminConfig>(
      '/tenants/me/coverage/zones',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  updateCoverageZone: (zoneId: string, dto: UpdateCoverageZoneDto, tenantSlug?: string) =>
    request<CoverageAdminConfig>(
      `/tenants/me/coverage/zones/${zoneId}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  deleteCoverageZone: (zoneId: string, tenantSlug?: string) =>
    request<CoverageAdminConfig>(
      `/tenants/me/coverage/zones/${zoneId}`,
      { method: 'DELETE' },
      tenantSlug,
    ),
};

/**
 * API del bounded context Comercial para el tenant autenticado.
 * Expone exclusivamente catálogo comercial; no mezclar con self-service del tenant.
 */
export const commercialApi = {
  /** Lista el catálogo de planes del tenant autenticado. */
  getPlans: async (tenantSlug?: string) => {
    const response = await request<CommercialCatalogListResponse<CommercialCatalogItemPayload>>(
      '/commercial/catalog?type=PLAN',
      { returnFullResponse: true },
      tenantSlug,
    );

    return response.data.map(mapCommercialPlan);
  },

  /** Crea un plan en el catálogo del tenant autenticado. */
  createPlan: async (dto: CreatePlanCatalogItemDto, tenantSlug?: string) => {
    const item = await request<CommercialCatalogItemPayload>(
      '/commercial/catalog/plans',
      {
        method: 'POST',
        body: JSON.stringify({
          name: dto.name,
          technology: dto.technology,
          installationRule: dto.installationRule,
          downloadSpeedMbps: dto.downloadSpeedMbps,
          uploadSpeedMbps: dto.uploadSpeedMbps,
          retentionApplicable: false,
        }),
      },
      tenantSlug,
    );

    await request(
      `/commercial/catalog/${item.id}/prices`,
      {
        method: 'POST',
        body: JSON.stringify({
          customerSegment: CustomerSegment.RESIDENTIAL,
          basePrice: dto.basePrice.toFixed(2),
          installationFee: (dto.installationFee ?? 0).toFixed(2),
        }),
      },
      tenantSlug,
    );

    return commercialApi.getPlans(tenantSlug);
  },

  /** Actualiza un plan del catálogo del tenant autenticado. */
  updatePlan: async (planId: string, dto: UpdatePlanCatalogItemDto, tenantSlug?: string) => {
    // Construir solo los campos que aplican al PATCH (basePrice e installationFee
    // se gestionan con un POST separado a /prices).
    const patchBody = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.technology !== undefined && { technology: dto.technology }),
      ...(dto.installationRule !== undefined && { installationRule: dto.installationRule }),
      ...(dto.downloadSpeedMbps !== undefined && {
        downloadSpeedMbps: dto.downloadSpeedMbps,
      }),
      ...(dto.uploadSpeedMbps !== undefined && { uploadSpeedMbps: dto.uploadSpeedMbps }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    };

    // Solo enviar PATCH si hay al menos un campo de catálogo que cambiar; evita 500 por body vacío.
    if (Object.keys(patchBody).length > 0) {
      await request(
        `/commercial/catalog/${planId}`,
        { method: 'PATCH', body: JSON.stringify(patchBody) },
        tenantSlug,
      );
    }

    if (dto.basePrice !== undefined || dto.installationFee !== undefined) {
      try {
        await request(
          `/commercial/catalog/${planId}/prices`,
          {
            method: 'POST',
            body: JSON.stringify({
              customerSegment: CustomerSegment.RESIDENTIAL,
              basePrice: (dto.basePrice ?? 0).toFixed(2),
              installationFee: (dto.installationFee ?? 0).toFixed(2),
            }),
          },
          tenantSlug,
        );
      } catch (error) {
        // Idempotencia operativa: si el precio vigente ya es idéntico, no bloqueamos la edición.
        if (
          error instanceof ApiError &&
          error.status === 409 &&
          /precio vigente idéntico/i.test(error.message)
        ) {
          return commercialApi.getPlans(tenantSlug);
        }

        throw error;
      }
    }

    return commercialApi.getPlans(tenantSlug);
  },

  /** Elimina un plan del catálogo del tenant autenticado. */
  deletePlan: (planId: string, tenantSlug?: string) =>
    request<void>(`/commercial/catalog/${planId}`, { method: 'DELETE' }, tenantSlug),

  /** Lista los productos adicionales del tenant autenticado. */
  getAdditionalProducts: async (tenantSlug?: string) => {
    const response = await request<CommercialCatalogListResponse<CommercialCatalogItemPayload>>(
      '/commercial/catalog?type=PRODUCT',
      { returnFullResponse: true },
      tenantSlug,
    );

    return response.data.map(mapCommercialProduct);
  },

  /** Crea un producto adicional en el catálogo del tenant autenticado. */
  createAdditionalProduct: async (dto: CreateAdditionalProductDto, tenantSlug?: string) => {
    await request(
      '/commercial/catalog/products',
      {
        method: 'POST',
        body: JSON.stringify({
          name: dto.name,
          description: dto.description,
          category: dto.category,
          isLoan: dto.isLoan ?? false,
          requiresInventory: dto.requiresInventory ?? false,
          retentionApplicable: false,
        }),
      },
      tenantSlug,
    );

    return commercialApi.getAdditionalProducts(tenantSlug);
  },

  /** Actualiza un producto adicional del catálogo del tenant autenticado. */
  updateAdditionalProduct: (
    productId: string,
    dto: UpdateAdditionalProductDto,
    tenantSlug?: string,
  ) =>
    request<AdditionalProduct[]>(
      `/commercial/catalog/${productId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.isLoan !== undefined && { isLoan: dto.isLoan }),
          ...(dto.requiresInventory !== undefined && {
            requiresInventory: dto.requiresInventory,
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        }),
      },
      tenantSlug,
    ).then(() => commercialApi.getAdditionalProducts(tenantSlug)),

  /** Elimina un producto adicional del catálogo del tenant autenticado. */
  deleteAdditionalProduct: (productId: string, tenantSlug?: string) =>
    request<AdditionalProduct[]>(
      `/commercial/catalog/${productId}`,
      { method: 'DELETE' },
      tenantSlug,
    ).then(() => commercialApi.getAdditionalProducts(tenantSlug)),

  /** Lista los servicios adicionales del tenant autenticado. */
  getAdditionalServices: async (tenantSlug?: string) => {
    const response = await request<CommercialCatalogListResponse<CommercialCatalogItemPayload>>(
      '/commercial/catalog?type=SERVICE',
      { returnFullResponse: true },
      tenantSlug,
    );

    return response.data.map(mapCommercialService);
  },

  /** Crea un servicio adicional en el catálogo del tenant autenticado. */
  createAdditionalService: async (dto: CreateAdditionalServiceDto, tenantSlug?: string) => {
    const item = await request<CommercialCatalogItemPayload>(
      '/commercial/catalog/services',
      {
        method: 'POST',
        body: JSON.stringify({
          name: dto.name,
          description: dto.description,
          chargeType: dto.chargeType,
          retentionApplicable: false,
        }),
      },
      tenantSlug,
    );

    if (dto.basePrice !== undefined) {
      await setCommercialCatalogPrice(
        item.id,
        {
          basePrice: dto.basePrice,
          ...(dto.installationFee !== undefined && { installationFee: dto.installationFee }),
        },
        tenantSlug,
      );
    }

    return commercialApi.getAdditionalServices(tenantSlug);
  },

  /** Actualiza un servicio adicional del catálogo del tenant autenticado. */
  updateAdditionalService: (
    serviceId: string,
    dto: UpdateAdditionalServiceDto,
    tenantSlug?: string,
  ) =>
    request<AdditionalService[]>(
      `/commercial/catalog/${serviceId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.chargeType !== undefined && { chargeType: dto.chargeType }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        }),
      },
      tenantSlug,
    ).then(async () => {
      if (dto.basePrice !== undefined) {
        try {
          await setCommercialCatalogPrice(
            serviceId,
            {
              basePrice: dto.basePrice,
              ...(dto.installationFee !== undefined && {
                installationFee: dto.installationFee,
              }),
            },
            tenantSlug,
          );
        } catch (error) {
          if (
            error instanceof ApiError &&
            error.status === 409 &&
            /precio vigente idéntico/i.test(error.message)
          ) {
            return commercialApi.getAdditionalServices(tenantSlug);
          }

          throw error;
        }
      }

      return commercialApi.getAdditionalServices(tenantSlug);
    }),

  /** Elimina un servicio adicional del catálogo del tenant autenticado. */
  deleteAdditionalService: (serviceId: string, tenantSlug?: string) =>
    request<AdditionalService[]>(
      `/commercial/catalog/${serviceId}`,
      { method: 'DELETE' },
      tenantSlug,
    ).then(() => commercialApi.getAdditionalServices(tenantSlug)),

  /** Lista bundles activos del tenant autenticado. */
  getBundles: async (tenantSlug?: string) => {
    const bundles = await request<CommercialBundle[]>('/commercial/bundles', undefined, tenantSlug);
    return bundles.map(mapCommercialBundle);
  },

  /** Retorna el detalle de un bundle con sus ítems. */
  getBundleDetail: (bundleId: string, tenantSlug?: string) =>
    request<CommercialBundleDetail>(`/commercial/bundles/${bundleId}`, undefined, tenantSlug),

  /** Crea un bundle y retorna la lista actualizada. */
  createBundle: (dto: CreateBundleDto, tenantSlug?: string) =>
    request<CommercialBundle>(
      '/commercial/bundles',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ).then(() => commercialApi.getBundles(tenantSlug)),

  /** Desactiva un bundle y retorna la lista actualizada. */
  deactivateBundle: (bundleId: string, tenantSlug?: string) =>
    request(`/commercial/bundles/${bundleId}`, { method: 'DELETE' }, tenantSlug).then(() =>
      commercialApi.getBundles(tenantSlug),
    ),

  /** Calcula precio dinámico de un bundle por segmento para previsualización de oferta. */
  getBundlePrice: (
    bundleId: string,
    options?: {
      segment?: CustomerSegment;
      optionalItemIds?: string[];
    },
    tenantSlug?: string,
  ) => {
    const query = new URLSearchParams({
      segment: options?.segment ?? CustomerSegment.RESIDENTIAL,
    });

    options?.optionalItemIds?.forEach((itemId) => {
      query.append('optionalItemIds', itemId);
    });

    return request<BundlePriceResult>(
      `/commercial/bundles/${bundleId}/price?${query.toString()}`,
      undefined,
      tenantSlug,
    );
  },

  /** Lista promociones activas del tenant autenticado. */
  getPromotions: async (tenantSlug?: string) => {
    const promotions = await request<CommercialPromotion[]>(
      '/commercial/promotions',
      undefined,
      tenantSlug,
    );
    return promotions.map(mapCommercialPromotion);
  },

  /** Crea una promoción y retorna la lista actualizada. */
  createPromotion: (dto: CreatePromotionDto, tenantSlug?: string) =>
    request<CommercialPromotion>(
      '/commercial/promotions',
      {
        method: 'POST',
        body: JSON.stringify({
          ...dto,
          code: dto.code.toUpperCase(),
        }),
      },
      tenantSlug,
    ).then(() => commercialApi.getPromotions(tenantSlug)),

  /** Desactiva una promoción y retorna la lista actualizada. */
  deactivatePromotion: (promotionId: string, tenantSlug?: string) =>
    request(`/commercial/promotions/${promotionId}`, { method: 'DELETE' }, tenantSlug).then(() =>
      commercialApi.getPromotions(tenantSlug),
    ),

  // ── Compatibilidad ────────────────────────────────────────────────────────

  /** Lista reglas de compatibilidad del tenant (incluye REPLACES, REQUIRES, EXCLUDES). */
  getCompatibilityRules: (tenantSlug?: string) =>
    request<CompatibilityRule[]>('/commercial/compatibility-rules', undefined, tenantSlug),

  /** Crea regla de compatibilidad. Solo REPLACES está en scope del diseño inicial. */
  createCompatibilityRule: (dto: CreateCompatibilityRuleDto, tenantSlug?: string) =>
    request<CompatibilityRule>(
      '/commercial/compatibility-rules',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Actualiza nota, vigencia o estado activo de una regla de compatibilidad. */
  updateCompatibilityRule: (id: string, dto: UpdateCompatibilityRuleDto, tenantSlug?: string) =>
    request<CompatibilityRule>(
      `/commercial/compatibility-rules/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Desactiva una regla de compatibilidad. */
  deactivateCompatibilityRule: (id: string, tenantSlug?: string) =>
    request<void>(`/commercial/compatibility-rules/${id}`, { method: 'DELETE' }, tenantSlug),

  // ── Tributarias ───────────────────────────────────────────────────────────

  /** Lista clasificaciones tributarias del tenant. */
  getTaxClassifications: (tenantSlug?: string) =>
    request<TaxClassification[]>('/commercial/tax-classifications', undefined, tenantSlug),

  /** Crea clasificación tributaria. */
  createTaxClassification: (dto: CreateTaxClassificationDto, tenantSlug?: string) =>
    request<TaxClassification>(
      '/commercial/tax-classifications',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Actualiza clasificación tributaria. */
  updateTaxClassification: (id: string, dto: UpdateTaxClassificationDto, tenantSlug?: string) =>
    request<TaxClassification>(
      `/commercial/tax-classifications/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Elimina clasificación tributaria. */
  deleteTaxClassification: (id: string, tenantSlug?: string) =>
    request<void>(`/commercial/tax-classifications/${id}`, { method: 'DELETE' }, tenantSlug),

  /** @deprecated Usar deleteTaxClassification. */
  deactivateTaxClassification: (id: string, tenantSlug?: string) =>
    request<void>(`/commercial/tax-classifications/${id}`, { method: 'DELETE' }, tenantSlug),

  /** Lista reglas tributarias del tenant. */
  getTaxRules: (tenantSlug?: string) =>
    request<TaxRule[]>('/commercial/tax-rules', undefined, tenantSlug),

  /** Crea regla tributaria. */
  createTaxRule: (dto: CreateTaxRuleDto, tenantSlug?: string) =>
    request<TaxRule>(
      '/commercial/tax-rules',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Actualiza regla tributaria. */
  updateTaxRule: (id: string, dto: UpdateTaxRuleDto, tenantSlug?: string) =>
    request<TaxRule>(
      `/commercial/tax-rules/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Desactiva regla tributaria. */
  deactivateTaxRule: (id: string, tenantSlug?: string) =>
    request<void>(`/commercial/tax-rules/${id}`, { method: 'DELETE' }, tenantSlug),

  /** Resuelve la clasificación tributaria dado un segmento de cliente y estrato (opcional). */
  resolveTaxClassification: (dto: ResolveTaxDto, tenantSlug?: string) =>
    request<TaxClassification>(
      '/commercial/tax/resolve',
      { method: 'POST', body: JSON.stringify(dto) },
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
// GESTION DE USUARIOS INTERNOS DEL TENANT
// ─────────────────────────────────────────────────────────────────────────────

export interface InternalUser {
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
  deletedAt: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  jobTitle: string | null;
  documentType: string | null;
  documentNumber: string | null;
  avatarUrl: string | null;
}

export interface ListUsersParams {
  cursor?: string;
  limit?: number;
  status?: string;
  role?: string;
  /** Texto libre para filtrar por nombre, apellido o email */
  search?: string;
}

export interface UsersPaginationMeta {
  nextCursor: string | null;
  total: number;
}

export interface ListUsersResponse {
  data: InternalUser[];
  meta: UsersPaginationMeta;
}

export interface CreateInternalUserDto {
  email: string;
  role: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  jobTitle?: string;
  documentType?: string;
  documentNumber?: string;
  avatarUrl?: string;
  mfaRequired?: boolean;
}

export interface UpdateInternalUserDto {
  status?: string | undefined;
  role?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  phone?: string | undefined;
  jobTitle?: string | undefined;
  documentType?: string | undefined;
  documentNumber?: string | undefined;
  avatarUrl?: string | undefined;
  mfaRequired?: boolean | undefined;
}

export const usersApi = {
  list: (params?: ListUsersParams, tenantSlug?: string) => {
    const searchParams = new URLSearchParams();
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.role) searchParams.set('role', params.role);
    if (params?.search) searchParams.set('search', params.search);

    const query = searchParams.toString();
    return request<ListUsersResponse>(`/users${query ? `?${query}` : ''}`, undefined, tenantSlug);
  },

  getById: (id: string, tenantSlug?: string) =>
    request<InternalUser>(`/users/${id}`, undefined, tenantSlug),

  create: (dto: CreateInternalUserDto, idempotencyKey: string, tenantSlug?: string) =>
    request<InternalUser & { temporaryPassword?: string }>(
      '/users',
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(dto),
      },
      tenantSlug,
    ),

  update: (id: string, dto: UpdateInternalUserDto, idempotencyKey: string, tenantSlug?: string) =>
    request<InternalUser>(
      `/users/${id}`,
      {
        method: 'PATCH',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(dto),
      },
      tenantSlug,
    ),

  remove: (id: string, tenantSlug?: string) =>
    request<void>(`/users/${id}`, { method: 'DELETE' }, tenantSlug),

  resetPassword: (
    id: string,
    options?: {
      password?: string | undefined;
      idempotencyKey?: string | undefined;
      tenantSlug?: string | undefined;
    },
  ) => {
    const password = options?.password;
    const idempotencyKey = options?.idempotencyKey;
    const tenantSlug = options?.tenantSlug;
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const body = password !== undefined ? JSON.stringify({ password }) : '{}';

    return request<{ temporaryPassword: string }>(
      `/users/${id}/password`,
      { method: 'PATCH', headers, body },
      tenantSlug,
    );
  },

  /**
   * Cambia el email de login de un usuario.
   * El admin puede cambiar sin contraseña propia; el self-service requiere currentPassword.
   * Ruta: PATCH /users/:id/login-email
   */
  changeEmail: (
    id: string,
    dto: { email: string; currentPassword?: string; syncCompanyContactEmail?: boolean },
    tenantSlug?: string,
  ) =>
    request<InternalUser>(
      `/users/${id}/login-email`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      },
      tenantSlug,
    ),
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

export type ExpedienteStatus =
  | 'NUEVO_POTENCIAL'
  | 'PRECALIFICADO'
  | 'VALIDANDO_COBERTURA'
  | 'EN_COTIZACION'
  | 'LISTO_PARA_INSTALACION'
  | 'INSTALACION_AGENDADA'
  | 'CLIENTE_ACTIVO'
  | 'DESCARTADO';

export interface ExpedienteRecord {
  id: string;
  tenantId: string;
  status: ExpedienteStatus;
  previousStatus: ExpedienteStatus | null;
  assignedTo?: string | null;
  dataConsentRevoked?: boolean;
  statusChangedAt: string;
  discardReason: string | null;
  fullName: string;
  documentType: string | null;
  documentNumberEncrypted?: string | null;
  documentNumber?: string | null;
  personType?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  primaryContactName?: string | null;
  primaryContactRole?: string | null;
  companyName?: string | null;
  phonePrimaryEncrypted: string | null;
  phonePrimary?: string | null;
  phoneSecondaryEncrypted?: string | null;
  emailPrimaryEncrypted: string | null;
  emailPrimary?: string | null;
  emailSecondary?: string | null;
  altContactName?: string | null;
  altContactPhoneEncrypted?: string | null;
  altContactPhone?: string | null;
  contactPreference?: string | null;
  bestContactTime?: string | null;
  address: string | null;
  municipality: string | null;
  department: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  stratum?: number | null;
  neighborhood?: string | null;
  coordinatesSource?: string | null;
  coordinatesConfidence?: string | null;
  accessReferences?: string | null;
  zoneType?: string | null;
  source: string;
  acquisitionChannel: AcquisitionChannel;
  sourceDetail?: string | null;
  interestedPlanId: string | null;
  additionalProductIds?: string[] | null;
  campaign?: string | null;
  casePriority?: string | null;
  estimatedBudget?: number | null;
  commercialNotes?: string | null;
  coverageResult?: string | null;
  availableTechnology?: TechnologyOption | null;
  estimatedDistanceM?: number | null;
  feasibility?: TechnicalViabilityResult | null;
  candidateTechnologies?: TechnologyOption[] | null;
  technicalConfidence?: TechnicalConfidence | null;
  evaluationSource?: EvaluationSource | null;
  technicalObservations?: string | null;
  estimatedEquipment?: string | null;
  identityVerified?: string | null;
  legalComplianceStatus?: string | null;
  documentSupports?: Record<string, unknown> | null;
  paymentMethod?: string | null;
  billingCycle?: string | null;
  fiscalName?: string | null;
  fiscalDocument?: string | null;
  fiscalAddress?: string | null;
  rutReference?: string | null;
  availabilityWindow?: string | null;
  specialAccessNotes?: string | null;
  requiredMaterials?: string | null;
  completenessCommercial: number | null;
  completenessLegal: number | null;
  completenessTechnical: number | null;
  completenessOperational: number | null;
  completenessOverall?: number | null;
  pipelineProgress?: number | null;
  createdAt: string;
  updatedAt: string;
}

export type DocumentReviewStatus = 'PENDING' | 'UPLOADED' | 'OBSERVED' | 'APPROVED' | 'REJECTED';

export interface ExpedienteDocumentVersion {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  status: DocumentReviewStatus;
  note: string | null;
  downloadUrl: string;
}

export interface ExpedienteDocumentItem {
  key: string;
  label: string;
  hint: string;
  versions: ExpedienteDocumentVersion[];
}

export interface ExpedienteDocumentSummary {
  requiredCount: number;
  uploadedCount: number;
  approvedCount: number;
  blockStatus: 'PENDIENTE' | 'EN_REVISION' | 'OBSERVADO' | 'COMPLETO';
}

export interface ExpedienteDocumentSupportResponse {
  personType: string | null;
  items: ExpedienteDocumentItem[];
  summary: ExpedienteDocumentSummary;
}

export interface SubscriberRecord {
  id: string;
  tenantId: string;
  userId: string | null;
  personType: PersonType;
  customerSegment: CustomerSegment;
  documentType: DocumentType | null;
  documentNumber?: string | null;
  firstName: string | null;
  lastName: string | null;
  stratum: number | null;
  birthDate: string | null;
  nit: string | null;
  nitVerificationDigit: string | null;
  businessName: string | null;
  commercialName: string | null;
  legalRepresentativeId: string | null;
  altContactName: string | null;
  altContactPhone?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp: string | null;
  vatTreatment: VatTreatment;
  taxRegime: TaxRegime;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  department: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  coverageNodeId: string | null;
  expedienteId: string | null;
  convertedAt: string | null;
  activatedAt: string | null;
  manualOverrideReason: string | null;
  status: SubscriberStatus;
  externalId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ListSubscribersParams {
  status?: SubscriberStatus;
  personType?: PersonType;
  customerSegment?: CustomerSegment;
  stratum?: number;
  search?: string;
  page?: number;
  limit?: number;
}

export interface SearchSubscribersParams {
  documentNumber?: string;
  nit?: string;
  email?: string;
  phone?: string;
}

export interface Subscriber360Response {
  subscriber: SubscriberRecord;
  contacts: unknown[];
  contracts: unknown[];
  quotes: unknown[];
  habeasData: unknown[];
  arcoRequests: unknown[];
  expedienteSummary: {
    id: string;
    fullName: string;
    status: string;
    source: string | null;
    createdAt: string;
    statusChangedAt: string | null;
    paymentMethod: string | null;
    billingCycle: string | null;
    fiscalName: string | null;
  } | null;
  timelineSeed: Array<{
    type: string;
    occurredAt: string;
    expedienteId: string | null;
  }>;
}

export interface CreateExpedienteDto {
  fullName: string;
  acquisitionChannel: AcquisitionChannel;
  sourceDetail?: string;
  source?: string;
}

export interface SalesAttributionRecord {
  id: string;
  tenantId: string;
  expedienteId: string;
  attributionRole: AttributionRole;
  actorId: string;
  actorRole: string;
  actorName: string;
  acquisitionChannel: AcquisitionChannel;
  notes: string | null;
  attributedAt: string;
  attributedBy: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokedReason: string | null;
  createdAt: string;
}

export interface CreateAttributionDto {
  actorId: string;
  actorRole?: string;
  acquisitionChannel: AcquisitionChannel;
  notes?: string;
  reattributionReason?: string;
}

export interface ResponsibilityActor {
  userId: string | null;
  name: string | null;
  role: string | null;
}

export interface ResponsibilitySnapshot {
  currentResponsibleUserId: string | null;
  currentResponsibleAssignedAt: string | null;
  currentResponsible: ResponsibilityActor;
  expedienteId: string;
}

export interface OperationalHistoryItem {
  id: string;
  previousResponsible: ResponsibilityActor | null;
  newResponsible: ResponsibilityActor;
  changedByActor: ResponsibilityActor;
  changedAt: string;
  notes: string | null;
}

export interface TransitionStatusDto {
  targetStatus: ExpedienteStatus;
  reason?: string;
}

export interface CreateContactAttemptDto {
  channel: string;
  result: string;
  durationMinutes?: number | undefined;
  notes?: string | undefined;
}

export interface CreateConsentDto {
  consentType: string;
  status: string;
  channel: ConsentChannel;
  legalTextVersion?: string;
  evidenceRef?: string | undefined;
}

export interface CreateCoverageCheckDto {
  latitude?: number | undefined;
  longitude?: number | undefined;
  addressUsed: string;
  result: string;
  technologyAvailable?: string | undefined;
  distanceM?: number | undefined;
  snapshotJson?: Record<string, unknown> | undefined;
}

export interface CompletenessResult {
  commercial: number;
  legal: number;
  technical: number;
  operational: number;
  overall: number;
}

export interface ExpedienteTimelineChange {
  id: string;
  fromStatus: string;
  toStatus: string;
  changedAt: string;
  reason: string | null;
  actor: {
    userId: string | null;
    name: string | null;
  };
}

export interface ExpedienteActivityItem {
  id: string;
  type: 'CREATED' | 'SECTION_UPDATED' | 'STATUS_CHANGED' | 'CONTACT_ATTEMPT';
  occurredAt: string;
  actor: {
    userId: string | null;
    name: string | null;
  };
  sectionLabel: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
}

export interface ContactAttemptRecord {
  id: string;
  attemptedAt: string;
  channel: string;
  result: string;
  durationMinutes: number | null;
  notes: string | null;
  advisorId: string;
  actorName?: string | null;
}

export interface ConsentRecordItem {
  id: string;
  consentType: string;
  status: string;
  channel: string;
  obtainedAt: string;
  ipAddress: string | null;
  legalTextVersion: string;
  evidenceRef: string | null;
}

export interface CoverageCheckRecord {
  id: string;
  checkedAt: string;
  latitude: number | null;
  longitude: number | null;
  addressUsed: string | null;
  result: string;
  technologyAvailable: string | null;
  distanceM: number | null;
  snapshotJson: Record<string, unknown>;
  checkedBy: string;
}

export interface ExpedienteOperationalMetadata {
  createdBy: {
    userId: string | null;
    name: string | null;
  };
  lastEditedBy: {
    userId: string | null;
    name: string | null;
  };
  lastActivityAt: string | null;
}

export const crmApi = {
  listExpedientes: (
    filters?: {
      status?: ExpedienteStatus;
      municipality?: string;
      search?: string;
      assignedTo?: string;
      documentNumber?: string;
      includeCompleted?: boolean;
      page?: number;
      limit?: number;
    },
    tenantSlug?: string,
  ) => {
    const searchParams = new URLSearchParams();

    if (filters?.status) searchParams.set('status', filters.status);
    if (filters?.municipality) searchParams.set('municipality', filters.municipality);
    if (filters?.search) searchParams.set('search', filters.search);
    if (filters?.assignedTo) searchParams.set('assignedTo', filters.assignedTo);
    if (filters?.documentNumber) searchParams.set('documentNumber', filters.documentNumber);
    if (filters?.includeCompleted) searchParams.set('includeCompleted', 'true');
    if (filters?.page) searchParams.set('page', String(filters.page));
    if (filters?.limit) searchParams.set('limit', String(filters.limit));

    const query = searchParams.toString();

    return request<{ data: ExpedienteRecord[]; total: number }>(
      `/crm/expedientes${query ? `?${query}` : ''}`,
      { returnFullResponse: true },
      tenantSlug,
    );
  },

  getExpediente: (id: string, tenantSlug?: string) =>
    request<{ data: ExpedienteRecord; completeness: CompletenessResult }>(
      `/crm/expedientes/${id}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  createExpediente: (dto: CreateExpedienteDto, tenantSlug?: string) =>
    request<{ data: ExpedienteRecord }>(
      '/crm/expedientes',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  updateExpedienteSection: (
    id: string,
    section: string,
    data: Record<string, unknown>,
    tenantSlug?: string,
  ) =>
    request<{ data: ExpedienteRecord }>(
      `/crm/expedientes/${id}/sections/${section}`,
      { method: 'PATCH', body: JSON.stringify({ data }) },
      tenantSlug,
    ),

  transitionExpedienteStatus: (id: string, dto: TransitionStatusDto, tenantSlug?: string) =>
    request<{ data: ExpedienteRecord; completeness: CompletenessResult }>(
      `/crm/expedientes/${id}/status`,
      { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  reactivateExpediente: (id: string, tenantSlug?: string) =>
    request<{ data: ExpedienteRecord }>(
      `/crm/expedientes/${id}/reactivate`,
      { method: 'POST' },
      tenantSlug,
    ),

  getExpedienteTimeline: (id: string, tenantSlug?: string) =>
    request<{
      data: {
        changes: ExpedienteTimelineChange[];
        activities: ExpedienteActivityItem[];
        metadata: ExpedienteOperationalMetadata;
      };
    }>(`/crm/expedientes/${id}/timeline`, { returnFullResponse: true }, tenantSlug),

  getPipelineSummary: (tenantSlug?: string) =>
    request<{ data: Record<string, number>; total: number }>(
      '/crm/pipeline/summary',
      { returnFullResponse: true },
      tenantSlug,
    ),

  createContactAttempt: (id: string, dto: CreateContactAttemptDto, tenantSlug?: string) =>
    request<{ data: ContactAttemptRecord }>(
      `/crm/expedientes/${id}/contact-attempts`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  listContactAttempts: (id: string, page?: number, limit?: number, tenantSlug?: string) => {
    const searchParams = new URLSearchParams();
    if (page) searchParams.set('page', String(page));
    if (limit) searchParams.set('limit', String(limit));
    const query = searchParams.toString();

    return request<{ data: ContactAttemptRecord[]; total: number }>(
      `/crm/expedientes/${id}/contact-attempts${query ? `?${query}` : ''}`,
      { returnFullResponse: true },
      tenantSlug,
    );
  },

  createConsent: (id: string, dto: CreateConsentDto, tenantSlug?: string) =>
    request<{ data: ConsentRecordItem }>(
      `/crm/expedientes/${id}/consents`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  listConsents: (id: string, tenantSlug?: string) =>
    request<{ data: ConsentRecordItem[] }>(
      `/crm/expedientes/${id}/consents`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  revokeConsent: (id: string, consentId: string, reason: string, tenantSlug?: string) =>
    request<{ data: ConsentRecordItem }>(
      `/crm/expedientes/${id}/consents/${consentId}/revoke`,
      { method: 'PATCH', body: JSON.stringify({ reason }), returnFullResponse: true },
      tenantSlug,
    ),

  createCoverageCheck: (id: string, dto: CreateCoverageCheckDto, tenantSlug?: string) =>
    request<{ data: CoverageCheckRecord }>(
      `/crm/expedientes/${id}/coverage-checks`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  listCoverageChecks: (id: string, tenantSlug?: string) =>
    request<{ data: CoverageCheckRecord[] }>(
      `/crm/expedientes/${id}/coverage-checks`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  createAttribution: (id: string, dto: CreateAttributionDto, tenantSlug?: string) =>
    request<{ data: SalesAttributionRecord }>(
      `/crm/expedientes/${id}/attribution`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  getAttribution: (id: string, tenantSlug?: string) =>
    request<{ data: SalesAttributionRecord | null }>(
      `/crm/expedientes/${id}/attribution`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  revokeAttribution: (id: string, reason: string, tenantSlug?: string) =>
    request<{ data: SalesAttributionRecord }>(
      `/crm/expedientes/${id}/attribution`,
      { method: 'DELETE', body: JSON.stringify({ reason }), returnFullResponse: true },
      tenantSlug,
    ),

  getAttributionHistory: (id: string, tenantSlug?: string) =>
    request<{ data: SalesAttributionRecord[] }>(
      `/crm/expedientes/${id}/attribution/history`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  getResponsibility: (id: string, tenantSlug?: string) =>
    request<{ data: ResponsibilitySnapshot }>(
      `/crm/expedientes/${id}/responsibility`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  updateResponsibility: (
    id: string,
    dto: { responsibleUserId: string; notes?: string },
    tenantSlug?: string,
  ) =>
    request<{ data: ResponsibilitySnapshot }>(
      `/crm/expedientes/${id}/responsibility`,
      { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  getResponsibilityHistory: (
    id: string,
    params?: { page?: number; limit?: number },
    tenantSlug?: string,
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const query = searchParams.toString();
    return request<{ data: OperationalHistoryItem[]; total: number }>(
      `/crm/expedientes/${id}/responsibility/history${query ? `?${query}` : ''}`,
      { returnFullResponse: true },
      tenantSlug,
    );
  },

  getDocumentSupports: (id: string, tenantSlug?: string, personType?: string | null) => {
    const query = personType ? `?personType=${encodeURIComponent(personType)}` : '';
    return request<{ data: ExpedienteDocumentSupportResponse }>(
      `/crm/expedientes/${id}/document-supports${query}`,
      { returnFullResponse: true },
      tenantSlug,
    );
  },

  uploadDocumentSupport: (id: string, documentKey: string, file: File, tenantSlug?: string) => {
    const body = new FormData();
    body.append('file', file);

    return request<{ data: ExpedienteDocumentSupportResponse }>(
      `/crm/expedientes/${id}/document-supports/${documentKey}/upload`,
      { method: 'POST', body, returnFullResponse: true },
      tenantSlug,
    );
  },

  updateDocumentSupportStatus: (
    id: string,
    documentKey: string,
    versionId: string,
    dto: { status: DocumentReviewStatus; note?: string | null },
    tenantSlug?: string,
  ) =>
    request<{ data: ExpedienteDocumentSupportResponse }>(
      `/crm/expedientes/${id}/document-supports/${documentKey}/${versionId}/status`,
      { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),
};

export const subscribersApi = {
  create: (payload: CreateSubscriberPayload, tenantSlug?: string) =>
    request<SubscriberRecord>(
      '/crm/subscribers',
      {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(payload),
      },
      tenantSlug,
    ),

  list: (params?: ListSubscribersParams, tenantSlug?: string) => {
    const searchParams = new URLSearchParams();

    if (params?.status) searchParams.set('status', params.status);
    if (params?.personType) searchParams.set('personType', params.personType);
    if (params?.customerSegment) searchParams.set('customerSegment', params.customerSegment);
    if (params?.stratum !== undefined) searchParams.set('stratum', String(params.stratum));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));

    const query = searchParams.toString();

    return request<{ data: SubscriberRecord[]; total: number }>(
      `/crm/subscribers${query ? `?${query}` : ''}`,
      { returnFullResponse: true },
      tenantSlug,
    );
  },

  search: (params?: SearchSubscribersParams, tenantSlug?: string) => {
    const searchParams = new URLSearchParams();

    if (params?.documentNumber) searchParams.set('documentNumber', params.documentNumber);
    if (params?.nit) searchParams.set('nit', params.nit);
    if (params?.email) searchParams.set('email', params.email);
    if (params?.phone) searchParams.set('phone', params.phone);

    const query = searchParams.toString();

    return request<{ data: SubscriberRecord[] }>(
      `/crm/subscribers/search${query ? `?${query}` : ''}`,
      { returnFullResponse: true },
      tenantSlug,
    );
  },

  getById: (id: string, tenantSlug?: string) =>
    request<SubscriberRecord>(`/crm/subscribers/${id}`, undefined, tenantSlug),

  update: (id: string, payload: UpdateSubscriberPayload, tenantSlug?: string) =>
    request<SubscriberRecord>(
      `/crm/subscribers/${id}`,
      {
        method: 'PATCH',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(payload),
      },
      tenantSlug,
    ),

  updateSection: (
    id: string,
    section: string,
    payload: Record<string, unknown>,
    tenantSlug?: string,
  ) =>
    request<SubscriberRecord>(
      `/crm/subscribers/${id}/section/${section}`,
      {
        method: 'PATCH',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(payload),
      },
      tenantSlug,
    ),

  remove: (id: string, tenantSlug?: string) =>
    request<{ id: string; deleted: true }>(
      `/crm/subscribers/${id}`,
      { method: 'DELETE' },
      tenantSlug,
    ),

  transitionStatus: (id: string, payload: TransitionStatusPayload, tenantSlug?: string) =>
    request<SubscriberRecord>(
      `/crm/subscribers/${id}/status`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      tenantSlug,
    ),

  get360: (id: string, tenantSlug?: string) =>
    request<Subscriber360Response>(`/crm/subscribers/${id}/360`, undefined, tenantSlug),
};
