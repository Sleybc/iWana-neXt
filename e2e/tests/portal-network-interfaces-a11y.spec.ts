import path from 'node:path';
import { mkdir } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import type {
  CatalogMetaDto,
  ExecutionOrderDetail,
  Ipv4NetworkExtendedDto,
  Page as ContractPage,
  ProvisioningInboxRowDto,
  ProvisioningMetaDto,
  ProvisioningOrderContextDto,
  RouterDetailDto,
  RouterInterfaceDto,
  RouterInterfaceIpv4AddressDto,
  RouterListDto,
  ServiceProvisioningDto,
} from '@iwana/shared';
import { seedPortalSession } from './helpers/portal-session';

const TENANT_SLUG = 'tenant-mod13-interface-e2e';
const USER_ID = 'user-mod13-e2e';
const ROUTER_ID = 'router-mod13-e2e';
const INTERFACE_ID = 'interface-mod13-e2e';
const NETWORK_ID = 'network-mod13-e2e';
const ORDER_ID = 'order-mod13-e2e';
const EVIDENCE_ID = 'evidence-mod13-e2e';
const EVIDENCE_DIR = path.join(process.cwd(), 'docs/quality/evidence-mod13-o3-q');
const NOW = '2026-10-27T12:00:00.000Z';

function syntheticToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: 4_102_444_800 })).toString('base64url');
  return `${header}.${payload}.synthetic-signature`;
}

