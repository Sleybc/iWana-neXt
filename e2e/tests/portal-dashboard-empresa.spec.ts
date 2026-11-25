/**
 * E2E — Dashboard empresarial del tenant autenticado (recomposición MOD02).
 *
 * Criterios Task 6 (D-1…D-7) + CA-V2 heredados:
 *   D-1  Axe claro/oscuro en estados loading/loaded/empty/error/updating/unavailable
 *   D-2  null honesto + contraste AA (axe + aserción de sustituto)
 *   D-3  Composición representativa ADMIN / NOC / SALES / TECHNICIAN
 *   D-4  Teclado móvil 375 px (drawer inert, foco, Escape)
 *   D-5  Primer viewport 375/768/1280 + capturas
 *   D-6  Selectores por rol/nombre accesible (sin cifras exactas)
 *   D-7  Firmas iWana (barra lima + sombra dual) en superficie del inicio
 *
 * Todos los endpoints HTTP se mockean con page.route() — no requiere API real.
 * Sin PII real — solo ficticios de prueba.
 *
 * Fase 2 «Pulso y atención» (HLD-MOD02 v3.0, contrato DS 2026-11-17-portal-graficas-ds-contrato):
 * N1 `GET /billing/dashboard/summary`, N2 `GET /crm/subscribers/dashboard/summary` y
 * N3 `GET /assurance/dashboard/series` simulados con sobre `{ data }` y fixtures validadas
 * contra el Zod congelado de `packages/shared`.
 *
 * Trazabilidad CA-PA (dirección 2026-11-16 §10) ↔ prueba:
 *   CA-PA-01  «CA-PA-01/02 · 1440×900: B0, B1 y B2 completos sin desplazar»
 *   CA-PA-02  ídem (≤ 5 celdas de pulso). «Áreas sin PortalDashboardMetric» → unitarias de B4 + audit-ui
 *   CA-PA-03  «ADMIN: tres series, área Facturación, lima y degradado donde toca» (cartera sin lima)
 *   CA-PA-04  ídem (degradado azul→lima solo dentro de la celda «Recaudo del mes»)
 *   CA-PA-05  «Fuente caída · N1/N2/N3 · 500/403», «las tres fuentes caídas: Tendencia no se monta»,
 *             «Soporte con N3 caído: Tendencia no se monta»
 *   CA-PA-06  «CA-V2-05 hidratación destino» (Fase 1; la Fase 2 no añade filas a la cola)
 *   CA-PA-07  «Tendencia montada · axe tema light/dark» (sin dona, radial ni mapa)
 *   CA-PA-08  «Contadora ve recaudo y cartera», «Ejecutivo comercial ve recaudo y cartera»,
 *             «Soporte no ve dinero», «Monitoreo no ve dinero» (CTO 2026-11-17, D4)
 *   CA-PA-09  No es E2E: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` (G6)
 *   DS §7     «Tendencia montada · axe», «conmutación de series por teclado», «tabla alternativa por teclado»
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BillingDashboardSummary } from '../../packages/shared/src/contracts/billing/billing-dashboard.contract';
import type { SubscribersDashboardSummary } from '../../packages/shared/src/contracts/crm/subscribers-dashboard.contract';
import type { AssuranceDashboardSeries } from '../../packages/shared/src/contracts/assurance/assurance-dashboard-series.contract';
import { mockEffectivePermissions } from './helpers/effective-permissions';
import { evidenceDir } from './helpers/evidence';
import { seedPortalSession } from './helpers/portal-session';

// Esquemas Zod congelados, leídos de la fuente del contrato (no del barril ni de `dist`):
// `@iwana/shared` no se resuelve en runtime desde e2e/ y `packages/shared` es CommonJS, así que
// un import ESM con nombre falla; `createRequire` lo carga con el transformador de Playwright.
const requireContract = createRequire(import.meta.url);
const { BillingDashboardSummarySchema } = requireContract(
  '../../packages/shared/src/contracts/billing/billing-dashboard.contract',
) as typeof import('../../packages/shared/src/contracts/billing/billing-dashboard.contract');
const { SubscribersDashboardSummarySchema } = requireContract(
  '../../packages/shared/src/contracts/crm/subscribers-dashboard.contract',
) as typeof import('../../packages/shared/src/contracts/crm/subscribers-dashboard.contract');
const { AssuranceDashboardSeriesSchema } = requireContract(
  '../../packages/shared/src/contracts/assurance/assurance-dashboard-series.contract',
) as typeof import('../../packages/shared/src/contracts/assurance/assurance-dashboard-series.contract');

const MOCK_TENANT_SLUG = 'isp-demo';
const EVIDENCE_DIR = evidenceDir('informes/evidencias/portal-dashboard-recomposicion');

type TenantRole = 'ADMIN' | 'NOC' | 'SALES' | 'TECHNICIAN' | 'SUPPORT' | 'ACCOUNTANT';

/** Respuesta simulada de una fuente N1–N3: datos del contrato, error del servidor o sin permiso. */
type DashboardSourceMode = 'ok' | 500 | 403;

const N1_PATH = '/billing/dashboard/summary';
const N2_PATH = '/crm/subscribers/dashboard/summary';
const N3_PATH = '/assurance/dashboard/series';

// ── Fixtures de la Fase 2: solo agregados ficticios, sin identificadores de persona ──────────
const DASHBOARD_AS_OF = '2026-11-17';
const DASHBOARD_MONTHS = [
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
  '2026-11',
] as const;
const DASHBOARD_DAYS = Array.from(
  { length: 14 },
  (_, index) => `2026-11-${String(4 + index).padStart(2, '0')}`,
);

const INVOICED_BY_MONTH = [158, 160, 161, 163, 165, 166, 168, 171, 173, 176, 179, 182.4] as const;
const COLLECTED_BY_MONTH = [140, 142, 139, 145, 147, 146, 150, 152, 151, 156, 160, 141.3] as const;

function millionsToMoney(millions: number): string {
  return (Math.round(millions * 1_000_000 * 100) / 100).toFixed(2);
}

const n1Fixture: BillingDashboardSummary = {
  asOf: DASHBOARD_AS_OF,
  invoicedAmount: '182400000.00',
  collectedAmount: '141300000.00',
  overdue: {
    amount: '23850000.00',
    documentCount: 37,
    subscriberCount: 29,
    buckets: [
      { bucket: '1_30', amount: '12400000.00', documentCount: 18 },
      { bucket: '31_60', amount: '6150000.00', documentCount: 10 },
      { bucket: '61_90', amount: '3100000.00', documentCount: 5 },
      { bucket: '90_plus', amount: '2200000.00', documentCount: 4 },
    ],
  },
  series: DASHBOARD_MONTHS.map((month, index) => ({
    month,
    invoicedAmount: millionsToMoney(INVOICED_BY_MONTH[index]!),
    collectedAmount: millionsToMoney(COLLECTED_BY_MONTH[index]!),
  })),
};

const ACTIVATIONS_BY_MONTH = [38, 42, 40, 45, 47, 44, 50, 52, 49, 55, 58, 61] as const;
const CANCELLATIONS_BY_MONTH = [20, 18, 22, 19, 21, 24, 20, 19, 23, 22, 21, 23] as const;

const n2Fixture: SubscribersDashboardSummary = {
  asOf: DASHBOARD_AS_OF,
  activations: 61,
  cancellations: 23,
  series: DASHBOARD_MONTHS.map((month, index) => ({
    month,
    activations: ACTIVATIONS_BY_MONTH[index]!,
    cancellations: CANCELLATIONS_BY_MONTH[index]!,
  })),
};

const CREATED_BY_DAY = [9, 12, 8, 11, 14, 10, 7, 13, 15, 9, 11, 12, 10, 8] as const;
const RESOLVED_BY_DAY = [8, 10, 9, 12, 11, 10, 8, 12, 13, 10, 9, 11, 12, 9] as const;

const n3Fixture: AssuranceDashboardSeries = {
  asOf: DASHBOARD_AS_OF,
  days: 14,
  series: DASHBOARD_DAYS.map((date, index) => ({
    date,
    created: CREATED_BY_DAY[index]!,
    resolved: RESOLVED_BY_DAY[index]!,
  })),
};

