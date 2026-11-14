/**
 * MOD14 · Primer cobro completo — E2E vivo (spec docs/specs/2026-11-13-mod14-primer-cobro-completo.md).
 *
 * Portal, API y worker reales (job «E2E operativo R4.1»). Tenant desechable por worker
 * (`srqa-pc-*`), siembra por API y limpieza al final. Nunca `tenant_iwana`. SQL solo para leer la
 * auditoría y el registro idempotente por OT, que la API no expone.
 *
 * Autocontenido: el `beforeAll` crea el tenant, la sede con su coordinador NOC, el catálogo, la
 * plantilla de contrato y el inventario base (bodega, proveedor, artículos). Cada prueba siembra su
 * titular, su contrato, su técnico con custodia propia y su OT, de modo que un reinicio del worker
 * tras un fallo (otro tenant, otro RUN_ID) no deja a ninguna prueba dependiendo de otra. Un técnico
 * por OT además reparte la cuota de evidencias (10 por actor y minuto).
 *
 * Cubre:
 * - CA-1 / R1 / R2 / R3: OT de instalación cerrada con 60 m de cable y conectores → el primer cobro
 *   muestra «Valor real de la instalación» con el costo promedio congelado; base, IVA y total del
 *   documento no cambian (valor cobrado = línea de instalación).
 * - CA-3 / R4: el router instalado queda «En comodato» con su serial y su valor de referencia.
 * - CA-2 / R5: OT cerrada después de emitir el primer cobro → el desglose aparece en el documento
 *   emitido sin cambiar montos; un solo registro y una sola auditoría por OT.
 * - CA-4 / R6 / R7 / R8: persona jurídica con O-23 en el RUT paga desde el diálogo con retefuente
 *   4 % y reteICA sobre una base de 1.000.000 (valores ajustados al peso, decisión D4) → el
 *   documento queda saldado y el estado de cuenta muestra las retenciones; ni una persona natural
 *   sin O-23 ni una jurídica con solo O-13 son elegibles (decisión D3).
 * - CA-5 / R8: anular ese pago anula las retenciones y reabre el saldo.
 * - a11y: axe WCAG 2.2 AA (serious/critical) del diálogo de pago con retenciones en claro y oscuro
 *   y de la sección del valor real.
 *
 * Requiere API_BASE_URL, worker vivo y credenciales de plataforma (E2E_PLATFORM_* o
 * PLATFORM_SUPER_ADMIN_*).
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { JPG } from './helpers/cierre-venta-live';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const API_PREFIX = '/api/v1';
const RUN_ID = randomUUID().replace(/-/gu, '').slice(0, 12);
const TENANT_SLUG = `srqa-pc-${RUN_ID}`;
const ADMIN_EMAIL = `srqa-pc-admin-${RUN_ID}@example.invalid`;
const DOCUMENTS_URL = '/dashboard/billing/documents';
const BREAKDOWN_HEADING = 'Valor real de la instalación (informativo, no se cobra)';

/** Costos de compra sintéticos: fijan el costo promedio de inventario (R2). */
const COST = { cablePerMeter: 1_200, connector: 2_500, router: 180_000 } as const;
const CABLE_METERS = 60;
const CONNECTORS = 4;

const missingLiveEnvironment = [
  !(process.env.E2E_PLATFORM_EMAIL?.trim() || process.env.PLATFORM_SUPER_ADMIN_EMAIL?.trim())
    ? 'E2E_PLATFORM_EMAIL o PLATFORM_SUPER_ADMIN_EMAIL'
    : null,
  !(process.env.E2E_PLATFORM_PASSWORD?.trim() || process.env.PLATFORM_SUPER_ADMIN_PASSWORD?.trim())
    ? 'E2E_PLATFORM_PASSWORD o PLATFORM_SUPER_ADMIN_PASSWORD'
    : null,
].filter((name): name is string => name !== null);

type Dict = Record<string, unknown>;
type DocLine = { id: string; kind: string; description: string; total: string };
type BreakdownItem = {
  executionOrderNumber: string;
  position: number;
  description: string;
  quantity: string;
  unitOfMeasure: string;
  unitReferenceValue: string | null;
  referenceValue: string | null;
  valueSource: string;
  isLoan: boolean;
  serialNumbers: string[];
};
type Breakdown = {
  executionOrders: Array<{ executionOrderNumber: string; closedAt: string }>;
  items: BreakdownItem[];
  realValue: string;
  chargedValue: string;
  itemsWithoutValue: number;
  serialsProtected: boolean;
};
type BillingDoc = {
  id: string;
  status: string;
  number: string | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  pendingAmount: string | null;
  blockingReason?: string | null;
  withholdingAmount?: string;
  lines?: DocLine[];
  installationBreakdown?: Breakdown | null;
};
type Withholding = {
  id: string;
  documentId: string;
  taxCode: string;
  base: string;
  rate: string;
  amount: string;
  certificateNumber: string | null;
  voidedAt: string | null;
};
type Payment = {
  id: string;
  status: string;
  amount: string;
  withholdingAmount?: string;
  withholdings?: Withholding[];
};
type Statement = {
  totalPending: string;
  totalWithholding?: string;
  documents: BillingDoc[];
  payments: Payment[];
};
type Order = { id: string; number?: string; version: number; status: string; result?: string };
type Session = { token: string; userId: string };
type FieldKit = { tech: Session; routerSerial: string };

let api: APIRequestContext | undefined;
let platformToken: string | undefined;
let tenantId: string | undefined;
let schemaName: string | undefined;
let adminToken = '';
let tenantAdminPassword = '';
let legalTextId = '';
let cycleDay = 1;
let periodStart = '';
let siteId = '';
let coordinator: Session = { token: '', userId: '' };
const catalog = {
  residentialPlanId: '',
  residentialPlanName: '',
  businessPlanId: '',
  businessPlanName: '',
};
const stock = {
  warehouseId: '',
  supplierPartyRefId: '',
  cableItemId: '',
  connectorItemId: '',
  routerItemId: '',
};
const profileIdByName = new Map<string, string>();

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
  options: { headers?: Record<string, string>; data?: unknown } = {},
): Promise<T> {
  const response = await api!.fetch(`${API_PREFIX}${path}`, { method, ...options });
  const body = (await response.json().catch(() => ({}))) as Dict;
  const expected = Array.isArray(status) ? status : [status];
  expect(
    expected,
    `API ${method} ${path}: HTTP ${response.status()} (${String(body.code ?? body.message ?? 'sin detalle')})`,
  ).toContain(response.status());
  return unwrap<T>(body);
}

