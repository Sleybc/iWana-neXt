/**
 * MOD05 ↔ MOD14 · Facturación en la ficha estilo UISP — E2E vivo
 * (spec docs/specs/2026-11-13-mod05-mod14-facturacion-en-la-ficha-estilo-uisp.md v1.1).
 *
 * Portal, API y worker reales (job «E2E operativo R4.1»). Tenant desechable por worker
 * (`srqa-ff-*`), siembra por API y limpieza al final. Nunca `tenant_iwana`. Datos sintéticos:
 * correos `@example.invalid`, documentos inventados.
 *
 * SQL, solo donde la API no expone el dato:
 * - lectura de `audit_logs` (CA-5) y de `billing_email_log.recipient_masked` (CA-6);
 * - siembra de la marca `DATOS_BLOQUEADOS` en `party_privacy_marks` (CA-6): la API no expone
 *   marcas directas; mismo patrón que `portal-billing-flow.spec.ts`.
 *
 * Cubre, una prueba por criterio:
 * - CA-1 (+R6, inventario W0 1, 5): Documentos sin cobros; Facturas con «Descargar PDF», fecha de
 *   emisión en el detalle, métricas y acciones arriba, facturación por servicio, enlace de la
 *   Vista general a `sub=facturas`.
 * - CA-2: libro con documento, cortesía, pago con retenciones (O-23) y saldo a favor → el saldo
 *   final = «Deuda pendiente actual» − «Saldo a favor»; PDF del libro.
 * - CA-3: pago registrado en el diálogo → recibo numerado, descarga `recibo-<n>.pdf` y envío con
 *   registro (destinatario enmascarado).
 * - CA-4: «Enviar por correo» de una factura deja registro. Sustitución documentada: un fallo SMTP
 *   real no es reproducible (el mailer sin `SMTP_HOST` opera en modo dev y no falla), así que el
 *   error visible se provoca con un titular sin correo → «Rechazado · Sin correo registrado».
 * - CA-5: desasociar con motivo → factura con saldo, valor como saldo a favor, auditoría; el valor
 *   se re-aplica con el endpoint de aplicaciones existente (R5).
 * - CA-6: titular con `DATOS_BLOQUEADOS` → factura, recibo y estado de cuenta rechazados con
 *   «Datos del titular restringidos», sin destinatario.
 * - CA-7: «Desasociar» deshabilitado con su explicación sobre un histórico IMPORTADO (importación
 *   UISP real) y 409 por API; sobre un documento ANULADO la anulación ya revierte la aplicación:
 *   queda «Revertida», sin acción, y la API responde 404 (el 409 de ANULADO solo es alcanzable con
 *   datos inconsistentes y lo cubre `billing-payments.unlink.spec.ts`).
 * - Subpestañas: URL (R1), teclado (flechas, Inicio, Fin) y axe WCAG 2.2 AA (serious/critical = 0)
 *   en Facturas, Pagos y Estado de cuenta, claro y oscuro.
 *
 * Requiere API_BASE_URL, worker vivo y credenciales de plataforma (E2E_PLATFORM_* o
 * PLATFORM_SUPER_ADMIN_*).
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Download,
  type Locator,
  type Page,
} from '@playwright/test';
import ts from 'typescript';

// Fixture sintético de UISP del módulo de migración (mismo cargador que
// `portal-importacion-uisp-live.spec.ts`: se transpila a CommonJS con su `require` anclado).
type UispFixtureModule =
  typeof import('../../apps/api/src/modules/migration/test/uisp-zip.fixture');
function loadUispFixture(): UispFixtureModule {
  const path = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../apps/api/src/modules/migration/test/uisp-zip.fixture.ts',
  );
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const module = { exports: {} as UispFixtureModule };
  new Function('require', 'module', 'exports', outputText)(
    createRequire(path),
    module,
    module.exports,
  );
  return module.exports;
}

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const API_PREFIX = '/api/v1';
const RUN_ID = randomUUID().replace(/-/gu, '').slice(0, 12);
const TENANT_SLUG = `srqa-ff-${RUN_ID}`;
const ADMIN_EMAIL = `srqa-ff-admin-${RUN_ID}@example.invalid`;
const UISP_CLIENT_ID = 9300 + (Number.parseInt(RUN_ID.slice(0, 4), 16) % 500);

const missingLiveEnvironment = [
  !(process.env.E2E_PLATFORM_EMAIL?.trim() || process.env.PLATFORM_SUPER_ADMIN_EMAIL?.trim())
    ? 'E2E_PLATFORM_EMAIL o PLATFORM_SUPER_ADMIN_EMAIL'
    : null,
  !(process.env.E2E_PLATFORM_PASSWORD?.trim() || process.env.PLATFORM_SUPER_ADMIN_PASSWORD?.trim())
    ? 'E2E_PLATFORM_PASSWORD o PLATFORM_SUPER_ADMIN_PASSWORD'
    : null,
].filter((name): name is string => name !== null);

type Dict = Record<string, unknown>;
type BillingDoc = {
  id: string;
  subscriberId: string;
  status: string;
  number: string | null;
  externalNumber?: string | null;
  total: string;
  pendingAmount: string | null;
  blockingReason?: string | null;
};
type Allocation = {
  id: string;
  documentId: string;
  amount: string;
  reversedAt: string | null;
  reversalReasonCode?: string | null;
};
type Payment = {
  id: string;
  status: string;
  amount: string;
  reference?: string | null;
  imported?: boolean;
  externalId?: string | null;
  receiptNumber?: number | null;
  allocations?: Allocation[];
  withholdings?: Array<{ id: string; documentId: string; voidedAt: string | null }>;
};
type Statement = {
  totalPending: string;
  creditBalance: string;
  documents: BillingDoc[];
  payments: Payment[];
};
type Ledger = {
  from: string | null;
  to: string;
  openingBalance: string;
  closingBalance: string;
  rows: Array<{ kind: string; balance: string }>;
};
type EmailEntry = {
  id: string;
  kind: 'FACTURA' | 'RECIBO' | 'ESTADO_CUENTA';
  documentId: string | null;
  paymentId: string | null;
  recipientMasked: string | null;
  status: 'EN_COLA' | 'ENVIADO' | 'ERROR' | 'RECHAZADO';
  reasonCode: string | null;
};
type Seed = { subscriberId: string; contractId: string; email: string | null };

let api: APIRequestContext | undefined;
let platformToken: string | undefined;
let tenantId: string | undefined;
let schemaName: string | undefined;
let adminToken = '';
let tenantAdminPassword = '';
let legalTextId = '';
let cycleDay = 1;
let periodStart = '';
const catalog = {
  residentialPlanId: '',
  residentialPlanName: '',
  businessPlanId: '',
  businessPlanName: '',
};

// ── Utilidades HTTP ─────────────────────────────────────────────────────────

function bogotaToday(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function apiHeaders(token: string, slug?: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...(slug ? { 'X-Tenant-Slug': slug } : {}) };
}

function tenantHeaders(token = adminToken): Record<string, string> {
  return apiHeaders(token, TENANT_SLUG);
}

function withKey(headers: Record<string, string>, key = randomUUID()): Record<string, string> {
  return { ...headers, 'Idempotency-Key': key };
}

/** Algunos controladores responden `{ data }` y otros el recurso plano. */
function unwrap<T>(body: unknown): T {
  if (typeof body === 'object' && body !== null && 'data' in body) {
    const data = (body as { data?: unknown }).data;
    if (data !== undefined) return data as T;
  }
  return body as T;
}

function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'object' && value !== null) {
    for (const key of ['data', 'items'] as const) {
      const nested = (value as Dict)[key];
      if (Array.isArray(nested)) return nested as T[];
    }
  }
  throw new Error('La API no devolvió una lista.');
}

