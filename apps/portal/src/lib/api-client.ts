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
  type SettingsPriorityResponse,
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
  AssetLifecycleEventType,
  SerializedAssetStatus,
  SupplierProfileStatus,
  StockAdjustmentReason,
  StockBalanceCondition,
  StockCountStatus,
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
  WriteOffStatus,
  UserRole,
  type ListMeta,
  type ListResponse,
  type UsersBulkCreateAcceptedResponse,
  type UsersBulkJobResultResponse,
  type UsersBulkJobStatusResponse,
  type StartExecutionOrderCommand,
  type RegisterItemUsageCommand,
  type CloseExecutionOrderCommand,
  type RegisterEvidenceCommand,
  type EvidenceAssetReceipt,
  type ExecutionOrderTemplateVersion,
  type ExecutionOrderDetail,
  type ExecutionOrderActivity,
  type ExecutionOrderItemUsage,
  type ExecutionOrderEvidence,
  type Page,
} from '@iwana/shared';
import { persistTenantSlug, resolveTenantSlug } from './tenant-resolution';
import { PICKER_SOFT_CAP } from './picker-soft-cap';
import {
  EMPTY_LIST_META,
  normalizeListMeta,
  collectListPages,
  emptyPageListMeta,
} from './list-meta';

export type { ListMeta, ListResponse };
export { EMPTY_LIST_META, normalizeListMeta, collectListPages, emptyPageListMeta };

/** Contrato HTTP uniforme E-4 lookup (`GET …/search`). FE mapea a `{ items, total }`. */
export interface PickerSearchItemDto {
  id: string;
  label: string;
  sublabel?: string | null;
}

export interface PickerSearchResponse {
  data: PickerSearchItemDto[];
  total: number;
}

export function mapPickerSearchResponse(response: PickerSearchResponse): {
  items: PickerSearchItemDto[];
  total: number;
} {
  return { items: response.data, total: response.total };
}

/**
 * Cliente HTTP para @iwana/portal - Portal de Suscriptores.
 * Requiere header X-Tenant-Slug para identificar el tenant.
 */

function resolveApiBase(): string {
  // C-4 (ADR-081): variable por aplicación. Vacía ⇒ same-origin `/api/v1`
  // (el rewrite de Next.js proxea al API; los mocks E2E interceptan sin CORS).
  const configuredApiBase = process.env.NEXT_PUBLIC_PORTAL_API_URL?.trim();

  if (configuredApiBase) {
    return configuredApiBase.replace(/\/$/, '');
  }

  return '/api/v1';
}
interface PendingTenantMfaLogin {
  email: string;
  password: string;
  tenantSlug: string;
}

let pendingTenantMfaLogin: PendingTenantMfaLogin | null = null;
let refreshAccessTokenPromise: Promise<string> | null = null;
let terminalSessionError: ApiError | null = null;

/**
 * Access token de sesión en estado del cliente, en memoria. Se pierde al
 * recargar — aceptado por diseño (ADR-081, decisión 6). El transporte de sesión
 * es la cookie httpOnly emitida por el API.
 */
let inMemoryAccessToken: string | null = null;

/**
 * Token de alcance limitado `mfa-setup` en memoria (ADR-081, decisión 6):
 * nunca en almacenamiento persistente. Se pierde al recargar — aceptado por
 * diseño; el flujo de primer ingreso lo reemite.
 * Solo existe durante el flujo de MFA setup. Se limpia al activar MFA.
 * HLD-MOD02-ARQUITECTURA-v1.0 §6.3 (DA-MOD02-01)
 */