const router: RouterListDto = {
  id: ROUTER_ID,
  name: 'Router de pruebas MOD13',
  managementHost: '198.51.100.12',
  lanInterface: 'bridge-clientes',
  supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
  organizationSiteId: null,
  commercialNodeId: null,
  status: 'ACTIVE',
  notes: null,
  networkCount: 1,
  interfaceCount: 1,
  legacyLanInterfaceId: null,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

const routerDetail: RouterDetailDto = {
  ...router,
  organizationSite: null,
  commercialNode: null,
};

const routerInterface: RouterInterfaceDto = {
  id: INTERFACE_ID,
  routerId: ROUTER_ID,
  name: 'bridge-clientes',
  kind: 'BRIDGE',
  notes: 'Interfaz sintética para pruebas de catálogo.',
  status: 'ACTIVE',
  ipv4AddressCount: 1,
  networkCount: 1,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

const localAddress: RouterInterfaceIpv4AddressDto = {
  id: 'address-mod13-e2e',
  routerId: ROUTER_ID,
  interfaceId: INTERFACE_ID,
  addressWithPrefix: '192.0.2.254/24',
  host: '192.0.2.254',
  prefixLength: 24,
  notes: null,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

const network: Ipv4NetworkExtendedDto = {
  id: NETWORK_ID,
  routerId: ROUTER_ID,
  routerName: router.name,
  name: 'Red de clientes de prueba',
  cidr: '192.0.2.0/24',
  gateway: '192.0.2.1',
  assignableFrom: '192.0.2.2',
  assignableTo: '192.0.2.253',
  excludedIps: [],
  interfaceId: INTERFACE_ID,
  interface: { id: INTERFACE_ID, name: routerInterface.name, status: 'ACTIVE' },
  reservationAvailability: { available: true, reason: null },
  defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
  status: 'ACTIVE',
  occupancy: { total: 252, reserved: 0, active: 0, free: 252 },
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

const provisioningService: ServiceProvisioningDto = {
  id: 'provisioning-mod13-e2e',
  status: 'RESERVED',
  origin: 'NORMAL',
  executionOrderId: ORDER_ID,
  executionOrderNumber: 'OT-MOD13-E2E',
  subscriberId: 'subscriber-mod13-e2e',
  contractId: null,
  router: { id: ROUTER_ID, name: router.name },
  network: { id: NETWORK_ID, name: network.name, cidr: network.cidr },
  ip: '192.0.2.10',
  controlMethod: 'SIMPLE_QUEUE_STATIC_IP',
  controlParams: { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: 'cola-mod13-e2e' },
  plan: null,
  cpe: null,
  reservedBy: { id: USER_ID, name: 'Operadora de pruebas' },
  reservedAt: NOW,
  certifiedBy: null,
  certifiedAt: null,
  certificationEvidenceId: null,
  regularizedBy: null,
  regularizedAt: null,
  regularizationReason: null,
  activatedAt: null,
  releasedBy: null,
  releasedAt: null,
  releaseReason: null,
  failureReason: null,
  commercialActivation: { status: 'NOT_APPLICABLE', detail: null },
  routerInstruction: { mode: 'MANUAL', steps: ['Revisa la configuración en el equipo.'] },
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

const orderContext: ProvisioningOrderContextDto = {
  executionOrder: {
    id: ORDER_ID,
    executionOrderNumber: 'OT-MOD13-E2E',
    status: 'IN_PROGRESS',
    workType: 'INSTALLATION',
    assignedTechnician: { id: 'technician-mod13-e2e', name: 'Técnica de prueba' },
    canCertify: true,
  },
  subscriber: { id: 'subscriber-mod13-e2e', displayLabel: 'Cuenta sintética MOD13' },
  plan: null,
  contracts: [],
  cpe: null,
  evidences: [
    {
      id: EVIDENCE_ID,
      evidenceType: 'PHOTO',
      requirementKey: null,
      createdAt: NOW,
    },
  ],
  provisioning: provisioningService,
  suggestedQueueName: 'cola-mod13-e2e',
};

const closedInboxRow: ProvisioningInboxRowDto = {
  queue: 'CLOSED_UNPROVISIONED',
  executionOrderId: ORDER_ID,
  executionOrderNumber: 'OT-MOD13-E2E',
  executionOrderStatus: 'COMPLETED',
  subscriberId: 'subscriber-mod13-e2e',
  subscriberDisplayLabel: 'Cuenta sintética MOD13',
  assignedTechnician: { id: 'technician-mod13-e2e', name: 'Técnica de prueba' },
  serviceProvisioningId: null,
  provisioningStatus: null,
  ip: null,
  failureReason: 'CLOSED_WITHOUT_CERTIFICATION',
  closedAt: NOW,
  updatedAt: NOW,
};

const executionOrderDetail: ExecutionOrderDetail = {
  id: ORDER_ID,
  number: 'OT-MOD13-E2E',
  version: 1,
  status: 'IN_PROGRESS',
  annulled: false,
  workType: 'INSTALLATION',
  template: null,
  schedule: { eventId: null, window: null },
  assignee: { type: 'TECHNICIAN', id: 'technician-mod13-e2e', displayLabel: 'Técnica de prueba' },
  site: { id: 'site-mod13-e2e', label: 'Sede de pruebas' },
  completion: { progress: 0, completed: 0, total: 0 },
  syncState: 'IN_SYNC',
  inventoryReconciliation: 'NOT_REQUIRED',
  allowedActions: [],
  createdAt: NOW,
  updatedAt: NOW,
};

const pageMeta = (total: number) => ({
  nextCursor: null,
  total,
  totalIsEstimate: false,
  page: 1,
  limit: 100,
  totalPages: total > 0 ? 1 : 0,
  hasMore: false,
  mode: 'page' as const,
  capabilities: { randomAccess: true, sortableFields: [] },
  sort: null,
});

function pageOf<T>(data: T[]): ContractPage<T> {
  return { data, meta: pageMeta(data.length) };
}

interface MockOptions {
  reservationsPaused?: boolean;
  reserveConflict?: boolean;
  ipProtectionUnavailable?: boolean;
  queue?: ProvisioningInboxRowDto[];
  initialProvisioning?: ServiceProvisioningDto | null;
}

interface MockState {
  reserveRequests: number;
  regularizeRequests: number;
  certifyRequests: number;
  releaseRequests: number;
  interfaceAddressMutationRequests: number;
  unhandledMod13Requests: string[];
  reservationsPaused: boolean;
  reserveConflict: boolean;
  ipProtectionUnavailable: boolean;
  currentProvisioning: ServiceProvisioningDto | null;
}

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installMocks(page: Page, options: MockOptions = {}): Promise<MockState> {
  const state: MockState = {
    reserveRequests: 0,
    regularizeRequests: 0,
    certifyRequests: 0,
    releaseRequests: 0,
    interfaceAddressMutationRequests: 0,
    unhandledMod13Requests: [],
    reservationsPaused: options.reservationsPaused ?? false,
    reserveConflict: options.reserveConflict ?? false,
    ipProtectionUnavailable: options.ipProtectionUnavailable ?? false,
    currentProvisioning: options.initialProvisioning ?? null,
  };
  const inboxRows = options.queue ?? [];

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    const json = (body: unknown, status = 200) => fulfillJson(route, body, status);

    if (pathname.endsWith('/tenants/public-branding') && method === 'GET') {
      return json({
        data: {
          displayName: 'Tenant de pruebas MOD13',
          showTenantName: true,
          logoLightUrl: null,
          logoDarkUrl: null,
          sealLightUrl: null,
          sealDarkUrl: null,
          faviconLightUrl: null,
          faviconDarkUrl: null,
          loginBackgroundLightUrl: null,
          loginBackgroundDarkUrl: null,
        },
      });
    }
    if (pathname.endsWith('/tenants/me/summary') && method === 'GET') {
      return json({ data: { id: 'tenant-mod13-e2e', slug: TENANT_SLUG, status: 'ACTIVE' } });
    }
    if (pathname.endsWith('/tenants/me') && method === 'GET') {
      return json({
        data: { id: 'tenant-mod13-e2e', name: 'Tenant de pruebas MOD13', slug: TENANT_SLUG },
      });
    }
    if (pathname.endsWith('/auth/me') && method === 'GET') {
      return json({
        data: {
          sub: USER_ID,
          email: 'hash-user-mod13-e2e',
          role: 'ADMIN',
          tenantId: 'tenant-mod13-e2e',
          schemaName: 'tenant_mod13_e2e',
          jti: 'jti-mod13-e2e',
          type: 'tenant',
          passwordResetRequired: false,
        },
      });
    }
    if (/\/users\/[^/]+$/u.test(pathname) && method === 'GET') {
      return json({
        data: {
          id: USER_ID,
          email: 'hash-user-mod13-e2e',
          role: 'ADMIN',
          status: 'ACTIVE',
          firstName: 'Operadora',
          lastName: 'Prueba',
          phone: null,
          mfaEnabled: false,
          emailVerified: true,
          createdAt: NOW,
        },
      });
    }
    if (pathname.endsWith('/access-control/me/effective-permissions') && method === 'GET') {
      return json({
        data: {
          userId: USER_ID,
          role: 'ADMIN',
          effectivePermissions: [
            'network.catalog.read',
            'network.catalog.manage',
            'network.provisioning.read',
            'network.provisioning.execute',
            'network.provisioning.certify',
            'network.provisioning.regularize',
            'operations.execution_orders.read',
          ],
          recoveryPermissions: [],
          profileSources: [],
        },
      });
    }
    if (pathname.endsWith('/notifications') && method === 'GET') {
      return json({ data: [], meta: { nextCursor: null, total: 0 } });
    }
    if (pathname.endsWith('/dashboard/summary') && method === 'GET') {
      return json({ data: { activeSubscribers: 0, pendingInstallations: 0, alerts: [] } });
    }
    if (pathname.endsWith('/configuration/settings-sections') && method === 'GET') {
      return json({ data: [] });
    }
    if (pathname.endsWith('/auth/refresh') && method === 'POST') {
      return json({ data: { accessToken: syntheticToken() } });
    }
    if (pathname.endsWith('/auth/logout') && method === 'POST') return json({});

    if (pathname === '/api/v1/network/routers' && method === 'GET') {
      return json(pageOf([router]));
    }
    if (pathname === `/api/v1/network/routers/${ROUTER_ID}` && method === 'GET') {
      return json(routerDetail);
    }
    if (pathname === '/api/v1/network/ipv4-networks' && method === 'GET') {
      return json(pageOf([network]));
    }
    if (pathname === `/api/v1/network/routers/${ROUTER_ID}/interfaces` && method === 'GET') {
      return json(pageOf([routerInterface]));
    }
    if (
      pathname ===
        `/api/v1/network/routers/${ROUTER_ID}/interfaces/${INTERFACE_ID}/ipv4-addresses` &&
      method === 'GET'
    ) {
      return json(pageOf([localAddress]));
    }
    if (pathname === '/api/v1/network/catalog-meta' && method === 'GET') {
      if (state.ipProtectionUnavailable) {
        return json({ code: 'SERVICE_UNAVAILABLE', message: 'Metadata no disponible.' }, 503);
      }
      const meta: CatalogMetaDto = { ipProtection: 'PENDING' };
      return json(meta);
    }
    if (
      pathname.includes(
        `/network/routers/${ROUTER_ID}/interfaces/${INTERFACE_ID}/ipv4-addresses`,
      ) &&
      method !== 'GET'
    ) {
      state.interfaceAddressMutationRequests += 1;
      return json({ code: 'IP_PROTECTION_PENDING', message: 'Protección pendiente.' }, 409);
    }

    if (pathname === '/api/v1/network/provisioning/meta' && method === 'GET') {
      const meta: ProvisioningMetaDto = { reservationsPaused: state.reservationsPaused };
      return json(meta);
    }
    if (pathname === '/api/v1/network/settings' && method === 'GET') {
      return json({ enforceProvisioningOnInstallClose: true, updatedAt: NOW, updatedBy: null });
    }
    if (pathname === '/api/v1/network/provisioning/inbox' && method === 'GET') {
      const query = new URL(request.url()).searchParams;
      const data = query.get('queue') === 'CLOSED_UNPROVISIONED' ? inboxRows : [];
      return json(pageOf(data));
    }
    if (
      pathname === `/api/v1/network/provisioning/orders/${ORDER_ID}/context` &&
      method === 'GET'
    ) {
      return json({ ...orderContext, provisioning: state.currentProvisioning });
    }
    if (pathname === '/api/v1/network/provisioning/reserve' && method === 'POST') {
      state.reserveRequests += 1;
      if (state.reserveConflict || state.reservationsPaused) {
        return json(
          { code: 'RESERVATIONS_PAUSED', message: 'Las reservas están pausadas temporalmente.' },
          409,
        );
      }
      return json(provisioningService, 201);
    }
    if (pathname === '/api/v1/network/provisioning/regularize' && method === 'POST') {
      state.regularizeRequests += 1;
      return json(
        { code: 'RESERVATIONS_PAUSED', message: 'Las reservas están pausadas temporalmente.' },
        409,
      );
    }
    if (
      pathname === `/api/v1/network/provisioning/${provisioningService.id}/certify` &&
      method === 'POST'
    ) {
      state.certifyRequests += 1;
      state.currentProvisioning = {
        ...provisioningService,
        status: 'CERTIFIED',
        version: 2,
        certifiedBy: { id: USER_ID, name: 'Operadora de pruebas' },
        certifiedAt: NOW,
        certificationEvidenceId: EVIDENCE_ID,
      };
      return json(state.currentProvisioning);
    }
    if (
      pathname === `/api/v1/network/provisioning/${provisioningService.id}/release` &&
      method === 'POST'
    ) {
      state.releaseRequests += 1;
      state.currentProvisioning = {
        ...provisioningService,
        status: 'RELEASED',
        version: 3,
        releasedBy: { id: USER_ID, name: 'Operadora de pruebas' },
        releasedAt: NOW,
        releaseReason: 'MANUAL',
      };
      return json(state.currentProvisioning);
    }

    if (pathname === '/api/v1/tasks/execution-orders' && method === 'GET') {
      return json(pageOf([]));
    }
    if (pathname === `/api/v1/tasks/execution-orders/${ORDER_ID}` && method === 'GET') {
      return json(executionOrderDetail);
    }
    if (pathname.startsWith(`/api/v1/tasks/execution-orders/${ORDER_ID}/`) && method === 'GET') {
      return json(pageOf([]));
    }
    if (pathname === '/api/v1/organization/sites' && method === 'GET') {
      return json(pageOf([]));
    }
    if (
      ['/api/v1/inventory/items', '/api/v1/inventory/locations'].includes(pathname) &&
      method === 'GET'
    ) {
      return json(pageOf([]));
    }
    if (pathname === '/api/v1/inventory/custody' && method === 'GET') {
      return json({ location: null, assets: pageOf([]), balances: pageOf([]) });
    }

    if (pathname.startsWith('/api/v1/network/')) {
      state.unhandledMod13Requests.push(`${method} ${pathname}`);
    }
    return json({ code: 'E2E_UNMOCKED', message: pathname }, 404);
  });

  await seedPortalSession(page, { token: syntheticToken(), tenantSlug: TENANT_SLUG });
  return state;
}

async function openRouterDetail(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(`/dashboard/network/routers?routerId=${ROUTER_ID}`);
  await page.evaluate(
    (dark) => document.documentElement.classList.toggle('dark', dark),
    theme === 'dark',
  );
  const dialog = page.getByRole('dialog', { name: router.name });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Interfaces' })).toBeVisible();
  await expect(
    dialog.getByRole('status').filter({ hasText: 'Registro de direcciones no disponible' }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Añadir interfaz', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Ver direcciones (1)' }).click();
  await expect(dialog.getByText(localAddress.addressWithPrefix)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Añadir dirección', exact: true })).toHaveCount(
    0,
  );
  await expect(dialog.getByRole('button', { name: 'Corregir dirección', exact: true })).toHaveCount(
    0,
  );
  await expect(dialog.getByRole('heading', { name: 'Redes IPv4' })).toBeVisible();
  await expect(dialog.getByText(network.name, { exact: true })).toBeVisible();
  return dialog;
}

test.describe('MOD13 · interfaces IPv4, pausa de reservas y accesibilidad', () => {
  test.describe('PENDING · detalle del router y evidencias visuales', () => {
    const viewports = [
      { name: '375x812', width: 375, height: 812 },
      { name: '768x900', width: 768, height: 900 },
      { name: '1280x900', width: 1280, height: 900 },
    ] as const;
    const themes = ['light', 'dark'] as const;

    for (const viewport of viewports) {
      for (const theme of themes) {
        test(`${viewport.name} ${theme}: conserva interfaz/red y no permite alta/corrección IP local`, async ({
          page,
        }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          const state = await installMocks(page);
          const pageErrors: string[] = [];
          page.on('pageerror', (error) => pageErrors.push(error.message));

          const dialog = await openRouterDetail(page, theme);
          await mkdir(EVIDENCE_DIR, { recursive: true });
          await page.screenshot({
            path: path.join(EVIDENCE_DIR, `routers-interfaces-${viewport.name}-${theme}.png`),
            fullPage: false,
          });

          const horizontalOverflow = await page.evaluate(() => ({
            viewport: window.innerWidth,
            document: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
          }));
          expect(horizontalOverflow.document).toBeLessThanOrEqual(horizontalOverflow.viewport);
          expect(horizontalOverflow.body).toBeLessThanOrEqual(horizontalOverflow.viewport);
          expect(state.interfaceAddressMutationRequests).toBe(0);
          expect(state.unhandledMod13Requests).toEqual([]);
          expect(pageErrors).toEqual([]);
          await expect(
            dialog.getByRole('button', { name: 'Añadir interfaz', exact: true }),
          ).toBeEnabled();
        });
      }
    }
  });

  test('PENDING: teclado, foco restaurado, nombre accesible y axe sobre el detalle', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installMocks(page);
    await page.goto('/dashboard/network/routers');

    const openButton = page.getByRole('button', { name: 'Ver router', exact: true });
    await expect(openButton).toBeVisible();
    await openButton.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: router.name });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(router.name);
    await expect(page.getByRole('heading', { name: 'Información del router' })).toBeFocused();

    const closeButton = dialog.getByRole('button', { name: 'Cerrar' });
    const focusableControls = dialog.locator(
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    );
    const focusableCount = await focusableControls.count();
    expect(focusableCount).toBeGreaterThan(1);
    const closeBox = await closeButton.boundingBox();
    expect(closeBox?.width).toBeGreaterThanOrEqual(44);
    expect(closeBox?.height).toBeGreaterThanOrEqual(44);

    for (let index = 0; index < focusableCount; index += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
    const lastFocusable = focusableControls.last();
    await lastFocusable.focus();
    await expect(lastFocusable).toBeFocused();
    const addInterface = dialog.getByRole('button', { name: 'Añadir interfaz', exact: true });
    const addInterfaceBox = await addInterface.boundingBox();
    expect(addInterfaceBox?.height).toBeGreaterThanOrEqual(44);

    await page.keyboard.press('Tab');
    await expect(closeButton).toBeFocused();
    expect(await closeButton.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
    await page.keyboard.press('Shift+Tab');
    await expect(lastFocusable).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(openButton).toBeFocused();

    await openButton.focus();
    await page.keyboard.press('Enter');
    const reopened = page.getByRole('dialog', { name: router.name });
    await expect(reopened).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([]);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`PENDING ${theme}: el formulario de interfaz anuncia validación y pasa axe`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      const state = await installMocks(page);
      const dialog = await openRouterDetail(page, theme);

      await dialog.getByRole('button', { name: 'Añadir interfaz', exact: true }).click();
      const nameField = dialog.getByRole('textbox', { name: 'Nombre de la interfaz' });
      const kindField = dialog.getByLabel('Clase de interfaz');
      await dialog.getByRole('button', { name: 'Guardar interfaz', exact: true }).click();

      await expect(nameField).toHaveAttribute('aria-invalid', 'true');
      await expect(nameField).toHaveAttribute(
        'aria-describedby',
        'router-interface-create-name-error',
      );
      await expect(kindField).toHaveAttribute('aria-invalid', 'true');
      await expect(kindField).toHaveAttribute(
        'aria-describedby',
        'router-interface-create-kind-error',
      );
      await expect(dialog.getByRole('alert')).toHaveText('Selecciona una clase de interfaz.');
      expect(state.interfaceAddressMutationRequests).toBe(0);
      expect(state.unhandledMod13Requests).toEqual([]);

      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([]);
    });
  }

  test('pausa RESERVATIONS_PAUSED deshabilita reserva nueva en la consola de la OT', async ({
    page,
  }) => {
    const state = await installMocks(page, { reservationsPaused: true, initialProvisioning: null });
    await page.goto(`/dashboard/operations/execution-orders?executionOrderId=${ORDER_ID}`);

    const panel = page.locator('#execution-order-provisioning');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('status').filter({ hasText: 'Reservas pausadas' })).toBeVisible();
    const reserve = panel.getByRole('button', { name: 'Reservar dirección IP', exact: true });
    await expect(reserve).toBeDisabled();
    expect(state.reserveRequests).toBe(0);
    expect(state.unhandledMod13Requests).toEqual([]);
  });

  test('pausa RESERVATIONS_PAUSED conserva certificar/liberar en un servicio existente', async ({
    page,
  }) => {
    const state = await installMocks(page, {
      reservationsPaused: true,
      initialProvisioning: provisioningService,
    });
    await page.goto(`/dashboard/operations/execution-orders?executionOrderId=${ORDER_ID}`);

    const panel = page.locator('#execution-order-provisioning');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('status').filter({ hasText: 'Reservas pausadas' })).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Liberar servicio', exact: true }),
    ).toBeEnabled();
    const evidence = panel.getByRole('combobox', { name: 'Foto o documento para certificar' });
    await evidence.click();
    await page.getByRole('option', { name: /Foto ·/u }).click();
    const certify = panel.getByRole('button', {
      name: 'Certificar aprovisionamiento',
      exact: true,
    });
    await expect(certify).toBeEnabled();
    await certify.click();
    await expect(panel.getByText('Aprovisionamiento certificado.')).toBeVisible();
    expect(state.certifyRequests).toBe(1);
    await expect(
      panel.getByRole('button', { name: 'Liberar servicio', exact: true }),
    ).toBeEnabled();

    await panel.getByRole('button', { name: 'Liberar servicio', exact: true }).click();
    const releaseDialog = page.getByRole('dialog', { name: 'Liberar servicio técnico' });
    await expect(releaseDialog).toBeVisible();
    await releaseDialog.getByLabel('Motivo').fill('Liberación de prueba controlada.');
    await releaseDialog.getByRole('button', { name: 'Liberar servicio', exact: true }).click();
    await expect(panel.getByText('El servicio se liberó.')).toBeVisible();
    expect(state.releaseRequests).toBe(1);
    expect(state.reserveRequests).toBe(0);
    await expect(panel.getByRole('status').filter({ hasText: 'Reservas pausadas' })).toBeVisible();
    expect(state.unhandledMod13Requests).toEqual([]);
  });

  test('regularización queda bloqueada por metadato pausado y no emite POST', async ({ page }) => {
    const state = await installMocks(page, {
      reservationsPaused: true,
      queue: [closedInboxRow],
      initialProvisioning: null,
    });
    await page.goto('/dashboard/network/provisioning?queue=CLOSED_UNPROVISIONED');
    await page.getByRole('button', { name: 'Regularizar', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Regularizar OT-MOD13-E2E' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('status').filter({ hasText: 'Reservas pausadas' })).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Guardar regularización', exact: true }),
    ).toBeDisabled();
    expect(state.regularizeRequests).toBe(0);
    expect(state.unhandledMod13Requests).toEqual([]);
  });

  test('un 409 RESERVATIONS_PAUSED posterior bloquea la reserva y no muestra éxito', async ({
    page,
  }) => {
    const state = await installMocks(page, {
      reservationsPaused: false,
      reserveConflict: true,
      initialProvisioning: null,
    });
    await page.goto(`/dashboard/operations/execution-orders?executionOrderId=${ORDER_ID}`);

    const panel = page.locator('#execution-order-provisioning');
    const reserve = panel.getByRole('button', { name: 'Reservar dirección IP', exact: true });
    await expect(reserve).toBeVisible();
    await expect(reserve).toBeEnabled();
    await reserve.click();
    await expect(panel.getByRole('status').filter({ hasText: 'Reservas pausadas' })).toBeVisible();
    await expect(reserve).toBeDisabled();
    await expect(panel.getByText('Aprovisionamiento actualizado')).toHaveCount(0);
    expect(state.reserveRequests).toBe(1);
    expect(state.unhandledMod13Requests).toEqual([]);
  });

  test('metadata IPAM no disponible mantiene el registro local cerrado y anuncia error accionable', async ({
    page,
  }) => {
    await installMocks(page, { ipProtectionUnavailable: true });
    await page.goto(`/dashboard/network/routers?routerId=${ROUTER_ID}`);

    const dialog = page.getByRole('dialog', { name: router.name });
    await expect(
      dialog.getByRole('status').filter({ hasText: 'Protección sin verificar' }),
    ).toBeVisible();
    await expect(dialog.getByText(localAddress.addressWithPrefix)).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Ver direcciones (1)' }).click();
    await expect(dialog.getByText(localAddress.addressWithPrefix)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Añadir dirección', exact: true })).toHaveCount(
      0,
    );
    await expect(
      dialog.getByRole('button', { name: 'Corregir dirección', exact: true }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole('button', { name: 'Añadir interfaz', exact: true }),
    ).toBeEnabled();
  });
});
