/**
 * E2E — Inventario / SCM en el portal empresarial (MOD12 Fase 01 + Compras Fase 02 + Catálogo Fase 02).
 *
 * Cubre el ciclo focalizado con mocks HTTP alineados al contrato real de la API:
 * - Workspace de compras con KPIs, filtros y compositor con líneas
 * - Detalle de solicitud, aprobación, OC, consulta de líneas y recepción precargada
 * - Transferencia de stock y retorno operativo
 */

import { expect, test } from '@playwright/test';

const MOCK_TENANT_SLUG = 'tenant-inventory-demo';
const NOC_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_ID = 'item-001';
const CAT_CPE_ID = 'cat-cpe-001';
const LOC_MAIN = 'loc-001';
const LOC_TECH = 'loc-002';
const PR_SEED_ID = 'pr-seed-001';

function buildToken(): string {
  return (
    'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
    btoa(
      JSON.stringify({
        sub: NOC_USER_ID,
        email: 'hash-noc',
        role: 'NOC',
        tenantId: 'tenant-inventory-001',
        schemaName: 'tenant_inventory_001',
        jti: 'jti-noc-inventory',
        type: 'tenant',
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ) +
    '.fakesig'
  );
}

function nowIso(offsetMinutes = 0): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

async function seedPortalSession(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.evaluate(
    ({ token, slug }: { token: string; slug: string }) => {
      window.localStorage.setItem('iwana.portal.access-token', token);
      window.localStorage.setItem('iwana.portal.tenant-slug', slug);
    },
    { token: buildToken(), slug: MOCK_TENANT_SLUG },
  );
}

type InventoryMockState = {
  purchaseRequests: Array<Record<string, unknown>>;
  purchaseOrders: Array<Record<string, unknown>>;
  purchaseOrderLines: Array<Record<string, unknown>>;
  catalogItems: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  transferCount: number;
  returnCount: number;
};

function buildCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: CAT_CPE_ID,
    tenantId: 'tenant-inventory-001',
    code: 'CPE',
    name: 'CPE',
    description: 'Equipos en premisa del cliente',
    status: 'ACTIVE',
    sortOrder: 0,
    productCount: 1,
    createdAt: nowIso(-3000),
    updatedAt: nowIso(-3000),
    ...overrides,
  };
}

function buildCatalogItem(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    tenantId: 'tenant-inventory-001',
    sku: 'ONT-HG8245',
    name: 'ONT Huawei HG8245',
    description: 'ONT GPON para despliegue residencial',
    brand: 'Huawei',
    model: 'HG8245',
    itemKind: 'SERIALIZED',
    category: 'CPE',
    categoryId: CAT_CPE_ID,
    categoryName: 'CPE',
    categoryCode: 'CPE',
    trackingMode: 'SERIALIZED',
    unitOfMeasure: 'UND',
    baseCost: '185000',
    minimumStock: '5',
    purchasable: true,
    inventoryControlled: true,
    assetControlled: true,
    preferredSupplierRefId: 'party-001',
    supplierSku: 'SUP-ONT-HG',
    purchaseUnitOfMeasure: 'caja',
    purchaseToBaseUomFactor: '10',
    standardCost: '185000',
    lastPurchaseCost: null,
    reorderPoint: '5',
    targetStock: '12',
    minimumOrderQty: null,
    orderMultiple: null,
    leadTimeDays: 7,
    usefulLifeMonths: 36,
    commercialReferenceId: null,
    status: 'ACTIVE',
    createdAt: nowIso(-2000),
    updatedAt: nowIso(-2000),
    ...overrides,
  };
}

function buildPurchaseRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: PR_SEED_ID,
    tenantId: 'tenant-inventory-001',
    requestNumber: 'PR-000099',
    title: 'Reposición ONT aprobada',
    status: 'APPROVED',
    requestType: 'REPLENISHMENT',
    priority: 'NORMAL',
    requestedByUserId: NOC_USER_ID,
    requestingArea: 'Operaciones',
    justification: 'Reposición programada por consumo de campo',
    operationalRefType: null,
    operationalRefId: null,
    exceptionReason: null,
    approvedByUserId: NOC_USER_ID,
    neededByDate: '2026-07-01',
    notes: null,
    createdAt: nowIso(-5000),
    updatedAt: nowIso(-1000),
    ...overrides,
  };
}

