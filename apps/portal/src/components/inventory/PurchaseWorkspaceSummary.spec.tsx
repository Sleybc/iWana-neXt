import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  PurchaseRequestFulfillmentStatus,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
  PurchaseRequestType,
} from '@iwana/shared';
import type { PurchaseRequestRecord } from '@/lib/api-client';
import { PurchaseWorkspaceSummary } from './PurchaseWorkspaceSummary';

const baseRequest: PurchaseRequestRecord = {
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
};

const sampleRequests: PurchaseRequestRecord[] = [baseRequest];

function buildRequest(overrides: Partial<PurchaseRequestRecord>): PurchaseRequestRecord {
  return { ...baseRequest, ...overrides };
}

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

  it('no cuenta como «Por recibir» una solicitud ya recibida y cerrada', () => {
    render(
      <PurchaseWorkspaceSummary
        requests={[
          buildRequest({
            id: 'req-recibida',
            status: PurchaseRequestStatus.CONVERTED_TO_PO,
            fulfillmentStatus: PurchaseRequestFulfillmentStatus.RECEIVED,
          }),
        ]}
        filters={{}}
        onKpiFilterChange={jest.fn()}
      />,
    );

    const card = screen.getByRole('button', { name: /Por recibir/i });
    expect(within(card).getByText('0')).toBeInTheDocument();
  });

  it('cuenta mercancía en tránsito, total o parcial, en «Por recibir»', () => {
    render(
      <PurchaseWorkspaceSummary
        requests={[
          buildRequest({
            id: 'req-transito',
            status: PurchaseRequestStatus.CONVERTED_TO_PO,
            fulfillmentStatus: PurchaseRequestFulfillmentStatus.PENDING_RECEIPT,
          }),
          buildRequest({
            id: 'req-parcial',
            status: PurchaseRequestStatus.CONVERTED_TO_PO,
            fulfillmentStatus: PurchaseRequestFulfillmentStatus.PARTIALLY_RECEIVED,
          }),
          buildRequest({
            id: 'req-recibida',
            status: PurchaseRequestStatus.CONVERTED_TO_PO,
            fulfillmentStatus: PurchaseRequestFulfillmentStatus.RECEIVED,
          }),
        ]}
        filters={{}}
        onKpiFilterChange={jest.fn()}
      />,
    );

    const card = screen.getByRole('button', { name: /Por recibir/i });
    expect(within(card).getByText('2')).toBeInTheDocument();
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
