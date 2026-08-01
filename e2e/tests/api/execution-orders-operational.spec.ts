/**
 * E2E — Flujo operativo de Órdenes de Trabajo (OT) de ejecución.
 *
 * Estas pruebas se ejecutan contra el API real + PostgreSQL; solo se mockean
 * dependencias externas (MinIO/S3, notificaciones push, APIs de terceros).
 *
 * Cobertura (P1-2):
 * - Happy path E2E: programación → inicio → actividad → consumo → evidencia → cierre
 * - Inmutabilidad terminal: OT cerrada rechaza más comandos
 * - Concurrencia: cierre concurrente con idempotencia
 * - Rate limiting: ráfagas de requests → 429 + headers, aislamiento por actor
 *   y por tenant, y fail-closed cuando el Redis real del stack E2E se detiene
 *   (scripts/e2e-redis-fault.mjs, QA-33)
 * - Permisos: coordinador sin execute → 403, no auth → 401
 * - BOLA: inquilino A no accede a OT de inquilino B → 404
 * - Evidencia: upload → poll receipt → register → signed URL
 *
 * PRERREQUISITO — Ejecutar el script de provisión antes de correr la suite:
 *   npx tsx e2e/scripts/provision-execution-template.ts
 *
 * Este script inserta la plantilla E2E_HAPPY_PATH directamente en la base de
 * datos del tenant (la API no expone el endpoint de creación de plantillas con
 * los tokens disponibles en la suite: nocToken carece del permiso
 * operations.execution_order_templates.manage y platformToken no pasa el
 * RolesGuard del controller).
 *
 * Ejecución:
 *   pnpm exec playwright test e2e/tests/api/execution-orders-operational.spec.ts \
 *     --config e2e/playwright.api.config.ts
 *
 * Variables de entorno:
 *   API_BASE_URL      http://127.0.0.1:3000  (por defecto)
 *   E2E_PLATFORM_EMAIL    admin@iwana.local
 *   E2E_PLATFORM_PASSWORD Admin123!
 *   E2E_TENANT_SLUG       isp-demo
 */

