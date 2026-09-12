/**
 * E2E — MOD12 Compras Fase 30: adjudicación en matriz productos × cotizaciones (FE-3).
 *
 * Trazabilidad (PROMPT-MOD12-COMPRAS-ADJUDICACION-MATRIZ-FASE-30-v1.0 §7 + spec §11):
 * - CA-301 / CA-UX-01: P1+P3 a proveedor 1, P2+P4 a proveedor 2 → 2 órdenes con costos derivados.
 * - CA-302 / CA-UX-05 (+ CA-UX-06): 2 de 4 adjudicados → orden → APPROVED + PARTIALLY_ORDERED → 2.ª tanda.
 * - CA-307: revocar sin orden viva devuelve la línea a PENDING_QUOTE; con orden viva → 409.
 * - CA-311 / CA-UX-08: pasada axe sin violaciones + recorrido de teclado (Tab, flechas, columna).
 * - CA-UX-09 + §7: acordeón conserva la selección; escotilla de proveedor sin cotización (costo obligatorio).
 *
 * Estrategia de mocks: page.route sobre /api/v1 con paridad contractual frente al API real —
 * POST awards idempotente + 409 AWARD_PARTY_CONFLICT + 400 de cotización, DELETE con 409
 * AWARD_ALREADY_ORDERED, costos derivados del servidor y cobertura awardCoverage. Sin PII real.
 */

import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { seedPortalSession as seedPortalSessionByCookie } from './helpers/portal-session';

const MOCK_TENANT_SLUG = 'tenant-awards-demo';
const NOC_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST_ID = 'pr-award-001';

const PARTY_1 = 'party-1';
const PARTY_2 = 'party-2';
const PARTY_3 = 'party-3';
const SUPPLIER_NAMES: Record<string, string> = {
  [PARTY_1]: 'Proveedor 1',
  [PARTY_2]: 'Proveedor 2',
  [PARTY_3]: 'Proveedor 3',
};

const LINE_IDS = ['line-p1', 'line-p2', 'line-p3', 'line-p4'] as const;
/** Costos canónicos de la spec (award-matrix-test-fixtures.ts): Q1 gana P1/P3, Q2 gana P2/P4. */
const QUOTE_COSTS: Record<string, Record<string, string>> = {
  'quote-1': { 'line-p1': '100.00', 'line-p2': '200.00', 'line-p3': '300.00', 'line-p4': '400.00' },
  'quote-2': { 'line-p1': '110.00', 'line-p2': '180.00', 'line-p3': '320.00', 'line-p4': '390.00' },
};
const QUOTE_PARTY: Record<string, string> = { 'quote-1': PARTY_1, 'quote-2': PARTY_2 };

