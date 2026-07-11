// apps/portal/src/lib/api-client.ts

import {
  AcquisitionChannel,
  AccessPermissionAvailability,
  AccessPermissionCatalogVersion,
  AccessPermissionKey,
  BusinessHoursWeekday,
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
  OrganizationSiteAssignmentType,
  OrganizationSiteCapability,
  OrganizationSiteResponsibility,
  OrganizationSiteType,
  SettingsSectionKey,
  SettingsSectionStatus,
  ScheduleEventStatus,
  SlaBreachStatus,
  SubscriberStatus,
  TaxType,
  TechnicalConfidence,
  TechnicalViabilityResult,
  TaxRegime,
  TechnicianAvailabilityType,
  TechnologyOption,
  VisitRequestStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketQueue,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketTimelineEventType,
  TicketType,
  TaskExecutionMode,
  ExecutionOrderItemAction,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  GoodsReceiptStatus,
  InventoryDisposition,
  InventoryItemCategory,
  InventoryCategoryStatus,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryResponsibleType,
  InventoryTrackingMode,
  PartyStatus,
  PurchaseOrderStatus,
  PurchaseRequestLineSourceKind,
  PurchaseRequestLineStatus,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
  PurchaseRequestType,
  DocumentTypeParty,
  PartyContactType,
  PartyType,
  SerializedAssetStatus,
  SupplierProfileStatus,
  StockBalanceCondition,
  StockIssueStatus,
  StockIssueType,
  StockLocationStatus,
  StockLocationType,
  StockMovementOrigin,
  TaskOriginContext,
  TaskPriority,
  TaskRecipientType,
  TaskResponsibleType,
  TaskStatus,
  TaskTimelineEventType,
  TaskType,
  TransitionStatusPayload,
  UpdateSubscriberPayload,
  VatTreatment,
  WfmWorkType,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WorkOrderStatus,
  WriteOffReason,
  UserRole,
} from '@iwana/shared';
import { persistTenantSlug, resolveTenantSlug } from './tenant-resolution';

/**
 * Cliente HTTP para @iwana/portal - Portal de Suscriptores.
 * Requiere header X-Tenant-Slug para identificar el tenant.
 */

function resolveApiBase(): string {
  const configuredApiBase = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (configuredApiBase) {
    return configuredApiBase.replace(/\/$/, '');
  }

  // Mantener mismo origen evita conexiones directas a puertos locales no disponibles
  // y centraliza el proxy en los rewrites del portal.
  return '/api/v1';
}
const ACCESS_TOKEN_STORAGE_KEY = 'iwana.portal.access-token';

/**
 * Clave localStorage para el token de alcance limitado emitido cuando un rol critico
 * (ADMIN, NOC, ACCOUNTANT) no tiene MFA configurado.
 * Solo existe durante el flujo de MFA setup. Se elimina al activar MFA.
 * HLD-MOD02-ARQUITECTURA-v1.0 ?6.3 (DA-MOD02-01)
 */
const MFA_SETUP_TOKEN_STORAGE_KEY = 'iwana.portal.mfa-setup-token';

interface PendingTenantMfaLogin {
  email: string;
  password: string;
  tenantSlug: string;
}

let pendingTenantMfaLogin: PendingTenantMfaLogin | null = null;
let refreshAccessTokenPromise: Promise<string> | null = null;
let terminalSessionError: ApiError | null = null;

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
 * Retorna null si el token es inv?lido o est? expirado.
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
 * Verifica si el access token almacenado tiene payload v?lido y no est? expirado.
 * Usa un margen de 30 segundos para anticipar expiraci?n inminente.
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
  if (token) {
    terminalSessionError = null;
  }

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
  actor?: AuditActorInfo | null;
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

export interface AuditActorInfo {
  id: string | null;
  type: 'tenant' | 'platform' | 'system' | 'unknown';
  displayName: string;
  role?: string;
  status?: string;
  isDeleted?: boolean;
}

export interface AuditLogQueryParams {
  cursor?: string;
  limit?: number;
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  fromDate?: string;
  toDate?: string;
}

export interface AuditLogListResponse {
  data: AuditLogEntry[];
  meta: {
    nextCursor: string | null;
    total: number;
  };
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
    'Falta la empresa. Ingresa el identificador de la empresa en el inicio de sesi?n o usa la configuraci?n global definida por tu equipo.',
  );
}