interface MockOptions {
  role?: TenantRole;
  /** N1 · resumen de facturación (defecto: datos del contrato). */
  n1?: DashboardSourceMode;
  /** N2 · altas y retiros (defecto: datos del contrato). */
  n2?: DashboardSourceMode;
  /** N3 · serie diaria de casos (defecto: datos del contrato). */
  n3?: DashboardSourceMode;
  /** Registra la ruta de cada petición a N1–N3 (CA-PA-08: quién pide qué). */
  seen?: string[];
  /** Retiene /wfm/dashboard/summary hasta liberar (loading / updating). */
  holdWfm?: { wait: () => Promise<void> };
  /** Fuerza error en el resumen WFM (bloque dominante ADMIN/NOC). */
  failWfm?: boolean;
  failAgenda?: boolean;
  /** todayCount null → dato no disponible. */
  nullVisits?: boolean;
  /** alerts vacíos + sin actividad. */
  emptyOperational?: boolean;
}

function buildAccessToken(role: TenantRole): string {
  return (
    'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
    btoa(
      JSON.stringify({
        sub: `user-uuid-${role.toLowerCase()}-test`,
        email: 'aabbccdd11223344',
        role,
        tenantId: 'tenant-uuid-test',
        schemaName: 'tenant_test_isp',
        jti: `jti-test-${role}`,
        type: 'tenant',
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ) +
    '.fakesig'
  );
}

const mockTenantSummary = {
  tenant: {
    id: 'tenant-uuid-test',
    name: 'ISP Prueba Colombia',
    slug: 'isp-demo',
    status: 'ACTIVE',
    contactEmail: 'contacto@test-isp.co',
    legalName: null,
    nit: null,
    city: 'Medellín',
    department: 'Antioquia',
    countryCode: 'CO',
    phone: null,
    website: null,
    createdAt: '2026-01-15T00:00:00.000Z',
  },
  settings: {
    timezone: 'America/Bogota',
    currency: 'COP',
    language: 'es-CO',
    country: 'CO',
    fiberInstallationThresholdMeters: 50,
    features: { billing: false, mfa_required_all: false },
  },
  metrics: {
    configuredUsers: 5,
    mfaCoverage: 1,
    pendingAlerts: 1,
    auditEventsLast7d: 23,
  },
  alerts: [
    {
      id: 'mfa-not-required',
      severity: 'warning',
      title: 'Verificación en dos pasos no obligatoria',
      description:
        'Se recomienda activar la verificación en dos pasos obligatoria para todos los usuarios de la empresa.',
      href: '/dashboard/settings',
    },
  ],
};

const mockTenantProfile = {
  id: 'tenant-uuid-test',
  name: 'ISP Prueba Colombia',
  slug: 'isp-demo',
  status: 'ACTIVE',
  contactEmail: 'contacto@test-isp.co',
  legalName: null,
  nit: null,
  city: 'Medellín',
  department: 'Antioquia',
  countryCode: 'CO',
  phone: null,
  website: null,
  createdAt: '2026-01-15T00:00:00.000Z',
  showTenantName: true,
  logoLightUrl: null,
  logoLightAssetId: null,
  logoDarkUrl: null,
  logoDarkAssetId: null,
  sealLightUrl: null,
  sealLightAssetId: null,
  sealDarkUrl: null,
  sealDarkAssetId: null,
  faviconLightUrl: null,
  faviconLightAssetId: null,
  faviconDarkUrl: null,
  faviconDarkAssetId: null,
  loginBackgroundLightUrl: null,
  loginBackgroundLightAssetId: null,
  loginBackgroundDarkUrl: null,
  loginBackgroundDarkAssetId: null,
  brandingProductName: null,
  brandingSurfaceName: null,
  brandingMetadataTitle: null,
  brandingMetadataDescription: null,
};

const mockPublicBranding = {
  displayName: 'ISP Prueba Colombia',
  showTenantName: true,
  logoLightUrl: null,
  logoDarkUrl: null,
  sealLightUrl: null,
  sealDarkUrl: null,
  faviconLightUrl: null,
  faviconDarkUrl: null,
  loginBackgroundLightUrl: null,
  loginBackgroundDarkUrl: null,
};

const mockSettingsSections = [
  {
    key: 'organization',
    label: 'Perfil empresarial y organización',
    description: 'Perfil empresarial, configuración operativa base y sedes.',
    ownerModule: 'MOD00 / Organización',
    status: 'AVAILABLE',
    route: '/dashboard/settings/organization',
    requiredPermissions: [],
  },
  {
    key: 'access',
    label: 'Usuarios y acceso',
    description: 'Perfiles y permisos.',
    ownerModule: 'MOD00 / Access control',
    status: 'AVAILABLE',
    route: '/dashboard/settings/access',
    requiredPermissions: [],
  },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function setupDashboardMocks(page: Page, options: MockOptions = {}) {
  const role = options.role ?? 'ADMIN';

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    if (method === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': request.headers()['origin'] ?? '*',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers':
            'Authorization, Content-Type, X-Tenant-Slug, X-Requested-With',
        },
      });
      return;
    }

    // Fase 2 · N1–N3 responden con el sobre `{ data }` habitual del API (HLD v3.0 §8).
    const dashboardSource: Array<[string, DashboardSourceMode | undefined, unknown]> = [
      [N1_PATH, options.n1, n1Fixture],
      [N2_PATH, options.n2, n2Fixture],
      [N3_PATH, options.n3, n3Fixture],
    ];
    const matchedSource = dashboardSource.find(([sourcePath]) => url.includes(sourcePath));
    if (matchedSource && method === 'GET') {
      const [sourcePath, mode = 'ok', body] = matchedSource;
      options.seen?.push(sourcePath);
      if (mode === 500) {
        await json(route, { code: 'E2E_FORCED', message: 'source down' }, 500);
      } else if (mode === 403) {
        await json(route, { code: 'FORBIDDEN', message: 'Forbidden resource' }, 403);
      } else {
        await json(route, { data: body });
      }
      return;
    }

    if (url.includes('/tenants/public-branding') && method === 'GET') {
      await json(route, { data: mockPublicBranding });
      return;
    }

    if (url.includes('/auth/login') && method === 'POST') {
      await json(route, { data: { accessToken: buildAccessToken(role) } });
      return;
    }

    if (url.includes('/auth/me') && method === 'GET') {
      await json(route, {
        data: {
          sub: `user-uuid-${role.toLowerCase()}-test`,
          email: 'aabbccdd11223344',
          role,
          tenantId: 'tenant-uuid-test',
          schemaName: 'tenant_test_isp',
          jti: `jti-test-${role}`,
          type: 'tenant',
        },
      });
      return;
    }

    if (url.match(/\/users\/[^/]+$/) && method === 'GET') {
      await json(route, {
        data: {
          id: `user-uuid-${role.toLowerCase()}-test`,
          email: 'ops@test-isp.co',
          role,
          status: 'ACTIVE',
          firstName: 'Ana',
          lastName: 'Prueba',
          phone: null,
          jobTitle: 'Operadora',
          avatarUrl: null,
          mfaEnabled: true,
          emailVerified: true,
          createdAt: '2026-01-15T00:00:00.000Z',
        },
      });
      return;
    }

    if (url.includes('/tenants/me/summary') && method === 'GET') {
      await json(route, { data: mockTenantSummary });
      return;
    }

    if (url.includes('/tenants/me/settings') && method === 'GET') {
      await json(route, {
        data: {
          timezone: 'America/Bogota',
          currency: 'COP',
          language: 'es-CO',
          country: 'CO',
          fiberInstallationThresholdMeters: 50,
          features: { billing: false, mfa_required_all: false },
        },
      });
      return;
    }

    if (url.includes('/tenants/me') && method === 'GET') {
      await json(route, { data: mockTenantProfile });
      return;
    }

    if (url.includes('/configuration/settings-sections') && method === 'GET') {
      await json(route, { data: mockSettingsSections });
      return;
    }

    if (url.includes('/wfm/dashboard/summary') && method === 'GET') {
      if (options.holdWfm) {
        await options.holdWfm.wait();
      }
      if (options.failWfm) {
        await json(route, { code: 'E2E_FORCED', message: 'wfm down' }, 500);
        return;
      }
      // returnFullResponse: true — el cliente espera el cuerpo plano tipado, no envelope.
      await json(route, {
        todayCount: options.nullVisits ? null : 3,
        overdueCount: 1,
        upcomingCount: 0,
        activeCount: 0,
        enRouteCount: 0,
        atRiskCount: 0,
        pendingInbox: {
          totalOpen: options.emptyOperational ? 0 : 2,
          readyToScheduleCount: options.nullVisits ? null : 2,
          needsContextCount: 0,
          overdueSlaCount: options.emptyOperational ? 0 : 1,
          highPriorityOpenCount: 0,
        },
        alerts: options.emptyOperational
          ? []
          : [
              {
                id: 'wfm-alert-1',
                type: 'OVERDUE',
                severity: 'warning',
                title: 'Visita en riesgo',
                description: 'Hay una visita con retraso operativo.',
                eventId: null,
                assignedUserId: null,
                scheduledStartAt: null,
              },
            ],
        technicianLoad: [],
      });
      return;
    }

    if (url.includes('/assurance/dashboard/summary') && method === 'GET') {
      await json(route, {
        openCount: 5,
        assignedCount: 1,
        inProgressCount: 1,
        atRiskCount: 2,
        breachedCount: 1,
        resolvedTodayCount: 0,
        fieldServicePendingCount: 0,
        byPriority: {},
        byType: {},
      });
      return;
    }

    if (url.includes('/commercial/dashboard/summary') && method === 'GET') {
      await json(route, {
        plansCount: 1,
        activePlansCount: 1,
        productsCount: 0,
        activeProductsCount: 0,
        servicesCount: 0,
        activeServicesCount: 0,
        bundlesCount: 0,
        activeBundlesCount: 0,
        promotionsCount: 0,
        activePromotionsCount: 0,
        compatibilityRulesCount: 0,
        activeCompatibilityRulesCount: 0,
        taxRulesCount: 0,
        activeTaxRulesCount: 0,
        offersExpiringSoonCount: 0,
        offersNearUseLimitCount: 0,
        offersAtRiskCount: 4,
        catalogActiveCount: 1,
        catalogSellableActiveCount: 1,
        catalogIncompleteActiveCount: 0,
        missingCurrentPriceCount: 2,
        activeBundlesWithInactiveItemsCount: 0,
        taxRulesCoverageGapCount: 0,
        rulesGapCount: 0,
        activeOffersCount: 0,
        attentionItems: [],
        recentChanges: [],
      });
      return;
    }

    if (url.includes('/inventory/dashboard') && method === 'GET') {
      await json(route, {
        itemsCount: 1,
        locationsCount: 1,
        serializedAssetsCount: 0,
        balancesCount: 1,
        totalOnHand: 10,
        estimatedTotalValue: 1000,
        balancesByLocation: [],
        balancesByCategory: [],
        serializedAssetsByStatus: [],
        serializedAssetsByResponsibleType: [],
      });
      return;
    }

    // Fuentes de la cola «Requiere tu atención» (dirección Pulso y atención): al día por defecto.
    if (url.includes('/crm/subscribers/queue-counts') && method === 'GET') {
      await json(route, {
        active: 120,
        suspended: 0,
        contactPending: 0,
        fiscalIncomplete: 0,
        withoutLiveServices: 0,
      });
      return;
    }

    if (url.includes('/crm/billing-cycles/cutoff-agenda') && method === 'GET') {
      await json(route, {
        date: '2026-11-16',
        items: [],
        meta: { nextCursor: null, total: 0, totalIsEstimate: false, page: 1, limit: 1 },
        withoutCycleCount: 0,
      });
      return;
    }

    if (url.includes('/network/provisioning/inbox') && method === 'GET') {
      await json(route, {
        data: [],
        meta: { nextCursor: null, total: 0, totalIsEstimate: false, page: 1, limit: 1 },
      });
      return;
    }

    if (url.includes('/inventory/replenishment/suggestions') && method === 'GET') {
      await json(route, []);
      return;
    }

    if (url.includes('/crm/pipeline/summary') && method === 'GET') {
      await json(route, {
        data: { NUEVO_POTENCIAL: 3, DESCARTADO: 1, CLIENTE_ACTIVO: 2 },
        total: 6,
      });
      return;
    }

    if (url.includes('/audit-logs') && method === 'GET') {
      await json(route, {
        data: options.emptyOperational
          ? []
          : [
              {
                id: 'audit-uuid-1',
                tenantId: 'tenant-uuid-test',
                userId: `user-uuid-${role.toLowerCase()}-test`,
                action: 'LOGIN',
                entityType: 'User',
                entityId: `user-uuid-${role.toLowerCase()}-test`,
                oldValue: null,
                newValue: null,
                ipAddress: null,
                userAgent: null,
                requestId: null,
                createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
              },
            ],
      });
      return;
    }

    if (url.includes('/auth/logout') && method === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    // Destinos CA-V2-05 — stubs mínimos para hidratar filtros sin API real.
    if (url.includes('/wfm/events') && method === 'GET') {
      if (options.failAgenda) {
        await json(route, { code: 'E2E_FORCED', message: 'source down' }, 500);
        return;
      }
      await json(route, {
        data: [],
        meta: {
          nextCursor: null,
          total: 0,
          totalIsEstimate: false,
          page: 1,
          limit: 100,
          totalPages: 0,
          hasMore: false,
          mode: 'page',
          capabilities: { randomAccess: true, sortableFields: [] },
          sort: null,
        },
      });
      return;
    }

    if (url.includes('/wfm/work-orders') && method === 'GET') {
      await json(route, {
        data: [],
        meta: {
          nextCursor: null,
          total: 0,
          page: 1,
          limit: 100,
          totalPages: 0,
          hasMore: false,
          mode: 'page',
          capabilities: { randomAccess: true, sortableFields: [] },
          sort: null,
        },
      });
      return;
    }

    if (url.includes('/wfm/visit-requests/filter-options') && method === 'GET') {
      await json(route, { municipalities: [], sectors: [] });
      return;
    }

    if (url.includes('/wfm/visit-requests') && method === 'GET') {
      await json(route, {
        items: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      });
      return;
    }

    if (url.includes('/wfm/eligible-assignees') && method === 'GET') {
      await json(route, []);
      return;
    }

    if (url.includes('/wfm/operating-window') && method === 'POST') {
      await json(route, {
        status: 'OPEN',
        source: 'COMPANY_HOURS',
        startTime: '07:00',
        endTime: '18:00',
        reason: null,
      });
      return;
    }

    if (url.includes('/assurance/tickets') && method === 'GET') {
      await json(route, {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        meta: {
          mode: 'page',
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasMore: false,
          capabilities: { randomAccess: true, sortableFields: [] },
        },
      });
      return;
    }

    if (url.includes('/assurance/sla-policies') && method === 'GET') {
      await json(route, []);
      return;
    }

    if (url.includes('/crm/expedientes') && method === 'GET') {
      await json(route, { data: [], total: 0 });
      return;
    }

    if (url.includes('/users') && method === 'GET') {
      await json(route, {
        data: [],
        meta: { nextCursor: null, total: 0 },
      });
      return;
    }

    await json(route, { code: 'E2E_UNMOCKED', message: url }, 404);
  });
}

