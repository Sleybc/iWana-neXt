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
  ScheduleEventStatus,
  SlaBreachStatus,
  SubscriberStatus,
  TaxType,
  TechnicalConfidence,
  TechnicalViabilityResult,
  TaxRegime,
  TechnicianAvailabilityType,
  TechnologyOption,
  TicketFieldDecision,
  TicketPriority,
  TicketQueue,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketTimelineEventType,
  TicketType,
  TransitionStatusPayload,
  UpdateSubscriberPayload,
  VatTreatment,
  WfmWorkType,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WorkOrderStatus,
} from '@iwana/shared';
import { persistTenantSlug, resolveTenantSlug } from './tenant-resolution';

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
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
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
  const resolution = resolveTenantSlug(tenantSlugOverride);
  if (resolution.slug) {
    return resolution.slug;
  }

  throw new ApiError(
    400,
    'TENANT_SLUG_REQUIRED',
    'Falta la empresa. Ingresa el identificador de la empresa en el login o configura NEXT_PUBLIC_TENANT_SLUG.',
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
export type TenantStatus =
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'INACTIVE'
  | 'MARKED_FOR_DELETION'
  | 'PROVISIONING'
  | 'PROVISIONING_FAILED';

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
  logoLightAssetId: string | null;
  logoDarkUrl: string | null;
  logoDarkAssetId: string | null;
  sealLightUrl: string | null;
  sealLightAssetId: string | null;
  sealDarkUrl: string | null;
  sealDarkAssetId: string | null;
  faviconLightUrl: string | null;
  faviconLightAssetId: string | null;
  faviconDarkUrl: string | null;
  faviconDarkAssetId: string | null;
  loginBackgroundLightUrl: string | null;
  loginBackgroundLightAssetId: string | null;
  loginBackgroundDarkUrl: string | null;
  loginBackgroundDarkAssetId: string | null;
  showTenantName: boolean;
  brandingProductName: string | null;
  brandingSurfaceName: string | null;
  brandingMetadataTitle: string | null;
  brandingMetadataDescription: string | null;
}

export interface TenantPublicBranding {
  displayName: string;
  productName: string;
  surfaceName: string;
  metadataTitle: string;
  metadataDescription: string;
  showTenantName: boolean;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  sealLightUrl: string | null;
  sealDarkUrl: string | null;
  faviconLightUrl: string | null;
  faviconDarkUrl: string | null;
  loginBackgroundLightUrl: string | null;
  loginBackgroundDarkUrl: string | null;
}

export type BrandingUsage = 'logo' | 'seal' | 'favicon' | 'login_background';
export type BrandingThemeVariant = 'light' | 'dark';

export interface MediaAsset {
  id: string;
  usage: BrandingUsage | 'general';
  themeVariant: BrandingThemeVariant | null;
  mimeType: string;
  sizeBytes: number;
  publicUrl: string | null;
  createdAt: string;
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
  brandingProductName?: string | null;
  brandingSurfaceName?: string | null;
  brandingMetadataTitle?: string | null;
  brandingMetadataDescription?: string | null;
}

export interface UploadTenantBrandingAssetDto {
  usage: BrandingUsage;
  themeVariant: BrandingThemeVariant;
  file: File;
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

// ── Tributarias legacy (tipos de compatibilidad) ──────────────────────────────

export interface TaxClassification {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface TaxRule {
  id: string;
  tenantId: string;
  taxClassificationId: string | null;
  customerSegment: string | null;
  taxType: string;
  ratePercentage: string;
  stratumFrom: number | null;
  stratumTo: number | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
}

// ── Catálogo tributario MOD07 ────────────────────────────────────────────
export interface TaxDefinition {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  category: 'VAT' | 'WITHHOLDING' | 'STAMP' | 'MUNICIPAL' | 'OTHER';
  jurisdictionLevel: 'NATIONAL' | 'DEPARTMENT' | 'MUNICIPAL';
  municipalityCode: string | null;
  baseRate: string | null;
  treatment: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';
  context: 'SALES' | 'PURCHASE' | 'BOTH';
  origin: 'SYSTEM' | 'CUSTOM';
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaxDefinitionDto {
  code: string;
  name: string;
  category: 'VAT' | 'WITHHOLDING' | 'STAMP' | 'MUNICIPAL' | 'OTHER';
  jurisdictionLevel: 'NATIONAL' | 'DEPARTMENT' | 'MUNICIPAL';
  municipalityCode?: string;
  baseRate?: number;
  treatment: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';
  context: 'SALES' | 'PURCHASE' | 'BOTH';
  notes?: string;
}

export interface UpdateTaxDefinitionDto {
  name?: string;
  baseRate?: number;
  treatment?: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';
  context?: 'SALES' | 'PURCHASE' | 'BOTH';
  isActive?: boolean;
  notes?: string;
}

// ── Aplicaciones tributarias (tabla puente) ──────────────────────────────
export interface TaxRuleApplication {
  id: string;
  tenantId: string;
  taxRuleId: string;
  taxDefinitionId: string;
  treatment: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';
  rateOverride: string | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaxRuleApplicationDto {
  taxRuleId: string;
  taxDefinitionId: string;
  treatment: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';
  rateOverride?: number | null;
  priority?: number;
}

export interface UpdateTaxRuleApplicationDto {
  treatment?: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';
  rateOverride?: number | null;
  priority?: number;
  isActive?: boolean;
}

// ── Simulador tributario ─────────────────────────────────────────────────
export interface TaxApplicationSnapshot {
  taxDefinitionId: string;
  treatment: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';
  effectiveRate: number | null;
  ruleId: string;
  priorityMatched: number;
}

export interface SimulateTaxDto {
  segment: 'RESIDENTIAL' | 'SOHO' | 'PYME' | 'CORPORATE';
  stratum?: number;
  municipalityCode?: string;
}

/** Resultado del endpoint POST /commercial/tax/simulate. */
export interface SimulateTaxResult {
  applications: TaxApplicationSnapshot[];
  winnerRuleId: string | null;
  reason: string;
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

  uploadBrandingAsset: (dto: UploadTenantBrandingAssetDto, tenantSlug?: string) => {
    const formData = new FormData();
    formData.append('usage', dto.usage);
    formData.append('themeVariant', dto.themeVariant);
    formData.append('file', dto.file);

    return request<MediaAsset>(
      '/tenants/me/branding/assets',
      { method: 'POST', body: formData },
      tenantSlug,
    );
  },

