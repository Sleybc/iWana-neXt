import { PurchaseRequestPriority, PurchaseRequestStatus, PurchaseRequestType } from '@iwana/shared';
import type { PurchaseRequestRecord } from '@/lib/api-client';
import {
  filterPurchaseRequests,
  findFirstRequestForKpiWorkbench,
  isPurchaseRequestOverdue,
  kpiPresetToFilters,
  resolveActiveKpiPreset,
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
});