async function expectJson<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  status: number | number[],
  options: { headers?: Record<string, string>; data?: unknown; multipart?: unknown } = {},
): Promise<T> {
  const response = await api!.fetch(`${API_PREFIX}${path}`, { method, ...options } as never);
  const body = (await response.json().catch(() => ({}))) as Dict;
  const expected = Array.isArray(status) ? status : [status];
  expect(
    expected,
    `API ${method} ${path}: HTTP ${response.status()} (${String(body.code ?? body.message ?? 'sin detalle')})`,
  ).toContain(response.status());
  return unwrap<T>(body);
}

/** Estado HTTP y código de error de una llamada que debe fallar. */
async function expectError(
  path: string,
  method: 'GET' | 'POST',
  data?: unknown,
): Promise<{ status: number; code: string | undefined }> {
  const response = await api!.fetch(`${API_PREFIX}${path}`, {
    method,
    headers: tenantHeaders(),
    ...(data === undefined ? {} : { data }),
  });
  const body = (await response.json().catch(() => ({}))) as Dict;
  return { status: response.status(), code: typeof body.code === 'string' ? body.code : undefined };
}

/** SQL de lectura (y la marca de privacidad de CA-6) contra el esquema del tenant efímero. */
function tenantPsql(sql: string): string {
  if (!schemaName) throw new Error('Sin esquema de tenant efímero.');
  const container = process.env.E2E_POSTGRES_CONTAINER ?? 'iwana_postgres_dev';
  const user = process.env.E2E_DB_BOOTSTRAP_USER ?? 'iwana';
  const database = process.env.E2E_DB_NAME ?? 'dbiw';
  const raw = execFileSync(
    'docker',
    [
      'exec',
      container,
      'psql',
      '-U',
      user,
      '-d',
      database,
      '-At',
      '-c',
      `SET search_path TO "${schemaName}", public; ${sql}`,
    ],
    { encoding: 'utf8' },
  ).trim();
  return (
    raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) ?? ''
  );
}

/** Dígito de verificación DIAN del NIT. */
function nitVerificationDigit(nit: string): string {
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const sum = [...nit]
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * weights[index]!, 0);
  const remainder = sum % 11;
  return String(remainder > 1 ? 11 - remainder : remainder);
}

function cents(value: string): number {
  return Math.round(Number(value) * 100);
}

function money(centsValue: number): string {
  return (centsValue / 100).toFixed(2);
}

/**
 * Patrón del monto que pinta `formatBillingMoney` (Intl es-CO): «$ 580.340» o «$ 580.340,00» según
 * los datos ICU del runtime, sin otro dígito detrás.
 */
function moneyPattern(value: string): RegExp {
  const whole = Math.trunc(Math.abs(Number(value)));
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/gu, '.');
  return new RegExp(`\\$\\s?${grouped.replace(/\./gu, '\\.')}(?:,00)?(?![\\d,])`, 'u');
}

// ── Tenant y catálogo ───────────────────────────────────────────────────────