let inMemoryMfaSetupToken: string | null = null;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly missingRequirements?: unknown[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function readStoredAccessToken(): string {
  return inMemoryAccessToken ?? '';
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

  inMemoryAccessToken = token || null;
}

/** Lee el token de alcance limitado para MFA setup desde el estado en memoria. */
function readMfaSetupToken(): string {
  return inMemoryMfaSetupToken ?? '';
}

/** Persiste el token limitado de MFA setup en memoria (nunca en storage). */
function persistMfaSetupToken(token: string): void {
  inMemoryMfaSetupToken = token || null;
}

/** Elimina el token limitado de MFA setup del estado en memoria. */
function clearMfaSetupTokenFromMemory(): void {
  inMemoryMfaSetupToken = null;
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
  meta: ListMeta;
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
    'Falta la empresa. Ingresa el identificador de la empresa en el inicio de sesión o usa la configuración global definida por tu equipo.',
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
        // C-2 (ADR-081): el refresh se autentica por la cookie httpOnly de
        // refresh; todo método mutante cookie-autenticado exige la cabecera CSRF.
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      persistAccessToken('');
      terminalSessionError = new ApiError(
        401,
        'SESSION_EXPIRED',
        'La sesión expiró. Inicia sesión de nuevo.',
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

  // C-2 (ADR-081): los métodos mutantes autenticados por cookie requieren una
  // cabecera personalizada que el navegador no adjunta cross-origin sin
  // preflight. GET/HEAD/OPTIONS y rutas públicas (skipAuth) quedan exentos.
  const method = (options?.method ?? 'GET').toUpperCase();
  const isMutatingMethod =
    method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
  if (isMutatingMethod && !options?.skipAuth && !headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'XMLHttpRequest');
  }

  const apiBase = resolveApiBase();

  // Timeout duro: en E2E, `route.continue()` hacia un API caído deja el fetch
  // colgado y AuthProvider nunca sale de «Validando sesión...». 12s cubre
  // latencia local sin alargar el timeout de Playwright (30s).
  const res = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
    credentials: 'include',
    signal: options?.signal ?? AbortSignal.timeout(12_000),
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
      body['details'] ?? body,
      Array.isArray(body['missingRequirements']) ? body['missingRequirements'] : undefined,
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
      clearMfaSetupTokenFromMemory();
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
   * Requiere el token de alcance limitado (scope='mfa-setup') en memoria
   * (ADR-081, decision 6): nunca en almacenamiento persistente.
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
      // C-2 (ADR-081): método mutante con credencial en la petición; la cabecera
      // CSRF mantiene el contrato uniforme del guard del backend.
      'X-Requested-With': 'XMLHttpRequest',
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
      // C-2 (ADR-081): método mutante con credencial en la petición; la cabecera
      // CSRF mantiene el contrato uniforme del guard del backend.
      'X-Requested-With': 'XMLHttpRequest',
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
   * Elimina el token de alcance limitado de MFA setup del estado en memoria.
   * Llamar despues de activar MFA exitosamente para no dejar token residual.
   */
  clearMfaSetupToken: clearMfaSetupTokenFromMemory,
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
  /** Precio vigente en COP; `null` si no hay fila `is_current` (no usar 0 como sentinel). */
  basePrice: number | null;
  installationFee: number;
  currentPrice?: string | null;
  description?: string | null;
  retentionApplicable?: boolean;
  taxClassificationId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Reexport del contrato canónico H8 (`@iwana/shared`); legacy + campos aditivos. */
import type { CommercialDashboardSummary } from '@iwana/shared';
export type {
  CommercialAttentionDestinoTab,
  CommercialAttentionEntityType,
  CommercialAttentionItem,
  CommercialAttentionReason,
  CommercialDashboardSummary,
  CommercialRecentChange,
  CommercialRecentChangeAction,
  CommercialRecentChangeDestinoTab,
  CommercialRecentChangeEntityType,
} from '@iwana/shared';

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
  currentPrice: string | null;
  /** Precio vigente en COP; `null` si no hay precio current. */
  basePrice: number | null;
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
  /** Precio vigente en COP; `null` si no hay precio current. */
  basePrice: number | null;
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
  /** Conteo de ítems del listado (GET /commercial/bundles). */
  itemCount?: number;
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

export interface UpdateBundleDto {
  name?: string;
  description?: string;
  discountType?: Extract<DiscountType, DiscountType.PERCENTAGE | DiscountType.FIXED_AMOUNT>;
  discountValue?: string;
  validFrom?: string;
  validTo?: string;
  isActive?: boolean;
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

export interface UpdatePromotionDto {
  name?: string;
  description?: string;
  isActive?: boolean;
  validTo?: string;
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
  basePrice?: number;
}

export interface UpdateAdditionalProductDto {
  name?: string;
  description?: string | undefined;
  category?: AdditionalProduct['category'];
  isLoan?: boolean;
  requiresInventory?: boolean;
  isActive?: boolean;
  basePrice?: number;
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
    itemCount: bundle.itemCount ?? 0,
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

/** Tamaño de página por defecto (ADR-064 / Ola 2a). */
export const COMMERCIAL_LIST_PAGE_SIZE = 20;
/**
 * Soft-cap pickers/combobox comerciales (ADR-064 excepción permanente).
 * @see PICKER_SOFT_CAP — no drenar universo; una sola página acotada.
 */
export const COMMERCIAL_PICKER_LIMIT = PICKER_SOFT_CAP;

/** Modelo comercial de producto en listado (`model=SALE|LOAN`). */
export type CommercialCatalogProductModel = 'SALE' | 'LOAN';

/** Filtro de ofertas en riesgo (bundles / promociones). */
export type CommercialOfferStatusParam = 'expiring';

/** Orden servidor catálogo — alineado a `ProductSortMode` / `CatalogQueryDto.sort`. */
export type CommercialCatalogSort = 'CATEGORY_NAME' | 'ACTIVE_NAME' | 'RECENTLY_UPDATED';

/**
 * Params de listado comercial (ADR-064).
 * Catálogo: `name`, `isActive`, `missingPrice`, `category`, `model`, `charge`, `sort`.
 * Ofertas: `offerStatus=expiring`.
 */
export interface CommercialListParams {
  cursor?: string;
  limit?: number;
  /** Filtro ILIKE por nombre (catálogo). */
  name?: string;
  isActive?: boolean;
  /** Solo ítems activos sin precio vigente RESIDENTIAL. */
  missingPrice?: boolean;
  /** Categoría de producto (`product_details.category`). */
  category?: ProductCategory;
  /** SALE (`is_loan=false`) | LOAN (`is_loan=true`). */
  model?: CommercialCatalogProductModel;
  /** Tipo de cargo de servicio (`service_details.charge_type`). */
  charge?: ChargeType;
  /** Bundles/promos: vigencia en ventana (y usos en promos). */
  offerStatus?: CommercialOfferStatusParam;
  /**
   * Orden servidor + cursor keyset (productos).
   * Sin valor: name ASC (planes/servicios). Productos FE siempre envían sort.
   */
  sort?: CommercialCatalogSort;
}

/**
 * Alias de compatibilidad Ola 3 → contrato ADR-065.
 * @deprecated Preferir `ListMeta` de `@iwana/shared`.
 */
export type CommercialListMeta = ListMeta;

export type CommercialPaginatedList<T> = ListResponse<T>;

/** Params de listado de definiciones tributarias (ADR-064). */
export interface ListTaxDefinitionsParams {
  cursor?: string;
  limit?: number;
  isActive?: boolean;
  category?: string;
  context?: string;
  origin?: string;
}

interface CommercialCatalogListResponse<T> {
  data: T[];
  meta: ListMeta;
}

/**
 * Normaliza listados comerciales (envelope plano o H-11 anidado).
 * Conserva el unwrap H-11; la forma de `meta` se unifica a `ListMeta`.
 */
function normalizeCommercialPaginatedResponse<T>(body: unknown): CommercialPaginatedList<T> {
  const empty: CommercialPaginatedList<T> = {
    data: [],
    meta: EMPTY_LIST_META,
  };
  if (!body || typeof body !== 'object') {
    return empty;
  }

  const root = body as Record<string, unknown>;
  const nested = root['data'];

  // H-11: { data: { data: T[], meta } }
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const inner = nested as Record<string, unknown>;
    if (Array.isArray(inner['data'])) {
      const rows = inner['data'] as T[];
      return {
        data: rows,
        meta: normalizeListMeta(inner['meta'] as Partial<ListMeta> | undefined, {
          dataLength: rows.length,
        }),
      };
    }
  }

  // Plano: { data: T[], meta }
  if (Array.isArray(nested)) {
    const rows = nested as T[];
    return {
      data: rows,
      meta: normalizeListMeta(root['meta'] as Partial<ListMeta> | undefined, {
        dataLength: rows.length,
      }),
    };
  }

  return empty;
}

function buildCommercialListQuery(
  params?: CommercialListParams,
  extra?: Record<string, string | undefined>,
): string {
  const searchParams = new URLSearchParams();
  if (params?.cursor) {
    searchParams.set('cursor', params.cursor);
  }
  // Siempre enviar limit (ADR-064): evita listados unbounded si el caller omite el param.
  searchParams.set('limit', String(params?.limit ?? COMMERCIAL_LIST_PAGE_SIZE));
  if (params?.name) {
    searchParams.set('name', params.name);
  }
  if (params?.isActive !== undefined) {
    searchParams.set('isActive', String(params.isActive));
  }
  if (params?.missingPrice === true) {
    searchParams.set('missingPrice', 'true');
  }
  if (params?.category) {
    searchParams.set('category', params.category);
  }
  if (params?.model) {
    searchParams.set('model', params.model);
  }
  if (params?.charge) {
    searchParams.set('charge', params.charge);
  }
  if (params?.offerStatus) {
    searchParams.set('offerStatus', params.offerStatus);
  }
  if (params?.sort) {
    searchParams.set('sort', params.sort);
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined && value !== '') {
        searchParams.set(key, value);
      }
    }
  }
  const query = searchParams.toString();
  return query ? `?${query}` : '';
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

function mapCurrentPriceAmount(currentPrice: string | null | undefined): number | null {
  if (currentPrice == null) {
    return null;
  }

  return Number(currentPrice);
}

function mapCommercialPlan(item: CommercialCatalogItemPayload): PlanCatalogItem {
  return {
    id: item.id,
    name: item.name,
    technology: item.technology ?? 'N/A',
    installationRule: item.installationRule ?? InstallationRule.ALWAYS,
    downloadSpeedMbps: item.downloadSpeedMbps ?? 0,
    uploadSpeedMbps: item.uploadSpeedMbps ?? 0,
    basePrice: mapCurrentPriceAmount(item.currentPrice),
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
    currentPrice: item.currentPrice ?? null,
    basePrice: mapCurrentPriceAmount(item.currentPrice),
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
    basePrice: mapCurrentPriceAmount(item.currentPrice),
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

/**
 * Subconjunto del tenant en GET /tenants/me/summary (A-3 · e4f93324).
 * 13 campos — sin marca ni nitDv. No duplicar TenantSelf aquí.
 */
export interface DashboardSummaryTenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  contactEmail: string;
  legalName: string | null;
  nit: string | null;
  city: string | null;
  department: string | null;
  countryCode: string | null;
  phone: string | null;
  website: string | null;
  createdAt: string;
}

/**
 * Métricas del resumen de empresa.
 * `null` = fallo de fuente. MFA con 0 usuarios ACTIVE → ratio 1 (vacua).
 */
export interface DashboardMetrics {
  configuredUsers: number | null;
  mfaCoverage: number | null;
  pendingAlerts: number;
  auditEventsLast7d: number | null;
}

/** Respuesta completa del summary del dashboard empresarial */
export interface DashboardSummary {
  tenant: DashboardSummaryTenant;
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
  /** Retorna KPIs agregados del módulo comercial. */
  getDashboardSummary: (tenantSlug?: string) =>
    request<CommercialDashboardSummary>(
      '/commercial/dashboard/summary',
      { returnFullResponse: true },
      tenantSlug,
    ),

  /** Lista el catálogo de planes del tenant autenticado (cursor + total). */
  getPlans: async (
    params?: CommercialListParams,
    tenantSlug?: string,
  ): Promise<CommercialPaginatedList<PlanCatalogItem>> => {
    const raw = await request<unknown>(
      `/commercial/catalog${buildCommercialListQuery(params, { type: 'PLAN' })}`,
      { returnFullResponse: true },
      tenantSlug,
    );
    const response = normalizeCommercialPaginatedResponse<CommercialCatalogItemPayload>(raw);

    return {
      data: response.data.map(mapCommercialPlan),
      meta: response.meta,
    };
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
        // Idempotencia operativa: si el precio vigente ya es idéntico, no bloqueamos la edición.
        if (
          error instanceof ApiError &&
          error.status === 409 &&
          /precio vigente id.?ntico/i.test(error.message)
        ) {
          return;
        }

        throw error;
      }
    }
  },

  /** Elimina un plan del catálogo del tenant autenticado. */
  deletePlan: (planId: string, tenantSlug?: string) =>
    request<void>(`/commercial/catalog/${planId}`, { method: 'DELETE' }, tenantSlug),

  /** Lista productos adicionales (cursor + total). */
  getAdditionalProducts: async (
    params?: CommercialListParams,
    tenantSlug?: string,
  ): Promise<CommercialPaginatedList<AdditionalProduct>> => {
    const raw = await request<unknown>(
      `/commercial/catalog${buildCommercialListQuery(params, { type: 'PRODUCT' })}`,
      { returnFullResponse: true },
      tenantSlug,
    );
    const response = normalizeCommercialPaginatedResponse<CommercialCatalogItemPayload>(raw);

    return {
      data: response.data.map(mapCommercialProduct),
      meta: response.meta,
    };
  },

  /** Crea un producto adicional en el catálogo del tenant autenticado. */
  createAdditionalProduct: async (dto: CreateAdditionalProductDto, tenantSlug?: string) => {
    const item = await request<CommercialCatalogItemPayload>(
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

    if (dto.basePrice !== undefined) {
      await setCommercialCatalogPrice(item.id, { basePrice: dto.basePrice }, tenantSlug);
    }
  },

  /** Actualiza un producto adicional del catálogo del tenant autenticado. */
  updateAdditionalProduct: async (
    productId: string,
    dto: UpdateAdditionalProductDto,
    tenantSlug?: string,
  ) => {
    await request(
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
    );

    if (dto.basePrice !== undefined) {
      try {
        await setCommercialCatalogPrice(productId, { basePrice: dto.basePrice }, tenantSlug);
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 409 &&
          /precio vigente id.?ntico/i.test(error.message)
        ) {
          return;
        }
        throw error;
      }
    }
  },

  /** Elimina un producto adicional del catálogo del tenant autenticado. */
  deleteAdditionalProduct: (productId: string, tenantSlug?: string) =>
    request<void>(`/commercial/catalog/${productId}`, { method: 'DELETE' }, tenantSlug),

  /** Lista servicios adicionales (cursor + total). */
  getAdditionalServices: async (
    params?: CommercialListParams,
    tenantSlug?: string,
  ): Promise<CommercialPaginatedList<AdditionalService>> => {
    const raw = await request<unknown>(
      `/commercial/catalog${buildCommercialListQuery(params, { type: 'SERVICE' })}`,
      { returnFullResponse: true },
      tenantSlug,
    );
    const response = normalizeCommercialPaginatedResponse<CommercialCatalogItemPayload>(raw);

    return {
      data: response.data.map(mapCommercialService),
      meta: response.meta,
    };
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
  },

  /** Actualiza un servicio adicional del catálogo del tenant autenticado. */
  updateAdditionalService: async (
    serviceId: string,
    dto: UpdateAdditionalServiceDto,
    tenantSlug?: string,
  ) => {
    await request(
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
    );

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
          /precio vigente id.?ntico/i.test(error.message)
        ) {
          return;
        }
        throw error;
      }
    }
  },

  /** Elimina un servicio adicional del catálogo del tenant autenticado. */
  deleteAdditionalService: (serviceId: string, tenantSlug?: string) =>
    request<void>(`/commercial/catalog/${serviceId}`, { method: 'DELETE' }, tenantSlug),

  /** Lookup typeahead E-4 — planes activos por defecto. */
  searchPlansForPicker: (
    params: { q: string; isActive?: boolean; limit?: number },
    options?: Pick<RequestOptions, 'signal'>,
    tenantSlug?: string,
  ) => {
    const searchParams = new URLSearchParams();
    searchParams.set('q', params.q);
    if (params.isActive !== undefined) searchParams.set('isActive', String(params.isActive));
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));

    return request<PickerSearchResponse>(
      `/commercial/plans/search?${searchParams.toString()}`,
      {
        returnFullResponse: true,
        ...(options?.signal ? { signal: options.signal } : {}),
      },
      tenantSlug,
    );
  },

  /** Lookup typeahead E-4 — productos adicionales. */
  searchAdditionalProductsForPicker: (
    params: { q: string; isActive?: boolean; limit?: number },
    options?: Pick<RequestOptions, 'signal'>,
    tenantSlug?: string,
  ) => {
    const searchParams = new URLSearchParams();
    searchParams.set('q', params.q);
    if (params.isActive !== undefined) searchParams.set('isActive', String(params.isActive));
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));

    return request<PickerSearchResponse>(
      `/commercial/additional-products/search?${searchParams.toString()}`,
      {
        returnFullResponse: true,
        ...(options?.signal ? { signal: options.signal } : {}),
      },
      tenantSlug,
    );
  },

  /** Lookup typeahead E-4 — servicios adicionales. */
  searchAdditionalServicesForPicker: (
    params: { q: string; isActive?: boolean; limit?: number },
    options?: Pick<RequestOptions, 'signal'>,
    tenantSlug?: string,
  ) => {
    const searchParams = new URLSearchParams();
    searchParams.set('q', params.q);
    if (params.isActive !== undefined) searchParams.set('isActive', String(params.isActive));
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));

    return request<PickerSearchResponse>(
      `/commercial/additional-services/search?${searchParams.toString()}`,
      {
        returnFullResponse: true,
        ...(options?.signal ? { signal: options.signal } : {}),
      },
      tenantSlug,
    );
  },

  /** Detalle de ítem de catálogo por ID (snapshot de plan / resolución de nombre). */
  getCatalogItemById: async (itemId: string, tenantSlug?: string) => {
    const item = await request<CommercialCatalogItemPayload>(
      `/commercial/catalog/${itemId}`,
      undefined,
      tenantSlug,
    );
    return item;
  },

  getPlanById: async (planId: string, tenantSlug?: string): Promise<PlanCatalogItem> => {
    const item = await request<CommercialCatalogItemPayload>(
      `/commercial/catalog/${planId}`,
      undefined,
      tenantSlug,
    );
    return mapCommercialPlan(item);
  },

  /** Lista bundles del tenant (cursor + total). */
  getBundles: async (
    params?: CommercialListParams,
    tenantSlug?: string,
  ): Promise<CommercialPaginatedList<CommercialBundle>> => {
    const response = await request<CommercialCatalogListResponse<CommercialBundle>>(
      `/commercial/bundles${buildCommercialListQuery(params)}`,
      { returnFullResponse: true },
      tenantSlug,
    );

    return {
      data: response.data.map(mapCommercialBundle),
      meta: response.meta,
    };
  },

  /** Retorna el detalle de un bundle con sus ítems. */
  getBundleDetail: (bundleId: string, tenantSlug?: string) =>
    request<CommercialBundleDetail>(`/commercial/bundles/${bundleId}`, undefined, tenantSlug),

  /** Crea un bundle. */
  createBundle: (dto: CreateBundleDto, tenantSlug?: string) =>
    request<CommercialBundle>(
      '/commercial/bundles',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Actualiza un bundle (PATCH). */
  updateBundle: (bundleId: string, dto: UpdateBundleDto, tenantSlug?: string) =>
    request<CommercialBundle>(
      `/commercial/bundles/${bundleId}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Desactiva un bundle. */
  deactivateBundle: (bundleId: string, tenantSlug?: string) =>
    request<void>(`/commercial/bundles/${bundleId}`, { method: 'DELETE' }, tenantSlug),

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

  /** Lista promociones del tenant (cursor + total). */
  getPromotions: async (
    params?: CommercialListParams,
    tenantSlug?: string,
  ): Promise<CommercialPaginatedList<CommercialPromotion>> => {
    const response = await request<CommercialCatalogListResponse<CommercialPromotion>>(
      `/commercial/promotions${buildCommercialListQuery(params)}`,
      { returnFullResponse: true },
      tenantSlug,
    );

    return {
      data: response.data.map(mapCommercialPromotion),
      meta: response.meta,
    };
  },

  /** Crea una promoción. */
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
    ),

  /** Actualiza una promoción (PATCH). */
  updatePromotion: (promotionId: string, dto: UpdatePromotionDto, tenantSlug?: string) =>
    request<CommercialPromotion>(
      `/commercial/promotions/${promotionId}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  /** Desactiva una promoción. */
  deactivatePromotion: (promotionId: string, tenantSlug?: string) =>
    request<void>(`/commercial/promotions/${promotionId}`, { method: 'DELETE' }, tenantSlug),

  // —— Compatibilidad ————————————————————————————————————————————————

  /** Lista reglas de compatibilidad del tenant (cursor + total). */
  getCompatibilityRules: async (
    params?: CommercialListParams,
    tenantSlug?: string,
  ): Promise<CommercialPaginatedList<CompatibilityRule>> => {
    const response = await request<CommercialCatalogListResponse<CompatibilityRule>>(
      `/commercial/compatibility-rules${buildCommercialListQuery(params)}`,
      { returnFullResponse: true },
      tenantSlug,
    );
    return { data: response.data, meta: response.meta };
  },

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

  // —— Tributarias (listado para TaxApplicationRulesManager) ——

  /** Lista reglas tributarias del tenant (cursor + total). */
  getTaxRules: async (
    params?: CommercialListParams,
    tenantSlug?: string,
  ): Promise<CommercialPaginatedList<TaxRule>> => {
    const response = await request<CommercialCatalogListResponse<TaxRule>>(
      `/commercial/tax-rules${buildCommercialListQuery(params)}`,
      { returnFullResponse: true },
      tenantSlug,
    );
    return { data: response.data, meta: response.meta };
  },

  /** Crea una regla tributaria del tenant (sin clasificaci?n legacy obligatoria). */
  createTaxRule: (
    dto: {
      taxType: string;
      ratePercentage: string;
      customerSegment?: string;
      stratumFrom?: number;
      stratumTo?: number;
      priority?: number;
      municipalityCode?: string;
      validFrom?: string;
      validTo?: string;
      taxClassificationId?: string;
    },
    tenantSlug?: string,
  ) =>
    request<TaxRule>(
      '/commercial/tax-rules',
      { method: 'POST', body: JSON.stringify(dto) },
      tenantSlug,
    ),

  // ?? Cat?logo MOD07 ???????????????????????????????????????????????????????

  /**
   * Lista definiciones tributarias del catálogo MOD07 (cursor + total, ADR-064).
   * Pickers: usar `limit: COMMERCIAL_PICKER_LIMIT`.
   */
  listTaxDefinitions: async (
    params?: ListTaxDefinitionsParams,
    tenantSlug?: string,
  ): Promise<CommercialPaginatedList<TaxDefinition>> => {
    const searchParams = new URLSearchParams();
    if (params?.cursor) {
      searchParams.set('cursor', params.cursor);
    }
    if (params?.limit !== undefined) {
      searchParams.set('limit', String(params.limit));
    }
    if (params?.isActive !== undefined) {
      searchParams.set('isActive', String(params.isActive));
    }
    if (params?.category) {
      searchParams.set('category', params.category);
    }
    if (params?.context) {
      searchParams.set('context', params.context);
    }
    if (params?.origin) {
      searchParams.set('origin', params.origin);
    }
    const qs = searchParams.toString();
    const response = await request<CommercialCatalogListResponse<TaxDefinition>>(
      `/taxation/definitions${qs ? `?${qs}` : ''}`,
      { returnFullResponse: true },
      tenantSlug,
    );
    return {
      data: response.data ?? [],
      meta: normalizeListMeta(response.meta, {
        dataLength: response.data?.length ?? 0,
      }),
    };
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

  /** Lista aplicaciones tributarias (cursor + total). */
  listTaxRuleApplications: async (
    params?: CommercialListParams,
    tenantSlug?: string,
  ): Promise<CommercialPaginatedList<TaxRuleApplication>> => {
    const response = await request<CommercialCatalogListResponse<TaxRuleApplication>>(
      `/commercial/tax-rule-applications${buildCommercialListQuery(params)}`,
      { returnFullResponse: true },
      tenantSlug,
    );
    return { data: response.data, meta: response.meta };
  },

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
 * GET /tenants/me/summary — guard ADMIN; el home hace fan-out por rol
 * a los demás contratos de HLD §4.2 (no es fachada agregadora).
 */
export const dashboardApi = {
  /** Resumen de empresa (tenant 13 campos + settings + métricas + alertas). */
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
  sortBy?: string | undefined;
  sortDir?: 'asc' | 'desc' | undefined;
}

/** Dual-emit Ola 1: `total`/`page`/`limit` planos + `meta` ADR-065. */
export type ListAssuranceTicketsResponse = ListResponse<AssuranceTicket> & {
  /** @deprecated Usar meta.total — conservado para consumidores legacy. */
  total: number;
  /** @deprecated Usar meta.page */
  page?: number;
  /** @deprecated Usar meta.limit */
  limit?: number;
};

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
    list: async (
      params?: ListAssuranceTicketsParams,
      tenantSlug?: string,
    ): Promise<ListAssuranceTicketsResponse> => {
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
      if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
      if (params?.sortDir) searchParams.set('sortDir', params.sortDir);

      const query = searchParams.toString();
      const response = await request<{
        data: AssuranceTicket[];
        total?: number;
        page?: number;
        limit?: number;
        meta?: Partial<ListMeta>;
      }>(`/assurance/tickets${query ? `?${query}` : ''}`, { returnFullResponse: true }, tenantSlug);

      const meta = normalizeListMeta(
        {
          ...response.meta,
          ...(response.page != null ? { page: response.page } : {}),
          ...(response.limit != null ? { limit: response.limit } : {}),
          ...(response.total != null ? { total: response.total } : {}),
        },
        {
          dataLength: response.data.length,
          ...(params?.limit !== undefined ? { limit: params.limit } : {}),
        },
      );
      const total = response.total ?? meta.total;

      return {
        data: response.data,
        meta: { ...meta, total },
        total,
        page: meta.page ?? response.page ?? params?.page ?? 1,
        limit: meta.limit,
      };
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
  /** ADR-077 — causa reportada en campo. */
  nonRealizationCauseId?: string | null;
  /** ADR-077 — causa confirmada/reclasificada por coordinador. */
  reviewedCauseId?: string | null;
  /** ADR-077 — evidencia adjunta al intento. */
  evidenceSubmitted?: boolean | null;
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
  /** ADR-077 — discrimina reprogramación de intento fallido. */
  intent?: 'REPROGRAM' | 'FAILED_ATTEMPT' | null | undefined;
  /** ADR-077 — motivo del fallo. */
  failureReason?: string | null | undefined;
  /** ADR-077 — clave de la causa de no realización. */
  failureCause?: string | null | undefined;
  /** ADR-077 — referencia a la causa del catálogo. */
  nonRealizationCauseId?: string | null | undefined;
  /** ADR-077 — si se adjuntó evidencia del intento. */
  evidenceSubmitted?: boolean | null | undefined;
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
  /** ADR-065 Ola 7 — offset 1-based. */
  page?: number | undefined;
  limit?: number | undefined;
}

export type ListWfmScheduleEventsResponse = ListResponse<WfmScheduleEvent>;
export type ListWfmWorkOrdersResponse = ListResponse<WfmWorkOrder>;
export type ListWfmTechnicianAvailabilityResponse = ListResponse<WfmTechnicianAvailability>;
export type ListOperationalEventualitiesResponse = ListResponse<OperationalEventuality>;

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

/** ADR-077 — taxonomía de causa de no realización. */
export interface NonRealizationCause {
  id: string;
  code: string;
  label: string;
  category: 'CUSTOMER' | 'OPERATIONAL' | 'FORCE_MAJEURE';
  requiresEvidence: boolean;
}

/**
 * ADR-077 D4 — decisión explícita al agotar 3 intentos imputables al cliente.
 * Obligatorio en schedule cuando retryCount >= 3; sin él la API responde 400 accionable.
 */
export type VisitAttemptDecision = 'FORCE_RESCHEDULE' | 'CLOSE_CASE';

/**
 * Destino operativo tras la revisión E2 (vista visitas sin realizar).
 * RESCHEDULE deja la solicitud en REQUIRES_RESCHEDULE; CLOSE_CASE cierra el caso.
 */
export type ReviewNonRealizationDecision = 'RESCHEDULE' | 'CLOSE_CASE';

/** ADR-077 — revisión de causa por el coordinador. */
export interface ReviewNonRealizationCauseDto {
  nonRealizationCauseId: string;
  /** Notas del coordinador (persistidas en el evento). */
  notes?: string | null;
  /** Destino tras confirmar/reclasificar causa (E2). Ausente = solo reclasificar. */
  decision?: ReviewNonRealizationDecision | null;
}

/** ADR-077 — intento fallido registrado en el evento. */
export interface EventNonRealizationAttempt {
  eventId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  technicianId: string;
  technicianName: string;
  causeLabel: string | null;
  reviewedCauseLabel: string | null;
  causeReportedAt: string | null;
  evidenceSubmitted: boolean;
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
  /** ADR-077 — contador de intentos fallidos imputables al cliente. */
  retryCount?: number | null;
  /** ADR-077 — código de la causa reportada en campo. */
  failureCause?: string | null;
  /** ADR-077 — clave de la causa del catálogo asociada al último evento fallido. */
  nonRealizationCauseId?: string | null;
  /** ADR-077 — etiqueta visible de la causa de no realización. */
  lastNonRealizationCauseLabel?: string | null;
  /** ADR-076 — indica que esta visita es adicional (forzada) sobre trabajo activo. */
  isAdditional?: boolean | null;
  /** ADR-076 — motivo de la visita adicional. */
  additionalReason?: string | null;
}

export interface ListWfmVisitRequestsParams {
  status?: VisitRequestStatus | undefined;
  originContext?: WorkOrderSourceContext | undefined;
  workType?: WfmWorkType | undefined;
  priority?: WorkOrderPriority | undefined;
  municipality?: string | undefined;
  sector?: string | undefined;
  /** ADR-076 — pre-buscar por unidad de origen antes de POST create. */
  originRef?: string | undefined;
  /** Filtro por expediente CRM (columna dedicada; complementa originRef). */
  expedienteId?: string | undefined;
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
  /** ADR-076 — visita adicional sobre trabajo activo. */
  isAdditional?: boolean | null | undefined;
  /** ADR-076 — motivo de la visita adicional. */
  additionalReason?: string | null | undefined;
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
  /** ADR-076 — visita adicional sobre trabajo activo. */
  isAdditional?: boolean | null | undefined;
  /** ADR-076 — motivo de la visita adicional. */
  additionalReason?: string | null | undefined;
  /**
   * ADR-077 (propuesto) D4 — override al límite de 3 intentos.
   * FORCE_RESCHEDULE agenda; CLOSE_CASE cierra sin agendar y exige `closeReason`.
   */
  attemptDecision?: VisitAttemptDecision | null | undefined;
  /** Motivo obligatorio cuando attemptDecision es CLOSE_CASE (spec E5). */
  closeReason?: string | null | undefined;
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
  page?: number | undefined;
  limit?: number | undefined;
}

export interface ListOperationalEventualitiesParams {
  userId?: string | undefined;
  organizationSiteId?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface ListWfmWorkOrdersParams {
  page?: number | undefined;
  limit?: number | undefined;
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
      if (params?.originRef) searchParams.set('originRef', params.originRef);
      if (params?.expedienteId) searchParams.set('expedienteId', params.expedienteId);
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
      if (params?.page != null) searchParams.set('page', String(params.page));
      if (params?.limit != null) searchParams.set('limit', String(params.limit));

      const query = searchParams.toString();
      return request<ListWfmScheduleEventsResponse>(
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

    /** ADR-077 — revisión de causa por el coordinador. */
    reviewCause: (id: string, dto: ReviewNonRealizationCauseDto, tenantSlug?: string) =>
      request<WfmScheduleEvent>(
        `/wfm/events/${id}/review-cause`,
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),

    /** ADR-077 — historial de intentos de un evento. */
    getAttempts: (id: string, tenantSlug?: string) =>
      request<EventNonRealizationAttempt[]>(
        `/wfm/events/${id}/attempts`,
        { returnFullResponse: true },
        tenantSlug,
      ),

    remove: (id: string, tenantSlug?: string) =>
      request<void>(`/wfm/events/${id}`, { method: 'DELETE' }, tenantSlug),
  },

  /** ADR-077 — taxonomía de causas de no realización. */
  nonRealizationCauses: {
    list: (tenantSlug?: string) =>
      request<NonRealizationCause[]>(
        '/wfm/non-realization-causes',
        { returnFullResponse: true },
        tenantSlug,
      ),
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
    list: (params?: ListWfmWorkOrdersParams, tenantSlug?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.page != null) searchParams.set('page', String(params.page));
      if (params?.limit != null) searchParams.set('limit', String(params.limit));
      const query = searchParams.toString();
      return request<ListWfmWorkOrdersResponse>(
        `/wfm/work-orders${query ? `?${query}` : ''}`,
        { returnFullResponse: true },
        tenantSlug,
      );
    },

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
      if (params?.page != null) searchParams.set('page', String(params.page));
      if (params?.limit != null) searchParams.set('limit', String(params.limit));

      const query = searchParams.toString();
      return request<ListWfmTechnicianAvailabilityResponse>(
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
    list: (params?: ListOperationalEventualitiesParams, tenantSlug?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.userId) searchParams.set('userId', params.userId);
      if (params?.organizationSiteId)
        searchParams.set('organizationSiteId', params.organizationSiteId);
      if (params?.page != null) searchParams.set('page', String(params.page));
      if (params?.limit != null) searchParams.set('limit', String(params.limit));
      const query = searchParams.toString();
      return request<ListOperationalEventualitiesResponse>(
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
  /**
   * ¿Es el administrador principal designado de la empresa? (ADR-063)
   *
   * Solo llega en las rutas de lectura. `undefined` significa «la respuesta no
   * trae el dato», no «no lo es»: la UI no debe interpretarlo como `false`.
   */
  isPrincipalAdmin?: boolean | undefined;
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
  /** ADR-065: página 1-based (modo randomAccess). */
  page?: number;
  status?: string;
  role?: string;
  /** Texto libre para filtrar por nombre, apellido o email */
  search?: string;
}

/**
 * Alias de compatibilidad Ola 3 → contrato ADR-065.
 * @deprecated Preferir `ListMeta` de `@iwana/shared`.
 */
export type UsersPaginationMeta = ListMeta;

export type ListUsersResponse = ListResponse<InternalUser>;

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
    title: 'Programación',
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
    meta: EMPTY_LIST_META,
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

/** @deprecated Preferir tipos de `@iwana/shared` (contrato async Ola C). */
export type BulkCreateUsersApiResponse = UsersBulkJobResultResponse;

export type {
  UsersBulkCreateAcceptedResponse,
  UsersBulkJobResultResponse,
  UsersBulkJobStatusResponse,
};

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

/** Read-model agregado de prioridad del hub de configuración (MOD00). */
export const configurationApi = {
  settingsSections: {
    list: (tenantSlug?: string) =>
      request<SettingsSection[]>('/configuration/settings-sections', undefined, tenantSlug),
  },
  settingsPriority: {
    get: () => request<SettingsPriorityResponse>('/configuration/settings-priority'),
  },
};

export const organizationApi = {
  list: (params?: { page?: number; limit?: number }, tenantSlug?: string) => {
    const searchParams = new URLSearchParams();
    if (params?.page != null) searchParams.set('page', String(params.page));
    if (params?.limit != null) searchParams.set('limit', String(params.limit));
    const query = searchParams.toString();
    return request<ListResponse<OrganizationSiteSummary>>(
      `/organization/sites${query ? `?${query}` : ''}`,
      { returnFullResponse: true },
      tenantSlug,
    );
  },

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
    if (params?.page !== undefined) searchParams.set('page', String(params.page));
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

  /**
   * Encola importación masiva (H-06 / Ola C). Respuesta 202 sin secretos.
   * Credenciales solo vía `claimBulkJobResult`.
   */
  bulkCreate: (users: CreateInternalUserDto[], idempotencyKey: string, tenantSlug?: string) =>
    request<UsersBulkCreateAcceptedResponse>(
      '/users/bulk',
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ users }),
        // Body crudo sin envelope { data } (mismo precedente H-11).
        returnFullResponse: true,
      },
      tenantSlug,
    ),

  getBulkJobStatus: (jobId: string, tenantSlug?: string) =>
    request<UsersBulkJobStatusResponse>(
      `/users/bulk/jobs/${encodeURIComponent(jobId)}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  claimBulkJobResult: (jobId: string, tenantSlug?: string) =>
    request<UsersBulkJobResultResponse>(
      `/users/bulk/jobs/${encodeURIComponent(jobId)}/result`,
      { method: 'POST', returnFullResponse: true },
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
   * Self-service: requiere actor === id y, en flujo propio, currentPassword.
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

  /**
   * Lookup typeahead E-4 para pickers (`SearchablePicker`).
   * Respuesta `{ data: { id, label, sublabel }[], total }` — sin ListMeta.
   */
  searchForPicker: (
    params: { q: string; status?: string; limit?: number },
    options?: Pick<RequestOptions, 'signal'>,
    tenantSlug?: string,
  ) => {
    const searchParams = new URLSearchParams();
    searchParams.set('q', params.q);
    if (params.status) searchParams.set('status', params.status);
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));

    return request<PickerSearchResponse>(
      `/users/search?${searchParams.toString()}`,
      {
        returnFullResponse: true,
        ...(options?.signal ? { signal: options.signal } : {}),
      },
      tenantSlug,
    );
  },

  /**
   * Cambia el email de login de otro usuario (acción administrativa).
   * Requiere Idempotency-Key. Ruta: PATCH /users/:id/login-email/admin
   */
  changeLoginEmailAsAdmin: (
    id: string,
    dto: { email: string; syncCompanyContactEmail?: boolean },
    idempotencyKey: string,
    tenantSlug?: string,
  ) =>
    request<InternalUser>(
      `/users/${encodeURIComponent(id)}/login-email/admin`,
      {
        method: 'PATCH',
        headers: { 'Idempotency-Key': idempotencyKey },
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
  /** ADR-065 — orden declarado por el servidor (`sortableFields`). */
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/**
 * Envelope ADR-065 + dual-emit `total` plano (Ola 1) para no romper pickers E-4
 * (`TaskCoreFields` / typeahead) que aún leen `response.total`.
 */
export type ListSubscribersResponse = ListResponse<SubscriberRecord> & {
  /** @deprecated Preferir `meta.total`. Conservado por dual-emit / E-4. */
  total: number;
};

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
    options?: Pick<RequestOptions, 'signal'>,
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
      {
        returnFullResponse: true,
        ...(options?.signal ? { signal: options.signal } : {}),
      },
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

  list: async (
    params?: ListSubscribersParams,
    tenantSlug?: string,
    options?: Pick<RequestOptions, 'signal'>,
  ): Promise<ListSubscribersResponse> => {
    const searchParams = new URLSearchParams();

    if (params?.status) searchParams.set('status', params.status);
    if (params?.personType) searchParams.set('personType', params.personType);
    if (params?.customerSegment) searchParams.set('customerSegment', params.customerSegment);
    if (params?.stratum !== undefined) searchParams.set('stratum', String(params.stratum));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.sortDir) searchParams.set('sortDir', params.sortDir);

    const query = searchParams.toString();

    const response = await request<{
      data: SubscriberRecord[];
      total?: number;
      meta?: Partial<ListMeta>;
    }>(
      `/crm/subscribers${query ? `?${query}` : ''}`,
      {
        returnFullResponse: true,
        ...(options?.signal ? { signal: options.signal } : {}),
      },
      tenantSlug,
    );

    const meta = normalizeListMeta(response.meta, {
      dataLength: response.data.length,
      ...(params?.limit !== undefined ? { limit: params.limit } : {}),
    });
    const total = response.total ?? meta.total;

    return {
      data: response.data,
      meta: {
        ...meta,
        total,
      },
      total,
    };
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
  listBySubscriber: (
    subscriberId: string,
    params?: { page?: number; limit?: number },
    tenantSlug?: string,
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.page != null) searchParams.set('page', String(params.page));
    if (params?.limit != null) searchParams.set('limit', String(params.limit));
    const query = searchParams.toString();
    return request<ListResponse<Contract>>(
      `/crm/subscribers/${subscriberId}/contracts${query ? `?${query}` : ''}`,
      { returnFullResponse: true },
      tenantSlug,
    );
  },

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

  /** Lista todos los contratos (con filtros opcionales ?status=&planId=&page=&limit=). */
  findAll: (
    params?: { status?: ContractStatus; planId?: string; page?: number; limit?: number },
    tenantSlug?: string,
  ) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.planId) qs.set('planId', params.planId);
    if (params?.page != null) qs.set('page', String(params.page));
    if (params?.limit != null) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return request<ListResponse<Contract>>(
      `/crm/contracts${query ? `?${query}` : ''}`,
      { returnFullResponse: true },
      tenantSlug,
    );
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

/** Respuesta contractual del detalle de una OT; la plantilla puede no existir. */
export type ExecutionOrderDetailResponse = ExecutionOrderDetail;

export type ExecutionOrderActivityRecord = ExecutionOrderActivity;
export type ExecutionOrderItemUsageRecord = ExecutionOrderItemUsage;
export type ExecutionOrderEvidenceRecord = ExecutionOrderEvidence;
export type ExecutionOrderEvidencePage = Page<ExecutionOrderEvidenceRecord>;
export type ExecutionOrderCollectionPage<T> = Page<T>;

export interface ListExecutionOrderEntriesParams {
  page?: number;
  limit?: number;
}

/** DTO legacy derivado del comando congelado de @iwana/shared. */
export type StartExecutionOrderDto = Omit<StartExecutionOrderCommand, 'note'> & {
  note?: string | null;
};

export interface RegisterExecutionOrderFieldWorkDto {
  activityType: string;
  description: string;
}

/**
 * DTO de transporte derivado del comando canonico de @iwana/shared.
 */
export type RegisterExecutionOrderItemUsageDto = RegisterItemUsageCommand & {
  stockMovementId?: string | null;
};

/** DTO legacy derivado del comando congelado de @iwana/shared. */
export type CloseExecutionOrderDto = CloseExecutionOrderCommand & {
  closeNotes?: string | null;
  customerSignatureRef?: string | null;
};

export type RegisterExecutionOrderEvidenceDto = RegisterEvidenceCommand;

/** Headers obligatorios para cada comando de mutación de una OT. */
export function buildExecutionOrderCommandHeaders(currentVersion: number): Record<string, string> {
  if (!Number.isInteger(currentVersion) || currentVersion < 1) {
    throw new Error('La versión actual de la OT debe ser un entero positivo.');
  }

  return {
    'Idempotency-Key': crypto.randomUUID(),
    'If-Match': String(currentVersion),
  };
}

function buildExecutionOrderEntriesPath(
  id: string,
  resource: 'activities' | 'item-usage' | 'evidences',
  params?: ListExecutionOrderEntriesParams,
): string {
  const searchParams = new URLSearchParams();
  if (params?.page !== undefined) searchParams.set('page', String(params.page));
  if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();
  return `/tasks/execution-orders/${id}/${resource}${query ? `?${query}` : ''}`;
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
      request<ExecutionOrderDetailResponse>(
        `/tasks/execution-orders/${id}`,
        { returnFullResponse: true },
        tenantSlug,
      ),

    listActivities: (id: string, params?: ListExecutionOrderEntriesParams, tenantSlug?: string) =>
      request<
        ExecutionOrderCollectionPage<ExecutionOrderActivityRecord> | ExecutionOrderActivityRecord[]
      >(
        buildExecutionOrderEntriesPath(id, 'activities', params),
        { returnFullResponse: true },
        tenantSlug,
      ),

    listItemUsage: (id: string, params?: ListExecutionOrderEntriesParams, tenantSlug?: string) =>
      request<
        | ExecutionOrderCollectionPage<ExecutionOrderItemUsageRecord>
        | ExecutionOrderItemUsageRecord[]
      >(
        buildExecutionOrderEntriesPath(id, 'item-usage', params),
        { returnFullResponse: true },
        tenantSlug,
      ),

    listEvidence: (id: string, params?: ListExecutionOrderEntriesParams, tenantSlug?: string) =>
      request<ExecutionOrderEvidencePage | ExecutionOrderEvidenceRecord[]>(
        buildExecutionOrderEntriesPath(id, 'evidences', params),
        { returnFullResponse: true },
        tenantSlug,
      ),

    listTemplateVersions: (templateId: string, tenantSlug?: string) =>
      request<ExecutionOrderTemplateVersion[] | { data: ExecutionOrderTemplateVersion[] }>(
        `/tasks/execution-order-templates/${templateId}/versions`,
        { returnFullResponse: true },
        tenantSlug,
      ),

    start: (id: string, dto: StartExecutionOrderDto, currentVersion: number, tenantSlug?: string) =>
      request<ExecutionOrderRecord>(
        `/tasks/execution-orders/${id}/start`,
        {
          method: 'POST',
          headers: buildExecutionOrderCommandHeaders(currentVersion),
          body: JSON.stringify(dto),
          returnFullResponse: true,
        },
        tenantSlug,
      ),

    registerFieldWork: (
      id: string,
      dto: RegisterExecutionOrderFieldWorkDto,
      currentVersion: number,
      tenantSlug?: string,
    ) =>
      request<ExecutionOrderActivityRecord>(
        `/tasks/execution-orders/${id}/field-work`,
        {
          method: 'POST',
          headers: buildExecutionOrderCommandHeaders(currentVersion),
          body: JSON.stringify(dto),
          returnFullResponse: true,
        },
        tenantSlug,
      ),

    registerItemUsage: (
      id: string,
      dto: RegisterExecutionOrderItemUsageDto,
      currentVersion: number,
      tenantSlug?: string,
    ) =>
      request<ExecutionOrderItemUsageRecord>(
        `/tasks/execution-orders/${id}/item-usage`,
        {
          method: 'POST',
          headers: buildExecutionOrderCommandHeaders(currentVersion),
          body: JSON.stringify(dto),
          returnFullResponse: true,
        },
        tenantSlug,
      ),

    uploadEvidenceAsset: (id: string, file: File, currentVersion: number, tenantSlug?: string) => {
      const formData = new FormData();
      formData.append('file', file);
      return request<EvidenceAssetReceipt>(
        `/tasks/execution-orders/${id}/evidence-assets`,
        {
          method: 'POST',
          headers: buildExecutionOrderCommandHeaders(currentVersion),
          body: formData,
          returnFullResponse: true,
        },
        tenantSlug,
      );
    },

    registerEvidence: (
      id: string,
      dto: RegisterExecutionOrderEvidenceDto,
      currentVersion: number,
      tenantSlug?: string,
    ) => {
      if (!dto.requirementKey.trim()) {
        throw new Error('La evidencia requiere un requisito válido de la plantilla.');
      }

      return request<ExecutionOrderEvidenceRecord>(
        `/tasks/execution-orders/${id}/evidence`,
        {
          method: 'POST',
          headers: buildExecutionOrderCommandHeaders(currentVersion),
          body: JSON.stringify(dto),
          returnFullResponse: true,
        },
        tenantSlug,
      );
    },

    close: (id: string, dto: CloseExecutionOrderDto, currentVersion: number, tenantSlug?: string) =>
      request<ExecutionOrderRecord>(
        `/tasks/execution-orders/${id}/close`,
        {
          method: 'POST',
          headers: buildExecutionOrderCommandHeaders(currentVersion),
          body: JSON.stringify(dto),
          returnFullResponse: true,
        },
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
  /**
   * Valor estimado del inventario (Σ onHand × costo unitario).
   * Semántica F4: prioriza averageCost → lastPurchaseCost → standardCost → baseCost (D-F4-8).
   */
  estimatedTotalValue: number;
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
  /**
   * Valor estimado de la categoría (Σ onHand × costo unitario).
   * Semántica F4: prioriza averageCost en la cadena D-F4-8.
   */
  estimatedValue: number;
}

export type ReplenishmentCriticality = 'out' | 'below-minimum' | 'below-reorder';

export interface ReplenishmentSuggestionRecord {
  itemId: string;
  itemSku: string;
  itemName: string;
  unitOfMeasure: string;
  available: string;
  pendingPurchase: string;
  minimumStock: string;
  reorderPoint: string;
  targetStock: string;
  suggestedQty: string;
  orderMultiple: string | null;
  minimumOrderQty: string | null;
  leadTimeDays: number | null;
  preferredSupplier: { partyRefId: string; displayName: string | null } | null;
  estimatedUnitCost: string | null;
  estimatedLineValue: string | null;
  criticality: ReplenishmentCriticality;
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
  /** Costo promedio móvil por ítem (ADR-059). Numeric as string. */
  averageCost: string;
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

export type UsefulLifeStatus = 'sin-dato' | 'vigente' | 'por-vencer' | 'vencida';

export type AssetLoanStatus = 'abierto' | 'cerrado';

export interface SerializedAssetDetailItemRecord {
  id: string;
  sku: string;
  name: string;
  categoryName: string | null;
}

export interface SerializedAssetDetailLocationRecord {
  id: string;
  code: string;
  name: string;
  type: StockLocationType;
}

export interface SerializedAssetPurchaseOriginRecord {
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  goodsReceiptId: string | null;
  receivedAt: string | null;
  supplierPartyRefId: string | null;
  supplierDisplayName: string | null;
  unitCost: string | null;
}

export interface SerializedAssetUsefulLifeRecord {
  monthsTotal: number | null;
  monthsElapsed: number | null;
  monthsRemaining: number | null;
  warrantyUntil: string | null;
  status: UsefulLifeStatus;
}

export interface AssetLifecycleEventRecord {
  id: string;
  eventType: AssetLifecycleEventType;
  fromStatus: SerializedAssetStatus | null;
  toStatus: SerializedAssetStatus | null;
  locationId: string | null;
  locationName: string | null;
  responsibleRefId: string | null;
  actorUserId: string | null;
  notes: string | null;
  occurredAt: string;
  stockMovementId: string | null;
}

export interface AssetLoanRecord {
  id: string;
  serializedAssetId: string;
  subscriberRefId: string;
  contractRefId: string | null;
  installedAt: string;
  removedAt: string | null;
  executionOrderRefId: string | null;
  stockMovementId: string | null;
  status: AssetLoanStatus;
}

export interface PaginatedAssetLoans {
  data: AssetLoanRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface ListAssetLoansParams {
  status?: AssetLoanStatus;
  subscriberRefId?: string;
  contractRefId?: string;
  serializedAssetId?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedAssetLifecycleEvents {
  data: AssetLifecycleEventRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedAssetMovements {
  data: StockMovementKardexRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface SerializedAssetDetailRecord extends SerializedAssetRecord {
  item: SerializedAssetDetailItemRecord | null;
  currentLocation: SerializedAssetDetailLocationRecord | null;
  purchaseOrigin: SerializedAssetPurchaseOriginRecord | null;
  usefulLife: SerializedAssetUsefulLifeRecord;
  lifecycle: PaginatedAssetLifecycleEvents;
  movements: PaginatedAssetMovements;
  loans: { data: AssetLoanRecord[]; total: number };
}

export interface GetSerializedAssetParams {
  lifecyclePage?: number;
  lifecycleLimit?: number;
  movementsPage?: number;
  movementsLimit?: number;
}

/** Estados incluidos en el listado de alertas de vida útil (excluye `sin-dato` y `vigente`). */
export type UsefulLifeAlertStatus = Extract<UsefulLifeStatus, 'por-vencer' | 'vencida'>;

export interface UsefulLifeAlertRecord {
  id: string;
  serialNumber: string | null;
  assetTag: string | null;
  sku: string | null;
  itemName: string | null;
  status: UsefulLifeAlertStatus;
  monthsRemaining: number | null;
  monthsTotal: number | null;
  purchaseDate: string | null;
  warrantyUntil: string | null;
}

export interface PaginatedUsefulLifeAlerts {
  data: UsefulLifeAlertRecord[];
  total: number;
  page: number;
  pageSize: number;
  limit: number;
}

export interface ListUsefulLifeAlertsParams {
  status?: UsefulLifeAlertStatus;
  page?: number;
  pageSize?: number;
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

export interface StockMovementKardexLineRecord {
  id: string;
  itemId: string;
  itemName: string | null;
  itemSku: string | null;
  locationId: string;
  locationName: string | null;
  lotId: string | null;
  lotNumber: string | null;
  serializedAssetId: string | null;
  quantity: string;
  unitCost: string | null;
}

export interface StockMovementKardexRecord {
  id: string;
  movementNumber: string;
  origin: StockMovementOrigin;
  originContext: string;
  originRefId: string | null;
  adjustmentReason: StockAdjustmentReason | null;
  notes: string | null;
  actorUserId: string | null;
  isReversal: boolean;
  createdAt: string;
  lines: StockMovementKardexLineRecord[];
}

export interface PaginatedStockMovements {
  data: StockMovementKardexRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface ListStockMovementsParams {
  itemId?: string;
  locationId?: string;
  serializedAssetId?: string;
  origin?: StockMovementOrigin;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateStockAdjustmentDto {
  itemId: string;
  locationId: string;
  lotId?: string | null;
  condition?: StockBalanceCondition;
  quantityDelta: number;
  reason: StockAdjustmentReason;
  notes?: string | null;
  idempotencyKey: string;
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
  resolutionReason?: string | null;
  resolvedByUserId?: string | null;
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
  displayName?: string | null;
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
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  department?: string | null;
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
  /** Dual-emit ADR-065 — preferir `meta` cuando exista. */
  meta?: ListMeta;
  /** @deprecated Dual-emit — leer `meta.total`. */
  total: number;
  /** @deprecated Dual-emit — leer `meta.page`. */
  page: number;
  /** @deprecated Dual-emit — leer `meta.limit`. */
  limit: number;
}

export interface SupplierQuoteLineRecord {
  id: string;
  tenantId: string;
  supplierQuoteId: string;
  purchaseRequestLineId: string;
  quantity: string;
  unitCost: string;
  lineAmount: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierQuoteRecord {
  id: string;
  tenantId: string;
  purchaseRequestId: string;
  partyRefId: string;
  quoteNumber: string;
  amount: string;
  shippingCost: string;
  currency: string;
  validUntil: string | null;
  notes: string | null;
  rfqId?: string | null;
  rfqInvitationId?: string | null;
  lines?: SupplierQuoteLineRecord[];
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
  cancellationReason: string | null;
  cancelledByUserId: string | null;
  closedByUserId: string | null;
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
  page?: number;
  limit?: number;
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

/**
 * Alias de compatibilidad Ola 3 → contrato ADR-065.
 * @deprecated Preferir `ListMeta` de `@iwana/shared`.
 */
export type InventoryListMeta = ListMeta;

export type InventoryPaginatedList<T> = ListResponse<T>;

/** Default FE alineado a API (`INVENTORY_LIST_DEFAULT_LIMIT`). */
export const INVENTORY_LIST_PAGE_SIZE = 20;

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
  /** Ola 6: overview «solo bajo mínimo» (out ∪ below-minimum). */
  belowMinimum?: boolean;
  /** Alcance de agregación de saldos para `belowMinimum`. */
  stockLocationId?: string;
  cursor?: string;
  limit?: number;
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
  /** Costo promedio (contrato F4). En UI se muestra en lectura; el backend lo actualiza en recepción. */
  averageCost?: number;
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
  cursor?: string;
  limit?: number;
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
  /** Ola 6: búsqueda por nombre/código/responsable. */
  search?: string;
  /** Ola 6: `mobile` → tipos de custodia móvil. */
  custody?: 'mobile';
  /** Ola 6: grupo inactivo/archivado. */
  statusGroup?: 'inactive_group';
  /** Ola 6: solo ubicaciones con saldo > 0. */
  withStock?: boolean;
  cursor?: string;
  limit?: number;
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
  /** Offset numerado (excluyente con `cursor`). */
  page?: number;
  cursor?: string;
  limit?: number;
}

export interface ListStockBalancesParams {
  itemId?: string;
  locationId?: string;
  condition?: StockBalanceCondition;
  cursor?: string;
  limit?: number;
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

export interface InventoryWriteOffRecord {
  id: string;
  tenantId: string;
  serializedAssetId: string | null;
  itemId: string | null;
  locationId: string;
  quantity: string;
  reason: WriteOffReason;
  status: WriteOffStatus;
  requestedByUserId: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
  rejectedByUserId: string | null;
  rejectedAt: string | null;
  rejectionNotes: string | null;
  stockMovementId: string | null;
  notes: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  movementNumber?: string | null;
}

export interface PaginatedWriteOffs {
  data: InventoryWriteOffRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface ListWriteOffsParams {
  status?: WriteOffStatus;
  reason?: WriteOffReason;
  itemId?: string;
  serializedAssetId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface RejectWriteOffDto {
  rejectionNotes?: string | null;
}

type WriteOffApiDetail = InventoryWriteOffRecord & {
  movement?: { id: string; movementNumber: string } | null;
  location?: unknown;
  item?: unknown;
  serializedAsset?: unknown;
};

type WriteOffApproveApiResponse = {
  writeOff: WriteOffApiDetail;
  movementResult?: { movement?: { movementNumber?: string | null } };
};

function normalizeWriteOffRecord(payload: WriteOffApiDetail): InventoryWriteOffRecord {
  const { movement, location, item, serializedAsset, ...rest } = payload;
  void location;
  void item;
  void serializedAsset;

  return {
    ...rest,
    quantity: String(rest.quantity),
    movementNumber: rest.movementNumber ?? movement?.movementNumber ?? null,
  };
}

async function normalizeWriteOffApproveResponse(
  payload: WriteOffApproveApiResponse | WriteOffApiDetail,
): Promise<InventoryWriteOffRecord> {
  if ('writeOff' in payload && payload.writeOff) {
    const normalized = normalizeWriteOffRecord(payload.writeOff);
    return {
      ...normalized,
      movementNumber:
        normalized.movementNumber ?? payload.movementResult?.movement?.movementNumber ?? null,
    };
  }

  return normalizeWriteOffRecord(payload as WriteOffApiDetail);
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
  /** Ola 6: id, bodegas, refs, costCenter. */
  search?: string;
  /** Ola 6: offset; excluyente con cursor. */
  page?: number;
  cursor?: string;
  limit?: number;
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

export interface ListStockCountsParams {
  status?: StockCountStatus;
  locationId?: string;
  /** Offset numerado (excluyente con `cursor`). */
  page?: number;
  cursor?: string;
  limit?: number;
}

export interface CreateStockCountDto {
  locationId: string;
  categoryId?: string | null;
  notes?: string | null;
}

export interface UpdateStockCountLineDto {
  id?: string;
  itemId?: string;
  lotId?: string | null;
  condition?: StockBalanceCondition;
  expectedQty?: number;
  countedQty: number;
}

export interface UpdateStockCountDto {
  lines: UpdateStockCountLineDto[];
}

export interface StockCountLineRecord {
  id: string;
  tenantId: string;
  countId: string;
  itemId: string;
  lotId: string | null;
  condition: StockBalanceCondition;
  expectedQty: string;
  countedQty: string | null;
  variance: string | null;
  itemSku?: string | null;
  itemName?: string | null;
  createdAt: string;
}

export interface StockCountRecord {
  id: string;
  tenantId: string;
  countNumber: string;
  status: StockCountStatus;
  locationId: string;
  categoryId: string | null;
  notes: string | null;
  createdByUserId: string;
  closedByUserId: string | null;
  closedAt: string | null;
  stockMovementId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockCountDetailRecord extends StockCountRecord {
  lines: StockCountLineRecord[];
}

export type PurchaseRequestKpiPreset =
  | 'pendingQuotes'
  | 'pendingApproval'
  | 'readyForPo'
  | 'pendingReceipt'
  | 'urgent'
  | 'overdue';

export interface ListPurchaseRequestsParams {
  status?: PurchaseRequestStatus;
  requestType?: PurchaseRequestType;
  priority?: PurchaseRequestPriority;
  requestingArea?: string;
  /** Ola 6: número, título o área. */
  search?: string;
  /** Ola 6: presets KPI del portal. */
  kpiPreset?: PurchaseRequestKpiPreset;
  /** Ola 6: offset; excluyente con cursor. */
  page?: number;
  cursor?: string;
  limit?: number;
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

export interface AddSupplierQuoteLineDto {
  purchaseRequestLineId: string;
  unitCost: number;
}

export interface AddSupplierQuoteDto {
  partyRefId: string;
  quoteNumber: string;
  amount?: number;
  shippingCost?: number;
  currency: string;
  validUntil?: string | null;
  notes?: string | null;
  rfqInvitationId?: string | null;
  lines?: AddSupplierQuoteLineDto[];
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

export interface RejectPurchaseRequestDto {
  reason: string;
}

export interface CancelPurchaseRequestDto {
  reason: string;
}

export interface UpdatePurchaseRequestDto {
  title?: string;
  priority?: PurchaseRequestPriority;
  requestingArea?: string;
  justification?: string;
  neededByDate?: string | null;
  notes?: string | null;
  lines?: CreatePurchaseRequestLineDto[];
}

export interface CancelPurchaseOrderDto {
  reason: string;
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

export interface PurchaseOrderBatchOrderInput {
  partyRefId: string;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  lines: PurchaseOrderLineInput[];
}

export interface CreatePurchaseOrderDto {
  purchaseRequestId: string;
  /** Modo legado: un proveedor + lines. Omitir si se usa `orders`. */
  partyRefId?: string;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  lines?: PurchaseOrderLineInput[];
  /** Modo batch: una OC por entrada (típicamente un proveedor). */
  orders?: PurchaseOrderBatchOrderInput[];
  status?: PurchaseOrderStatus;
}

export interface CreatePurchaseOrderBatchResult {
  orders: PurchaseOrderRecord[];
}

export type CreatePurchaseOrderResult = PurchaseOrderRecord | CreatePurchaseOrderBatchResult;

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
    request<InventoryPaginatedList<InventoryItemRecord>>(
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
        belowMinimum: params?.belowMinimum === true ? 'true' : undefined,
        stockLocationId: params?.stockLocationId,
        cursor: params?.cursor,
        limit: params?.limit != null ? String(params.limit) : undefined,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  /**
   * Lookup typeahead E-4 para pickers (`SearchablePicker`).
   * Respuesta `{ data: { id, label, sublabel }[], total }` — sin ListMeta.
   */
  searchItemsForPicker: (
    params: { q: string; status?: string; limit?: number },
    options?: Pick<RequestOptions, 'signal'>,
    tenantSlug?: string,
  ) => {
    const searchParams = new URLSearchParams();
    searchParams.set('q', params.q);
    if (params.status) searchParams.set('status', params.status);
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));

    return request<PickerSearchResponse>(
      `/inventory/items/search?${searchParams.toString()}`,
      {
        returnFullResponse: true,
        ...(options?.signal ? { signal: options.signal } : {}),
      },
      tenantSlug,
    );
  },

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

  /** Lista categorías de inventario (cursor + total, ADR-064). */
  listCategories: (params?: ListInventoryCategoriesParams, tenantSlug?: string) =>
    request<InventoryPaginatedList<InventoryCategoryRecord>>(
      `/inventory/categories${buildInventoryQuery({
        search: params?.search,
        status: params?.status,
        cursor: params?.cursor,
        limit: params?.limit !== undefined ? String(params.limit) : undefined,
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
    request<InventoryPaginatedList<StockLocationRecord>>(
      `/inventory/locations${buildInventoryQuery({
        type: params?.type,
        status: params?.status,
        responsibleRefId: params?.responsibleRefId,
        search: params?.search,
        custody: params?.custody,
        statusGroup: params?.statusGroup,
        withStock: params?.withStock === true ? 'true' : undefined,
        cursor: params?.cursor,
        limit: params?.limit != null ? String(params.limit) : undefined,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  /**
   * Lookup typeahead E-4 — ubicaciones / bodegas.
   * Label = nombre; sublabel = código.
   */
  searchLocationsForPicker: (
    params: { q: string; status?: string; limit?: number },
    options?: Pick<RequestOptions, 'signal'>,
    tenantSlug?: string,
  ) => {
    const searchParams = new URLSearchParams();
    searchParams.set('q', params.q);
    if (params.status) searchParams.set('status', params.status);
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));

    return request<PickerSearchResponse>(
      `/inventory/locations/search?${searchParams.toString()}`,
      {
        returnFullResponse: true,
        ...(options?.signal ? { signal: options.signal } : {}),
      },
      tenantSlug,
    );
  },

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
    request<InventoryPaginatedList<SerializedAssetRecord>>(
      `/inventory/assets${buildInventoryQuery({
        itemId: params?.itemId,
        status: params?.status,
        locationId: params?.locationId,
        serialNumber: params?.serialNumber,
        page: params?.page != null ? String(params.page) : undefined,
        cursor: params?.cursor,
        limit: params?.limit != null ? String(params.limit) : undefined,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  /**
   * Lookup typeahead E-4 — activos serializados.
   * Label = serial|tag; sublabel = SKU ….
   */
  searchAssetsForPicker: (
    params: { q: string; limit?: number },
    options?: Pick<RequestOptions, 'signal'>,
    tenantSlug?: string,
  ) => {
    const searchParams = new URLSearchParams();
    searchParams.set('q', params.q);
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));

    return request<PickerSearchResponse>(
      `/inventory/assets/search?${searchParams.toString()}`,
      {
        returnFullResponse: true,
        ...(options?.signal ? { signal: options.signal } : {}),
      },
      tenantSlug,
    );
  },

  getAsset: (id: string, params?: GetSerializedAssetParams, tenantSlug?: string) =>
    request<SerializedAssetDetailRecord>(
      `/inventory/assets/${id}${buildInventoryQuery({
        lifecyclePage: params?.lifecyclePage != null ? String(params.lifecyclePage) : undefined,
        lifecycleLimit: params?.lifecycleLimit != null ? String(params.lifecycleLimit) : undefined,
        movementsPage: params?.movementsPage != null ? String(params.movementsPage) : undefined,
        movementsLimit: params?.movementsLimit != null ? String(params.movementsLimit) : undefined,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  listUsefulLifeAlerts: (params?: ListUsefulLifeAlertsParams, tenantSlug?: string) =>
    request<PaginatedUsefulLifeAlerts>(
      `/inventory/assets/useful-life-alerts${buildInventoryQuery({
        status: params?.status,
        page: params?.page != null ? String(params.page) : undefined,
        pageSize: params?.pageSize != null ? String(params.pageSize) : undefined,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  listLoans: (params?: ListAssetLoansParams, tenantSlug?: string) =>
    request<PaginatedAssetLoans>(
      `/inventory/loans${buildInventoryQuery({
        status: params?.status,
        subscriberRefId: params?.subscriberRefId,
        contractRefId: params?.contractRefId,
        serializedAssetId: params?.serializedAssetId,
        page: params?.page != null ? String(params.page) : undefined,
        limit: params?.limit != null ? String(params.limit) : undefined,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  listBalances: (params?: ListStockBalancesParams, tenantSlug?: string) =>
    request<InventoryPaginatedList<StockBalanceRecord>>(
      `/inventory/balances${buildInventoryQuery({
        itemId: params?.itemId,
        locationId: params?.locationId,
        condition: params?.condition,
        cursor: params?.cursor,
        limit: params?.limit != null ? String(params.limit) : undefined,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  listMovements: (params?: ListStockMovementsParams, tenantSlug?: string) =>
    request<PaginatedStockMovements>(
      `/inventory/movements${buildInventoryQuery({
        itemId: params?.itemId,
        locationId: params?.locationId,
        serializedAssetId: params?.serializedAssetId,
        origin: params?.origin,
        dateFrom: params?.dateFrom,
        dateTo: params?.dateTo,
        search: params?.search,
        page: params?.page != null ? String(params.page) : undefined,
        limit: params?.limit != null ? String(params.limit) : undefined,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  listReplenishmentSuggestions: (tenantSlug?: string) =>
    request<ReplenishmentSuggestionRecord[]>(
      '/inventory/replenishment/suggestions',
      { returnFullResponse: true },
      tenantSlug,
    ),

  getMovement: (id: string, tenantSlug?: string) =>
    request<StockMovementKardexRecord>(
      `/inventory/movements/${id}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  createAdjustment: (dto: CreateStockAdjustmentDto, tenantSlug?: string) =>
    request<StockMovementResultRecord>(
      '/inventory/adjustments',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
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

  writeOff: async (dto: WriteOffAssetDto, tenantSlug?: string) =>
    normalizeWriteOffRecord(
      await request<WriteOffApiDetail>(
        '/inventory/write-offs',
        { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
        tenantSlug,
      ),
    ),

  writeOffs: {
    list: async (params?: ListWriteOffsParams, tenantSlug?: string) => {
      const response = await request<PaginatedWriteOffs & { data: WriteOffApiDetail[] }>(
        `/inventory/write-offs${buildInventoryQuery({
          status: params?.status,
          reason: params?.reason,
          itemId: params?.itemId,
          serializedAssetId: params?.serializedAssetId,
          dateFrom: params?.dateFrom,
          dateTo: params?.dateTo,
          page: params?.page != null ? String(params.page) : undefined,
          limit: params?.limit != null ? String(params.limit) : undefined,
        })}`,
        { returnFullResponse: true },
        tenantSlug,
      );

      return {
        ...response,
        data: response.data.map(normalizeWriteOffRecord),
      };
    },

    get: async (id: string, tenantSlug?: string) =>
      normalizeWriteOffRecord(
        await request<WriteOffApiDetail>(
          `/inventory/write-offs/${id}`,
          { returnFullResponse: true },
          tenantSlug,
        ),
      ),

    approve: async (id: string, tenantSlug?: string) =>
      normalizeWriteOffApproveResponse(
        await request<WriteOffApproveApiResponse>(
          `/inventory/write-offs/${id}/approve`,
          { method: 'POST', body: JSON.stringify({}), returnFullResponse: true },
          tenantSlug,
        ),
      ),

    reject: async (id: string, dto?: RejectWriteOffDto, tenantSlug?: string) =>
      normalizeWriteOffRecord(
        await request<WriteOffApiDetail>(
          `/inventory/write-offs/${id}/reject`,
          { method: 'POST', body: JSON.stringify(dto ?? {}), returnFullResponse: true },
          tenantSlug,
        ),
      ),
  },

  createCounterPurchase: (dto: CreateCounterPurchaseDto, tenantSlug?: string) =>
    request<StockMovementResultRecord>(
      '/inventory/counter-purchases',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  listIssues: (params?: ListStockIssuesParams, tenantSlug?: string) =>
    request<InventoryPaginatedList<StockIssueRecord>>(
      `/inventory/issues${buildInventoryQuery({
        type: params?.type,
        status: params?.status,
        sourceLocationId: params?.sourceLocationId,
        destinationLocationId: params?.destinationLocationId,
        search: params?.search,
        page: params?.page != null ? String(params.page) : undefined,
        cursor: params?.cursor,
        limit: params?.limit != null ? String(params.limit) : undefined,
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

  listCounts: (params?: ListStockCountsParams, tenantSlug?: string) =>
    request<InventoryPaginatedList<StockCountRecord>>(
      `/inventory/counts${buildInventoryQuery({
        status: params?.status,
        locationId: params?.locationId,
        page: params?.page != null ? String(params.page) : undefined,
        cursor: params?.cursor,
        limit: params?.limit != null ? String(params.limit) : undefined,
      })}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  createCount: (dto: CreateStockCountDto, tenantSlug?: string) =>
    request<StockCountDetailRecord>(
      '/inventory/counts',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  getCount: (id: string, tenantSlug?: string) =>
    request<StockCountDetailRecord>(
      `/inventory/counts/${id}`,
      { returnFullResponse: true },
      tenantSlug,
    ),

  updateCount: (id: string, dto: UpdateStockCountDto, tenantSlug?: string) =>
    request<StockCountDetailRecord>(
      `/inventory/counts/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  closeCount: (id: string, tenantSlug?: string) =>
    request<StockCountDetailRecord>(
      `/inventory/counts/${id}/close`,
      { method: 'POST', body: JSON.stringify({}), returnFullResponse: true },
      tenantSlug,
    ),

  cancelCount: (id: string, tenantSlug?: string) =>
    request<StockCountRecord>(
      `/inventory/counts/${id}/cancel`,
      { method: 'POST', body: JSON.stringify({}), returnFullResponse: true },
      tenantSlug,
    ),
};

export const purchasingApi = {
  listRequests: (params?: ListPurchaseRequestsParams, tenantSlug?: string) =>
    request<InventoryPaginatedList<PurchaseRequestRecord>>(
      `/purchasing/requests${buildInventoryQuery({
        status: params?.status,
        requestType: params?.requestType,
        priority: params?.priority,
        requestingArea: params?.requestingArea,
        search: params?.search,
        kpiPreset: params?.kpiPreset,
        page: params?.page != null ? String(params.page) : undefined,
        cursor: params?.cursor,
        limit: params?.limit != null ? String(params.limit) : undefined,
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

  updateRequest: (id: string, dto: UpdatePurchaseRequestDto, tenantSlug?: string) =>
    request<PurchaseRequestRecord>(
      `/purchasing/requests/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
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

  rejectRequest: (id: string, dto: RejectPurchaseRequestDto, tenantSlug?: string) =>
    request<PurchaseRequestRecord>(
      `/purchasing/requests/${id}/reject`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  cancelRequest: (id: string, dto: CancelPurchaseRequestDto, tenantSlug?: string) =>
    request<PurchaseRequestRecord>(
      `/purchasing/requests/${id}/cancel`,
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

  searchSuppliers: (
    params?: ListSuppliersParams,
    tenantSlug?: string,
    options?: Pick<RequestOptions, 'signal'>,
  ) =>
    request<SupplierSearchResultRecord>(
      `/purchasing/providers${buildInventoryQuery({
        search: params?.search,
        page: params?.page ? String(params.page) : undefined,
      })}`,
      {
        returnFullResponse: true,
        ...(options?.signal ? { signal: options.signal } : {}),
      },
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
    request<CreatePurchaseOrderResult>(
      '/purchasing/orders',
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  listOrders: (params?: ListPurchaseOrdersParams, tenantSlug?: string) =>
    request<InventoryPaginatedList<PurchaseOrderRecord>>(
      `/purchasing/orders${buildInventoryQuery({
        status: params?.status,
        purchaseRequestId: params?.purchaseRequestId,
        page: params?.page != null ? String(params.page) : undefined,
        limit: params?.limit != null ? String(params.limit) : undefined,
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

  approveOrder: (id: string, tenantSlug?: string) =>
    request<PurchaseOrderRecord>(
      `/purchasing/orders/${id}/approve`,
      { method: 'POST', returnFullResponse: true },
      tenantSlug,
    ),

  cancelOrder: (id: string, dto: CancelPurchaseOrderDto, tenantSlug?: string) =>
    request<PurchaseOrderRecord>(
      `/purchasing/orders/${id}/cancel`,
      { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
      tenantSlug,
    ),

  closeOrder: (id: string, tenantSlug?: string) =>
    request<PurchaseOrderRecord>(
      `/purchasing/orders/${id}/close`,
      { method: 'POST', returnFullResponse: true },
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

  downloadRfqInvitationsZip: async (rfqId: string, tenantSlug?: string) => {
    const resolvedTenantSlug = getTenantSlug(tenantSlug);
    const token = readStoredAccessToken();
    const headers = new Headers();
    headers.set('X-Tenant-Slug', resolvedTenantSlug);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await fetch(`${resolveApiBase()}/purchasing/rfqs/${rfqId}/invitations/pdf.zip`, {
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
      filename: filenameMatch?.[1] ?? `RFQ-${rfqId}-cotizaciones.zip`,
    };
  },

  downloadRfqInvitationPdf: async (rfqId: string, invitationId: string, tenantSlug?: string) => {
    const resolvedTenantSlug = getTenantSlug(tenantSlug);
    const token = readStoredAccessToken();
    const headers = new Headers();
    headers.set('X-Tenant-Slug', resolvedTenantSlug);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await fetch(
      `${resolveApiBase()}/purchasing/rfqs/${rfqId}/invitations/${invitationId}/pdf`,
      {
        headers,
        credentials: 'include',
      },
    );

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
      filename: filenameMatch?.[1] ?? `RFQ-${rfqId}-${invitationId}.pdf`,
    };
  },
};