/** Lectura de auditoría y registros internos por SQL (la API no los expone). */
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

/** Dígito de verificación DIAN del NIT (pesos primos sobre los dígitos de derecha a izquierda). */
function nitVerificationDigit(nit: string): string {
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const sum = [...nit]
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * weights[index]!, 0);
  const remainder = sum % 11;
  return String(remainder > 1 ? 11 - remainder : remainder);
}

function syntheticNit(): string {
  return `9${String(Number.parseInt(RUN_ID.slice(0, 8), 16) % 100_000_000).padStart(8, '0')}`;
}

function money(value: number): string {
  return value.toFixed(2);
}

// ── Tenant, usuarios y catálogo ─────────────────────────────────────────────

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
      name: `Tenant sintético primer cobro ${RUN_ID}`,
      slug: TENANT_SLUG,
      contactEmail: `qa-pc-${RUN_ID}@example.invalid`,
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

  // RS-13: sin identidad fiscal del emisor no se emite; el contrato también la exige.
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

async function loadProfiles(): Promise<void> {
  const profiles = asList<{ id: string; name: string }>(
    await expectJson<unknown>('/access-control/profiles', 'GET', 200, {
      headers: tenantHeaders(),
    }),
  );
  for (const profile of profiles) profileIdByName.set(profile.name, profile.id);
}

/** Usuario operativo activo con su perfil estándar; devuelve su sesión. */
async function createOperationalUser(
  role: 'NOC' | 'TECHNICIAN',
  tag: string,
): Promise<Session & { email: string }> {
  const headers = tenantHeaders();
  const email = `srqa-pc-${tag}-${RUN_ID}@example.invalid`;
  const password = `Qa9!${tag}-${RUN_ID}`;
  const user = await expectJson<{ id: string }>('/users', 'POST', 201, {
    headers: withKey(headers),
    data: {
      email,
      role,
      password,
      firstName: role === 'NOC' ? 'Coordinador' : 'Técnico',
      lastName: `E2E ${tag}`,
    },
  });
  await expectJson(`/users/${user.id}`, 'PATCH', 200, {
    headers: withKey(headers),
    data: { status: 'ACTIVE' },
  });
  const profileName = role === 'NOC' ? 'Acceso estándar NOC' : 'Acceso estándar Técnico';
  const profileId = profileIdByName.get(profileName);
  if (!profileId) throw new Error(`Falta el perfil ${profileName}.`);
  await expectJson(`/access-control/users/${user.id}/profiles`, 'PUT', [200, 201], {
    headers,
    data: { profileIds: [profileId] },
  });
  const session = await expectJson<{ accessToken: string }>('/auth/login', 'POST', 200, {
    headers: { 'X-Tenant-Slug': TENANT_SLUG },
    data: { email, password },
  });
  return { token: session.accessToken, userId: user.id, email };
}

/** Sede operativa con el coordinador NOC como supervisor de campo (alcance de despacho). */
async function seedSiteAndCoordinator(): Promise<void> {
  const headers = tenantHeaders();
  coordinator = await createOperationalUser('NOC', 'coord');
  const site = await expectJson<{ id: string }>('/organization/sites', 'POST', 201, {
    headers,
    data: {
      name: `Base técnica QA ${RUN_ID}`,
      code: `QA-PC-${RUN_ID.toUpperCase()}`,
      siteType: 'TECH_BASE',
      address: 'Dirección sintética de laboratorio',
      municipality: 'Bogotá',
      department: 'Cundinamarca',
      country: 'CO',
      latitude: 4.711,
      longitude: -74.0721,
      contactName: 'Coordinación QA',
      contactPhone: '3000000000',
      isPrimary: true,
      isActive: true,
      capabilities: ['TECH_DISPATCH'],
    },
  });
  siteId = site.id;
  await expectJson(`/organization/sites/${siteId}/assignments`, 'PUT', 200, {
    headers,
    data: { assignments: [{ userId: coordinator.userId, assignmentType: 'SUPERVISOR' }] },
  });
  await expectJson(`/organization/sites/${siteId}/responsibilities`, 'PUT', 200, {
    headers,
    data: {
      responsibilities: [{ userId: coordinator.userId, responsibility: 'FIELD_OPERATIONS' }],
    },
  });
  await expectJson('/organization/business-hours/company', 'PUT', [200, 201], {
    headers,
    data: {
      businessHours: [
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
        'SUNDAY',
      ].map((weekday) => ({ weekday, isOpen: true, opensAt: '00:00', closesAt: '23:59' })),
    },
  });
}