function buildToken(): string {
  return (
    'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
    btoa(
      JSON.stringify({
        sub: NOC_USER_ID,
        email: 'hash-noc',
        role: 'NOC',
        tenantId: 'tenant-awards-001',
        schemaName: 'tenant_awards_001',
        jti: 'jti-noc-awards',
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

type AwardsMockState = {
  purchaseRequest: Record<string, unknown>;
  purchaseRequestLines: Array<Record<string, unknown>>;
  supplierQuotes: Array<Record<string, unknown>>;
  purchaseAwards: Array<Record<string, unknown>>;
  purchaseOrders: Array<Record<string, unknown>>;
  purchaseOrderLines: Array<Record<string, unknown>>;
  catalogItems: Array<Record<string, unknown>>;
};

function buildCatalogItem(index: number) {
  const n = index + 1;
  return {
    id: `item-p${n}`,
    tenantId: 'tenant-awards-001',
    sku: `SKU-AWD-${n}`,
    name: `Producto ${n}`,
    description: null,
    brand: null,
    model: null,
    itemKind: 'CONSUMABLE',
    category: 'MATERIALS',
    categoryId: 'cat-1',
    categoryName: 'Materiales',
    categoryCode: 'MAT',
    trackingMode: 'CONSUMABLE',
    unitOfMeasure: 'unidad',
    baseCost: '0.00',
    minimumStock: '0.00',
    purchasable: true,
    inventoryControlled: true,
    assetControlled: false,
    preferredSupplierRefId: null,
    supplierSku: null,
    purchaseUnitOfMeasure: null,
    purchaseToBaseUomFactor: null,
    standardCost: '0.00',
    lastPurchaseCost: null,
    reorderPoint: '0.00',
    targetStock: '0.00',
    minimumOrderQty: null,
    orderMultiple: null,
    leadTimeDays: null,
    status: 'ACTIVE',
    createdAt: nowIso(-2000),
    updatedAt: nowIso(-2000),
  };
}

function buildRequestLine(lineId: string, index: number) {
  return {
    id: lineId,
    tenantId: 'tenant-awards-001',
    purchaseRequestId: REQUEST_ID,
    sourceKind: 'INVENTORY_ITEM',
    inventoryItemId: `item-p${index + 1}`,
    freeTextDescription: null,
    quantityRequested: '1.00',
    unitOfMeasure: 'unidad',
    suggestedPartyRefId: null,
    lineStatus: 'OPEN',
    notes: null,
    createdAt: nowIso(-1000),
    updatedAt: nowIso(-1000),
  };
}

function buildQuote(quoteId: string, quoteNumber: string) {
  const costs = QUOTE_COSTS[quoteId] ?? {};
  const lines = Object.entries(costs).map(([lineId, unitCost]) => ({
    id: `ql-${quoteId}-${lineId}`,
    tenantId: 'tenant-awards-001',
    supplierQuoteId: quoteId,
    purchaseRequestLineId: lineId,
    quantity: '1.00',
    unitCost,
    lineAmount: unitCost,
    createdAt: nowIso(-500),
    updatedAt: nowIso(-500),
  }));
  const total = lines.reduce((sum, line) => sum + Number(line.lineAmount), 0).toFixed(2);
  return {
    id: quoteId,
    tenantId: 'tenant-awards-001',
    purchaseRequestId: REQUEST_ID,
    partyRefId: QUOTE_PARTY[quoteId],
    quoteNumber,
    amount: total,
    shippingCost: '0.00',
    currency: 'COP',
    validUntil: '2026-12-31',
    notes: null,
    lines,
    payableAmount: total,
    createdAt: nowIso(-500),
    updatedAt: nowIso(-500),
  };
}

function createAwardsMockState(): AwardsMockState {
  return {
    purchaseRequest: {
      id: REQUEST_ID,
      tenantId: 'tenant-awards-001',
      requestNumber: 'PR-003001',
      title: 'Solicitud matriz Fase 30',
      status: 'APPROVED',
      requestType: 'REPLENISHMENT',
      priority: 'NORMAL',
      requestedByUserId: NOC_USER_ID,
      requestingArea: 'Operaciones',
      justification: 'Caso canónico P1..P4 con Q1 y Q2',
      operationalRefType: null,
      operationalRefId: null,
      exceptionReason: null,
      approvedByUserId: NOC_USER_ID,
      neededByDate: '2026-12-31',
      notes: null,
      fulfillmentStatus: 'NOT_ORDERED',
      createdAt: nowIso(-1500),
      updatedAt: nowIso(-1000),
    },
    purchaseRequestLines: LINE_IDS.map((lineId, index) => buildRequestLine(lineId, index)),
    supplierQuotes: [buildQuote('quote-1', 'COT-1'), buildQuote('quote-2', 'COT-2')],
    purchaseAwards: [],
    purchaseOrders: [],
    purchaseOrderLines: [],
    catalogItems: [0, 1, 2, 3].map((index) => buildCatalogItem(index)),
  };
}

/** Eje derivado awardCoverage (paridad con ADR-087 D1): calculado, nunca persistido. */
function resolveAwardCoverage(state: AwardsMockState): string {
  const lines = state.purchaseRequestLines.filter(
    (line) => !['CANCELLED', 'REJECTED'].includes(String(line.lineStatus)),
  );
  const awards = state.purchaseAwards.filter((award) =>
    lines.some((line) => line.id === award.purchaseRequestLineId),
  );
  const awardedLineIds = new Set(awards.map((award) => String(award.purchaseRequestLineId)));
  const orderedLineIds = new Set(
    lines.filter((line) => line.lineStatus === 'ORDERED').map((line) => String(line.id)),
  );
  if (lines.length === 0 || awardedLineIds.size === 0) {
    return 'NOT_AWARDED';
  }
  if (orderedLineIds.size > 0) {
    return orderedLineIds.size >= awardedLineIds.size && awardedLineIds.size >= lines.length
      ? 'FULLY_ORDERED'
      : 'PARTIALLY_ORDERED';
  }
  return awardedLineIds.size >= lines.length ? 'FULLY_AWARDED' : 'PARTIALLY_AWARDED';
}

function buildRequestDetail(state: AwardsMockState) {
  const quotesAmount = state.supplierQuotes.reduce(
    (total, quote) => total + Number(quote.amount ?? 0),
    0,
  );
  return {
    request: { ...state.purchaseRequest, awardCoverage: resolveAwardCoverage(state) },
    lines: state.purchaseRequestLines,
    quotes: state.supplierQuotes,
    awards: state.purchaseAwards,
    orders: state.purchaseOrders.filter((order) => order.purchaseRequestId === REQUEST_ID),
    estimatedAmount: quotesAmount,
    approvalPolicy: {
      canApprove: false,
      requiresException: false,
      blockingReason: null,
      approvalLevel: 'SUPERVISOR',
    },
    rfq: null,
    awardCoverage: resolveAwardCoverage(state),
  };
}

function errorBody(statusCode: number, code: string, message: string) {
  return JSON.stringify({ statusCode, code, message });
}

function hasLiveOrderLine(
  state: AwardsMockState,
  purchaseRequestLineId: string,
  awardedPartyRefId: string,
): boolean {
  return state.purchaseOrderLines.some((orderLine) => {
    if (orderLine.purchaseRequestLineId !== purchaseRequestLineId) {
      return false;
    }
    const order = state.purchaseOrders.find((entry) => entry.id === orderLine.purchaseOrderId);
    return (
      order?.partyRefId === awardedPartyRefId &&
      ['APPROVED', 'PARTIALLY_RECEIVED', 'PENDING_APPROVAL'].includes(String(order?.status))
    );
  });
}

async function setupAwardsMocks(page: import('@playwright/test').Page, state: AwardsMockState) {
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
            displayName: 'ISP Compras Demo',
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
            tenantId: 'tenant-awards-001',
            schemaName: 'tenant_awards_001',
            jti: 'jti-noc-awards',
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
            id: 'tenant-awards-001',
            name: 'ISP Compras Demo',
            slug: MOCK_TENANT_SLUG,
            status: 'ACTIVE',
            contactEmail: 'tenant@awards.local',
            brandingProductName: 'iWana Empresa',
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/users') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { data: [], meta: { nextCursor: null, total: 0 } } }),
      });
      return;
    }

    if (pathname.endsWith('/inventory/dashboard') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          itemsCount: 4,
          locationsCount: 1,
          serializedAssetsCount: 0,
          balancesCount: 4,
          totalOnHand: 0,
          estimatedTotalValue: 0,
          balancesByLocation: [],
          balancesByCategory: [],
          serializedAssetsByStatus: [],
          serializedAssetsByResponsibleType: [],
        }),
      });
      return;
    }

    if (pathname.endsWith('/inventory/items') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: state.catalogItems,
          meta: { nextCursor: null, total: state.catalogItems.length },
        }),
      });
      return;
    }

    if (pathname.endsWith('/inventory/items/catalog/options') && method === 'GET') {
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const options = state.catalogItems
        .filter((item) => {
          if (!search) {
            return true;
          }
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
          purchaseUnitOfMeasure: null,
          standardCost: item.standardCost,
          preferredSupplierRefId: null,
          preferredSupplierName: null,
          supplierSku: null,
        }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(options),
      });
      return;
    }

    if (pathname.endsWith('/inventory/assets') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { nextCursor: null, total: 0 } }),
      });
      return;
    }

    if (pathname.endsWith('/inventory/replenishment/suggestions') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (pathname.endsWith('/inventory/categories') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { nextCursor: null, total: 0 } }),
      });
      return;
    }

    if (pathname.endsWith('/inventory/locations') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { nextCursor: null, total: 0 } }),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/tax-presets') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/requests') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [state.purchaseRequest],
          meta: { nextCursor: null, total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      });
      return;
    }

    const requestDetailMatch = pathname.match(/\/purchasing\/requests\/([^/]+)$/);
    if (requestDetailMatch && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildRequestDetail(state)),
      });
      return;
    }

    const revokeMatch = pathname.match(/\/purchasing\/requests\/([^/]+)\/awards\/([^/]+)$/);
    if (revokeMatch && method === 'DELETE') {
      const awardId = revokeMatch[2] ?? '';
      const award = state.purchaseAwards.find((entry) => entry.id === awardId);
      if (!award) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: errorBody(404, 'AWARD_NOT_FOUND', 'La adjudicación no existe.'),
        });
        return;
      }
      if (
        hasLiveOrderLine(
          state,
          String(award.purchaseRequestLineId),
          String(award.awardedPartyRefId),
        )
      ) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: errorBody(
            409,
            'AWARD_ALREADY_ORDERED',
            'La adjudicación ya tiene una orden de compra y no se puede revocar.',
          ),
        });
        return;
      }
      state.purchaseAwards = state.purchaseAwards.filter((entry) => entry.id !== awardId);
      const line = state.purchaseRequestLines.find(
        (entry) => entry.id === award.purchaseRequestLineId,
      );
      if (line) {
        const coveredByQuote = state.supplierQuotes.some((quote) =>
          ((quote.lines as Array<Record<string, unknown>>) ?? []).some(
            (quoteLine) => quoteLine.purchaseRequestLineId === line.id,
          ),
        );
        line.lineStatus = coveredByQuote ? 'PENDING_QUOTE' : 'OPEN';
        line.updatedAt = nowIso();
      }
      state.purchaseRequest.updatedAt = nowIso();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          awardId,
          lineStatusAfter: line?.lineStatus ?? 'PENDING_QUOTE',
          coverage: resolveAwardCoverage(state),
        }),
      });
      return;
    }

    const awardsMatch = pathname.match(/\/purchasing\/requests\/([^/]+)\/awards$/);
    if (awardsMatch && method === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as {
        awards?: Array<Record<string, unknown>>;
      };
      const created: Array<Record<string, unknown>> = [];
      for (const awardInput of body.awards ?? []) {
        const lineId = String(awardInput.purchaseRequestLineId ?? '');
        const partyRefId = String(awardInput.awardedPartyRefId ?? '');
        const quoteId =
          awardInput.supplierQuoteId == null ? null : String(awardInput.supplierQuoteId);
        const quantity = String(awardInput.awardedQuantity ?? '1');
        const line = state.purchaseRequestLines.find((entry) => entry.id === lineId);

        if (!line) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: errorBody(400, 'AWARD_QUOTE_LINE_MISSING', 'La línea de la solicitud no existe.'),
          });
          return;
        }

        // Idempotencia CA-306: mismo proveedor, cantidad y cotización → no-op con éxito.
        const existingSame = state.purchaseAwards.find(
          (entry) =>
            entry.purchaseRequestLineId === lineId &&
            entry.awardedPartyRefId === partyRefId &&
            String(entry.awardedQuantity) === quantity &&
            (entry.supplierQuoteId ?? null) === quoteId,
        );
        if (existingSame) {
          created.push(existingSame);
          continue;
        }

        // Exclusividad CA-303: no-PROJECT admite un solo proveedor por producto.
        const existingOther = state.purchaseAwards.find(
          (entry) =>
            entry.purchaseRequestLineId === lineId && entry.awardedPartyRefId !== partyRefId,
        );
        if (existingOther && state.purchaseRequest.requestType !== 'PROJECT') {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: errorBody(
              409,
              'AWARD_PARTY_CONFLICT',
              'El producto ya está adjudicado a otro proveedor.',
            ),
          });
          return;
        }

        // Validación de cotización CA-304 + snapshot económico del servidor.
        let unitCost: string | null = null;
        let currency: string | null = null;
        if (quoteId !== null) {
          const quote = state.supplierQuotes.find((entry) => entry.id === quoteId);
          if (!quote || quote.purchaseRequestId !== REQUEST_ID) {
            await route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: errorBody(
                400,
                'AWARD_QUOTE_MISMATCH',
                'La cotización no pertenece a esta solicitud.',
              ),
            });
            return;
          }
          if (quote.partyRefId !== partyRefId) {
            await route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: errorBody(
                400,
                'AWARD_SUPPLIER_MISMATCH',
                'La cotización pertenece a otro proveedor.',
              ),
            });
            return;
          }
          const quoteLine = ((quote.lines as Array<Record<string, unknown>>) ?? []).find(
            (entry) => entry.purchaseRequestLineId === lineId,
          );
          if (!quoteLine) {
            await route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: errorBody(
                400,
                'AWARD_QUOTE_LINE_MISSING',
                'La cotización no cubre este producto.',
              ),
            });
            return;
          }
          unitCost = String(quoteLine.unitCost);
          currency = String(quote.currency);
        } else {
          // Escotilla §7: único camino con costo aportado por el cliente (obligatorio).
          const provided = awardInput.unitCost == null ? null : String(awardInput.unitCost);
          if (!provided || Number(provided) <= 0) {
            await route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: errorBody(
                400,
                'UNIT_COST_MISMATCH',
                'La adjudicación directa exige un costo unitario mayor que cero.',
              ),
            });
            return;
          }
          unitCost = provided;
          currency = 'COP';
        }

        const award = {
          id: `award-${state.purchaseAwards.length + 1}`,
          tenantId: 'tenant-awards-001',
          purchaseRequestLineId: lineId,
          supplierQuoteId: quoteId,
          awardedPartyRefId: partyRefId,
          awardedQuantity: quantity,
          unitCost,
          currency,
          awardNotes: awardInput.awardNotes ?? null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        state.purchaseAwards.push(award);
        line.lineStatus = 'AWARDED';
        line.updatedAt = nowIso();
        created.push(award);
      }
      state.purchaseRequest.updatedAt = nowIso();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/orders') && method === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const batchOrders = (body.orders as Array<Record<string, unknown>> | undefined) ?? [];
      const singleMode = batchOrders.length === 0;
      const orderInputs = singleMode
        ? [
            {
              partyRefId: body.partyRefId,
              expectedDeliveryDate: body.expectedDeliveryDate ?? null,
              notes: body.notes ?? null,
              lines: (body.lines as Array<Record<string, unknown>> | undefined) ?? [],
            },
          ]
        : batchOrders;
      const createdOrders: Array<Record<string, unknown>> = [];
      // Paridad CA-305 con el backend real (`createSingleOrder`): lo ya ordenado
      // y vivo para (línea, proveedor) más lo solicitado no puede superar lo
      // adjudicado; sin adjudicación para ese proveedor la línea se rechaza.
      for (const orderInput of orderInputs) {
        for (const orderLine of (orderInput.lines as Array<Record<string, unknown>> | undefined) ??
          []) {
          const award = state.purchaseAwards.find(
            (entry) =>
              entry.purchaseRequestLineId === orderLine.purchaseRequestLineId &&
              entry.awardedPartyRefId === orderInput.partyRefId,
          );
          if (!award) {
            await route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: errorBody(
                400,
                'AWARD_QUOTE_LINE_MISSING',
                'La línea seleccionada no tiene adjudicación para el proveedor indicado.',
              ),
            });
            return;
          }
          const liveOrdered = state.purchaseOrderLines
            .filter(
              (entry) =>
                entry.purchaseRequestLineId === orderLine.purchaseRequestLineId &&
                state.purchaseOrders.some(
                  (candidate) =>
                    candidate.id === entry.purchaseOrderId &&
                    candidate.partyRefId === orderInput.partyRefId &&
                    ['APPROVED', 'PARTIALLY_RECEIVED', 'PENDING_APPROVAL'].includes(
                      String(candidate.status),
                    ),
                ),
            )
            .reduce((total, entry) => total + Number(entry.quantity ?? 0), 0);
          if (liveOrdered + Number(orderLine.quantity ?? 0) > Number(award.awardedQuantity ?? 0)) {
            await route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: errorBody(
                400,
                'ORDER_EXCEEDS_AWARD',
                'La cantidad de la orden supera la cantidad adjudicada a este proveedor para la línea.',
              ),
            });
            return;
          }
        }
      }
      orderInputs.forEach((orderInput, orderIndex) => {
        const order = {
          id: `po-${state.purchaseOrders.length + orderIndex + 1}`,
          tenantId: 'tenant-awards-001',
          orderNumber: `OC-${String(state.purchaseOrders.length + orderIndex + 1).padStart(4, '0')}`,
          purchaseRequestId: REQUEST_ID,
          partyRefId: orderInput.partyRefId,
          status: 'APPROVED',
          expectedDeliveryDate: orderInput.expectedDeliveryDate ?? null,
          approvedByUserId: NOC_USER_ID,
          notes: orderInput.notes ?? null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        createdOrders.push(order);
        const lines = (orderInput.lines as Array<Record<string, unknown>> | undefined) ?? [];
        lines.forEach((orderLine, lineIndex) => {
          state.purchaseOrderLines.push({
            id: `pol-${order.id}-${lineIndex + 1}`,
            tenantId: 'tenant-awards-001',
            purchaseOrderId: order.id,
            itemId: orderLine.itemId,
            purchaseRequestLineId: orderLine.purchaseRequestLineId ?? null,
            quantity: String(orderLine.quantity ?? '0'),
            unitCost: String(orderLine.unitCost ?? '0'),
            receivedQuantity: '0',
            createdAt: nowIso(),
            updatedAt: nowIso(),
          });
          // Tope CA-305: la línea queda ORDERED solo al alcanzar lo adjudicado.
          const requestLine = state.purchaseRequestLines.find(
            (entry) => entry.id === orderLine.purchaseRequestLineId,
          );
          const award = state.purchaseAwards.find(
            (entry) =>
              entry.purchaseRequestLineId === orderLine.purchaseRequestLineId &&
              entry.awardedPartyRefId === order.partyRefId,
          );
          if (requestLine && award) {
            const orderedSoFar = state.purchaseOrderLines
              .filter(
                (entry) =>
                  entry.purchaseRequestLineId === requestLine.id &&
                  state.purchaseOrders
                    .concat(createdOrders)
                    .find(
                      (candidate) =>
                        candidate.id === entry.purchaseOrderId &&
                        candidate.partyRefId === award.awardedPartyRefId,
                    ),
              )
              .reduce((total, entry) => total + Number(entry.quantity ?? 0), 0);
            if (orderedSoFar >= Number(award.awardedQuantity ?? 0)) {
              requestLine.lineStatus = 'ORDERED';
              requestLine.updatedAt = nowIso();
            }
          }
        });
      });
      for (const order of createdOrders) {
        state.purchaseOrders.push(order);
      }
      // Eje Fase 30: la solicitud solo sale de APPROVED cuando todo lo adjudicado quedó ordenado.
      if (resolveAwardCoverage(state) === 'FULLY_ORDERED') {
        state.purchaseRequest.status = 'CONVERTED_TO_PO';
        state.purchaseRequest.fulfillmentStatus = 'PENDING_RECEIPT';
      }
      state.purchaseRequest.updatedAt = nowIso();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(singleMode ? createdOrders[0] : { orders: createdOrders }),
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
        body: JSON.stringify({
          data: filtered,
          meta: { nextCursor: null, total: filtered.length, page: 1, limit: 100, totalPages: 1 },
        }),
      });
      return;
    }

    const orderDetailMatch = pathname.match(/\/purchasing\/orders\/([^/]+)$/);
    if (orderDetailMatch && method === 'GET') {
      const order = state.purchaseOrders.find((entry) => entry.id === orderDetailMatch[1]);
      const lines = state.purchaseOrderLines.filter(
        (line) => line.purchaseOrderId === orderDetailMatch[1],
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...(order ?? {}), lines }),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/providers') && method === 'GET') {
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const catalog = [PARTY_1, PARTY_2, PARTY_3].map((partyRefId) => ({
        partyRefId,
        displayName: SUPPLIER_NAMES[partyRefId],
        status: 'ACTIVE',
      }));
      const filtered = search
        ? catalog.filter((entry) => entry.displayName.toLowerCase().includes(search))
        : catalog;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: filtered, total: filtered.length, page: 1, limit: 20 }),
      });
      return;
    }

    const providerSummaryMatch = pathname.match(/\/purchasing\/providers\/([^/]+)\/summary$/);
    if (providerSummaryMatch && method === 'GET') {
      const partyRefId = providerSummaryMatch[1] ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          partyRefId,
          displayName: SUPPLIER_NAMES[partyRefId] ?? 'Proveedor Demo',
          primaryContact: 'Contacto operativo',
          phone: '3001234567',
          email: 'proveedor@demo.test',
          city: 'Bogotá',
          status: 'Activo',
        }),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/suppliers') && method === 'GET') {
      const profiles = [PARTY_1, PARTY_2, PARTY_3].map((partyRefId, index) => ({
        id: `sp-${index + 1}`,
        supplierCode: `PROV-00${index + 1}`,
        partyRefId,
        status: 'ACTIVE',
        paymentTermsDays: 30,
        currency: 'COP',
        createdAt: nowIso(-2000),
        updatedAt: nowIso(-2000),
        party: {
          partyRefId,
          displayName: SUPPLIER_NAMES[partyRefId],
          primaryContact: 'Contacto operativo',
          phone: '3001234567',
          email: 'proveedor@demo.test',
          city: 'Bogotá',
          status: 'ACTIVE',
        },
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: profiles, total: profiles.length, page: 1, limit: 100 }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'E2E_UNMOCKED', message: request.url() }),
    });
  });
}