async function setAuthSession(page: Page, role: TenantRole = 'ADMIN') {
  await seedPortalSession(page, {
    token: buildAccessToken(role),
    tenantSlug: MOCK_TENANT_SLUG,
  });
  const permissionsByRole: Record<TenantRole, string[]> = {
    ADMIN: [
      'settings.read',
      'users.read',
      'commercial.catalog.read',
      'assurance.tickets.read',
      'crm.expedientes.read',
      'crm.subscribers.read',
      'wfm.schedule.read',
      'operations.execution_orders.read',
      'operations.tasks.read',
      'inventory.stock.read',
      // Fase 2 · N1 exige ambos permisos de facturación (HLD v3.0 §8.5 cond. 1).
      'billing.invoices.read',
      'billing.payments.read',
    ],
    NOC: [
      'assurance.tickets.read',
      'wfm.schedule.read',
      'operations.execution_orders.read',
      'operations.tasks.read',
      'inventory.stock.read',
    ],
    SALES: [
      'commercial.catalog.read',
      'crm.expedientes.read',
      'crm.subscribers.read',
      // D4 (CTO 2026-11-17): N1 se amplía a SALES con los mismos dos permisos de facturación.
      'billing.invoices.read',
      'billing.payments.read',
    ],
    TECHNICIAN: ['wfm.schedule.read', 'operations.execution_orders.read', 'operations.tasks.read'],
    SUPPORT: ['assurance.tickets.read', 'wfm.schedule.read', 'crm.subscribers.read'],
    ACCOUNTANT: [
      'billing.invoices.read',
      'billing.payments.read',
      'crm.subscribers.read',
      'commercial.catalog.read',
    ],
  };
  await mockEffectivePermissions(page, {
    userId: `user-uuid-${role.toLowerCase()}-test`,
    role,
    effectivePermissions: permissionsByRole[role],
  });
}

async function gotoDashboard(page: Page) {
  await page.goto('/dashboard');
  // El nombre de la empresa sale del mismo lote que las demás fuentes (Promise.allSettled): con el
  // título y sin bloques ocupados, ya respondieron todas y el chunk de la gráfica está montado.
  await expectLoadedDashboard(page);
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
}

