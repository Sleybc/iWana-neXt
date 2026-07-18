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
const PARTY_REUSE_ID = 'party-reuse-001';
const REUSE_DOCUMENT_NUMBER = '900123456';

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
  await main.getByRole('tab', { name: /^Catálogo \(\d+\)/ }).click();
  await main.getByRole('checkbox', { name: productPattern }).check();
  await main.getByRole('button', { name: /Agregar 1 producto/i }).click();
}

async function assignIssueLineSerial(
  page: import('@playwright/test').Page,
  main: import('@playwright/test').Locator,
  productSku: string,
  serialLabel = 'SN-001',
) {
  await selectComboboxOption(
    page,
    main.getByRole('combobox', { name: new RegExp(`Serial .*${productSku}`, 'i') }),
    serialLabel,
  );
}

async function openStockIssueComposer(main: import('@playwright/test').Locator) {
  await main.getByRole('tab', { name: 'Salidas' }).click();
  await expect(main.getByRole('heading', { name: 'Salidas', exact: true })).toBeVisible();
  await main.getByRole('button', { name: 'Crear salida' }).first().click();
  await expect(main.getByRole('heading', { name: 'Nueva salida' })).toBeVisible();
}

async function addIssueCatalogItemsToDraft(
  main: import('@playwright/test').Locator,
  productPatterns: RegExp[],
) {
  for (const pattern of productPatterns) {
    await main.getByRole('checkbox', { name: pattern }).check();
  }
  const count = productPatterns.length;
  await main.getByRole('button', { name: new RegExp(`Agregar ${count} producto`) }).click();
}

async function selectComboboxOption(
  page: import('@playwright/test').Page,
  combobox: import('@playwright/test').Locator,
  optionLabel: string,
) {
  await combobox.click();
  await page.getByRole('option', { name: optionLabel }).click();
}

async function confirmIssueDispatch(
  page: import('@playwright/test').Page,
  detail: import('@playwright/test').Locator,
  handoffLabel = 'Acta de entrega',
) {
  await selectComboboxOption(
    page,
    detail.getByRole('combobox', { name: 'Método de entrega' }),
    handoffLabel,
  );
  await detail.getByRole('button', { name: 'Confirmar despacho' }).click();
}