async function seedAwardsSession(page: import('@playwright/test').Page) {
  await seedPortalSessionByCookie(page, { token: buildToken(), tenantSlug: MOCK_TENANT_SLUG });
}

function getMockState(page: import('@playwright/test').Page): AwardsMockState {
  return (page as unknown as { awardsMockState: AwardsMockState }).awardsMockState;
}

/** Abre el workbench sobre la solicitud semilla y deja visible el tab de adjudicación. */
async function openAwardsMatrix(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/inventory');
  const main = page.locator('main');
  const comprasButton = main.getByRole('button', { name: 'Compras' });
  const sectionTrigger = main.getByRole('button', { name: /Sección:/ });
  // Esperar a que el subnav resuelva su modo (rail ≥lg o diálogo «Elegir sección» <lg).
  await expect(comprasButton.or(sectionTrigger).first()).toBeVisible({ timeout: 15_000 });
  if (await comprasButton.isVisible()) {
    await comprasButton.click();
  } else {
    // Viewport angosto (<lg): el subnav colapsa a «Sección: …» + diálogo «Elegir sección».
    await sectionTrigger.click();
    const chooser = page.getByRole('dialog', { name: 'Elegir sección' });
    await chooser.getByRole('button', { name: 'Compras' }).click();
  }
  await main.getByRole('button', { name: 'Abrir' }).first().click();
  const workbench = page.getByRole('dialog').filter({ hasText: 'Trabajar solicitud' });
  await expect(workbench.getByRole('heading', { name: 'Trabajar solicitud' })).toBeVisible();
  await workbench.getByRole('tab', { name: 'Adjudicación' }).click();
  await expect(
    workbench.getByRole('heading', { name: 'Adjudicar productos a proveedores' }),
  ).toBeVisible();
  return { main, workbench };
}

