/**
 * E2E — Inventario / SCM en el portal empresarial (MOD12 Fase 01 + Compras Fase 02 + Catálogo Fase 02).
 *
 * Cubre el ciclo focalizado con mocks HTTP alineados al contrato real de la API:
 * - Workspace de compras con KPIs, filtros y compositor con líneas
 * - Detalle de solicitud, aprobación, OC, consulta de líneas y recepción precargada
 * - Transferencia de stock y retorno operativo
 */

import { expect, test } from '@playwright/test';

const LOCATION_TYPE_PREFIXES: Record<string, string> = {
  MAIN_WAREHOUSE: 'BOD',
  MOBILE_TECHNICIAN: 'MOV',
  MOBILE_CREW: 'CRW',
  CUSTOMER_SITE: 'CLI',
  OFFICE_STOCK: 'OFI',
  NODE_STOCK: 'NOD',
  QUARANTINE: 'CUA',
  REPAIR: 'REP',
  SCRAP: 'SCR',
  INTERNAL_CONSUMPTION: 'INT',
};

function resolveNextLocationCodeInMock(existingCodes: string[], type: string): string {
  const prefix = LOCATION_TYPE_PREFIXES[type] ?? 'BOD';
  const pattern = new RegExp(`^${prefix}-(\\d{3})$`);
  let maxSequence = 0;

  for (const code of existingCodes) {
    const match = code.match(pattern);
    if (match) {
      maxSequence = Math.max(maxSequence, Number.parseInt(match[1] ?? '0', 10));
    }
  }

  return `${prefix}-${String(maxSequence + 1).padStart(3, '0')}`;
}

const MOCK_TENANT_SLUG = 'tenant-inventory-demo';
const NOC_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_ID = 'item-001';
const ITEM_CONSUMABLE_ID = 'item-002';
const CAT_CPE_ID = 'cat-cpe-001';
const LOC_MAIN = 'loc-001';
const LOC_TECH = 'loc-002';
const LOC_MOBILE_CAPPED = 'loc-003';
const MOBILE_RESPONSIBLE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MOBILE_RESPONSIBLE_NAME = 'Carlos Garzón';
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

async function openPurchaseComposer(main: import('@playwright/test').Locator) {
  await main.getByRole('tab', { name: 'Compras' }).click();
  await main.getByRole('button', { name: 'Nueva solicitud' }).click();
  await expect(main.getByText('Nueva solicitud de compra')).toBeVisible();
}

async function addCatalogProductToDraft(
  main: import('@playwright/test').Locator,
  productPattern: RegExp,
) {
  await main.getByRole('tab', { name: /^Catalogo/i }).click();
  await main.getByRole('checkbox', { name: productPattern }).check();
  await main.getByRole('button', { name: /Agregar 1 producto/i }).click();
}

async function fillStockTransferDialog(
  page: import('@playwright/test').Page,
  dialog: import('@playwright/test').Locator,
  options: {
    itemLabel: string;
    originLabel: string;
    destinationLabel: string;
    serialNumber?: string;
  },
) {
  await selectComboboxOption(
    page,
    dialog.getByRole('combobox', { name: 'Ítem' }),
    options.itemLabel,
  );
  await selectComboboxOption(
    page,
    dialog.getByRole('combobox', { name: 'Bodega origen' }),
    options.originLabel,
  );
  await selectComboboxOption(
    page,
    dialog.getByRole('combobox', { name: 'Custodia del técnico' }),
    options.destinationLabel,
  );
  if (options.serialNumber) {
    await dialog.getByLabel('Serial').fill(options.serialNumber);
  }
}

async function selectComboboxOption(
  page: import('@playwright/test').Page,
  combobox: import('@playwright/test').Locator,
  optionLabel: string,
) {
  await combobox.click();
  await page.getByRole('option', { name: optionLabel }).click();
}

type InventoryMockState = {
  purchaseRequests: Array<Record<string, unknown>>;
  purchaseOrders: Array<Record<string, unknown>>;
  purchaseOrderLines: Array<Record<string, unknown>>;
  catalogItems: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  locations: Array<Record<string, unknown>>;
  balances: Array<Record<string, unknown>>;
  stockIssues: Array<Record<string, unknown>>;
  stockIssueLines: Array<Record<string, unknown>>;
  stockIssueDispatchCount: number;
  transferCount: number;
  returnCount: number;
};

function buildCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: CAT_CPE_ID,
    tenantId: 'tenant-inventory-001',
    code: 'CPE',
    codePrefix: 'CPE',
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

function buildLocation(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function buildBalance(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function buildTenantUser(overrides: Record<string, unknown> = {}) {
  return {
    id: MOBILE_RESPONSIBLE_ID,
    email: 'carlos.garzon@inventory.local',
    role: 'TECHNICIAN',
    status: 'ACTIVE',
    tenantId: 'tenant-inventory-001',
    mfaEnabled: false,
    mfaRequired: false,
    isOperationalResource: true,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: nowIso(-4000),
    updatedAt: nowIso(-4000),
    deletedAt: null,
    firstName: 'Carlos',
    lastName: 'Garzón',
    phone: null,
    jobTitle: 'Técnico de campo',
    documentType: null,
    documentNumber: null,
    avatarUrl: null,
    ...overrides,
  };
}

function buildTenantUsersList() {
  return [
    buildTenantUser(),
    buildTenantUser({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana.perez@inventory.local',
    }),
  ];
}

function createInventoryMockState(): InventoryMockState {
  return {
    purchaseRequests: [buildPurchaseRequest()],
    purchaseOrders: [],
    purchaseOrderLines: [],
    catalogItems: [
      buildCatalogItem(),
      buildCatalogItem({
        id: ITEM_CONSUMABLE_ID,
        sku: 'CAB-DROP',
        name: 'Cable drop',
        itemKind: 'CONSUMABLE',
        trackingMode: 'CONSUMABLE',
      }),
    ],
    categories: [buildCategory()],
    locations: [
      buildLocation(),
      buildLocation({
        id: LOC_TECH,
        code: 'TEC-01',
        name: 'Custodia técnico',
        type: 'MOBILE_TECHNICIAN',
        responsibleRefId: MOBILE_RESPONSIBLE_ID,
        maxCapacity: null,
        createdAt: nowIso(-2500),
        updatedAt: nowIso(-2500),
      }),
      buildLocation({
        id: LOC_MOBILE_CAPPED,
        code: 'MOV-03',
        name: 'Móvil con tope',
        type: 'MOBILE_TECHNICIAN',
        responsibleRefId: MOBILE_RESPONSIBLE_ID,
        maxCapacity: '5',
        createdAt: nowIso(-2400),
        updatedAt: nowIso(-2400),
      }),
    ],
    balances: [
      buildBalance(),
      buildBalance({
        id: 'bal-002',
        locationId: LOC_MOBILE_CAPPED,
        quantityOnHand: '4.5',
      }),
      buildBalance({
        id: 'bal-003',
        itemId: ITEM_CONSUMABLE_ID,
        quantityOnHand: '8',
      }),
    ],
    stockIssues: [],
    stockIssueLines: [],
    stockIssueDispatchCount: 0,
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

    if (pathname.endsWith('/users') && method === 'GET') {
      const users = buildTenantUsersList();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            data: users,
            meta: { nextCursor: null, total: users.length },
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
          balancesByLocation: [
            {
              locationId: LOC_MAIN,
              locationCode: 'BOD-01',
              locationName: 'Bodega principal',
              totalOnHand: 8,
              uniqueItems: 1,
            },
          ],
          balancesByCategory: [
            {
              categoryId: CAT_CPE_ID,
              categoryCodePrefix: 'CPE',
              categoryName: 'CPE',
              totalOnHand: 8,
              uniqueItems: 1,
            },
          ],
          serializedAssetsByStatus: [
            {
              status: 'AVAILABLE',
              count: 1,
            },
          ],
          serializedAssetsByResponsibleType: [
            {
              responsibleType: 'WAREHOUSE',
              count: 1,
            },
          ],
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
      const codePrefix = String(
        body.codePrefix ?? String(body.code ?? `CAT${state.categories.length + 1}`).slice(0, 3),
      ).toUpperCase();
      const code = String(body.code ?? codePrefix);
      const created = buildCategory({
        id: `cat-${state.categories.length + 1}`,
        code,
        codePrefix,
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
        body: JSON.stringify(state.locations),
      });
      return;
    }

    if (pathname.endsWith('/inventory/locations') && method === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const type = typeof body.type === 'string' ? body.type : 'MAIN_WAREHOUSE';
      const manualCode = typeof body.code === 'string' ? body.code.trim() : '';
      const code =
        manualCode.length > 0
          ? manualCode
          : resolveNextLocationCodeInMock(
              state.locations.map((location) => String(location.code ?? '')),
              type,
            );
      const created = buildLocation({
        id: `loc-${state.locations.length + 1}`,
        code,
        name: body.name ?? 'Bodega nueva',
        type,
        status: body.status ?? 'ACTIVE',
        responsibleRefId: body.responsibleRefId ?? null,
        maxCapacity: body.maxCapacity ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      state.locations.unshift(created);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }

    const locationUpdateMatch = pathname.match(/\/inventory\/locations\/([^/]+)$/);
    if (locationUpdateMatch && method === 'PATCH') {
      const locationId = locationUpdateMatch[1];
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const entry = state.locations.find((item) => item.id === locationId);
      if (!entry) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        return;
      }

      if (body.name !== undefined) entry.name = body.name;
      if (body.status !== undefined) entry.status = body.status;
      if (body.responsibleRefId !== undefined) entry.responsibleRefId = body.responsibleRefId;
      if (body.maxCapacity !== undefined) entry.maxCapacity = body.maxCapacity;
      entry.updatedAt = nowIso();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(entry),
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
        body: JSON.stringify(state.balances),
      });
      return;
    }

    if (pathname.endsWith('/inventory/issues') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.stockIssues),
      });
      return;
    }

    if (pathname.endsWith('/inventory/issues') && method === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const id = `issue-${String(state.stockIssues.length + 1).padStart(3, '0')}`;
      const created = {
        id,
        tenantId: 'tenant-inventory-001',
        type: body.type ?? 'TECHNICIAN_CUSTODY',
        status: 'APPROVED',
        sourceLocationId: body.sourceLocationId ?? LOC_MAIN,
        destinationLocationId: body.destinationLocationId ?? LOC_TECH,
        destinationRefId: body.destinationRefId ?? null,
        originRefId: body.originRefId ?? null,
        commercialRefId: body.commercialRefId ?? null,
        reason: body.reason ?? null,
        costCenter: body.costCenter ?? null,
        handoffMethod: null,
        handoffNotes: null,
        handoffAttachments: null,
        createdByUserId: NOC_USER_ID,
        dispatchedByUserId: null,
        closedAt: null,
        stockMovementId: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.stockIssues.unshift(created);

      const lines = (body.lines as Array<Record<string, unknown>> | undefined) ?? [];
      lines.forEach((line, index) => {
        state.stockIssueLines.push({
          id: `${id}-line-${index + 1}`,
          tenantId: 'tenant-inventory-001',
          issueId: id,
          itemId: line.itemId ?? ITEM_ID,
          requestedQty: String(line.requestedQty ?? '1.00'),
          dispatchedQty: null,
          lotId: line.lotId ?? null,
          serializedAssetId: line.serializedAssetId ?? null,
          condition: line.condition ?? 'NEW',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ...created,
          lines: state.stockIssueLines.filter((line) => line.issueId === id),
        }),
      });
      return;
    }

    const issueDetailMatch = pathname.match(/\/inventory\/issues\/([^/]+)$/);
    if (issueDetailMatch && method === 'GET') {
      const issueId = issueDetailMatch[1];
      const issue = state.stockIssues.find((entry) => entry.id === issueId);
      const lines = state.stockIssueLines.filter((line) => line.issueId === issueId);
      await route.fulfill({
        status: issue ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(issue ? { ...issue, lines } : {}),
      });
      return;
    }

    const issueDispatchMatch = pathname.match(/\/inventory\/issues\/([^/]+)\/dispatch$/);
    if (issueDispatchMatch && method === 'POST') {
      const issueId = issueDispatchMatch[1];
      const issue = state.stockIssues.find((entry) => entry.id === issueId);
      if (!issue) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        return;
      }
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const destination = state.locations.find(
        (location) => location.id === issue.destinationLocationId,
      );
      const lines = state.stockIssueLines.filter((line) => line.issueId === issueId);

      // Validación mock: saldo disponible en origen por item.
      for (const line of lines) {
        const requested = Number.parseFloat(String(line.requestedQty ?? '0'));
        const available = state.balances
          .filter(
            (bal) =>
              bal.locationId === issue.sourceLocationId &&
              bal.itemId === line.itemId &&
              (bal.lotId ?? null) === (line.lotId ?? null),
          )
          .reduce((total, bal) => total + Number.parseFloat(String(bal.quantityOnHand ?? '0')), 0);

        if (available < requested) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              message: 'La cantidad solicitada excede el saldo disponible en la ubicación origen.',
            }),
          });
          return;
        }
      }

      // Validación mock: capacidad de bodegas móviles.
      if (destination && ['MOBILE_TECHNICIAN', 'MOBILE_CREW'].includes(String(destination.type))) {
        const maxCapacityRaw = destination.maxCapacity;
        if (maxCapacityRaw != null) {
          const maxCapacity = Number.parseFloat(String(maxCapacityRaw));
          const currentOnHand = state.balances
            .filter((bal) => bal.locationId === destination.id)
            .reduce(
              (total, bal) => total + Number.parseFloat(String(bal.quantityOnHand ?? '0')),
              0,
            );
          const incoming = lines.reduce(
            (total, line) => total + Number.parseFloat(String(line.requestedQty ?? '0')),
            0,
          );
          if (currentOnHand + incoming > maxCapacity) {
            await route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({
                message: 'La bodega móvil destino supera su capacidad máxima.',
              }),
            });
            return;
          }
        }
      }

      issue.status = 'DISPATCHED';
      issue.dispatchedByUserId = NOC_USER_ID;
      issue.handoffMethod = body.handoffMethod ?? 'ACTA';
      issue.handoffNotes = body.handoffNotes ?? null;
      issue.stockMovementId = issue.stockMovementId ?? `mov-issue-${issueId}`;
      issue.closedAt = nowIso();
      issue.updatedAt = nowIso();

      state.stockIssueLines.forEach((line) => {
        if (line.issueId === issueId) {
          line.dispatchedQty = line.requestedQty;
        }
      });
      state.stockIssueDispatchCount += 1;

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...issue, lines }),
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
    await drawer.getByLabel('Nombre').fill('Patch cord 24m');
    await drawer.getByRole('button', { name: 'Crear producto' }).click();

    await expect(main.getByText('Patch cord 24m')).toBeVisible();

    await openPurchaseComposer(main);
    await addCatalogProductToDraft(main, /Seleccionar .* - Patch cord 24m/i);
    await main.getByLabel('Título').fill('Compra patch cord');
    await main.getByLabel('Área solicitante').fill('Operaciones');
    await main
      .getByLabel('Justificacion')
      .fill('Reposición de patch cords para cuadrillas de campo');
    await main.getByRole('button', { name: 'Crear solicitud' }).click();

    await expect(main.getByText('PR-0002')).toBeVisible();
    expect(state.catalogItems.some((item) => item.name === 'Patch cord 24m')).toBe(true);
  });

  test('crea categoria, producto y lo usa en solicitud de compra', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;

    await page.goto('/dashboard/inventory');
    const main = page.locator('main');

    await main.getByRole('tab', { name: 'Catálogo' }).click();
    await main.getByRole('tab', { name: 'Categorías' }).click();
    await main.getByRole('button', { name: 'Nueva categoría' }).click();

    const categoryDrawer = page.getByRole('dialog');
    await categoryDrawer.getByLabel('Nombre').fill('Fibra óptica');
    await categoryDrawer.getByLabel('Prefijo de producto').fill('FIB');
    await categoryDrawer.getByRole('button', { name: 'Crear categoría' }).click();

    await expect(main.getByText('Fibra óptica')).toBeVisible();

    const createdCategory = state.categories.find((category) => category.name === 'Fibra óptica');
    expect(createdCategory).toBeDefined();

    await main.getByRole('tab', { name: 'Productos' }).click();
    await main.getByRole('button', { name: 'Nuevo producto' }).click();

    const productDrawer = page.getByRole('dialog');
    await productDrawer.getByLabel('Nombre').fill('Cable fibra 12 hilos');
    await selectComboboxOption(
      page,
      productDrawer.getByRole('combobox', { name: 'Categoría' }),
      'Fibra óptica',
    );
    await productDrawer.getByRole('button', { name: 'Crear producto' }).click();

    await expect(main.getByText('Cable fibra 12 hilos')).toBeVisible();

    await openPurchaseComposer(main);
    await addCatalogProductToDraft(main, /Seleccionar .* - Cable fibra 12 hilos/i);
    await main.getByLabel('Título').fill('Compra fibra proyecto norte');
    await main.getByLabel('Área solicitante').fill('Ingeniería');
    await main
      .getByLabel('Justificacion')
      .fill('Material de fibra para ampliación de red troncal en zona norte');
    await main.getByRole('button', { name: 'Crear solicitud' }).click();

    await expect(main.getByText('PR-0002')).toBeVisible();
    expect(state.catalogItems.some((item) => item.name === 'Cable fibra 12 hilos')).toBe(true);
    expect(
      state.catalogItems.find((item) => item.name === 'Cable fibra 12 hilos')?.categoryName,
    ).toBe('Fibra óptica');
  });

  test('muestra workspace de compras y permite crear solicitud con líneas', async ({ page }) => {
    await page.goto('/dashboard/inventory');

    const main = page.locator('main');
    await expect(main.getByRole('heading', { name: 'Inventario', level: 1 })).toBeVisible();
    await expect(main.getByText('12', { exact: true })).toBeVisible();

    await main.getByRole('tab', { name: 'Compras' }).click();
    await expect(main.getByText('Resumen de compras')).toBeVisible();
    await expect(main.getByText('Por cotizar')).toBeVisible();

    await main.getByRole('button', { name: 'Nueva solicitud' }).click();
    await addCatalogProductToDraft(main, /Seleccionar ONT-HG8245 - ONT Huawei HG8245/i);
    await main.getByLabel('Título').fill('Compra ONT marzo');
    await main.getByLabel('Área solicitante').fill('Operaciones');
    await main
      .getByLabel('Justificacion')
      .fill('Reposición programada por consumo de campo en zona norte');
    await main.getByRole('button', { name: 'Crear solicitud' }).click();

    await expect(main.getByText('PR-0002')).toBeVisible();
  });

  test('navega entre pestañas de bodegas y activos', async ({ page }) => {
    await page.goto('/dashboard/inventory');
    const main = page.locator('main');

    await main.getByRole('tab', { name: 'Bodegas' }).click();
    await expect(main.getByText('BOD-01')).toBeVisible();

    await main.getByRole('tab', { name: 'Salidas' }).click();
    await expect(main.getByRole('heading', { name: 'Salidas' })).toBeVisible();

    await main.getByRole('tab', { name: 'Activos' }).click();
    await expect(main.getByText('SN-001')).toBeVisible();
    await expect(main.getByText('Disponible')).toBeVisible();
  });

  test('crea salida a técnico y despacha generando movimiento', async ({ page }) => {
    await page.goto('/dashboard/inventory');
    const main = page.locator('main');

    await main.getByRole('tab', { name: 'Salidas' }).click();
    await expect(main.getByRole('heading', { name: 'Salidas' })).toBeVisible();

    await main.getByRole('button', { name: 'Crear salida' }).click();
    const dialog = page.getByRole('dialog', { name: 'Crear salida' });
    await expect(dialog).toBeVisible();

    await dialog.locator('select').first().selectOption('TECHNICIAN_CUSTODY');
    await dialog.locator('select').nth(1).selectOption(LOC_MAIN);
    await dialog.locator('select').nth(2).selectOption(LOC_TECH);
    await dialog.locator('select').nth(3).selectOption(ITEM_ID);
    await dialog.getByLabel('Cantidad').fill('1');
    await dialog.getByRole('button', { name: 'Crear salida' }).click();

    await expect(
      main.getByText('Salida creada. Puedes despacharla cuando esté lista.'),
    ).toBeVisible();

    await main.getByRole('button', { name: 'Ver' }).first().click();
    const detail = page.getByRole('dialog', { name: 'Detalle de salida' });
    await expect(detail).toBeVisible();
    await detail.getByLabel('Método de entrega').fill('ACTA');
    await detail.getByRole('button', { name: 'Confirmar despacho' }).click();

    await expect(main.getByText(/Salida despachada\./i)).toBeVisible();
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

    await main.getByRole('tab', { name: 'Salidas' }).click();
    await expect(main.getByRole('heading', { name: 'Salidas' })).toBeVisible();

    await main.getByRole('button', { name: 'Crear salida' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Crear salida' });
    await expect(createDialog).toBeVisible();
    await createDialog.locator('select').first().selectOption('TECHNICIAN_CUSTODY');
    await createDialog.locator('select').nth(1).selectOption(LOC_MAIN);
    await createDialog.locator('select').nth(2).selectOption(LOC_TECH);
    await createDialog.locator('select').nth(3).selectOption(ITEM_ID);
    await createDialog.getByLabel('Cantidad').fill('1');
    await createDialog.getByRole('button', { name: 'Crear salida' }).click();

    await expect(main.getByText(/Salida creada/i)).toBeVisible();
    await main.getByRole('button', { name: 'Despachar' }).first().click();
    const detail = page.getByRole('dialog', { name: 'Detalle de salida' });
    await expect(detail).toBeVisible();
    await detail.getByLabel('Método de entrega').fill('ACTA');
    await detail.getByRole('button', { name: 'Confirmar despacho' }).click();
    await expect(main.getByText(/Salida despachada/i)).toBeVisible();
    await detail.getByRole('button', { name: 'Cerrar' }).click();

    await main.getByRole('tab', { name: 'Movimientos' }).click();
    await main.getByRole('combobox', { name: 'Ítem' }).nth(1).selectOption(ITEM_ID);
    await main.getByRole('combobox', { name: 'Origen' }).selectOption(LOC_TECH);
    await main.getByRole('combobox', { name: 'Destino', exact: true }).selectOption(LOC_MAIN);
    await main.getByRole('button', { name: 'Registrar retorno' }).click();

    await expect(main.getByText('Retorno registrado en MOV-000011.')).toBeVisible();
    expect(state.stockIssueDispatchCount).toBe(1);
    expect(state.returnCount).toBe(1);
  });

  test('crea solicitud de proyecto con varias líneas', async ({ page }) => {
    await page.goto('/dashboard/inventory');
    const main = page.locator('main');

    await openPurchaseComposer(main);
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Tipo de compra' }),
      'Proyecto',
    );
    await addCatalogProductToDraft(main, /Seleccionar ONT-HG8245 - ONT Huawei HG8245/i);
    await main.getByRole('button', { name: 'Agregar línea manual' }).click();
    await main
      .getByRole('textbox', { name: 'Descripcion manual' })
      .fill('Cableado auxiliar de ampliación');
    await main.getByLabel('Título').fill('Proyecto ampliación red');
    await main.getByLabel('Área solicitante').fill('Ingeniería');
    await main
      .getByLabel('Justificacion')
      .fill('Adquisición de materiales para ampliación de red en zona norte del municipio');
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

test.describe('Portal Inventario / Bodegas', () => {
  test.beforeEach(async ({ page }) => {
    const state = createInventoryMockState();
    await setupInventoryMocks(page, state);
    await seedPortalSession(page);
    (page as unknown as { inventoryMockState: InventoryMockState }).inventoryMockState = state;
  });

  test('abre slice de bodegas con deep-link tab=locations', async ({ page }) => {
    await page.goto('/dashboard/inventory?tab=locations');
    const main = page.locator('main');

    await expect(main.getByRole('tab', { name: 'Bodegas', selected: true })).toBeVisible();
    await expect(main.getByText('Matriz de bodegas')).toBeVisible();
    await expect(main.getByText('BOD-01')).toBeVisible();
  });

  test('filtra custodias móviles con custody=mobile', async ({ page }) => {
    await page.goto('/dashboard/inventory?tab=locations&custody=mobile');
    const main = page.locator('main');

    await expect(main.getByText('Custodia técnico')).toBeVisible();
    await expect(main.getByText('Móvil con tope')).toBeVisible();
    await expect(main.getByText('BOD-01')).toHaveCount(0);
  });

  test('crea bodega desde UI', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;

    await page.goto('/dashboard/inventory?tab=locations');
    const main = page.locator('main');

    await main.getByRole('button', { name: 'Crear bodega' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre de la bodega').fill('Cuarentena operativa');
    await selectComboboxOption(page, dialog.getByRole('combobox', { name: 'Tipo' }), 'Cuarentena');
    await dialog.getByRole('button', { name: 'Crear bodega' }).click();

    await expect(main.getByText('CUA-001')).toBeVisible();
    expect(state.locations.some((location) => location.code === 'CUA-001')).toBe(true);
  });

  test('edita capacidad y responsable de bodega existente', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;

    await page.goto('/dashboard/inventory?tab=locations');
    const main = page.locator('main');

    await main.getByRole('button', { name: 'Editar Bodega principal' }).click();
    const dialog = page.getByRole('dialog');
    await selectComboboxOption(
      page,
      dialog.getByRole('combobox', { name: 'Responsable operativo' }),
      MOBILE_RESPONSIBLE_NAME,
    );
    await dialog.getByLabel('Capacidad máxima').fill('24');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      main.locator('tr').filter({ hasText: 'BOD-01' }).getByText(MOBILE_RESPONSIBLE_NAME),
    ).toBeVisible();
    const updated = state.locations.find((location) => location.id === LOC_MAIN);
    expect(updated?.responsibleRefId).toBe(MOBILE_RESPONSIBLE_ID);
    expect(updated?.maxCapacity).toBe(24);
  });

  test('bloquea salida que excede saldo visible', async ({ page }) => {
    await page.goto('/dashboard/inventory?tab=locations');
    const main = page.locator('main');

    await main.getByRole('tab', { name: 'Salidas' }).click();
    await expect(main.getByRole('heading', { name: 'Salidas' })).toBeVisible();

    await main.getByRole('button', { name: 'Crear salida' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Crear salida' });
    await createDialog.locator('select').first().selectOption('TECHNICIAN_CUSTODY');
    await createDialog.locator('select').nth(1).selectOption(LOC_MAIN);
    await createDialog.locator('select').nth(2).selectOption(LOC_TECH);
    await createDialog.locator('select').nth(3).selectOption(ITEM_CONSUMABLE_ID);
    await createDialog.getByLabel('Cantidad').fill('99');
    await createDialog.getByRole('button', { name: 'Crear salida' }).click();

    await main.getByRole('button', { name: 'Despachar' }).first().click();
    const detail = page.getByRole('dialog', { name: 'Detalle de salida' });
    await detail.getByLabel('Método de entrega').fill('ACTA');
    await detail.getByRole('button', { name: 'Confirmar despacho' }).click();

    await expect(
      detail.getByText('La cantidad solicitada excede el saldo disponible en la ubicación origen.'),
    ).toBeVisible();
  });

  test('bloquea salida sin cupo en bodega móvil', async ({ page }) => {
    await page.goto('/dashboard/inventory?tab=locations');
    const main = page.locator('main');

    await main.getByRole('tab', { name: 'Salidas' }).click();
    await expect(main.getByRole('heading', { name: 'Salidas' })).toBeVisible();

    await main.getByRole('button', { name: 'Crear salida' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Crear salida' });
    await createDialog.locator('select').first().selectOption('TECHNICIAN_CUSTODY');
    await createDialog.locator('select').nth(1).selectOption(LOC_MAIN);
    await createDialog.locator('select').nth(2).selectOption(LOC_MOBILE_CAPPED);
    await createDialog.locator('select').nth(3).selectOption(ITEM_ID);
    await createDialog.getByLabel('Cantidad').fill('1');
    await createDialog.getByRole('button', { name: 'Crear salida' }).click();

    await main.getByRole('button', { name: 'Despachar' }).first().click();
    const detail = page.getByRole('dialog', { name: 'Detalle de salida' });
    await detail.getByLabel('Método de entrega').fill('ACTA');
    await detail.getByRole('button', { name: 'Confirmar despacho' }).click();

    await expect(
      detail.getByText('La bodega móvil destino supera su capacidad máxima.'),
    ).toBeVisible();
  });

  test('permite drill-down de balances por ubicación', async ({ page }) => {
    await page.goto('/dashboard/inventory?tab=locations');
    const main = page.locator('main');

    await main.getByRole('button', { name: 'Ver balances de Bodega principal' }).click();
    await expect(main.getByText(/ONT-HG8245 · ONT Huawei HG8245/i)).toBeVisible();
  });
});