async function expectLoadedDashboard(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'ISP Prueba Colombia' })).toBeVisible({
    timeout: 15_000,
  });
}

async function runAxe(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

  // Residuales post-Task 6 cerrados por FE sobre contrato DS v1.1 (§1.7) + CTAs dark + sin opacity-80.
  const violations = result.violations;

  if (violations.length > 0) {
    console.log(
      `[AXE:${label}]`,
      violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
    );
  }
  expect(violations, `axe ${label}`).toEqual([]);
}

async function applyTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => {
    window.localStorage.setItem('iwana-theme', value);
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

async function expectThemeApplied(page: Page, theme: 'light' | 'dark') {
  if (theme === 'dark') {
    await expect(page.locator('html.dark')).toBeAttached({ timeout: 10_000 });
  } else {
    await expect(page.locator('html.dark')).toHaveCount(0);
  }
}

test.describe('Dashboard empresarial — baseline CA (selectores semánticos D-6)', () => {
  test('CA-06: el flujo login → dashboard lleva al panel empresarial', async ({ page }) => {
    await setupDashboardMocks(page, { role: 'ADMIN' });
    await page.goto('/auth/login');

    await page.getByPlaceholder('ejemplo: isp-demo').fill(MOCK_TENANT_SLUG);
    await page.getByLabel(/correo/i).fill('admin@test-isp.co');
    await page.getByRole('textbox', { name: /^contraseña/i }).fill('PasswordSegura123!');
    await page.getByRole('button', { name: /ingresar/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('CA-01: el dashboard no muestra contenido de suscriptor', async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthSession(page);
    await gotoDashboard(page);

    await expect(page.getByText(/plan hogar/i)).not.toBeVisible();
    await expect(page.getByText(/suscriptor iwana/i)).not.toBeVisible();
    await expect(page.getByText(/próxima factura/i)).not.toBeVisible();
    await expect(page.getByText(/velocidad de conexión/i)).not.toBeVisible();
  });

  test('CA-02: el portal no llama a /tenants/:id de plataforma', async ({ page }) => {
    const platformEndpointCalled: string[] = [];

    await setupDashboardMocks(page);
    // Después de los mocks generales: en Playwright gana la última ruta registrada.
    await page.route('**/api/v1/tenants/*', async (route) => {
      const url = route.request().url();
      if (!/\/tenants\/[0-9a-f-]{36}/.test(url)) {
        await route.fallback();
        return;
      }
      platformEndpointCalled.push(url);
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'E2E_UNMOCKED', message: url }),
      });
    });
    await setAuthSession(page);
    await gotoDashboard(page);
    // Ausencia de petición: ninguna aserción de pantalla equivale a una red en reposo.
    await page.waitForLoadState('networkidle');

    expect(platformEndpointCalled).toHaveLength(0);
  });

  test('CA-04: muestra empresa e indicadores por nombre accesible (no por cifra)', async ({
    page,
  }) => {
    await setupDashboardMocks(page);
    await setAuthSession(page);
    await gotoDashboard(page);
    await expectLoadedDashboard(page);

    await expect(page.getByLabel('Indicadores núcleo')).toBeVisible();
    await expect(page.getByRole('link', { name: /Visitas de hoy/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Casos abiertos/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Nueva oportunidad/i })).toHaveCount(0);
  });

  test('CA-03: navegación a configuración no produce 404 de documento', async ({
    page,
    baseURL,
  }) => {
    const notFoundPages: string[] = [];
    // Origen del portal según la config (3002 en la oficial); con un literal, otro puerto no comprobaba nada.
    expect(baseURL, 'baseURL de la config').toBeTruthy();
    const portalOrigin = new URL(baseURL!).origin;

    page.on('response', (response) => {
      const isDocumentRequest = response.request().resourceType() === 'document';
      const isPortalPage =
        new URL(response.url()).origin === portalOrigin && !response.url().includes('/api/');
      if (response.status() === 404 && isDocumentRequest && isPortalPage) {
        notFoundPages.push(response.url());
      }
    });

    await setupDashboardMocks(page);
    await setAuthSession(page);
    await gotoDashboard(page);
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    const portalPageNotFound = notFoundPages.filter(
      (u) => !u.includes('_next') && !u.includes('.ico') && !u.includes('favicon'),
    );
    expect(portalPageNotFound).toHaveLength(0);
  });

  test('CA-05: la actividad reciente se muestra al ADMIN', async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthSession(page);
    await gotoDashboard(page);

    await expect(page.getByRole('heading', { name: 'Actividad reciente' })).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('D-3 · Composición por roles representativos', () => {
  test('ADMIN: indicadores operativos + sin panel en preparación', async ({ page }) => {
    await setupDashboardMocks(page, { role: 'ADMIN' });
    await setAuthSession(page, 'ADMIN');
    await gotoDashboard(page);
    await expectLoadedDashboard(page);

    await expect(page.getByRole('link', { name: /Visitas de hoy/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Casos abiertos/i })).toBeVisible();
    await expect(page.getByText(/Panel en preparación/i)).toHaveCount(0);
  });

  test('NOC: indicadores de campo/mesa', async ({ page }) => {
    await setupDashboardMocks(page, { role: 'NOC' });
    await setAuthSession(page, 'NOC');
    await gotoDashboard(page);
    await expectLoadedDashboard(page);

    await expect(page.getByRole('link', { name: /Visitas de hoy/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Casos abiertos/i })).toBeVisible();
    await expect(page.getByText(/Panel en preparación/i)).toHaveCount(0);
  });

  test('SALES: indicadores comerciales', async ({ page }) => {
    await setupDashboardMocks(page, { role: 'SALES' });
    await setAuthSession(page, 'SALES');
    await gotoDashboard(page);
    await expectLoadedDashboard(page);

    await expect(page.getByRole('link', { name: /Oportunidades en seguimiento/i })).toBeVisible();
    // D4 (CTO 2026-11-17): «Planes sin precio vigente» sale del pulso y queda en la cola.
    await expect(pulseCell(page, 'Planes sin precio vigente')).toHaveCount(0);
    // El nombre accesible de la fila es «Atención: N planes sin precio vigente. Comercial».
    await expect(page.getByRole('link', { name: /\d+ planes? sin precio vigente/i })).toBeVisible();
    await expect(page.getByText(/Panel en preparación/i)).toHaveCount(0);
  });

  test('TECHNICIAN (rol base): agenda útil sin indicadores operativos ajenos', async ({ page }) => {
    await setupDashboardMocks(page, { role: 'TECHNICIAN' });
    await setAuthSession(page, 'TECHNICIAN');
    await gotoDashboard(page);

    await expect(page.getByRole('heading', { level: 1, name: 'ISP Prueba Colombia' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Panel en preparación/i)).toHaveCount(0);
    await expect(page.getByLabel('Indicadores núcleo')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Ver mi agenda de hoy/i })).toHaveCount(0);
  });
});

test.describe('D-1 / D-2 · Axe en temas y estados', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`estado cargado · tema ${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await setupDashboardMocks(page);
      await setAuthSession(page);
      await gotoDashboard(page);
      await expectLoadedDashboard(page);
      await expectThemeApplied(page, theme);
      await runAxe(page, `loaded-${theme}`);
    });

    test(`dato no disponible (null) · tema ${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await setupDashboardMocks(page, { nullVisits: true });
      await setAuthSession(page);
      await gotoDashboard(page);
      await expectLoadedDashboard(page);
      await expectThemeApplied(page, theme);

      const visits = page.getByRole('link', { name: /Visitas de hoy/i });
      await expect(visits.getByText('Sin dato disponible')).toBeVisible();
      await expect(visits.getByText('0', { exact: true })).toHaveCount(0);
      await runAxe(page, `unavailable-${theme}`);
    });

    test(`vacío operativo · tema ${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await setupDashboardMocks(page, { emptyOperational: true });
      await setAuthSession(page);
      await gotoDashboard(page);
      await expectLoadedDashboard(page);
      await expectThemeApplied(page, theme);
      await expect(
        page.getByRole('region', { name: 'Hoy en agenda' }).getByText('Sin eventos para hoy'),
      ).toBeVisible();
      await runAxe(page, `empty-${theme}`);
    });

    test(`error de fuente · tema ${theme} + backgroundImage none`, async ({ page }) => {
      await applyTheme(page, theme);
      await setupDashboardMocks(page, { failWfm: true, failAgenda: true });
      await setAuthSession(page);
      await gotoDashboard(page);
      await expectLoadedDashboard(page);
      await expectThemeApplied(page, theme);

      const alert = page
        .getByRole('region', { name: 'Hoy en agenda' })
        .getByRole('status')
        .filter({ hasText: 'No pudimos cargar las visitas' });
      await expect(alert).toBeVisible();

      const backgroundImage = await alert.evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(backgroundImage, `backgroundImage en error ${theme}`).toBe('none');

      await runAxe(page, `error-${theme}`);
    });
  }

  test('estado loading · tema claro (compuerta WFM)', async ({ page }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    await applyTheme(page, 'light');
    await setupDashboardMocks(page, { holdWfm: { wait: () => gate } });
    await setAuthSession(page);
    await page.goto('/dashboard');

    await expect(page.locator('[aria-busy="true"]').first()).toBeVisible({ timeout: 15_000 });

    try {
      await runAxe(page, 'loading-light');
    } finally {
      release();
    }

    await expectLoadedDashboard(page);
  });

  test('estado actualizando · tema oscuro', async ({ page }) => {
    const options: MockOptions = {};
    const initialTime = new Date();
    await applyTheme(page, 'dark');
    await setupDashboardMocks(page, options);
    await page.clock.setFixedTime(initialTime);
    await setAuthSession(page);
    await gotoDashboard(page);
    await expectLoadedDashboard(page);
    await expectThemeApplied(page, 'dark');

    let release: () => void = () => undefined;
    options.holdWfm = {
      wait: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    };

    await page.clock.setFixedTime(new Date(initialTime.getTime() + 6 * 60 * 1000));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByText(/Actualizando/i).first()).toBeVisible({ timeout: 10_000 });

    try {
      await runAxe(page, 'updating-dark');
    } finally {
      release();
    }

    await expect(page.getByText(/Actualizando/i)).toHaveCount(0, { timeout: 15_000 });
  });
});

test.describe('D-4 · Recorrido de teclado móvil 375 px', () => {
  test('drawer cerrado es inerte; Tab/Escape/retorno de foco', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupDashboardMocks(page);
    await setAuthSession(page);
    await gotoDashboard(page);
    await expectLoadedDashboard(page);

    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toHaveAttribute('inert', '');

    const openMenu = page.getByRole('button', { name: 'Abrir menú' });
    await openMenu.focus();
    await page.keyboard.press('Tab');

    const focusedAfterTab = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        inSidebar: Boolean(el?.closest('#sidebar')),
        label: el?.getAttribute('aria-label') ?? el?.textContent?.trim()?.slice(0, 80) ?? '',
      };
    });
    expect(focusedAfterTab.inSidebar).toBe(false);

    await openMenu.click();
    await expect(sidebar).not.toHaveAttribute('inert');
    const closeInDrawer = sidebar.getByRole('button', { name: 'Cerrar menú' });
    await expect(closeInDrawer).toBeFocused();

    await page.keyboard.press('Tab');
    const focusedInDrawer = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('#sidebar')),
    );
    expect(focusedInDrawer).toBe(true);

    await page.keyboard.press('Shift+Tab');
    await expect(closeInDrawer).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(sidebar).toHaveAttribute('inert', '');
    await expect(openMenu).toBeFocused();
  });
});

test.describe('D-5 / D-7 · Primer viewport, responsive y firmas', () => {
  for (const width of [375, 768, 1280] as const) {
    test(`viewport ${width}px: identidad + ≥2 indicadores sin solape`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
      await setupDashboardMocks(page);
      await setAuthSession(page);
      await gotoDashboard(page);
      await expectLoadedDashboard(page);

      const heading = page.getByRole('heading', { level: 1, name: 'ISP Prueba Colombia' });
      await expect(heading).toBeVisible();

      const headingBox = await heading.boundingBox();
      expect(headingBox).not.toBeNull();
      expect(headingBox!.y + headingBox!.height).toBeLessThanOrEqual(width === 375 ? 812 : 900);

      await expect(page.getByRole('toolbar', { name: 'Acciones del inicio' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: /Nueva oportunidad/i })).toHaveCount(0);

      const visits = page.getByRole('link', { name: /Visitas de hoy/i });
      const cases = page.getByRole('link', { name: /Casos abiertos/i });
      await expect(visits).toBeVisible();
      await expect(cases).toBeVisible();

      const a = await visits.boundingBox();
      const b = await cases.boundingBox();
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      const overlap =
        a!.x < b!.x + b!.width &&
        a!.x + a!.width > b!.x &&
        a!.y < b!.y + b!.height &&
        a!.y + a!.height > b!.y;
      // Sin solape en ningún ancho; en 375 se apilan y el orden lo fija la composición del rol.
      expect(overlap).toBe(false);

      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `viewport-${width}.png`),
        fullPage: false,
      });
    });
  }

  test('firmas iWana: barra lima activa + sombra soft en el pulso (D-7)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setupDashboardMocks(page);
    await setAuthSession(page);
    await gotoDashboard(page);
    await expectLoadedDashboard(page);

    const inicio = page.locator('#sidebar').getByRole('link', { name: 'Inicio' });
    await expect(inicio).toHaveAttribute('aria-current', 'page');
    const limeBar = inicio.locator('span.absolute.left-0');
    await expect(limeBar).toBeAttached();

    // El pulso es una sola superficie: la sombra vive en la franja, no en cada celda.
    const pulse = page.getByLabel('Indicadores núcleo');
    const shadow = await pulse.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).not.toBe('none');

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'firmas-iwana-1280.png'),
      fullPage: false,
    });
  });
});

test.describe('Dashboard empresarial — CA-V2-05 hidratación destino', () => {
  test('indicador → lista filtrada → recarga conserva filtro → Inicio (UX-15/16)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setupDashboardMocks(page, { role: 'ADMIN' });
    await setAuthSession(page, 'ADMIN');
    await gotoDashboard(page);
    await expectLoadedDashboard(page);

    // Cola de atención — mesa de ayuda con slaBreachStatus (patrón I-3 ya estable)
    await page.getByRole('link', { name: /casos? en riesgo de incumplir/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/assurance\?.*slaBreachStatus=AT_RISK/);
    await expect(page.getByRole('heading', { name: /mesa de ayuda/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    // Bandeja 2026-11-18 §3 B / CA-4: el enlace del inicio abre la cola equivalente «Por vencer».
    const dueSoonQueue = page
      .getByRole('group', { name: 'Colas de trabajo' })
      .getByRole('button', { name: /^Por vencer/ });
    await expect(dueSoonQueue).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page).toHaveURL(/slaBreachStatus=AT_RISK/);
    await expect(dueSoonQueue).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#sidebar').getByRole('link', { name: 'Inicio' }).click();
    await expectLoadedDashboard(page);

    // I-1 — agenda día + fromDate
    await page.getByRole('link', { name: /Visitas de hoy/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/scheduling\/agenda\?.*view=day/);
    await expect(page).toHaveURL(/fromDate=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByRole('button', { name: 'Día' })).toHaveAttribute(
      'aria-pressed',
      'true',
      {
        timeout: 15_000,
      },
    );
    await page.reload();
    await expect(page).toHaveURL(/view=day/);
    await expect(page).toHaveURL(/fromDate=\d{4}-\d{2}-\d{2}/);
    await page.locator('#sidebar').getByRole('link', { name: 'Inicio' }).click();
    await expectLoadedDashboard(page);

    // Cola de atención — bandeja status
    await page.getByRole('link', { name: /solicitud(es)? listas? para programar/i }).click();
    await expect(page).toHaveURL(
      /\/dashboard\/scheduling\/pending-visits\?.*status=READY_TO_SCHEDULE/,
    );
    await expect(page.getByRole('heading', { name: /Visitas pendientes/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.reload();
    await expect(page).toHaveURL(/status=READY_TO_SCHEDULE/);
    await expect(page.getByRole('heading', { name: /Visitas pendientes/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.locator('#sidebar').getByRole('link', { name: 'Inicio' }).click();
    await expectLoadedDashboard(page);

    // I-7 — oportunidades view=open. Dirección §5.1 / CA-PA-02: pulso de máximo 5 cifras; «Oportunidades en seguimiento» sale del pulso de la Administradora y el conjunto se abre desde su área.
    await page.getByRole('link', { name: 'Abrir Oportunidades' }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/expedientes\?.*view=open/);
    await expect(page.getByRole('tab', { name: /Abiertas/i })).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page).toHaveURL(/view=open/);
    await page.locator('#sidebar').getByRole('link', { name: 'Inicio' }).click();
    await expectLoadedDashboard(page);
  });
});

test.describe('Encabezado · Periodo y actualización', () => {
  test('Periodo y Actualizar junto al título en 375/768/1280', async ({ page }) => {
    for (const width of [375, 768, 1280] as const) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
      await setupDashboardMocks(page);
      await setAuthSession(page);
      await gotoDashboard(page);
      await expectLoadedDashboard(page);

      const heading = page.getByRole('heading', { level: 1, name: 'ISP Prueba Colombia' });
      await expect(heading).toBeVisible();
      await expect(heading.locator('a, button')).toHaveCount(0);
      await expect(page.getByRole('toolbar', { name: 'Acciones del inicio' })).toHaveCount(0);
      await expect(page.getByRole('group', { name: 'Periodo de tendencia' })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Actualizar$/ })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Más acciones del inicio' })).toHaveCount(0);
    }
  });

  test('el periodo cambia las series y se recupera desde la URL; Actualizar relee la agenda', async ({
    page,
  }) => {
    await openDashboardAs(page, 'ADMIN');
    const periods = page.getByRole('group', { name: 'Periodo de tendencia' });
    await expect(periods.getByRole('button', { name: 'Este mes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await periods.getByRole('button', { name: '7 días' }).click();
    await expect(page).toHaveURL(/periodo=7-dias/);
    await expect(trendBlock(page)).toContainText('últimos 7 días');
    await expect(seriesControl(trendBlock(page), 'Suscriptores')).toHaveCount(0);

    await periods.getByRole('button', { name: '12 meses' }).click();
    await expect(trendBlock(page)).toContainText('últimos 12 meses');
    await page.reload();
    await expect(periods.getByRole('button', { name: '12 meses' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(trendBlock(page)).toContainText('últimos 12 meses');
    await expect(page.getByTestId('portal-metric-sparkline')).toBeVisible();
    await expect(page.getByText('Sin medición', { exact: true })).toBeVisible();

    const refreshed = page.waitForResponse((r) => r.url().includes('/wfm/events?') && r.ok());
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await refreshed;
    await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toBeEnabled();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════
// Fase 2 · «Pulso y atención» — N1–N3, Tendencia y dinero por rol
// Textos de pantalla alineados con la dirección §5.1/§5.3, el HLD v3.0 §6 y el contrato DS §2.2,
// §4 y §6 (bloque «Tendencia»; series «Suscriptores», «Recaudo», «Casos»; celdas «Recaudo del
// mes» y «Cartera vencida»; área «Facturación»). Se fijan aquí antes de que exista la pantalla.
// ════════════════════════════════════════════════════════════════════════════════════════

const TREND_TITLE = 'Tendencia';
const TREND_SERIES = ['Suscriptores', 'Recaudo', 'Casos'] as const;
type TrendSeriesName = (typeof TREND_SERIES)[number];

/** Resumen textual esperado (`role="img"` + `aria-label`, contrato DS §4) por serie. */
const TREND_SUMMARY: Record<TrendSeriesName, RegExp> = {
  Suscriptores: /altas[\s\S]*\d|\d[\s\S]*altas/i,
  Recaudo: /recaud[\s\S]*\d|\d[\s\S]*recaud/i,
  Casos: /casos[\s\S]*\d|\d[\s\S]*casos/i,
};

/** Tabla alternativa (contrato DS §2.2 `xHeader` y §6 etiquetas de serie). */
const TREND_TABLE: Record<
  TrendSeriesName,
  { xHeader: string; series: [string, string]; rows: number }
> = {
  Suscriptores: { xHeader: 'Mes', series: ['Altas', 'Retiros'], rows: 12 },
  Recaudo: { xHeader: 'Mes', series: ['Facturado', 'Recaudado'], rows: 12 },
  Casos: { xHeader: 'Día', series: ['Creados', 'Resueltos'], rows: 14 },
};

const PULSE_LABEL = 'Indicadores núcleo';
const COLLECTION_CELL = 'Recaudo del mes';
const OVERDUE_CELL = 'Cartera vencida';
const BILLING_AREA = 'Facturación';
/** Importe en pesos pintado en pantalla: «$ 182.400.000», «$182 M»… */
const MONEY_TEXT = /\$\s?\d/;

/** Bloque Tendencia: la sección más interna que contiene su encabezado. */
function trendBlock(page: Page): Locator {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: TREND_TITLE, exact: true }) })
    .last();
}

/** Selector de serie: pestaña (contrato DS §3 «pestaña») o botón conmutador. */
function seriesControl(trend: Locator, name: TrendSeriesName): Locator {
  return trend
    .getByRole('tab', { name, exact: true })
    .or(trend.getByRole('button', { name, exact: true }));
}

function trendChart(trend: Locator, name?: TrendSeriesName): Locator {
  return trend.getByRole('img', { name: name ? TREND_SUMMARY[name] : /\S/ });
}

function pulseCell(page: Page, label: string): Locator {
  return page.getByLabel(PULSE_LABEL).locator(':scope > *').filter({ hasText: label });
}

function billingArea(page: Page): Locator {
  return page
    .getByRole('region', { name: 'Por área' })
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: BILLING_AREA, exact: true }) });
}

/** Espera a que la gráfica (chunk diferido de Recharts) esté pintada, no solo su esqueleto. */
async function expectChartPainted(chart: Locator) {
  await expect(chart).toBeVisible({ timeout: 15_000 });
  await expect(chart.locator('svg').first()).toBeVisible({ timeout: 15_000 });
}

/** Activa una serie solo con teclado y comprueba que queda seleccionada. */
async function selectSeriesByKeyboard(page: Page, trend: Locator, name: TrendSeriesName) {
  const control = seriesControl(trend, name);
  await control.focus();
  await expect(control).toBeFocused();
  await page.keyboard.press('Enter');
  await expect
    .poll(() =>
      control.evaluate(
        (el) =>
          el.getAttribute('aria-selected') ??
          el.getAttribute('aria-pressed') ??
          el.getAttribute('aria-current'),
      ),
    )
    .toBe('true');
  await expectChartPainted(trendChart(trend, name));
}

/**
 * Texto del documento que llega a la persona (incluye `sr-only`), sin el menú lateral ni los
 * scripts de Next (su carga RSC contiene `$` seguidos de dígitos).
 */
async function contentText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const sidebar = document.querySelector('#sidebar');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || sidebar?.contains(parent)) continue;
      if (parent.closest('script, style, noscript, template')) continue;
      parts.push(node.textContent ?? '');
    }
    return parts.join(' ');
  });
}

/** CA-PA-05: una celda de dinero sin fuente no existe o dice «No disponible»; nunca una cifra. */
async function expectMoneyCellWithoutFigure(page: Page, label: string) {
  const cell = pulseCell(page, label);
  if ((await cell.count()) === 0) return;
  await expect(cell).toContainText('No disponible');
  await expect(cell).not.toContainText(/\d/);
}

/** Espera las respuestas de N1–N3 que el rol pide, para afirmar ausencias sin carrera. */
function waitForSources(page: Page, paths: readonly string[]) {
  return Promise.all(paths.map((p) => page.waitForResponse((r) => r.url().includes(p))));
}

async function openDashboardAs(page: Page, role: TenantRole, options: MockOptions = {}) {
  await setupDashboardMocks(page, { ...options, role });
  await setAuthSession(page, role);
  await gotoDashboard(page);
  await expectLoadedDashboard(page);
}

test.describe('Fase 2 · Contratos N1–N3 (fixtures)', () => {
  test('las fixtures de N1, N2 y N3 cumplen el Zod congelado de packages/shared', () => {
    const results = [
      ['N1', BillingDashboardSummarySchema.safeParse(n1Fixture)],
      ['N2', SubscribersDashboardSummarySchema.safeParse(n2Fixture)],
      ['N3', AssuranceDashboardSeriesSchema.safeParse(n3Fixture)],
    ] as const;
    for (const [source, result] of results) {
      expect(result.success, `${source}: ${JSON.stringify(result.error?.issues ?? [])}`).toBe(true);
    }
    // Control negativo: el esquema estricto rechaza tramos que no cuadran con el total.
    const tampered = structuredClone(n1Fixture);
    tampered.overdue.buckets[3]!.amount = '0.00';
    expect(BillingDashboardSummarySchema.safeParse(tampered).success).toBe(false);
  });
});

test.describe('Fase 2 · Tendencia montada (contrato DS §7, CA-PA-07)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`Tendencia montada · axe tema ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await applyTheme(page, theme);
      await openDashboardAs(page, 'ADMIN');
      await expectThemeApplied(page, theme);

      const trend = trendBlock(page);
      await expect(trend).toBeVisible({ timeout: 15_000 });
      const chart = trendChart(trend);
      await expectChartPainted(chart);
      // Resumen redactado con datos, no genérico (DS §4).
      await expect(chart).toHaveAttribute('aria-label', /\d/);

      // CA-PA-07: sin gauge radial, dona ni mapa.
      await expect(
        page.locator(
          '.recharts-pie, .recharts-radial-bar-sectors, .recharts-polar-grid, .leaflet-container',
        ),
      ).toHaveCount(0);

      await runAxe(page, `trend-chart-${theme}`);
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `fase2-tendencia-${theme}-1440.png`),
        fullPage: false,
      });
    });
  }

  test('conmutación de series solo con teclado: Recaudo → Casos → Suscriptores', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDashboardAs(page, 'ADMIN');
    const trend = trendBlock(page);
    await expect(trend).toBeVisible({ timeout: 15_000 });

    for (const name of ['Recaudo', 'Casos', 'Suscriptores'] as const) {
      await selectSeriesByKeyboard(page, trend, name);
      // Una sola gráfica visible: la serie anterior no queda pintada debajo. Se cuentan los
      // `role="img"` con resumen; el `svg` interno de Recharts es presentacional (DS §2.4).
      await expect(trend.getByRole('img', { name: /por (mes|día)/i })).toHaveCount(1);
    }
  });

  test('tabla alternativa por teclado: el foco se queda, caption y scope', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await applyTheme(page, 'light');
    await openDashboardAs(page, 'ADMIN');
    const trend = trendBlock(page);
    await expect(trend).toBeVisible({ timeout: 15_000 });

    for (const name of ['Suscriptores', 'Recaudo', 'Casos'] as const) {
      await page
        .getByRole('group', { name: 'Periodo de tendencia' })
        .getByRole('button', { name: name === 'Casos' ? 'Este mes' : '12 meses' })
        .click();
      await selectSeriesByKeyboard(page, trend, name);
      const spec = TREND_TABLE[name];

      const toTable = trend.getByRole('button', { name: 'Ver como tabla' });
      await toTable.focus();
      await page.keyboard.press('Enter');

      const toChart = trend.getByRole('button', { name: 'Ver como gráfica' });
      await expect(toChart).toBeFocused();
      const table = trend.getByRole('table', { name: /\S/ });
      await expect(table).toBeVisible();
      await expect(table.locator('caption')).toHaveText(/\S/);
      await expect(
        table.getByRole('columnheader', { name: spec.xHeader, exact: true }),
      ).toBeVisible();
      for (const label of spec.series) {
        await expect(table.getByRole('columnheader', { name: label, exact: true })).toBeVisible();
      }
      await expect(table.locator('thead th[scope="col"]')).toHaveCount(3);
      await expect(table.locator('tbody th[scope="row"]')).toHaveCount(spec.rows);
      if (name === 'Recaudo') {
        // Importes con formatValue (pesos), no el número crudo del contrato.
        await expect(table.locator('tbody td').first()).toHaveText(MONEY_TEXT);
        await expect(table).not.toContainText('182400000');
      }
      if (name === 'Suscriptores') {
        await runAxe(page, 'trend-table-light');
      }

      await page.keyboard.press('Space');
      await expect(trend.getByRole('button', { name: 'Ver como tabla' })).toBeFocused();
      await expectChartPainted(trendChart(trend, name));
    }
  });
});

