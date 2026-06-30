import { fireEvent, render, screen } from '@testing-library/react';
import { PurchaseRequestPriority, PurchaseRequestStatus, PurchaseRequestType } from '@iwana/shared';
import type { PurchaseRequestRecord } from '@/lib/api-client';
import { PurchaseWorkspaceSummary } from './PurchaseWorkspaceSummary';

const sampleRequests: PurchaseRequestRecord[] = [
  {
    id: 'req-1',
    tenantId: 'tenant-1',
    requestNumber: 'SC-001',
    title: 'Reposición',
    status: PurchaseRequestStatus.PENDING_QUOTES,
    requestType: PurchaseRequestType.REPLENISHMENT,
    priority: PurchaseRequestPriority.NORMAL,
    requestedByUserId: 'user-1',
    requestingArea: 'Operaciones',
    justification: null,
    operationalRefType: null,
    operationalRefId: null,
    exceptionReason: null,
    approvedByUserId: null,
    neededByDate: null,
    notes: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
];

describe('PurchaseWorkspaceSummary', () => {
  it('renders KPI cards and triggers filter callback', () => {
    const onKpiFilterChange = jest.fn();

    render(
      <PurchaseWorkspaceSummary
        requests={sampleRequests}
        filters={{}}
        onKpiFilterChange={onKpiFilterChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Por cotizar/i }));
    expect(onKpiFilterChange).toHaveBeenCalledWith('pendingQuotes');
  });

  it('shows skeletons while loading', () => {
    const { container } = render(
      <PurchaseWorkspaceSummary
        requests={sampleRequests}
        filters={{}}
        isLoading
        onKpiFilterChange={jest.fn()}
      />,
    );

    expect(
      container.querySelectorAll('[class*="animate-pulse"], [data-slot="skeleton"]').length,
    ).toBeGreaterThan(0);
  });
});