import { expect, request, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ─── Constantes ──────────────────────────────────────────────────────────────

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3000';
const API_PREFIX = `${API_BASE}/api/v1`;

const PLATFORM_EMAIL =
  process.env.E2E_PLATFORM_EMAIL ?? process.env.PLATFORM_SUPER_ADMIN_EMAIL ?? 'admin@iwana.co';
const PLATFORM_PASSWORD =
  process.env.E2E_PLATFORM_PASSWORD ??
  process.env.PLATFORM_SUPER_ADMIN_PASSWORD ??
  'IwanaAdmin!2026';

const TENANT_SLUG = process.env.E2E_TENANT_SLUG || 'isp-demo';
const OPERATIONAL_SITE_ID = process.env.E2E_OPERATIONAL_SITE_ID || '';

/** Fecha límite de expiración para que el rate limit del health check no se dispare. */
const HEALTH_RETRIES = 5;
const HEALTH_RETRY_DELAY_MS = 2_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
/**
 * Clave de requisito que el contrato de cierre exige para la firma del cliente.
 * Debe coincidir con CUSTOMER_SIGNATURE_REQUIREMENT_KEY del servicio de OT.
 */
const CUSTOMER_SIGNATURE_REQUIREMENT_KEY = 'CUSTOMER_SIGNATURE';
/** Ventana máxima de espera a que el análisis del asset lo deje AVAILABLE. */
const EVIDENCE_ASSET_AVAILABLE_TIMEOUT_MS = 30_000;
/**
 * Desplazamiento por reintento de las ventanas de agenda del happy path.
 * Un día por intento evita que el retry choque contra el evento que creó el
 * intento anterior para el mismo técnico y no invade las ventanas del resto
 * de la suite (máximo 450 minutos).
 */
const RETRY_WINDOW_SHIFT_MINUTES = 24 * 60;
const VALID_EVIDENCE_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8Qf//Z',
  'base64',
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Variables de sesión compartidas entre tests del describe. */
type TestCtx = {
  /** Token de plataforma (admin) para operaciones de setup. */
  platformToken: string;
  /** Token de tenant (NOC) para flujo de OT. */
  nocToken: string;
  /** Token de tenant ADMIN para provisionar fixtures con permisos de gestión. */
  tenantAdminToken: string;
  /** Token de técnico para comandos de ejecución. */
  techToken: string;
  /** Token de coordinador read-only. */
  coordinatorReadonlyToken: string;
  /** ID de la OT creada durante el happy path. */
  executionOrderId: string;
  /** Versión actual de la OT (optimistic lock). */
  otVersion: number;
  /** Número de OT. */
  otNumber: string;
  /** ID del evento de agenda creado. */
  scheduleEventId: string;
  /** NOC user ID. */
  nocUserId: string;
  /** Technician user ID. */
  techUserId: string;
  /** ID del asset de evidencia (foto). */
  mediaAssetId: string;
  /** ID del asset de la evidencia de firma del cliente (aceptación de cierre). */
  signatureMediaAssetId: string;
  /** Tenant ID. */
  tenantId: string;
  /** ID de la plantilla congelada creada en beforeAll (happy path). */
  templateId?: string;
  /** ID de la versión publicada de la plantilla (happy path). */
  templateVersionId?: string;
  /** Epoch ms del reset del bucket de evidencia del técnico. */
  evidenceRateLimitResetAt?: number;
  /** Epoch ms del reset del bucket de lecturas del coordinador. */
  readRateLimitResetAt?: number;
};

type RequestClient = APIRequestContext | Page;

type InventoryCatalogItem = {
  id: string;
  categoryCode?: string;
  category?: string;
};

type InventoryCatalogCategory = {
  code: string;
};

type ExecutionOrderSummary = {
  id: string;
  number: string;
  version: number;
};

function apiRequest(client: RequestClient): APIRequestContext {
  return 'request' in client ? client.request : client;
}

/**
 * Sube un archivo multipart construyendo el body manualmente con boundary,
 * evitando problemas de la serialización multipart nativa de Playwright
 * (devuelve 400 HTML en algunos entornos con Multer). Devuelve APIResponse.
 */
async function uploadEvidenceMultipart(
  page: Page,
  url: string,
  headers: Record<string, string>,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<{
  status(): number;
  headers(): Record<string, string>;
  text(): Promise<string>;
  json(): Promise<unknown>;
}> {
  const boundary = `----e2eMultipart${crypto.randomUUID().replace(/-/g, '')}`;
  const crlf = '\r\n';
  const head = Buffer.from(
    `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="file"; filename="${file.name}"${crlf}` +
      `Content-Type: ${file.mimeType}${crlf}${crlf}`,
  );
  const tail = Buffer.from(`${crlf}--${boundary}--${crlf}`);
  const body = Buffer.concat([head, file.buffer, tail]);
  return page.request.post(url, {
    headers: {
      ...headers,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    data: body,
  });
}

/**
 * Crea el contexto de prueba vacío con valores por defecto.
 * Cada test describe obtiene su propia copia.
 */
function createTestCtx(): TestCtx {
  return {
    platformToken: '',
    nocToken: '',
    tenantAdminToken: '',
    techToken: '',
    coordinatorReadonlyToken: '',
    executionOrderId: '',
    otVersion: 1,
    otNumber: '',
    scheduleEventId: '',
    nocUserId: '',
    techUserId: '',
    mediaAssetId: '',
    signatureMediaAssetId: '',
    tenantId: '',
  };
}

/** Login de plataforma → obtiene token. */
async function platformLogin(api: APIRequestContext): Promise<string> {
  const res = await api.post(`${API_PREFIX}/auth/platform/login`, {
    data: { email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data?.accessToken).toBeDefined();
  return body.data.accessToken;
}

/**
 * Login de tenant con rol específico.
 * Requiere que el usuario exista en el tenant.
 *
 * Contrato vigente: POST /api/v1/auth/login con header X-Tenant-Slug
 * y body { email, password }. Reemplaza al legado /auth/tenant/login
 * que aceptaba tenantSlug en el body.
 */
async function tenantLogin(
  client: RequestClient,
  email: string,
  password: string,
  slug: string,
): Promise<{ token: string; sub: string }> {
  const res = await apiRequest(client).post(`${API_PREFIX}/auth/login`, {
    data: { email, password },
    headers: {
      'X-Tenant-Slug': slug,
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data?.accessToken).toBeDefined();
  // Decodificar payload del JWT para obtener sub
  const payload = decodeJwtPayload(body.data.accessToken);
  return { token: body.data.accessToken, sub: payload.sub };
}

/** Decodifica el payload de un JWT sin verificar firma. Compatible con Node.js (sin atob). */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
    return decoded;
  } catch {
    return {};
  }
}

/** Retorna ISO string con offset en minutos desde ahora. */
function nowIso(offsetMinutes = 0): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

function expectMutationHeaders(
  response: { headers(): Record<string, string> },
  expectedVersion?: number,
): void {
  expect(response.headers()['x-correlation-id']).toMatch(UUID_PATTERN);
  if (expectedVersion !== undefined) {
    expect(response.headers()['etag']).toBe(`"${expectedVersion}"`);
  }
}

/**
 * Realiza un request autenticado como plataforma.
 */
async function authedPost(
  client: RequestClient,
  path: string,
  data: Record<string, unknown>,
  token: string,
  extraHeaders?: Record<string, string>,
) {
  return apiRequest(client).post(`${API_PREFIX}${path}`, {
    data,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

async function authedGet(
  client: RequestClient,
  path: string,
  token: string,
  extraHeaders?: Record<string, string>,
) {
  return apiRequest(client).get(`${API_PREFIX}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
  });
}

async function authedPatch(
  client: RequestClient,
  path: string,
  data: Record<string, unknown>,
  token: string,
  extraHeaders?: Record<string, string>,
) {
  return apiRequest(client).patch(`${API_PREFIX}${path}`, {
    data,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

/**
 * Espera por condición (nunca por sleep fijo) a que el asset de evidencia
 * quede AVAILABLE.
 *
 * El asset nace QUARANTINED y solo el análisis asíncrono lo promueve. Tanto el
 * registro de evidencia como la validación del artefacto de aceptación exigen
 * AVAILABLE, así que la espera es una precondición del contrato, no una pausa
 * de conveniencia.
 */
async function waitForEvidenceAssetAvailable(
  page: Page,
  executionOrderId: string,
  mediaAssetId: string,
  token: string,
): Promise<void> {
  expect(mediaAssetId, 'El asset de evidencia debe tener un identificador').toBeTruthy();
  await expect
    .poll(
      async () => {
        const receiptRes = await authedGet(
          page,
          `/tasks/execution-orders/${executionOrderId}/evidence-assets/${mediaAssetId}`,
          token,
        );
        if (receiptRes.status() !== 200) {
          return `HTTP_${receiptRes.status()}`;
        }
        const receiptBody = (await receiptRes.json()) as {
          status?: string;
          data?: { status?: string };
        };
        return receiptBody.status ?? receiptBody.data?.status ?? '';
      },
      {
        timeout: EVIDENCE_ASSET_AVAILABLE_TIMEOUT_MS,
        intervals: [250, 500, 1_000, 2_000, 3_000],
        message: `El asset de evidencia ${mediaAssetId} no alcanzó AVAILABLE dentro de la ventana de espera.`,
      },
    )
    .toBe('AVAILABLE');
}

function rememberEvidenceRateLimitReset(
  ctx: TestCtx,
  response: { headers(): Record<string, string> },
): void {
  const resetSeconds = Number(response.headers()['x-ratelimit-reset']);
  if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
    ctx.evidenceRateLimitResetAt = Math.max(
      ctx.evidenceRateLimitResetAt ?? 0,
      resetSeconds * 1000 + 250,
    );
  }
}

function rememberReadRateLimitReset(
  ctx: TestCtx,
  response: { headers(): Record<string, string> },
): void {
  const resetSeconds = Number(response.headers()['x-ratelimit-reset']);
  if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
    ctx.readRateLimitResetAt = Math.max(ctx.readRateLimitResetAt ?? 0, resetSeconds * 1000 + 250);
  }
}

/**
 * Las pruebas seriales se repiten completas cuando falla un caso posterior.
 * En ese escenario se espera el reset real del bucket del técnico, sin
 * desactivar ni alterar el rate limiter y sin consumir requests de drenaje.
 */
async function waitForEvidenceRateLimitReset(ctx: TestCtx, retry: number): Promise<void> {
  if (retry === 0 || !ctx.evidenceRateLimitResetAt) return;

  await expect
    .poll(() => Date.now(), {
      timeout: 65_000,
      intervals: [250, 500, 1_000, 2_000],
      message: 'El bucket de evidencia del técnico no alcanzó su reset contractual.',
    })
    .toBeGreaterThanOrEqual(ctx.evidenceRateLimitResetAt);
}

async function waitForReadRateLimitReset(
  ctx: TestCtx,
  retry: number,
  force = false,
): Promise<void> {
  if ((!force && retry === 0) || !ctx.readRateLimitResetAt) return;

  await expect
    .poll(() => Date.now(), {
      timeout: 65_000,
      intervals: [250, 500, 1_000, 2_000],
      message: 'El bucket de lecturas del coordinador no alcanzó su reset contractual.',
    })
    .toBeGreaterThanOrEqual(ctx.readRateLimitResetAt);
}

/**
 * Invoca el script de fallo de Redis del stack E2E (QA-33). El script deriva
 * el stack de docker-compose.yml + docker-compose.e2e.yml (proyecto
 * iwana-e2e-r41) y no acepta credenciales. Lanza con la salida del script si
 * el subcomando termina con código != 0 (p. ej. Redis no está corriendo).
 */
function redisFault(subcommand: 'pause' | 'resume' | 'status'): void {
  const scriptPath = fileURLToPath(
    new URL('../../../scripts/e2e-redis-fault.mjs', import.meta.url),
  );
  try {
    execFileSync(process.execPath, [scriptPath, subcommand], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    throw new Error(
      `El script de Redis del stack E2E falló en '${subcommand}': ` +
        `${stderr || (error instanceof Error ? error.message : String(error))}`,
    );
  }
}

/**
 * Sondea un endpoint autenticado con timeout acotado. Devuelve el status HTTP
 * o 'ERROR' si la request no responde (con Redis real detenido, la pila JWT
 * bloquea la request antes de llegar al throttler, así que la señal observable
 * es "sin 2xx").
 */
async function probeWithTimeout(
  page: Page,
  path: string,
  token: string,
  timeoutMs: number,
): Promise<number | 'ERROR'> {
  try {
    const res = await apiRequest(page).get(`${API_PREFIX}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: timeoutMs,
    });
    return res.status();
  } catch {
    return 'ERROR';
  }
}

async function createScheduledOrder(
  page: Page,
  token: string,
  technicianId: string,
  suffix: string,
  startOffsetMinutes: number,
): Promise<ExecutionOrderSummary> {
  const createEventRes = await authedPost(
    page,
    '/wfm/events',
    {
      type: 'INSTALLATION',
      title: `E2E R2.3 ${suffix}`,
      description: 'Prueba de gate de materiales',
      scheduledStartAt: nowIso(startOffsetMinutes),
      scheduledEndAt: nowIso(startOffsetMinutes + 30),
      assignedUserId: technicianId,
      address: 'Calle de prueba 1',
      municipality: 'Municipio de prueba',
      sector: 'Sector de prueba',
      workOrder: {
        type: 'INSTALLATION',
        priority: 'NORMAL',
        sourceContext: 'MANUAL',
        summary: `E2E R2.3 ${suffix}`,
      },
    },
    token,
  );
  expect([200, 201]).toContain(createEventRes.status());
  const eventBody = (await createEventRes.json()) as Record<string, unknown>;
  const eventData = (eventBody.data ?? eventBody) as Record<string, unknown>;
  let executionOrderId = String(eventData.executionOrderId ?? '');
  if (!executionOrderId && typeof eventData.id === 'string') {
    const eventDetailRes = await authedGet(page, `/wfm/events/${eventData.id}`, token);
    expect(eventDetailRes.status()).toBe(200);
    const eventDetail = (await eventDetailRes.json()) as Record<string, unknown>;
    executionOrderId = String(eventDetail.executionOrderId ?? '');
  }
  expect(executionOrderId).toBeTruthy();

  const orderRes = await authedGet(page, `/tasks/execution-orders/${executionOrderId}`, token);
  expect(orderRes.status()).toBe(200);
  const order = (await orderRes.json()) as Record<string, unknown>;
  return {
    id: executionOrderId,
    number: String(order.number ?? ''),
    version: Number(order.version),
  };
}

// ─── Suite de pruebas operativas E2E ─────────────────────────────────────────

test.describe('Execution Orders — flujo operativo E2E (P1-2)', () => {
  let ctx: TestCtx;
  let setupApi: APIRequestContext;

  test.describe.configure({ mode: 'serial' });

  // Tiempo generoso para creación de datos reales en PostgreSQL
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    setupApi = await request.newContext({ baseURL: API_BASE });
    ctx = createTestCtx();

    // 0. Health check: verificar que el API responde antes de continuar
    let apiReady = false;
    for (let attempt = 0; attempt < HEALTH_RETRIES; attempt++) {
      try {
        const healthRes = await setupApi.get(`${API_PREFIX}/health`, {
          timeout: 5_000,
        });
        if (healthRes.status() === 200) {
          apiReady = true;
          break;
        }
      } catch {
        // API aún no responde, reintentar
      }
      await new Promise((r) => setTimeout(r, HEALTH_RETRY_DELAY_MS));
    }

    if (!apiReady) {
      // Intentar con un GET a la raíz /api/v1 como fallback
      try {
        const fallbackRes = await setupApi.get(`${API_PREFIX}/`, { timeout: 5_000 });
        if (fallbackRes.ok()) apiReady = true;
      } catch {
        // No disponible
      }
    }

    if (!apiReady) {
      throw new Error(
        `API no disponible en ${API_PREFIX}. Asegúrese de que el servidor API esté ejecutándose (pnpm --filter @iwana/api dev).`,
      );
    }

    // 1. Login como administrador de plataforma
    try {
      ctx.platformToken = await platformLogin(setupApi);
    } catch (err) {
      throw new Error(
        `Login de plataforma falló: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 2. Obtener tenant y usuarios de prueba
    // El tenant y los usuarios deben existir previamente en la base de datos.
    const tenantRes = await authedGet(
      setupApi,
      `/tenants?search=${encodeURIComponent(TENANT_SLUG)}&limit=100`,
      ctx.platformToken,
    );
    expect(tenantRes.status()).toBe(200);
    const tenantBody = await tenantRes.json();
    const tenant = tenantBody.data?.find(
      (candidate: { slug?: string }) => candidate.slug === TENANT_SLUG,
    );
    if (!tenant) {
      throw new Error(`Tenant '${TENANT_SLUG}' no encontrado. Cree el tenant de prueba primero.`);
    }
    ctx.tenantId = tenant.id;

    // 3. Login como NOC (coordinador)
    const tenantAdminEmail = process.env.E2E_TENANT_ADMIN_EMAIL || '';
    const tenantAdminPassword = process.env.E2E_TENANT_ADMIN_PASSWORD || '';
    expect(tenantAdminEmail).toBeTruthy();
    expect(tenantAdminPassword).toBeTruthy();
    const tenantAdminLogin = await tenantLogin(
      setupApi,
      tenantAdminEmail,
      tenantAdminPassword,
      TENANT_SLUG,
    );
    ctx.tenantAdminToken = tenantAdminLogin.token;

    // 4. Login como NOC (coordinador)
    const nocEmail = process.env.E2E_NOC_EMAIL || `noc@${TENANT_SLUG}.local`;
    const nocPassword = process.env.E2E_NOC_PASSWORD || 'Password123!';
    try {
      const nocLogin = await tenantLogin(setupApi, nocEmail, nocPassword, TENANT_SLUG);
      ctx.nocToken = nocLogin.token;
      ctx.nocUserId = nocLogin.sub;
    } catch {
      throw new Error(`Usuario NOC '${nocEmail}' no encontrado en tenant '${TENANT_SLUG}'.`);
    }

    // 4. Login como técnico
    const techEmail = process.env.E2E_TECH_EMAIL || `tech@${TENANT_SLUG}.local`;
    const techPassword = process.env.E2E_TECH_PASSWORD || 'Password123!';
    try {
      const techLogin = await tenantLogin(setupApi, techEmail, techPassword, TENANT_SLUG);
      ctx.techToken = techLogin.token;
      ctx.techUserId = techLogin.sub;
    } catch {
      throw new Error(`Usuario TECH '${techEmail}' no encontrado en tenant '${TENANT_SLUG}'.`);
    }

    // 5. Login como coordinador read-only (sin permiso execute)
    const coordinatorReadonlyEmail =
      process.env.E2E_COORDINATOR_RO_EMAIL || `coord-ro@${TENANT_SLUG}.local`;
    const coordinatorReadonlyPassword = process.env.E2E_COORDINATOR_RO_PASSWORD || 'Password123!';
    try {
      const coordLogin = await tenantLogin(
        setupApi,
        coordinatorReadonlyEmail,
        coordinatorReadonlyPassword,
        TENANT_SLUG,
      );
      ctx.coordinatorReadonlyToken = coordLogin.token;
    } catch {
      throw new Error(
        `Usuario coordinador RO '${coordinatorReadonlyEmail}' no encontrado en tenant '${TENANT_SLUG}'.`,
      );
    }

    // 6. La plantilla E2E_HAPPY_PATH debe existir en el tenant de prueba.
    //    El gate de cierre exige templateRequirementsSnapshot ≠ null; sin
    //    plantilla activa el createFromSchedulingWithManager deja el snapshot
    //    en null y el cierre devuelve 422 CLOSURE_GATE_SNAPSHOT_MISSING.
    //
    //    La creación vía API no es accesible con los tokens de la suite:
    //    - nocToken: NOC no tiene el permiso operations.execution_order_templates.manage
    //    - platformToken: SYSTEM_ADMIN no satisface @Roles(UserRole.ADMIN, UserRole.NOC)
    //
    //    La plantilla se provisiona vía SQL directo con el script:
    //      npx tsx e2e/scripts/provision-execution-template.ts
    //
    //    El OT creation en el test 1a consulta getActiveVersionForWorkType('INSTALLATION')
    //    y congela automáticamente el snapshot de la plantilla publicada activa.
  });

  test.afterAll(async () => {
    await setupApi?.dispose();
  });

  // ─── 1. Happy path E2E ─────────────────────────────────────────────────────

  test.describe('1. Happy path — ciclo completo de OT', () => {
    // Dependencia intencional: los casos 1b–1g operan sobre la OT creada en 1a
    // y sobre `ctx.otVersion`, que avanza con cada comando. El modo serial deja
    // explícito ese estado compartido en lugar de heredarlo de forma implícita.
    test.describe.configure({ mode: 'serial' });

    test('1a. Crear evento de agenda → OT asignada', async ({ page }, testInfo) => {
      // Cada reintento usa su propia ventana horaria: el técnico ya tiene el
      // evento del intento anterior y la agenda rechaza solapamientos (400).
      const windowShift = testInfo.retry * RETRY_WINDOW_SHIFT_MINUTES;

      // Crear schedule event con embed work order
      const createEventRes = await authedPost(
        page,
        '/wfm/events',
        {
          type: 'INSTALLATION',
          title: 'E2E Instalación fibra óptica',
          description: 'OT generada por prueba E2E operativa',
          scheduledStartAt: nowIso(60 + windowShift),
          scheduledEndAt: nowIso(180 + windowShift),
          assignedUserId: ctx.techUserId,
          address: 'Cra 10 # 10-10',
          municipality: 'Bogotá',
          sector: 'Centro',
          workOrder: {
            type: 'INSTALLATION',
            priority: 'NORMAL',
            sourceContext: 'MANUAL',
            summary: 'Instalación fibra óptica - E2E',
          },
        },
        ctx.tenantAdminToken,
      );

      // La creación del evento puede devolver 201 (CREATED)
      expect([201, 200]).toContain(createEventRes.status());
      const eventBody = await createEventRes.json();
      ctx.scheduleEventId = eventBody.id || eventBody.data?.id || '';
      expect(ctx.scheduleEventId).toBeTruthy();

      // Si el evento se creó en estado DRAFT, transicionar a SCHEDULED
      if (eventBody.status === 'DRAFT' || eventBody.data?.status === 'DRAFT') {
        const transitionRes = await authedPatch(
          page,
          `/wfm/events/${ctx.scheduleEventId}/status`,
          { status: 'SCHEDULED' },
          ctx.nocToken,
        );
        expect([200, 201]).toContain(transitionRes.status());
      }

      // La respuesta actual de WFM conserva la referencia de la OT; no existe
      // un listado GET /tasks/execution-orders?scheduleEventId=… en el contrato.
      let eventDetail = eventBody.data || eventBody;
      ctx.executionOrderId = eventDetail.executionOrderId || '';
      if (!ctx.executionOrderId) {
        const eventDetailRes = await authedGet(
          page,
          `/wfm/events/${ctx.scheduleEventId}`,
          ctx.nocToken,
        );
        expect(eventDetailRes.status()).toBe(200);
        eventDetail = await eventDetailRes.json();
        ctx.executionOrderId = eventDetail.executionOrderId || '';
      }
      expect(ctx.executionOrderId).toBeTruthy();

      const orderRes = await authedGet(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}`,
        ctx.nocToken,
      );
      expect(orderRes.status()).toBe(200);
      const order = await orderRes.json();
      ctx.otNumber = order.number;
      ctx.otVersion = order.version;
      expect(ctx.otNumber).toBeTruthy();
      expect(order.status).toBe('ASSIGNED');
    });

    test('1b. Iniciar OT (start)', async ({ page }) => {
      expect(ctx.executionOrderId).toBeTruthy();
      const res = await authedPost(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}/start`,
        { note: 'Inicio de OT - técnico en ruta' },
        ctx.techToken,
        {
          'If-Match': String(ctx.otVersion),
          'Idempotency-Key': `e2e-start-${ctx.executionOrderId}`,
        },
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expectMutationHeaders(res, body.version);
      expect(body.status).toBe('IN_PROGRESS');
      ctx.otVersion = body.version || ctx.otVersion + 1;
    });

    test('1c. Registrar actividad de campo', async ({ page }) => {
      expect(ctx.executionOrderId).toBeTruthy();
      const res = await authedPost(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}/field-work`,
        {
          activityType: 'INSTALLATION',
          description: 'Instalación de ONT y verificación de potencia óptica',
        },
        ctx.techToken,
        {
          'If-Match': String(ctx.otVersion),
          'Idempotency-Key': `e2e-fieldwork-${ctx.executionOrderId}`,
        },
      );
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.id).toBeDefined();

      // Verificar que la actividad se listó
      const listRes = await authedGet(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}/activities`,
        ctx.techToken,
      );
      expect(listRes.status()).toBe(200);
      const listBody = await listRes.json();
      expect(listBody).toEqual(
        expect.objectContaining({ data: expect.any(Array), meta: expect.any(Object) }),
      );
      const activities = listBody.data;
      expect(activities.length).toBeGreaterThanOrEqual(1);

      // El field-work incrementa la versión de la OT (persistOrderOptimistically)
      // La respuesta es ExecutionOrderActivity (sin campo version), por lo que el
      // ETag del interceptor personalizado no se aplica; incrementar manualmente.
      ctx.otVersion = ctx.otVersion + 1;
    });

    test('1d. Registrar consumo de ítem', async ({ page }) => {
      expect(ctx.executionOrderId).toBeTruthy();
      // Buscar ítems en el inventario del tenant
      const itemsRes = await authedGet(page, '/inventory/items?limit=1', ctx.nocToken);
      let itemId = '';
      if (itemsRes.status() === 200) {
        const itemsBody = await itemsRes.json();
        const items = itemsBody.data || itemsBody;
        if (Array.isArray(items) && items.length > 0) {
          itemId = items[0].id || '';
        }
      }

      // Fixture operativo compartido con el flujo E2E de inventario.
      if (!itemId) {
        itemId = 'ONT-HG8245';
      }

      // technicianCustodyId debe ser el user ID del técnico asignado a la OT
      // (assertCustodyAssignment compara contra assignedTechnicianId, no contra location code)
      const custodyId = ctx.techUserId;

      const res = await authedPost(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}/item-usage`,
        {
          itemId,
          quantity: 1,
          technicianCustodyId: custodyId,
          action: 'INSTALL',
          finalDisposition: 'INSTALLED_AT_CUSTOMER',
        },
        ctx.techToken,
        {
          'If-Match': String(ctx.otVersion),
          'Idempotency-Key': `e2e-itemusage-${ctx.executionOrderId}`,
        },
      );

      expect(res.status()).toBe(202);
      const receipt = await res.json();
      expectMutationHeaders(res);
      expect(receipt).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          inventoryRequestId: expect.any(String),
          movementStatus: expect.stringMatching(/^(PENDING|CONFIRMED|REJECTED)$/),
        }),
      );

      // Verificar que el consumo se registró
      const listUsageRes = await authedGet(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}/item-usage`,
        ctx.techToken,
      );
      expect(listUsageRes.status()).toBe(200);
      const usagePage = await listUsageRes.json();
      expect(usagePage).toEqual(
        expect.objectContaining({ data: expect.any(Array), meta: expect.any(Object) }),
      );

      // El consumo de ítem incrementa la versión de la OT (persistOrderOptimistically),
      // pero la respuesta es un receipt sin campo version. Incrementar manualmente.
      ctx.otVersion = ctx.otVersion + 1;
    });

    test('1e. Subir evidencia y registrar', async ({ page }, testInfo) => {
      expect(ctx.executionOrderId).toBeTruthy();
      await waitForEvidenceRateLimitReset(ctx, testInfo.retry);

      // 1. Subir asset de evidencia (multipart vía fetch nativo para evitar
      //    limitaciones de Playwright en multipart/form-data)
      const fileContent = VALID_EVIDENCE_JPEG;
      const uploadRes = await uploadEvidenceMultipart(
        page,
        `${API_PREFIX}/tasks/execution-orders/${ctx.executionOrderId}/evidence-assets`,
        {
          Authorization: `Bearer ${ctx.techToken}`,
          'Idempotency-Key': `e2e-evidence-upload-${ctx.executionOrderId}`,
          'If-Match': String(ctx.otVersion),
        },
        {
          name: 'e2e-evidence.jpg',
          mimeType: 'image/jpeg',
          buffer: fileContent,
        },
      );

      expect(uploadRes.status()).toBe(202);
      rememberEvidenceRateLimitReset(ctx, uploadRes);
      expectMutationHeaders(uploadRes);
      const uploadBody = await uploadRes.json();
      expect(uploadBody).toEqual(
        expect.objectContaining({
          intentId: expect.any(String),
          mediaAssetId: expect.stringMatching(UUID_PATTERN),
          status: expect.stringMatching(/^(PENDING_ANALYSIS|AVAILABLE)$/),
        }),
      );
      ctx.mediaAssetId = uploadBody.mediaAssetId;
      expect(ctx.mediaAssetId).toBeTruthy();

      // 2. Esperar por condición a que el asset quede AVAILABLE: el registro de
      //    evidencia solo acepta assets disponibles.
      //    Se usa nocToken para el polling (GET read-only) y así aislar el
      //    contador del rate limiter eo-evidence-media (límite 10) para que los
      //    POST de subida y registro del técnico no compitan con los GET del poll.
      await waitForEvidenceAssetAvailable(
        page,
        ctx.executionOrderId,
        ctx.mediaAssetId,
        ctx.nocToken,
      );

      // 3. Registrar evidencia vinculando el asset
      const registerRes = await authedPost(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}/evidence`,
        {
          mediaAssetId: ctx.mediaAssetId,
          evidenceType: 'PHOTO',
          requirementKey: 'e2e-test-evidence',
          expiresAt: nowIso(1440),
          capturedAt: nowIso(),
        },
        ctx.techToken,
        {
          'If-Match': String(ctx.otVersion),
          'Idempotency-Key': `e2e-evidence-reg-${ctx.executionOrderId}`,
        },
      );
      expect(registerRes.status()).toBe(201);
      rememberEvidenceRateLimitReset(ctx, registerRes);
      expectMutationHeaders(registerRes);
      const registeredEvidence = await registerRes.json();
      expect(registeredEvidence).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          mediaAssetId: ctx.mediaAssetId,
          evidenceType: 'PHOTO',
          requirementKey: 'e2e-test-evidence',
        }),
      );

      // El registro de evidencia incrementa la versión de la OT
      ctx.otVersion = ctx.otVersion + 1;

      // 4. Verificar que se puede descargar la evidencia (signed URL)
      const contentRes = await page.request.get(
        `${API_PREFIX}/tasks/execution-orders/${ctx.executionOrderId}/evidence-assets/${ctx.mediaAssetId}/content`,
        {
          headers: { Authorization: `Bearer ${ctx.techToken}` },
          maxRedirects: 0,
        },
      );
      expect(contentRes.status()).toBe(302);
      rememberEvidenceRateLimitReset(ctx, contentRes);
      expect(contentRes.headers().location).toMatch(/^https?:\/\//);
    });

    test('1e-bis. Registrar evidencia de firma del cliente', async ({ page }, testInfo) => {
      expect(ctx.executionOrderId).toBeTruthy();
      await waitForEvidenceRateLimitReset(ctx, testInfo.retry);

      // El cierre con aceptación del cliente exige que el artefacto sea una
      // evidencia SIGNATURE con requirementKey CUSTOMER_SIGNATURE y con su
      // asset AVAILABLE. Se sube un asset propio porque cada asset solo puede
      // reclamarse por una evidencia.
      const uploadRes = await uploadEvidenceMultipart(
        page,
        `${API_PREFIX}/tasks/execution-orders/${ctx.executionOrderId}/evidence-assets`,
        {
          Authorization: `Bearer ${ctx.techToken}`,
          'Idempotency-Key': `e2e-signature-upload-${ctx.executionOrderId}`,
          'If-Match': String(ctx.otVersion),
        },
        {
          name: 'e2e-firma-cliente.jpg',
          mimeType: 'image/jpeg',
          buffer: VALID_EVIDENCE_JPEG,
        },
      );

      expect(uploadRes.status()).toBe(202);
      rememberEvidenceRateLimitReset(ctx, uploadRes);
      expectMutationHeaders(uploadRes);
      const uploadBody = await uploadRes.json();
      expect(uploadBody).toEqual(
        expect.objectContaining({
          intentId: expect.any(String),
          mediaAssetId: expect.stringMatching(UUID_PATTERN),
          status: expect.stringMatching(/^(PENDING_ANALYSIS|AVAILABLE)$/),
        }),
      );
      const signatureAssetId: string = uploadBody.mediaAssetId;
      expect(signatureAssetId).not.toBe(ctx.mediaAssetId);

      // El artefacto de aceptación debe tener el asset disponible.
      // Mismo aislamiento de rate limiter que en 1e: polling con nocToken.
      await waitForEvidenceAssetAvailable(
        page,
        ctx.executionOrderId,
        signatureAssetId,
        ctx.nocToken,
      );

      const registerRes = await authedPost(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}/evidence`,
        {
          mediaAssetId: signatureAssetId,
          evidenceType: 'SIGNATURE',
          requirementKey: CUSTOMER_SIGNATURE_REQUIREMENT_KEY,
          expiresAt: nowIso(1440),
          capturedAt: nowIso(),
        },
        ctx.techToken,
        {
          'If-Match': String(ctx.otVersion),
          'Idempotency-Key': `e2e-signature-reg-${ctx.executionOrderId}`,
        },
      );
      expect(registerRes.status()).toBe(201);
      rememberEvidenceRateLimitReset(ctx, registerRes);
      expectMutationHeaders(registerRes);
      const registeredSignature = await registerRes.json();
      expect(registeredSignature).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          mediaAssetId: signatureAssetId,
          evidenceType: 'SIGNATURE',
          requirementKey: CUSTOMER_SIGNATURE_REQUIREMENT_KEY,
          status: 'AVAILABLE',
        }),
      );

      ctx.signatureMediaAssetId = signatureAssetId;

      // El registro de evidencia incrementa la versión de la OT.
      ctx.otVersion = ctx.otVersion + 1;
    });

    test('1f. Cerrar OT exitosamente', async ({ page }) => {
      expect(ctx.executionOrderId).toBeTruthy();
      // Sin fallback: si la evidencia de firma no se registró, el fallo debe
      // señalar el fixture roto y no degenerar en un 422 del cierre.
      expect(
        ctx.signatureMediaAssetId,
        'La evidencia de firma del cliente debe haberse registrado en 1e-bis',
      ).toBeTruthy();
      const res = await authedPost(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}/close`,
        {
          result: 'EXECUTED',
          summary: 'Instalación completada exitosamente. Cliente satisfecho.',
          closeNotes: 'Se instaló ONT HG8245. Potencia óptica: -18dBm.',
          customerAcceptance: {
            artifactId: ctx.signatureMediaAssetId,
            method: 'SIGNATURE',
          },
        },
        ctx.techToken,
        {
          'If-Match': String(ctx.otVersion),
          'Idempotency-Key': `e2e-close-${ctx.executionOrderId}`,
        },
      );
      const body = await res.json().catch(() => ({}));
      // El cuerpo viaja en el mensaje: un 422 de cierre puede venir del
      // artefacto de aceptación o del gate de cierre, y el diagnóstico no
      // puede depender de leer los logs de la API.
      expect(res.status(), `Respuesta del cierre: ${JSON.stringify(body)}`).toBe(200);
      expect(body.status).toBe('COMPLETED');
      expect(body.result).toBe('EXECUTED');
      ctx.otVersion = body.version || ctx.otVersion + 1;
    });

    test('1g. Verificar estado final de la OT', async ({ page }) => {
      expect(ctx.executionOrderId).toBeTruthy();
      const res = await authedGet(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}`,
        ctx.techToken,
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('COMPLETED');
      expect(body.result).toBe('EXECUTED');
      expect(body.completion?.startedAt).toBeDefined();
      expect(body.completion?.closedAt).toBeDefined();
      expect(body.completion?.progress).toBeGreaterThanOrEqual(0);
      expect(body.completion?.progress).toBeLessThanOrEqual(100);
    });
  });

  // ─── 2. Terminal immutability ──────────────────────────────────────────────

  test.describe('2. Inmutabilidad terminal', () => {
    test('2a. OT cerrada rechaza registro de actividad', async ({ page }) => {
      expect(ctx.executionOrderId).toBeTruthy();
      const res = await authedPost(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}/field-work`,
        {
          activityType: 'VERIFICATION',
          description: 'Intento de actividad post-cierre',
        },
        ctx.techToken,
        {
          'If-Match': String(ctx.otVersion),
          'Idempotency-Key': `e2e-immutable-fw-${ctx.executionOrderId}`,
        },
      );
      // Debe rechazar con 4xx
      expect(res.status()).toBeGreaterThanOrEqual(400);
      expect(res.status()).toBeLessThan(500);
      expectMutationHeaders(res);
      const body = await res.json().catch(() => ({}));
      const code = body.code || '';
      expect(
        code.includes('TRANSITION') ||
          code.includes('CLOSURE') ||
          code.includes('VERSION') ||
          res.status() === 409 ||
          res.status() === 422,
      ).toBeTruthy();
    });

    test('2b. OT cerrada rechaza consumo de ítem', async ({ page }) => {
      expect(ctx.executionOrderId).toBeTruthy();
      const res = await authedPost(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}/item-usage`,
        {
          itemId: 'ONT-HG8245',
          quantity: 1,
          technicianCustodyId: 'MOV-001',
          action: 'CONSUME',
          finalDisposition: 'INTERNAL_CONSUMPTION',
        },
        ctx.techToken,
        {
          'If-Match': String(ctx.otVersion),
          'Idempotency-Key': `e2e-immutable-iu-${ctx.executionOrderId}`,
        },
      );
      expect(res.status()).toBeGreaterThanOrEqual(400);
      expect(res.status()).toBeLessThan(500);
      expectMutationHeaders(res);
    });

    test('2c. OT cerrada rechaza evidencia', async ({ page }) => {
      expect(ctx.executionOrderId).toBeTruthy();
      const res = await authedPost(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}/evidence`,
        {
          mediaAssetId: '00000000-0000-4000-8000-000000000000',
          evidenceType: 'PHOTO',
          requirementKey: 'e2e-post-close',
          expiresAt: nowIso(1440),
          capturedAt: nowIso(),
        },
        ctx.techToken,
        {
          'If-Match': String(ctx.otVersion),
          'Idempotency-Key': `e2e-immutable-ev-${ctx.executionOrderId}`,
        },
      );
      expect(res.status()).toBeGreaterThanOrEqual(400);
      expect(res.status()).toBeLessThan(500);
      expectMutationHeaders(res);
    });
  });

  // ─── 3. Concurrent operations (idempotency) ───────────────────────────────

  test.describe('3. Concurrencia e idempotencia', () => {
    let concurrencyOtId = '';
    let concurrencyOtVersion = 1;

    test('3a. Setup: crear OT para test de concurrencia', async ({ page }, testInfo) => {
      // Crear schedule event para nueva OT
      const createRes = await authedPost(
        page,
        '/wfm/events',
        {
          type: 'SUPPORT',
          title: 'E2E Concurrencia - OT para test de cierre concurrente',
          scheduledStartAt: nowIso(240 + testInfo.retry * RETRY_WINDOW_SHIFT_MINUTES),
          scheduledEndAt: nowIso(360 + testInfo.retry * RETRY_WINDOW_SHIFT_MINUTES),
          assignedUserId: ctx.techUserId,
          address: 'Cra 5 # 5-05',
          municipality: 'Bogotá',
          sector: 'Chapinero',
          workOrder: {
            type: 'SUPPORT',
            summary: 'Test concurrencia cierre OT',
          },
        },
        ctx.nocToken,
      );
      const eventBody = await createRes.json().catch(() => ({}));
      expect(
        [200, 201],
        `Creación de OT de concurrencia: HTTP ${createRes.status()} body=${JSON.stringify(eventBody)}`,
      ).toContain(createRes.status());
      const eventId = eventBody.id || eventBody.data?.id || '';

      if (eventBody.status === 'DRAFT' || eventBody.data?.status === 'DRAFT') {
        await authedPatch(
          page,
          `/wfm/events/${eventId}/status`,
          { status: 'SCHEDULED' },
          ctx.nocToken,
        );
      }

      let eventDetail = eventBody.data || eventBody;
      concurrencyOtId = eventDetail.executionOrderId || '';
      if (!concurrencyOtId) {
        const eventDetailRes = await authedGet(page, `/wfm/events/${eventId}`, ctx.nocToken);
        expect(eventDetailRes.status()).toBe(200);
        eventDetail = await eventDetailRes.json();
        concurrencyOtId = eventDetail.executionOrderId || '';
      }
      expect(concurrencyOtId).toBeTruthy();

      const orderRes = await authedGet(
        page,
        `/tasks/execution-orders/${concurrencyOtId}`,
        ctx.nocToken,
      );
      expect(orderRes.status()).toBe(200);
      const order = await orderRes.json();
      concurrencyOtVersion = order.version;

      // Iniciar OT
      const startRes = await authedPost(
        page,
        `/tasks/execution-orders/${concurrencyOtId}/start`,
        { note: 'Inicio para test concurrencia' },
        ctx.techToken,
        {
          'If-Match': String(concurrencyOtVersion),
          'Idempotency-Key': `e2e-conc-start-${concurrencyOtId}`,
        },
      );
      expect(startRes.status()).toBe(200);
      const startBody = await startRes.json();
      expectMutationHeaders(startRes, startBody.version);
      concurrencyOtVersion = startBody.version || concurrencyOtVersion + 1;
    });

    test('3b. Cierre concurrente con misma idempotency-key → solo uno succeede', async ({
      page,
    }) => {
      expect(concurrencyOtId).toBeTruthy();
      const idempotencyKey = `e2e-conc-close-${concurrencyOtId}`;

      // Dos close requests concurrentes con la misma idempotency-key
      const [res1, res2] = await Promise.all([
        authedPost(
          page,
          `/tasks/execution-orders/${concurrencyOtId}/close`,
          {
            result: 'EXECUTED',
            summary: 'Cierre concurrente - intento 1',
          },
          ctx.techToken,
          {
            'If-Match': String(concurrencyOtVersion),
            'Idempotency-Key': idempotencyKey,
          },
        ),
        authedPost(
          page,
          `/tasks/execution-orders/${concurrencyOtId}/close`,
          {
            result: 'EXECUTED',
            summary: 'Cierre concurrente - intento 2',
          },
          ctx.techToken,
          {
            'If-Match': String(concurrencyOtVersion),
            'Idempotency-Key': idempotencyKey,
          },
        ),
      ]);
      const [body1, body2] = await Promise.all([
        res1.json().catch(() => ({})),
        res2.json().catch(() => ({})),
      ]);

      // Uno debe ser 200 (éxito)
      const successful = res1.status() === 200 ? res1 : res2.status() === 200 ? res2 : null;
      expect(
        successful,
        `Respuestas de cierre concurrente: ${JSON.stringify({
          first: { status: res1.status(), body: body1 },
          second: { status: res2.status(), body: body2 },
        })}`,
      ).not.toBeNull();

      // El otro debe ser 200 también (idempotency replay) o 409 (conflicto)
      const other = res1 === successful ? res2 : res1;
      expect([200, 409, 422]).toContain(other.status());

      // La OT debe quedar COMPLETED
      const finalRes = await authedGet(
        page,
        `/tasks/execution-orders/${concurrencyOtId}`,
        ctx.techToken,
      );
      expect(finalRes.status()).toBe(200);
      const finalBody = await finalRes.json();
      expect(finalBody.status).toBe('COMPLETED');
    });
  });

  // ─── 4. Rate limiting ──────────────────────────────────────────────────────

  test.describe('4. Rate limiting', () => {
    const RAPID_COUNT = 121;
    const BURST_SIZE = 20;

    // La clave de rate limiter es operations-rate:{bucket}:{actorId}:{tenantId}.
    // Test 4a usa coordinatorReadonlyToken (eo-lightweight-read, límite 120).
    // El tenant y el actor son efímeros por corrida, por lo que el bucket nace
    // vacío. En retries se espera el reset anunciado por Redis; no se drena
    // con requests adicionales ni se debilita el límite contractual.
    test('4a. Ráfaga de requests → 429 después del límite', async ({ page }, testInfo) => {
      await waitForReadRateLimitReset(ctx, testInfo.retry);
      // El límite contractual de lecturas de OT es 120 por actor y tenant.
      const responses = [];
      for (let offset = 0; offset < RAPID_COUNT; offset += BURST_SIZE) {
        const batch = await Promise.all(
          Array.from({ length: Math.min(BURST_SIZE, RAPID_COUNT - offset) }, () =>
            authedGet(
              page,
              `/tasks/execution-orders/${ctx.executionOrderId}`,
              ctx.coordinatorReadonlyToken,
            ),
          ),
        );
        responses.push(...batch);
        for (const response of batch) rememberReadRateLimitReset(ctx, response);
      }
      const statuses = responses.map((r) => r.status());
      expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0);
      const rateLimitedRes = responses.find((response) => response.status() === 429);
      expect(rateLimitedRes).toBeDefined();
      expect(rateLimitedRes?.headers()['x-ratelimit-limit']).toBe('120');
      expect(rateLimitedRes?.headers()['x-ratelimit-remaining']).toBe('0');
      const contentType = rateLimitedRes?.headers()['content-type'] ?? '';
      const bodyText = await rateLimitedRes?.text();
      if (contentType.includes('application/json')) {
        const body = JSON.parse(bodyText ?? '{}') as Record<string, unknown>;
        expect(body).toEqual(
          expect.objectContaining({
            code: 'RATE_LIMIT_EXCEEDED',
            message: expect.any(String),
          }),
        );
      } else {
        // El guard conserva el contrato verificable de 429 + headers, aunque
        // el adaptador HTTP local pueda serializar la excepción como HTML.
        expect(bodyText, `Cuerpo no JSON del rate limit (${contentType})`).toMatch(
          /429|too many requests|rate.?limit|demasiadas solicitudes/i,
        );
      }
    });

    test('4b. Headers X-RateLimit-Remaining presentes en respuestas exitosas', async ({ page }) => {
      const res = await authedGet(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}`,
        ctx.techToken,
      );
      expect(res.status()).toBe(200);
      const remaining = res.headers()['x-ratelimit-remaining'];
      const limit = res.headers()['x-ratelimit-limit'];
      expect(remaining).toBeDefined();
      expect(limit).toBe('120');
      expect(Number(remaining)).toBeGreaterThanOrEqual(0);
    });

    // La clave de rate limiter incluye actorId y tenantId: el bucket de un
    // actor debe ser independiente del de otro actor del mismo tenant.
    test('4c. Aislamiento por actor: agotar al coordinador no afecta al técnico', async ({
      page,
    }, testInfo) => {
      await waitForReadRateLimitReset(ctx, testInfo.retry);
      const responses = [];
      for (let offset = 0; offset < RAPID_COUNT; offset += BURST_SIZE) {
        const batch = await Promise.all(
          Array.from({ length: Math.min(BURST_SIZE, RAPID_COUNT - offset) }, () =>
            authedGet(
              page,
              `/tasks/execution-orders/${ctx.executionOrderId}`,
              ctx.coordinatorReadonlyToken,
            ),
          ),
        );
        responses.push(...batch);
        for (const response of batch) rememberReadRateLimitReset(ctx, response);
      }
      expect(
        responses.some((response) => response.status() === 429),
        'El bucket del coordinador debe agotarse con 429 en la ráfaga.',
      ).toBe(true);

      // El bucket del técnico es independiente (clave distinta por actorId):
      // su lectura sigue siendo 200 con cuota disponible en la misma ventana
      // en que el coordinador recibe 429.
      const techRes = await authedGet(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}`,
        ctx.techToken,
      );
      expect(techRes.status()).toBe(200);
      expect(Number(techRes.headers()['x-ratelimit-remaining'])).toBeGreaterThan(0);
    });

    // El bucket también incluye tenantId: una ráfaga del inquilino B no puede
    // agotar el bucket del inquilino A. Se usa el contrato E2E_OTHER_TENANT_*
    // que ya provisiona scripts/e2e-provision-operational.mjs (igual que 6a).
    test('4d. Aislamiento por tenant: ráfaga del inquilino B no toca el bucket de A', async ({
      page,
    }, testInfo) => {
      await waitForReadRateLimitReset(ctx, testInfo.retry);

      const otherSlug = process.env.E2E_OTHER_TENANT_SLUG || 'e2e-tenant-b';
      const otherEmail = process.env.E2E_OTHER_TENANT_EMAIL || `admin@${otherSlug}.local`;
      const otherPassword = process.env.E2E_OTHER_TENANT_PASSWORD || 'Password123!';

      let otherToken = '';
      try {
        const otherLogin = await tenantLogin(page, otherEmail, otherPassword, otherSlug);
        otherToken = otherLogin.token;
      } catch (err) {
        throw new Error(
          `Tenant '${otherSlug}' no disponible. Configure E2E_OTHER_TENANT_* para probar aislamiento por tenant. ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Lectura de referencia del inquilino A antes de la ráfaga del B.
      const beforeRes = await authedGet(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}`,
        ctx.techToken,
      );
      expect(beforeRes.status()).toBe(200);
      const beforeRemaining = Number(beforeRes.headers()['x-ratelimit-remaining']);

      // 120 lecturas del inquilino B sobre un recurso de A: todas 404 (BOLA),
      // ninguna 429, porque el bucket de B es independiente (tenantId propio).
      const otherResponses = [];
      for (let offset = 0; offset < RAPID_COUNT - 1; offset += BURST_SIZE) {
        const batch = await Promise.all(
          Array.from({ length: Math.min(BURST_SIZE, RAPID_COUNT - 1 - offset) }, () =>
            authedGet(page, `/tasks/execution-orders/${ctx.executionOrderId}`, otherToken),
          ),
        );
        otherResponses.push(...batch);
      }
      const otherStatuses = otherResponses.map((response) => response.status());
      expect(
        otherStatuses.every((status) => status === 404),
        `El bucket del inquilino B debe estar intacto (120×404, 0×429): ${JSON.stringify(otherStatuses)}`,
      ).toBe(true);

      // El bucket de A no se consumió por la ráfaga de B: la cuota del técnico
      // solo puede bajar por su propia lectura de referencia (1 request).
      const afterRes = await authedGet(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}`,
        ctx.techToken,
      );
      expect(afterRes.status()).toBe(200);
      const afterRemaining = Number(afterRes.headers()['x-ratelimit-remaining']);
      expect(afterRemaining).toBeLessThanOrEqual(beforeRemaining);
      expect(afterRemaining).toBeGreaterThanOrEqual(beforeRemaining - 1);
    });

    // Fail-closed con el Redis REAL del stack E2E: scripts/e2e-redis-fault.mjs
    // detiene el contenedor del servicio redis de docker-compose.e2e.yml.
    // Mientras está caído, la pila JWT (GET de la blacklist de jti sin command
    // timeout) bloquea la request antes de llegar al throttler, así que la
    // evidencia E2E es "ninguna respuesta 2xx"; el 503 RATE_LIMIT_STORE_
    // UNAVAILABLE del guard se cubre en su unit spec con un mock de Redis.
    test('4e. Fail-closed: con Redis real caído no hay 2xx; al restaurarlo, 200 + headers', async ({
      page,
    }) => {
      // Precondición: el Redis del stack E2E debe estar corriendo para poder
      // detenerlo. Si no, el script falla con un mensaje claro (igual que el
      // test 6a con E2E_OTHER_TENANT_*).
      redisFault('status');

      const orderPath = `/tasks/execution-orders/${ctx.executionOrderId}`;
      try {
        redisFault('pause');

        // Con Redis detenido, ninguna request autenticada responde 2xx.
        await expect
          .poll(async () => probeWithTimeout(page, orderPath, ctx.techToken, 12_000), {
            timeout: 60_000,
            intervals: [1_000, 5_000],
            message: 'Con Redis real caído la API no debe responder 2xx (fail-closed).',
          })
          .not.toBe(200);
      } finally {
        // Restauración incondicional: el stack debe quedar como se encontró.
        redisFault('resume');
      }

      // Con Redis restaurado, la misma request vuelve a responder 200 y el
      // rate limiter vuelve a emitir sus headers contractuales.
      await expect
        .poll(async () => probeWithTimeout(page, orderPath, ctx.techToken, 15_000), {
          timeout: 45_000,
          intervals: [1_000, 2_000],
          message: 'Tras restaurar Redis la API debe volver a responder 200.',
        })
        .toBe(200);
      const recovered = await authedGet(page, orderPath, ctx.techToken);
      expect(recovered.status()).toBe(200);
      expect(recovered.headers()['x-ratelimit-limit']).toBe('120');
      expect(Number(recovered.headers()['x-ratelimit-remaining'])).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── 5. Permisos ───────────────────────────────────────────────────────────

  test.describe('5. Permisos y autorización', () => {
    test('5a. Sin token → 401', async ({ page }) => {
      const res = await page.request.get(
        `${API_PREFIX}/tasks/execution-orders/${ctx.executionOrderId}`,
      );
      expect(res.status()).toBe(401);
    });

    test('5b. Coordinador sin execute → 403 en comandos', async ({ page }) => {
      expect(ctx.executionOrderId).toBeTruthy();
      const res = await authedPost(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}/start`,
        { note: 'Intento sin permiso' },
        ctx.coordinatorReadonlyToken,
        {
          'If-Match': String(ctx.otVersion),
          'Idempotency-Key': `e2e-perm-start-${ctx.executionOrderId}`,
        },
      );
      expect(res.status()).toBe(403);
    });

    test('5c. Coordinador sin execute → 403 también en close', async ({ page }) => {
      expect(ctx.executionOrderId).toBeTruthy();
      const res = await authedPost(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}/close`,
        { result: 'EXECUTED', summary: 'Intento sin permiso' },
        ctx.coordinatorReadonlyToken,
        {
          'If-Match': String(ctx.otVersion),
          'Idempotency-Key': `e2e-perm-close-${ctx.executionOrderId}`,
        },
      );
      expect(res.status()).toBe(403);
    });

    test('5d. Coordinador con supervise puede asignar', async ({ page }, testInfo) => {
      expect(OPERATIONAL_SITE_ID, 'El fixture debe provisionar una sede operativa').toBeTruthy();
      const createRes = await authedPost(
        page,
        '/wfm/events',
        {
          type: 'SUPPORT',
          title: 'E2E Supervisión - OT reasignable',
          scheduledStartAt: nowIso(900 + testInfo.retry * RETRY_WINDOW_SHIFT_MINUTES),
          scheduledEndAt: nowIso(930 + testInfo.retry * RETRY_WINDOW_SHIFT_MINUTES),
          assignedUserId: ctx.techUserId,
          organizationSiteId: OPERATIONAL_SITE_ID,
          address: 'Calle de prueba 5',
          municipality: 'Bogotá',
          sector: 'Centro',
          workOrder: {
            type: 'SUPPORT',
            summary: 'OT de supervisión E2E',
          },
        },
        ctx.nocToken,
      );
      const createBody = await createRes.json().catch(() => ({}));
      expect(
        [200, 201],
        `Creación de OT supervisable: HTTP ${createRes.status()} body=${JSON.stringify(createBody)}`,
      ).toContain(createRes.status());
      const eventId = createBody.id || createBody.data?.id || '';
      expect(eventId).toBeTruthy();
      const eventDetailRes = await authedGet(page, `/wfm/events/${eventId}`, ctx.nocToken);
      expect(eventDetailRes.status()).toBe(200);
      const eventDetail = await eventDetailRes.json();
      const assignmentOrderId =
        eventDetail.executionOrderId || eventDetail.data?.executionOrderId || '';
      expect(assignmentOrderId).toBeTruthy();
      const orderRes = await authedGet(
        page,
        `/tasks/execution-orders/${assignmentOrderId}`,
        ctx.nocToken,
      );
      expect(orderRes.status()).toBe(200);
      const order = await orderRes.json();
      const res = await authedPost(
        page,
        `/tasks/execution-orders/${assignmentOrderId}/assign`,
        {
          assigneeType: 'TECHNICIAN',
          assigneeId: ctx.techUserId,
          reason: 'Reasignación E2E desde coordinador',
        },
        ctx.coordinatorReadonlyToken,
        {
          'If-Match': String(order.version),
          'Idempotency-Key': `e2e-perm-assign-${assignmentOrderId}`,
        },
      );
      // Coordinador con supervise puede asignar → 200
      const body = await res.json().catch(() => ({}));
      expect(
        res.status(),
        `Asignación con supervisión: HTTP ${res.status()} orderId=${assignmentOrderId} siteId=${OPERATIONAL_SITE_ID} eventSite=${eventDetail.organizationSiteId ?? eventDetail.data?.organizationSiteId ?? ''} orderSite=${order.site?.id ?? ''} body=${JSON.stringify(body)}`,
      ).toBe(200);
      expectMutationHeaders(res, body.version);
    });
  });

  // ─── 6. BOLA (Broken Object Level Authorization) ───────────────────────────

  test.describe('6. BOLA — aislamiento multi-inquilino', () => {
    test('6a. Inquilino A no puede acceder OT de inquilino B → 404', async ({ page }, testInfo) => {
      expect(ctx.executionOrderId).toBeTruthy();

      // Login como usuario de otro inquilino (debe existir)
      const otherSlug = process.env.E2E_OTHER_TENANT_SLUG || 'e2e-tenant-b';
      const otherEmail = process.env.E2E_OTHER_TENANT_EMAIL || `admin@${otherSlug}.local`;
      const otherPassword = process.env.E2E_OTHER_TENANT_PASSWORD || 'Password123!';

      let otherToken = '';
      try {
        const otherLogin = await tenantLogin(page, otherEmail, otherPassword, otherSlug);
        otherToken = otherLogin.token;
      } catch (err) {
        throw new Error(
          `Tenant '${otherSlug}' no disponible. Configure E2E_OTHER_TENANT_* para probar BOLA. ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 4d agota deliberadamente el bucket del usuario B para probar el
      // aislamiento por tenant; BOLA debe ejecutarse cuando esa ventana expire.
      await waitForReadRateLimitReset(ctx, testInfo.retry, true);

      // Intentar acceder a la OT del tenant A desde tenant B
      const res = await authedGet(
        page,
        `/tasks/execution-orders/${ctx.executionOrderId}`,
        otherToken,
      );
      // Debe devolver 404 (no 403) para no filtrar existencia de recursos
      expect(res.status()).toBe(404);
    });
  });

  // ─── 7. Evidence lifecycle ─────────────────────────────────────────────────

  test.describe('7. Ciclo de vida de evidencia', () => {
    let evidenceOtId = '';
    let evidenceOtVersion = 1;

    test('7a. Setup: crear y empezar OT para evidencia', async ({ page }, testInfo) => {
      const createRes = await authedPost(
        page,
        '/wfm/events',
        {
          type: 'SUPPORT',
          title: 'E2E Evidencia - ciclo completo',
          scheduledStartAt: nowIso(420 + testInfo.retry * RETRY_WINDOW_SHIFT_MINUTES),
          scheduledEndAt: nowIso(540 + testInfo.retry * RETRY_WINDOW_SHIFT_MINUTES),
          assignedUserId: ctx.techUserId,
          address: 'Av Siempre Viva 123',
          municipality: 'Bogotá',
          sector: 'Usaquén',
          workOrder: {
            type: 'SUPPORT',
            summary: 'Test evidencia E2E',
          },
        },
        ctx.nocToken,
      );
      expect([200, 201]).toContain(createRes.status());
      const body = await createRes.json();
      const eventId = body.id || body.data?.id || '';

      if (body.status === 'DRAFT') {
        await authedPatch(
          page,
          `/wfm/events/${eventId}/status`,
          { status: 'SCHEDULED' },
          ctx.nocToken,
        );
      }

      let eventDetail = body.data || body;
      evidenceOtId = eventDetail.executionOrderId || '';
      if (!evidenceOtId) {
        const eventDetailRes = await authedGet(page, `/wfm/events/${eventId}`, ctx.nocToken);
        expect(eventDetailRes.status()).toBe(200);
        eventDetail = await eventDetailRes.json();
        evidenceOtId = eventDetail.executionOrderId || '';
      }
      expect(evidenceOtId).toBeTruthy();

      const orderRes = await authedGet(
        page,
        `/tasks/execution-orders/${evidenceOtId}`,
        ctx.nocToken,
      );
      expect(orderRes.status()).toBe(200);
      const order = await orderRes.json();
      evidenceOtVersion = order.version;

      // Start
      const startRes = await authedPost(
        page,
        `/tasks/execution-orders/${evidenceOtId}/start`,
        { note: 'Inicio para evidencia' },
        ctx.techToken,
        {
          'If-Match': String(evidenceOtVersion),
          'Idempotency-Key': `e2e-ev-start-${evidenceOtId}`,
        },
      );
      expect(startRes.status()).toBe(200);
      const startBody = await startRes.json();
      expectMutationHeaders(startRes, startBody.version);
      evidenceOtVersion = startBody.version || evidenceOtVersion + 1;
    });

    test('7b. Verificar relay health endpoint', async ({ page }) => {
      // Endpoint de health del relay de eventos outbox
      const res = await authedGet(page, '/tasks/execution-orders/health/relay', ctx.nocToken);
      // Debe responder aunque sea que el relay no esté configurado
      expect([200, 503]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json();
        expect(body).toBeDefined();
      }
    });

    test('7c. Verificar reconciliation endpoint', async ({ page }) => {
      expect(evidenceOtId).toBeTruthy();
      const res = await authedGet(
        page,
        `/tasks/execution-orders/${evidenceOtId}/reconciliation`,
        ctx.nocToken,
      );
      // Debe responder (incluso si devuelve datos vacíos)
      expect([200, 403, 404]).toContain(res.status());
    });

    test('7d. Cerrar OT de evidencia con follow-up', async ({ page }) => {
      expect(evidenceOtId).toBeTruthy();
      const res = await authedPost(
        page,
        `/tasks/execution-orders/${evidenceOtId}/close`,
        {
          result: 'EXECUTED_WITH_OBSERVATIONS',
          summary: 'Instalación completada con observaciones menores.',
          closeNotes: 'Se requiere ajuste en acometida externa.',
          followUp: {
            reasonCode: 'EXTERNAL_ADJUSTMENT',
            dueAt: nowIso(1440), // 24h
          },
        },
        ctx.techToken,
        {
          'If-Match': String(evidenceOtVersion),
          'Idempotency-Key': `e2e-ev-close-${evidenceOtId}`,
        },
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expectMutationHeaders(res, body.version);
      expect(['COMPLETED_WITH_OBSERVATIONS', 'COMPLETED']).toContain(body.status);
      expect(body.result).toBe('EXECUTED_WITH_OBSERVATIONS');
    });
  });

  // ─── 8. R2.3 — material y carreras reales ─────────────────────────────────

  test.describe('8. R2.3 — gate MATERIAL y concurrencia PostgreSQL', () => {
    test('8a. cierra con material correcto y rechaza material de otra categoría', async ({
      page,
    }, testInfo) => {
      const itemsRes = await authedGet(page, '/inventory/items?limit=100', ctx.nocToken);
      expect(itemsRes.status()).toBe(200);
      const itemsBody = (await itemsRes.json()) as
        | { data?: InventoryCatalogItem[] }
        | InventoryCatalogItem[];
      const catalogItems = Array.isArray(itemsBody) ? itemsBody : (itemsBody.data ?? []);
      const categorizedItems = catalogItems.filter((item) =>
        Boolean(item.id && (item.categoryCode ?? item.category)),
      );
      const correctItem = categorizedItems[0];
      expect(correctItem).toBeDefined();
      if (!correctItem) {
        throw new Error('El tenant E2E no tiene un artículo categorizado.');
      }

      const correctCategory = correctItem.categoryCode ?? correctItem.category;
      expect(correctCategory).toBeTruthy();
      const categoriesRes = await authedGet(page, '/inventory/categories?limit=100', ctx.nocToken);
      expect(categoriesRes.status()).toBe(200);
      const categoriesBody = (await categoriesRes.json()) as
        | { data?: InventoryCatalogCategory[] }
        | InventoryCatalogCategory[];
      const categories = Array.isArray(categoriesBody)
        ? categoriesBody
        : (categoriesBody.data ?? []);
      const wrongCategory = categories.find((category) => category.code !== correctCategory)?.code;
      expect(wrongCategory).toBeTruthy();
      if (!correctCategory || !wrongCategory) {
        throw new Error('El tenant E2E no tiene dos categorías canónicas distintas.');
      }
      expect(wrongCategory).not.toBe(correctCategory);

      // El backend congela en la OT la versión PUBLISHED más reciente del
      // PRIMER template PUBLISHED del workType (getActiveVersionForWorkType).
      // El provisioner ya crea E2E_HAPPY_PATH (INSTALLATION, PUBLISHED) y
      // expone su id vía E2E_HAPPY_PATH_TEMPLATE_ID; un template nuevo jamás
      // gana la selección y la OT congelaría el snapshot del happy path
      // (actividad+evidencia+firma). Para probar el gate MATERIAL de forma
      // determinista, las versiones se publican sobre el template activo. El
      // GET de templates no es usable aquí: el admin del tenant solo tiene
      // OPERATIONS_EXECUTION_ORDER_TEMPLATES_MANAGE, no READ (403).
      const templateId = process.env.E2E_HAPPY_PATH_TEMPLATE_ID ?? '';
      expect(templateId).toMatch(UUID_PATTERN);

      // Versiones de material publicadas durante la prueba: se retiran en el
      // finally para restaurar el template activo (ver getActiveVersionForWorkType).
      const materialVersionIds: string[] = [];

      const createVersion = async (itemCategory: string) => {
        const response = await authedPost(
          page,
          `/tasks/execution-order-templates/${templateId}/versions`,
          {
            label: `E2E material ${itemCategory}`,
            requirements: [
              {
                key: 'material-required',
                label: 'Material requerido',
                required: true,
                kind: 'MATERIAL',
                itemCategory,
              },
            ],
          },
          ctx.tenantAdminToken,
        );
        expect(response.status()).toBe(201);
        const version = (await response.json()) as Record<string, unknown>;
        const versionId = String(version.id ?? '');
        expect(versionId).toBeTruthy();
        materialVersionIds.push(versionId);
        return version;
      };

      try {
        const versionOne = await createVersion(String(correctCategory));
        const versionOneId = String(versionOne.id ?? '');
        expect(versionOneId).toBeTruthy();
        const publishOne = await authedPost(
          page,
          `/tasks/execution-order-templates/versions/${versionOneId}/publish`,
          {},
          ctx.tenantAdminToken,
        );
        expect(publishOne.status()).toBe(200);

        const correctOrder = await createScheduledOrder(
          page,
          ctx.tenantAdminToken,
          ctx.techUserId,
          'material-correcto',
          600 + testInfo.retry * RETRY_WINDOW_SHIFT_MINUTES,
        );
        const startCorrect = await authedPost(
          page,
          `/tasks/execution-orders/${correctOrder.id}/start`,
          { note: 'Inicio material correcto' },
          ctx.techToken,
          {
            'If-Match': String(correctOrder.version),
            'Idempotency-Key': `e2e-r23-start-correct-${correctOrder.id}`,
          },
        );
        expect(startCorrect.status()).toBe(200);
        const startedCorrect = (await startCorrect.json()) as { version: number };
        const usageCorrect = await authedPost(
          page,
          `/tasks/execution-orders/${correctOrder.id}/item-usage`,
          {
            itemId: correctItem?.id,
            quantity: 1,
            technicianCustodyId: ctx.techUserId,
            action: 'CONSUME',
            finalDisposition: 'INTERNAL_CONSUMPTION',
          },
          ctx.techToken,
          {
            'If-Match': String(startedCorrect.version),
            'Idempotency-Key': `e2e-r23-usage-correct-${correctOrder.id}`,
          },
        );
        expect(usageCorrect.status()).toBe(202);

        const closeCorrect = await authedPost(
          page,
          `/tasks/execution-orders/${correctOrder.id}/close`,
          { result: 'EXECUTED', summary: 'Material canónico validado' },
          ctx.techToken,
          {
            'If-Match': String(startedCorrect.version + 1),
            'Idempotency-Key': `e2e-r23-close-correct-${correctOrder.id}`,
          },
        );
        expect(closeCorrect.status()).toBe(200);

        const versionTwo = await createVersion(String(wrongCategory));
        const versionTwoId = String(versionTwo.id ?? '');
        const publishTwo = await authedPost(
          page,
          `/tasks/execution-order-templates/versions/${versionTwoId}/publish`,
          {},
          ctx.tenantAdminToken,
        );
        expect(publishTwo.status()).toBe(200);

        const incorrectOrder = await createScheduledOrder(
          page,
          ctx.tenantAdminToken,
          ctx.techUserId,
          'material-incorrecto',
          660 + testInfo.retry * RETRY_WINDOW_SHIFT_MINUTES,
        );
        const startIncorrect = await authedPost(
          page,
          `/tasks/execution-orders/${incorrectOrder.id}/start`,
          { note: 'Inicio material incorrecto' },
          ctx.techToken,
          {
            'If-Match': String(incorrectOrder.version),
            'Idempotency-Key': `e2e-r23-start-wrong-${incorrectOrder.id}`,
          },
        );
        expect(startIncorrect.status()).toBe(200);
        const startedIncorrect = (await startIncorrect.json()) as { version: number };
        const usageIncorrect = await authedPost(
          page,
          `/tasks/execution-orders/${incorrectOrder.id}/item-usage`,
          {
            itemId: correctItem?.id,
            quantity: 1,
            technicianCustodyId: ctx.techUserId,
            action: 'CONSUME',
            finalDisposition: 'INTERNAL_CONSUMPTION',
          },
          ctx.techToken,
          {
            'If-Match': String(startedIncorrect.version),
            'Idempotency-Key': `e2e-r23-usage-wrong-${incorrectOrder.id}`,
          },
        );
        expect(usageIncorrect.status()).toBe(202);

        const closeIncorrect = await authedPost(
          page,
          `/tasks/execution-orders/${incorrectOrder.id}/close`,
          { result: 'EXECUTED', summary: 'Material de categoría incorrecta' },
          ctx.techToken,
          {
            'If-Match': String(startedIncorrect.version + 1),
            'Idempotency-Key': `e2e-r23-close-wrong-${incorrectOrder.id}`,
          },
        );
        expect(closeIncorrect.status()).toBe(422);
        // El 422 del gate llega como JSON (filtro de excepciones de Nest) o
        // como HTML del default handler de Express cuando la excepción escapa
        // del pipeline (stack sin frames Nest dentro de runInTenantSchema).
        const closeIncorrectText = await closeIncorrect.text();
        let closeIncorrectBody: Record<string, unknown> = {};
        try {
          closeIncorrectBody = JSON.parse(closeIncorrectText) as Record<string, unknown>;
        } catch {
          // HTML: el código CLOSURE_GATE_INCOMPLETE no viaja en el body; el
          // mensaje canónico del gate es el proxy verificable del código.
        }
        const errorBody = closeIncorrectBody.error as { code?: unknown } | undefined;
        const gateCode = closeIncorrectBody.code ?? errorBody?.code;
        if (gateCode === undefined) {
          expect(closeIncorrectText).toContain('No se puede cerrar la OT: requisitos pendientes');
        } else {
          expect(gateCode).toBe('CLOSURE_GATE_INCOMPLETE');
        }
      } finally {
        // Restaurar el template activo: getActiveVersionForWorkType elige la
        // versión PUBLISHED más alta del primer template PUBLISHED del
        // workType. Si estas versiones MATERIAL quedaran publicadas, las OTs
        // creadas después (p. ej. los retries de la serie serial 1a-1f)
        // congelarían el snapshot de material y el close devolvería 422.
        for (const versionId of materialVersionIds) {
          const retireRes = await authedPost(
            page,
            `/tasks/execution-order-templates/versions/${versionId}/retire`,
            {},
            ctx.tenantAdminToken,
          );
          expect([200, 201]).toContain(retireRes.status());
        }
      }
    });

    test('8b. Promise.all versiona plantilla y consecutivos sin duplicar OT', async ({
      page,
    }, testInfo) => {
      const templateRes = await authedPost(
        page,
        '/tasks/execution-order-templates',
        {
          key: `E2E_R23_CONCURRENCY_${Date.now()}`,
          label: 'E2E concurrencia de plantilla',
          workType: 'INSTALLATION',
          requirements: [],
        },
        ctx.tenantAdminToken,
      );
      expect(templateRes.status()).toBe(201);
      const template = (await templateRes.json()) as { id: string };

      const versionResponses = await Promise.all([
        authedPost(
          page,
          `/tasks/execution-order-templates/${template.id}/versions`,
          { label: 'Versión concurrente A', requirements: [] },
          ctx.tenantAdminToken,
        ),
        authedPost(
          page,
          `/tasks/execution-order-templates/${template.id}/versions`,
          { label: 'Versión concurrente B', requirements: [] },
          ctx.tenantAdminToken,
        ),
      ]);
      expect(versionResponses.map((response) => response.status())).toEqual([201, 201]);
      const versions = await Promise.all(versionResponses.map((response) => response.json()));
      expect(new Set(versions.map((version) => version.version))).toEqual(new Set([1, 2]));

      const orders = await Promise.all([
        createScheduledOrder(
          page,
          ctx.tenantAdminToken,
          ctx.techUserId,
          'consecutivo-a',
          720 + testInfo.retry * RETRY_WINDOW_SHIFT_MINUTES,
        ),
        createScheduledOrder(
          page,
          ctx.tenantAdminToken,
          ctx.techUserId,
          'consecutivo-b',
          780 + testInfo.retry * RETRY_WINDOW_SHIFT_MINUTES,
        ),
      ]);
      const numbers = orders.map((order) => order.number);
      expect(new Set(numbers).size).toBe(2);
      const sequences = numbers
        .map((number) => Number.parseInt(number.split('-').at(-1) ?? '', 10))
        .sort((left, right) => left - right);
      expect(sequences[1] - sequences[0]).toBe(1);
    });
  });
});