/** Autorización, plantilla de contrato aprobada y datos del operador (ADR-109). */
async function seedLegalAndOperator(): Promise<void> {
  const headers = tenantHeaders();
  legalTextId = (
    await expectJson<{ id: string }>('/privacy/legal-texts', 'POST', 201, {
      headers,
      data: {
        type: 'AUTORIZACION',
        version: `qa-pc-${RUN_ID}`,
        content: 'Texto de autorización sintético para la prueba E2E del primer cobro completo.',
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
      version: `qa-pc-${RUN_ID}`,
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
  // CA-1/CA-2: instalación de 50.000 con IVA 19 % (la línea INSTALACION del primer cobro).
  const residential = await expectJson<{ id: string; name: string }>(
    '/commercial/catalog/plans',
    'POST',
    201,
    {
      headers,
      data: {
        name: `Plan QA instalación ${RUN_ID}`,
        vatConcept: 'INTERNET_ACCESS',
        technology: 'FIBER',
        downloadSpeedMbps: 100,
        uploadSpeedMbps: 20,
        installationRule: 'ALWAYS',
      },
    },
  );
  await expectJson(`/commercial/catalog/${residential.id}/prices`, 'POST', 201, {
    headers,
    data: { customerSegment: 'RESIDENTIAL', basePrice: '55000.00', installationFee: '50000.00' },
  });
  catalog.residentialPlanId = residential.id;
  catalog.residentialPlanName = residential.name;

  // CA-4: plan empresarial de 1.000.000 sin instalación.
  const business = await expectJson<{ id: string; name: string }>(
    '/commercial/catalog/plans',
    'POST',
    201,
    {
      headers,
      data: {
        name: `Plan QA empresa ${RUN_ID}`,
        vatConcept: 'INTERNET_ACCESS',
        technology: 'FIBER',
        downloadSpeedMbps: 500,
        uploadSpeedMbps: 500,
        installationRule: 'ALWAYS',
      },
    },
  );
  await expectJson(`/commercial/catalog/${business.id}/prices`, 'POST', 201, {
    headers,
    data: { customerSegment: 'PYME', basePrice: '1000000.00', installationFee: '0' },
  });
  catalog.businessPlanId = business.id;
  catalog.businessPlanName = business.name;
}

/** Bodega, proveedor y artículos: cable por metro, conectores y router serializado. */
async function seedInventory(): Promise<void> {
  const headers = tenantHeaders();
  stock.warehouseId = (
    await expectJson<{ id: string }>('/inventory/locations', 'POST', 201, {
      headers,
      data: { name: `Bodega QA ${RUN_ID}`, type: 'MAIN_WAREHOUSE' },
    })
  ).id;
  const nit = `8${RUN_ID.replace(/\D/gu, '').padEnd(8, '0').slice(0, 8)}`;
  stock.supplierPartyRefId = (
    await expectJson<{ partyRefId: string }>('/purchasing/suppliers', 'POST', 201, {
      headers,
      data: {
        partyType: 'ORGANIZATION',
        documentType: 'NIT',
        documentNumber: nit,
        displayName: `Proveedor QA ${RUN_ID}`,
        currency: 'COP',
      },
    })
  ).partyRefId;
  expect(stock.supplierPartyRefId).toMatch(/^[0-9a-f-]{36}$/iu);

  // El tenant desechable nace sin categorías de inventario: el artículo exige una existente y
  // activa (`categoryId`, o `category` resuelto por código), así que se crean aquí.
  const category = async (code: string, codePrefix: string, name: string) =>
    (
      await expectJson<{ id: string }>('/inventory/categories', 'POST', 201, {
        headers,
        data: { code, codePrefix, name },
      })
    ).id;
  const materialsCategoryId = await category('MATERIALS', 'MAT', 'Materiales de instalación');
  const cpeCategoryId = await category('CPE', 'CPE', 'Equipos del cliente');

  const item = async (data: Dict) =>
    (await expectJson<{ id: string }>('/inventory/items', 'POST', 201, { headers, data })).id;
  stock.cableItemId = await item({
    sku: `QA-CAB-${RUN_ID}`,
    name: `Cable drop QA ${RUN_ID}`,
    categoryId: materialsCategoryId,
    itemKind: 'CONSUMABLE',
    trackingMode: 'CONSUMABLE',
    unitOfMeasure: 'METER',
  });
  stock.connectorItemId = await item({
    sku: `QA-CON-${RUN_ID}`,
    name: `Conector QA ${RUN_ID}`,
    categoryId: materialsCategoryId,
    itemKind: 'CONSUMABLE',
    trackingMode: 'CONSUMABLE',
    unitOfMeasure: 'UNIT',
  });
  stock.routerItemId = await item({
    sku: `QA-RTR-${RUN_ID}`,
    name: `Router QA ${RUN_ID}`,
    categoryId: cpeCategoryId,
    itemKind: 'SERIALIZED',
    trackingMode: 'SERIALIZED',
    unitOfMeasure: 'UNIT',
  });
}

// ── Técnico con custodia y OT de instalación (MOD11 ↔ MOD12) ────────────────

/** Técnico nuevo con bodega móvil y el material de una instalación en su custodia. */
async function prepareFieldKit(tag: string): Promise<FieldKit> {
  const headers = tenantHeaders();
  const tech = await createOperationalUser('TECHNICIAN', `tec-${tag}`);
  const mobileLocationId = (
    await expectJson<{ id: string }>('/inventory/locations', 'POST', 201, {
      headers,
      data: {
        name: `Custodia QA ${tag} ${RUN_ID}`,
        type: 'MOBILE_TECHNICIAN',
        responsibleRefId: tech.userId,
      },
    })
  ).id;
  const routerSerial = `QA-PC-${tag.toUpperCase()}-${RUN_ID}`;
  const purchase = await expectJson<{
    lines?: Array<{ itemId?: string; lotId?: string | null; serializedAssetId?: string | null }>;
  }>('/inventory/counter-purchases', 'POST', 201, {
    headers,
    data: {
      partyRefId: stock.supplierPartyRefId,
      invoiceNumber: `QA-PC-${tag}-${RUN_ID}`,
      destinationLocationId: stock.warehouseId,
      idempotencyKey: `qa-pc-purchase-${randomUUID()}`,
      lines: [
        { itemId: stock.cableItemId, quantityReceived: CABLE_METERS, unitCost: COST.cablePerMeter },
        { itemId: stock.connectorItemId, quantityReceived: CONNECTORS, unitCost: COST.connector },
        {
          itemId: stock.routerItemId,
          quantityReceived: 1,
          unitCost: COST.router,
          serialNumbers: [routerSerial],
          condition: 'NEW',
        },
      ],
    },
  });
  const purchased = (itemId: string) => purchase.lines?.find((line) => line.itemId === itemId);
  const routerLine = purchased(stock.routerItemId);
  expect(routerLine?.serializedAssetId, 'Router serializado recibido').toMatch(/^[0-9a-f-]{36}$/iu);

  const transfer = (data: Dict) =>
    expectJson('/inventory/transfers', 'POST', [200, 201], {
      headers,
      data: {
        sourceLocationId: stock.warehouseId,
        destinationLocationId: mobileLocationId,
        condition: 'NEW',
        handoffReference: `QA-PC-${tag}-${RUN_ID}`,
        idempotencyKey: `qa-pc-transfer-${randomUUID()}`,
        ...data,
      },
    });
  for (const [itemId, quantity] of [
    [stock.cableItemId, CABLE_METERS],
    [stock.connectorItemId, CONNECTORS],
  ] as const) {
    const lotId = purchased(itemId)?.lotId;
    await transfer({ itemId, quantity, ...(lotId ? { lotId } : {}) });
  }
  await transfer({
    itemId: stock.routerItemId,
    quantity: 1,
    serializedAssetId: routerLine!.serializedAssetId,
    serialNumber: routerSerial,
    ...(routerLine?.lotId ? { lotId: routerLine.lotId } : {}),
  });
  return { tech, routerSerial };
}

async function getOrder(id: string, token: string): Promise<Order> {
  return expectJson<Order>(`/tasks/execution-orders/${id}`, 'GET', 200, {
    headers: tenantHeaders(token),
  });
}

/** Comando de OT con versión optimista e idempotencia. */
async function orderCommand<T>(
  id: string,
  token: string,
  path: string,
  data: unknown,
  status: number | number[] = 200,
): Promise<T> {
  const current = await getOrder(id, token);
  return expectJson<T>(`/tasks/execution-orders/${id}${path}`, 'POST', status, {
    headers: {
      ...withKey(tenantHeaders(token), `qa-pc-${randomUUID()}`),
      'If-Match': String(current.version),
    },
    data,
  });
}

/** Carga y registra una evidencia (el análisis del medio corre en el worker). */
async function registerEvidence(
  orderId: string,
  tech: Session,
  evidenceType: 'PHOTO' | 'SIGNATURE',
  requirementKey: string,
): Promise<{ id: string; mediaAssetId: string }> {
  const requestId = randomUUID();
  const boundary = `----iwanaPrimerCobro${requestId.replace(/-/gu, '')}`;
  const crlf = '\r\n';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="e-${requestId}.jpg"${crlf}Content-Type: image/jpeg${crlf}${crlf}`,
    ),
    JPG,
    Buffer.from(`${crlf}--${boundary}--${crlf}`),
  ]);
  const before = await getOrder(orderId, tech.token);
  const upload = await api!.fetch(
    `${API_PREFIX}/tasks/execution-orders/${orderId}/evidence-assets`,
    {
      method: 'POST',
      headers: {
        ...tenantHeaders(tech.token),
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'If-Match': String(before.version),
        'Idempotency-Key': `qa-pc-upload-${requestId}`,
      },
      data: body,
    },
  );
  expect(upload.status(), 'Carga de evidencia').toBe(202);
  const mediaAssetId = unwrap<{ mediaAssetId: string }>(await upload.json()).mediaAssetId;
  // El análisis corre en el worker; las rutas de evidencia tienen cuota de 10 por minuto.
  await new Promise((done) => setTimeout(done, 10_000));
  return orderCommand<{ id: string; mediaAssetId: string }>(
    orderId,
    tech.token,
    '/evidence',
    {
      mediaAssetId,
      evidenceType,
      requirementKey,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      capturedAt: new Date().toISOString(),
    },
    [200, 201],
  );
}

/**
 * OT de instalación del titular lista para cerrar: despachada por el coordinador, iniciada por el
 * técnico, con 60 m de cable, 4 conectores y el router registrados (MOD12 confirma), el contrato
 * generado en la OT (vínculo OT ↔ contrato) y las evidencias del acta.
 */
async function prepareInstallationOrder(input: {
  subscriberId: string;
  contractId: string;
  kit: FieldKit;
  tag: string;
}): Promise<{ orderId: string; signatureMediaId: string }> {
  const { tech, routerSerial } = input.kit;
  const dispatched = await expectJson<Order>(
    '/tasks/execution-orders/dispatch',
    'POST',
    [200, 201],
    {
      headers: withKey(tenantHeaders(coordinator.token), `qa-pc-dispatch-${randomUUID()}`),
      data: {
        originContext: 'MANUAL',
        workType: 'INSTALLATION',
        organizationSiteId: siteId,
        customerDisplayLabel: `Titular QA ${input.tag}`,
        serviceAddress: `Dirección sintética ${RUN_ID}`,
        municipality: 'Bogotá',
        sector: 'Sector de pruebas',
        workSummary: `Instalación sintética primer cobro ${input.tag} ${RUN_ID}`,
        subscriberId: input.subscriberId,
      },
    },
  );
  const orderId = dispatched.id;
  await orderCommand(orderId, coordinator.token, '/assign', {
    assigneeType: 'TECHNICIAN',
    assigneeId: tech.userId,
  });
  const started = await orderCommand<Order>(orderId, tech.token, '/start', {});
  expect(started.status).toBe('IN_PROGRESS');

  // R1: consumo desde la custodia del técnico (MOD11 → outbox → MOD12).
  const usages = [
    { itemId: stock.cableItemId, quantity: CABLE_METERS },
    { itemId: stock.connectorItemId, quantity: CONNECTORS },
    {
      itemId: stock.routerItemId,
      quantity: 1,
      serialNumber: routerSerial,
      requirementKey: 'installed-equipment',
    },
  ];
  for (const usage of usages) {
    await orderCommand(
      orderId,
      tech.token,
      '/item-usage',
      {
        ...usage,
        technicianCustodyId: tech.userId,
        action: 'INSTALL',
        finalDisposition: 'INSTALLED_AT_CUSTOMER',
      },
      202,
    );
  }
  await expect
    .poll(
      async () =>
        asList<{ itemId: string; movementStatus: string; rejectionReasonCode?: string | null }>(
          await expectJson<unknown>(
            `/tasks/execution-orders/${orderId}/item-usage?limit=100`,
            'GET',
            200,
            { headers: tenantHeaders(tech.token) },
          ),
        )
          .map(
            (u) => `${u.movementStatus}${u.rejectionReasonCode ? `:${u.rejectionReasonCode}` : ''}`,
          )
          .sort(),
      { timeout: 90_000, intervals: [500, 1_000, 2_000], message: 'MOD12 no confirmó el consumo.' },
    )
    .toEqual(['CONFIRMED', 'CONFIRMED', 'CONFIRMED']);

  // Vínculo OT ↔ contrato: la generación del contrato en la consola de la OT (ADR-109 D5).
  await expectJson(`/crm/contracts/${input.contractId}/document-generations`, 'POST', 202, {
    headers: tenantHeaders(tech.token),
    data: { executionOrderId: orderId },
  });
  await expect
    .poll(
      async () =>
        (
          await expectJson<{ status: string } | null>(
            `/crm/contracts/${input.contractId}/document-generations/latest?executionOrderId=${orderId}`,
            'GET',
            200,
            { headers: tenantHeaders(tech.token) },
          )
        )?.status ?? null,
      { timeout: 120_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe('READY');

  await registerEvidence(orderId, tech, 'PHOTO', 'service-test');
  await registerEvidence(orderId, tech, 'PHOTO', 'work-photo');
  const signature = await registerEvidence(orderId, tech, 'SIGNATURE', 'CUSTOMER_SIGNATURE');
  return { orderId, signatureMediaId: signature.mediaAssetId };
}

async function closeInstallationOrder(
  orderId: string,
  tech: Session,
  signatureMediaId: string,
): Promise<Order> {
  await orderCommand(orderId, tech.token, '/close', {
    result: 'EXECUTED',
    summary: 'Instalación sintética completada con cable, conectores y router en comodato.',
    customerAcceptance: { artifactId: signatureMediaId, method: 'SIGNATURE' },
  });
  // El coordinador supervisa la sede: lee la OT también después del cierre.
  const closed = await getOrder(orderId, coordinator.token);
  expect(closed.status).toBe('COMPLETED');
  expect(closed.result).toBe('EXECUTED');
  return closed;
}

// ── Titulares, contratos y cobros ───────────────────────────────────────────

type ContractSeed = { subscriberId: string; contractId: string };

async function seedResidentialContract(tag: string): Promise<ContractSeed> {
  const headers = tenantHeaders();
  const subscriber = await expectJson<{ id: string }>('/crm/subscribers', 'POST', 201, {
    headers,
    data: {
      personType: 'NATURAL',
      customerSegment: 'RESIDENTIAL',
      documentType: 'CC',
      documentNumber: `${tag}-${RUN_ID}`,
      firstName: `Titular ${tag}`,
      lastName: `Sintético ${RUN_ID}`,
      stratum: 4,
      email: `qa-${tag}-${RUN_ID}@example.invalid`,
      address: `Dirección sintética ${RUN_ID}`,
      city: 'Bogotá',
      department: 'Cundinamarca',
      vatResponsibility: 'NO_RESPONSABLE',
      rutResponsibilities: [],
      authorizationChannel: 'PRESENCIAL',
      authorizations: [{ purpose: 'TRATAMIENTO_CONTRACTUAL', granted: true, legalTextId }],
    },
  });
  const contract = await expectJson<{ id: string }>(
    `/crm/subscribers/${subscriber.id}/contracts`,
    'POST',
    201,
    {
      headers,
      data: {
        subscriberId: subscriber.id,
        planId: catalog.residentialPlanId,
        planSnapshotJson: {
          id: catalog.residentialPlanId,
          name: catalog.residentialPlanName,
          monthlyPrice: '55000.00',
        },
        alias: `Servicio QA ${tag} ${RUN_ID}`,
        installationAddress: `Dirección sintética ${RUN_ID}`,
        installationCity: 'Bogotá',
        installationDepartment: 'Cundinamarca',
        customerSegment: 'RESIDENTIAL',
        serviceUsage: 'NON_RESIDENTIAL',
        fiscalName: `Titular ${tag} Sintético`,
        fiscalDocument: `${tag}-${RUN_ID}`,
        fiscalAddress: `Dirección sintética ${RUN_ID}`,
        startDate: periodStart,
      },
    },
  );
  return { subscriberId: subscriber.id, contractId: contract.id };
}

/**
 * Persona jurídica con contrato empresarial de 1.000.000. Decisión D3 (spec MOD14 2026-11-13):
 * solo O-23 en `rutResponsibilities` la habilita para retener.
 */
async function seedBusinessContract(
  tag: string,
  rutResponsibilities: string[],
): Promise<ContractSeed> {
  const headers = tenantHeaders();
  const nit = syntheticNit();
  const subscriber = await expectJson<{ id: string }>('/crm/subscribers', 'POST', 201, {
    headers,
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
      email: `qa-${tag}-${RUN_ID}@example.invalid`,
      address: `Dirección sintética ${RUN_ID}`,
      city: 'Bogotá',
      department: 'Cundinamarca',
      vatResponsibility: 'RESPONSABLE',
      rutResponsibilities,
      authorizationChannel: 'PRESENCIAL',
      authorizations: [{ purpose: 'TRATAMIENTO_CONTRACTUAL', granted: true, legalTextId }],
    },
  });
  const contract = await expectJson<{ id: string }>(
    `/crm/subscribers/${subscriber.id}/contracts`,
    'POST',
    201,
    {
      headers,
      data: {
        subscriberId: subscriber.id,
        planId: catalog.businessPlanId,
        planSnapshotJson: {
          id: catalog.businessPlanId,
          name: catalog.businessPlanName,
          monthlyPrice: '1000000.00',
        },
        alias: `Servicio QA ${tag} ${RUN_ID}`,
        installationAddress: `Dirección sintética ${RUN_ID}`,
        installationCity: 'Bogotá',
        installationDepartment: 'Cundinamarca',
        customerSegment: 'PYME',
        serviceUsage: 'NON_RESIDENTIAL',
        fiscalName: `Empresa QA ${tag} ${RUN_ID} S.A.S.`,
        fiscalDocument: `${nit}-${nitVerificationDigit(nit)}`,
        fiscalAddress: `Dirección sintética ${RUN_ID}`,
        startDate: periodStart,
      },
    },
  );
  return { subscriberId: subscriber.id, contractId: contract.id };
}

/** Activación: genera el primer cobro (ADR-109 D6). */
async function activateAndGetFirstDocument(seed: ContractSeed): Promise<BillingDoc> {
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
  return getDocument(documents[0]!.id);
}

function getDocument(id: string): Promise<BillingDoc> {
  return expectJson<BillingDoc>(`/billing/documents/${id}`, 'GET', 200, {
    headers: tenantHeaders(),
  });
}

async function issueDocument(id: string): Promise<BillingDoc> {
  // Un borrador bloqueado (SIN_PRECIO, SIN_TRATAMIENTO_IVA, SIN_DATOS_FISCALES) no se emite: se
  // nombra el motivo en lugar del 422 genérico.
  expect(
    (await getDocument(id)).blockingReason ?? null,
    'Motivo de bloqueo del borrador',
  ).toBeNull();
  await expectJson('/billing/documents/issue', 'POST', 200, {
    headers: withKey(tenantHeaders()),
    data: { documentIds: [id] },
  });
  const issued = await getDocument(id);
  expect(issued.status).toBe('EMITIDO');
  expect(issued.number).toBeTruthy();
  return issued;
}

async function waitForBreakdown(documentId: string): Promise<BillingDoc> {
  await expect
    .poll(async () => Boolean((await getDocument(documentId)).installationBreakdown), {
      timeout: 120_000,
      intervals: [1_000, 2_000, 5_000],
      message: 'El cierre de la OT no llegó al documento (relay → cola de Billing → registro).',
    })
    .toBe(true);
  return getDocument(documentId);
}

function statement(subscriberId: string): Promise<Statement> {
  return expectJson<Statement>(`/billing/subscribers/${subscriberId}/statement`, 'GET', 200, {
    headers: tenantHeaders(),
  });
}

/** Totales fiscales y líneas: lo que el desglose nunca debe tocar (R3, riesgo R1 del plan). */
function fiscalSnapshot(document: BillingDoc) {
  return {
    subtotal: document.subtotal,
    taxTotal: document.taxTotal,
    total: document.total,
    pendingAmount: document.pendingAmount,
    lines: (document.lines ?? [])
      .map((line) => `${line.kind}|${line.description}|${line.total}`)
      .sort(),
  };
}

/** CA-1 / CA-3: materiales a costo promedio y router en comodato con su serial. */
function expectRealInstallationValue(
  breakdown: Breakdown | null | undefined,
  orderNumber: string,
  routerSerial: string,
): void {
  expect(breakdown, 'Desglose del valor real ausente').toBeTruthy();
  expect(breakdown!.executionOrders.map((order) => order.executionOrderNumber)).toEqual([
    orderNumber,
  ]);
  const byDescription = (prefix: string) => {
    const found = breakdown!.items.find((item) => item.description.startsWith(prefix));
    if (!found) {
      throw new Error(
        `Ítem «${prefix}» ausente: ${JSON.stringify(breakdown!.items.map((i) => i.description))}`,
      );
    }
    return found;
  };
  const cable = byDescription('Cable drop QA');
  expect(Number(cable.quantity)).toBe(CABLE_METERS);
  expect(cable).toMatchObject({
    unitOfMeasure: 'METER',
    valueSource: 'COSTO_PROMEDIO',
    unitReferenceValue: money(COST.cablePerMeter),
    referenceValue: money(COST.cablePerMeter * CABLE_METERS),
    isLoan: false,
  });
  const connectors = byDescription('Conector QA');
  expect(Number(connectors.quantity)).toBe(CONNECTORS);
  expect(connectors).toMatchObject({
    valueSource: 'COSTO_PROMEDIO',
    referenceValue: money(COST.connector * CONNECTORS),
    isLoan: false,
  });
  const router = byDescription('Router QA');
  expect(Number(router.quantity)).toBe(1);
  expect(router).toMatchObject({
    isLoan: true,
    serialNumbers: [routerSerial],
    valueSource: 'COSTO_PROMEDIO',
    referenceValue: money(COST.router),
  });
  expect(breakdown!.items).toHaveLength(3);
  expect(breakdown!.realValue).toBe(
    money(COST.cablePerMeter * CABLE_METERS + COST.connector * CONNECTORS + COST.router),
  );
  // Valor cobrado = total con IVA de la línea INSTALACION (50.000 + 9.500).
  expect(breakdown!.chargedValue).toBe('59500.00');
  expect(breakdown!.itemsWithoutValue).toBe(0);
  expect(breakdown!.serialsProtected).toBe(false);
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

async function openDocumentDetail(page: Page, number: string): Promise<Locator> {
  await page.goto(DOCUMENTS_URL);
  await page
    .getByRole('row')
    .filter({ hasText: number })
    .getByRole('button', { name: 'Ver detalle' })
    .click();
  const section = page.getByRole('region', { name: BREAKDOWN_HEADING });
  await expect(section).toBeVisible({ timeout: 30_000 });
  return section;
}

async function expectNoSeriousAxeViolations(
  page: Page,
  scope: string,
  label: string,
): Promise<void> {
  const result = await new AxeBuilder({ page })
    .include(scope)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = result.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking, `axe ${label}: ${blocking.map((v) => v.id).join(', ')}`).toEqual([]);
}

/** Selector estable de una sección etiquetada por su encabezado (ids de `useId`). */
async function sectionSelector(page: Page, section: Locator): Promise<string> {
  const labelledBy = await section.getAttribute('aria-labelledby');
  expect(labelledBy).toBeTruthy();
  return page.evaluate((id) => `section[aria-labelledby="${CSS.escape(id)}"]`, labelledBy!);
}

async function openPaymentDialog(page: Page, billingTab: Locator): Promise<Locator> {
  await billingTab.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar pago' });
  await expect(dialog.getByRole('heading', { name: 'Retenciones' })).toBeVisible({
    timeout: 30_000,
  });
  return dialog;
}

async function fillWithholding(
  dialog: Locator,
  index: number,
  line: { taxCode: string; base: string; rate: string; certificate: string },
): Promise<Locator> {
  await dialog.getByRole('button', { name: 'Agregar retención' }).click();
  const group = dialog.getByRole('group', { name: `Retención ${index}` });
  await group.getByLabel('Tipo de retención').selectOption(line.taxCode);
  await group.getByLabel('Base (COP)').fill(line.base);
  await group.getByLabel('Tarifa (%)').fill(line.rate);
  await group.getByLabel('Número de certificado').fill(line.certificate);
  return group;
}

test.use({ trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off' });

test.describe('MOD14 Primer cobro completo — E2E vivo', () => {
  test.skip(
    missingLiveEnvironment.length > 0,
    `Entorno E2E real omitido; faltan variables: ${missingLiveEnvironment.join(', ')}.`,
  );
  test.setTimeout(600_000);

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    try {
      await createDisposableTenant();
      await chooseCycle();
      await loadProfiles();
      await seedSiteAndCoordinator();
      await seedLegalAndOperator();
      await seedCatalog();
      await seedInventory();
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

  test('CA-1 y CA-3: la OT de instalación cerrada aparece en el primer cobro como valor real, con el router en comodato y el total cobrado invariante', async ({
    page,
  }) => {
    const seed = await seedResidentialContract('ca1');
    const kit = await prepareFieldKit('ca1');
    const { orderId, signatureMediaId } = await prepareInstallationOrder({
      ...seed,
      kit,
      tag: 'ca1',
    });
    const closed = await closeInstallationOrder(orderId, kit.tech, signatureMediaId);
    expect(closed.number, 'Número de la OT').toBeTruthy();

    // R1/R2: al activar, el primer cobro trae la instalación y el consumo de la OT.
    const draft = await activateAndGetFirstDocument(seed);
    const withBreakdown = await waitForBreakdown(draft.id);
    expectRealInstallationValue(
      withBreakdown.installationBreakdown,
      closed.number!,
      kit.routerSerial,
    );

    // R3: el desglose es informativo; base, IVA y total son los de plan + instalación.
    expect(withBreakdown.lines?.map((l) => l.kind).sort()).toEqual(['INSTALACION', 'PLAN']);
    expect(withBreakdown).toMatchObject({
      subtotal: '105000.00',
      taxTotal: '19950.00',
      total: '124950.00',
      pendingAmount: '124950.00',
    });
    expect(fiscalSnapshot(withBreakdown)).toEqual(fiscalSnapshot(draft));

    // R4: el portal muestra la sección con el comodato y los valores real y cobrado.
    const issued = await issueDocument(draft.id);
    expect(fiscalSnapshot(issued).total).toBe('124950.00');
    await loginInPortal(page);
    const section = await openDocumentDetail(page, issued.number!);
    const routerRow = section.getByRole('row').filter({ hasText: `Router QA ${RUN_ID}` });
    await expect(routerRow.getByText('En comodato', { exact: true })).toBeVisible();
    await expect(routerRow).toContainText(kit.routerSerial);
    await expect(
      section.getByRole('row').filter({ hasText: `Cable drop QA ${RUN_ID}` }),
    ).toContainText('Costo promedio de inventario');
    // `formatBillingMoney` usa Intl es-CO: según los datos ICU del runtime sale «$ 262.000»
    // o «$ 262.000,00»; ambas formas son el mismo valor y ninguna admite otro dígito detrás.
    await expect(section).toContainText(/\$\s262\.000(?:,00)?(?![\d,])/u);
    await expect(section).toContainText(/\$\s59\.500(?:,00)?(?![\d,])/u);
    await expect(section).toContainText('No cambia el total de la factura.');
    await expectNoSeriousAxeViolations(
      page,
      await sectionSelector(page, section),
      'sección del valor real de la instalación',
    );
  });

  test('CA-2: la OT cerrada después de emitir el primer cobro agrega el desglose al documento emitido sin cambiar montos, una sola vez', async ({
    page,
  }) => {
    const seed = await seedResidentialContract('ca2');
    const kit = await prepareFieldKit('ca2');
    const { orderId, signatureMediaId } = await prepareInstallationOrder({
      ...seed,
      kit,
      tag: 'ca2',
    });

    // El primer cobro se genera y se emite con la OT aún abierta: sin desglose todavía.
    const draft = await activateAndGetFirstDocument(seed);
    expect(draft.installationBreakdown ?? null).toBeNull();
    const issued = await issueDocument(draft.id);
    const before = fiscalSnapshot(issued);

    const closed = await closeInstallationOrder(orderId, kit.tech, signatureMediaId);
    const after = await waitForBreakdown(issued.id);
    expectRealInstallationValue(after.installationBreakdown, closed.number!, kit.routerSerial);
    expect(after.status).toBe('EMITIDO');
    expect(after.number).toBe(issued.number);
    expect(fiscalSnapshot(after)).toEqual(before);

    // R5: idempotente por OT — un registro y una auditoría aunque el evento se reentregue.
    expect(
      tenantPsql(
        `SELECT COUNT(*)::int FROM billing_installation_breakdowns WHERE execution_order_id = '${orderId}';`,
      ),
    ).toBe('1');
    expect(
      tenantPsql(
        `SELECT COUNT(*)::int FROM audit_logs WHERE entity_type = 'BillingInstallationBreakdown' AND action = 'CREATE' AND new_value->>'executionOrderId' = '${orderId}';`,
      ),
    ).toBe('1');

    // R4: el PDF del documento emitido se sigue generando con el desglose.
    const pdf = await api!.fetch(`${API_PREFIX}/billing/documents/${issued.id}/pdf`, {
      headers: tenantHeaders(),
    });
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

    await loginInPortal(page);
    const section = await openDocumentDetail(page, issued.number!);
    await expect(section).toContainText(closed.number!);
    await expect(
      section
        .getByRole('row')
        .filter({ hasText: `Router QA ${RUN_ID}` })
        .getByText('En comodato', { exact: true }),
    ).toBeVisible();
  });

  test('CA-4 y CA-5: la empresa paga desde el diálogo con retefuente y reteICA, el documento queda saldado y anular el pago revierte las retenciones', async ({
    page,
  }) => {
    // R7: una persona natural sin responsabilidad de agente retenedor no puede retener.
    const natural = await seedResidentialContract('ca4n');
    const naturalOptions = await expectJson<{ eligible: boolean }>(
      `/billing/subscribers/${natural.subscriberId}/withholding-options`,
      'GET',
      200,
      { headers: tenantHeaders() },
    );
    expect(naturalOptions.eligible).toBe(false);

    // Decisión D3: ser persona jurídica u O-13 gran contribuyente ya no basta.
    const juridicaO13 = await seedBusinessContract('ca4j', ['O-13']);
    const juridicaO13Options = await expectJson<{ eligible: boolean; eligibility: string | null }>(
      `/billing/subscribers/${juridicaO13.subscriberId}/withholding-options`,
      'GET',
      200,
      { headers: tenantHeaders() },
    );
    expect(juridicaO13Options).toMatchObject({ eligible: false, eligibility: null });

    const seed = await seedBusinessContract('ca4', ['O-13', 'O-23']);
    const options = await expectJson<{
      eligible: boolean;
      eligibility: string | null;
      options: Array<{ taxCode: string }>;
    }>(`/billing/subscribers/${seed.subscriberId}/withholding-options`, 'GET', 200, {
      headers: tenantHeaders(),
    });
    expect(options).toMatchObject({ eligible: true, eligibility: 'AGENTE_RETENEDOR' });
    expect(options.options.map((option) => option.taxCode).sort()).toEqual([
      'RETE_FUENTE_SERVICIOS',
      'RETE_ICA',
    ]);

    const issued = await issueDocument((await activateAndGetFirstDocument(seed)).id);
    expect(issued).toMatchObject({
      subtotal: '1000000.00',
      taxTotal: '190000.00',
      total: '1190000.00',
      pendingAmount: '1190000.00',
    });
    // Base 1.000.000: retefuente 4 % = 40.000; reteICA 9,66 por mil = 9.660, ambas en pesos enteros
    // (ajuste al peso, decisión D4). Recibido = saldo − retenciones.
    const withholdingTotal = 40_000 + 9_660;
    const received = 1_190_000 - withholdingTotal;

    await loginInPortal(page);
    await page.goto(`/dashboard/crm/subscribers/${seed.subscriberId}?tab=facturacion`);
    const billingTab = page.getByRole('tabpanel', { name: 'Facturación' });
    await expect(
      billingTab.getByRole('button', { name: 'Registrar pago', exact: true }),
    ).toBeVisible({
      timeout: 30_000,
    });

    // a11y del diálogo con las retenciones desplegadas, en claro y oscuro (WCAG 2.2 AA).
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      const dialog = await openPaymentDialog(page, billingTab);
      await dialog.getByRole('button', { name: 'Agregar retención' }).click();
      await expect(dialog.getByRole('group', { name: 'Retención 1' })).toBeVisible();
      await expectNoSeriousAxeViolations(page, '[role="dialog"]', `diálogo de pago (${theme})`);
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(dialog).toBeHidden();
    }
    await page.emulateMedia({ colorScheme: 'light' });

    const dialog = await openPaymentDialog(page, billingTab);
    await expect(dialog).toContainText('El cliente es agente de retención según su RUT.');
    await dialog.getByLabel('Método de pago').selectOption('TRANSFERENCIA');
    await dialog.getByLabel('Referencia').fill(`QA-PC-${RUN_ID}`);
    const retefuente = await fillWithholding(dialog, 1, {
      taxCode: 'RETE_FUENTE_SERVICIOS',
      base: '1000000',
      rate: '4',
      certificate: `CERT-RF-${RUN_ID}`,
    });
    await expect(retefuente.getByLabel('Valor retenido (COP)')).toHaveValue('40000');
    const reteica = await fillWithholding(dialog, 2, {
      taxCode: 'RETE_ICA',
      base: '1000000',
      rate: '0.966',
      certificate: `CERT-ICA-${RUN_ID}`,
    });
    await expect(reteica.getByLabel('Valor retenido (COP)')).toHaveValue('9660');
    // R6: «Pagar el saldo completo» deja como recibido el saldo menos lo retenido.
    await dialog.getByRole('button', { name: 'Pagar el saldo completo' }).click();
    await expect(dialog.getByLabel('Monto del pago (COP)')).toHaveValue(
      new RegExp(`^${received}(\\.00)?$`, 'u'),
    );
    await expect(dialog.getByRole('status').filter({ hasText: 'Valor recibido' })).toContainText(
      /1\.190\.000,00/u,
    );
    await dialog.getByRole('button', { name: 'Registrar pago', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // CA-4: documento saldado con valor recibido + retenciones; estado de cuenta con retenciones.
    const settled = await getDocument(issued.id);
    expect(settled.pendingAmount).toBe('0.00');
    expect(settled.total).toBe(issued.total);
    const paid = await statement(seed.subscriberId);
    expect(paid.totalWithholding).toBe(money(withholdingTotal));
    expect(paid.documents.find((d) => d.id === issued.id)?.withholdingAmount).toBe(
      money(withholdingTotal),
    );
    expect(paid.payments).toHaveLength(1);
    const payment = paid.payments[0]!;
    expect(payment).toMatchObject({ status: 'REGISTRADO', amount: money(received) });
    expect(
      (payment.withholdings ?? [])
        .map((w) => [w.taxCode, w.base, w.rate, w.amount, w.documentId, w.voidedAt])
        .sort(),
    ).toEqual([
      ['RETE_FUENTE_SERVICIOS', '1000000.00', '4.0000', '40000.00', issued.id, null],
      ['RETE_ICA', '1000000.00', '0.9660', '9660.00', issued.id, null],
    ]);
    // R8: auditado sin el número de certificado (texto libre del titular).
    expect(
      tenantPsql(
        `SELECT new_value->>'withholdingAmount' FROM audit_logs WHERE entity_type = 'BillingPayment' AND action = 'CREATE' AND entity_id = '${payment.id}';`,
      ),
    ).toBe(money(withholdingTotal));
    expect(
      tenantPsql(
        `SELECT COUNT(*)::int FROM audit_logs WHERE entity_type = 'BillingPayment' AND entity_id = '${payment.id}' AND new_value::text LIKE '%CERT-%';`,
      ),
    ).toBe('0');

    // Spec MOD05↔MOD14 2026-11-13 R1: retenciones y «Pagos recibidos» viven en la subpestaña Pagos.
    await page.goto(`/dashboard/crm/subscribers/${seed.subscriberId}?tab=facturacion&sub=pagos`);
    const withholdingList = billingTab.getByRole('region', { name: 'Detalle de retenciones' });
    await expect(withholdingList).toBeVisible({ timeout: 30_000 });
    await expect(withholdingList).toContainText('Retención en la fuente por servicios');
    await expect(withholdingList).toContainText('Retención de ICA');
    await expect(withholdingList).toContainText(`Certificado CERT-RF-${RUN_ID}`);
    await expect(withholdingList.getByText('Aplicada', { exact: true })).toHaveCount(2);

    // CA-5: anular el pago desde «Pagos recibidos» anula las retenciones y reabre el saldo.
    await billingTab
      .getByRole('row')
      .filter({ hasText: `QA-PC-${RUN_ID}` })
      .getByRole('button', { name: 'Anular pago' })
      .click();
    const voidDialog = page.getByRole('dialog', { name: 'Anular pago' });
    await expect(voidDialog).toContainText('Sus retenciones también se anularán.');
    await voidDialog.getByLabel('Motivo de anulación').selectOption('ERROR_DE_REGISTRO');
    await voidDialog.getByRole('button', { name: 'Confirmar anulación' }).click();
    await expect(voidDialog).toBeHidden({ timeout: 30_000 });

    await expect
      .poll(async () => (await getDocument(issued.id)).pendingAmount, { timeout: 15_000 })
      .toBe('1190000.00');
    const voided = await statement(seed.subscriberId);
    expect(Number(voided.totalWithholding ?? '0')).toBe(0);
    const voidedPayment = voided.payments.find((p) => p.id === payment.id)!;
    expect(voidedPayment.status).toBe('ANULADO');
    expect(voidedPayment.withholdings).toHaveLength(2);
    expect(voidedPayment.withholdings!.every((w) => w.voidedAt !== null)).toBe(true);
    expect(
      tenantPsql(
        `SELECT new_value->>'voidedWithholdingCount' FROM audit_logs WHERE entity_type = 'BillingPayment' AND action = 'UPDATE' AND entity_id = '${payment.id}';`,
      ),
    ).toBe('2');

    await page.goto(`/dashboard/crm/subscribers/${seed.subscriberId}?tab=facturacion&sub=pagos`);
    const voidedList = billingTab.getByRole('region', { name: 'Detalle de retenciones' });
    await expect(voidedList.getByText('Anulada', { exact: true })).toHaveCount(2, {
      timeout: 30_000,
    });
    await expect(voidedList.getByText('Aplicada', { exact: true })).toHaveCount(0);
  });
});