type InventoryMockState = {
  purchaseRequests: Array<Record<string, unknown>>;
  purchaseRequestLines: Array<Record<string, unknown>>;
  supplierQuotes: Array<Record<string, unknown>>;
  purchaseAwards: Array<Record<string, unknown>>;
  purchaseOrders: Array<Record<string, unknown>>;
  purchaseOrderLines: Array<Record<string, unknown>>;
  purchaseRfqs: Array<Record<string, unknown>>;
  purchaseRfqInvitations: Array<Record<string, unknown>>;
  catalogItems: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  locations: Array<Record<string, unknown>>;
  balances: Array<Record<string, unknown>>;
  stockIssues: Array<Record<string, unknown>>;
  stockIssueLines: Array<Record<string, unknown>>;
  stockIssueDispatchCount: number;
  transferCount: number;
  returnCount: number;
  adjustmentCount: number;
  movements: Array<Record<string, unknown>>;
  supplierProfiles: Array<Record<string, unknown>>;
  supplierCreateCount: number;
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

function getActiveRfqForRequest(state: InventoryMockState, purchaseRequestId: string) {
  return state.purchaseRfqs.find(
    (rfq) =>
      rfq.purchaseRequestId === purchaseRequestId &&
      ['DRAFT', 'SENT', 'RECEIVING'].includes(String(rfq.status)),
  );
}

function resolveSupplierDisplayName(state: InventoryMockState, partyRefId: string): string {
  const profile = state.supplierProfiles.find((entry) => entry.partyRefId === partyRefId);
  const party = profile?.party as { displayName?: string } | undefined;
  return party?.displayName ?? 'Proveedor invitado';
}

function buildRfqDetail(state: InventoryMockState, purchaseRequestId: string) {
  const rfq = getActiveRfqForRequest(state, purchaseRequestId);
  if (!rfq) {
    return null;
  }

  return {
    rfq,
    invitations: state.purchaseRfqInvitations
      .filter((invitation) => invitation.rfqId === rfq.id)
      .map((invitation) => ({
        ...invitation,
        displayName: resolveSupplierDisplayName(state, String(invitation.partyRefId)),
      })),
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

function buildSupplierProfile(overrides: Record<string, unknown> = {}) {
  const partyRefId = String(overrides.partyRefId ?? 'party-001');
  const displayName = String(overrides.displayName ?? 'Proveedor Demo');

  return {
    id: 'sp-001',
    supplierCode: 'PROV-001',
    partyRefId,
    status: 'ACTIVE',
    paymentTermsDays: 30,
    currency: 'COP',
    incoterm: null,
    defaultLeadTimeDays: 7,
    purchasingContactName: 'Compras Demo',
    purchasingContactEmail: 'compras@demo.test',
    purchasingContactPhone: '3001112233',
    notes: null,
    createdAt: nowIso(-2000),
    updatedAt: nowIso(-2000),
    party: {
      partyRefId,
      displayName,
      primaryContact: 'Contacto operativo',
      phone: '3001234567',
      email: 'proveedor@demo.test',
      city: 'Bogotá',
      status: 'ACTIVE',
    },
    ...overrides,
  };
}

function createInventoryMockState(): InventoryMockState {
  return {
    purchaseRequests: [buildPurchaseRequest()],
    purchaseRequestLines: [],
    supplierQuotes: [],
    purchaseAwards: [],
    purchaseOrders: [],
    purchaseOrderLines: [],
    purchaseRfqs: [],
    purchaseRfqInvitations: [],
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
    adjustmentCount: 0,
    movements: [
      {
        id: 'mov-seed-001',
        movementNumber: 'MOV-000100',
        origin: 'PURCHASE_RECEIPT',
        originContext: 'inventory.goods-receipt',
        originRefId: 'gr-seed-001',
        adjustmentReason: null,
        notes: 'Recepción de OC seed',
        actorUserId: NOC_USER_ID,
        isReversal: false,
        createdAt: nowIso(-120),
        lines: [
          {
            id: 'mov-seed-001-line-1',
            itemId: ITEM_CONSUMABLE_ID,
            itemName: 'Cable drop',
            itemSku: 'CAB-DROP',
            locationId: LOC_MAIN,
            locationName: 'Bodega principal',
            lotId: null,
            lotNumber: null,
            serializedAssetId: null,
            quantity: '8.00',
            unitCost: '1200.00',
          },
        ],
      },
    ],
    supplierProfiles: [buildSupplierProfile()],
    supplierCreateCount: 0,
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
          estimatedTotalValue: 2_500_000,
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
              estimatedValue: 1_480_000,
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

    if (pathname.endsWith('/inventory/replenishment/suggestions') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            itemId: ITEM_CONSUMABLE_ID,
            itemSku: 'CAB-DROP',
            itemName: 'Cable drop',
            unitOfMeasure: 'metro',
            available: '0.00',
            pendingPurchase: '0.00',
            minimumStock: '10.00',
            reorderPoint: '20.00',
            targetStock: '40.00',
            suggestedQty: '40.00',
            orderMultiple: null,
            minimumOrderQty: null,
            leadTimeDays: 5,
            preferredSupplier: {
              partyRefId: 'party-001',
              displayName: 'Proveedor Demo',
            },
            estimatedUnitCost: '1200.00',
            estimatedLineValue: '48000.00',
            criticality: 'out',
          },
          {
            itemId: ITEM_ID,
            itemSku: 'ONT-HG8245',
            itemName: 'ONT Huawei HG8245',
            unitOfMeasure: 'UND',
            available: '3.00',
            pendingPurchase: '0.00',
            minimumStock: '5.00',
            reorderPoint: '5.00',
            targetStock: '12.00',
            suggestedQty: '9.00',
            orderMultiple: null,
            minimumOrderQty: null,
            leadTimeDays: 7,
            preferredSupplier: {
              partyRefId: 'party-001',
              displayName: 'Proveedor Demo',
            },
            estimatedUnitCost: '185000.00',
            estimatedLineValue: '1665000.00',
            criticality: 'below-minimum',
          },
        ]),
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

    if (pathname.endsWith('/inventory/movements') && method === 'GET') {
      const itemId = url.searchParams.get('itemId');
      const locationId = url.searchParams.get('locationId');
      const origin = url.searchParams.get('origin');
      const search = url.searchParams.get('search');
      const pageParam = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
      const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '20', 10);

      let filtered = [...state.movements];
      if (itemId) {
        filtered = filtered.filter((movement) =>
          (movement.lines as Array<Record<string, unknown>>).some((line) => line.itemId === itemId),
        );
      }
      if (locationId) {
        filtered = filtered.filter((movement) =>
          (movement.lines as Array<Record<string, unknown>>).some(
            (line) => line.locationId === locationId,
          ),
        );
      }
      if (origin) {
        filtered = filtered.filter((movement) => movement.origin === origin);
      }
      if (search) {
        filtered = filtered.filter((movement) =>
          String(movement.movementNumber ?? '')
            .toUpperCase()
            .startsWith(search.toUpperCase()),
        );
      }

      const start = (pageParam - 1) * limitParam;
      const data = filtered.slice(start, start + limitParam);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data,
          total: filtered.length,
          page: pageParam,
          limit: limitParam,
        }),
      });
      return;
    }

    const movementDetailMatch = pathname.match(/\/inventory\/movements\/([^/]+)$/);
    if (movementDetailMatch && method === 'GET') {
      const movement = state.movements.find((entry) => entry.id === movementDetailMatch[1]);
      await route.fulfill({
        status: movement ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(movement ?? { message: 'Movimiento de stock no encontrado.' }),
      });
      return;
    }

    if (pathname.endsWith('/inventory/adjustments') && method === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const quantityDelta = Number(body.quantityDelta);
      const itemId = String(body.itemId ?? '');
      const locationId = String(body.locationId ?? '');
      const condition = String(body.condition ?? 'NEW');

      const balance = state.balances.find(
        (entry) =>
          entry.itemId === itemId &&
          entry.locationId === locationId &&
          (entry.condition ?? 'NEW') === condition &&
          (entry.lotId ?? null) === (body.lotId ?? null),
      );
      const currentOnHand = Number.parseFloat(String(balance?.quantityOnHand ?? '0'));
      if (currentOnHand + quantityDelta < 0) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'El movimiento dejaría saldo negativo.' }),
        });
        return;
      }

      const catalogItem = state.catalogItems.find((entry) => entry.id === itemId);
      if (catalogItem?.trackingMode === 'SERIALIZED') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            message:
              'Los ítems serializados no admiten ajuste manual. Use retorno o baja según el caso.',
          }),
        });
        return;
      }

      if (balance) {
        balance.quantityOnHand = (currentOnHand + quantityDelta).toFixed(2);
      } else if (quantityDelta > 0) {
        state.balances.push(
          buildBalance({
            id: `bal-adj-${state.adjustmentCount + 1}`,
            itemId,
            locationId,
            quantityOnHand: quantityDelta.toFixed(2),
            condition,
          }),
        );
      }

      state.adjustmentCount += 1;
      const movementNumber = `MOV-${String(100 + state.adjustmentCount).padStart(6, '0')}`;
      const location = state.locations.find((entry) => entry.id === locationId);
      const movement = {
        id: `mov-adj-${state.adjustmentCount}`,
        movementNumber,
        origin: 'ADJUSTMENT',
        originContext: 'inventory.adjustment',
        originRefId: body.reason ?? 'OTHER',
        adjustmentReason: body.reason ?? 'OTHER',
        notes: body.notes ?? null,
        actorUserId: NOC_USER_ID,
        isReversal: false,
        createdAt: nowIso(),
        lines: [
          {
            id: `mov-adj-${state.adjustmentCount}-line-1`,
            itemId,
            itemName: catalogItem?.name ?? null,
            itemSku: catalogItem?.sku ?? null,
            locationId,
            locationName: location?.name ?? null,
            lotId: body.lotId ?? null,
            lotNumber: null,
            serializedAssetId: null,
            quantity: quantityDelta.toFixed(2),
            unitCost: null,
          },
        ],
      };
      state.movements.unshift(movement);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          movement: {
            id: movement.id,
            movementNumber,
            origin: 'ADJUSTMENT',
            originContext: 'inventory.adjustment',
            originRefId: body.reason ?? 'OTHER',
            notes: body.notes ?? null,
            actorUserId: NOC_USER_ID,
            isReversal: false,
            createdAt: movement.createdAt,
            updatedAt: movement.createdAt,
            tenantId: 'tenant-inventory-001',
            idempotencyKey: body.idempotencyKey,
            reversedByMovementId: null,
          },
          lines: movement.lines,
        }),
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
      if (
        body.type === 'WAREHOUSE_TO_WAREHOUSE' &&
        body.sourceLocationId &&
        body.sourceLocationId === body.destinationLocationId
      ) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'La ubicación destino debe ser distinta del origen.',
          }),
        });
        return;
      }

      const id = `issue-${String(state.stockIssues.length + 1).padStart(3, '0')}`;
      const created = {
        id,
        tenantId: 'tenant-inventory-001',
        type: body.type ?? 'TECHNICIAN_CUSTODY',
        status: 'REQUESTED',
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

    if (issueDetailMatch && method === 'PATCH') {
      const issueId = issueDetailMatch[1];
      const issue = state.stockIssues.find((entry) => entry.id === issueId);
      if (!issue) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        return;
      }

      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      if (body.sourceLocationId) issue.sourceLocationId = String(body.sourceLocationId);
      if (body.destinationLocationId !== undefined) {
        issue.destinationLocationId = (body.destinationLocationId as string | null) ?? null;
      }
      if (body.type) issue.type = body.type as typeof issue.type;
      issue.updatedAt = nowIso();

      if (Array.isArray(body.lines)) {
        state.stockIssueLines = state.stockIssueLines.filter((line) => line.issueId !== issueId);
        (body.lines as Array<Record<string, unknown>>).forEach((line, index) => {
          state.stockIssueLines.push({
            id: `${issueId}-line-${index + 1}`,
            tenantId: 'tenant-inventory-001',
            issueId,
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
      }

      const lines = state.stockIssueLines.filter((line) => line.issueId === issueId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...issue, lines }),
      });
      return;
    }

    const issueCancelMatch = pathname.match(/\/inventory\/issues\/([^/]+)\/cancel$/);
    if (issueCancelMatch && method === 'POST') {
      const issueId = issueCancelMatch[1];
      const issue = state.stockIssues.find((entry) => entry.id === issueId);
      if (!issue) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        return;
      }
      issue.status = 'CANCELLED';
      issue.updatedAt = nowIso();
      const lines = state.stockIssueLines.filter((line) => line.issueId === issueId);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...issue, lines }),
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
      const createdId = `pr-${state.purchaseRequests.length + 1}`;
      const created = buildPurchaseRequest({
        id: createdId,
        requestNumber: `PR-${String(state.purchaseRequests.length + 1).padStart(4, '0')}`,
        title: body.title ?? 'Solicitud sin título',
        status: 'DRAFT',
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

      const bodyLines = Array.isArray(body.lines) ? body.lines : [];
      for (const [index, rawLine] of bodyLines.entries()) {
        const line = rawLine as Record<string, unknown>;
        state.purchaseRequestLines.push({
          id: `prl-${createdId}-${index + 1}`,
          tenantId: 'tenant-inventory-001',
          purchaseRequestId: createdId,
          inventoryItemId: line.inventoryItemId ?? null,
          freeTextDescription: line.freeTextDescription ?? null,
          quantityRequested: String(line.quantityRequested ?? '1'),
          unitOfMeasure: String(line.unitOfMeasure ?? 'UND'),
          lineStatus: 'OPEN',
          sourceKind: line.sourceKind ?? 'INVENTORY_ITEM',
          suggestedPartyRefId: line.suggestedPartyRefId ?? null,
          notes: line.notes ?? null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      }

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
      const lines = state.purchaseRequestLines.filter(
        (line) => line.purchaseRequestId === requestId,
      );
      const quotes = state.supplierQuotes.filter((quote) => quote.purchaseRequestId === requestId);
      const lineIds = new Set(lines.map((line) => line.id));
      const awards = state.purchaseAwards.filter((award) =>
        lineIds.has(award.purchaseRequestLineId),
      );
      const estimatedAmount = quotes.reduce((total, quote) => total + Number(quote.amount ?? 0), 0);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          request,
          lines,
          quotes,
          awards,
          orders: state.purchaseOrders.filter((order) => order.purchaseRequestId === requestId),
          estimatedAmount,
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
          rfq: buildRfqDetail(state, requestId),
        }),
      });
      return;
    }

    const createRfqMatch = pathname.match(/\/purchasing\/requests\/([^/]+)\/rfq$/);
    if (createRfqMatch && method === 'POST') {
      const requestId = createRfqMatch[1];
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const rfq = {
        id: `rfq-${state.purchaseRfqs.length + 1}`,
        tenantId: 'tenant-inventory-001',
        purchaseRequestId: requestId,
        rfqNumber: `RFQ-${String(state.purchaseRfqs.length + 1).padStart(6, '0')}`,
        status: 'DRAFT',
        currency: body.currency ?? 'COP',
        responseDeadline: body.responseDeadline ?? null,
        sentAt: null,
        closedAt: null,
        createdByUserId: NOC_USER_ID,
        notes: body.notes ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.purchaseRfqs.push(rfq);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(rfq),
      });
      return;
    }

    const inviteSuppliersMatch = pathname.match(/\/purchasing\/rfqs\/([^/]+)\/invitations$/);
    if (inviteSuppliersMatch && method === 'POST') {
      const rfqId = inviteSuppliersMatch[1];
      const body = JSON.parse(request.postData() ?? '{}') as { partyRefIds?: string[] };

      // Enforcement RF-PROV-08 (paridad con SupplierProfileService.assertEligibleForPurchasing):
      // un proveedor BLOCKED/INACTIVE no puede invitarse a un RFQ.
      const blockedInvite = (body.partyRefIds ?? []).find((partyRefId) => {
        const profile = state.supplierProfiles.find((entry) => entry.partyRefId === partyRefId);
        return profile?.status === 'BLOCKED' || profile?.status === 'INACTIVE';
      });
      if (blockedInvite) {
        const profile = state.supplierProfiles.find((entry) => entry.partyRefId === blockedInvite);
        const label = profile?.status === 'BLOCKED' ? 'bloqueado' : 'inactivo';
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 400,
            message: `El proveedor está ${label} y no puede usarse en nuevas operaciones de compra.`,
          }),
        });
        return;
      }

      const created = (body.partyRefIds ?? []).map((partyRefId, index) => {
        const existing = state.purchaseRfqInvitations.find(
          (invitation) => invitation.rfqId === rfqId && invitation.partyRefId === partyRefId,
        );
        if (existing) {
          return existing;
        }

        const invitation = {
          id: `rfq-inv-${state.purchaseRfqInvitations.length + index + 1}`,
          tenantId: 'tenant-inventory-001',
          rfqId,
          partyRefId,
          status: 'INVITED',
          invitedAt: null,
          respondedAt: null,
          declinedAt: null,
          declineReason: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        state.purchaseRfqInvitations.push(invitation);
        return invitation;
      });

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }

    const sendRfqMatch = pathname.match(/\/purchasing\/rfqs\/([^/]+)\/send$/);
    if (sendRfqMatch && method === 'POST') {
      const rfqId = sendRfqMatch[1];
      const rfq = state.purchaseRfqs.find((entry) => entry.id === rfqId);
      if (rfq) {
        rfq.status = 'SENT';
        rfq.sentAt = nowIso();
        rfq.updatedAt = nowIso();
        const requestEntry = state.purchaseRequests.find(
          (entry) => entry.id === rfq.purchaseRequestId,
        );
        if (requestEntry) {
          requestEntry.status = 'PENDING_QUOTES';
          requestEntry.updatedAt = nowIso();
        }
        state.purchaseRfqInvitations
          .filter((invitation) => invitation.rfqId === rfqId)
          .forEach((invitation) => {
            invitation.invitedAt = nowIso();
            invitation.updatedAt = nowIso();
          });
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(rfq ?? {}),
      });
      return;
    }

    const closeRfqMatch = pathname.match(/\/purchasing\/rfqs\/([^/]+)\/close$/);
    if (closeRfqMatch && method === 'POST') {
      const rfqId = closeRfqMatch[1];
      const rfq = state.purchaseRfqs.find((entry) => entry.id === rfqId);
      if (rfq) {
        rfq.status = 'CLOSED';
        rfq.closedAt = nowIso();
        rfq.updatedAt = nowIso();
        const requestEntry = state.purchaseRequests.find(
          (entry) => entry.id === rfq.purchaseRequestId,
        );
        if (requestEntry) {
          requestEntry.status = 'PENDING_APPROVAL';
          requestEntry.updatedAt = nowIso();
        }
        state.purchaseRfqInvitations
          .filter((invitation) => invitation.rfqId === rfqId && invitation.status === 'INVITED')
          .forEach((invitation) => {
            invitation.status = 'EXPIRED';
            invitation.updatedAt = nowIso();
          });
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(rfq ?? {}),
      });
      return;
    }

    const rfqPdfMatch = pathname.match(/\/purchasing\/rfqs\/([^/]+)\/pdf$/);
    if (rfqPdfMatch && method === 'GET') {
      const rfq = state.purchaseRfqs.find((entry) => entry.id === rfqPdfMatch[1]);
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: {
          'Content-Disposition': `attachment; filename="${String(rfq?.rfqNumber ?? 'RFQ-000001')}.pdf"`,
        },
        body: Buffer.from('%PDF-1.4\n% mock rfq pdf\n'),
      });
      return;
    }

    const providerListMatch = pathname.endsWith('/purchasing/providers') && method === 'GET';
    if (providerListMatch) {
      const search = url.searchParams.get('search') ?? '';
      const catalog = [
        {
          partyRefId: 'party-001',
          displayName: 'Proveedor Demo',
          status: 'ACTIVE',
        },
        {
          partyRefId: PARTY_REUSE_ID,
          displayName: 'Distribuidora Andina SAS',
          status: 'ACTIVE',
        },
      ];
      const filtered =
        search === REUSE_DOCUMENT_NUMBER
          ? catalog.filter((item) => item.partyRefId === PARTY_REUSE_ID)
          : catalog.filter((item) => {
              if (!search) {
                return true;
              }

              const normalizedSearch = search.toLowerCase();
              return item.displayName.toLowerCase().includes(normalizedSearch);
            });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: filtered,
          total: filtered.length,
          page: 1,
          limit: 20,
        }),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/suppliers/lookup') && method === 'GET') {
      const documentNumber = url.searchParams.get('documentNumber') ?? '';
      const documentType = url.searchParams.get('documentType') ?? 'NIT';
      if (documentNumber === REUSE_DOCUMENT_NUMBER) {
        const hasSupplierProfile = state.supplierProfiles.some(
          (entry) => entry.partyRefId === PARTY_REUSE_ID,
        );
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            match: {
              partyRefId: PARTY_REUSE_ID,
              partyType: 'ORGANIZATION',
              documentType,
              displayName: 'Distribuidora Andina SAS',
              legalName: 'Distribuidora Andina S.A.S.',
              summary: {
                partyRefId: PARTY_REUSE_ID,
                displayName: 'Distribuidora Andina SAS',
                primaryContact: 'contacto@andina.test',
                phone: '3009998877',
                email: 'contacto@andina.test',
                city: 'Barranquilla',
                status: 'ACTIVE',
              },
            },
            hasSupplierProfile,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ match: null, hasSupplierProfile: false }),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/suppliers') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: state.supplierProfiles,
          total: state.supplierProfiles.length,
          page: 1,
          limit: 100,
        }),
      });
      return;
    }

    const supplierDetailMatch = pathname.match(/\/purchasing\/suppliers\/([^/]+)$/);
    if (supplierDetailMatch && method === 'GET') {
      const partyRefId = supplierDetailMatch[1];
      const profile = state.supplierProfiles.find((entry) => entry.partyRefId === partyRefId);
      await route.fulfill({
        status: profile ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(profile ?? { message: 'Perfil de proveedor no encontrado.' }),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/suppliers') && method === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      state.supplierCreateCount += 1;
      const partyRefId =
        body.documentNumber === REUSE_DOCUMENT_NUMBER
          ? PARTY_REUSE_ID
          : `party-new-${state.supplierCreateCount}`;
      const profile = buildSupplierProfile({
        id: `sp-${state.supplierProfiles.length + 1}`,
        supplierCode: `PROV-${String(state.supplierProfiles.length + 1).padStart(3, '0')}`,
        partyRefId,
        displayName: body.displayName ?? 'Proveedor nuevo',
        paymentTermsDays: body.paymentTermsDays ?? null,
        currency: body.currency ?? 'COP',
        incoterm: body.incoterm ?? null,
        defaultLeadTimeDays: body.defaultLeadTimeDays ?? null,
        purchasingContactName: body.purchasingContactName ?? null,
        purchasingContactEmail: body.purchasingContactEmail ?? null,
        purchasingContactPhone: body.purchasingContactPhone ?? null,
        notes: body.notes ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        party: {
          partyRefId,
          displayName: body.displayName ?? 'Proveedor nuevo',
          primaryContact: body.purchasingContactName ?? null,
          phone: body.purchasingContactPhone ?? null,
          email: body.purchasingContactEmail ?? null,
          city: 'Bogotá',
          status: 'ACTIVE',
        },
      });
      state.supplierProfiles.unshift(profile);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(profile),
      });
      return;
    }

    const supplierUpdateMatch = pathname.match(/\/purchasing\/suppliers\/([^/]+)$/);
    if (supplierUpdateMatch && method === 'PATCH') {
      const partyRefId = supplierUpdateMatch[1];
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const profile = state.supplierProfiles.find((entry) => entry.partyRefId === partyRefId);
      if (profile) {
        Object.assign(profile, body, { updatedAt: nowIso() });
      }
      await route.fulfill({
        status: profile ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(profile ?? { message: 'Perfil de proveedor no encontrado.' }),
      });
      return;
    }

    const supplierStatusMatch = pathname.match(/\/purchasing\/suppliers\/([^/]+)\/status$/);
    if (supplierStatusMatch && method === 'POST') {
      const partyRefId = supplierStatusMatch[1];
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const profile = state.supplierProfiles.find((entry) => entry.partyRefId === partyRefId);
      if (profile) {
        profile.status = body.status;
        profile.updatedAt = nowIso();
      }
      await route.fulfill({
        status: profile ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(profile ?? { message: 'Perfil de proveedor no encontrado.' }),
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

    const awardsMatch = pathname.match(/\/purchasing\/requests\/([^/]+)\/awards$/);
    if (awardsMatch && method === 'POST') {
      const requestId = awardsMatch[1];
      const body = JSON.parse(request.postData() ?? '{}') as {
        awards?: Array<Record<string, unknown>>;
      };
      const created = (body.awards ?? []).map((awardInput, index) => {
        const award = {
          id: `award-${state.purchaseAwards.length + index + 1}`,
          tenantId: 'tenant-inventory-001',
          purchaseRequestLineId: awardInput.purchaseRequestLineId,
          supplierQuoteId: awardInput.supplierQuoteId ?? null,
          awardedPartyRefId: awardInput.awardedPartyRefId,
          awardedQuantity: String(awardInput.awardedQuantity ?? '0'),
          awardNotes: awardInput.awardNotes ?? null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        state.purchaseAwards.push(award);
        const line = state.purchaseRequestLines.find(
          (entry) => entry.id === awardInput.purchaseRequestLineId,
        );
        if (line) {
          line.lineStatus = 'AWARDED';
          line.updatedAt = nowIso();
        }
        return award;
      });
      const requestEntry = state.purchaseRequests.find((item) => item.id === requestId);
      if (requestEntry) {
        requestEntry.updatedAt = nowIso();
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }

    const rejectMatch = pathname.match(/\/purchasing\/requests\/([^/]+)\/reject$/);
    if (rejectMatch && method === 'POST') {
      const requestId = rejectMatch[1];
      const body = JSON.parse(request.postData() ?? '{}') as { reason?: string };
      const entry = state.purchaseRequests.find((item) => item.id === requestId);
      if (!entry || !['PENDING_QUOTES', 'PENDING_APPROVAL'].includes(String(entry.status))) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 400,
            message: 'La solicitud no está en un estado que permita rechazarla.',
          }),
        });
        return;
      }
      entry.status = 'REJECTED';
      entry.resolutionReason = body.reason ?? null;
      entry.resolvedByUserId = NOC_USER_ID;
      entry.updatedAt = nowIso();
      const activeRfq = getActiveRfqForRequest(state, requestId);
      if (activeRfq) {
        activeRfq.status = 'CANCELLED';
        activeRfq.closedAt = nowIso();
        activeRfq.closedByUserId = NOC_USER_ID;
        state.purchaseRfqInvitations.forEach((invitation) => {
          if (invitation.rfqId === activeRfq.id && invitation.status === 'INVITED') {
            invitation.status = 'CANCELLED';
          }
        });
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(entry),
      });
      return;
    }

    const cancelMatch = pathname.match(/\/purchasing\/requests\/([^/]+)\/cancel$/);
    if (cancelMatch && method === 'POST') {
      const requestId = cancelMatch[1];
      const body = JSON.parse(request.postData() ?? '{}') as { reason?: string };
      const entry = state.purchaseRequests.find((item) => item.id === requestId);
      if (!entry || ['REJECTED', 'CANCELLED', 'CONVERTED_TO_PO'].includes(String(entry.status))) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 400,
            message: 'La solicitud no está en un estado que permita cancelarla.',
          }),
        });
        return;
      }
      entry.status = 'CANCELLED';
      entry.resolutionReason = body.reason ?? null;
      entry.resolvedByUserId = NOC_USER_ID;
      entry.updatedAt = nowIso();
      const activeRfq = getActiveRfqForRequest(state, requestId);
      if (activeRfq) {
        activeRfq.status = 'CANCELLED';
        activeRfq.closedAt = nowIso();
        activeRfq.closedByUserId = NOC_USER_ID;
        state.purchaseRfqInvitations.forEach((invitation) => {
          if (invitation.rfqId === activeRfq.id && invitation.status === 'INVITED') {
            invitation.status = 'CANCELLED';
          }
        });
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(entry),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/orders') && method === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;

      // Enforcement RF-PROV-08: una OC no puede emitirse a un proveedor BLOCKED/INACTIVE.
      const orderPartyRefs = [
        body.partyRefId,
        ...(((body.orders as Array<Record<string, unknown>> | undefined) ?? []).map(
          (entry) => entry.partyRefId,
        ) ?? []),
      ].filter((value): value is string => typeof value === 'string');
      const blockedOrderParty = orderPartyRefs.find((partyRefId) => {
        const profile = state.supplierProfiles.find((entry) => entry.partyRefId === partyRefId);
        return profile?.status === 'BLOCKED' || profile?.status === 'INACTIVE';
      });
      if (blockedOrderParty) {
        const profile = state.supplierProfiles.find(
          (entry) => entry.partyRefId === blockedOrderParty,
        );
        const label = profile?.status === 'BLOCKED' ? 'bloqueado' : 'inactivo';
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 400,
            message: `El proveedor está ${label} y no puede usarse en nuevas operaciones de compra.`,
          }),
        });
        return;
      }

      const batchOrders = (body.orders as Array<Record<string, unknown>> | undefined) ?? [];
      if (batchOrders.length > 0) {
        const created = batchOrders.map((orderInput, orderIndex) => {
          const order = {
            id: `po-${state.purchaseOrders.length + orderIndex + 1}`,
            tenantId: 'tenant-inventory-001',
            orderNumber: `PO-${String(state.purchaseOrders.length + orderIndex + 1).padStart(4, '0')}`,
            purchaseRequestId: body.purchaseRequestId,
            partyRefId: orderInput.partyRefId,
            status: 'APPROVED',
            expectedDeliveryDate:
              orderInput.expectedDeliveryDate ?? body.expectedDeliveryDate ?? null,
            approvedByUserId: NOC_USER_ID,
            notes: orderInput.notes ?? body.notes ?? null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };
          state.purchaseOrders.push(order);

          const lines = (orderInput.lines as Array<Record<string, unknown>> | undefined) ?? [];
          lines.forEach((line, lineIndex) => {
            state.purchaseOrderLines.push({
              id: `pol-${order.id}-${lineIndex + 1}`,
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

          return order;
        });

        const request = state.purchaseRequests.find((entry) => entry.id === body.purchaseRequestId);
        if (request) {
          request.status = 'CONVERTED_TO_PO';
          request.updatedAt = nowIso();
        }

        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ orders: created }),
        });
        return;
      }

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

      const request = state.purchaseRequests.find((entry) => entry.id === body.purchaseRequestId);
      if (request) {
        request.status = 'CONVERTED_TO_PO';
        request.updatedAt = nowIso();
      }

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
    await expect(main.getByText('Catálogo de productos')).toBeVisible();

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
      .getByLabel('Justificación')
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
    await categoryDrawer.getByLabel('Prefijo de código').fill('FIB');
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
      .getByLabel('Justificación')
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

    await main.getByRole('tab', { name: 'Salidas' }).click();
    await expect(main.getByRole('heading', { name: 'Salidas', exact: true })).toBeVisible();

    await main.getByRole('tab', { name: 'Activos' }).click();
    await expect(main.getByText('SN-001')).toBeVisible();
    await expect(main.getByText('Disponible')).toBeVisible();
  });

  test('crea salida a técnico y despacha generando movimiento', async ({ page }) => {
    await page.goto('/dashboard/inventory');
    const main = page.locator('main');

    await openStockIssueComposer(main);
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Tipo' }),
      'Entrega a técnico',
    );
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Origen' }),
      'BOD-01 · Bodega principal (Bodega principal)',
    );
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Destino' }),
      'TEC-01 · Custodia técnico (Técnico en campo)',
    );
    await addIssueCatalogItemsToDraft(main, [/Seleccionar ONT-HG8245 · ONT Huawei HG8245/i]);
    await assignIssueLineSerial(page, main, 'ONT-HG8245');
    await main.getByRole('button', { name: 'Crear salida' }).click();

    await expect(
      main.getByText('Salida creada. Puedes despacharla cuando esté lista.'),
    ).toBeVisible();

    await main.getByRole('button', { name: 'Despachar' }).first().click();
    const detail = page.getByRole('dialog', { name: 'Detalle de salida' });
    await expect(detail).toBeVisible();
    await confirmIssueDispatch(page, detail);

    await expect(main.getByText(/Salida despachada/i)).toBeVisible();
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

    const orderDrawer = page.getByRole('dialog', { name: 'Orden de compra' });
    await expect(orderDrawer.getByRole('heading', { name: 'Orden de compra' })).toBeVisible();
    await orderDrawer.getByLabel('Proveedor').fill('Demo');
    await orderDrawer.getByRole('option', { name: /Proveedor Demo/i }).click();

    const itemSelect = orderDrawer.getByRole('combobox', { name: 'Producto' });
    await itemSelect.click();
    await page.getByRole('option', { name: /ONT Huawei HG8245/i }).click();

    await orderDrawer.getByRole('button', { name: 'Generar orden de compra' }).click();

    await expect(workbench.getByRole('tab', { name: 'Recepciones' })).toBeVisible();
    await expect(workbench.getByText('Línea de orden')).toBeVisible();
    await expect(
      workbench.getByRole('paragraph').filter({ hasText: 'ONT-HG8245 · ONT Huawei HG8245' }),
    ).toBeVisible();
    await expect(workbench.getByLabel('Id línea OC')).toHaveCount(0);

    await selectComboboxOption(
      page,
      workbench.getByRole('combobox', { name: 'Ubicación destino' }),
      'BOD-01 · Bodega principal',
    );
    await workbench.getByRole('button', { name: 'Registrar recepción' }).click();
    await expect(workbench.getByText('Recepción GR-000001 registrada')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await openStockIssueComposer(main);
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Tipo' }),
      'Entrega a técnico',
    );
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Origen' }),
      'BOD-01 · Bodega principal (Bodega principal)',
    );
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Destino' }),
      'TEC-01 · Custodia técnico (Técnico en campo)',
    );
    await addIssueCatalogItemsToDraft(main, [/Seleccionar ONT-HG8245 · ONT Huawei HG8245/i]);
    await assignIssueLineSerial(page, main, 'ONT-HG8245');
    await main.getByRole('button', { name: 'Crear salida' }).click();

    await expect(main.getByText(/Salida creada/i)).toBeVisible();
    await main.getByRole('button', { name: 'Despachar' }).first().click();
    const detail = page.getByRole('dialog', { name: 'Detalle de salida' });
    await expect(detail).toBeVisible();
    await confirmIssueDispatch(page, detail);
    await expect(main.getByText(/Salida despachada/i)).toBeVisible();
    await detail.getByRole('button', { name: 'Cerrar' }).click();

    await main.getByRole('tab', { name: 'Movimientos' }).click();
    await main.getByLabel('Producto').nth(1).selectOption(ITEM_ID);
    await main.getByLabel('Bodega de origen').selectOption(LOC_TECH);
    await main.getByLabel('Bodega de destino').selectOption(LOC_MAIN);
    await main.getByRole('button', { name: 'Registrar retorno' }).click();

    await expect(main.getByText(/Devolución registrada.*MOV-000011/i)).toBeVisible();
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
      .getByRole('textbox', { name: 'Descripción manual' })
      .fill('Cableado auxiliar de ampliación');
    await main.getByLabel('Título').fill('Proyecto ampliación red');
    await main.getByLabel('Área solicitante').fill('Ingeniería');
    await main
      .getByLabel('Justificación')
      .fill('Adquisición de materiales para ampliación de red en zona norte del municipio');
    await main.getByRole('button', { name: 'Crear solicitud' }).click();

    await expect(main.getByText('PR-0002')).toBeVisible();
  });

  test('crea salida por venta y despacha', async ({ page }) => {
    await page.goto('/dashboard/inventory');
    const main = page.locator('main');

    await openStockIssueComposer(main);

    // SALE_DISPATCH — no hay selector de destino de inventario
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Tipo' }),
      'Salida por venta',
    );
    // Esperar a que el campo de referencia comercial aparezca (confirma que el tipo cambió)
    await expect(main.getByLabel(/Referencia comercial/i)).toBeVisible();
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Origen' }),
      'BOD-01 · Bodega principal (Bodega principal)',
    );
    await addIssueCatalogItemsToDraft(main, [/Seleccionar CAB-DROP · Cable drop/i]);
    await main.getByLabel('Referencia comercial (opcional)').fill('OC-VENTA-001');
    await main.getByRole('button', { name: 'Crear salida' }).click();

    await expect(
      main.getByText('Salida creada. Puedes despacharla cuando esté lista.'),
    ).toBeVisible();

    await main.getByRole('button', { name: 'Despachar' }).first().click();
    const detail = page.getByRole('dialog', { name: 'Detalle de salida' });
    await expect(detail).toBeVisible();
    await confirmIssueDispatch(page, detail);

    await expect(main.getByText(/Salida despachada/i)).toBeVisible();
  });

  test('crea salida con varias líneas desde el compositor', async ({ page }) => {
    await page.goto('/dashboard/inventory');
    const main = page.locator('main');

    await openStockIssueComposer(main);
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Tipo' }),
      'Entrega a técnico',
    );
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Origen' }),
      'BOD-01 · Bodega principal (Bodega principal)',
    );
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Destino' }),
      'TEC-01 · Custodia técnico (Técnico en campo)',
    );
    await expect(main.getByRole('tab', { name: /Con material/i })).toBeVisible();
    await expect(main.getByText(/Disponible en origen/i).first()).toBeVisible();
    await main.getByRole('tab', { name: /^Catálogo \(\d+\)/ }).click();
    await addIssueCatalogItemsToDraft(main, [
      /Seleccionar ONT-HG8245 · ONT Huawei HG8245/i,
      /Seleccionar CAB-DROP · Cable drop/i,
    ]);
    await assignIssueLineSerial(page, main, 'ONT-HG8245');
    await main.getByRole('button', { name: 'Crear salida' }).click();

    await expect(
      main.getByText('Salida creada. Puedes despacharla cuando esté lista.'),
    ).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Salidas', exact: true })).toBeVisible();
  });

  test('no ofrece CUSTOMER_SITE como destino de salida manual', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;

    // Agregar una ubicación tipo CUSTOMER_SITE al pool de mocks
    state.locations.push(
      buildLocation({
        id: 'loc-customer-01',
        code: 'CLI-001',
        name: 'Sitio cliente demo',
        type: 'CUSTOMER_SITE',
      }),
    );

    await page.goto('/dashboard/inventory');
    const main = page.locator('main');

    await openStockIssueComposer(main);

    // TECHNICIAN_CUSTODY (por defecto) — verificar que Destino no ofrece CUSTOMER_SITE
    await main.getByRole('combobox', { name: 'Destino' }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    const destOptionTexts = await page.getByRole('listbox').getByRole('option').allTextContents();
    expect(destOptionTexts.every((opt) => !opt.includes('CLI-001'))).toBe(true);
    expect(destOptionTexts.every((opt) => !opt.includes('Sitio cliente demo'))).toBe(true);

    // WAREHOUSE_TO_WAREHOUSE también debe excluir CUSTOMER_SITE
    // (el mousedown al clickear el trigger de Tipo cierra el listbox de Destino)
    await selectComboboxOption(page, main.getByRole('combobox', { name: 'Tipo' }), 'Entre bodegas');
    await main.getByRole('combobox', { name: 'Destino' }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    const wtwOptionTexts = await page.getByRole('listbox').getByRole('option').allTextContents();
    expect(wtwOptionTexts.every((opt) => !opt.includes('CLI-001'))).toBe(true);
    expect(wtwOptionTexts.every((opt) => !opt.includes('Sitio cliente demo'))).toBe(true);
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

  test('ejecuta flujo RFQ: crear, invitar, enviar y descargar PDF', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;
    state.purchaseRequests.unshift(
      buildPurchaseRequest({
        id: 'pr-rfq-1',
        requestNumber: 'PR-000300',
        title: 'Compra con cotización formal',
        status: 'DRAFT',
        approvedByUserId: null,
      }),
    );

    await page.goto('/dashboard/inventory');
    const main = page.locator('main');
    await main.getByRole('tab', { name: 'Compras' }).click();
    await main.getByRole('button', { name: 'Abrir' }).first().click();

    const workbench = page.getByRole('dialog').filter({ hasText: 'Trabajar solicitud' });
    await workbench.getByRole('tab', { name: 'Cotizar' }).click();
    await workbench.getByRole('button', { name: 'Crear solicitud de cotización' }).click();
    await expect(workbench.getByText('RFQ-000001')).toBeVisible();
    await expect(workbench.getByText('Borrador')).toBeVisible();

    await workbench.getByRole('combobox', { name: 'Invitar proveedores' }).fill('Demo');
    await page
      .getByRole('listbox')
      .getByRole('option', { name: /Proveedor Demo/i })
      .click();
    await workbench.getByRole('button', { name: 'Invitar seleccionados' }).click();
    await expect(workbench.getByText('Proveedor Demo')).toBeVisible();
    await expect(workbench.getByText('Invitado', { exact: true })).toBeVisible();

    await workbench.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(workbench.getByText('Enviada', { exact: true })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await workbench.getByRole('button', { name: 'Descargar PDF' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/RFQ-.*\.pdf$/);
  });

  test('rechaza invitar a un proveedor BLOCKED en el RFQ (RF-PROV-08)', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;
    // Precondicion: el proveedor Demo (party-001) queda BLOCKED.
    const demoProfile = state.supplierProfiles.find((entry) => entry.partyRefId === 'party-001');
    if (demoProfile) {
      demoProfile.status = 'BLOCKED';
    }
    state.purchaseRequests.unshift(
      buildPurchaseRequest({
        id: 'pr-rfq-blocked',
        requestNumber: 'PR-000400',
        title: 'Compra con proveedor bloqueado',
        status: 'DRAFT',
        approvedByUserId: null,
      }),
    );

    await page.goto('/dashboard/inventory');
    const main = page.locator('main');
    await main.getByRole('tab', { name: 'Compras' }).click();
    await main.getByRole('button', { name: 'Abrir' }).first().click();

    const workbench = page.getByRole('dialog').filter({ hasText: 'Trabajar solicitud' });
    await workbench.getByRole('tab', { name: 'Cotizar' }).click();
    await workbench.getByRole('button', { name: 'Crear solicitud de cotización' }).click();
    await expect(workbench.getByText('RFQ-000001')).toBeVisible();

    await workbench.getByRole('combobox', { name: 'Invitar proveedores' }).fill('Demo');
    await page
      .getByRole('listbox')
      .getByRole('option', { name: /Proveedor Demo/i })
      .click();
    await workbench.getByRole('button', { name: 'Invitar seleccionados' }).click();

    // El backend (mock, con paridad de enforcement) rechaza al proveedor bloqueado.
    await expect(workbench.getByText(/está bloqueado y no puede usarse/i)).toBeVisible();
    // No se registro la invitacion.
    expect(state.purchaseRfqInvitations).toHaveLength(0);
  });

  test('rechaza emitir OC a un proveedor BLOCKED (RF-PROV-08)', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;
    const ordersBefore = state.purchaseOrders.length;
    // Precondicion: el proveedor Demo (party-001) queda BLOCKED.
    const demoProfile = state.supplierProfiles.find((entry) => entry.partyRefId === 'party-001');
    if (demoProfile) {
      demoProfile.status = 'BLOCKED';
    }

    await page.goto('/dashboard/inventory');
    const main = page.locator('main');

    await main.getByRole('tab', { name: 'Compras' }).click();
    await main.getByRole('button', { name: 'Abrir' }).first().click();

    const workbench = page.getByRole('dialog').filter({ hasText: 'Trabajar solicitud' });
    await expect(workbench.getByRole('heading', { name: 'Trabajar solicitud' })).toBeVisible();
    await workbench.getByRole('button', { name: 'Ir a órdenes' }).click();
    await workbench.getByRole('button', { name: 'Generar orden de compra' }).click();

    const orderDrawer = page.getByRole('dialog', { name: 'Orden de compra' });
    await expect(orderDrawer.getByRole('heading', { name: 'Orden de compra' })).toBeVisible();
    await orderDrawer.getByLabel('Proveedor').fill('Demo');
    await orderDrawer.getByRole('option', { name: /Proveedor Demo/i }).click();

    const itemSelect = orderDrawer.getByRole('combobox', { name: 'Producto' });
    await itemSelect.click();
    await page.getByRole('option', { name: /ONT Huawei HG8245/i }).click();

    await orderDrawer.getByRole('button', { name: 'Generar orden de compra' }).click();

    // El backend (mock, con paridad de enforcement) rechaza la OC al proveedor bloqueado.
    await expect(page.getByText(/está bloqueado y no puede usarse/i)).toBeVisible();
    expect(state.purchaseOrders).toHaveLength(ordersBefore);
  });

  test('adjudica líneas aprobadas y genera OC', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;
    state.purchaseRequestLines.push({
      id: 'prl-award-1',
      tenantId: 'tenant-inventory-001',
      purchaseRequestId: PR_SEED_ID,
      inventoryItemId: ITEM_ID,
      freeTextDescription: null,
      quantityRequested: '2',
      unitOfMeasure: 'UND',
      lineStatus: 'OPEN',
      sourceKind: 'INVENTORY_ITEM',
      suggestedPartyRefId: null,
      createdAt: nowIso(-1000),
      updatedAt: nowIso(-1000),
    });
    state.supplierQuotes.push({
      id: 'sq-award-1',
      tenantId: 'tenant-inventory-001',
      purchaseRequestId: PR_SEED_ID,
      partyRefId: 'party-001',
      quoteNumber: 'COT-AWARD-01',
      amount: '370000',
      shippingCost: '0',
      currency: 'COP',
      validUntil: '2026-08-01',
      lines: [
        {
          id: 'sql-award-1',
          tenantId: 'tenant-inventory-001',
          supplierQuoteId: 'sq-award-1',
          purchaseRequestLineId: 'prl-award-1',
          quantity: '2',
          unitCost: '185000',
          lineAmount: '370000',
          createdAt: nowIso(-500),
          updatedAt: nowIso(-500),
        },
      ],
      createdAt: nowIso(-500),
      updatedAt: nowIso(-500),
    });

    await page.goto('/dashboard/inventory');
    const main = page.locator('main');
    await main.getByRole('tab', { name: 'Compras' }).click();
    await main.getByRole('button', { name: 'Abrir' }).first().click();

    const workbench = page.getByRole('dialog').filter({ hasText: 'Trabajar solicitud' });
    await expect(workbench.getByText(/Adjudica las líneas/i)).toBeVisible();
    await workbench.getByRole('tab', { name: 'Adjudicación' }).click();
    await workbench.getByRole('button', { name: /Usar COT-AWARD-01/i }).click();
    await workbench.getByRole('button', { name: 'Adjudicar líneas' }).click();
    await expect(workbench.getByText('Adjudicaciones registradas')).toBeVisible();

    await workbench.getByRole('tab', { name: 'Órdenes' }).click();
    await workbench.getByRole('button', { name: 'Generar órdenes desde adjudicación' }).click();

    const orderDrawer = page.getByRole('dialog', {
      name: 'Órdenes de compra desde adjudicación',
    });
    await orderDrawer.getByRole('button', { name: /Generar 1 orden/i }).click();
    await expect(
      orderDrawer.getByText(/ordenes de compra generadas|orden de compra.*generada/i),
    ).toBeVisible();
    await orderDrawer.getByRole('button', { name: 'Ir a recepciones' }).click();

    await expect(workbench.getByRole('tab', { name: 'Recepciones' })).toBeVisible();
    expect(state.purchaseAwards).toHaveLength(1);
    expect(state.purchaseOrders.length).toBeGreaterThan(0);
  });

  test('rechaza solicitud PENDING_QUOTES y cierra RFQ activa', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;
    state.purchaseRequests.unshift(
      buildPurchaseRequest({
        id: 'pr-reject-1',
        requestNumber: 'PR-000501',
        title: 'Solicitud a rechazar',
        status: 'PENDING_QUOTES',
        approvedByUserId: null,
      }),
    );
    state.purchaseRfqs.push({
      id: 'rfq-reject-1',
      tenantId: 'tenant-inventory-001',
      purchaseRequestId: 'pr-reject-1',
      rfqNumber: 'RFQ-000501',
      status: 'SENT',
      currency: 'COP',
      responseDeadline: null,
      sentAt: nowIso(-10),
      closedAt: null,
      createdByUserId: NOC_USER_ID,
      notes: null,
      createdAt: nowIso(-20),
      updatedAt: nowIso(-10),
    });
    state.purchaseRfqInvitations.push({
      id: 'rfq-inv-reject-1',
      tenantId: 'tenant-inventory-001',
      rfqId: 'rfq-reject-1',
      partyRefId: 'party-001',
      status: 'INVITED',
      invitedAt: nowIso(-10),
      respondedAt: null,
      declinedAt: null,
      declineReason: null,
      createdAt: nowIso(-10),
      updatedAt: nowIso(-10),
    });

    await page.goto('/dashboard/inventory');
    const main = page.locator('main');
    await main.getByRole('tab', { name: 'Compras' }).click();
    await main.getByRole('button', { name: 'Abrir' }).first().click();

    const workbench = page.getByRole('dialog').filter({ hasText: 'Trabajar solicitud' });
    await workbench.getByRole('button', { name: 'Rechazar' }).click();
    await workbench
      .getByLabel('Motivo del rechazo')
      .fill('Cotización fuera de presupuesto operativo');
    await workbench.getByRole('button', { name: 'Confirmar rechazo' }).click();

    await expect(main.getByRole('cell', { name: 'Rechazada', exact: true })).toBeVisible();
    expect(state.purchaseRequests[0]?.status).toBe('REJECTED');
    expect(state.purchaseRfqs[0]?.status).toBe('CANCELLED');
    expect(state.purchaseRfqInvitations[0]?.status).toBe('CANCELLED');
  });

  test('cancela solicitud APPROVED con motivo', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;

    await page.goto('/dashboard/inventory');
    const main = page.locator('main');
    await main.getByRole('tab', { name: 'Compras' }).click();
    await main.getByRole('button', { name: 'Abrir' }).first().click();

    const workbench = page.getByRole('dialog').filter({ hasText: 'Trabajar solicitud' });
    await workbench.getByRole('button', { name: 'Cancelar solicitud' }).click();
    await workbench.getByLabel('Motivo de cancelación').fill('Ya no se requiere el material');
    await workbench.getByRole('button', { name: 'Confirmar cancelación' }).click();

    await expect(main.getByRole('cell', { name: 'Cancelada', exact: true })).toBeVisible();
    expect(state.purchaseRequests[0]?.status).toBe('CANCELLED');
  });
});