test.describe('Fase 2 · Dinero por rol (CA-PA-03, CA-PA-04, CA-PA-08)', () => {
  test('ADMIN: tres series, área Facturación, lima y degradado donde toca', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const seen: string[] = [];
    const responses = waitForSources(page, [N1_PATH, N2_PATH, N3_PATH]);
    await openDashboardAs(page, 'ADMIN', { seen });
    await responses;

    const trend = trendBlock(page);
    await expectChartPainted(trendChart(trend));
    for (const name of TREND_SERIES) {
      await expect(seriesControl(trend, name)).toBeVisible();
    }
    expect(new Set(seen)).toEqual(new Set([N1_PATH, N2_PATH, N3_PATH]));

    await expect(pulseCell(page, COLLECTION_CELL)).toContainText(/\d/);
    await expect(pulseCell(page, OVERDUE_CELL)).toContainText(/\d/);
    await expect(billingArea(page)).toBeVisible();

    // CA-PA-04: el degradado azul→lima solo vive dentro de la celda de recaudo.
    const gradients = await page.evaluate(
      ({ pulseLabel, collectionLabel }) => {
        const pulse = document.querySelector(`[aria-label="${pulseLabel}"]`);
        const collection = Array.from(pulse?.children ?? []).find((el) =>
          el.textContent?.includes(collectionLabel),
        );
        const sidebar = document.querySelector('#sidebar');
        const all = Array.from(document.querySelectorAll('[class]')).filter((el) => {
          const cls = el.getAttribute('class') ?? '';
          return (
            /gradient|bg-linear/.test(cls) && /iwana-secondary/.test(cls) && !sidebar?.contains(el)
          );
        });
        return {
          total: all.length,
          inCollection: all.filter((el) => collection?.contains(el)).length,
        };
      },
      { pulseLabel: PULSE_LABEL, collectionLabel: COLLECTION_CELL },
    );
    expect(gradients.inCollection, 'degradado en la celda de recaudo').toBeGreaterThan(0);
    expect(gradients.total, 'degradado fuera de la celda de recaudo').toBe(gradients.inCollection);

    // CA-PA-03: con cartera vencida > 0, ni la celda ni el área usan el lima.
    for (const surface of [pulseCell(page, OVERDUE_CELL), billingArea(page)]) {
      const limeNodes = await surface.evaluate(
        (el) =>
          [el, ...Array.from(el.querySelectorAll('[class]'))].filter((node) =>
            /iwana-secondary/.test(node.getAttribute('class') ?? ''),
          ).length,
      );
      expect(limeNodes, 'lima en mora o vencidos').toBe(0);
    }
  });

  test('Contadora (ACCOUNTANT) ve recaudo y cartera; no pide casos', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const seen: string[] = [];
    const responses = waitForSources(page, [N1_PATH]);
    await openDashboardAs(page, 'ACCOUNTANT', { seen });
    await responses;

    await expect(pulseCell(page, COLLECTION_CELL)).toContainText(/\d/);
    await expect(pulseCell(page, OVERDUE_CELL)).toContainText(/\d/);
    await expect(billingArea(page)).toBeVisible();

    const trend = trendBlock(page);
    await expectChartPainted(trendChart(trend));
    // Con una sola serie el selector puede no pintarse; la gráfica de recaudo sí debe estar.
    if ((await seriesControl(trend, 'Recaudo').count()) > 0) {
      await selectSeriesByKeyboard(page, trend, 'Recaudo');
    } else {
      await expectChartPainted(trendChart(trend, 'Recaudo'));
    }
    await expect(seriesControl(trend, 'Casos')).toHaveCount(0);
    await expect(trendChart(trend, 'Casos')).toHaveCount(0);

    // HLD v3.0 §5: la Contadora no tiene N3; el inicio no lo pide.
    expect(seen).not.toContain(N3_PATH);
    expect(seen).toContain(N1_PATH);
  });

  test('Soporte (SUPPORT) no ve dinero: ni celdas, ni pestaña Recaudo, ni área Facturación', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const seen: string[] = [];
    const responses = waitForSources(page, [N3_PATH]);
    await openDashboardAs(page, 'SUPPORT', { seen });
    await responses;

    const trend = trendBlock(page);
    await expectChartPainted(trendChart(trend, 'Casos'));
    await page.waitForLoadState('networkidle');

    expect(seen).not.toContain(N1_PATH);
    expect(seen).not.toContain(N2_PATH);
    await expect(seriesControl(trend, 'Recaudo')).toHaveCount(0);
    await expect(seriesControl(trend, 'Suscriptores')).toHaveCount(0);
    await expect(pulseCell(page, COLLECTION_CELL)).toHaveCount(0);
    await expect(pulseCell(page, OVERDUE_CELL)).toHaveCount(0);
    await expect(billingArea(page)).toHaveCount(0);
    expect(await contentText(page)).not.toMatch(MONEY_TEXT);
  });

  test('Ejecutivo comercial (SALES) ve recaudo y cartera; no pide casos', async ({ page }) => {
    // Regla: decisión del CTO 2026-11-17, D4 — ven dinero Administradora, Contadora y Ejecutivo comercial.
    await page.setViewportSize({ width: 1440, height: 900 });
    const seen: string[] = [];
    const responses = waitForSources(page, [N1_PATH, N2_PATH]);
    await openDashboardAs(page, 'SALES', { seen });
    await responses;

    await expect(pulseCell(page, 'Oportunidades en seguimiento')).toBeVisible();
    await expect(pulseCell(page, 'Suscriptores activos')).toBeVisible();
    await expect(pulseCell(page, COLLECTION_CELL)).toContainText(/\d/);
    await expect(pulseCell(page, OVERDUE_CELL)).toContainText(/\d/);
    await expect(pulseCell(page, 'Ofertas en riesgo')).toBeVisible();
    const cells = await page.getByLabel(PULSE_LABEL).locator(':scope > *').count();
    expect(cells).toBeLessThanOrEqual(5);
    await expect(billingArea(page)).toBeVisible();

    const trend = trendBlock(page);
    await expectChartPainted(trendChart(trend));
    await selectSeriesByKeyboard(page, trend, 'Recaudo');
    await expect(seriesControl(trend, 'Suscriptores')).toBeVisible();
    await expect(seriesControl(trend, 'Casos')).toHaveCount(0);
    await page.waitForLoadState('networkidle');

    expect(seen).toContain(N1_PATH);
    expect(seen).not.toContain(N3_PATH);
  });

  test('Monitoreo (NOC) no ve dinero: no pide N1 ni N2, sin celdas, pestaña ni área', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const seen: string[] = [];
    const responses = waitForSources(page, [N3_PATH]);
    await openDashboardAs(page, 'NOC', { seen });
    await responses;

    const trend = trendBlock(page);
    await expectChartPainted(trendChart(trend, 'Casos'));
    await page.waitForLoadState('networkidle');

    expect(seen).not.toContain(N1_PATH);
    expect(seen).not.toContain(N2_PATH);
    await expect(seriesControl(trend, 'Recaudo')).toHaveCount(0);
    await expect(pulseCell(page, COLLECTION_CELL)).toHaveCount(0);
    await expect(pulseCell(page, OVERDUE_CELL)).toHaveCount(0);
    await expect(billingArea(page)).toHaveCount(0);
    // Sin dinero de facturación en pulso, Tendencia ni cola; el área Inventario sí muestra su valor
    // estimado en pesos (Fase 1), que no es recaudo ni cartera.
    expect(await page.getByLabel(PULSE_LABEL).innerText()).not.toMatch(MONEY_TEXT);
    expect(await trend.innerText()).not.toMatch(MONEY_TEXT);
    expect(
      await page
        .getByRole('heading', { name: 'Requiere tu atención' })
        .locator('xpath=ancestor::*[contains(@class,"rounded-2xl")][1]')
        .innerText(),
    ).not.toMatch(MONEY_TEXT);
  });
});

