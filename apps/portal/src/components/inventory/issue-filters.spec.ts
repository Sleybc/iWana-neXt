import { StockIssueStatus, StockIssueType } from '@iwana/shared';
import type { StockIssueRecord, StockLocationRecord } from '@/lib/api-client';
import { filterStockIssues, hasActiveIssueFilters } from './issue-filters';

function buildIssue(overrides: Partial<StockIssueRecord> = {}): StockIssueRecord {
  return {
    id: 'issue-001',
    tenantId: 'tenant-001',
    type: StockIssueType.TECHNICIAN_CUSTODY,
    status: StockIssueStatus.REQUESTED,
    sourceLocationId: 'loc-main',
    destinationLocationId: 'loc-tech',
    destinationRefId: null,
    originRefId: null,
    commercialRefId: null,
    reason: null,
    costCenter: null,
    handoffMethod: null,
    handoffNotes: null,
    handoffAttachments: null,
    createdByUserId: null,
    dispatchedByUserId: null,
    closedAt: null,
    stockMovementId: null,
    createdAt: '2026-07-08T10:00:00.000Z',
    updatedAt: '2026-07-08T10:00:00.000Z',
    ...overrides,
  };
}

const locationMap = new Map<string, StockLocationRecord>([
  ['loc-main', { id: 'loc-main', name: 'Bodega principal' } as StockLocationRecord],
  ['loc-tech', { id: 'loc-tech', name: 'Técnico Juan' } as StockLocationRecord],
]);

describe('hasActiveIssueFilters', () => {
  it('returns false when no filter is set', () => {
    expect(hasActiveIssueFilters({})).toBe(false);
  });

  it('returns false when search is only whitespace', () => {
    expect(hasActiveIssueFilters({ search: '   ' })).toBe(false);
  });

  it('returns true when type, status or search is set', () => {
    expect(hasActiveIssueFilters({ type: StockIssueType.SALE_DISPATCH })).toBe(true);
    expect(hasActiveIssueFilters({ status: StockIssueStatus.DISPATCHED })).toBe(true);
    expect(hasActiveIssueFilters({ search: 'bodega' })).toBe(true);
  });
});

describe('filterStockIssues', () => {
  it('returns all issues when there are no filters', () => {
    const issues = [buildIssue(), buildIssue({ id: 'issue-002' })];
    expect(filterStockIssues(issues, {}, locationMap)).toHaveLength(2);
  });

  it('filters by type', () => {
    const issues = [
      buildIssue({ id: 'issue-tech' }),
      buildIssue({ id: 'issue-sale', type: StockIssueType.SALE_DISPATCH }),
    ];
    const result = filterStockIssues(issues, { type: StockIssueType.SALE_DISPATCH }, locationMap);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('issue-sale');
  });

  it('filters by status', () => {
    const issues = [
      buildIssue({ id: 'issue-req' }),
      buildIssue({ id: 'issue-disp', status: StockIssueStatus.DISPATCHED }),
    ];
    const result = filterStockIssues(issues, { status: StockIssueStatus.DISPATCHED }, locationMap);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('issue-disp');
  });

  it('matches search against source and destination location names (case insensitive)', () => {
    const issues = [
      buildIssue({ id: 'issue-001' }),
      buildIssue({ id: 'issue-002', destinationLocationId: 'loc-desconocida' }),
    ];

    const bySource = filterStockIssues(issues, { search: 'BODEGA' }, locationMap);
    expect(bySource).toHaveLength(2);

    const byDestination = filterStockIssues(issues, { search: 'juan' }, locationMap);
    expect(byDestination).toHaveLength(1);
    expect(byDestination[0]?.id).toBe('issue-001');
  });

  it('falls back to destinationRefId and commercial references in search', () => {
    const issues = [
      buildIssue({
        id: 'issue-ref',
        destinationLocationId: null,
        destinationRefId: 'REF-CLIENTE-9',
      }),
      buildIssue({ id: 'issue-com', commercialRefId: 'VENTA-77' }),
    ];

    expect(filterStockIssues(issues, { search: 'ref-cliente' }, locationMap)).toHaveLength(1);
    expect(filterStockIssues(issues, { search: 'venta-77' }, locationMap)).toHaveLength(1);
  });

  it('combines type, status and search filters', () => {
    const issues = [
      buildIssue({ id: 'issue-a', status: StockIssueStatus.DISPATCHED }),
      buildIssue({
        id: 'issue-b',
        status: StockIssueStatus.DISPATCHED,
        type: StockIssueType.SALE_DISPATCH,
        destinationLocationId: null,
        commercialRefId: 'VENTA-1',
      }),
    ];

    const result = filterStockIssues(
      issues,
      {
        type: StockIssueType.SALE_DISPATCH,
        status: StockIssueStatus.DISPATCHED,
        search: 'venta',
      },
      locationMap,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('issue-b');
  });
});