test.describe('Portal Inventario / Existencias', () => {
  test.beforeEach(async ({ page }) => {
    const state = createInventoryMockState();
    await setupInventoryMocks(page, state);
    await seedPortalSession(page);
    (page as unknown as { inventoryMockState: InventoryMockState }).inventoryMockState = state;
  });

  test('abre pestaña Existencias con deep-link tab=stock', async ({ page }) => {
    await page.goto('/dashboard/inventory?tab=stock');
    const main = page.locator('main');

    await expect(main.getByRole('tab', { name: 'Existencias', selected: true })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Existencias' })).toBeVisible();
    await expect(main.getByRole('tab', { name: 'Por producto', selected: true })).toBeVisible();
    await expect(main.getByText('CAB-DROP')).toBeVisible();
    await expect(main.getByText('ONT-HG8245')).toBeVisible();
  });

  test('redirige custody=mobile de Bodegas a Existencias y filtra matriz', async ({ page }) => {
    await page.goto('/dashboard/inventory?tab=locations&custody=mobile');
    const main = page.locator('main');

    await expect(main.getByRole('tab', { name: 'Existencias', selected: true })).toBeVisible();
    await expect(page).toHaveURL(/tab=stock/);
    await expect(page).toHaveURL(/custody=mobile/);

    await expect(main.getByRole('tab', { name: 'Por bodega', selected: true })).toBeVisible();
    await expect(main.getByText('Custodia técnico')).toBeVisible();
    await expect(main.getByText('Móvil con tope')).toBeVisible();
    await expect(main.getByText('BOD-01')).toHaveCount(0);
  });

  test('muestra kardex con movimiento seed y permite expandir líneas', async ({ page }) => {
    await page.goto('/dashboard/inventory?tab=stock');
    const main = page.locator('main');

    await main.getByRole('tab', { name: 'Kardex' }).click();
    await expect(main.getByText('MOV-000100')).toBeVisible();
    await expect(main.getByRole('cell', { name: 'Recepción de compra' })).toBeVisible();

    await main.getByRole('button', { name: 'Expandir líneas' }).click();
    await expect(main.getByText(/CAB-DROP · Bodega principal/)).toBeVisible();
  });

  test('registra ajuste desde Por producto y lo refleja en kardex', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;

    await page.goto('/dashboard/inventory?tab=stock');
    const main = page.locator('main');

    await main
      .locator('tr')
      .filter({ hasText: 'CAB-DROP' })
      .getByRole('button', { name: 'Ajustar' })
      .click();

    const dialog = page.getByRole('dialog', { name: 'Ajuste de inventario' });
    await expect(dialog).toBeVisible();
    await selectComboboxOption(
      page,
      dialog.getByRole('combobox', { name: 'Bodega' }),
      'BOD-01 · Bodega principal',
    );
    await selectComboboxOption(
      page,
      dialog.getByRole('combobox', { name: 'Dirección' }),
      'Entrada',
    );
    await dialog.getByLabel('Cantidad').fill('2');
    await selectComboboxOption(
      page,
      dialog.getByRole('combobox', { name: 'Razón' }),
      'Conteo físico',
    );
    await dialog.getByRole('button', { name: 'Registrar ajuste' }).click();

    await expect(page.getByRole('dialog', { name: 'Ajuste de inventario' })).toHaveCount(0);
    await expect(main.getByText(/Ajuste registrado: MOV-/)).toBeVisible();
    expect(state.adjustmentCount).toBe(1);
    expect(state.movements[0]?.origin).toBe('ADJUSTMENT');

    await main.getByRole('tab', { name: 'Kardex' }).click();
    await expect(main.getByRole('cell', { name: 'Ajuste' }).first()).toBeVisible();
    await expect(main.getByRole('cell', { name: 'Conteo físico' })).toBeVisible();
  });

  test('bloquea ajuste que dejaría saldo negativo', async ({ page }) => {
    await page.goto('/dashboard/inventory?tab=stock');
    const main = page.locator('main');

    await main
      .locator('tr')
      .filter({ hasText: 'CAB-DROP' })
      .getByRole('button', { name: 'Ajustar' })
      .click();

    const dialog = page.getByRole('dialog', { name: 'Ajuste de inventario' });
    await selectComboboxOption(
      page,
      dialog.getByRole('combobox', { name: 'Bodega' }),
      'BOD-01 · Bodega principal',
    );
    await selectComboboxOption(page, dialog.getByRole('combobox', { name: 'Dirección' }), 'Salida');
    await dialog.getByLabel('Cantidad').fill('99');
    await dialog.getByRole('button', { name: 'Registrar ajuste' }).click();

    await expect(dialog.getByText('El movimiento dejaría saldo negativo.')).toBeVisible();
  });

  test('permite drill-down de balances por ubicación en Por bodega', async ({ page }) => {
    await page.goto('/dashboard/inventory?tab=stock');
    const main = page.locator('main');

    await main.getByRole('tab', { name: 'Por bodega' }).click();
    await main.getByRole('button', { name: 'Ver existencias de Bodega principal' }).click();
    await expect(main.getByText(/ONT-HG8245 · ONT Huawei HG8245/i)).toBeVisible();
  });

  test('muestra valor estimado de inventario en Resumen', async ({ page }) => {
    await page.goto('/dashboard/inventory?tab=summary');
    const main = page.locator('main');

    await expect(main.getByText('Valor estimado de inventario')).toBeVisible();
    await expect(main.getByText(/\$\s*2[.\s]?500[.\s]?000/)).toBeVisible();
  });

  test('genera solicitud desde Reposición con composer prellenado y abre workbench', async ({
    page,
  }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;

    await page.goto('/dashboard/inventory?tab=stock');
    const main = page.locator('main');

    await main.getByRole('tab', { name: 'Reposición' }).click();
    await expect(main.getByText('CAB-DROP')).toBeVisible();
    await expect(main.getByText('Sin stock')).toBeVisible();

    // Solo el crítico (out) viene preseleccionado; el ONT below-minimum no.
    await expect(main.getByRole('checkbox', { name: /Seleccionar CAB-DROP/i })).toBeChecked();
    await expect(main.getByRole('checkbox', { name: /Seleccionar ONT-HG8245/i })).not.toBeChecked();

    await main.getByRole('button', { name: /Generar solicitud de compra \(1\)/i }).click();

    await expect(main.getByRole('tab', { name: 'Compras', selected: true })).toBeVisible();
    await expect(main.getByLabel('Título')).toHaveValue(
      /Reposición sugerida .+ — 1 ítem bajo punto de reorden/,
    );
    await expect(main.getByLabel('Área solicitante')).toHaveValue('Existencias');
    await expect(main.getByText(/CAB-DROP - Cable drop/i)).toBeVisible();

    await main.getByRole('button', { name: 'Crear solicitud' }).click();

    const workbench = page.getByRole('dialog', { name: 'Trabajar solicitud' });
    await expect(workbench).toBeVisible();
    // DRAFT abre en Cotizar (next-action); las líneas de reposición alimentan el borrador de cotización.
    await expect(workbench.getByText('Cable drop')).toBeVisible();
    await expect(workbench.getByRole('cell', { name: '40' })).toBeVisible();
    await expect(
      main.getByRole('button', { name: /PR-\d+ Reposición sugerida .+ — 1 ítem/ }),
    ).toBeVisible();

    const created = state.purchaseRequests.find((entry) =>
      String(entry.title ?? '').startsWith('Reposición sugerida'),
    );
    expect(created).toBeTruthy();
    expect(created?.requestType).toBe('REPLENISHMENT');
    expect(created?.requestingArea).toBe('Existencias');
    expect(
      state.purchaseRequestLines.some(
        (line) =>
          line.purchaseRequestId === created?.id &&
          line.sourceKind === 'REPLENISHMENT_SUGGESTION' &&
          line.inventoryItemId === ITEM_CONSUMABLE_ID,
      ),
    ).toBe(true);
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
    await expect(main.getByRole('heading', { name: 'Bodegas' })).toBeVisible();
    await expect(main.getByText('BOD-01')).toBeVisible();
  });

  test('crea bodega desde UI', async ({ page }) => {
    const state = (page as unknown as { inventoryMockState: InventoryMockState })
      .inventoryMockState;

    await page.goto('/dashboard/inventory?tab=locations');
    const main = page.locator('main');

    await main.getByRole('button', { name: 'Crear bodega' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre de la bodega').fill('Cuarentena operativa');
    await selectComboboxOption(page, dialog.getByRole('combobox', { name: 'Tipo' }), 'En revisión');
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
      dialog.getByRole('combobox', { name: 'Persona a cargo' }),
      MOBILE_RESPONSIBLE_NAME,
    );
    await dialog.getByLabel('Límite de unidades').fill('24');
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

    await openStockIssueComposer(main);
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Tipo' }),
      'Entrega a técnico',
    );
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Origen' }),
      'BOD-01 · Bodega principal (Bodega principal)',
    );
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Destino' }),
      'TEC-01 · Custodia técnico (Técnico en campo)',
    );
    await addIssueCatalogItemsToDraft(main, [/Seleccionar CAB-DROP · Cable drop/i]);
    await main.getByLabel('Cantidad CAB-DROP · Cable drop').fill('99');
    await main.getByRole('button', { name: 'Crear salida' }).click();

    await main.getByRole('button', { name: 'Despachar' }).first().click();
    const detail = page.getByRole('dialog', { name: 'Detalle de salida' });
    await confirmIssueDispatch(page, detail);

    await expect(
      detail.getByText('La cantidad solicitada excede el saldo disponible en la ubicación origen.'),
    ).toBeVisible();
  });

  test('bloquea salida sin cupo en bodega móvil', async ({ page }) => {
    await page.goto('/dashboard/inventory?tab=locations');
    const main = page.locator('main');

    await openStockIssueComposer(main);
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Tipo' }),
      'Entrega a técnico',
    );
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Origen' }),
      'BOD-01 · Bodega principal (Bodega principal)',
    );
    await selectComboboxOption(
      page,
      main.getByRole('combobox', { name: 'Destino' }),
      'MOV-03 · Móvil con tope (Técnico en campo)',
    );
    await addIssueCatalogItemsToDraft(main, [/Seleccionar ONT-HG8245 · ONT Huawei HG8245/i]);
    await assignIssueLineSerial(page, main, 'ONT-HG8245');
    await main.getByRole('button', { name: 'Crear salida' }).click();

    await main.getByRole('button', { name: 'Despachar' }).first().click();
    const detail = page.getByRole('dialog', { name: 'Detalle de salida' });
    await confirmIssueDispatch(page, detail);

    await expect(
      detail.getByText('La bodega móvil destino supera su capacidad máxima.'),
    ).toBeVisible();
  });

  test.describe('gestión de proveedores', () => {
    test('registra, reutiliza, edita y bloquea proveedores', async ({ page }) => {
      const state = (page as unknown as { inventoryMockState: InventoryMockState })
        .inventoryMockState;

      await page.goto('/dashboard/inventory?tab=suppliers');
      const main = page.locator('main');

      await expect(main.getByRole('heading', { name: 'Proveedores' })).toBeVisible();
      await expect(main.getByText('Proveedor Demo')).toBeVisible();

      await main.getByRole('button', { name: 'Nuevo proveedor' }).first().click();
      let drawer = page.getByRole('dialog', { name: 'Nuevo proveedor' });
      await drawer.getByLabel('Número de documento').fill('901777888');
      await drawer.getByLabel('Nombre').fill('Redes del Caribe SAS');
      await drawer.getByRole('button', { name: 'Continuar' }).click();
      await drawer.getByLabel('Plazo de pago (días)').fill('45');
      await drawer.getByLabel('Contacto de compras').fill('María Compras');
      await drawer.getByRole('button', { name: 'Crear proveedor' }).click();

      await expect(main.getByText('Redes del Caribe SAS')).toBeVisible();
      expect(
        state.supplierProfiles.some(
          (entry) =>
            (entry.party as { displayName?: string } | undefined)?.displayName ===
            'Redes del Caribe SAS',
        ),
      ).toBe(true);

      await main.getByRole('button', { name: 'Nuevo proveedor' }).first().click();
      drawer = page.getByRole('dialog', { name: 'Nuevo proveedor' });
      await drawer.getByLabel('Número de documento').fill(REUSE_DOCUMENT_NUMBER);
      await drawer.getByRole('button', { name: 'Buscar documento' }).click();
      await expect(drawer.getByLabel('Nombre')).toHaveValue('Distribuidora Andina SAS');
      await expect(drawer.getByText('Se reutilizará la identidad de este tercero')).toBeVisible();
      // B4: la ficha del tercero hallado se muestra para confirmar la identidad reutilizada.
      await expect(drawer.getByText('Barranquilla')).toBeVisible();
      await drawer.getByRole('button', { name: 'Continuar' }).click();
      await drawer.getByLabel('Contacto de compras').fill('Equipo Andina');
      await drawer.getByRole('button', { name: 'Crear proveedor' }).click();

      expect(
        state.supplierProfiles.filter((entry) => entry.partyRefId === PARTY_REUSE_ID).length,
      ).toBeGreaterThan(0);

      await main.getByRole('button', { name: 'Editar proveedor Proveedor Demo' }).click();
      drawer = page.getByRole('dialog', { name: 'Editar proveedor' });
      await drawer.getByLabel('Plazo de pago (días)').fill('60');
      await drawer.getByLabel('Notas').fill('Condiciones comerciales actualizadas.');
      await drawer.getByRole('button', { name: 'Guardar cambios' }).click();

      const updatedProfile = state.supplierProfiles.find(
        (entry) => entry.supplierCode === 'PROV-001',
      );
      expect(updatedProfile?.paymentTermsDays).toBe(60);
      expect(updatedProfile?.notes).toBe('Condiciones comerciales actualizadas.');
      await drawer.getByRole('button', { name: 'Cerrar' }).click();

      await main.getByRole('button', { name: 'Editar proveedor Proveedor Demo' }).click();
      drawer = page.getByRole('dialog', { name: 'Editar proveedor' });
      await drawer.getByRole('button', { name: 'Bloquear' }).click();

      const blockedProfile = state.supplierProfiles.find(
        (entry) => entry.supplierCode === 'PROV-001',
      );
      expect(blockedProfile?.status).toBe('BLOCKED');
      // El drawer puede seguir abierto con su propio badge; cerrar y asertar en la lista.
      await drawer.getByRole('button', { name: 'Cerrar' }).click();
      await expect(page.getByRole('dialog', { name: 'Editar proveedor' })).toHaveCount(0);
      await expect(
        main.locator('tr').filter({ hasText: 'PROV-001' }).getByText('Bloqueado'),
      ).toBeVisible();
    });
  });
});