  getPublicBranding: (slug: string) =>
    request<TenantPublicBranding>(
      `/tenants/public-branding?slug=${encodeURIComponent(slug)}`,
      { skipAuth: true, skipRefreshRetry: true },
      slug,
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

  // ── Tributarias (compatibilidad: GET listado de reglas para TaxApplicationRulesManager) ─

  /** Lista reglas tributarias del tenant. Usado por TaxApplicationRulesManager para selección. */
  getTaxRules: (tenantSlug?: string) =>
    request<TaxRule[]>('/commercial/tax-rules', undefined, tenantSlug),

  // ── Catálogo MOD07 ───────────────────────────────────────────────────────

  /** Lista definiciones tributarias del catálogo MOD07 (filtros opcionales). */
  listTaxDefinitions: (
    params?: { isActive?: boolean; category?: string; context?: string },
    tenantSlug?: string,
  ) => {
    const qs =
      params && Object.keys(params).length > 0
        ? '?' +
          new URLSearchParams(
            Object.entries(params)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)]),
          ).toString()
        : '';
    return request<TaxDefinition[]>(`/taxation/definitions${qs}`, undefined, tenantSlug);
  },

  /** Crea definición tributaria en el catálogo MOD07. */
  createTaxDefinition: (dto: CreateTaxDefinitionDto, tenantSlug?: string) =>
    request<TaxDefinition>(
      '/taxation/definitions',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Actualiza definición tributaria. Presets SYSTEM son inmutables (403 del backend). */
  updateTaxDefinition: (id: string, dto: UpdateTaxDefinitionDto, tenantSlug?: string) =>
    request<TaxDefinition>(
      `/taxation/definitions/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Elimina (soft-delete) definición tributaria. Presets SYSTEM son inmutables (403 del backend). */
  deleteTaxDefinition: (id: string, tenantSlug?: string) =>
    request<void>(`/taxation/definitions/${id}`, { method: 'DELETE' }, tenantSlug),

  // ── Aplicaciones tributarias ─────────────────────────────────────────────

  /** Lista aplicaciones tributarias (tabla puente reglas ↔ catálogo). */
  listTaxRuleApplications: (tenantSlug?: string) =>
    request<TaxRuleApplication[]>('/commercial/tax-rule-applications', undefined, tenantSlug),

  /** Crea aplicación tributaria (vincula regla con definición del catálogo). */
  createTaxRuleApplication: (dto: CreateTaxRuleApplicationDto, tenantSlug?: string) =>
    request<TaxRuleApplication>(
      '/commercial/tax-rule-applications',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Actualiza aplicación tributaria (tratamiento, tasa override, prioridad). */
  updateTaxRuleApplication: (id: string, dto: UpdateTaxRuleApplicationDto, tenantSlug?: string) =>
    request<TaxRuleApplication>(
      `/commercial/tax-rule-applications/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Elimina aplicación tributaria. */
  deleteTaxRuleApplication: (id: string, tenantSlug?: string) =>
    request<void>(`/commercial/tax-rule-applications/${id}`, { method: 'DELETE' }, tenantSlug),

  // ── Simulador ────────────────────────────────────────────────────────────

  /** Simula los impuestos que aplican a un cliente dado segmento, estrato y municipio. */
  simulateTax: (dto: SimulateTaxDto, tenantSlug?: string) =>
    request<SimulateTaxResult>(
      '/commercial/tax/simulate',
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
// MOD10 / SERVICE ASSURANCE / MESA DE AYUDA
// ─────────────────────────────────────────────────────────────────────────────

export interface AssuranceTicket {
  id: string;
  tenantId: string;
  ticketNumber: string;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  source: TicketSource;
  subject: string;
  description: string | null;
  requesterType: TicketRequesterType;
  requesterRefId: string | null;
  subjectType: TicketSubjectType | null;
  subjectRefId: string | null;
  assignedUserId: string | null;
  queueName: TicketQueue | null;
  slaPolicyId: string | null;
  slaFirstResponseAt: string | null;
  slaResolveByAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  slaBreachStatus: SlaBreachStatus;
  fieldDecision: TicketFieldDecision;
  workOrderId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssuranceTicketComment {
  id: string;
  ticketId: string;
  tenantId: string;
  body: string;
  isInternal: boolean;
  authorUserId: string;
  createdAt: string;
}

export interface AssuranceTimelineEvent {
  id: string;
  ticketId: string;
  tenantId: string;
  eventType: TicketTimelineEventType;
  payload: Record<string, unknown>;
  actorUserId: string | null;
  occurredAt: string;
}

export interface AssuranceSlaPolicy {
  id: string;
  tenantId: string;
  name: string;
  appliesToType: string | null;
  appliesToPriority: string | null;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssuranceDashboardSummary {
  openCount: number;
  assignedCount: number;
  inProgressCount: number;
  atRiskCount: number;
  breachedCount: number;
  resolvedTodayCount: number;
  fieldServicePendingCount: number;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
}

export interface CreateAssuranceTicketDto {
  type: TicketType;
  priority?: TicketPriority | undefined;
  source?: TicketSource | undefined;
  subject: string;
  description?: string | null | undefined;
  requesterType: TicketRequesterType;
  requesterRefId?: string | null | undefined;
  subjectType?: TicketSubjectType | null | undefined;
  subjectRefId?: string | null | undefined;
  assignedUserId?: string | null | undefined;
  queueName?: TicketQueue | null | undefined;
  fieldDecision?: TicketFieldDecision | undefined;
  slaPolicyId?: string | null | undefined;
}

export interface UpdateAssuranceTicketDto {
  subject?: string | undefined;
  description?: string | null | undefined;
  priority?: TicketPriority | undefined;
  source?: TicketSource | undefined;
  requesterRefId?: string | null | undefined;
  subjectType?: TicketSubjectType | null | undefined;
  subjectRefId?: string | null | undefined;
  assignedUserId?: string | null | undefined;
  queueName?: TicketQueue | null | undefined;
  fieldDecision?: TicketFieldDecision | undefined;
}

export interface TransitionAssuranceTicketDto {
  status: TicketStatus;
  notes?: string | null | undefined;
}

export interface AddAssuranceCommentDto {
  body: string;
  isInternal?: boolean | undefined;
}

export interface AssignAssuranceTicketDto {
  assignedUserId?: string | null | undefined;
  queueName?: TicketQueue | null | undefined;
}

export interface RequestAssuranceFieldServiceDto {
  notes?: string | null | undefined;
}

export interface LinkAssuranceWorkOrderDto {
  workOrderId: string;
  notes?: string | null | undefined;
}

export interface CreateAssuranceSlaPolicyDto {
  name: string;
  appliesToType?: string | null | undefined;
  appliesToPriority?: string | null | undefined;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  isActive?: boolean | undefined;
}

export interface ListAssuranceTicketsParams {
  status?: TicketStatus | undefined;
  type?: TicketType | undefined;
  priority?: TicketPriority | undefined;
  slaBreachStatus?: SlaBreachStatus | undefined;
  queueName?: TicketQueue | undefined;
  requesterRefId?: string | undefined;
  assignedUserId?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface ListAssuranceTicketsResponse {
  data: AssuranceTicket[];
  total: number;
  page: number;
  limit: number;
}

export interface FindOrCreateInstallationTicketDto {
  expedienteId: string;
  expedienteFullName: string;
}

export interface FindOrCreateInstallationTicketResponse {
  ticket: AssuranceTicket;
  created: boolean;
}

export interface LinkExpedienteInstallationRefsDto {
  ticketId: string;
  workOrderId: string;
  lastRescheduleReason?: string | null;
  lastRescheduleNotes?: string | null;
}

export const assuranceApi = {
  tickets: {
    list: (params?: ListAssuranceTicketsParams, tenantSlug?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set('status', params.status);
      if (params?.type) searchParams.set('type', params.type);
      if (params?.priority) searchParams.set('priority', params.priority);
      if (params?.slaBreachStatus) searchParams.set('slaBreachStatus', params.slaBreachStatus);
      if (params?.queueName) searchParams.set('queueName', params.queueName);
      if (params?.requesterRefId) searchParams.set('requesterRefId', params.requesterRefId);
      if (params?.assignedUserId) searchParams.set('assignedUserId', params.assignedUserId);
      if (params?.page) searchParams.set('page', String(params.page));
      if (params?.limit) searchParams.set('limit', String(params.limit));

      const query = searchParams.toString();
      return request<ListAssuranceTicketsResponse>(
        `/assurance/tickets${query ? `?${query}` : ''}`,
        { returnFullResponse: true },
        tenantSlug,
      );
    },

    get: (id: string, tenantSlug?: string) =>
      request<AssuranceTicket>(
        `/assurance/tickets/${id}`,
        { returnFullResponse: true },
        tenantSlug,
      ),

    create: (dto: CreateAssuranceTicketDto, tenantSlug?: string) =>
      request<AssuranceTicket>(
        '/assurance/tickets',
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    update: (id: string, dto: UpdateAssuranceTicketDto, tenantSlug?: string) =>
      request<AssuranceTicket>(
        `/assurance/tickets/${id}`,
        { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    transitionStatus: (id: string, dto: TransitionAssuranceTicketDto, tenantSlug?: string) =>
      request<AssuranceTicket>(
        `/assurance/tickets/${id}/status`,
        { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    addComment: (id: string, dto: AddAssuranceCommentDto, tenantSlug?: string) =>
      request<AssuranceTicketComment>(
        `/assurance/tickets/${id}/comments`,
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    listComments: (id: string, tenantSlug?: string) =>
      request<AssuranceTicketComment[]>(
        `/assurance/tickets/${id}/comments`,
        { returnFullResponse: true },
        tenantSlug,
      ),

    assign: (id: string, dto: AssignAssuranceTicketDto, tenantSlug?: string) =>
      request<AssuranceTicket>(
        `/assurance/tickets/${id}/assign`,
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    listTimeline: (id: string, tenantSlug?: string) =>
      request<AssuranceTimelineEvent[]>(
        `/assurance/tickets/${id}/timeline`,
        { returnFullResponse: true },
        tenantSlug,
      ),

    requestFieldService: (id: string, dto: RequestAssuranceFieldServiceDto, tenantSlug?: string) =>
      request<AssuranceTicket>(
        `/assurance/tickets/${id}/request-field-service`,
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    linkWorkOrder: (id: string, dto: LinkAssuranceWorkOrderDto, tenantSlug?: string) =>
      request<AssuranceTicket>(
        `/assurance/tickets/${id}/link-work-order`,
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    findOrCreateInstallation: (dto: FindOrCreateInstallationTicketDto, tenantSlug?: string) =>
      request<FindOrCreateInstallationTicketResponse>(
        '/assurance/tickets/find-or-create-installation',
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),
  },

  dashboard: {
    getSummary: (tenantSlug?: string) =>
      request<AssuranceDashboardSummary>(
        '/assurance/dashboard/summary',
        { returnFullResponse: true },
        tenantSlug,
      ),
  },

  slaPolicies: {
    list: (tenantSlug?: string) =>
      request<AssuranceSlaPolicy[]>(
        '/assurance/sla-policies',
        { returnFullResponse: true },
        tenantSlug,
      ),

    create: (dto: CreateAssuranceSlaPolicyDto, tenantSlug?: string) =>
      request<AssuranceSlaPolicy>(
        '/assurance/sla-policies',
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// WFM / PROGRAMACION OPERATIVA DEL TENANT
// ─────────────────────────────────────────────────────────────────────────────

export interface WfmScheduleEvent {
  id: string;
  tenantId: string;
  workOrderId: string | null;
  type: WfmWorkType;
  status: ScheduleEventStatus;
  title: string;
  description: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  assignedUserId: string;
  assignedTeamId: string | null;
  address: string | null;
  municipality: string | null;
  latitude: string | null;
  longitude: string | null;
  expedienteId: string | null;
  subscriberId: string | null;
  ticketId: string | null;
  contractId: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateWfmEmbeddedWorkOrderDto {
  type?: WfmWorkType | undefined;
  priority?: WorkOrderPriority | undefined;
  sourceContext?: WorkOrderSourceContext | undefined;
  sourceRef?: string | null | undefined;
  summary: string;
  notes?: string | null | undefined;
}

export interface CreateWfmScheduleEventDto {
  type: WfmWorkType;
  title: string;
  description?: string | null | undefined;
  scheduledStartAt: string;
  scheduledEndAt: string;
  assignedUserId: string;
  address?: string | null | undefined;
  municipality?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  expedienteId?: string | null | undefined;
  subscriberId?: string | null | undefined;
  ticketId?: string | null | undefined;
  contractId?: string | null | undefined;
  workOrder?: CreateWfmEmbeddedWorkOrderDto | undefined;
}

export interface UpdateWfmScheduleEventDto {
  title?: string | undefined;
  description?: string | null | undefined;
  scheduledStartAt?: string | undefined;
  scheduledEndAt?: string | undefined;
  assignedUserId?: string | undefined;
  address?: string | null | undefined;
  municipality?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  expedienteId?: string | null | undefined;
  subscriberId?: string | null | undefined;
  ticketId?: string | null | undefined;
  contractId?: string | null | undefined;
}

export interface TransitionWfmScheduleEventDto {
  status: ScheduleEventStatus;
}

export interface RescheduleWfmEventDto {
  scheduledStartAt: string;
  scheduledEndAt: string;
  reason: string;
  notes?: string | null | undefined;
}

export interface ListWfmScheduleEventsParams {
  from?: string | undefined;
  to?: string | undefined;
  assignedUserId?: string | undefined;
  expedienteId?: string | undefined;
  type?: WfmWorkType | undefined;
  status?: ScheduleEventStatus | undefined;
  municipality?: string | undefined;
}

export interface WfmWorkOrder {
  id: string;
  tenantId: string;
  code: string;
  type: WfmWorkType;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  assignedUserId: string;
  scheduledEventId: string | null;
  sourceContext: WorkOrderSourceContext;
  sourceRef: string | null;
  summary: string;
  notes: string | null;
  createdBy: string;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TransitionWfmWorkOrderDto {
  status: WorkOrderStatus;
}

export type WfmTechnicianLoadRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type WfmDashboardAlertSeverity = 'critical' | 'warning' | 'info';
export type WfmDashboardAlertType =
  | 'OVERDUE_EVENT'
  | 'DRAFT_STARTING_SOON'
  | 'HIGH_TECHNICIAN_LOAD';

export interface WfmDashboardTechnicianLoad {
  assignedUserId: string;
  todayCount: number;
  overdueCount: number;
  totalScheduledMinutes: number;
  utilizationPercent: number;
  riskLevel: WfmTechnicianLoadRiskLevel;
}

export interface WfmDashboardAlert {
  id: string;
  type: WfmDashboardAlertType;
  severity: WfmDashboardAlertSeverity;
  title: string;
  description: string;
  eventId: string | null;
  assignedUserId: string | null;
  scheduledStartAt: string | null;
}

export interface WfmDashboardSummary {
  todayCount: number;
  overdueCount: number;
  upcomingCount: number;
  activeCount: number;
  enRouteCount: number;
  atRiskCount: number;
  alerts: WfmDashboardAlert[];
  technicianLoad: WfmDashboardTechnicianLoad[];
}

export interface WfmTechnicianAvailability {
  id: string;
  tenantId: string;
  userId: string;
  type: TechnicianAvailabilityType;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListWfmTechnicianAvailabilityParams {
  userId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  type?: TechnicianAvailabilityType | undefined;
}

export interface CreateWfmTechnicianAvailabilityDto {
  userId: string;
  type: TechnicianAvailabilityType;
  startsAt: string;
  endsAt: string;
  reason?: string | null | undefined;
}

export const wfmApi = {
  events: {
    list: (params?: ListWfmScheduleEventsParams, tenantSlug?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.from) searchParams.set('from', params.from);
      if (params?.to) searchParams.set('to', params.to);
      if (params?.assignedUserId) searchParams.set('assignedUserId', params.assignedUserId);
      if (params?.expedienteId) searchParams.set('expedienteId', params.expedienteId);
      if (params?.type) searchParams.set('type', params.type);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.municipality) searchParams.set('municipality', params.municipality);

      const query = searchParams.toString();
      return request<WfmScheduleEvent[]>(
        `/wfm/events${query ? `?${query}` : ''}`,
        { returnFullResponse: true },
        tenantSlug,
      );
    },

    get: (id: string, tenantSlug?: string) =>
      request<WfmScheduleEvent>(`/wfm/events/${id}`, { returnFullResponse: true }, tenantSlug),

    create: (dto: CreateWfmScheduleEventDto, tenantSlug?: string) =>
      request<WfmScheduleEvent>(
        '/wfm/events',
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    update: (id: string, dto: UpdateWfmScheduleEventDto, tenantSlug?: string) =>
      request<WfmScheduleEvent>(
        `/wfm/events/${id}`,
        { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    transitionStatus: (id: string, dto: TransitionWfmScheduleEventDto, tenantSlug?: string) =>
      request<WfmScheduleEvent>(
        `/wfm/events/${id}/status`,
        { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    reschedule: (id: string, dto: RescheduleWfmEventDto, tenantSlug?: string) =>
      request<WfmScheduleEvent>(
        `/wfm/events/${id}/reschedule`,
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    remove: (id: string, tenantSlug?: string) =>
      request<void>(`/wfm/events/${id}`, { method: 'DELETE' }, tenantSlug),
  },

  workOrders: {
    list: (tenantSlug?: string) =>
      request<WfmWorkOrder[]>('/wfm/work-orders', { returnFullResponse: true }, tenantSlug),

    get: (id: string, tenantSlug?: string) =>
      request<WfmWorkOrder>(`/wfm/work-orders/${id}`, { returnFullResponse: true }, tenantSlug),

    transitionStatus: (id: string, dto: TransitionWfmWorkOrderDto, tenantSlug?: string) =>
      request<WfmWorkOrder>(
        `/wfm/work-orders/${id}/status`,
        { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),
  },

  dashboard: {
    getSummary: (tenantSlug?: string) =>
      request<WfmDashboardSummary>(
        '/wfm/dashboard/summary',
        { returnFullResponse: true },
        tenantSlug,
      ),
  },

  technicians: {
    listAvailability: (params?: ListWfmTechnicianAvailabilityParams, tenantSlug?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.userId) searchParams.set('userId', params.userId);
      if (params?.from) searchParams.set('from', params.from);
      if (params?.to) searchParams.set('to', params.to);
      if (params?.type) searchParams.set('type', params.type);

      const query = searchParams.toString();
      return request<WfmTechnicianAvailability[]>(
        `/wfm/technicians/availability${query ? `?${query}` : ''}`,
        { returnFullResponse: true },
        tenantSlug,
      );
    },

    createAvailability: (dto: CreateWfmTechnicianAvailabilityDto, tenantSlug?: string) =>
      request<WfmTechnicianAvailability>(
        '/wfm/technicians/availability',
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),
  },
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

export type GlobalSearchItemType = 'module' | 'user' | 'subscriber' | 'expediente';

export interface GlobalSearchItem {
  id: string;
  type: GlobalSearchItemType;
  title: string;
  subtitle: string;
  meta: string;
  route: string;
  highlights: string[];
}

export interface GlobalSearchGroup {
  type: 'modules' | 'users' | 'subscribers' | 'expedientes';
  label: string;
  total: number;
  items: GlobalSearchItem[];
}

export interface GlobalSearchResponse {
  query: string;
  groups: GlobalSearchGroup[];
  tookMs: number;
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

interface PortalSearchModule {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  route: string;
}

const PORTAL_SEARCH_MODULES: PortalSearchModule[] = [
  {
    id: 'dashboard',
    title: 'Inicio',
    description: 'Resumen operativo del portal empresarial',
    keywords: ['dashboard', 'inicio', 'panel', 'resumen'],
    route: '/dashboard',
  },
  {
    id: 'commercial',
    title: 'Comercial',
    description: 'Promociones, bundles, reglas y catálogo comercial',
    keywords: ['comercial', 'ofertas', 'promociones', 'bundles', 'catalogo'],
    route: '/dashboard/commercial',
  },
  {
    id: 'crm',
    title: 'CRM',
    description: 'Pipeline y oportunidades comerciales de la empresa',
    keywords: ['crm', 'oportunidades', 'pipeline', 'expedientes'],
    route: '/dashboard/crm',
  },
  {
    id: 'subscribers',
    title: 'Suscriptores',
    description: 'Gestión comercial y postventa de suscriptores',
    keywords: ['suscriptores', 'clientes', 'postventa', 'subscriber'],
    route: '/dashboard/crm/subscribers',
  },
  {
    id: 'scheduling',
    title: 'Programacion',
    description: 'Agenda operativa, eventos técnicos y work orders del tenant',
    keywords: ['programacion', 'agenda', 'wfm', 'ordenes de trabajo', 'tecnicos'],
    route: '/dashboard/scheduling',
  },
  {
    id: 'settings',
    title: 'Configuración',
    description: 'Branding, parámetros operativos y ajustes del tenant',
    keywords: ['configuracion', 'branding', 'ajustes', 'parametros'],
    route: '/dashboard/settings',
  },
  {
    id: 'users',
    title: 'Usuarios',
    description: 'Gestión de accesos internos de la empresa',
    keywords: ['usuarios', 'roles', 'accesos', 'mfa'],
    route: '/dashboard/users',
  },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlightMatch(value: string | null | undefined, query: string): string | null {
  const source = value?.trim();
  const normalizedQuery = query.trim();

  if (!source || !normalizedQuery) {
    return null;
  }

  const lowerSource = source.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const index = lowerSource.indexOf(lowerQuery);

  if (index < 0) {
    return null;
  }

  const before = escapeHtml(source.slice(0, index));
  const match = escapeHtml(source.slice(index, index + normalizedQuery.length));
  const after = escapeHtml(source.slice(index + normalizedQuery.length));

  return `${before}<mark>${match}</mark>${after}`;
}

function compactHighlights(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value)).slice(0, 2);
}

function formatPortalUserTitle(user: InternalUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email;
}

function formatPortalSubscriberTitle(subscriber: SubscriberRecord): string {
  return (
    subscriber.commercialName?.trim() ||
    subscriber.businessName?.trim() ||
    [subscriber.firstName, subscriber.lastName].filter(Boolean).join(' ').trim() ||
    subscriber.email?.trim() ||
    subscriber.documentNumber?.trim() ||
    'Suscriptor'
  );
}

function formatPortalSubscriberSubtitle(subscriber: SubscriberRecord): string {
  const parts = [
    subscriber.city,
    subscriber.email,
    subscriber.documentNumber,
    subscriber.phone,
  ].filter((value): value is string => Boolean(value?.trim()));

  return parts.join(' · ') || 'Registro comercial del suscriptor';
}

function formatPortalExpedienteSubtitle(expediente: ExpedienteRecord): string {
  const parts = [
    expediente.municipality,
    expediente.emailPrimary,
    expediente.documentNumber,
    expediente.source,
  ].filter((value): value is string => Boolean(value?.trim()));

  return parts.join(' · ') || 'Oportunidad comercial';
}

function buildUsersSearchRoute(user: InternalUser): string {
  return `/dashboard/users?search=${encodeURIComponent(user.email)}`;
}

function searchPortalModules(query: string, limit: number): GlobalSearchGroup | null {
  const normalizedQuery = query.trim().toLowerCase();

  const matches = PORTAL_SEARCH_MODULES.filter((item) => {
    const haystack = [item.title, item.description, ...item.keywords].join(' ').toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  if (matches.length === 0) {
    return null;
  }

  return {
    type: 'modules',
    label: 'Módulos',
    total: matches.length,
    items: matches.slice(0, limit).map((item) => ({
      id: item.id,
      type: 'module',
      title: item.title,
      subtitle: item.description,
      meta: 'Navegación',
      route: item.route,
      highlights: compactHighlights([
        highlightMatch(item.title, query),
        highlightMatch(item.description, query),
      ]),
    })),
  };
}

function emptyUsersResponse(): ListUsersResponse {
  return {
    data: [],
    meta: { nextCursor: null, total: 0 },
  };
}

function emptyCollectionResponse<TRecord>(): { data: TRecord[]; total: number } {
  return {
    data: [],
    total: 0,
  };
}

async function withSearchFallback<T>(executor: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await executor();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    if (error instanceof ApiError) {
      return fallback;
    }

    return fallback;
  }
}

function mapUsersGroup(
  users: InternalUser[],
  total: number,
  query: string,
): GlobalSearchGroup | null {
  if (users.length === 0) {
    return null;
  }

  return {
    type: 'users',
    label: 'Usuarios',
    total,
    items: users.map((user) => ({
      id: user.id,
      type: 'user',
      title: formatPortalUserTitle(user),
      subtitle: [user.email, user.jobTitle]
        .filter((value): value is string => Boolean(value))
        .join(' · '),
      meta: user.role.replace(/_/g, ' '),
      route: buildUsersSearchRoute(user),
      highlights: compactHighlights([
        highlightMatch(formatPortalUserTitle(user), query),
        highlightMatch(user.email, query),
      ]),
    })),
  };
}

function mapSubscribersGroup(
  subscribers: SubscriberRecord[],
  total: number,
  query: string,
): GlobalSearchGroup | null {
  if (subscribers.length === 0) {
    return null;
  }

  return {
    type: 'subscribers',
    label: 'Suscriptores',
    total,
    items: subscribers.map((subscriber) => ({
      id: subscriber.id,
      type: 'subscriber',
      title: formatPortalSubscriberTitle(subscriber),
      subtitle: formatPortalSubscriberSubtitle(subscriber),
      meta: 'Suscriptor',
      route: `/dashboard/crm/subscribers/${subscriber.id}`,
      highlights: compactHighlights([
        highlightMatch(formatPortalSubscriberTitle(subscriber), query),
        highlightMatch(subscriber.email, query),
        highlightMatch(subscriber.documentNumber, query),
      ]),
    })),
  };
}

function mapExpedientesGroup(
  expedientes: ExpedienteRecord[],
  total: number,
  query: string,
): GlobalSearchGroup | null {
  if (expedientes.length === 0) {
    return null;
  }

  return {
    type: 'expedientes',
    label: 'Oportunidades',
    total,
    items: expedientes.map((expediente) => ({
      id: expediente.id,
      type: 'expediente',
      title: expediente.fullName,
      subtitle: formatPortalExpedienteSubtitle(expediente),
      meta: 'CRM',
      route: `/dashboard/crm/expedientes/${expediente.id}`,
      highlights: compactHighlights([
        highlightMatch(expediente.fullName, query),
        highlightMatch(expediente.emailPrimary, query),
        highlightMatch(expediente.documentNumber, query),
      ]),
    })),
  };
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

export const globalSearchApi = {
  search: async (
    query: string,
    limit = 5,
    options?: Pick<RequestOptions, 'signal'>,
    tenantSlug?: string,
  ): Promise<GlobalSearchResponse> => {
    const normalizedQuery = query.trim();
    const startedAt = Date.now();

    if (normalizedQuery.length < 2) {
      return { query: normalizedQuery, groups: [], tookMs: 0 };
    }

    const [usersResponse, subscribersResponse, expedientesResponse] = await Promise.all([
      withSearchFallback(() => {
        const searchParams = new URLSearchParams();
        searchParams.set('limit', String(limit));
        searchParams.set('search', normalizedQuery);
        return request<ListUsersResponse>(`/users?${searchParams.toString()}`, options, tenantSlug);
      }, emptyUsersResponse()),
      withSearchFallback(() => {
        const searchParams = new URLSearchParams();
        searchParams.set('search', normalizedQuery);
        searchParams.set('page', '1');
        searchParams.set('limit', String(limit));
        return request<{ data: SubscriberRecord[]; total: number }>(
          `/crm/subscribers?${searchParams.toString()}`,
          { ...options, returnFullResponse: true },
          tenantSlug,
        );
      }, emptyCollectionResponse<SubscriberRecord>()),
      withSearchFallback(() => {
        const searchParams = new URLSearchParams();
        searchParams.set('search', normalizedQuery);
        searchParams.set('page', '1');
        searchParams.set('limit', String(limit));
        return request<{ data: ExpedienteRecord[]; total: number }>(
          `/crm/expedientes?${searchParams.toString()}`,
          { ...options, returnFullResponse: true },
          tenantSlug,
        );
      }, emptyCollectionResponse<ExpedienteRecord>()),
    ]);

    const groups = [
      searchPortalModules(normalizedQuery, limit),
      mapUsersGroup(usersResponse.data, usersResponse.meta.total, normalizedQuery),
      mapSubscribersGroup(
        subscribersResponse.data.slice(0, limit),
        subscribersResponse.total,
        normalizedQuery,
      ),
      mapExpedientesGroup(
        expedientesResponse.data.slice(0, limit),
        expedientesResponse.total,
        normalizedQuery,
      ),
    ].filter((group): group is GlobalSearchGroup => Boolean(group));

    return {
      query: normalizedQuery,
      groups,
      tookMs: Date.now() - startedAt,
    };
  },
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
  additionalServiceIds?: string[] | null;
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

// ── Contratos / Servicios contratados ────────────────────────────────────────

export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED' | 'ARCHIVED';

/** Contrato de servicio contratado (un subscriber puede tener N contratos). */
export interface Contract {
  id: string;
  tenantId: string;
  quoteId: string | null;
  subscriberId: string;
  planId: string;
  planSnapshotJson: Record<string, unknown>;
  status: ContractStatus;
  alias: string;
  installationAddress: string | null;
  installationCity: string | null;
  installationDepartment: string | null;
  installationPostalCode: string | null;
  installationNotes: string | null;
  customerSegment: string | null;
  additionalProductIds: string[];
  additionalServiceIds: string[];
  paymentMethod: string | null;
  billingCycle: string | null;
  fiscalName: string | null;
  fiscalDocument: string | null;
  fiscalAddress: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateContractPayload {
  subscriberId?: string;
  quoteId?: string;
  planId: string;
  planSnapshotJson: Record<string, unknown>;
  alias?: string;
  installationAddress?: string;
  installationCity?: string;
  installationDepartment?: string;
  installationPostalCode?: string;
  installationNotes?: string;
  customerSegment?: string;
  additionalProductIds?: string[];
  additionalServiceIds?: string[];
  paymentMethod?: string;
  billingCycle?: string;
  fiscalName?: string;
  fiscalDocument?: string;
  fiscalAddress?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateContractFromExpedientePayload {
  expedienteId?: string;
  alias?: string;
  installationAddress?: string;
  installationCity?: string;
  installationDepartment?: string;
  installationPostalCode?: string;
  installationNotes?: string;
  customerSegment?: string;
  paymentMethod?: string;
  billingCycle?: string;
}

export interface Subscriber360Response {
  subscriber: SubscriberRecord;
  contacts: unknown[];
  contracts: Contract[];
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
    /** Interés comercial capturado en el expediente CRM */
    interestedPlanId: string | null;
    additionalProductIds: string[];
    additionalServiceIds: string[];
    commercialNotes: string | null;
  } | null;
  timelineSeed: Array<{
    type: string;
    occurredAt: string;
    expedienteId: string | null;
  }>;
}

// ── Perfil tributario por suscriptor (Taxation MVP por cliente) ───────────────

/** Estado de una asignación tributaria individual. */
export type TaxAssignmentStatus = 'SUGGESTED' | 'CONFIRMED' | 'MANUAL_ADJUSTMENT';

/** Origen de la tasa efectiva: del catálogo o ingresada manualmente. */
export type TaxAssignmentRateSource = 'CATALOG' | 'MANUAL';

/** Tratamiento tributario efectivo de la asignación. */
export type TaxTreatmentPortal = 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';

/** Estado del perfil tributario del suscriptor. */
export type TaxProfileStatus = 'PENDING_REVIEW' | 'CONFIGURED';

/** Snapshot de una asignación tributaria individual. */
export interface TaxAssignmentSnapshot {
  id: string;
  taxDefinitionId: string;
  taxName: string;
  effectiveRate: string | null;
  rateSource: TaxAssignmentRateSource;
  treatment: TaxTreatmentPortal | null;
  status: TaxAssignmentStatus;
  reason: string | null;
  updatedAt: string;
}

/** Snapshot del perfil tributario completo del suscriptor. */
export interface SubscriberTaxProfileSnapshot {
  id: string;
  subscriberId: string;
  segment: string | null;
  stratum: number | null;
  profileStatus: TaxProfileStatus;
  confirmedAt: string | null;
  confirmedBy: string | null;
  assignments: TaxAssignmentSnapshot[];
  updatedAt: string;
}

/** Payload para crear o actualizar una asignación tributaria. */
export interface UpsertTaxAssignmentPayload {
  taxDefinitionId: string;
  effectiveRate?: number | null;
  rateSource?: TaxAssignmentRateSource;
  treatment?: TaxTreatmentPortal | null;
  status?: TaxAssignmentStatus;
  reason?: string | null;
}

/** Payload bulk para guardar lista de asignaciones. */
export interface SaveTaxAssignmentsPayload {
  assignments: UpsertTaxAssignmentPayload[];
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
  sectionCompleteness?: SectionCompletenessItem[];
  installationReadiness?: InstallationReadinessSummary;
  missingRequirements?: CompletenessMissingRequirement[];
}

export interface CompletenessMissingRequirement {
  sectionKey: string;
  sectionLabel: string;
  fieldKey: string;
  fieldLabel: string;
}

export interface SectionCompletenessItem {
  key: string;
  label: string;
  percentage: number;
  completedFields: number;
  totalFields: number;
  missingFields: CompletenessMissingRequirement[];
}

export interface InstallationReadinessSummary {
  status: 'NOT_READY' | 'READY_WITH_PENDING' | 'READY_COMPLETE';
  canTransition: boolean;
  title: string;
  message: string;
}

export interface TransitionWarning {
  title: string;
  message: string;
  missingRequirements: CompletenessMissingRequirement[];
}

export interface PipelineRecommendation {
  currentStatus: string;
  /** null si ya está en el estado óptimo recomendado */
  suggestedStatus: string | null;
  recommendationReason: string | null;
  blockingRequirements: CompletenessMissingRequirement[];
  informationalRequirements: CompletenessMissingRequirement[];
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

function buildDocumentSupportQuery(personType?: string | null): string {
  return personType ? `?personType=${encodeURIComponent(personType)}` : '';
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
    request<{
      data: ExpedienteRecord;
      completeness: CompletenessResult;
      sectionCompleteness: SectionCompletenessItem[];
      installationReadiness: InstallationReadinessSummary;
      missingRequirements: CompletenessMissingRequirement[];
      pipelineRecommendation: PipelineRecommendation;
    }>(`/crm/expedientes/${id}`, { returnFullResponse: true }, tenantSlug),

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
    request<{
      data: ExpedienteRecord;
      completeness: CompletenessResult;
      sectionCompleteness: SectionCompletenessItem[];
      installationReadiness: InstallationReadinessSummary;
      missingRequirements: CompletenessMissingRequirement[];
      pipelineRecommendation: PipelineRecommendation;
      transitionWarning: TransitionWarning | null;
    }>(
      `/crm/expedientes/${id}/status`,
      { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  linkInstallationOperationalRefs: (
    id: string,
    dto: LinkExpedienteInstallationRefsDto,
    tenantSlug?: string,
  ) =>
    request<{ data: ExpedienteRecord }>(
      `/crm/expedientes/${id}/installation-operational-refs`,
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
    const query = buildDocumentSupportQuery(personType);
    return request<{ data: ExpedienteDocumentSupportResponse }>(
      `/crm/expedientes/${id}/document-supports${query}`,
      { returnFullResponse: true },
      tenantSlug,
    );
  },

  uploadDocumentSupport: (
    id: string,
    documentKey: string,
    file: File,
    tenantSlug?: string,
    personType?: string | null,
  ) => {
    const body = new FormData();
    body.append('file', file);
    const query = buildDocumentSupportQuery(personType);

    return request<{ data: ExpedienteDocumentSupportResponse }>(
      `/crm/expedientes/${id}/document-supports/${documentKey}/upload${query}`,
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
    personType?: string | null,
  ) => {
    const query = buildDocumentSupportQuery(personType);

    return request<{ data: ExpedienteDocumentSupportResponse }>(
      `/crm/expedientes/${id}/document-supports/${documentKey}/${versionId}/status${query}`,
      { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    );
  },

  deleteDocumentSupport: (
    id: string,
    documentKey: string,
    versionId: string,
    tenantSlug?: string,
    personType?: string | null,
  ) => {
    const query = buildDocumentSupportQuery(personType);

    return request<{ data: ExpedienteDocumentSupportResponse }>(
      `/crm/expedientes/${id}/document-supports/${documentKey}/${versionId}${query}`,
      { method: 'DELETE', returnFullResponse: true },
      tenantSlug,
    );
  },
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

// ── API: perfil tributario por suscriptor ─────────────────────────────────────
export const subscriberTaxApi = {
  /**
   * Obtiene el perfil tributario del suscriptor.
   * Si no existe, el backend lo crea y sugiere IVA por estrato automáticamente.
   * Usado por Suscriptor 360 y el flujo de configuración de facturación.
   */
  getProfile: (subscriberId: string, tenantSlug?: string) =>
    request<SubscriberTaxProfileSnapshot>(
      `/crm/subscribers/${subscriberId}/tax-profile`,
      undefined,
      tenantSlug,
    ),

  /**
   * Guarda (upsert) la lista completa de asignaciones tributarias.
   * El área de facturación usa este endpoint para confirmar o ajustar el checklist.
   */
  saveAssignments: (
    subscriberId: string,
    payload: SaveTaxAssignmentsPayload,
    tenantSlug?: string,
  ) =>
    request<SubscriberTaxProfileSnapshot>(
      `/crm/subscribers/${subscriberId}/tax-profile/assignments`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      tenantSlug,
    ),

  /**
   * Actualiza una asignación tributaria individual.
   * Permite confirmar o ajustar manualmente un tributo específico.
   */
  updateAssignment: (
    subscriberId: string,
    assignmentId: string,
    payload: Partial<UpsertTaxAssignmentPayload>,
    tenantSlug?: string,
  ) =>
    request<SubscriberTaxProfileSnapshot>(
      `/crm/subscribers/${subscriberId}/tax-profile/assignments/${assignmentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      tenantSlug,
    ),

  /**
   * Recalcula la sugerencia de IVA del suscriptor según el estrato actual.
   * Solo actualiza asignaciones en estado SUGGESTED; no sobreescribe confirmadas.
   */
  suggestVat: (subscriberId: string, tenantSlug?: string) =>
    request<SubscriberTaxProfileSnapshot>(
      `/crm/subscribers/${subscriberId}/tax-profile/suggest-vat`,
      { method: 'POST' },
      tenantSlug,
    ),
};

// ── API: contratos / servicios contratados ────────────────────────────────────

export const contractsApi = {
  /** Lista todos los contratos de un subscriber, ordenados por createdAt DESC. */
  listBySubscriber: (subscriberId: string, tenantSlug?: string) =>
    request<Contract[]>(`/crm/subscribers/${subscriberId}/contracts`, undefined, tenantSlug),

  /** Crea un contrato directo para un subscriber. */
  createForSubscriber: (
    subscriberId: string,
    payload: CreateContractPayload,
    tenantSlug?: string,
  ) =>
    request<Contract>(
      `/crm/subscribers/${subscriberId}/contracts`,
      { method: 'POST', body: JSON.stringify(payload) },
      tenantSlug,
    ),

  /**
   * Crea un contrato DRAFT pre-poblado desde el expediente del subscriber.
   * Requiere que el expediente tenga interestedPlanId.
   */
  createFromExpediente: (
    subscriberId: string,
    payload: CreateContractFromExpedientePayload,
    tenantSlug?: string,
  ) =>
    request<Contract>(
      `/crm/subscribers/${subscriberId}/contracts/from-expediente`,
      { method: 'POST', body: JSON.stringify(payload) },
      tenantSlug,
    ),

  /** Crea un contrato de forma directa (sin pasar por subscriber en la ruta). */
  create: (payload: CreateContractPayload, tenantSlug?: string) =>
    request<Contract>(
      '/crm/contracts',
      { method: 'POST', body: JSON.stringify(payload) },
      tenantSlug,
    ),

  /** Lista todos los contratos (con filtros opcionales ?status=&planId=). */
  findAll: (params?: { status?: ContractStatus; planId?: string }, tenantSlug?: string) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.planId) qs.set('planId', params.planId);
    const query = qs.toString();
    return request<Contract[]>(`/crm/contracts${query ? `?${query}` : ''}`, undefined, tenantSlug);
  },

  /** Obtiene un contrato por ID. */
  getById: (id: string, tenantSlug?: string) =>
    request<Contract>(`/crm/contracts/${id}`, undefined, tenantSlug),

  /** Actualiza campos editables de un contrato (no incluye status). */
  update: (id: string, payload: Partial<CreateContractPayload>, tenantSlug?: string) =>
    request<Contract>(
      `/crm/contracts/${id}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      tenantSlug,
    ),

  /** Elimina (soft-delete) un contrato en estado DRAFT. */
  remove: (id: string, tenantSlug?: string) =>
    request<void>(`/crm/contracts/${id}`, { method: 'DELETE' }, tenantSlug),

  /** Transiciona DRAFT → ACTIVE. */
  activate: (id: string, tenantSlug?: string) =>
    request<Contract>(`/crm/contracts/${id}/activate`, { method: 'POST' }, tenantSlug),

  /** Transiciona ACTIVE → SUSPENDED. */
  suspend: (id: string, tenantSlug?: string) =>
    request<Contract>(`/crm/contracts/${id}/suspend`, { method: 'POST' }, tenantSlug),

  /** Transiciona SUSPENDED → ACTIVE. */
  reactivate: (id: string, tenantSlug?: string) =>
    request<Contract>(`/crm/contracts/${id}/reactivate`, { method: 'POST' }, tenantSlug),

  /** Transiciona ACTIVE|SUSPENDED → TERMINATED. */
  terminate: (id: string, tenantSlug?: string) =>
    request<Contract>(`/crm/contracts/${id}/terminate`, { method: 'POST' }, tenantSlug),

  /** Transiciona TERMINATED|SUSPENDED → ARCHIVED. */
  archive: (id: string, tenantSlug?: string) =>
    request<Contract>(`/crm/contracts/${id}/archive`, { method: 'POST' }, tenantSlug),
};