async function refreshAccessToken(tenantSlug: string): Promise<string> {
  if (terminalSessionError) {
    throw terminalSessionError;
  }

  if (refreshAccessTokenPromise) {
    return refreshAccessTokenPromise;
  }

  refreshAccessTokenPromise = (async () => {
    const res = await fetch(`${resolveApiBase()}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Slug': tenantSlug,
      },
      credentials: 'include',
    });

    if (!res.ok) {
      persistAccessToken('');
      terminalSessionError = new ApiError(
        401,
        'SESSION_EXPIRED',
        'La sesi?n expir?. Inicia sesi?n de nuevo.',
      );
      throw terminalSessionError;
    }

    const body = (await res.json()) as ApiEnvelope<{ accessToken: string }>;
    persistAccessToken(body.data.accessToken);
    return body.data.accessToken;
  })();

  try {
    return await refreshAccessTokenPromise;
  } finally {
    refreshAccessTokenPromise = null;
  }
}

async function request<T>(
  path: string,
  options?: RequestOptions,
  tenantSlugOverride?: string,
): Promise<T> {
  const resolvedTenantSlug = getTenantSlug(tenantSlugOverride);
  const token = readStoredAccessToken();

  if (terminalSessionError && !options?.skipAuth && !options?.skipRefreshRetry) {
    throw terminalSessionError;
  }

  const headers = new Headers(options?.headers);
  const isFormDataBody = typeof FormData !== 'undefined' && options?.body instanceof FormData;

  if (!headers.has('Content-Type') && options?.body !== undefined && !isFormDataBody) {
    headers.set('Content-Type', 'application/json');
  }

  headers.set('X-Tenant-Slug', resolvedTenantSlug);

  if (!options?.skipAuth && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const apiBase = resolveApiBase();

  const res = await fetch(`${apiBase}${path}`, {
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
   * Reenv?a el correo de verificacion de email.
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
   * HLD-MOD02-ARQUITECTURA-v1.0 ?3.1 (Paso 4)
   */
  mfaSetup: async (tenantSlug?: string) => {
    const mfaSetupToken = readMfaSetupToken();
    if (!mfaSetupToken) {
      throw new ApiError(
        401,
        'MFA_SETUP_TOKEN_MISSING',
        'No hay token de configuraci?n MFA. Inicia sesi?n de nuevo.',
      );
    }

    const resolvedTenantSlug = getTenantSlug(tenantSlug);
    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-Tenant-Slug': resolvedTenantSlug,
      Authorization: `Bearer ${mfaSetupToken}`,
    });

    const apiBase = resolveApiBase();

    const res = await fetch(`${apiBase}/auth/mfa/setup`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, string>;
      throw new ApiError(
        res.status,
        body['code'] ?? 'UNKNOWN',
        body['message'] ?? 'Error al iniciar configuraci?n MFA',
      );
    }

    const body = (await res.json()) as { data: { qrCodeBase64: string; otpauthUri: string } };
    return body.data;
  },

  /**
   * Verifica el primer codigo TOTP para activar MFA.
   * Usa el token de alcance limitado almacenado durante el flujo de setup.
   * Tras activacion exitosa, el frontend debe llamar clearMfaSetupToken().
   * HLD-MOD02-ARQUITECTURA-v1.0 ?3.1 (Paso 4)
   */
  mfaVerifySetup: async (totpCode: string, tenantSlug?: string) => {
    const mfaSetupToken = readMfaSetupToken();
    if (!mfaSetupToken) {
      throw new ApiError(
        401,
        'MFA_SETUP_TOKEN_MISSING',
        'No hay token de configuraci?n MFA. Inicia sesi?n de nuevo.',
      );
    }

    const resolvedTenantSlug = getTenantSlug(tenantSlug);
    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-Tenant-Slug': resolvedTenantSlug,
      Authorization: `Bearer ${mfaSetupToken}`,
    });

    const apiBase = resolveApiBase();

    const res = await fetch(`${apiBase}/auth/mfa/verify`, {
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
        body['message'] ?? 'Error al verificar c?digo MFA',
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

function buildAuditLogSearchParams(params?: AuditLogQueryParams): string {
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
  if (params?.entityId) {
    searchParams.set('entityId', params.entityId);
  }
  if (params?.userId) {
    searchParams.set('userId', params.userId);
  }
  if (params?.action) {
    searchParams.set('action', params.action);
  }
  if (params?.fromDate) {
    searchParams.set('fromDate', params.fromDate);
  }
  if (params?.toDate) {
    searchParams.set('toDate', params.toDate);
  }

  return searchParams.toString();
}

export const auditApi = {
  list: (params?: AuditLogQueryParams, tenantSlug?: string) => {
    const query = buildAuditLogSearchParams(params);
    return request<AuditLogEntry[]>(
      `/audit-logs${query ? `?${query}` : ''}`,
      undefined,
      tenantSlug,
    );
  },

  listPage: (params?: AuditLogQueryParams, tenantSlug?: string) => {
    const query = buildAuditLogSearchParams(params);
    return request<AuditLogListResponse>(
      `/audit-logs${query ? `?${query}` : ''}`,
      { returnFullResponse: true },
      tenantSlug,
    );
  },
};

// ?????????????????????????????????????????????????????????????????????????????
// CONTRATOS SELF-SERVICE DEL TENANT AUTENTICADO
// Endpoints exclusivos del portal empresarial ? nunca usar tenants/:id desde portal.
// HLD-MOD02-DASHBOARD-EMPRESA-v1.0 ?3.2
// ?????????????????????????????????????????????????????????????????????????????

/** Estado del tenant ? alineado con TenantStatus del backend */
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

/** Configuraci?n operativa del tenant autenticado */
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

// ?? Compatibilidad ????????????????????????????????????????????????????????????

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

// ?? Tributarias legacy (tipos de compatibilidad) ??????????????????????????????

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

// ?? Cat?logo tributario MOD07 ????????????????????????????????????????????
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

// ?? Aplicaciones tributarias (tabla puente) ??????????????????????????????
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

// ?? Simulador tributario ?????????????????????????????????????????????????
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

/** M?tricas iniciales del dashboard ? los campos opcionales son null si la fuente no existe */
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
 * IMPORTANTE: estos m?todos consumen contratos propios del tenant autenticado.
 * Nunca usan /tenants/:id ? ese contrato es de administraci?n de plataforma.
 */
export const tenantSelfApi = {
  /** Retorna los datos base del tenant autenticado. */
  getMe: (tenantSlug?: string) => request<TenantSelf>('/tenants/me', undefined, tenantSlug),

  /** Alias sem?ntico para la lectura del perfil empresarial del tenant autenticado. */
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

  /** Retorna la configuraci?n operativa del tenant autenticado. */
  getMeSettings: (tenantSlug?: string) =>
    request<TenantSelfSettings>('/tenants/me/settings', undefined, tenantSlug),

  /** Alias sem?ntico para la configuraci?n operativa self-service. */
  getSettings: (tenantSlug?: string) =>
    request<TenantSelfSettings>('/tenants/me/settings', undefined, tenantSlug),

  /** Actualiza la configuraci?n operativa del tenant autenticado (solo ADMIN). */
  updateMeSettings: (dto: UpdateTenantSelfSettingsDto, tenantSlug?: string) =>
    request<TenantSelfSettings>(
      '/tenants/me/settings',
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Alias sem?ntico para la mutaci?n de settings self-service. */
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
 * Expone exclusivamente cat?logo comercial; no mezclar con self-service del tenant.
 */
export const commercialApi = {
  /** Lista el cat?logo de planes del tenant autenticado. */
  getPlans: async (tenantSlug?: string) => {
    const response = await request<CommercialCatalogListResponse<CommercialCatalogItemPayload>>(
      '/commercial/catalog?type=PLAN',
      { returnFullResponse: true },
      tenantSlug,
    );

    return response.data.map(mapCommercialPlan);
  },

  /** Crea un plan en el cat?logo del tenant autenticado. */
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

  /** Actualiza un plan del cat?logo del tenant autenticado. */
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

    // Solo enviar PATCH si hay al menos un campo de cat?logo que cambiar; evita 500 por body vac?o.
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
        // Idempotencia operativa: si el precio vigente ya es id?ntico, no bloqueamos la edici?n.
        if (
          error instanceof ApiError &&
          error.status === 409 &&
          /precio vigente id?ntico/i.test(error.message)
        ) {
          return commercialApi.getPlans(tenantSlug);
        }

        throw error;
      }
    }

    return commercialApi.getPlans(tenantSlug);
  },

  /** Elimina un plan del cat?logo del tenant autenticado. */
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

  /** Crea un producto adicional en el cat?logo del tenant autenticado. */
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

  /** Actualiza un producto adicional del cat?logo del tenant autenticado. */
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

  /** Elimina un producto adicional del cat?logo del tenant autenticado. */
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

  /** Crea un servicio adicional en el cat?logo del tenant autenticado. */
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

  /** Actualiza un servicio adicional del cat?logo del tenant autenticado. */
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
            /precio vigente id?ntico/i.test(error.message)
          ) {
            return commercialApi.getAdditionalServices(tenantSlug);
          }

          throw error;
        }
      }

      return commercialApi.getAdditionalServices(tenantSlug);
    }),

  /** Elimina un servicio adicional del cat?logo del tenant autenticado. */
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

  /** Retorna el detalle de un bundle con sus ?tems. */
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

  /** Calcula precio din?mico de un bundle por segmento para previsualizaci?n de oferta. */
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

  /** Crea una promoci?n y retorna la lista actualizada. */
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

  /** Desactiva una promoci?n y retorna la lista actualizada. */
  deactivatePromotion: (promotionId: string, tenantSlug?: string) =>
    request(`/commercial/promotions/${promotionId}`, { method: 'DELETE' }, tenantSlug).then(() =>
      commercialApi.getPromotions(tenantSlug),
    ),

  // ?? Compatibilidad ????????????????????????????????????????????????????????

  /** Lista reglas de compatibilidad del tenant (incluye REPLACES, REQUIRES, EXCLUDES). */
  getCompatibilityRules: (tenantSlug?: string) =>
    request<CompatibilityRule[]>('/commercial/compatibility-rules', undefined, tenantSlug),

  /** Crea regla de compatibilidad. Solo REPLACES est? en scope del dise?o inicial. */
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

  // ?? Tributarias (compatibilidad: GET listado de reglas para TaxApplicationRulesManager) ?

  /** Lista reglas tributarias del tenant. Usado por TaxApplicationRulesManager para selecci?n. */
  getTaxRules: (tenantSlug?: string) =>
    request<TaxRule[]>('/commercial/tax-rules', undefined, tenantSlug),

  // ?? Cat?logo MOD07 ???????????????????????????????????????????????????????

  /** Lista definiciones tributarias del cat?logo MOD07 (filtros opcionales). */
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

  /** Crea definici?n tributaria en el cat?logo MOD07. */
  createTaxDefinition: (dto: CreateTaxDefinitionDto, tenantSlug?: string) =>
    request<TaxDefinition>(
      '/taxation/definitions',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Actualiza definici?n tributaria. Presets SYSTEM son inmutables (403 del backend). */
  updateTaxDefinition: (id: string, dto: UpdateTaxDefinitionDto, tenantSlug?: string) =>
    request<TaxDefinition>(
      `/taxation/definitions/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Elimina (soft-delete) definici?n tributaria. Presets SYSTEM son inmutables (403 del backend). */
  deleteTaxDefinition: (id: string, tenantSlug?: string) =>
    request<void>(`/taxation/definitions/${id}`, { method: 'DELETE' }, tenantSlug),

  // ?? Aplicaciones tributarias ?????????????????????????????????????????????

  /** Lista aplicaciones tributarias (tabla puente reglas ? cat?logo). */
  listTaxRuleApplications: (tenantSlug?: string) =>
    request<TaxRuleApplication[]>('/commercial/tax-rule-applications', undefined, tenantSlug),

  /** Crea aplicaci?n tributaria (vincula regla con definici?n del cat?logo). */
  createTaxRuleApplication: (dto: CreateTaxRuleApplicationDto, tenantSlug?: string) =>
    request<TaxRuleApplication>(
      '/commercial/tax-rule-applications',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Actualiza aplicaci?n tributaria (tratamiento, tasa override, prioridad). */
  updateTaxRuleApplication: (id: string, dto: UpdateTaxRuleApplicationDto, tenantSlug?: string) =>
    request<TaxRuleApplication>(
      `/commercial/tax-rule-applications/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Elimina aplicaci?n tributaria. */
  deleteTaxRuleApplication: (id: string, tenantSlug?: string) =>
    request<void>(`/commercial/tax-rule-applications/${id}`, { method: 'DELETE' }, tenantSlug),

  // ?? Simulador ????????????????????????????????????????????????????????????

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
 * El summary agrega datos del tenant, m?tricas y alertas de onboarding.
 * Solo disponible para el rol ADMIN ? otros roles ven fallback controlado.
 */
export const dashboardApi = {
  /** Retorna el summary completo del dashboard (solo ADMIN). */
  getSummary: (tenantSlug?: string) =>
    request<DashboardSummary>('/tenants/me/summary', undefined, tenantSlug),
};

// ?????????????????????????????????????????????????????????????????????????????
// MOD10 / SERVICE ASSURANCE / MESA DE AYUDA
// ?????????????????????????????????????????????????????????????????????????????

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

// ?????????????????????????????????????????????????????????????????????????????
// WFM / PROGRAMACION OPERATIVA DEL TENANT
// ?????????????????????????????????????????????????????????????????????????????

export interface WfmScheduleEvent {
  id: string;
  tenantId: string;
  workOrderId: string | null;
  executionOrderId?: string | null;
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
  sector: string | null;
  latitude: string | null;
  longitude: string | null;
  expedienteId: string | null;
  subscriberId: string | null;
  organizationSiteId: string | null;
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
  sector?: string | null | undefined;
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
  sector?: string | null | undefined;
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

export interface MoveWfmEventToPendingDto {
  reason?: string | null | undefined;
}

export interface ListWfmScheduleEventsParams {
  from?: string | undefined;
  to?: string | undefined;
  assignedUserId?: string | undefined;
  expedienteId?: string | undefined;
  type?: WfmWorkType | undefined;
  status?: ScheduleEventStatus | undefined;
  municipality?: string | undefined;
  sector?: string | undefined;
}

export interface WfmScheduleRecommendationRequestDto {
  workType: WfmWorkType;
  durationMinutes: number;
  windowStartAt: string;
  windowEndAt: string;
  candidateUserIds: string[];
  municipality?: string | null | undefined;
  sector?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  maxResults?: number | undefined;
}

export interface WfmScheduleRecommendationScoreBreakdown {
  distance: number;
  municipality: number;
  sector: number;
  routeContinuity: number;
  load: number;
  earliest: number;
}

export interface WfmScheduleRecommendation {
  technicianId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  score: number;
  labels: string[];
  scoreBreakdown: WfmScheduleRecommendationScoreBreakdown;
  distanceKm: number | null;
  nearestEventId: string | null;
  totalScheduledMinutes: number;
  eventCount: number;
}

export interface WfmVisitRequest {
  id: string;
  tenantId: string;
  status: VisitRequestStatus;
  originContext: WorkOrderSourceContext;
  originRef: string | null;
  originLabel: string | null;
  customerDisplayName?: string | null;
  workType: WfmWorkType;
  priority: WorkOrderPriority;
  title: string;
  description: string | null;
  requestedWindowStartAt: string | null;
  requestedWindowEndAt: string | null;
  slaDueAt: string | null;
  address: string | null;
  municipality: string | null;
  sector: string | null;
  latitude: number | null;
  longitude: number | null;
  organizationSiteId?: string | null;
  expedienteId: string | null;
  subscriberId: string | null;
  ticketId: string | null;
  contractId: string | null;
  scheduleEventId: string | null;
  workOrderId: string | null;
  executionOrderId?: string | null;
  requestedByUserId: string;
  scheduledByUserId: string | null;
  scheduledAt: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  rejectReason?: string | undefined;
}

export interface ListWfmVisitRequestsParams {
  status?: VisitRequestStatus | undefined;
  originContext?: WorkOrderSourceContext | undefined;
  workType?: WfmWorkType | undefined;
  priority?: WorkOrderPriority | undefined;
  municipality?: string | undefined;
  sector?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface ListWfmVisitRequestsResponse {
  items: WfmVisitRequest[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface WfmVisitRequestFilterOption {
  value: string;
  label: string;
  count: number;
  municipality?: string | undefined;
}

export interface WfmVisitRequestFilterOptionsResponse {
  municipalities: WfmVisitRequestFilterOption[];
  sectors: WfmVisitRequestFilterOption[];
}

export interface WfmVisitRequestFilterOptionsParams {
  municipality?: string | undefined;
  includeScheduled?: boolean | undefined;
}

export interface CreateWfmVisitRequestDto {
  originContext: WorkOrderSourceContext;
  originRef?: string | null | undefined;
  originLabel?: string | null | undefined;
  workType: WfmWorkType;
  priority?: WorkOrderPriority | undefined;
  title: string;
  description?: string | null | undefined;
  requestedWindowStartAt?: string | null | undefined;
  requestedWindowEndAt?: string | null | undefined;
  slaDueAt?: string | null | undefined;
  address?: string | null | undefined;
  municipality?: string | null | undefined;
  sector?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  organizationSiteId?: string | null | undefined;
  expedienteId?: string | null | undefined;
  subscriberId?: string | null | undefined;
  ticketId?: string | null | undefined;
  contractId?: string | null | undefined;
}

export interface UpdateWfmVisitRequestContextDto {
  description?: string | null | undefined;
  requestedWindowStartAt?: string | null | undefined;
  requestedWindowEndAt?: string | null | undefined;
  slaDueAt?: string | null | undefined;
  address?: string | null | undefined;
  municipality?: string | null | undefined;
  sector?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  organizationSiteId?: string | null | undefined;
  expedienteId?: string | null | undefined;
  subscriberId?: string | null | undefined;
  ticketId?: string | null | undefined;
  contractId?: string | null | undefined;
}

export interface RecommendWfmVisitRequestDto {
  durationMinutes: number;
  candidateUserIds: string[];
  windowStartAt?: string | undefined;
  windowEndAt?: string | undefined;
  searchHorizonDays?: number | undefined;
  organizationSiteId?: string | null | undefined;
  municipality?: string | null | undefined;
  sector?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  maxResults?: number | undefined;
}

export interface ScheduleWfmVisitRequestDto {
  assignedUserId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  organizationSiteId?: string | null | undefined;
  createWorkOrder?: boolean | undefined;
  workOrderSummary?: string | undefined;
  workOrderNotes?: string | null | undefined;
}

export interface WfmBusinessHoursDay {
  weekday: BusinessHoursWeekday;
  startTime: string | null;
  endTime: string | null;
  isEnabled: boolean;
}

export interface WfmHolidayBlackout {
  id: string;
  tenantId: string;
  organizationSiteId: string | null;
  blackoutDate: string;
  isRecurring: boolean;
  name: string;
  description: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWfmHolidayBlackoutDto {
  organizationSiteId?: string | null | undefined;
  blackoutDate: string;
  isRecurring?: boolean | undefined;
  name: string;
  description?: string | null | undefined;
  isEnabled?: boolean | undefined;
}

export interface UpdateWfmHolidayBlackoutDto {
  organizationSiteId?: string | null | undefined;
  blackoutDate?: string | undefined;
  isRecurring?: boolean | undefined;
  name?: string | undefined;
  description?: string | null | undefined;
  isEnabled?: boolean | undefined;
}

function mapOrganizationHoursDayToWfm(
  day: OrganizationCompanyBusinessHoursDay | OrganizationSiteBusinessHourSnapshot,
): WfmBusinessHoursDay {
  return {
    weekday: day.weekday,
    startTime: day.opensAt,
    endTime: day.closesAt,
    isEnabled: day.isOpen,
  };
}

function mapWfmHoursDayToOrganization(
  day: WfmBusinessHoursDay,
): OrganizationCompanyBusinessHoursDay {
  return {
    weekday: day.weekday,
    isOpen: day.isEnabled,
    opensAt: day.isEnabled ? day.startTime : null,
    closesAt: day.isEnabled ? day.endTime : null,
  };
}

function mapOrganizationExceptionToWfmBlackout(
  exception: OrganizationBusinessHoursExceptionSnapshot,
): WfmHolidayBlackout {
  return {
    id: exception.id,
    tenantId: '',
    organizationSiteId: exception.organizationSiteId,
    blackoutDate: exception.exceptionDate,
    isRecurring: exception.isRecurring,
    name: exception.name,
    description: exception.description,
    isEnabled: !exception.isOpen,
    createdAt: exception.createdAt,
    updatedAt: exception.createdAt,
  };
}

export type OperationalEventualityType =
  | 'extra_availability'
  | 'operational_block'
  | 'early_entry'
  | 'extended_shift'
  | 'emergency_response';

export type OperationalEventualityStatus = 'pending' | 'confirmed' | 'cancelled';

export interface OperationalEventuality {
  id: string;
  tenantId: string;
  userId: string;
  organizationSiteId: string | null;
  type: OperationalEventualityType;
  status: OperationalEventualityStatus;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  origin: string | null;
  requiresHrReview: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOperationalEventualityDto {
  userId: string;
  organizationSiteId?: string | null;
  type: OperationalEventualityType;
  startsAt: string;
  endsAt: string;
  reason?: string | null;
  origin?: string | null;
  requiresHrReview?: boolean;
}

export interface UpdateOperationalEventualityStatusDto {
  status: OperationalEventualityStatus;
}

export type WfmOperatingWindowSource =
  | 'HOLIDAY_BLACKOUT'
  | 'SITE_HOURS'
  | 'COMPANY_HOURS'
  | 'MISSING_CONFIGURATION';

export interface WfmOperatingWindowResult {
  status: 'OPEN' | 'CLOSED';
  source: WfmOperatingWindowSource;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

export interface ResolveWfmOperatingWindowDto {
  dateLocal: string;
  organizationSiteId?: string | null | undefined;
  technicianId?: string | null | undefined;
}

export interface CancelWfmVisitRequestDto {
  cancelReason: string;
}

export interface RejectWfmVisitRequestDto {
  rejectReason: string;
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

export interface WfmPendingInboxSummary {
  totalOpen: number;
  readyToScheduleCount: number;
  needsContextCount: number;
  overdueSlaCount: number;
  highPriorityOpenCount: number;
}

export interface WfmDashboardSummary {
  todayCount: number;
  overdueCount: number;
  upcomingCount: number;
  activeCount: number;
  enRouteCount: number;
  atRiskCount: number;
  pendingInbox: WfmPendingInboxSummary;
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
  operatingWindow: {
    resolve: (dto: ResolveWfmOperatingWindowDto, tenantSlug?: string) =>
      request<WfmOperatingWindowResult>(
        '/wfm/operating-window/resolve',
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),
  },

  dispatchSites: {
    list: (tenantSlug?: string) =>
      request<WfmDispatchSite[]>('/wfm/dispatch-sites', { returnFullResponse: true }, tenantSlug),

    getBusinessHours: (siteId: string, tenantSlug?: string) =>
      request<OrganizationSiteDetail>(
        `/organization/sites/${siteId}`,
        { returnFullResponse: true },
        tenantSlug,
      ).then((site) => site.businessHoursResolved.map((day) => mapOrganizationHoursDayToWfm(day))),

    updateBusinessHours: (
      siteId: string,
      dto: { days: WfmBusinessHoursDay[] },
      tenantSlug?: string,
    ) =>
      request<OrganizationSiteDetail>(
        `/organization/sites/${siteId}/business-hours`,
        {
          method: 'PUT',
          body: JSON.stringify({
            businessHours: dto.days.map((day) => mapWfmHoursDayToOrganization(day)),
          }),
          returnFullResponse: true,
        },
        tenantSlug,
      ).then((site) => site.businessHoursResolved.map((day) => mapOrganizationHoursDayToWfm(day))),
  },

  businessHours: {
    getCompany: (tenantSlug?: string) =>
      request<OrganizationCompanyBusinessHoursDay[]>(
        '/organization/business-hours/company',
        { returnFullResponse: true },
        tenantSlug,
      ).then((days) => days.map((day) => mapOrganizationHoursDayToWfm(day))),

    updateCompany: (dto: { days: WfmBusinessHoursDay[] }, tenantSlug?: string) =>
      request<OrganizationCompanyBusinessHoursDay[]>(
        '/organization/business-hours/company',
        {
          method: 'PUT',
          body: JSON.stringify({
            businessHours: dto.days.map((day) => mapWfmHoursDayToOrganization(day)),
          }),
          returnFullResponse: true,
        },
        tenantSlug,
      ).then((days) => days.map((day) => mapOrganizationHoursDayToWfm(day))),
  },

  holidayBlackouts: {
    list: (tenantSlug?: string) =>
      request<OrganizationBusinessHoursExceptionSnapshot[]>(
        '/organization/business-hours/exceptions',
        { returnFullResponse: true },
        tenantSlug,
      ).then((exceptions) =>
        exceptions
          .filter((exception) => !exception.isOpen)
          .map((exception) => mapOrganizationExceptionToWfmBlackout(exception)),
      ),

    create: (dto: CreateWfmHolidayBlackoutDto, tenantSlug?: string) =>
      request<OrganizationBusinessHoursExceptionSnapshot>(
        '/organization/business-hours/exceptions',
        {
          method: 'POST',
          body: JSON.stringify({
            organizationSiteId: dto.organizationSiteId,
            exceptionDate: dto.blackoutDate,
            isRecurring: dto.isRecurring,
            isOpen: !(dto.isEnabled ?? true),
            opensAt: null,
            closesAt: null,
            name: dto.name,
            description: dto.description,
          }),
          returnFullResponse: true,
        },
        tenantSlug,
      ).then((exception) => mapOrganizationExceptionToWfmBlackout(exception)),

    update: (id: string, dto: UpdateWfmHolidayBlackoutDto, tenantSlug?: string) =>
      request<OrganizationBusinessHoursExceptionSnapshot>(
        `/organization/business-hours/exceptions/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            organizationSiteId: dto.organizationSiteId,
            exceptionDate: dto.blackoutDate,
            isRecurring: dto.isRecurring,
            isOpen: dto.isEnabled === undefined ? undefined : !dto.isEnabled,
            opensAt: null,
            closesAt: null,
            name: dto.name,
            description: dto.description,
          }),
          returnFullResponse: true,
        },
        tenantSlug,
      ).then((exception) => mapOrganizationExceptionToWfmBlackout(exception)),

    remove: (id: string, tenantSlug?: string) =>
      request<void>(
        `/organization/business-hours/exceptions/${id}`,
        { method: 'DELETE' },
        tenantSlug,
      ),
  },

  eligibleAssignees: {
    list: (tenantSlug?: string) =>
      request<InternalUser[]>('/wfm/eligible-assignees', { returnFullResponse: true }, tenantSlug),
  },

  visitRequests: {
    list: (params?: ListWfmVisitRequestsParams, tenantSlug?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set('status', params.status);
      if (params?.originContext) searchParams.set('originContext', params.originContext);
      if (params?.workType) searchParams.set('workType', params.workType);
      if (params?.priority) searchParams.set('priority', params.priority);
      if (params?.municipality) searchParams.set('municipality', params.municipality);
      if (params?.sector) searchParams.set('sector', params.sector);
      if (params?.from) searchParams.set('from', params.from);
      if (params?.to) searchParams.set('to', params.to);
      if (params?.page !== undefined) searchParams.set('page', String(params.page));
      if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));

      const query = searchParams.toString();
      return request<ListWfmVisitRequestsResponse>(
        `/wfm/visit-requests${query ? `?${query}` : ''}`,
        { returnFullResponse: true },
        tenantSlug,
      );
    },

    filterOptions: (params?: WfmVisitRequestFilterOptionsParams, tenantSlug?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.municipality) searchParams.set('municipality', params.municipality);
      if (params?.includeScheduled !== undefined) {
        searchParams.set('includeScheduled', String(params.includeScheduled));
      }

      const query = searchParams.toString();
      return request<WfmVisitRequestFilterOptionsResponse>(
        `/wfm/visit-requests/filter-options${query ? `?${query}` : ''}`,
        { returnFullResponse: true },
        tenantSlug,
      );
    },

    get: (id: string, tenantSlug?: string) =>
      request<WfmVisitRequest>(
        `/wfm/visit-requests/${id}`,
        { returnFullResponse: true },
        tenantSlug,
      ),

    create: (dto: CreateWfmVisitRequestDto, tenantSlug?: string) =>
      request<WfmVisitRequest>(
        '/wfm/visit-requests',
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    updateContext: (id: string, dto: UpdateWfmVisitRequestContextDto, tenantSlug?: string) =>
      request<WfmVisitRequest>(
        `/wfm/visit-requests/${id}/context`,
        { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    recommend: (id: string, dto: RecommendWfmVisitRequestDto, tenantSlug?: string) =>
      request<WfmScheduleRecommendation[]>(
        `/wfm/visit-requests/${id}/schedule-recommendations`,
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    schedule: (id: string, dto: ScheduleWfmVisitRequestDto, tenantSlug?: string) =>
      request<WfmVisitRequest>(
        `/wfm/visit-requests/${id}/schedule`,
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    cancel: (id: string, dto: CancelWfmVisitRequestDto, tenantSlug?: string) =>
      request<WfmVisitRequest>(
        `/wfm/visit-requests/${id}/cancel`,
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    reject: (id: string, dto: RejectWfmVisitRequestDto, tenantSlug?: string) =>
      request<WfmVisitRequest>(
        `/wfm/visit-requests/${id}/reject`,
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),
  },

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
      if (params?.sector) searchParams.set('sector', params.sector);

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

    moveToPending: (id: string, dto?: MoveWfmEventToPendingDto, tenantSlug?: string) =>
      request<WfmVisitRequest>(
        `/wfm/events/${id}/move-to-pending`,
        { method: 'POST', body: JSON.stringify(dto ?? {}), returnFullResponse: true },
        tenantSlug,
      ),

    remove: (id: string, tenantSlug?: string) =>
      request<void>(`/wfm/events/${id}`, { method: 'DELETE' }, tenantSlug),
  },

  recommendations: {
    create: (dto: WfmScheduleRecommendationRequestDto, tenantSlug?: string) =>
      request<WfmScheduleRecommendation[]>(
        '/wfm/schedule-recommendations',
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),
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

  operationalEventualities: {
    list: (filters?: { userId?: string; organizationSiteId?: string }, tenantSlug?: string) => {
      const searchParams = new URLSearchParams();
      if (filters?.userId) searchParams.set('userId', filters.userId);
      if (filters?.organizationSiteId)
        searchParams.set('organizationSiteId', filters.organizationSiteId);
      const query = searchParams.toString();
      return request<OperationalEventuality[]>(
        `/wfm/operational-eventualities${query ? `?${query}` : ''}`,
        { returnFullResponse: true },
        tenantSlug,
      );
    },

    create: (dto: CreateOperationalEventualityDto, tenantSlug?: string) =>
      request<OperationalEventuality>(
        '/wfm/operational-eventualities',
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    updateStatus: (id: string, dto: UpdateOperationalEventualityStatusDto, tenantSlug?: string) =>
      request<OperationalEventuality>(
        `/wfm/operational-eventualities/${id}/status`,
        { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    delete: (id: string, tenantSlug?: string) =>
      request<void>(
        `/wfm/operational-eventualities/${id}`,
        { method: 'DELETE', returnFullResponse: true },
        tenantSlug,
      ),
  },
};

// ?????????????????????????????????????????????????????????????????????????????
// GESTION DE USUARIOS INTERNOS DEL TENANT
// ?????????????????????????????????????????????????????????????????????????????

export interface InternalUser {
  id: string;
  email: string;
  role: string;
  status: string;
  tenantId: string;
  mfaEnabled: boolean;
  mfaRequired: boolean;
  isOperationalResource: boolean;
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
    description: 'Promociones, bundles, reglas y cat?logo comercial',
    keywords: ['comercial', 'ofertas', 'promociones', 'bundles', 'catalogo'],
    route: '/dashboard/commercial',
  },
  {
    id: 'crm',
    title: 'CRM',
    description: 'Pipeline y oportunidades comerciales de la empresa',
    keywords: ['crm', 'oportunidades', 'pipeline', 'expedientes'],
    route: '/dashboard/crm/expedientes',
  },
  {
    id: 'subscribers',
    title: 'Suscriptores',
    description: 'Gesti?n comercial y postventa de suscriptores',
    keywords: ['suscriptores', 'clientes', 'postventa', 'subscriber'],
    route: '/dashboard/crm/subscribers',
  },
  {
    id: 'scheduling',
    title: 'Programacion',
    description: 'Agenda operativa, eventos t?cnicos y work orders del tenant',
    keywords: ['programacion', 'agenda', 'wfm', 'ordenes de trabajo', 'tecnicos'],
    route: '/dashboard/scheduling',
  },
  {
    id: 'operations',
    title: 'Operaciones',
    description: 'Tareas operativas transversales con responsable y destinatario',
    keywords: ['operaciones', 'tareas', 'ejecucion', 'tasks', 'handoff'],
    route: '/dashboard/operations',
  },
  {
    id: 'settings',
    title: 'Configuraci?n',
    description: 'Branding, par?metros operativos y ajustes del tenant',
    keywords: ['configuracion', 'branding', 'ajustes', 'parametros'],
    route: '/dashboard/settings',
  },
  {
    id: 'users',
    title: 'Usuarios',
    description: 'Gesti?n de accesos internos de la empresa',
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

  return parts.join(' ? ') || 'Registro comercial del suscriptor';
}

function formatPortalExpedienteSubtitle(expediente: ExpedienteRecord): string {
  const parts = [
    expediente.municipality,
    expediente.emailPrimary,
    expediente.documentNumber,
    expediente.source,
  ].filter((value): value is string => Boolean(value?.trim()));

  return parts.join(' ? ') || 'Oportunidad comercial';
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
    label: 'M?dulos',
    total: matches.length,
    items: matches.slice(0, limit).map((item) => ({
      id: item.id,
      type: 'module',
      title: item.title,
      subtitle: item.description,
      meta: 'Navegaci?n',
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
        .join(' ? '),
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
  isOperationalResource?: boolean;
}

export interface BulkCreateUsersApiResponse {
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
  succeeded: Array<{
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    temporaryPassword: string;
    createdAt: string;
  }>;
  failed: Array<{
    rowIndex: number;
    email: string;
    reason: string;
  }>;
}

export interface OrganizationSiteSummary {
  id: string;
  name: string;
  code: string;
  siteType: OrganizationSiteType;
  address: string | null;
  municipality: string | null;
  department: string | null;
  capabilities: OrganizationSiteCapability[];
  isActive: boolean;
}

export interface WfmDispatchSite extends OrganizationSiteSummary {}

export interface OrganizationSiteBusinessHourSnapshot {
  weekday: BusinessHoursWeekday;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export interface OrganizationSiteAssignmentSnapshot {
  userId: string;
  assignmentType: OrganizationSiteAssignmentType;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
}

export interface OrganizationSiteResponsibilitySnapshot {
  userId: string;
  responsibility: OrganizationSiteResponsibility;
  validFrom: string;
  validTo: string | null;
}

export interface OrganizationCompanyBusinessHoursDay {
  weekday: BusinessHoursWeekday;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export interface OrganizationBusinessHoursExceptionSnapshot {
  id: string;
  organizationSiteId: string | null;
  exceptionDate: string;
  isRecurring: boolean;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface OrganizationSiteDetail extends OrganizationSiteSummary {
  siteType: OrganizationSiteType;
  address: string | null;
  municipality: string | null;
  department: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  contactName: string | null;
  contactPhone: string | null;
  isPrimary: boolean;
  businessHoursMode: 'BASE' | 'OVERRIDE';
  businessHours: OrganizationSiteBusinessHourSnapshot[];
  businessHoursResolved: OrganizationSiteBusinessHourSnapshot[];
  assignments: OrganizationSiteAssignmentSnapshot[];
  responsibilities: OrganizationSiteResponsibilitySnapshot[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrganizationSiteDto {
  name: string;
  code: string;
  siteType: OrganizationSiteType;
  capabilities?: OrganizationSiteCapability[];
  address?: string | null;
  municipality?: string | null;
  department?: string | null;
  country?: string;
  latitude: number | null;
  longitude: number | null;
  contactName: string;
  contactPhone: string;
  isPrimary?: boolean;
  isActive?: boolean;
}

export interface UpdateOrganizationSiteDto extends Partial<CreateOrganizationSiteDto> {}

export interface ReplaceSiteBusinessHoursDto {
  businessHours: OrganizationSiteBusinessHourSnapshot[];
}

export interface ReplaceSiteAssignmentsDto {
  assignments: OrganizationSiteAssignmentSnapshot[];
}

export interface ReplaceSiteResponsibilitiesDto {
  responsibilities: OrganizationSiteResponsibilitySnapshot[];
}

export interface AccessPermissionCatalogEntry {
  id: string;
  tenantId: string;
  permissionKey: AccessPermissionKey;
  moduleKey: string;
  action: string;
  description: string;
  catalogVersion: AccessPermissionCatalogVersion;
  availability: AccessPermissionAvailability;
  isSystem: boolean;
  isActive: boolean;
}

export interface AccessPermissionsCatalog {
  version: AccessPermissionCatalogVersion;
  permissions: AccessPermissionCatalogEntry[];
  compatibilityMatrix: Record<UserRole, AccessPermissionKey[]>;
}

export interface AccessProfileView {
  id: string;
  name: string;
  description: string | null;
  baseRoleConstraint: UserRole | null;
  scopeSiteId: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: AccessPermissionKey[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccessProfileDto {
  name: string;
  description?: string | null;
  baseRoleConstraint: UserRole;
  scopeSiteId?: string | null;
  permissionKeys?: AccessPermissionKey[];
}

export interface UpdateAccessProfileDto extends Partial<CreateAccessProfileDto> {
  isActive?: boolean;
}

export interface ReplaceProfilePermissionsDto {
  permissionKeys: AccessPermissionKey[];
}

export interface ReplaceUserProfilesDto {
  profileIds: string[];
}

export interface UserProfilesAssignment {
  userId: string;
  role: UserRole;
  profileIds: string[];
}

export interface EffectivePermissionSource {
  profileId: string;
  profileName: string;
  permissions: AccessPermissionKey[];
}

export interface EffectivePermissionsSummary {
  userId: string;
  role: UserRole;
  effectivePermissions: AccessPermissionKey[];
  recoveryPermissions: AccessPermissionKey[];
  profileSources: EffectivePermissionSource[];
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
  isOperationalResource?: boolean | undefined;
}

export interface SettingsSection {
  key: SettingsSectionKey;
  label: string;
  description: string;
  ownerModule: string;
  status: SettingsSectionStatus;
  route: string | null;
  requiredPermissions: AccessPermissionKey[];
}

export const configurationApi = {
  settingsSections: {
    list: (tenantSlug?: string) =>
      request<SettingsSection[]>('/configuration/settings-sections', undefined, tenantSlug),
  },
};

export const organizationApi = {
  list: (tenantSlug?: string) =>
    request<OrganizationSiteSummary[]>('/organization/sites', undefined, tenantSlug),

  get: (id: string, tenantSlug?: string) =>
    request<OrganizationSiteDetail>(`/organization/sites/${id}`, undefined, tenantSlug),

  delete: (id: string, tenantSlug?: string) =>
    request<void>(`/organization/sites/${id}`, { method: 'DELETE' }, tenantSlug),

  create: (dto: CreateOrganizationSiteDto, tenantSlug?: string) =>
    request<OrganizationSiteDetail>(
      '/organization/sites',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  update: (id: string, dto: UpdateOrganizationSiteDto, tenantSlug?: string) =>
    request<OrganizationSiteDetail>(
      `/organization/sites/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  replaceBusinessHours: (id: string, dto: ReplaceSiteBusinessHoursDto, tenantSlug?: string) =>
    request<OrganizationSiteDetail>(
      `/organization/sites/${id}/business-hours`,
      { method: 'PUT', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  replaceAssignments: (id: string, dto: ReplaceSiteAssignmentsDto, tenantSlug?: string) =>
    request<OrganizationSiteDetail>(
      `/organization/sites/${id}/assignments`,
      { method: 'PUT', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  replaceResponsibilities: (id: string, dto: ReplaceSiteResponsibilitiesDto, tenantSlug?: string) =>
    request<OrganizationSiteDetail>(
      `/organization/sites/${id}/responsibilities`,
      { method: 'PUT', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  clearSiteOverride: (siteId: string, tenantSlug?: string) =>
    request<OrganizationSiteDetail>(
      `/organization/sites/${siteId}/business-hours`,
      { method: 'DELETE' },
      tenantSlug,
    ),

  getCompanyHours: (tenantSlug?: string) =>
    request<OrganizationCompanyBusinessHoursDay[]>(
      '/organization/business-hours/company',
      undefined,
      tenantSlug,
    ),

  replaceCompanyHours: (
    dto: { businessHours: OrganizationCompanyBusinessHoursDay[] },
    tenantSlug?: string,
  ) =>
    request<OrganizationCompanyBusinessHoursDay[]>(
      '/organization/business-hours/company',
      { method: 'PUT', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  getExceptions: (siteId?: string, tenantSlug?: string) =>
    request<OrganizationBusinessHoursExceptionSnapshot[]>(
      `/organization/business-hours/exceptions${siteId ? `?siteId=${siteId}` : ''}`,
      undefined,
      tenantSlug,
    ),

  createException: (
    dto: {
      exceptionDate: string;
      name: string;
      isOpen: boolean;
      isRecurring?: boolean;
      opensAt?: string | null;
      closesAt?: string | null;
      organizationSiteId?: string | null;
      description?: string | null;
    },
    tenantSlug?: string,
  ) =>
    request<OrganizationBusinessHoursExceptionSnapshot>(
      '/organization/business-hours/exceptions',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  updateException: (
    id: string,
    dto: {
      organizationSiteId?: string | null;
      exceptionDate?: string;
      name?: string;
      isOpen?: boolean;
      isRecurring?: boolean;
      opensAt?: string | null;
      closesAt?: string | null;
      description?: string | null;
    },
    tenantSlug?: string,
  ) =>
    request<OrganizationBusinessHoursExceptionSnapshot>(
      `/organization/business-hours/exceptions/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  deleteException: (id: string, tenantSlug?: string) =>
    request<{ message: string }>(
      `/organization/business-hours/exceptions/${id}`,
      { method: 'DELETE' },
      tenantSlug,
    ),
};

export const accessControlApi = {
  listPermissions: (tenantSlug?: string) =>
    request<AccessPermissionsCatalog>('/access-control/permissions', undefined, tenantSlug),

  listProfiles: (tenantSlug?: string) =>
    request<AccessProfileView[]>('/access-control/profiles', undefined, tenantSlug),

  createProfile: (dto: CreateAccessProfileDto, tenantSlug?: string) =>
    request<AccessProfileView>(
      '/access-control/profiles',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  updateProfile: (id: string, dto: UpdateAccessProfileDto, tenantSlug?: string) =>
    request<AccessProfileView>(
      `/access-control/profiles/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  deleteProfile: (id: string, tenantSlug?: string) =>
    request<void>(`/access-control/profiles/${id}`, { method: 'DELETE' }, tenantSlug),

  replaceProfilePermissions: (id: string, dto: ReplaceProfilePermissionsDto, tenantSlug?: string) =>
    request<AccessProfileView>(
      `/access-control/profiles/${id}/permissions`,
      { method: 'PUT', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  replaceUserProfiles: (userId: string, dto: ReplaceUserProfilesDto, tenantSlug?: string) =>
    request<UserProfilesAssignment>(
      `/access-control/users/${userId}/profiles`,
      { method: 'PUT', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  getMyEffectivePermissions: (tenantSlug?: string) =>
    request<EffectivePermissionsSummary>(
      '/access-control/me/effective-permissions',
      undefined,
      tenantSlug,
    ),

  getEffectivePermissions: (userId: string, tenantSlug?: string) =>
    request<EffectivePermissionsSummary>(
      `/access-control/users/${userId}/effective-permissions`,
      undefined,
      tenantSlug,
    ),
};

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

  bulkCreate: (users: CreateInternalUserDto[], tenantSlug?: string) =>
    request<BulkCreateUsersApiResponse>(
      '/users/bulk',
      {
        method: 'POST',
        body: JSON.stringify({ users }),
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
   * El admin puede cambiar sin contrase?a propia; el self-service requiere currentPassword.
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

// ?????????????????????????????????????????????????????????????????????????????
// PERFIL DEL USUARIO AUTENTICADO
// Contratos para /users/:id consumidos por el portal empresarial.
// ?????????????????????????????????????????????????????????????????????????????

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

export type ExpedienteListView = 'open' | 'converted' | 'archive' | 'all';

export interface ExpedienteSubscriberSummary {
  id: string;
  status: 'LEAD' | 'PROSPECT' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  fullName: string;
}

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
  subscriberSummary?: ExpedienteSubscriberSummary | null;
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

// ?? Contratos / Servicios contratados ????????????????????????????????????????

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
    /** Inter?s comercial capturado en el expediente CRM */
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

// ?? Perfil tributario por suscriptor (Taxation MVP por cliente) ???????????????

/** Estado de una asignaci?n tributaria individual. */
export type TaxAssignmentStatus = 'SUGGESTED' | 'CONFIRMED' | 'MANUAL_ADJUSTMENT';

/** Origen de la tasa efectiva: del cat?logo o ingresada manualmente. */
export type TaxAssignmentRateSource = 'CATALOG' | 'MANUAL';

/** Tratamiento tributario efectivo de la asignaci?n. */
export type TaxTreatmentPortal = 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';

/** Estado del perfil tributario del suscriptor. */
export type TaxProfileStatus = 'PENDING_REVIEW' | 'CONFIGURED';

/** Snapshot de una asignaci?n tributaria individual. */
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

/** Payload para crear o actualizar una asignaci?n tributaria. */
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
  /** null si ya est? en el estado ?ptimo recomendado */
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
      view?: ExpedienteListView;
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
    if (filters?.view) searchParams.set('view', filters.view);
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

// ?? API: perfil tributario por suscriptor ?????????????????????????????????????
export const subscriberTaxApi = {
  /**
   * Obtiene el perfil tributario del suscriptor.
   * Si no existe, el backend lo crea y sugiere IVA por estrato autom?ticamente.
   * Usado por Suscriptor 360 y el flujo de configuraci?n de facturaci?n.
   */
  getProfile: (subscriberId: string, tenantSlug?: string) =>
    request<SubscriberTaxProfileSnapshot>(
      `/crm/subscribers/${subscriberId}/tax-profile`,
      undefined,
      tenantSlug,
    ),

  /**
   * Guarda (upsert) la lista completa de asignaciones tributarias.
   * El ?rea de facturaci?n usa este endpoint para confirmar o ajustar el checklist.
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
   * Actualiza una asignaci?n tributaria individual.
   * Permite confirmar o ajustar manualmente un tributo espec?fico.
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
   * Recalcula la sugerencia de IVA del suscriptor seg?n el estrato actual.
   * Solo actualiza asignaciones en estado SUGGESTED; no sobreescribe confirmadas.
   */
  suggestVat: (subscriberId: string, tenantSlug?: string) =>
    request<SubscriberTaxProfileSnapshot>(
      `/crm/subscribers/${subscriberId}/tax-profile/suggest-vat`,
      { method: 'POST' },
      tenantSlug,
    ),
};

// ?? API: contratos / servicios contratados ????????????????????????????????????

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

  /** Transiciona DRAFT ? ACTIVE. */
  activate: (id: string, tenantSlug?: string) =>
    request<Contract>(`/crm/contracts/${id}/activate`, { method: 'POST' }, tenantSlug),

  /** Transiciona ACTIVE ? SUSPENDED. */
  suspend: (id: string, tenantSlug?: string) =>
    request<Contract>(`/crm/contracts/${id}/suspend`, { method: 'POST' }, tenantSlug),

  /** Transiciona SUSPENDED ? ACTIVE. */
  reactivate: (id: string, tenantSlug?: string) =>
    request<Contract>(`/crm/contracts/${id}/reactivate`, { method: 'POST' }, tenantSlug),

  /** Transiciona ACTIVE|SUSPENDED ? TERMINATED. */
  terminate: (id: string, tenantSlug?: string) =>
    request<Contract>(`/crm/contracts/${id}/terminate`, { method: 'POST' }, tenantSlug),

  /** Transiciona TERMINATED|SUSPENDED ? ARCHIVED. */
  archive: (id: string, tenantSlug?: string) =>
    request<Contract>(`/crm/contracts/${id}/archive`, { method: 'POST' }, tenantSlug),
};

// ─── MOD11 — Ejecución Operativa / Tareas ────────────────────────────────────

export interface OperationalTaskRecord {
  id: string;
  tenantId: string;
  taskNumber: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  title: string;
  description: string | null;
  originContext: TaskOriginContext;
  originRefId: string | null;
  ticketId: string | null;
  responsibleType: TaskResponsibleType;
  responsibleRefId: string;
  recipientType: TaskRecipientType;
  recipientRefId: string | null;
  recipientLabel: string | null;
  queueName: string | null;
  executionMode: TaskExecutionMode;
  dueAt: string | null;
  scheduledRequired: boolean;
  scheduleEventId: string | null;
  workOrderId: string | null;
  createdByUserId: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListOperationalTasksParams {
  status?: TaskStatus;
  type?: TaskType;
  responsibleRefId?: string;
  ticketId?: string;
  page?: number;
  limit?: number;
}

export interface ListOperationalTasksResponse {
  data: OperationalTaskRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateOperationalTaskDto {
  type: TaskType;
  priority?: TaskPriority;
  title: string;
  description?: string | null;
  originContext: TaskOriginContext;
  originRefId?: string | null;
  ticketId?: string | null;
  responsibleType: TaskResponsibleType;
  responsibleRefId: string;
  recipientType: TaskRecipientType;
  recipientRefId?: string | null;
  recipientLabel?: string | null;
  queueName?: string | null;
  executionMode: TaskExecutionMode;
  dueAt?: string | null;
  scheduledRequired: boolean;
}

export interface AssignOperationalTaskDto {
  responsibleType: TaskResponsibleType;
  responsibleRefId: string;
  reason?: string | null;
}

export interface UpdateOperationalTaskDto {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  recipientType?: TaskRecipientType;
  recipientRefId?: string | null;
  recipientLabel?: string | null;
  queueName?: string | null;
  dueAt?: string | null;
  scheduledRequired?: boolean;
}

export interface TransitionOperationalTaskDto {
  status: TaskStatus;
  notes?: string | null;
}

export interface LinkTaskScheduleEventDto {
  scheduleEventId: string;
}

export interface LinkTaskWorkOrderDto {
  workOrderId: string;
}

export interface OperationalTaskTimelineEvent {
  id: string;
  taskId: string;
  tenantId: string;
  eventType: TaskTimelineEventType;
  payload: Record<string, unknown>;
  actorUserId: string | null;
  occurredAt: string;
}

export interface OperationalTaskAssignmentHistoryRecord {
  id: string;
  tenantId: string;
  taskId: string;
  previousResponsibleType: TaskResponsibleType;
  previousResponsibleRefId: string;
  newResponsibleType: TaskResponsibleType;
  newResponsibleRefId: string;
  reason: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export interface ExecutionOrderRecord {
  id: string;
  tenantId: string;
  executionOrderNumber: string;
  visitRequestId: string | null;
  scheduleEventId: string;
  assignedTechnicianId: string | null;
  assignedCrewId: string | null;
  originContext: string;
  originRefId: string | null;
  customerDisplayLabel: string;
  serviceAddress: string | null;
  municipality: string | null;
  sector: string | null;
  workType: WfmWorkType;
  workSummary: string;
  workInstructions: string | null;
  plannedWindowStartAt: string;
  plannedWindowEndAt: string;
  status: ExecutionOrderStatus;
  result: ExecutionOrderResult | null;
  startedAt: string | null;
  closedAt: string | null;
  closeNotes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionOrderActivityRecord {
  id: string;
  executionOrderId: string;
  tenantId: string;
  activityType: string;
  description: string;
  actorUserId: string | null;
  createdAt: string;
}

export interface ExecutionOrderItemUsageRecord {
  id: string;
  executionOrderId: string;
  tenantId: string;
  itemId: string;
  technicianCustodyId: string;
  quantity: string;
  serialNumber: string | null;
  action: ExecutionOrderItemAction;
  finalDisposition: InventoryDisposition;
  stockMovementId: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export interface StartExecutionOrderDto {
  notes?: string | null;
}

export interface RegisterExecutionOrderFieldWorkDto {
  activityType: string;
  description: string;
}

export interface RegisterExecutionOrderItemUsageDto {
  itemId: string;
  technicianCustodyId: string;
  quantity?: number;
  serialNumber?: string | null;
  action: ExecutionOrderItemAction;
  finalDisposition: InventoryDisposition;
  stockMovementId?: string | null;
}

export interface CloseExecutionOrderDto {
  result: ExecutionOrderResult;
  closeNotes?: string | null;
  customerSignatureRef?: string | null;
}

export const tasksApi = {
  list: (params?: ListOperationalTasksParams, tenantSlug?: string) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.type) searchParams.set('type', params.type);
    if (params?.responsibleRefId) searchParams.set('responsibleRefId', params.responsibleRefId);
    if (params?.ticketId) searchParams.set('ticketId', params.ticketId);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const query = searchParams.toString();
    return request<ListOperationalTasksResponse>(
      `/tasks${query ? `?${query}` : ''}`,
      { returnFullResponse: true },
      tenantSlug,
    );
  },

  get: (id: string, tenantSlug?: string) =>
    request<OperationalTaskRecord>(`/tasks/${id}`, { returnFullResponse: true }, tenantSlug),

  create: (dto: CreateOperationalTaskDto, tenantSlug?: string) =>
    request<OperationalTaskRecord>(
      '/tasks',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  assign: (id: string, dto: AssignOperationalTaskDto, tenantSlug?: string) =>
    request<OperationalTaskRecord>(
      `/tasks/${id}/assign`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  update: (id: string, dto: UpdateOperationalTaskDto, tenantSlug?: string) =>
    request<OperationalTaskRecord>(
      `/tasks/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  transition: (id: string, dto: TransitionOperationalTaskDto, tenantSlug?: string) =>
    request<OperationalTaskRecord>(
      `/tasks/${id}/transition`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  linkScheduleEvent: (id: string, dto: LinkTaskScheduleEventDto, tenantSlug?: string) =>
    request<OperationalTaskRecord>(
      `/tasks/${id}/link-schedule-event`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  linkWorkOrder: (id: string, dto: LinkTaskWorkOrderDto, tenantSlug?: string) =>
    request<OperationalTaskRecord>(
      `/tasks/${id}/link-work-order`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  timeline: (id: string, tenantSlug?: string) =>
    request<OperationalTaskTimelineEvent[]>(
      `/tasks/${id}/timeline`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  assignmentHistory: (id: string, tenantSlug?: string) =>
    request<OperationalTaskAssignmentHistoryRecord[]>(
      `/tasks/${id}/assignment-history`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  executionOrders: {
    get: (id: string, tenantSlug?: string) =>
      request<ExecutionOrderRecord>(
        `/tasks/execution-orders/${id}`,
        { returnFullResponse: true },
        tenantSlug,
      ),

    listActivities: (id: string, tenantSlug?: string) =>
      request<ExecutionOrderActivityRecord[]>(
        `/tasks/execution-orders/${id}/activities`,
        { returnFullResponse: true },
        tenantSlug,
      ),

    listItemUsage: (id: string, tenantSlug?: string) =>
      request<ExecutionOrderItemUsageRecord[]>(
        `/tasks/execution-orders/${id}/item-usage`,
        { returnFullResponse: true },
        tenantSlug,
      ),

    start: (id: string, dto: StartExecutionOrderDto, tenantSlug?: string) =>
      request<ExecutionOrderRecord>(
        `/tasks/execution-orders/${id}/start`,
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    registerFieldWork: (id: string, dto: RegisterExecutionOrderFieldWorkDto, tenantSlug?: string) =>
      request<ExecutionOrderActivityRecord>(
        `/tasks/execution-orders/${id}/field-work`,
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    registerItemUsage: (id: string, dto: RegisterExecutionOrderItemUsageDto, tenantSlug?: string) =>
      request<ExecutionOrderItemUsageRecord>(
        `/tasks/execution-orders/${id}/item-usage`,
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    close: (id: string, dto: CloseExecutionOrderDto, tenantSlug?: string) =>
      request<ExecutionOrderRecord>(
        `/tasks/execution-orders/${id}/close`,
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),
  },
};

// ─── MOD12 — Inventario / SCM ────────────────────────────────────────────────

export interface InventoryDashboardSummary {
  itemsCount: number;
  locationsCount: number;
  serializedAssetsCount: number;
  balancesCount: number;
  totalOnHand: number;
  balancesByLocation: InventoryBalanceByLocationSummary[];
  balancesByCategory: InventoryBalanceByCategorySummary[];
  serializedAssetsByStatus: InventoryAssetsByStatusSummary[];
  serializedAssetsByResponsibleType: InventoryAssetsByResponsibleTypeSummary[];
}

export interface InventoryBalanceByLocationSummary {
  locationId: string;
  locationCode: string;
  locationName: string;
  totalOnHand: number;
  uniqueItems: number;
}

export interface InventoryBalanceByCategorySummary {
  categoryId: string;
  categoryCodePrefix: string;
  categoryName: string;
  totalOnHand: number;
  uniqueItems: number;
}

export interface InventoryAssetsByStatusSummary {
  status: SerializedAssetStatus;
  count: number;
}

export interface InventoryAssetsByResponsibleTypeSummary {
  responsibleType: InventoryResponsibleType;
  count: number;
}

export interface InventoryItemRecord {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  itemKind: InventoryItemKind;
  category: InventoryItemCategory;
  categoryId: string;
  categoryName: string;
  categoryCode: string;
  trackingMode: InventoryTrackingMode;
  unitOfMeasure: string;
  baseCost: string;
  minimumStock: string;
  purchasable: boolean;
  inventoryControlled: boolean;
  assetControlled: boolean;
  preferredSupplierRefId: string | null;
  supplierSku: string | null;
  purchaseUnitOfMeasure: string | null;
  purchaseToBaseUomFactor: string | null;
  standardCost: string;
  lastPurchaseCost: string | null;
  reorderPoint: string;
  targetStock: string;
  minimumOrderQty: string | null;
  orderMultiple: string | null;
  leadTimeDays: number | null;
  usefulLifeMonths: number | null;
  commercialReferenceId: string | null;
  status: InventoryItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryCatalogOptionRecord {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categoryCode: string;
  category: InventoryItemCategory;
  itemKind: InventoryItemKind;
  unitOfMeasure: string;
  purchaseUnitOfMeasure: string | null;
  standardCost: string;
  preferredSupplierRefId: string | null;
  preferredSupplierName: string | null;
  supplierSku: string | null;
}

export interface InventoryCategoryRecord {
  id: string;
  tenantId: string;
  code: string;
  codePrefix: string;
  name: string;
  description: string | null;
  status: InventoryCategoryStatus;
  sortOrder: number;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockLocationRecord {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: StockLocationType;
  status: StockLocationStatus;
  responsibleRefId: string | null;
  maxCapacity: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedAssetRecord {
  id: string;
  tenantId: string;
  inventoryItemId: string;
  serialNumber: string | null;
  normalizedSerialNumber: string | null;
  macAddress: string | null;
  normalizedMacAddress: string | null;
  assetTag: string | null;
  currentStatus: SerializedAssetStatus;
  currentLocationId: string | null;
  currentResponsibleType: InventoryResponsibleType;
  currentResponsibleRefId: string | null;
  subscriberRefId: string | null;
  contractRefId: string | null;
  purchaseOrderRef: string | null;
  purchaseDate: string | null;
  usefulLifeMonths: number | null;
  warrantyUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockBalanceRecord {
  id: string;
  tenantId: string;
  itemId: string;
  locationId: string;
  lotId: string | null;
  condition: StockBalanceCondition;
  quantityOnHand: string;
  quantityReserved: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovementRecord {
  id: string;
  tenantId: string;
  movementNumber: string;
  origin: StockMovementOrigin;
  originContext: string;
  originRefId: string | null;
  idempotencyKey: string;
  notes: string | null;
  actorUserId: string | null;
  reversedByMovementId: string | null;
  isReversal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovementLineRecord {
  id: string;
  tenantId: string;
  movementId: string;
  itemId: string;
  locationId: string;
  lotId: string | null;
  serializedAssetId: string | null;
  quantity: string;
  unitCost: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovementResultRecord {
  movement: StockMovementRecord;
  lines: StockMovementLineRecord[];
}

export interface PurchaseRequestRecord {
  id: string;
  tenantId: string;
  requestNumber: string;
  title: string;
  status: PurchaseRequestStatus;
  requestType: PurchaseRequestType;
  priority: PurchaseRequestPriority;
  requestedByUserId: string;
  requestingArea: string | null;
  justification: string | null;
  operationalRefType: string | null;
  operationalRefId: string | null;
  exceptionReason: string | null;
  approvedByUserId: string | null;
  neededByDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseRequestLineRecord {
  id: string;
  tenantId: string;
  purchaseRequestId: string;
  sourceKind: PurchaseRequestLineSourceKind;
  inventoryItemId: string | null;
  freeTextDescription: string | null;
  quantityRequested: string;
  unitOfMeasure: string;
  suggestedPartyRefId: string | null;
  lineStatus: PurchaseRequestLineStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseRequestLineAwardRecord {
  id: string;
  tenantId: string;
  purchaseRequestLineId: string;
  supplierQuoteId: string | null;
  awardedPartyRefId: string;
  awardedQuantity: string;
  awardNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseApprovalPolicyRecord {
  canApprove: boolean;
  requiresException: boolean;
  blockingReason: string | null;
  approvalLevel: string;
}

export interface PurchaseRequestDetailRecord {
  request: PurchaseRequestRecord;
  lines: PurchaseRequestLineRecord[];
  quotes: SupplierQuoteRecord[];
  awards: PurchaseRequestLineAwardRecord[];
  orders: PurchaseOrderRecord[];
  estimatedAmount: number;
  approvalPolicy: PurchaseApprovalPolicyRecord;
  rfq: PurchaseRfqDetailRecord | null;
}

export interface PurchaseRfqRecord {
  id: string;
  tenantId: string;
  purchaseRequestId: string;
  rfqNumber: string;
  status: string;
  currency: string;
  responseDeadline: string | null;
  sentAt: string | null;
  closedAt: string | null;
  createdByUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseRfqInvitationRecord {
  id: string;
  tenantId: string;
  rfqId: string;
  partyRefId: string;
  status: string;
  invitedAt: string | null;
  respondedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseRfqDetailRecord {
  rfq: PurchaseRfqRecord;
  invitations: PurchaseRfqInvitationRecord[];
}

export interface SupplierSummaryRecord {
  partyRefId: string;
  displayName: string;
  primaryContact: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  status: string;
}

export interface SupplierListItemRecord {
  partyRefId: string;
  displayName: string;
  status: PartyStatus;
}

export interface SupplierSearchResultRecord {
  data: SupplierListItemRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface ListSuppliersParams {
  search?: string;
  page?: number;
}

export interface SupplierProfilePartyRecord {
  partyRefId: string;
  displayName: string;
  primaryContact: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  status: PartyStatus;
}

export interface SupplierProfileRecord {
  id: string;
  supplierCode: string;
  partyRefId: string;
  status: SupplierProfileStatus;
  paymentTermsDays: number | null;
  currency: string | null;
  incoterm: string | null;
  defaultLeadTimeDays: number | null;
  purchasingContactName: string | null;
  purchasingContactEmail: string | null;
  purchasingContactPhone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  party: SupplierProfilePartyRecord | null;
}

export interface CreateSupplierDto {
  partyType: PartyType;
  documentType: DocumentTypeParty;
  documentNumber: string;
  displayName: string;
  legalName?: string | null;
  contacts?: Array<{
    type: PartyContactType;
    value: string;
    isPrimary?: boolean;
    metadata?: Record<string, unknown> | null;
  }>;
  paymentTermsDays?: number | null;
  currency?: string | null;
  incoterm?: string | null;
  defaultLeadTimeDays?: number | null;
  purchasingContactName?: string | null;
  purchasingContactEmail?: string | null;
  purchasingContactPhone?: string | null;
  notes?: string | null;
}

export interface UpdateSupplierDto {
  paymentTermsDays?: number | null;
  currency?: string | null;
  incoterm?: string | null;
  defaultLeadTimeDays?: number | null;
  purchasingContactName?: string | null;
  purchasingContactEmail?: string | null;
  purchasingContactPhone?: string | null;
  notes?: string | null;
}

export interface SetSupplierStatusDto {
  status: SupplierProfileStatus;
}

export interface ListSupplierProfilesParams {
  status?: SupplierProfileStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface SupplierIdentityMatchRecord {
  partyRefId: string;
  partyType: PartyType;
  documentType: DocumentTypeParty;
  displayName: string;
  legalName: string | null;
  summary: SupplierProfilePartyRecord;
}

export interface LookupSupplierByDocumentResult {
  match: SupplierIdentityMatchRecord | null;
  hasSupplierProfile: boolean;
}

export interface LookupSupplierByDocumentParams {
  documentType: DocumentTypeParty;
  documentNumber: string;
}

export interface SupplierProfileListResult {
  data: SupplierProfileRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface SupplierQuoteRecord {
  id: string;
  tenantId: string;
  purchaseRequestId: string;
  partyRefId: string;
  quoteNumber: string;
  amount: string;
  currency: string;
  validUntil: string | null;
  notes: string | null;
  rfqId?: string | null;
  rfqInvitationId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderRecord {
  id: string;
  tenantId: string;
  orderNumber: string;
  purchaseRequestId: string | null;
  partyRefId: string;
  status: PurchaseOrderStatus;
  expectedDeliveryDate: string | null;
  approvedByUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderLineRecord {
  id: string;
  tenantId: string;
  purchaseOrderId: string;
  itemId: string;
  purchaseRequestLineId: string | null;
  quantity: string;
  unitCost: string;
  receivedQuantity: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderDetailRecord extends PurchaseOrderRecord {
  lines: PurchaseOrderLineRecord[];
}

export interface ListPurchaseOrdersParams {
  status?: PurchaseOrderStatus;
  purchaseRequestId?: string;
}

export interface GoodsReceiptRecord {
  id: string;
  tenantId: string;
  receiptNumber: string;
  purchaseOrderId: string;
  status: GoodsReceiptStatus;
  receivedAt: string;
  receivedByUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoodsReceiptLineRecord {
  id: string;
  tenantId: string;
  goodsReceiptId: string;
  purchaseOrderLineId: string;
  itemId: string;
  quantityReceived: string;
  lotId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoodsReceiptResultRecord {
  receipt: GoodsReceiptRecord;
  movement: StockMovementRecord;
  lines: StockMovementLineRecord[];
}

export interface ListInventoryItemsParams {
  search?: string;
  categoryId?: string;
  category?: InventoryItemCategory;
  itemKind?: InventoryItemKind;
  trackingMode?: InventoryTrackingMode;
  status?: InventoryItemStatus;
  purchasable?: boolean;
  preferredSupplierRefId?: string;
  commercialReferenceId?: string;
}

export interface CreateInventoryItemDto {
  sku?: string;
  name: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  itemKind?: InventoryItemKind;
  categoryId?: string;
  category?: InventoryItemCategory;
  trackingMode: InventoryTrackingMode;
  unitOfMeasure: string;
  baseCost?: number;
  minimumStock?: number;
  purchasable?: boolean;
  inventoryControlled?: boolean;
  assetControlled?: boolean;
  preferredSupplierRefId?: string | null;
  supplierSku?: string | null;
  purchaseUnitOfMeasure?: string | null;
  purchaseToBaseUomFactor?: number | null;
  standardCost?: number;
  lastPurchaseCost?: number | null;
  reorderPoint?: number;
  targetStock?: number;
  minimumOrderQty?: number | null;
  orderMultiple?: number | null;
  leadTimeDays?: number | null;
  usefulLifeMonths?: number | null;
  commercialReferenceId?: string | null;
  status?: InventoryItemStatus;
}

export type UpdateInventoryItemDto = Partial<CreateInventoryItemDto>;

export interface ListInventoryCategoriesParams {
  search?: string;
  status?: InventoryCategoryStatus;
}

export interface CreateInventoryCategoryDto {
  code: string;
  codePrefix: string;
  name: string;
  description?: string | null;
  status?: InventoryCategoryStatus;
  sortOrder?: number;
}

export type UpdateInventoryCategoryDto = Partial<CreateInventoryCategoryDto>;

export interface SuggestInventoryCategoryPrefixParams {
  name: string;
  codePrefix?: string;
  excludeCategoryId?: string;
}

export interface SuggestInventoryCategoryPrefixResult {
  code: string;
  codePrefix: string;
  sortOrder: number;
}

export interface ListCatalogOptionsParams {
  search?: string;
}

export interface ListStockLocationsParams {
  type?: StockLocationType;
  status?: StockLocationStatus;
  responsibleRefId?: string;
}

export interface CreateStockLocationDto {
  code?: string;
  name: string;
  type: StockLocationType;
  status?: StockLocationStatus;
  responsibleRefId?: string | null;
  maxCapacity?: number | null;
}

export interface UpdateStockLocationDto {
  name?: string;
  status?: StockLocationStatus;
  responsibleRefId?: string | null;
  maxCapacity?: number | null;
}

export interface ListSerializedAssetsParams {
  itemId?: string;
  status?: SerializedAssetStatus;
  locationId?: string;
  serialNumber?: string;
}

export interface ListStockBalancesParams {
  itemId?: string;
  locationId?: string;
  condition?: StockBalanceCondition;
}

export interface TransferStockDto {
  itemId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  quantity: number;
  lotId?: string | null;
  serializedAssetId?: string | null;
  serialNumber?: string | null;
  condition?: StockBalanceCondition;
  handoffReference: string;
  handoffNotes?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
}

export interface SaleMovementDto {
  itemId: string;
  locationId: string;
  quantity: number;
  commercialRefId: string;
  serializedAssetId?: string | null;
  serialNumber?: string | null;
  lotId?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
}

export interface ReturnAssetDto {
  itemId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  quantity?: number;
  serializedAssetId?: string | null;
  serialNumber?: string | null;
  lotId?: string | null;
  targetStatus: SerializedAssetStatus;
  notes?: string | null;
  idempotencyKey?: string | null;
}

export interface CreateCounterPurchaseLineDto {
  itemId: string;
  quantityReceived: number;
  unitCost: number;
  lotNumber?: string | null;
  serialNumbers?: string[];
  condition?: StockBalanceCondition;
}

export interface CreateCounterPurchaseDto {
  partyRefId: string;
  invoiceNumber: string;
  purchaseDate?: string | null;
  destinationLocationId: string;
  notes?: string | null;
  idempotencyKey?: string | null;
  lines: CreateCounterPurchaseLineDto[];
}

export interface WriteOffAssetDto {
  serializedAssetId?: string | null;
  itemId?: string | null;
  locationId?: string | null;
  quantity?: number;
  reason: WriteOffReason;
  notes?: string | null;
  idempotencyKey?: string | null;
}

export interface StockIssueLineInputDto {
  itemId: string;
  requestedQty: number;
  lotId?: string | null;
  serializedAssetId?: string | null;
  condition?: StockBalanceCondition;
}

export interface CreateStockIssueDto {
  type: StockIssueType;
  sourceLocationId: string;
  destinationLocationId?: string | null;
  destinationRefId?: string | null;
  originRefId?: string | null;
  commercialRefId?: string | null;
  reason?: string | null;
  costCenter?: string | null;
  lines: StockIssueLineInputDto[];
}

export interface UpdateStockIssueDto extends Partial<CreateStockIssueDto> {
  status?: Exclude<
    StockIssueStatus,
    StockIssueStatus.CANCELLED | StockIssueStatus.DISPATCHED | StockIssueStatus.RECEIVED
  >;
}

export interface DispatchStockIssueDto {
  handoffMethod: string;
  handoffNotes?: string | null;
  handoffAttachments?: unknown[];
}

export interface ListStockIssuesParams {
  type?: StockIssueType;
  status?: StockIssueStatus;
  sourceLocationId?: string;
  destinationLocationId?: string;
}

export interface StockIssueLineRecord {
  id: string;
  tenantId: string;
  issueId: string;
  itemId: string;
  requestedQty: string;
  dispatchedQty: string | null;
  lotId: string | null;
  serializedAssetId: string | null;
  condition: StockBalanceCondition;
  createdAt: string;
  updatedAt: string;
}

export interface StockIssueRecord {
  id: string;
  tenantId: string;
  type: StockIssueType;
  status: StockIssueStatus;
  sourceLocationId: string;
  destinationLocationId: string | null;
  destinationRefId: string | null;
  originRefId: string | null;
  commercialRefId: string | null;
  reason: string | null;
  costCenter: string | null;
  handoffMethod: string | null;
  handoffNotes: string | null;
  handoffAttachments: unknown[] | null;
  createdByUserId: string | null;
  dispatchedByUserId: string | null;
  closedAt: string | null;
  stockMovementId: string | null;
  linesCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockIssueDetailRecord extends StockIssueRecord {
  lines: StockIssueLineRecord[];
}

export interface ListPurchaseRequestsParams {
  status?: PurchaseRequestStatus;
  requestType?: PurchaseRequestType;
  priority?: PurchaseRequestPriority;
  requestingArea?: string;
}

export interface CreatePurchaseRequestLineDto {
  sourceKind: PurchaseRequestLineSourceKind;
  inventoryItemId?: string | null;
  freeTextDescription?: string | null;
  quantityRequested: number;
  unitOfMeasure: string;
  suggestedPartyRefId?: string | null;
  notes?: string | null;
}

export interface CreatePurchaseRequestDto {
  title: string;
  requestType: PurchaseRequestType;
  priority?: PurchaseRequestPriority;
  requestingArea: string;
  justification: string;
  operationalRefType?: string | null;
  operationalRefId?: string | null;
  neededByDate?: string | null;
  notes?: string | null;
  lines: CreatePurchaseRequestLineDto[];
}

export interface AddSupplierQuoteDto {
  partyRefId: string;
  quoteNumber: string;
  amount: number;
  currency: string;
  validUntil?: string | null;
  notes?: string | null;
  rfqInvitationId?: string | null;
}

export interface CreateRfqDto {
  currency?: string;
  responseDeadline?: string | null;
  notes?: string | null;
}

export interface InviteSuppliersDto {
  partyRefIds: string[];
}

export interface DeclineInvitationDto {
  declineReason?: string | null;
}

export interface ApprovePurchaseRequestDto {
  notes?: string | null;
  exceptionReason?: string | null;
}

export interface PurchaseRequestLineAwardInput {
  purchaseRequestLineId: string;
  awardedPartyRefId: string;
  awardedQuantity: number;
  supplierQuoteId?: string | null;
  awardNotes?: string | null;
}

export interface CreatePurchaseRequestAwardsDto {
  awards: PurchaseRequestLineAwardInput[];
}

export interface PurchaseOrderLineInput {
  itemId: string;
  quantity: number;
  unitCost: number;
  purchaseRequestLineId?: string | null;
}

export interface CreatePurchaseOrderDto {
  purchaseRequestId: string;
  partyRefId: string;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  lines: PurchaseOrderLineInput[];
  status?: PurchaseOrderStatus;
}

export interface ReceivePurchaseOrderLineDto {
  purchaseOrderLineId: string;
  itemId: string;
  quantityReceived: number;
  lotNumber?: string | null;
  expiryDate?: string | null;
  serialNumbers?: string[];
  unitCost?: number | null;
  condition?: StockBalanceCondition;
}

export interface ReceivePurchaseOrderDto {
  destinationLocationId: string;
  receivedAt?: string | null;
  notes?: string | null;
  lines: ReceivePurchaseOrderLineDto[];
  status?: GoodsReceiptStatus;
}

function buildInventoryQuery(params?: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export const inventoryApi = {
  listItems: (params?: ListInventoryItemsParams, tenantSlug?: string) =>
    request<InventoryItemRecord[]>(
      `/inventory/items${buildInventoryQuery({
        search: params?.search,
        categoryId: params?.categoryId,
        category: params?.category,
        itemKind: params?.itemKind,
        trackingMode: params?.trackingMode,
        status: params?.status,
        purchasable:
          params?.purchasable === true
            ? 'true'
            : params?.purchasable === false
              ? 'false'
              : undefined,
        preferredSupplierRefId: params?.preferredSupplierRefId,
        commercialReferenceId: params?.commercialReferenceId,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  getItem: (id: string, tenantSlug?: string) =>
    request<InventoryItemRecord>(
      `/inventory/items/${id}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  createItem: (dto: CreateInventoryItemDto, tenantSlug?: string) =>
    request<InventoryItemRecord>(
      '/inventory/items',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  updateItem: (id: string, dto: UpdateInventoryItemDto, tenantSlug?: string) =>
    request<InventoryItemRecord>(
      `/inventory/items/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  deleteItem: (id: string, tenantSlug?: string) =>
    request<void>(
      `/inventory/items/${id}`,
      { method: 'DELETE', returnFullResponse: true },
      tenantSlug,
    ),

  listCatalogOptions: (params?: ListCatalogOptionsParams, tenantSlug?: string) =>
    request<InventoryCatalogOptionRecord[]>(
      `/inventory/items/catalog/options${buildInventoryQuery({
        search: params?.search,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  listCategories: (params?: ListInventoryCategoriesParams, tenantSlug?: string) =>
    request<InventoryCategoryRecord[]>(
      `/inventory/categories${buildInventoryQuery({
        search: params?.search,
        status: params?.status,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  suggestCategoryPrefix: (params: SuggestInventoryCategoryPrefixParams, tenantSlug?: string) =>
    request<SuggestInventoryCategoryPrefixResult>(
      `/inventory/categories/suggest-prefix${buildInventoryQuery({
        name: params.name,
        codePrefix: params.codePrefix,
        excludeCategoryId: params.excludeCategoryId,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  getCategory: (id: string, tenantSlug?: string) =>
    request<InventoryCategoryRecord>(
      `/inventory/categories/${id}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  createCategory: (dto: CreateInventoryCategoryDto, tenantSlug?: string) =>
    request<InventoryCategoryRecord>(
      '/inventory/categories',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  updateCategory: (id: string, dto: UpdateInventoryCategoryDto, tenantSlug?: string) =>
    request<InventoryCategoryRecord>(
      `/inventory/categories/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  listLocations: (params?: ListStockLocationsParams, tenantSlug?: string) =>
    request<StockLocationRecord[]>(
      `/inventory/locations${buildInventoryQuery({
        type: params?.type,
        status: params?.status,
        responsibleRefId: params?.responsibleRefId,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  createLocation: (dto: CreateStockLocationDto, tenantSlug?: string) =>
    request<StockLocationRecord>(
      '/inventory/locations',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  updateLocation: (id: string, dto: UpdateStockLocationDto, tenantSlug?: string) =>
    request<StockLocationRecord>(
      `/inventory/locations/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  listAssets: (params?: ListSerializedAssetsParams, tenantSlug?: string) =>
    request<SerializedAssetRecord[]>(
      `/inventory/assets${buildInventoryQuery({
        itemId: params?.itemId,
        status: params?.status,
        locationId: params?.locationId,
        serialNumber: params?.serialNumber,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  getAsset: (id: string, tenantSlug?: string) =>
    request<SerializedAssetRecord>(
      `/inventory/assets/${id}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  listBalances: (params?: ListStockBalancesParams, tenantSlug?: string) =>
    request<StockBalanceRecord[]>(
      `/inventory/balances${buildInventoryQuery({
        itemId: params?.itemId,
        locationId: params?.locationId,
        condition: params?.condition,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  dashboard: (tenantSlug?: string) =>
    request<InventoryDashboardSummary>(
      '/inventory/dashboard',
      { returnFullResponse: true },
      tenantSlug,
    ),

  transfer: (dto: TransferStockDto, tenantSlug?: string) =>
    request<StockMovementResultRecord>(
      '/inventory/transfers',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  sale: (dto: SaleMovementDto, tenantSlug?: string) =>
    request<StockMovementResultRecord>(
      '/inventory/movements/sale',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  registerReturn: (dto: ReturnAssetDto, tenantSlug?: string) =>
    request<StockMovementResultRecord>(
      '/inventory/returns',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  writeOff: (dto: WriteOffAssetDto, tenantSlug?: string) =>
    request<StockMovementResultRecord>(
      '/inventory/write-offs',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  createCounterPurchase: (dto: CreateCounterPurchaseDto, tenantSlug?: string) =>
    request<StockMovementResultRecord>(
      '/inventory/counter-purchases',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  listIssues: (params?: ListStockIssuesParams, tenantSlug?: string) =>
    request<StockIssueRecord[]>(
      `/inventory/issues${buildInventoryQuery({
        type: params?.type,
        status: params?.status,
        sourceLocationId: params?.sourceLocationId,
        destinationLocationId: params?.destinationLocationId,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  createIssue: (dto: CreateStockIssueDto, tenantSlug?: string) =>
    request<StockIssueDetailRecord>(
      '/inventory/issues',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  getIssue: (id: string, tenantSlug?: string) =>
    request<StockIssueDetailRecord>(
      `/inventory/issues/${id}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  updateIssue: (id: string, dto: UpdateStockIssueDto, tenantSlug?: string) =>
    request<StockIssueDetailRecord>(
      `/inventory/issues/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  cancelIssue: (id: string, tenantSlug?: string) =>
    request<StockIssueRecord>(
      `/inventory/issues/${id}/cancel`,
      { method: 'POST', body: JSON.stringify({}), returnFullResponse: true },
      tenantSlug,
    ),

  dispatchIssue: (id: string, dto: DispatchStockIssueDto, tenantSlug?: string) =>
    request<StockIssueDetailRecord>(
      `/inventory/issues/${id}/dispatch`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),
};

export const purchasingApi = {
  listRequests: (params?: ListPurchaseRequestsParams, tenantSlug?: string) =>
    request<PurchaseRequestRecord[]>(
      `/purchasing/requests${buildInventoryQuery({
        status: params?.status,
        requestType: params?.requestType,
        priority: params?.priority,
        requestingArea: params?.requestingArea,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  getRequestDetail: (id: string, tenantSlug?: string) =>
    request<PurchaseRequestDetailRecord>(
      `/purchasing/requests/${id}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  createRequest: (dto: CreatePurchaseRequestDto, tenantSlug?: string) =>
    request<PurchaseRequestRecord>(
      '/purchasing/requests',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  addQuote: (id: string, dto: AddSupplierQuoteDto, tenantSlug?: string) =>
    request<SupplierQuoteRecord>(
      `/purchasing/requests/${id}/quotes`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  approveRequest: (id: string, dto: ApprovePurchaseRequestDto, tenantSlug?: string) =>
    request<PurchaseRequestRecord>(
      `/purchasing/requests/${id}/approve`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  createAwards: (id: string, dto: CreatePurchaseRequestAwardsDto, tenantSlug?: string) =>
    request<PurchaseRequestLineAwardRecord[]>(
      `/purchasing/requests/${id}/awards`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  getProviderSummary: (partyRefId: string, tenantSlug?: string) =>
    request<SupplierSummaryRecord>(
      `/purchasing/providers/${partyRefId}/summary`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  searchSuppliers: (params?: ListSuppliersParams, tenantSlug?: string) =>
    request<SupplierSearchResultRecord>(
      `/purchasing/providers${buildInventoryQuery({
        search: params?.search,
        page: params?.page ? String(params.page) : undefined,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  createSupplier: (dto: CreateSupplierDto, tenantSlug?: string) =>
    request<SupplierProfileRecord>(
      '/purchasing/suppliers',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  listSuppliers: (params?: ListSupplierProfilesParams, tenantSlug?: string) =>
    request<SupplierProfileListResult>(
      `/purchasing/suppliers${buildInventoryQuery({
        status: params?.status,
        search: params?.search,
        page: params?.page ? String(params.page) : undefined,
        limit: params?.limit ? String(params.limit) : undefined,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  lookupSupplierByDocument: (params: LookupSupplierByDocumentParams, tenantSlug?: string) =>
    request<LookupSupplierByDocumentResult>(
      `/purchasing/suppliers/lookup${buildInventoryQuery({
        documentType: params.documentType,
        documentNumber: params.documentNumber,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  getSupplier: (partyRefId: string, tenantSlug?: string) =>
    request<SupplierProfileRecord>(
      `/purchasing/suppliers/${partyRefId}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  updateSupplier: (partyRefId: string, dto: UpdateSupplierDto, tenantSlug?: string) =>
    request<SupplierProfileRecord>(
      `/purchasing/suppliers/${partyRefId}`,
      { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  setSupplierStatus: (partyRefId: string, dto: SetSupplierStatusDto, tenantSlug?: string) =>
    request<SupplierProfileRecord>(
      `/purchasing/suppliers/${partyRefId}/status`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  createOrder: (dto: CreatePurchaseOrderDto, tenantSlug?: string) =>
    request<PurchaseOrderRecord>(
      '/purchasing/orders',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  listOrders: (params?: ListPurchaseOrdersParams, tenantSlug?: string) =>
    request<PurchaseOrderRecord[]>(
      `/purchasing/orders${buildInventoryQuery({
        status: params?.status,
        purchaseRequestId: params?.purchaseRequestId,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  getOrder: (id: string, tenantSlug?: string) =>
    request<PurchaseOrderDetailRecord>(
      `/purchasing/orders/${id}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  receiveOrder: (id: string, dto: ReceivePurchaseOrderDto, tenantSlug?: string) =>
    request<GoodsReceiptResultRecord>(
      `/purchasing/orders/${id}/receipts`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  createRfq: (purchaseRequestId: string, dto: CreateRfqDto, tenantSlug?: string) =>
    request<PurchaseRfqRecord>(
      `/purchasing/requests/${purchaseRequestId}/rfq`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  inviteSuppliers: (rfqId: string, dto: InviteSuppliersDto, tenantSlug?: string) =>
    request<PurchaseRfqInvitationRecord[]>(
      `/purchasing/rfqs/${rfqId}/invitations`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  sendRfq: (rfqId: string, tenantSlug?: string) =>
    request<PurchaseRfqRecord>(
      `/purchasing/rfqs/${rfqId}/send`,
      { method: 'POST', returnFullResponse: true },
      tenantSlug,
    ),

  closeRfq: (rfqId: string, tenantSlug?: string) =>
    request<PurchaseRfqRecord>(
      `/purchasing/rfqs/${rfqId}/close`,
      { method: 'POST', returnFullResponse: true },
      tenantSlug,
    ),

  declineInvitation: (
    rfqId: string,
    invitationId: string,
    dto: DeclineInvitationDto,
    tenantSlug?: string,
  ) =>
    request<PurchaseRfqInvitationRecord>(
      `/purchasing/rfqs/${rfqId}/invitations/${invitationId}/decline`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  getRfq: (rfqId: string, tenantSlug?: string) =>
    request<PurchaseRfqDetailRecord>(
      `/purchasing/rfqs/${rfqId}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  downloadRfqPdf: async (rfqId: string, tenantSlug?: string) => {
    const resolvedTenantSlug = getTenantSlug(tenantSlug);
    const token = readStoredAccessToken();
    const headers = new Headers();
    headers.set('X-Tenant-Slug', resolvedTenantSlug);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await fetch(`${resolveApiBase()}/purchasing/rfqs/${rfqId}/pdf`, {
      headers,
      credentials: 'include',
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new ApiError(
        res.status,
        typeof body['code'] === 'string' ? body['code'] : 'UNKNOWN',
        typeof body['message'] === 'string' ? body['message'] : 'Error del servidor',
        body['details'],
      );
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    return {
      blob,
      filename: filenameMatch?.[1] ?? `RFQ-${rfqId}.pdf`,
    };
  },
};