test.describe('Fase 2 · Fuente caída no pinta cero (CA-PA-05)', () => {
  const cases: Array<{ source: 'n1' | 'n2' | 'n3'; series: TrendSeriesName }> = [
    { source: 'n1', series: 'Recaudo' },
    { source: 'n2', series: 'Suscriptores' },
    { source: 'n3', series: 'Casos' },
  ];

  for (const { source, series } of cases) {
    for (const status of [500, 403] as const) {
      test(`${source.toUpperCase()} responde ${status}: la pestaña ${series} no se monta y no hay ceros`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        const responses = waitForSources(page, [N1_PATH, N2_PATH, N3_PATH]);
        await openDashboardAs(page, 'ADMIN', { [source]: status });
        await responses;

        const trend = trendBlock(page);
        // Las otras dos fuentes siguen: la Tendencia se monta con lo que hay.
        await expectChartPainted(trendChart(trend));

        await expect(seriesControl(trend, series)).toHaveCount(0);
        await expect(trendChart(trend, series)).toHaveCount(0);
        // DS §3: en el inicio no se usa el estado de error del wrapper ni una serie de muestra.
        await expect(page.getByText('No se pudo cargar la gráfica')).toHaveCount(0);
        await expect(page.getByText('Sin datos en el periodo')).toHaveCount(0);

        if (source === 'n1') {
          await expectMoneyCellWithoutFigure(page, COLLECTION_CELL);
          await expectMoneyCellWithoutFigure(page, OVERDUE_CELL);
          const area = billingArea(page);
          if ((await area.count()) > 0) {
            await expect(area).not.toContainText(/\d/);
          }
          expect(await contentText(page)).not.toMatch(/\$\s?0(?![\d.,])/);
        }
        if (source === 'n2') {
          // La base activa sale de queue-counts; el neto y la serie de N2 no se inventan.
          const subscribers = pulseCell(page, 'Suscriptores activos');
          await expect(subscribers).toBeVisible();
          await expect(subscribers).not.toContainText(/\d+\s*(altas|retiros)/i);
          await expect(subscribers).not.toContainText(/neto\s*[+−-]?\s*\d/i);
        }
      });
    }
  }

  test('las tres fuentes caídas: la Tendencia no se monta', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const responses = waitForSources(page, [N1_PATH, N2_PATH, N3_PATH]);
    await openDashboardAs(page, 'ADMIN', { n1: 500, n2: 403, n3: 500 });
    await responses;
    // Ancla positiva: el resto del inicio ya compuso con sus fuentes de la Fase 1.
    await expect(page.getByRole('link', { name: /Casos abiertos/i })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Por área' })).toBeVisible();

    await expect(page.getByRole('heading', { name: TREND_TITLE, exact: true })).toHaveCount(0);
    for (const name of TREND_SERIES) {
      await expect(page.getByRole('img', { name: TREND_SUMMARY[name] })).toHaveCount(0);
    }
    await expect(page.getByText('No se pudo cargar la gráfica')).toHaveCount(0);
    await expect(page.getByText('Sin datos en el periodo')).toHaveCount(0);
  });

  test('Soporte con N3 caído: la Tendencia no se monta', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const responses = waitForSources(page, [N3_PATH]);
    await openDashboardAs(page, 'SUPPORT', { n3: 500 });
    await responses;
    await expect(page.getByRole('link', { name: /Casos abiertos/i })).toBeVisible();

    await expect(page.getByRole('heading', { name: TREND_TITLE, exact: true })).toHaveCount(0);
    await expect(page.getByRole('img', { name: TREND_SUMMARY.Casos })).toHaveCount(0);
    await expect(page.getByText('No se pudo cargar la gráfica')).toHaveCount(0);
  });
});