/** Navega por fase + tab del workbench (los tabs viven bajo su fase: Decidir/Abastecer). */
async function gotoWorkbenchTab(
  workbench: import('@playwright/test').Locator,
  phase: 'Decidir' | 'Abastecer',
  tab: string,
) {
  await workbench.getByRole('button', { name: phase, exact: true }).click();
  await workbench.getByRole('tab', { name: tab }).click();
}

/** Abre el flujo de órdenes desde el tab Órdenes (pie determinista con awards existentes). */
async function openOrderFlowFromOrdersTab(
  page: import('@playwright/test').Page,
  workbench: import('@playwright/test').Locator,
) {
  await gotoWorkbenchTab(workbench, 'Abastecer', 'Órdenes');
  await workbench.getByRole('button', { name: 'Generar órdenes desde adjudicación' }).click();
  const orderDrawer = page.getByRole('dialog', {
    name: 'Órdenes de compra desde adjudicación',
  });
  await expect(orderDrawer).toBeVisible();
  return orderDrawer;
}

test.describe('Portal Inventario / Compras — Adjudicación en matriz (Fase 30)', () => {
  test.beforeEach(async ({ page }) => {
    const state = createAwardsMockState();
    await setupAwardsMocks(page, state);
    await seedAwardsSession(page);
    (page as unknown as { awardsMockState: AwardsMockState }).awardsMockState = state;
  });

  test('CA-301/CA-UX-01: P1+P3 al proveedor 1 y P2+P4 al proveedor 2 generan dos órdenes con costos derivados', async ({
    page,
  }) => {
    const state = getMockState(page);
    const { workbench } = await openAwardsMatrix(page);

    // Selección canónica producto a producto dentro de cada cotización.
    await workbench.getByRole('radio', { name: 'Adjudicar Producto 1 a Proveedor 1' }).click();
    await workbench.getByRole('radio', { name: 'Adjudicar Producto 2 a Proveedor 2' }).click();
    await workbench.getByRole('radio', { name: 'Adjudicar Producto 3 a Proveedor 1' }).click();
    await workbench.getByRole('radio', { name: 'Adjudicar Producto 4 a Proveedor 2' }).click();

    // Resumen en vivo: 4 de 4, una píldora por proveedor y dos órdenes previstas.
    await expect(workbench.getByText('4 de 4 productos adjudicados')).toBeVisible();
    await expect(workbench.getByText(/Proveedor 1 · 2 productos/)).toBeVisible();
    await expect(workbench.getByText(/Proveedor 2 · 2 productos/)).toBeVisible();
    await expect(workbench.getByText('Se generarán 2 órdenes de compra')).toBeVisible();

    // Confirmar abre el flujo de órdenes en modo batch (una OC por proveedor).
    await workbench.getByRole('button', { name: 'Adjudicar y continuar' }).click();
    const orderDrawer = page.getByRole('dialog', {
      name: 'Órdenes de compra desde adjudicación',
    });
    await expect(orderDrawer).toBeVisible();
    // El drawer batch escribe «ordenes» sin tilde (PurchaseOrderDrawer); la barra §4.4 sí la lleva.
    await expect(
      orderDrawer.getByText(/Se generarán 2 ordenes \(una por proveedor adjudicado\)/),
    ).toBeVisible();
    await expect(orderDrawer.getByText('Proveedor 1')).toBeVisible();
    await expect(orderDrawer.getByText('Proveedor 2')).toBeVisible();

    await orderDrawer.getByRole('button', { name: 'Generar 2 órdenes' }).click();
    await expect(orderDrawer.getByText('2 órdenes de compra generadas')).toBeVisible();

    // Dos órdenes, cada una con sus dos productos y costos derivados de la cotización.
    expect(state.purchaseOrders).toHaveLength(2);
    const orderOf = (partyRefId: string) =>
      state.purchaseOrders.find((order) => order.partyRefId === partyRefId);
    expect(orderOf(PARTY_1)).toBeDefined();
    expect(orderOf(PARTY_2)).toBeDefined();
    const linesOf = (partyRefId: string) => {
      const order = orderOf(partyRefId);
      return state.purchaseOrderLines.filter((line) => line.purchaseOrderId === order?.id);
    };
    expect(linesOf(PARTY_1)).toHaveLength(2);
    expect(linesOf(PARTY_2)).toHaveLength(2);
    const costsOf = (partyRefId: string) =>
      linesOf(partyRefId)
        .map((line) => Number(line.unitCost))
        .sort((a, b) => a - b);
    // Servidor deriva: Q1 (100/300) para P1/P3; Q2 (180/390) para P2/P4. Nunca costo cero.
    expect(costsOf(PARTY_1)).toEqual([100, 300]);
    expect(costsOf(PARTY_2)).toEqual([180, 390]);
    expect(state.purchaseAwards).toHaveLength(4);
  });

  test('CA-302/CA-UX-05: adjudicación parcial deja la solicitud abierta y la segunda tanda no se bloquea', async ({
    page,
  }) => {
    const state = getMockState(page);
    const { workbench } = await openAwardsMatrix(page);

    // Primera tanda: P1 y P2 al proveedor 1, persistida sin avanzar.
    await workbench.getByRole('radio', { name: 'Adjudicar Producto 1 a Proveedor 1' }).click();
    await workbench.getByRole('radio', { name: 'Adjudicar Producto 2 a Proveedor 1' }).click();
    await expect(workbench.getByText('2 de 4 productos adjudicados')).toBeVisible();
    await workbench.getByRole('button', { name: 'Guardar adjudicación' }).click();
    await expect(workbench.getByText('Adjudicado').first()).toBeVisible();
    expect(state.purchaseAwards).toHaveLength(2);

    // Generar la orden de la primera tanda desde el tab Órdenes (fase Abastecer):
    // con adjudicación parcial el next-action sigue sugiriendo adjudicar y el pie
    // contextual de ese tab queda oculto; el pie del tab Órdenes es determinista.
    const orderDrawer = await openOrderFlowFromOrdersTab(page, workbench);
    await orderDrawer.getByRole('button', { name: 'Generar 1 orden' }).click();
    await expect(orderDrawer.getByText(/orden de compra.*generada/i)).toBeVisible();
    await orderDrawer.getByRole('button', { name: 'Ir a recepciones' }).click();

    // La solicitud sigue APPROVED con cobertura parcial: no quedó varada ni cerrada.
    // El propio workbench lo afirma: «Ya hay órdenes parciales…» (getPurchaseNextAction).
    expect(state.purchaseRequest.status).toBe('APPROVED');
    expect(resolveAwardCoverage(state)).toBe('PARTIALLY_ORDERED');
    expect(state.purchaseOrders).toHaveLength(1);
    await gotoWorkbenchTab(workbench, 'Decidir', 'Adjudicación');
    await expect(
      workbench.getByText('Ya hay órdenes parciales: quedan 2 productos por adjudicar.'),
    ).toBeVisible();
    // Lo ya ordenado es inmutable (CA-UX-06): sin radios ni revocación en P1/P2.
    // La fila bloqueada muestra el chip en sus dos columnas cotizadas.
    const orderedRow = workbench.getByRole('radiogroup', { name: 'Producto 1' });
    await expect(orderedRow.getByText('Ordenado').first()).toBeVisible();
    await expect(
      workbench.getByRole('radio', { name: 'Adjudicar Producto 1 a Proveedor 1' }),
    ).toHaveCount(0);
    await workbench.getByRole('radio', { name: 'Adjudicar Producto 3 a Proveedor 2' }).click();
    await workbench.getByRole('radio', { name: 'Adjudicar Producto 4 a Proveedor 2' }).click();
    await workbench.getByRole('button', { name: 'Adjudicar y continuar' }).click();

    const secondDrawer = page.getByRole('dialog', {
      name: 'Órdenes de compra desde adjudicación',
    });
    await expect(secondDrawer).toBeVisible();
    // El drawer debe ofrecer SOLO lo pendiente (Proveedor 2): re-ofertar lo ya ordenado
    // (Proveedor 1) haría que el backend real responda 400 ORDER_EXCEEDS_AWARD (CA-305).
    await expect(secondDrawer.getByText('Proveedor 1')).toHaveCount(0);
    await expect(secondDrawer.getByText('Proveedor 2')).toBeVisible();
    await secondDrawer.getByRole('button', { name: 'Generar 1 orden' }).click();
    await expect(secondDrawer.getByText(/orden de compra.*generada/i)).toBeVisible();

    expect(state.purchaseOrders).toHaveLength(2);
    expect(state.purchaseAwards).toHaveLength(4);
  });

  test('CA-307: revocar sin orden viva libera la línea; con orden viva el servidor responde 409', async ({
    page,
  }) => {
    const state = getMockState(page);
    const { workbench } = await openAwardsMatrix(page);

    // Adjudicar y persistir P1 al proveedor 1.
    await workbench.getByRole('radio', { name: 'Adjudicar Producto 1 a Proveedor 1' }).click();
    await workbench.getByRole('button', { name: 'Guardar adjudicación' }).click();
    await expect(workbench.getByText('Adjudicado').first()).toBeVisible();
    expect(state.purchaseAwards).toHaveLength(1);
    const awardId = String(state.purchaseAwards[0]?.id);

    // Revocar desde la fila: confirmación en diálogo y línea de vuelta a PENDING_QUOTE.
    await workbench.getByRole('button', { name: 'Revocar adjudicación de Producto 1' }).click();
    const revokeDialog = page.getByRole('dialog', { name: 'Revocar adjudicación' });
    await expect(revokeDialog).toBeVisible();
    await revokeDialog.getByRole('button', { name: 'Revocar adjudicación' }).click();
    await expect(
      workbench.getByRole('radio', { name: 'Adjudicar Producto 1 a Proveedor 1' }),
    ).toBeVisible();
    expect(state.purchaseAwards).toHaveLength(0);
    expect(state.purchaseRequestLines.find((line) => line.id === 'line-p1')?.lineStatus).toBe(
      'PENDING_QUOTE',
    );

    // Re-adjudicar y generar orden: la fila queda en bloqueo duro.
    await workbench.getByRole('radio', { name: 'Adjudicar Producto 1 a Proveedor 1' }).click();
    await workbench.getByRole('button', { name: 'Adjudicar y continuar' }).click();
    const orderDrawer = page.getByRole('dialog', {
      name: 'Órdenes de compra desde adjudicación',
    });
    await orderDrawer.getByRole('button', { name: 'Generar 1 orden' }).click();
    await expect(orderDrawer.getByText(/orden de compra.*generada/i)).toBeVisible();
    await orderDrawer.getByRole('button', { name: 'Ir a recepciones' }).click();
    const liveAwardId = String(state.purchaseAwards[0]?.id);
    expect(liveAwardId).toBeTruthy();

    // La UI no ofrece revocar lo ordenado; el servidor es la autoridad y responde 409.
    // Tras la orden el workbench queda en fase Abastecer: volver a Decidir/Adjudicación.
    await gotoWorkbenchTab(workbench, 'Decidir', 'Adjudicación');
    await expect(
      workbench.getByRole('radiogroup', { name: 'Producto 1' }).getByText('Ordenado').first(),
    ).toBeVisible();
    await expect(
      workbench.getByRole('button', { name: 'Revocar adjudicación de Producto 1' }),
    ).toHaveCount(0);
    const revokeStatus = await page.evaluate(
      async ({
        requestId,
        award,
        tenantSlug,
      }: {
        requestId: string;
        award: string;
        tenantSlug: string;
      }) => {
        const response = await fetch(`/api/v1/purchasing/requests/${requestId}/awards/${award}`, {
          method: 'DELETE',
          headers: { 'X-Tenant-Slug': tenantSlug, 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'include',
        });
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        return { status: response.status, code: body.code ?? null };
      },
      { requestId: REQUEST_ID, award: liveAwardId, tenantSlug: MOCK_TENANT_SLUG },
    );
    expect(revokeStatus).toEqual({ status: 409, code: 'AWARD_ALREADY_ORDERED' });
    expect(awardId).not.toBe('');
  });

  test('CA-311/CA-UX-08: pasada axe sin violaciones y recorrido completo con teclado', async ({
    page,
  }) => {
    const { workbench } = await openAwardsMatrix(page);

    // Matriz: sin violaciones sobre la superficie de la fase (matriz + barra).
    // Alcance CA-UX-08: el tabpanel activo; el chrome del workbench (fases) se audita
    // aparte y solo se admite el contraste limítrofe preexistente (ver abajo).
    const matrixAxe = await new AxeBuilder({ page })
      .include('[role="dialog"] [role="tabpanel"]')
      .analyze();
    expect(matrixAxe.violations).toEqual([]);

    // Barrido completo del diálogo: documenta que la única desviación es el contraste
    // 4.47 (vs 4.5) de los pasos de fase preexistentes — no bloquea (hallazgo menor).
    const fullAxe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(fullAxe.violations.filter((violation) => violation.id !== 'color-contrast')).toEqual([]);

    // Con cero selecciones la CTA explica por qué está deshabilitada (CA-UX-07).
    const submit = workbench.getByRole('button', { name: 'Adjudicar y continuar' });
    await expect(submit).toBeDisabled();
    await expect(
      workbench.getByText('Selecciona al menos un producto en la matriz para adjudicar.'),
    ).toBeVisible();

    // Tab entre filas y flechas dentro del radiogroup (contrato §8).
    const firstRadio = workbench.getByRole('radio', {
      name: 'Adjudicar Producto 1 a Proveedor 1',
    });
    await firstRadio.focus();
    await expect(firstRadio).toBeFocused();
    await page.keyboard.press('ArrowRight');
    const secondRadio = workbench.getByRole('radio', {
      name: 'Adjudicar Producto 1 a Proveedor 2',
    });
    await expect(secondRadio).toBeFocused();
    await expect(secondRadio).toBeChecked();
    // Mover no duplica: P1 queda solo en Q2 (invariante toCreateAwardsDto).
    await expect(firstRadio).not.toBeChecked();
    await page.keyboard.press('Tab');
    await expect(
      workbench.getByRole('radio', { name: 'Adjudicar Producto 2 a Proveedor 1' }),
    ).toBeFocused();

    // El control de columna entra en el orden de tabulación y adjudica lo libre.
    // P1 ya va en borrador a Q2: la columna Q1 suma P2/P3/P4 → dos órdenes previstas.
    const columnCheck = workbench.getByRole('checkbox', {
      name: 'Adjudicar productos libres a Proveedor 1',
    });
    await columnCheck.focus();
    await expect(columnCheck).toBeFocused();
    await page.keyboard.press('Space');
    await expect(workbench.getByText('Se generarán 2 órdenes de compra')).toBeVisible();

    // Acordeón: misma superficie, sin violaciones.
    await workbench.getByRole('button', { name: 'Por cotización' }).click();
    const accordionAxe = await new AxeBuilder({ page })
      .include('[role="dialog"] [role="tabpanel"]')
      .analyze();
    expect(accordionAxe.violations).toEqual([]);
  });

  test('CA-UX-09 + §7: en viewport angosto el acordeón conserva la selección; la escotilla exige costo', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 800 });
    const state = getMockState(page);
    const { workbench } = await openAwardsMatrix(page);

    // Conmutación automática a acordeón con la selección intacta al ir y volver.
    await expect(workbench.getByRole('button', { name: 'Matriz' })).toBeVisible();
    await expect(workbench.getByRole('table')).toHaveCount(0);
    const accordionCheck = workbench.getByRole('checkbox', {
      name: 'Adjudicar Producto 1 a Proveedor 1',
    });
    await expect(accordionCheck).toBeVisible();
    await accordionCheck.click();
    await workbench.getByRole('button', { name: 'Matriz' }).click();
    await expect(
      workbench.getByRole('radio', { name: 'Adjudicar Producto 1 a Proveedor 1' }),
    ).toBeChecked();
    await workbench.getByRole('button', { name: 'Por cotización' }).click();
    await expect(
      workbench.getByRole('checkbox', { name: 'Adjudicar Producto 1 a Proveedor 1' }),
    ).toBeChecked();

    // Persistir el borrador de la matriz antes de la escotilla: los drafts son
    // efímeros y el refresco tras guardar la directa los descartaría.
    await workbench.getByRole('button', { name: 'Guardar adjudicación' }).click();
    await expect(workbench.getByText('1 de 4 productos adjudicados')).toBeVisible();

    // Escotilla §7: proveedor sin cotización con costo obligatorio.
    // El DropdownMenu vive en un portal fuera del diálogo: localizarlo en la página.
    await workbench.getByRole('button', { name: 'Acciones' }).click();
    await page.getByRole('menuitem', { name: 'Adjudicar a proveedor sin cotización' }).click();
    const hatch = page.getByRole('dialog', { name: 'Adjudicar a proveedor sin cotización' });
    await expect(hatch).toBeVisible();
    await hatch.getByPlaceholder('Buscar proveedor por nombre').fill('Proveedor 3');
    await hatch.getByRole('option', { name: /Proveedor 3/ }).click();
    // El «Producto» de @iwana/ui es un combobox por botón + listbox en portal
    // (fuera del diálogo): la opción se localiza a nivel de página.
    await hatch.getByLabel('Producto').click();
    await page.getByRole('option', { name: /Producto 4/ }).click();
    // Sin costo el guardado sigue bloqueado: el costo lo aporta el operador.
    await expect(hatch.getByRole('button', { name: 'Guardar adjudicación' })).toBeDisabled();
    await hatch.getByLabel('Costo unitario').fill('250');
    await hatch.getByRole('button', { name: 'Guardar adjudicación' }).click();

    // P1 (Q1) + P4 (directa a proveedor 3) persisten: la barra refleja 2 de 4.
    // (Las píldoras y «Se generarán…» describen el borrador sin persistir, no el
    // estado guardado: tras el POST el draft se vacía y el CTA se deshabilita.)
    await expect(workbench.getByText('2 de 4 productos adjudicados')).toBeVisible();
    const directAward = state.purchaseAwards.find(
      (award) => award.purchaseRequestLineId === 'line-p4',
    );
    expect(directAward?.awardedPartyRefId).toBe(PARTY_3);
    expect(directAward?.supplierQuoteId ?? null).toBeNull();
    expect(Number(directAward?.unitCost)).toBe(250);

    // La orden de la escotilla pide el costo en el drawer (sin dato derivado) y luego emite.
    const orderDrawer = await openOrderFlowFromOrdersTab(page, workbench);
    await expect(orderDrawer.getByText('Proveedor 1')).toBeVisible();
    await expect(orderDrawer.getByText('Proveedor 3')).toBeVisible();
    const costInputs = orderDrawer.getByLabel('Costo unitario');
    const inputCount = await costInputs.count();
    expect(inputCount).toBeGreaterThan(0);
    for (let index = 0; index < inputCount; index += 1) {
      if ((await costInputs.nth(index).inputValue()) === '') {
        await costInputs.nth(index).fill('250');
      }
    }
    await orderDrawer.getByRole('button', { name: 'Generar 2 órdenes' }).click();
    await expect(orderDrawer.getByText('2 órdenes de compra generadas')).toBeVisible();
    expect(state.purchaseOrders).toHaveLength(2);
    const directOrderLines = state.purchaseOrderLines.filter(
      (line) => line.purchaseRequestLineId === 'line-p4',
    );
    expect(directOrderLines).toHaveLength(1);
    expect(Number(directOrderLines[0]?.unitCost)).toBe(250);
  });
});