function createInventoryMockState(): InventoryMockState {
  return {
    purchaseRequests: [buildPurchaseRequest()],
    purchaseOrders: [],
    purchaseOrderLines: [],
    catalogItems: [buildCatalogItem()],
    categories: [buildCategory()],
    transferCount: 0,
    returnCount: 0,
  };
}

async function setupInventoryMocks(
  page: import('@playwright/test').Page,
  state: InventoryMockState,
) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname.endsWith('/tenants/public-branding') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            displayName: 'ISP Inventario Demo',
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
        }),
      });
      return;
    }

    if (pathname.endsWith('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sub: NOC_USER_ID,
            email: 'hash-noc',
            role: 'NOC',
            tenantId: 'tenant-inventory-001',
            schemaName: 'tenant_inventory_001',
            jti: 'jti-noc-inventory',
            type: 'tenant',
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/tenants/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'tenant-inventory-001',
            name: 'ISP Inventario Demo',
            slug: MOCK_TENANT_SLUG,
            status: 'ACTIVE',
            contactEmail: 'tenant@inventory.local',
            brandingProductName: 'iWana Empresa',
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/inventory/dashboard') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          itemsCount: 12,
          locationsCount: 4,
          serializedAssetsCount: 28,
          balancesCount: 16,
          totalOnHand: 142,
        }),
      });
      return;
    }

    if (pathname.endsWith('/inventory/items/catalog/options') && method === 'GET') {
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const options = state.catalogItems
        .filter((item) => item.status === 'ACTIVE' && item.purchasable === true)
        .filter((item) => {
          if (!search) return true;
          return (
            String(item.sku).toLowerCase().includes(search) ||
            String(item.name).toLowerCase().includes(search)
          );
        })
        .map((item) => ({
          id: item.id,
          sku: item.sku,
          name: item.name,
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          categoryCode: item.categoryCode,
          category: item.category,
          itemKind: item.itemKind,
          unitOfMeasure: item.unitOfMeasure,
          purchaseUnitOfMeasure: item.purchaseUnitOfMeasure ?? null,
          standardCost: item.standardCost ?? item.baseCost,
          preferredSupplierRefId: item.preferredSupplierRefId ?? null,
          preferredSupplierName: item.preferredSupplierRefId ? 'Proveedor Demo' : null,
          supplierSku: item.supplierSku ?? null,
        }));

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(options),
      });
      return;
    }

    if (pathname.endsWith('/inventory/categories') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.categories),
      });
      return;
    }

    if (pathname.endsWith('/inventory/categories') && method === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const created = buildCategory({
        id: `cat-${state.categories.length + 1}`,
        code: body.code ?? `CAT-${state.categories.length + 1}`,
        name: body.name ?? 'Categoría nueva',
        description: body.description ?? null,
        status: body.status ?? 'ACTIVE',
        sortOrder: body.sortOrder ?? state.categories.length,
        productCount: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      state.categories.unshift(created);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }

    if (pathname.endsWith('/inventory/items') && method === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const categoryId = String(body.categoryId ?? CAT_CPE_ID);
      const category = state.categories.find((entry) => entry.id === categoryId);
      const created = buildCatalogItem({
        id: `item-${state.catalogItems.length + 1}`,
        sku: body.sku ?? `SKU-${state.catalogItems.length + 1}`,
        name: body.name ?? 'Artículo nuevo',
        categoryId,
        categoryName: category?.name ?? 'CPE',
        categoryCode: category?.code ?? 'CPE',
        purchasable: body.purchasable ?? true,
        status: body.status ?? 'ACTIVE',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      state.catalogItems.unshift(created);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }

    if (pathname.endsWith('/inventory/items') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.catalogItems),
      });
      return;
    }

    if (pathname.endsWith('/inventory/locations') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: LOC_MAIN,
            tenantId: 'tenant-inventory-001',
            code: 'BOD-01',
            name: 'Bodega principal',
            type: 'MAIN_WAREHOUSE',
            status: 'ACTIVE',
            responsibleRefId: null,
            maxCapacity: null,
            createdAt: nowIso(-3000),
            updatedAt: nowIso(-3000),
          },
          {
            id: LOC_TECH,
            tenantId: 'tenant-inventory-001',
            code: 'TEC-01',
            name: 'Custodia técnico',
            type: 'MOBILE_TECHNICIAN',
            status: 'ACTIVE',
            responsibleRefId: 'tech-001',
            maxCapacity: null,
            createdAt: nowIso(-2500),
            updatedAt: nowIso(-2500),
          },
        ]),
      });
      return;
    }

    if (pathname.endsWith('/inventory/assets') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'asset-001',
            tenantId: 'tenant-inventory-001',
            inventoryItemId: ITEM_ID,
            serialNumber: 'SN-001',
            normalizedSerialNumber: 'SN-001',
            macAddress: 'AA:BB:CC:DD:EE:01',
            normalizedMacAddress: 'AA:BB:CC:DD:EE:01',
            assetTag: null,
            currentStatus: 'AVAILABLE',
            currentLocationId: LOC_MAIN,
            currentResponsibleType: 'WAREHOUSE',
            currentResponsibleRefId: LOC_MAIN,
            subscriberRefId: null,
            contractRefId: null,
            purchaseOrderRef: null,
            purchaseDate: null,
            usefulLifeMonths: 36,
            warrantyUntil: null,
            createdAt: nowIso(-1000),
            updatedAt: nowIso(-1000),
          },
        ]),
      });
      return;
    }

    if (pathname.endsWith('/inventory/balances') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'bal-001',
            tenantId: 'tenant-inventory-001',
            itemId: ITEM_ID,
            locationId: LOC_MAIN,
            lotId: null,
            condition: 'NEW',
            quantityOnHand: '8',
            quantityReserved: '0',
            createdAt: nowIso(-1000),
            updatedAt: nowIso(-1000),
          },
        ]),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/requests') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.purchaseRequests),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/requests') && method === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const created = buildPurchaseRequest({
        id: `pr-${state.purchaseRequests.length + 1}`,
        requestNumber: `PR-${String(state.purchaseRequests.length + 1).padStart(4, '0')}`,
        title: body.title ?? 'Solicitud sin título',
        status: 'PENDING_QUOTES',
        requestType: body.requestType ?? 'REPLENISHMENT',
        priority: body.priority ?? 'NORMAL',
        requestingArea: body.requestingArea ?? 'Operaciones',
        justification: body.justification ?? 'Solicitud creada desde prueba E2E',
        neededByDate: body.neededByDate ?? null,
        notes: body.notes ?? null,
        approvedByUserId: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      state.purchaseRequests.unshift(created);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }

    const requestDetailMatch = pathname.match(/\/purchasing\/requests\/([^/]+)$/);
    if (requestDetailMatch && method === 'GET') {
      const requestId = requestDetailMatch[1];
      const request = state.purchaseRequests.find((item) => item.id === requestId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          request,
          lines: [],
          quotes: [],
          awards: [],
          orders: state.purchaseOrders.filter((order) => order.purchaseRequestId === requestId),
          estimatedAmount: 0,
          approvalPolicy: {
            canApprove:
              request?.status === 'PENDING_APPROVAL' ||
              (request?.requestType === 'URGENT_OPERATION' && Boolean(request?.exceptionReason)),
            requiresException: request?.requestType === 'URGENT_OPERATION',
            blockingReason:
              request?.requestType === 'URGENT_OPERATION' && !request?.exceptionReason
                ? 'Requiere excepción justificada'
                : null,
            approvalLevel: 'SUPERVISOR',
          },
        }),
      });
      return;
    }

    const providerListMatch = pathname.endsWith('/purchasing/providers') && method === 'GET';
    if (providerListMatch) {
      const search = url.searchParams.get('search') ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              partyRefId: 'party-001',
              displayName: 'Proveedor Demo',
              status: 'ACTIVE',
            },
          ].filter(
            (item) => !search || item.displayName.toLowerCase().includes(search.toLowerCase()),
          ),
          total: 1,
          page: 1,
          limit: 20,
        }),
      });
      return;
    }

    const providerSummaryMatch = pathname.match(/\/purchasing\/providers\/([^/]+)\/summary$/);
    if (providerSummaryMatch && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          partyRefId: providerSummaryMatch[1],
          displayName: 'Proveedor Demo',
          primaryContact: 'Contacto operativo',
          phone: '3001234567',
          email: 'proveedor@demo.test',
          city: 'Bogotá',
          status: 'Activo',
        }),
      });
      return;
    }

    const approveMatch = pathname.match(/\/purchasing\/requests\/([^/]+)\/approve$/);
    if (approveMatch && method === 'POST') {
      const requestId = approveMatch[1];
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const entry = state.purchaseRequests.find((item) => item.id === requestId);
      if (entry) {
        entry.status = 'APPROVED';
        if (body.exceptionReason) {
          entry.exceptionReason = body.exceptionReason;
        }
        entry.updatedAt = nowIso();
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(entry ?? {}),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/orders') && method === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const order = {
        id: `po-${state.purchaseOrders.length + 1}`,
        tenantId: 'tenant-inventory-001',
        orderNumber: `PO-${String(state.purchaseOrders.length + 1).padStart(4, '0')}`,
        purchaseRequestId: body.purchaseRequestId,
        partyRefId: body.partyRefId,
        status: 'APPROVED',
        expectedDeliveryDate: body.expectedDeliveryDate ?? null,
        approvedByUserId: NOC_USER_ID,
        notes: body.notes ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.purchaseOrders.push(order);

      const lines = (body.lines as Array<Record<string, unknown>> | undefined) ?? [];
      lines.forEach((line, index) => {
        state.purchaseOrderLines.push({
          id: `pol-${index + 1}`,
          tenantId: 'tenant-inventory-001',
          purchaseOrderId: order.id,
          itemId: line.itemId,
          purchaseRequestLineId: line.purchaseRequestLineId ?? null,
          quantity: String(line.quantity ?? '0'),
          unitCost: String(line.unitCost ?? '0'),
          receivedQuantity: '0',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(order),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/orders') && method === 'GET') {
      const purchaseRequestId = url.searchParams.get('purchaseRequestId');
      const filtered = purchaseRequestId
        ? state.purchaseOrders.filter((order) => order.purchaseRequestId === purchaseRequestId)
        : state.purchaseOrders;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(filtered),
      });
      return;
    }

    const orderDetailMatch = pathname.match(/\/purchasing\/orders\/([^/]+)$/);
    if (orderDetailMatch && method === 'GET') {
      const orderId = orderDetailMatch[1];
      const order = state.purchaseOrders.find((entry) => entry.id === orderId);
      const lines = state.purchaseOrderLines.filter((line) => line.purchaseOrderId === orderId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...(order ?? {}), lines }),
      });
      return;
    }

    const receiptMatch = pathname.match(/\/purchasing\/orders\/([^/]+)\/receipts$/);
    if (receiptMatch && method === 'POST') {
      const orderId = receiptMatch[1];
      const receipt = {
        receipt: {
          id: 'gr-001',
          tenantId: 'tenant-inventory-001',
          receiptNumber: 'GR-000001',
          purchaseOrderId: orderId,
          status: 'COMPLETED',
          receivedAt: nowIso(),
          receivedByUserId: NOC_USER_ID,
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
        movement: {
          id: 'mov-001',
          tenantId: 'tenant-inventory-001',
          movementNumber: 'MOV-000001',
          origin: 'PURCHASE_RECEIPT',
          originContext: 'purchasing.receipt',
          originRefId: 'gr-001',
          idempotencyKey: 'receipt-001',
          notes: null,
          actorUserId: NOC_USER_ID,
          reversedByMovementId: null,
          isReversal: false,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
        lines: [],
      };

      state.purchaseOrderLines.forEach((line) => {
        if (line.purchaseOrderId === orderId) {
          line.receivedQuantity = line.quantity;
        }
      });

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(receipt),
      });
      return;
    }

    if (pathname.endsWith('/inventory/transfers') && method === 'POST') {
      state.transferCount += 1;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          movement: {
            id: 'mov-transfer',
            movementNumber: 'MOV-000010',
            origin: 'TRANSFER',
          },
          lines: [],
        }),
      });
      return;
    }

    if (pathname.endsWith('/inventory/returns') && method === 'POST') {
      state.returnCount += 1;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          movement: {
            id: 'mov-return',
            movementNumber: 'MOV-000011',
            origin: 'RETURN',
          },
          lines: [],
        }),
      });
      return;
    }

    await route.continue();
  });
}