test.describe('Fase 2 · Primer viewport (CA-PA-01, CA-PA-02)', () => {
  test('1440×900: B0, B1 y B2 completos sin desplazar; pulso ≤ 5 cifras', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDashboardAs(page, 'ADMIN');

    const trend = trendBlock(page);
    await expectChartPainted(trendChart(trend));
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    const trendTitle = trend.getByRole('heading', { name: 'Tendencia' });
    const series = trend.getByRole('tablist', { name: 'Serie de la tendencia' });
    const [titleBox, seriesBox] = await Promise.all([
      trendTitle.boundingBox(),
      series.boundingBox(),
    ]);
    expect(seriesBox!.x).toBeGreaterThan(titleBox!.x + titleBox!.width);
    expect(seriesBox!.y).toBeLessThan(titleBox!.y + titleBox!.height);

    const agenda = page.getByRole('region', { name: 'Hoy en agenda' });
    await expect(agenda.getByRole('link', { name: 'Ver agenda completa' })).toHaveAttribute(
      'href',
      /\/dashboard\/scheduling\/agenda\?view=day&fromDate=\d{4}-\d{2}-\d{2}$/,
    );
    await expect(page.getByRole('heading', { name: 'Actividad reciente' })).toBeVisible();

    const pulse = page.getByLabel(PULSE_LABEL);
    const cells = await pulse.locator(':scope > *').count();
    expect(cells).toBeGreaterThan(0);
    expect(cells).toBeLessThanOrEqual(5);

    const bottoms = {
      B0: await page
        .getByRole('heading', { level: 1, name: 'ISP Prueba Colombia' })
        .evaluate((el) => el.getBoundingClientRect().bottom),
      B1: await pulse.evaluate((el) => el.getBoundingClientRect().bottom),
      'B2 Tendencia': await trend.evaluate((el) => el.getBoundingClientRect().bottom),
      'B2 Atención': await page
        .getByRole('heading', { name: 'Requiere tu atención', exact: true })
        .evaluate((el) => (el.closest('.rounded-2xl') ?? el).getBoundingClientRect().bottom),
    };
    // Evidencia de la medida (borde inferior en px) para el informe de cierre.
    console.log('[CA-PA-01:1440x900]', JSON.stringify(bottoms));
    for (const [band, bottom] of Object.entries(bottoms)) {
      expect(bottom, `${band} termina dentro de 900 px`).toBeLessThanOrEqual(900);
    }

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'fase2-primer-viewport-1440.png'),
      fullPage: false,
    });
  });
});