async function cleanupTenant(): Promise<void> {
  if (!api || !platformToken || !tenantId) return;
  try {
    await api.fetch(`${API_PREFIX}/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: apiHeaders(platformToken),
      data: { status: 'INACTIVE' },
    });
    await api.fetch(`${API_PREFIX}/tenants/${tenantId}`, {
      method: 'DELETE',
      headers: apiHeaders(platformToken),
    });
  } catch {
    // Limpieza best-effort: nunca oculta el resultado de la suite.
  }
}

async function createDisposableTenant(): Promise<void> {
  api = await request.newContext({ baseURL: API_BASE_URL });
  const platformSession = await expectJson<{ accessToken: string }>(
    '/auth/platform/login',
    'POST',
    200,
    {
      data: {
        email: process.env.E2E_PLATFORM_EMAIL ?? process.env.PLATFORM_SUPER_ADMIN_EMAIL ?? '',
        password:
          process.env.E2E_PLATFORM_PASSWORD ?? process.env.PLATFORM_SUPER_ADMIN_PASSWORD ?? '',
      },
    },
  );
  platformToken = platformSession.accessToken;

  const created = await expectJson<{ id: string; schemaName: string }>('/tenants', 'POST', 201, {
    headers: apiHeaders(platformToken),
    data: {
      name: `Tenant sintético facturación ficha ${RUN_ID}`,
      slug: TENANT_SLUG,
      contactEmail: `qa-ff-${RUN_ID}@example.invalid`,
      adminEmail: ADMIN_EMAIL,
      settings: {
        timezone: 'America/Bogota',
        currency: 'COP',
        features: { mfa_required_all: false },
      },
    },
  });
  tenantId = created.id;
  schemaName = created.schemaName;
  expect(schemaName).not.toBe('tenant_iwana');

  await expect
    .poll(
      async () => {
        const current = await expectJson<{ status: string }>(`/tenants/${tenantId}`, 'GET', 200, {
          headers: apiHeaders(platformToken!),
        });
        if (current.status === 'PROVISIONING_FAILED') throw new Error('Provisioning fallido.');
        return current.status;
      },
      { timeout: 120_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe('ACTIVE');

  const credential = await expectJson<{ adminEmail: string; temporaryPassword: string }>(
    `/tenants/${tenantId}/regenerate-admin-credentials`,
    'POST',
    200,
    { headers: withKey(apiHeaders(platformToken)) },
  );
  tenantAdminPassword = `Qa9!${randomBytes(18).toString('hex')}`;
  const initial = await expectJson<{ accessToken: string }>('/auth/login', 'POST', 200, {
    headers: { 'X-Tenant-Slug': TENANT_SLUG },
    data: { email: credential.adminEmail, password: credential.temporaryPassword },
  });
  await expectJson('/auth/change-password', 'POST', 200, {
    headers: apiHeaders(initial.accessToken, TENANT_SLUG),
    data: { currentPassword: credential.temporaryPassword, newPassword: tenantAdminPassword },
  });
  adminToken = (
    await expectJson<{ accessToken: string }>('/auth/login', 'POST', 200, {
      headers: { 'X-Tenant-Slug': TENANT_SLUG },
      data: { email: credential.adminEmail, password: tenantAdminPassword },
    })
  ).accessToken;

  // RS-13: sin identidad fiscal del emisor no se emite; la plantilla del correo usa la razón social.
  await expectJson('/tenants/me/profile', 'PATCH', 200, {
    headers: tenantHeaders(),
    data: { legalName: 'Operador Sintético E2E', nit: '900000001', nitDv: '7' },
  });
}

/** Ciclo 1 o 15 ya generado en el mes de la corrida (sin fechas fijas). */
async function chooseCycle(): Promise<void> {
  const today = bogotaToday();
  const [year, month] = today.split('-').map(Number) as [number, number];
  const daysInMonth = new Date(year, month, 0).getDate();
  const cycles = asList<{ cycleDay: number; cutoffDay: number; active: boolean }>(
    await expectJson<unknown>('/crm/billing-cycles', 'GET', 200, { headers: tenantHeaders() }),
  );
  const viable = cycles
    .filter((c) => c.active && (c.cycleDay === 1 || c.cycleDay === 15))
    .filter((c) => {
      const generation = `${today.slice(0, 8)}${String(c.cycleDay).padStart(2, '0')}`;
      return generation <= today && c.cutoffDay <= daysInMonth;
    })
    .sort((a, b) => b.cycleDay - a.cycleDay);
  if (viable.length === 0) throw new Error(`Sin ciclo facturable el ${today}.`);
  cycleDay = viable[0]!.cycleDay;
  periodStart = `${today.slice(0, 8)}${String(cycleDay).padStart(2, '0')}`;
}

/** Autorización, plantilla de contrato aprobada y datos del operador (ADR-109). */
async function seedLegalAndOperator(): Promise<void> {
  const headers = tenantHeaders();
  legalTextId = (
    await expectJson<{ id: string }>('/privacy/legal-texts', 'POST', 201, {
      headers,
      data: {
        type: 'AUTORIZACION',
        version: `qa-ff-${RUN_ID}`,
        content: 'Texto de autorización sintético para la prueba E2E de facturación en la ficha.',
      },
    })
  ).id;
  const contractTemplate = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../apps/worker/src/templates/contracts/contrato-servicio.base.html',
    ),
    'utf8',
  );
  await expectJson('/privacy/legal-texts', 'POST', 201, {
    headers,
    data: {
      type: 'CONTRATO_SERVICIO',
      version: `qa-ff-${RUN_ID}`,
      format: 'HTML',
      content: contractTemplate,
      legalApprovalDeclaration: 'APROBADO_POR_ASESORIA_JURIDICA',
    },
  });
  await expectJson('/organization/contract-profile', 'PUT', 200, {
    headers,
    data: {
      qualityAndCoverageUrl: 'https://operador-qa.example.invalid/calidad',
      customerServiceChannels: [{ kind: 'PHONE', value: '6010000000', label: 'Línea de atención' }],
      reconnectionFee: 15000,
      annualIncreaseCapPercent: 5,
      equipmentIncidentReportChannel: 'Línea 6010000000',
      otherConditions: null,
    },
  });
}

async function seedCatalog(): Promise<void> {
  const headers = tenantHeaders();
  const plan = async (name: string, segment: string, basePrice: string, speed: number) => {
    const created = await expectJson<{ id: string; name: string }>(
      '/commercial/catalog/plans',
      'POST',
      201,
      {
        headers,
        data: {
          name,
          vatConcept: 'INTERNET_ACCESS',
          technology: 'FIBER',
          downloadSpeedMbps: speed,
          uploadSpeedMbps: speed,
          installationRule: 'ALWAYS',
        },
      },
    );
    await expectJson(`/commercial/catalog/${created.id}/prices`, 'POST', 201, {
      headers,
      data: { customerSegment: segment, basePrice, installationFee: '0' },
    });
    return created;
  };
  const residential = await plan(`Plan QA hogar ${RUN_ID}`, 'RESIDENTIAL', '80000.00', 100);
  catalog.residentialPlanId = residential.id;
  catalog.residentialPlanName = residential.name;
  // CA-2: plan empresarial de 1.000.000 para retefuente y reteICA sobre una base redonda.
  const business = await plan(`Plan QA empresa ${RUN_ID}`, 'PYME', '1000000.00', 500);
  catalog.businessPlanId = business.id;
  catalog.businessPlanName = business.name;
}

// ── Titulares, contratos y cobros ───────────────────────────────────────────

async function createContract(
  subscriberId: string,
  input: { planId: string; planName: string; price: string; segment: string; fiscal: Dict },
): Promise<string> {
  const contract = await expectJson<{ id: string }>(
    `/crm/subscribers/${subscriberId}/contracts`,
    'POST',
    201,
    {
      headers: tenantHeaders(),
      data: {
        subscriberId,
        planId: input.planId,
        planSnapshotJson: { id: input.planId, name: input.planName, monthlyPrice: input.price },
        alias: `Servicio QA ${RUN_ID}`,
        installationAddress: `Dirección sintética ${RUN_ID}`,
        installationCity: 'Bogotá',
        installationDepartment: 'Cundinamarca',
        customerSegment: input.segment,
        serviceUsage: 'NON_RESIDENTIAL',
        fiscalAddress: `Dirección sintética ${RUN_ID}`,
        startDate: periodStart,
        ...input.fiscal,
      },
    },
  );
  return contract.id;
}

/** Persona natural residencial; `withEmail: false` deja solo teléfono (CA-4, caso de error). */
async function seedResidential(tag: string, withEmail = true): Promise<Seed> {
  const email = withEmail ? `qa-${tag}-${RUN_ID}@example.invalid` : null;
  const subscriber = await expectJson<{ id: string }>('/crm/subscribers', 'POST', 201, {
    headers: tenantHeaders(),
    data: {
      personType: 'NATURAL',
      customerSegment: 'RESIDENTIAL',
      documentType: 'CC',
      documentNumber: `${tag}-${RUN_ID}`,
      firstName: `Titular ${tag}`,
      lastName: `Sintético ${RUN_ID}`,
      stratum: 4,
      ...(email ? { email } : { phone: '3000000000' }),
      address: `Dirección sintética ${RUN_ID}`,
      city: 'Bogotá',
      department: 'Cundinamarca',
      vatResponsibility: 'NO_RESPONSABLE',
      rutResponsibilities: [],
      authorizationChannel: 'PRESENCIAL',
      authorizations: [{ purpose: 'TRATAMIENTO_CONTRACTUAL', granted: true, legalTextId }],
    },
  });
  const contractId = await createContract(subscriber.id, {
    planId: catalog.residentialPlanId,
    planName: catalog.residentialPlanName,
    price: '80000.00',
    segment: 'RESIDENTIAL',
    fiscal: { fiscalName: `Titular ${tag} Sintético`, fiscalDocument: `${tag}-${RUN_ID}` },
  });
  return { subscriberId: subscriber.id, contractId, email };
}

/** Persona jurídica con O-23 en el RUT: agente retenedor (decisión D3 de MOD14). */
async function seedBusinessO23(tag: string): Promise<Seed> {
  const nit = `9${String(Number.parseInt(RUN_ID.slice(0, 8), 16) % 100_000_000).padStart(8, '0')}`;
  const email = `qa-${tag}-${RUN_ID}@example.invalid`;
  const subscriber = await expectJson<{ id: string }>('/crm/subscribers', 'POST', 201, {
    headers: tenantHeaders(),
    data: {
      personType: 'JURIDICA',
      customerSegment: 'PYME',
      nit,
      nitVerificationDigit: nitVerificationDigit(nit),
      businessName: `Empresa QA ${tag} ${RUN_ID} S.A.S.`,
      legalRepresentative: {
        fullName: `Representante QA ${RUN_ID}`,
        documentType: 'CC',
        documentNumber: `RL${RUN_ID.slice(0, 8)}`,
      },
      email,
      address: `Dirección sintética ${RUN_ID}`,
      city: 'Bogotá',
      department: 'Cundinamarca',
      vatResponsibility: 'RESPONSABLE',
      rutResponsibilities: ['O-13', 'O-23'],
      authorizationChannel: 'PRESENCIAL',
      authorizations: [{ purpose: 'TRATAMIENTO_CONTRACTUAL', granted: true, legalTextId }],
    },
  });
  const contractId = await createContract(subscriber.id, {
    planId: catalog.businessPlanId,
    planName: catalog.businessPlanName,
    price: '1000000.00',
    segment: 'PYME',
    fiscal: {
      fiscalName: `Empresa QA ${tag} ${RUN_ID} S.A.S.`,
      fiscalDocument: `${nit}-${nitVerificationDigit(nit)}`,
    },
  });
  return { subscriberId: subscriber.id, contractId, email };
}

function getDocument(id: string): Promise<BillingDoc> {
  return expectJson<BillingDoc>(`/billing/documents/${id}`, 'GET', 200, {
    headers: tenantHeaders(),
  });
}

/** Activa el contrato (genera el primer cobro, ADR-109 D6) y lo emite. */
async function activateAndIssue(seed: Seed): Promise<BillingDoc> {
  await expectJson(`/crm/contracts/${seed.contractId}/activate`, 'POST', 200, {
    headers: tenantHeaders(),
    data: { billingCycleDay: cycleDay },
  });
  let documents: Array<{ id: string }> = [];
  await expect
    .poll(
      async () => {
        documents = asList<{ id: string }>(
          await expectJson<unknown>(
            `/billing/documents?subscriberId=${seed.subscriberId}&limit=5`,
            'GET',
            200,
            { headers: tenantHeaders() },
          ),
        );
        return documents.length;
      },
      { timeout: 30_000, message: 'La activación no generó el primer cobro.' },
    )
    .toBe(1);
  const draft = await getDocument(documents[0]!.id);
  expect(draft.blockingReason ?? null, 'Motivo de bloqueo del borrador').toBeNull();
  await expectJson('/billing/documents/issue', 'POST', 200, {
    headers: withKey(tenantHeaders()),
    data: { documentIds: [draft.id] },
  });
  const issued = await getDocument(draft.id);
  expect(issued.status).toBe('EMITIDO');
  expect(issued.number).toBeTruthy();
  return issued;
}

async function registerPayment(data: Dict): Promise<Payment> {
  return expectJson<Payment>('/billing/payments', 'POST', 201, {
    headers: withKey(tenantHeaders()),
    data: { method: 'TRANSFERENCIA', paidAt: bogotaToday(), ...data },
  });
}

function statement(subscriberId: string): Promise<Statement> {
  return expectJson<Statement>(`/billing/subscribers/${subscriberId}/statement`, 'GET', 200, {
    headers: tenantHeaders(),
  });
}

async function emailLog(subscriberId: string): Promise<EmailEntry[]> {
  return (
    await expectJson<{ entries: EmailEntry[] }>(
      `/billing/subscribers/${subscriberId}/email-log`,
      'GET',
      200,
      { headers: tenantHeaders() },
    )
  ).entries;
}

/** Espera a que el envío salga de `EN_COLA` (el procesador vive en apps/api, D9). */
async function settledEmail(subscriberId: string, entryId: string): Promise<EmailEntry> {
  let found: EmailEntry | undefined;
  await expect
    .poll(
      async () => {
        found = (await emailLog(subscriberId)).find((entry) => entry.id === entryId);
        return found?.status ?? 'AUSENTE';
      },
      { timeout: 60_000, intervals: [500, 1_000, 2_000], message: 'El envío quedó en cola.' },
    )
    .not.toMatch(/^(?:EN_COLA|AUSENTE)$/u);
  return found!;
}

// ── Importación UISP (CA-7, IMPORTADO) ──────────────────────────────────────

type BatchReport = {
  status: string;
  counts: {
    procesamiento: string;
    entidades?: Record<string, { validos: number; rechazados: number }>;
  };
  promotion: { promovidos?: Record<string, number> } | null;
};

async function waitBatch(batchId: string, done: (report: BatchReport) => boolean) {
  let last: BatchReport | undefined;
  await expect
    .poll(
      async () => {
        last = await expectJson<BatchReport>(`/migration/batches/${batchId}`, 'GET', 200, {
          headers: tenantHeaders(),
        });
        return done(last);
      },
      { timeout: 120_000, intervals: [1_000, 2_000, 4_000] },
    )
    .toBe(true);
  return last!;
}

/** Importa un cliente sintético de UISP y lo promueve: 3 IMPORTADO y 2 pagos aplicados. */
async function importUispClient(): Promise<string> {
  const { buildSyntheticUispZip } = loadUispFixture();
  const zip = await buildSyntheticUispZip({
    clientId: UISP_CLIENT_ID,
    // CC de 5 a 10 dígitos (uisp-simulation.ts): 4 del cliente + 6 derivados del RUN_ID.
    document: `${UISP_CLIENT_ID}${String(Number.parseInt(RUN_ID.slice(0, 6), 16) % 1_000_000).padStart(6, '0')}`,
    lastName: `Importado ${RUN_ID}`,
    stratum: '3',
  });
  const form = new FormData();
  form.append(
    'files',
    new Blob([zip], { type: 'application/zip' }),
    `cliente-${UISP_CLIENT_ID}.zip`,
  );
  const batch = await expectJson<{ id: string }>('/migration/batches', 'POST', 202, {
    headers: tenantHeaders(),
    multipart: form,
  });
  // Antes de las equivalencias la simulación rechaza por «…_SIN_EQUIVALENCIA»; la promoción
  // vuelve a preparar el lote con ellas. Aquí solo se descarta un titular con datos incompletos.
  const simulated = await waitBatch(
    batch.id,
    (r) => r.status === 'SIMULADO' && r.counts.procesamiento === 'COMPLETADO',
  );
  expect(JSON.stringify(simulated), 'Titular con datos obligatorios').not.toContain(
    'DATOS_OBLIGATORIOS_AUSENTES',
  );
  const pending = await expectJson<Array<{ kind: string; externalValue: string }>>(
    `/migration/batches/${batch.id}/pending-mappings`,
    'GET',
    200,
    { headers: tenantHeaders() },
  );
  const target: Record<string, Dict> = {
    PLAN: { action: 'EQUIVALE', targetRef: catalog.residentialPlanId },
    METODO_PAGO: { action: 'EQUIVALE', targetRef: 'EFECTIVO' },
    CICLO: { action: 'EQUIVALE', targetRef: String(cycleDay) },
    ETIQUETA: { action: 'DESCARTAR' },
  };
  for (const value of pending) {
    await expectJson('/migration/mappings', 'POST', 201, {
      headers: tenantHeaders(),
      data: { kind: value.kind, externalValue: value.externalValue, ...target[value.kind] },
    });
  }
  await expectJson(`/migration/batches/${batch.id}/promote`, 'POST', 202, {
    headers: tenantHeaders(),
  });
  const promoted = await waitBatch(
    batch.id,
    (r) => (r.status === 'PROMOVIDO' || r.status === 'CONCILIADO') && r.promotion !== null,
  );
  expect(promoted.promotion?.promovidos?.SUSCRIPTOR, 'Titular promovido').toBe(1);
  const documents = asList<BillingDoc>(
    await expectJson<unknown>('/billing/documents?page=1&limit=100', 'GET', 200, {
      headers: tenantHeaders(),
    }),
  ).filter((document) => document.status === 'IMPORTADO');
  const subscriberIds = [...new Set(documents.map((document) => document.subscriberId))];
  expect(subscriberIds, 'Un solo titular importado').toHaveLength(1);
  return subscriberIds[0]!;
}

// ── Portal ──────────────────────────────────────────────────────────────────

async function loginInPortal(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('Empresa').fill(TENANT_SLUG);
  await page.getByLabel('Correo electrónico').fill(ADMIN_EMAIL);
  await page.locator('input[autocomplete="current-password"]').fill(tenantAdminPassword);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

const SUBTAB_LABEL = { facturas: 'Facturas', pagos: 'Pagos', estado: 'Estado de cuenta' } as const;
type Subtab = keyof typeof SUBTAB_LABEL;

/** Abre la ficha en Facturación → `sub` y espera su panel. */
async function openBilling(page: Page, subscriberId: string, sub: Subtab): Promise<Locator> {
  await page.goto(`/dashboard/crm/subscribers/${subscriberId}?tab=facturacion&sub=${sub}`);
  const panel = page.getByRole('tabpanel', { name: SUBTAB_LABEL[sub], exact: true });
  await expect(panel).toBeVisible({ timeout: 45_000 });
  return panel;
}

function billingTab(page: Page): Locator {
  return page.getByRole('tabpanel', { name: 'Facturación', exact: true });
}

/** Valor de una tarjeta de métricas por su título. */
function metric(page: Page, title: string): Locator {
  return billingTab(page).getByText(title, { exact: true }).locator('xpath=..');
}

async function expectPdfDownload(download: Download, filename: string): Promise<void> {
  expect(download.suggestedFilename()).toBe(filename);
  const path = await download.path();
  expect(path, 'Archivo descargado').toBeTruthy();
  expect(readFileSync(path!).subarray(0, 5).toString('latin1')).toBe('%PDF-');
}

async function expectPdfRoute(path: string, filename?: string): Promise<void> {
  const response = await api!.fetch(`${API_PREFIX}${path}`, { headers: tenantHeaders() });
  expect(response.status(), `GET ${path}`).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  if (filename) expect(response.headers()['content-disposition']).toContain(filename);
  expect((await response.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
}

/** axe WCAG 2.2 AA (serious/critical) acotado a un elemento marcado en el DOM. */
async function expectNoSeriousAxeViolations(
  page: Page,
  scope: Locator,
  label: string,
): Promise<void> {
  const token = `axe-${randomUUID().slice(0, 8)}`;
  await scope.evaluate((element, value) => element.setAttribute('data-qa-axe', value), token);
  const result = await new AxeBuilder({ page })
    .include(`[data-qa-axe="${token}"]`)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = result.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    blocking,
    `axe ${label}: ${blocking.map((v) => `${v.id} (${v.nodes.length})`).join(', ')}`,
  ).toEqual([]);
}

/** Fila del registro de envíos dentro de un contenedor. */
function emailLogRows(container: Locator): Locator {
  return container
    .getByRole('region', { name: 'Registro de envíos' })
    .getByRole('region', { name: 'Envíos por correo' })
    .getByRole('row');
}

test.use({ trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off' });

test.describe('MOD05↔MOD14 Facturación en la ficha estilo UISP — E2E vivo', () => {
  test.skip(
    missingLiveEnvironment.length > 0,
    `Entorno E2E real omitido; faltan variables: ${missingLiveEnvironment.join(', ')}.`,
  );
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    try {
      await createDisposableTenant();
      await chooseCycle();
      await seedLegalAndOperator();
      await seedCatalog();
    } catch (error) {
      await cleanupTenant();
      throw error;
    }
  });

  test.afterAll(async () => {
    try {
      await cleanupTenant();
    } finally {
      await api?.dispose();
    }
  });

  test('CA-1 y R6: Documentos ya no lista cobros; Facturas los lista con PDF, fecha de emisión y lo que había arriba', async ({
    page,
  }) => {
    const seed = await seedResidential('ca1');
    const issued = await activateAndIssue(seed);
    const number = issued.number!;

    await loginInPortal(page);
    // D1: la pestaña Documentos no muestra el documento de cobro (ni EMITIDO ni su PDF).
    await page.goto(`/dashboard/crm/subscribers/${seed.subscriberId}?tab=documentos`);
    const documents = page.getByRole('tabpanel', { name: 'Documentos', exact: true });
    await expect(documents.getByRole('heading', { name: 'Documentos', exact: true })).toBeVisible({
      timeout: 45_000,
    });
    await expect(documents.getByText(number)).toHaveCount(0);
    await expect(documents.getByText(/Documento de cobro|\bFactura\b/u)).toHaveCount(0);
    await expect(documents.getByText(/documentos de cobro|\bfacturas\b/u)).toHaveCount(0);

    // W0 obligación 5: «Ver facturación» de la Vista general abre Facturación → Facturas.
    await page.goto(`/dashboard/crm/subscribers/${seed.subscriberId}`);
    await page.getByRole('button', { name: 'Ver facturación' }).first().click();
    await expect(page).toHaveURL(/[?&]tab=facturacion(?:&|$)/u);
    await expect(page).toHaveURL(/[?&]sub=facturas(?:&|$)/u);
    await expect(page.getByRole('tab', { name: 'Facturas', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // R6: arriba siguen métricas y acciones; Facturas trae el cobro y la facturación por servicio.
    const facturas = await openBilling(page, seed.subscriberId, 'facturas');
    for (const title of [
      'Total facturado',
      'Total pagado',
      'Deuda pendiente actual',
      'Saldo a favor disponible',
    ]) {
      await expect(metric(page, title)).toBeVisible();
    }
    await expect(
      billingTab(page).getByRole('button', { name: 'Registrar pago', exact: true }),
    ).toBeVisible();
    await expect(
      billingTab(page).getByRole('button', { name: 'Aplicar saldo a favor', exact: true }),
    ).toBeVisible();
    await expect(facturas.getByRole('button', { name: 'Ver política' })).toBeVisible();

    const row = facturas.getByRole('row').filter({ hasText: number });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText('Emitida');
    await expect(
      row.getByRole('button', { name: `Enviar por correo la factura ${number}` }),
    ).toBeVisible();
    await expect(row.getByRole('button', { name: 'Anular factura' })).toBeVisible();

    const pdf = page.waitForEvent('download');
    await row.getByRole('button', { name: 'Descargar PDF' }).click();
    await expectPdfDownload(await pdf, `factura-${number}.pdf`);
    await expectPdfRoute(`/billing/documents/${issued.id}/pdf`);

    // W0 obligación 1: la fecha de emisión ahora se ve en el detalle de Facturas.
    await row.getByRole('button', { name: 'Ver detalle' }).click();
    const detail = page.getByRole('dialog', { name: number });
    await expect(detail.getByText('Fecha de emisión', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('CA-2: el estado de cuenta con factura, cortesía, retenciones y saldo a favor cuadra con la cartera y descarga en PDF', async ({
    page,
  }) => {
    const seed = await seedBusinessO23('ca2');
    const issued = await activateAndIssue(seed);

    // Cortesía de 10.000 sobre el documento emitido.
    await expectJson(`/billing/documents/${issued.id}/courtesies`, 'POST', 201, {
      headers: withKey(tenantHeaders()),
      data: { target: 'VALOR', amount: '10000.00', reasonCode: 'PROMOCION_COMERCIAL' },
    });
    // Pago parcial con retefuente 4 % y reteICA 9,66 ‰ sobre 1.000.000 (O-23, decisión D3).
    const withheld = await registerPayment({
      subscriberId: seed.subscriberId,
      amount: '500000.00',
      reference: `QA-FF-CA2-A-${RUN_ID}`,
      withholdings: [
        {
          taxCode: 'RETE_FUENTE_SERVICIOS',
          base: '1000000.00',
          rate: '4',
          amount: '40000.00',
          certificateNumber: `CERT-RF-${RUN_ID}`,
        },
        {
          taxCode: 'RETE_ICA',
          base: '1000000.00',
          rate: '0.966',
          amount: '9660.00',
          certificateNumber: `CERT-ICA-${RUN_ID}`,
        },
      ],
    });
    // Pago sin aplicar: queda como saldo a favor con la factura todavía pendiente.
    await registerPayment({
      subscriberId: seed.subscriberId,
      amount: '50000.00',
      reference: `QA-FF-CA2-B-${RUN_ID}`,
      allocations: [],
    });

    const account = await statement(seed.subscriberId);
    expect(cents(account.totalPending), 'Deuda pendiente').toBeGreaterThan(0);
    expect(account.creditBalance).toBe('50000.00');
    const ledger = await expectJson<Ledger>(
      `/billing/subscribers/${seed.subscriberId}/statement/ledger`,
      'GET',
      200,
      { headers: tenantHeaders() },
    );
    // R2 / P1b: saldo final del libro = deuda pendiente − saldo a favor (en centavos).
    expect(cents(ledger.closingBalance)).toBe(
      cents(account.totalPending) - cents(account.creditBalance),
    );
    expect(ledger.rows.at(-1)?.balance).toBe(ledger.closingBalance);
    const kinds = new Set(ledger.rows.map((row) => row.kind));
    for (const kind of ['DOCUMENTO', 'CORTESIA', 'PAGO', 'RETENCION'])
      expect([...kinds], `fila ${kind} del libro`).toContain(kind);

    // P3: una aplicación con retención vigente sobre ese documento no se desasocia (422).
    const allocation = (
      account.payments.find((payment) => payment.id === withheld.id)?.allocations ?? []
    ).find((item) => item.documentId === issued.id && !item.reversedAt);
    expect(allocation, 'Aplicación del pago con retenciones').toBeTruthy();
    expect(
      await expectError(
        `/billing/payments/${withheld.id}/allocations/${allocation!.id}/unlink`,
        'POST',
        {
          reasonCode: 'VALOR_EQUIVOCADO',
        },
      ),
    ).toEqual({ status: 422, code: 'BILLING_ALLOCATION_HAS_WITHHOLDING' });

    await loginInPortal(page);
    const estado = await openBilling(page, seed.subscriberId, 'estado');
    await expect(metric(page, 'Deuda pendiente actual')).toContainText(
      moneyPattern(account.totalPending),
    );
    await expect(metric(page, 'Saldo a favor disponible')).toContainText(moneyPattern('50000'));
    const ledgerTable = estado.getByRole('region', { name: 'Movimientos del estado de cuenta' });
    await expect(ledgerTable).toBeVisible({ timeout: 30_000 });
    for (const concept of ['Factura', 'Cortesía', 'Pago', 'Retención'])
      await expect(ledgerTable.getByText(concept, { exact: true }).first()).toBeVisible();
    const finalLine = estado.getByText(/^Saldo final:/u);
    await expect(finalLine).toContainText(moneyPattern(ledger.closingBalance));
    await expect(finalLine).not.toContainText('a favor');

    const pdf = page.waitForEvent('download');
    await estado.getByRole('button', { name: 'Descargar PDF' }).click();
    await expectPdfDownload(await pdf, 'estado-de-cuenta.pdf');
    await expectPdfRoute(`/billing/subscribers/${seed.subscriberId}/statement/ledger/pdf`);

    // R6: los detalles de cortesías (Facturas) y de retenciones (Pagos) siguen disponibles.
    const pagos = await openBilling(page, seed.subscriberId, 'pagos');
    await expect(pagos.getByRole('region', { name: 'Detalle de retenciones' })).toBeVisible();
    const facturas = await openBilling(page, seed.subscriberId, 'facturas');
    await expect(facturas.getByRole('region', { name: 'Detalle de cortesías' })).toBeVisible();
  });

  test('CA-3: registrar un pago genera recibo numerado que se descarga y se envía con registro enmascarado', async ({
    page,
  }) => {
    const seed = await seedResidential('ca3');
    const issued = await activateAndIssue(seed);
    const reference = `QA-FF-CA3-${RUN_ID}`;

    await loginInPortal(page);
    await openBilling(page, seed.subscriberId, 'facturas');
    await billingTab(page).getByRole('button', { name: 'Registrar pago', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Registrar pago' });
    await expect(dialog.getByLabel('Método de pago')).toBeVisible({ timeout: 30_000 });
    await dialog.getByLabel('Método de pago').selectOption('EFECTIVO');
    await dialog.getByLabel('Referencia').fill(reference);
    await dialog.getByRole('button', { name: 'Pagar el saldo completo' }).click();
    await dialog.getByRole('button', { name: 'Registrar pago', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    const payment = (await statement(seed.subscriberId)).payments.find(
      (item) => item.reference === reference,
    );
    expect(payment, 'Pago registrado desde el diálogo').toBeTruthy();
    expect(payment!.receiptNumber, 'Consecutivo del recibo').toBeGreaterThan(0);
    const receipt = payment!.receiptNumber!;
    expect((await getDocument(issued.id)).pendingAmount).toBe('0.00');

    const pagos = await openBilling(page, seed.subscriberId, 'pagos');
    const row = pagos.getByRole('row').filter({ hasText: reference });
    await expect(row).toContainText(`N.º ${receipt}`);
    await row.getByRole('button', { name: /^Ver detalle del pago/u }).click();
    const detail = page.getByRole('dialog', { name: `Recibo N.º ${receipt}` });
    await expect(detail).toBeVisible({ timeout: 30_000 });
    await expect(
      detail.getByRole('region', { name: 'Facturas cubiertas por el pago' }),
    ).toContainText(issued.number!);

    const pdf = page.waitForEvent('download');
    await detail.getByRole('button', { name: 'Descargar recibo' }).click();
    await expectPdfDownload(await pdf, `recibo-${receipt}.pdf`);
    await expectPdfRoute(`/billing/payments/${payment!.id}/receipt/pdf`, `recibo-${receipt}.pdf`);

    await detail.getByRole('button', { name: 'Enviar recibo' }).click();
    await expect(detail.getByText(/^(?:Envío en cola|Correo enviado)$/u)).toBeVisible({
      timeout: 30_000,
    });
    const sent = (await emailLog(seed.subscriberId)).filter(
      (entry) => entry.kind === 'RECIBO' && entry.paymentId === payment!.id,
    );
    expect(sent).toHaveLength(1);
    const settled = await settledEmail(seed.subscriberId, sent[0]!.id);
    // Mailer sin SMTP_HOST (modo dev, también en CI): el procesador cierra la fila como ENVIADO.
    expect(settled.status).toBe('ENVIADO');
    expect(settled.recipientMasked).toBe('q***@e***.invalid');
    expect(settled.recipientMasked).not.toContain(seed.email!);

    const rows = emailLogRows(detail);
    await expect(rows.filter({ hasText: 'q***@e***.invalid' })).toHaveCount(1, { timeout: 30_000 });
    await expect(rows.filter({ hasText: /En cola|Enviado/u })).toHaveCount(1);
    await expect(detail.getByText(seed.email!)).toHaveCount(0);
  });

  test('CA-4: enviar una factura deja registro; un titular sin correo deja el rechazo visible', async ({
    page,
  }) => {
    const seed = await seedResidential('ca4');
    const issued = await activateAndIssue(seed);
    const noEmail = await seedResidential('ca4s', false);
    const issuedNoEmail = await activateAndIssue(noEmail);

    await loginInPortal(page);
    let facturas = await openBilling(page, seed.subscriberId, 'facturas');
    await facturas
      .getByRole('button', { name: `Enviar por correo la factura ${issued.number}` })
      .click();
    await expect(facturas.getByText(/^(?:Envío en cola|Correo enviado)$/u)).toBeVisible({
      timeout: 30_000,
    });
    const entries = (await emailLog(seed.subscriberId)).filter(
      (entry) => entry.kind === 'FACTURA' && entry.documentId === issued.id,
    );
    expect(entries).toHaveLength(1);
    const settled = await settledEmail(seed.subscriberId, entries[0]!.id);
    expect(settled).toMatchObject({ status: 'ENVIADO', recipientMasked: 'q***@e***.invalid' });

    await facturas
      .getByRole('row')
      .filter({ hasText: issued.number! })
      .getByRole('button', { name: 'Ver detalle' })
      .click();
    let detail = page.getByRole('dialog', { name: issued.number! });
    await expect(
      emailLogRows(detail).filter({ hasText: 'q***@e***.invalid' }).filter({ hasText: 'Enviado' }),
    ).toHaveCount(1, { timeout: 30_000 });

    // Error visible. Sustitución documentada: sin correo registrado → RECHAZADO / SIN_CORREO.
    facturas = await openBilling(page, noEmail.subscriberId, 'facturas');
    await facturas
      .getByRole('button', { name: `Enviar por correo la factura ${issuedNoEmail.number}` })
      .click();
    await expect(facturas.getByText('No se envió el correo', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(facturas.getByText(/no tiene correo registrado/u)).toBeVisible();
    const rejected = (await emailLog(noEmail.subscriberId)).filter(
      (entry) => entry.kind === 'FACTURA' && entry.documentId === issuedNoEmail.id,
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      status: 'RECHAZADO',
      reasonCode: 'SIN_CORREO',
      recipientMasked: null,
    });
    await facturas
      .getByRole('row')
      .filter({ hasText: issuedNoEmail.number! })
      .getByRole('button', { name: 'Ver detalle' })
      .click();
    detail = page.getByRole('dialog', { name: issuedNoEmail.number! });
    const rejectedRow = emailLogRows(detail).filter({ hasText: 'Rechazado' });
    await expect(rejectedRow).toHaveCount(1, { timeout: 30_000 });
    await expect(rejectedRow).toContainText('Sin correo registrado');
    await expect(rejectedRow).toContainText('No disponible');
  });

  test('CA-5: desasociar un pago deja la factura con saldo y el valor como saldo a favor, auditado y re-aplicable', async ({
    page,
  }) => {
    const seed = await seedResidential('ca5');
    const issued = await activateAndIssue(seed);
    const reference = `QA-FF-CA5-${RUN_ID}`;
    const payment = await registerPayment({
      subscriberId: seed.subscriberId,
      amount: issued.total,
      reference,
    });
    const allocation = (payment.allocations ?? []).find((item) => item.documentId === issued.id);
    expect(allocation, 'Aplicación FIFO del pago').toBeTruthy();
    expect((await getDocument(issued.id)).pendingAmount).toBe('0.00');

    await loginInPortal(page);
    const pagos = await openBilling(page, seed.subscriberId, 'pagos');
    await pagos
      .getByRole('row')
      .filter({ hasText: reference })
      .getByRole('button', { name: /^Ver detalle del pago/u })
      .click();
    const detail = page.getByRole('dialog', { name: /^Recibo N\.º \d+$/u });
    await expect(detail).toBeVisible({ timeout: 30_000 });
    await detail.getByRole('button', { name: `Desasociar de la factura ${issued.number}` }).click();
    const confirm = page.getByRole('dialog', { name: `Desasociar de la factura ${issued.number}` });
    await expect(confirm).toContainText('vuelve al saldo a favor');
    await confirm.getByLabel('Motivo').selectOption('REASIGNACION');
    await confirm.getByRole('button', { name: 'Desasociar', exact: true }).click();
    await expect(confirm).toBeHidden({ timeout: 30_000 });

    // La factura reabre su saldo y el valor queda como saldo a favor del pago.
    await expect
      .poll(async () => (await getDocument(issued.id)).pendingAmount, { timeout: 15_000 })
      .toBe(issued.total);
    const after = await statement(seed.subscriberId);
    expect(after.creditBalance).toBe(issued.total);
    expect(after.totalPending).toBe(issued.total);
    const reversed = after.payments
      .find((item) => item.id === payment.id)
      ?.allocations?.find((item) => item.id === allocation!.id);
    expect(reversed?.reversedAt).toBeTruthy();
    expect(reversed?.reversalReasonCode).toBe('REASIGNACION');
    expect(after.payments.find((item) => item.id === payment.id)?.status).toBe('REGISTRADO');
    // Auditoría (la API no la expone): una actualización con motivo y valor, sin texto libre.
    expect(
      tenantPsql(
        `SELECT new_value->>'reasonCode' || '|' || (new_value->>'amount') || '|' || (new_value->>'status') FROM audit_logs WHERE entity_type = 'BillingPaymentAllocation' AND action = 'UPDATE' AND entity_id = '${allocation!.id}';`,
      ),
    ).toBe(`REASIGNACION|${issued.total}|DESASOCIADA`);

    const peek = page.getByRole('dialog', { name: /^Recibo N\.º \d+$/u });
    const coveredRow = peek
      .getByRole('region', { name: 'Facturas cubiertas por el pago' })
      .getByRole('row')
      .filter({ hasText: issued.number! });
    await expect(coveredRow).toContainText('Desasociada', { timeout: 30_000 });
    await expect(coveredRow).toContainText('Se va a aplicar a otra factura');
    await expect(metric(page, 'Saldo a favor disponible')).toContainText(
      moneyPattern(issued.total),
    );

    // R5: el valor se vuelve a aplicar con el endpoint de aplicaciones existente.
    await expectJson(`/billing/payments/${payment.id}/allocations`, 'POST', 200, {
      headers: tenantHeaders(),
      data: {
        subscriberId: seed.subscriberId,
        allocations: [{ paymentId: payment.id, documentId: issued.id, amount: issued.total }],
      },
    });
    expect((await getDocument(issued.id)).pendingAmount).toBe('0.00');
    expect((await statement(seed.subscriberId)).creditBalance).toBe('0.00');
  });

  test('CA-6: un titular con datos bloqueados no recibe envíos y el registro queda rechazado sin destinatario', async ({
    page,
  }) => {
    const seed = await seedResidential('ca6');
    const issued = await activateAndIssue(seed);
    const payment = await registerPayment({
      subscriberId: seed.subscriberId,
      amount: issued.total,
      reference: `QA-FF-CA6-${RUN_ID}`,
    });

    // Marca DATOS_BLOQUEADOS sembrada por SQL: la API no expone marcas directas.
    const party = tenantPsql(
      `SELECT party_id::text FROM subscribers WHERE id = '${seed.subscriberId}';`,
    );
    expect(party).toMatch(/^[0-9a-f-]{36}$/u);
    tenantPsql(
      `INSERT INTO party_privacy_marks (party_id, mark, event) VALUES ('${party}', 'DATOS_BLOQUEADOS', 'OPEN');`,
    );

    const invoice = await expectJson<EmailEntry>(
      `/billing/documents/${issued.id}/send`,
      'POST',
      202,
      {
        headers: tenantHeaders(),
      },
    );
    const receipt = await expectJson<EmailEntry>(
      `/billing/payments/${payment.id}/receipt/send`,
      'POST',
      202,
      { headers: tenantHeaders() },
    );
    for (const entry of [invoice, receipt])
      expect(entry).toMatchObject({
        status: 'RECHAZADO',
        reasonCode: 'TITULAR_RESTRINGIDO',
        recipientMasked: null,
      });

    await loginInPortal(page);
    const estado = await openBilling(page, seed.subscriberId, 'estado');
    await estado.getByRole('button', { name: 'Enviar al cliente' }).click();
    await expect(estado.getByText('No se envió el correo', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(estado.getByText(/datos del titular están restringidos/u)).toBeVisible();
    const row = emailLogRows(estado).filter({ hasText: 'Rechazado' });
    await expect(row).toHaveCount(1, { timeout: 30_000 });
    await expect(row).toContainText('Datos del titular restringidos');
    await expect(row).toContainText('No disponible');

    const log = await emailLog(seed.subscriberId);
    expect(log.map((entry) => entry.kind).sort()).toEqual(['ESTADO_CUENTA', 'FACTURA', 'RECIBO']);
    for (const entry of log)
      expect(entry).toMatchObject({
        status: 'RECHAZADO',
        reasonCode: 'TITULAR_RESTRINGIDO',
        recipientMasked: null,
      });
    // Sin datos personales en el registro persistido, no solo en la respuesta.
    expect(
      tenantPsql(
        `SELECT COUNT(*)::int FROM billing_email_log WHERE subscriber_id = '${seed.subscriberId}' AND recipient_masked IS NOT NULL;`,
      ),
    ).toBe('0');
    expect(
      tenantPsql(
        `SELECT COUNT(*)::int FROM billing_email_log WHERE subscriber_id = '${seed.subscriberId}' AND subject ILIKE '%${seed.email}%';`,
      ),
    ).toBe('0');
  });

  test('CA-7: no se puede desasociar sobre un histórico IMPORTADO (deshabilitado con su explicación y 409) ni sobre un documento ANULADO', async ({
    page,
  }) => {
    // IMPORTADO: importación UISP real (ADR-110) con pagos aplicados a los históricos.
    const importedSubscriberId = await importUispClient();
    const importedAccount = await statement(importedSubscriberId);
    const importedPayment = importedAccount.payments.find(
      (payment) => payment.imported && (payment.allocations ?? []).some((a) => !a.reversedAt),
    );
    expect(importedPayment, 'Pago importado con aplicación vigente').toBeTruthy();
    const importedAllocation = importedPayment!.allocations!.find((a) => !a.reversedAt)!;
    const importedDocument = importedAccount.documents.find(
      (document) => document.id === importedAllocation.documentId,
    );
    expect(importedDocument?.status, 'El estado de cuenta incluye el histórico').toBe('IMPORTADO');
    const externalNumber = importedDocument!.externalNumber!;

    expect(
      await expectError(
        `/billing/payments/${importedPayment!.id}/allocations/${importedAllocation.id}/unlink`,
        'POST',
        { reasonCode: 'REASIGNACION' },
      ),
    ).toEqual({ status: 409, code: 'BILLING_ALLOCATION_NOT_UNLINKABLE' });
    // Un IMPORTADO tampoco se envía por correo.
    expect(await expectError(`/billing/documents/${importedDocument!.id}/send`, 'POST')).toEqual({
      status: 409,
      code: 'BILLING_EMAIL_IMPORTED_NOT_SENDABLE',
    });

    await loginInPortal(page);
    let pagos = await openBilling(page, importedSubscriberId, 'pagos');
    const importedRow = pagos
      .getByRole('row')
      .filter({ hasText: `Importado · ${importedPayment!.externalId}` });
    await importedRow.getByRole('button', { name: /^Ver detalle del pago/u }).click();
    let detail = page.getByRole('dialog', { name: 'Pago importado' });
    await expect(detail).toBeVisible({ timeout: 30_000 });
    await expect(detail.getByRole('button', { name: 'Descargar recibo' })).toHaveCount(0);
    const blockedButton = detail.getByRole('button', {
      name: `Desasociar de la factura ${externalNumber}`,
    });
    await expect(blockedButton).toBeDisabled();
    await expect(blockedButton).toHaveAccessibleDescription(
      'No se puede desasociar: es una factura histórica de UISP.',
    );

    // R6 / W0 2-3: Facturas lista los IMPORTADO y su PDF se nombra con el número de origen.
    const facturas = await openBilling(page, importedSubscriberId, 'facturas');
    const withPdf = facturas.getByRole('row').filter({ hasText: 'SINT-2023-1' });
    await expect(withPdf).toContainText('Importada de UISP', { timeout: 30_000 });
    await expect(withPdf.getByRole('button', { name: /^Enviar por correo/u })).toHaveCount(0);
    const pdf = page.waitForEvent('download');
    await withPdf.getByRole('button', { name: 'Descargar PDF' }).click();
    await expectPdfDownload(await pdf, 'factura-importada-SINT-2023-1.pdf');
    for (const n of [2, 3])
      await expect(facturas.getByRole('row').filter({ hasText: `SINT-2023-${n}` })).toHaveCount(1);
    // D1 / R6: Documentos conserva los soportes importados y ya no los históricos de cobro.
    await page.goto(`/dashboard/crm/subscribers/${importedSubscriberId}?tab=documentos`);
    const documents = page.getByRole('tabpanel', { name: 'Documentos', exact: true });
    await expect(documents.getByText('Soporte importado (PDF)', { exact: true })).toBeVisible({
      timeout: 45_000,
    });
    await expect(
      documents.getByText(/(?:Histórico importado|Factura histórica de UISP) SINT-2023-/u),
    ).toHaveCount(0);

    // ANULADO: anular el documento revierte la aplicación; queda sin acción y la API da 404.
    const seed = await seedResidential('ca7');
    const issued = await activateAndIssue(seed);
    const reference = `QA-FF-CA7-${RUN_ID}`;
    const payment = await registerPayment({
      subscriberId: seed.subscriberId,
      amount: issued.total,
      reference,
    });
    const allocation = payment.allocations!.find((item) => item.documentId === issued.id)!;
    await expectJson(`/billing/documents/${issued.id}/void`, 'POST', 200, {
      headers: withKey(tenantHeaders()),
      data: { reasonCode: 'ERROR_DE_VALOR' },
    });
    expect(
      await expectError(
        `/billing/payments/${payment.id}/allocations/${allocation.id}/unlink`,
        'POST',
        {
          reasonCode: 'REASIGNACION',
        },
      ),
    ).toEqual({ status: 404, code: 'BILLING_ALLOCATION_NOT_FOUND' });

    pagos = await openBilling(page, seed.subscriberId, 'pagos');
    await pagos
      .getByRole('row')
      .filter({ hasText: reference })
      .getByRole('button', { name: /^Ver detalle del pago/u })
      .click();
    detail = page.getByRole('dialog', { name: /^Recibo N\.º \d+$/u });
    const voidedRow = detail
      .getByRole('region', { name: 'Facturas cubiertas por el pago' })
      .getByRole('row')
      .filter({ hasText: issued.number! });
    await expect(voidedRow).toContainText('Revertida', { timeout: 30_000 });
    await expect(voidedRow.getByRole('button', { name: /^Desasociar/u })).toHaveCount(0);
  });

  test('Subpestañas: URL y teclado; axe WCAG 2.2 AA en Facturas, Pagos y Estado de cuenta (claro y oscuro)', async ({
    page,
  }) => {
    const seed = await seedResidential('a11y');
    const issued = await activateAndIssue(seed);
    await registerPayment({
      subscriberId: seed.subscriberId,
      amount: issued.total,
      reference: `QA-FF-A11Y-${RUN_ID}`,
    });

    await loginInPortal(page);
    // R1: la URL abre la subpestaña y la conserva al recargar.
    await openBilling(page, seed.subscriberId, 'estado');
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Estado de cuenta', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 45_000 },
    );
    // `sub` desconocido abre Facturas.
    await page.goto(`/dashboard/crm/subscribers/${seed.subscriberId}?tab=facturacion&sub=otra`);
    await expect(page.getByRole('tab', { name: 'Facturas', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 45_000 },
    );

    // Teclado: flechas, Inicio y Fin mueven el foco, activan la pestaña y actualizan la URL.
    const tab = (name: string) => page.getByRole('tab', { name, exact: true });
    await tab('Facturas').focus();
    const steps: Array<[string, string, Subtab]> = [
      ['ArrowRight', 'Pagos', 'pagos'],
      ['ArrowRight', 'Estado de cuenta', 'estado'],
      ['ArrowRight', 'Facturas', 'facturas'],
      ['ArrowLeft', 'Estado de cuenta', 'estado'],
      ['Home', 'Facturas', 'facturas'],
      ['End', 'Estado de cuenta', 'estado'],
    ];
    for (const [key, name, sub] of steps) {
      await page.keyboard.press(key);
      await expect(tab(name), `${key} → ${name}`).toBeFocused();
      await expect(tab(name)).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveURL(new RegExp(`[?&]sub=${sub}(?:&|$)`, 'u'));
      await expect(page).toHaveURL(/[?&]tab=facturacion(?:&|$)/u);
    }
    await expect(page.getByRole('tablist', { name: 'Secciones de facturación' })).toBeVisible();

    // axe por subpestaña en claro y oscuro, con sus datos cargados.
    const ready: Record<Subtab, (panel: Locator) => Promise<void>> = {
      facturas: (panel) =>
        expect(panel.getByRole('row').filter({ hasText: issued.number! })).toBeVisible({
          timeout: 30_000,
        }),
      pagos: (panel) =>
        expect(panel.getByRole('row').filter({ hasText: `QA-FF-A11Y-${RUN_ID}` })).toBeVisible({
          timeout: 30_000,
        }),
      estado: (panel) =>
        expect(panel.getByRole('region', { name: 'Movimientos del estado de cuenta' })).toBeVisible(
          { timeout: 30_000 },
        ),
    };
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const sub of ['facturas', 'pagos', 'estado'] as const) {
        const panel = await openBilling(page, seed.subscriberId, sub);
        await ready[sub](panel);
        await expectNoSeriousAxeViolations(
          page,
          billingTab(page),
          `Facturación → ${SUBTAB_LABEL[sub]} (${theme})`,
        );
      }
    }
    await page.emulateMedia({ colorScheme: 'light' });
  });
});