test.describe('Portal Inventario / SCM', () => {
  test.beforeEach(async ({ page }) => {
    const state = createInventoryMockState();
    await setupInventoryMocks(page, state);
    await seedPortalSession(page);
    (page as unknown as { inventoryMockState: InventoryMockState }).inventoryMockState = state;
  });

  test('crea producto comprable en catalogo y lo usa en solicitud de compra', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;

    await page.goto('/dashboard/inventory');
    const main = page.locator('main');

    await main.getByRole('tab', { name: 'Catálogo' }).click();
    await expect(main.getByText('Catálogo operativo')).toBeVisible();

    await main.getByRole('button', { name: 'Nuevo producto' }).click();
    const drawer = page.getByRole('dialog');
    await drawer.getByLabel('SKU').fill('PATCH-24');
    await drawer.getByLabel('Nombre').fill('Patch cord 24m');
    await drawer.getByRole('button', { name: 'Crear producto' }).click();

    await expect(main.getByText('PATCH-24')).toBeVisible();

    await main.getByRole('tab', { name: 'Compras' }).click();
    await main.getByLabel('Título').fill('Compra patch cord');
    await main.getByLabel('Área solicitante').fill('Operaciones');
    await main.getByLabel('Buscar producto').fill('PATCH-24');
    await main.getByRole('combobox', { name: 'Producto del catálogo' }).click();
    await page.getByRole('option', { name: /PATCH-24/i }).click();
    await main
      .getByLabel('Justificación')
      .fill('Reposición de patch cords para cuadrillas de campo');
    await main.getByRole('button', { name: 'Crear solicitud' }).click();

    await expect(main.getByText('PR-0002')).toBeVisible();
    expect(state.catalogItems.some((item) => item.sku === 'PATCH-24')).toBe(true);
  });

  test('crea categoria, producto y lo usa en solicitud de compra', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;

    await page.goto('/dashboard/inventory');
    const main = page.locator('main');

    await main.getByRole('tab', { name: 'Catálogo' }).click();
    await main.getByRole('button', { name: 'Categorías' }).click();
    await main.getByRole('button', { name: 'Nueva categoría' }).click();

    const categoryDrawer = page.getByRole('dialog');
    await categoryDrawer.getByLabel('Código').fill('FIBER');
    await categoryDrawer.getByLabel('Nombre').fill('Fibra óptica');
    await categoryDrawer.getByRole('button', { name: 'Crear categoría' }).click();

    await expect(main.getByText('Fibra óptica')).toBeVisible();

    const createdCategory = state.categories.find((category) => category.code === 'FIBER');
    expect(createdCategory).toBeDefined();

    await main.getByRole('button', { name: 'Productos' }).click();
    await main.getByRole('button', { name: 'Nuevo producto' }).click();

    const productDrawer = page.getByRole('dialog');
    await productDrawer.getByLabel('SKU').fill('FOC-12');
    await productDrawer.getByLabel('Nombre').fill('Cable fibra 12 hilos');
    await productDrawer.locator('select').filter({ hasText: 'Fibra óptica' }).selectOption({
      label: 'Fibra óptica',
    });
    await productDrawer.getByRole('button', { name: 'Crear producto' }).click();

    await expect(main.getByText('FOC-12')).toBeVisible();

    await main.getByRole('tab', { name: 'Compras' }).click();
    await main.getByLabel('Título').fill('Compra fibra proyecto norte');
    await main.getByLabel('Área solicitante').fill('Ingeniería');
    await main.getByLabel('Buscar producto').fill('FOC-12');
    await main.getByRole('combobox', { name: 'Producto del catálogo' }).click();
    await page.getByRole('option', { name: /FOC-12/i }).click();
    await main
      .getByLabel('Justificación')
      .fill('Material de fibra para ampliación de red troncal en zona norte');
    await main.getByRole('button', { name: 'Crear solicitud' }).click();

    await expect(main.getByText('PR-0002')).toBeVisible();
    expect(state.catalogItems.some((item) => item.sku === 'FOC-12')).toBe(true);
    expect(state.catalogItems.find((item) => item.sku === 'FOC-12')?.categoryName).toBe(
      'Fibra óptica',
    );
  });

  test('muestra workspace de compras y permite crear solicitud con líneas', async ({ page }) => {
    await page.goto('/dashboard/inventory');

    const main = page.locator('main');
    await expect(main.getByRole('heading', { name: 'Inventario', level: 1 })).toBeVisible();
    await expect(main.getByText('12', { exact: true })).toBeVisible();

    await main.getByRole('tab', { name: 'Compras' }).click();
    await expect(main.getByText('Resumen de compras')).toBeVisible();
    await expect(main.getByText('Por cotizar')).toBeVisible();

    await main.getByLabel('Título').fill('Compra ONT marzo');
    await main.getByLabel('Área solicitante').fill('Operaciones');
    await main
      .getByLabel('Justificación')
      .fill('Reposición programada por consumo de campo en zona norte');
    await main.getByRole('button', { name: 'Crear solicitud' }).click();

    await expect(main.getByText('PR-0002')).toBeVisible();
  });

  test('navega entre pestañas de bodegas y activos', async ({ page }) => {
    await page.goto('/dashboard/inventory');
    const main = page.locator('main');

    await main.getByRole('tab', { name: 'Bodegas' }).click();
    await expect(main.getByText('BOD-01')).toBeVisible();

    await main.getByRole('tab', { name: 'Activos' }).click();
    await expect(main.getByText('SN-001')).toBeVisible();
    await expect(main.getByText('Disponible')).toBeVisible();
  });

  test('completa OC, recepción precargada, transferencia y retorno', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;

    await page.goto('/dashboard/inventory');
    const main = page.locator('main');

    await main.getByRole('tab', { name: 'Compras' }).click();
    await main.getByRole('button', { name: 'Abrir' }).first().click();

    const workbench = page.getByRole('dialog').filter({ hasText: 'Trabajar solicitud' });
    await expect(workbench.getByRole('heading', { name: 'Trabajar solicitud' })).toBeVisible();
    await workbench.getByRole('button', { name: 'Ir a órdenes' }).click();
    await workbench.getByRole('button', { name: 'Generar orden de compra' }).click();

    const orderDrawer = page.getByRole('dialog').filter({ hasText: 'Orden de compra' });
    await expect(orderDrawer.getByRole('heading', { name: 'Orden de compra' })).toBeVisible();
    await orderDrawer.getByLabel('Proveedor').fill('Demo');
    await orderDrawer.getByRole('option', { name: /Proveedor Demo/i }).click();

    const itemSelect = orderDrawer.getByRole('combobox', { name: 'Ítem' });
    await itemSelect.click();
    await page.getByRole('option', { name: /ONT Huawei HG8245/i }).click();

    await orderDrawer.getByRole('button', { name: 'Generar OC' }).click();

    await expect(workbench.getByRole('tab', { name: 'Recepciones' })).toBeVisible();
    await expect(workbench.getByText('Línea de OC')).toBeVisible();
    await expect(
      workbench.getByRole('paragraph').filter({ hasText: 'ONT-HG8245 · ONT Huawei HG8245' }),
    ).toBeVisible();
    await expect(workbench.getByLabel('Id línea OC')).toHaveCount(0);

    await workbench
      .locator('label')
      .filter({ hasText: 'Ubicación destino' })
      .locator('select')
      .selectOption(LOC_MAIN);
    await workbench.getByRole('button', { name: 'Registrar recepción' }).click();
    await expect(workbench.getByText('Recepción GR-000001 registrada')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await main.getByRole('tab', { name: 'Bodegas' }).click();
    await main.getByRole('button', { name: 'Transferir stock' }).click();
    await page.getByRole('heading', { name: 'Transferir stock' }).waitFor();

    const transferDialog = page.getByRole('dialog');
    await transferDialog.locator('select').nth(0).selectOption(ITEM_ID);
    await transferDialog.locator('select').nth(1).selectOption(LOC_MAIN);
    await transferDialog.locator('select').nth(2).selectOption(LOC_TECH);
    await transferDialog.getByRole('button', { name: 'Registrar transferencia' }).click();

    await expect(main.getByText('Transferencia registrada en MOV-000010.')).toBeVisible();

    await main.getByRole('tab', { name: 'Movimientos' }).click();
    await main.getByRole('combobox', { name: 'Ítem' }).nth(1).selectOption(ITEM_ID);
    await main.getByRole('combobox', { name: 'Origen' }).selectOption(LOC_TECH);
    await main.getByRole('combobox', { name: 'Destino', exact: true }).selectOption(LOC_MAIN);
    await main.getByRole('button', { name: 'Registrar retorno' }).click();

    await expect(main.getByText('Retorno registrado en MOV-000011.')).toBeVisible();
    expect(state.transferCount).toBe(1);
    expect(state.returnCount).toBe(1);
  });

  test('crea solicitud de proyecto con varias líneas', async ({ page }) => {
    await page.goto('/dashboard/inventory');
    const main = page.locator('main');

    await main.getByRole('tab', { name: 'Compras' }).click();
    await main.getByLabel('Título').fill('Proyecto ampliación red');
    await main.getByLabel('Área solicitante').fill('Ingeniería');
    await main.locator('#purchase-type').click();
    await page.getByRole('option', { name: 'Proyecto' }).click();
    await main
      .getByLabel('Justificación')
      .fill('Adquisición de materiales para ampliación de red en zona norte del municipio');
    await main.getByRole('button', { name: 'Agregar línea' }).click();
    await main.getByRole('button', { name: 'Crear solicitud' }).click();

    await expect(main.getByText('PR-0002')).toBeVisible();
  });

  test('aprueba urgencia operativa con excepción justificada', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;
    state.purchaseRequests.unshift(
      buildPurchaseRequest({
        id: 'pr-urgent-1',
        requestNumber: 'PR-000200',
        title: 'Cable de fibra urgente',
        status: 'PENDING_APPROVAL',
        requestType: 'URGENT_OPERATION',
        priority: 'URGENT',
        requestingArea: 'Operaciones',
        justification: 'Rotura de fibra que afecta servicio en sector norte',
      }),
    );

    await page.goto('/dashboard/inventory');
    const main = page.locator('main');
    await main.getByRole('tab', { name: 'Compras' }).click();
    await main.getByRole('button', { name: 'Abrir' }).first().click();

    const workbench = page.getByRole('dialog');
    await expect(workbench.getByText('Cable de fibra urgente')).toBeVisible();
    await workbench.getByRole('tab', { name: 'Aprobación' }).click();
    await workbench
      .getByLabel('Motivo de excepción')
      .fill('Falla crítica en red troncal sin stock disponible');
    await workbench.getByRole('button', { name: 'Aprobar solicitud' }).click();

    await expect(main.getByRole('cell', { name: 'Aprobada', exact: true })).toBeVisible();
  });
});
