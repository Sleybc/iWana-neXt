import {
  PurchaseRequestFulfillmentStatus,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
  PurchaseRequestType,
} from '@iwana/shared';
import type { PurchaseRequestRecord } from '@/lib/api-client';
import {
  filterPurchaseRequests,
  findFirstRequestForKpiWorkbench,
  isPurchaseRequestFullyReceived,
  isPurchaseRequestOverdue,
  isPurchaseRequestPendingReceipt,
  kpiPresetToFilters,
  resolveActiveKpiPreset,
  resolvePurchaseRequestFulfillmentStatus,
} from './purchase-filters';

function buildRequest(overrides: Partial<PurchaseRequestRecord> = {}): PurchaseRequestRecord {
  return {
    id: 'req-1',
    tenantId: 'tenant-1',
    requestNumber: 'SC-001',
    title: 'Reposición ONT',
    status: PurchaseRequestStatus.PENDING_QUOTES,
    requestType: PurchaseRequestType.REPLENISHMENT,
    priority: PurchaseRequestPriority.NORMAL,
    requestedByUserId: 'user-1',
    requestingArea: 'Operaciones',
    justification: 'Reposición',
    operationalRefType: null,
    operationalRefId: null,
    exceptionReason: null,
    approvedByUserId: null,
    neededByDate: '2026-12-31',
    notes: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('purchase-filters', () => {
  it('filters by KPI preset overdue', () => {
    const requests = [
      buildRequest({ id: 'overdue', neededByDate: '2020-01-01' }),
      buildRequest({ id: 'ok', neededByDate: '2030-01-01' }),
    ];

    const filtered = filterPurchaseRequests(requests, kpiPresetToFilters('overdue'));
    expect(filtered.map((request) => request.id)).toEqual(['overdue']);
  });

  it('filters by KPI preset urgent', () => {
    const requests = [
      buildRequest({ id: 'urgent', priority: PurchaseRequestPriority.URGENT }),
      buildRequest({ id: 'normal', priority: PurchaseRequestPriority.NORMAL }),
    ];

    const filtered = filterPurchaseRequests(requests, kpiPresetToFilters('urgent'));
    expect(filtered.map((request) => request.id)).toEqual(['urgent']);
  });

  it('filters pendingQuotes KPI for DRAFT and PENDING_QUOTES', () => {
    const requests = [
      buildRequest({ id: 'draft', status: PurchaseRequestStatus.DRAFT }),
      buildRequest({ id: 'quotes', status: PurchaseRequestStatus.PENDING_QUOTES }),
      buildRequest({ id: 'approval', status: PurchaseRequestStatus.PENDING_APPROVAL }),
    ];

    const filtered = filterPurchaseRequests(requests, kpiPresetToFilters('pendingQuotes'));
    expect(filtered.map((request) => request.id)).toEqual(['draft', 'quotes']);
  });

  it('resolves active KPI preset from filters', () => {
    expect(resolveActiveKpiPreset(kpiPresetToFilters('pendingQuotes'))).toBe('pendingQuotes');
    expect(resolveActiveKpiPreset({ status: PurchaseRequestStatus.APPROVED })).toBe('readyForPo');
  });

  it('detects overdue excluding closed statuses', () => {
    expect(
      isPurchaseRequestOverdue(
        buildRequest({ neededByDate: '2020-01-01', status: PurchaseRequestStatus.CONVERTED_TO_PO }),
      ),
    ).toBe(false);
    expect(isPurchaseRequestOverdue(buildRequest({ neededByDate: '2020-01-01' }))).toBe(true);
  });

  it('finds first converted request for pending receipt workbench deep-link', () => {
    const requests = [
      buildRequest({ id: 'quotes', status: PurchaseRequestStatus.PENDING_QUOTES }),
      buildRequest({ id: 'receive-me', status: PurchaseRequestStatus.CONVERTED_TO_PO }),
    ];

    expect(findFirstRequestForKpiWorkbench('pendingReceipt', requests)?.id).toBe('receive-me');
    expect(findFirstRequestForKpiWorkbench('pendingQuotes', requests)).toBeNull();
  });

  it('omite solicitudes ya recibidas al abrir el workbench del KPI Por recibir', () => {
    const requests = [
      buildRequest({
        id: 'ya-recibida',
        status: PurchaseRequestStatus.CONVERTED_TO_PO,
        fulfillmentStatus: PurchaseRequestFulfillmentStatus.RECEIVED,
      }),
      buildRequest({
        id: 'en-transito',
        status: PurchaseRequestStatus.CONVERTED_TO_PO,
        fulfillmentStatus: PurchaseRequestFulfillmentStatus.PENDING_RECEIPT,
      }),
    ];

    expect(findFirstRequestForKpiWorkbench('pendingReceipt', requests)?.id).toBe('en-transito');
  });

  it('resuelve el abastecimiento del API y degrada cuando no llega', () => {
    expect(
      resolvePurchaseRequestFulfillmentStatus(
        buildRequest({
          status: PurchaseRequestStatus.CONVERTED_TO_PO,
          fulfillmentStatus: PurchaseRequestFulfillmentStatus.RECEIVED,
        }),
      ),
    ).toBe(PurchaseRequestFulfillmentStatus.RECEIVED);

    // API sin desplegar: CONVERTED_TO_PO conserva el comportamiento previo.
    expect(
      resolvePurchaseRequestFulfillmentStatus(
        buildRequest({ status: PurchaseRequestStatus.CONVERTED_TO_PO }),
      ),
    ).toBe(PurchaseRequestFulfillmentStatus.PENDING_RECEIPT);

    expect(
      resolvePurchaseRequestFulfillmentStatus(
        buildRequest({ status: PurchaseRequestStatus.APPROVED }),
      ),
    ).toBe(PurchaseRequestFulfillmentStatus.NOT_ORDERED);
  });

  it('clasifica mercancía en tránsito y solicitudes cerradas por recepción', () => {
    const received = buildRequest({
      status: PurchaseRequestStatus.CONVERTED_TO_PO,
      fulfillmentStatus: PurchaseRequestFulfillmentStatus.RECEIVED,
    });
    const partial = buildRequest({
      status: PurchaseRequestStatus.CONVERTED_TO_PO,
      fulfillmentStatus: PurchaseRequestFulfillmentStatus.PARTIALLY_RECEIVED,
    });
    const pending = buildRequest({
      status: PurchaseRequestStatus.CONVERTED_TO_PO,
      fulfillmentStatus: PurchaseRequestFulfillmentStatus.PENDING_RECEIPT,
    });

    expect(isPurchaseRequestPendingReceipt(pending)).toBe(true);
    expect(isPurchaseRequestPendingReceipt(partial)).toBe(true);
    expect(isPurchaseRequestPendingReceipt(received)).toBe(false);
    expect(isPurchaseRequestFullyReceived(received)).toBe(true);
    expect(isPurchaseRequestFullyReceived(pending)).toBe(false);
  });

  it('pendingReceipt KPI usa solo kpiPreset para excluir recibidas en servidor', () => {
    // El servidor aplica EXISTS de órdenes APPROVED/PARTIALLY_RECEIVED.
    // No fijar status evita que Estado=Convertida incluya cerradas.
    expect(kpiPresetToFilters('pendingReceipt')).toEqual({ kpiPreset: 'pendingReceipt' });
  });

  it('estado CONVERTED_TO_PO solo no activa el KPI Por recibir', () => {
    // Estado incluye cerradas; el KPI exige kpiPreset explícito.
    expect(resolveActiveKpiPreset({ status: PurchaseRequestStatus.CONVERTED_TO_PO })).toBeNull();
    expect(resolveActiveKpiPreset(kpiPresetToFilters('pendingReceipt'))).toBe('pendingReceipt');
  });
});
