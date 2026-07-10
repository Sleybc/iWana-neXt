import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  StockIssueStatus,
  StockIssueType,
  StockBalanceCondition,
  StockLocationType,
} from '@iwana/shared';
import { StockIssuesWorkspace } from './StockIssuesWorkspace';

describe('StockIssuesWorkspace', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: true,
        media: '',
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
  });

  it('renders empty state and opens create mode', async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn().mockResolvedValue(undefined);

    render(
      <StockIssuesWorkspace
        items={[
          {
            id: 'item-1',
            tenantId: 'tenant-1',
            sku: 'ONT-001',
            name: 'ONT WiFi 6',
            categoryName: 'Equipos',
            unitOfMeasure: 'unidad',
          } as any,
        ]}
        locations={[
          {
            id: 'loc-1',
            tenantId: 'tenant-1',
            code: 'BOD-01',
            name: 'Bodega principal',
            type: StockLocationType.MAIN_WAREHOUSE,
            status: 'ACTIVE',
            responsibleRefId: null,
            maxCapacity: null,
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          } as any,
        ]}
        balances={[]}
        assets={[]}
        issues={[]}
        isLoading={false}
        onCreate={onCreate}
        onUpdate={jest.fn().mockResolvedValue(undefined)}
        onCancel={jest.fn().mockResolvedValue(undefined)}
        onDispatch={jest.fn().mockResolvedValue(undefined)}
        onOpenDetail={jest.fn().mockResolvedValue({ id: 'issue-1', lines: [] } as any)}
        onRefresh={jest.fn()}
      />,
    );

    expect(screen.getByText('Sin salidas registradas')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Crear salida' })[0]!);

    expect(await screen.findByRole('heading', { name: 'Nueva salida' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Agregar productos' })).toBeInTheDocument();
  });

  it('lists issue rows and opens detail drawer', async () => {
    const user = userEvent.setup();
    const onOpenDetail = jest.fn().mockResolvedValue({
      id: 'issue-1',
      tenantId: 'tenant-1',
      type: StockIssueType.TECHNICIAN_CUSTODY,
      status: StockIssueStatus.APPROVED,
      sourceLocationId: 'loc-1',
      destinationLocationId: 'loc-2',
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
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      lines: [
        {
          id: 'line-1',
          tenantId: 'tenant-1',
          issueId: 'issue-1',
          itemId: 'item-1',
          requestedQty: '1.00',
          dispatchedQty: null,
          lotId: null,
          serializedAssetId: null,
          condition: 'NEW',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    } as any);

    render(
      <StockIssuesWorkspace
        items={[{ id: 'item-1', tenantId: 'tenant-1', sku: 'ONT-001', name: 'ONT WiFi 6' } as any]}
        locations={[
          {
            id: 'loc-1',
            tenantId: 'tenant-1',
            code: 'BOD-01',
            name: 'Bodega principal',
            type: StockLocationType.MAIN_WAREHOUSE,
          } as any,
          {
            id: 'loc-2',
            tenantId: 'tenant-1',
            code: 'MOV-01',
            name: 'Técnico zona norte',
            type: StockLocationType.MOBILE_TECHNICIAN,
          } as any,
        ]}
        balances={[]}
        assets={[]}
        issues={[
          {
            id: 'issue-1',
            tenantId: 'tenant-1',
            type: StockIssueType.TECHNICIAN_CUSTODY,
            status: StockIssueStatus.APPROVED,
            sourceLocationId: 'loc-1',
            destinationLocationId: 'loc-2',
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
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          } as any,
        ]}
        isLoading={false}
        onCreate={jest.fn().mockResolvedValue(undefined)}
        onUpdate={jest.fn().mockResolvedValue(undefined)}
        onCancel={jest.fn().mockResolvedValue(undefined)}
        onDispatch={jest.fn().mockResolvedValue(undefined)}
        onOpenDetail={onOpenDetail}
        onRefresh={jest.fn()}
      />,
    );

    expect(screen.getByRole('table', { name: 'Salidas de bodega' })).toBeInTheDocument();
    expect(screen.getAllByText('Entrega a técnico').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Despachar' }));

    await waitFor(() => {
      expect(onOpenDetail).toHaveBeenCalledWith('issue-1');
    });

    expect(await screen.findByText('Detalle de salida')).toBeInTheDocument();
  });

  it('opens edit mode for requested issues from detail drawer', async () => {
    const user = userEvent.setup();
    const onOpenDetail = jest.fn().mockResolvedValue({
      id: 'issue-1',
      tenantId: 'tenant-1',
      type: StockIssueType.TECHNICIAN_CUSTODY,
      status: StockIssueStatus.REQUESTED,
      sourceLocationId: 'loc-1',
      destinationLocationId: 'loc-2',
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
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      lines: [
        {
          id: 'line-1',
          tenantId: 'tenant-1',
          issueId: 'issue-1',
          itemId: 'item-1',
          requestedQty: '2.00',
          dispatchedQty: null,
          lotId: null,
          serializedAssetId: null,
          condition: StockBalanceCondition.NEW,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    } as any);

    render(
      <StockIssuesWorkspace
        items={[
          {
            id: 'item-1',
            tenantId: 'tenant-1',
            sku: 'ONT-001',
            name: 'ONT WiFi 6',
            unitOfMeasure: 'unidad',
          } as any,
        ]}
        locations={[
          {
            id: 'loc-1',
            tenantId: 'tenant-1',
            code: 'BOD-01',
            name: 'Bodega principal',
            type: StockLocationType.MAIN_WAREHOUSE,
          } as any,
          {
            id: 'loc-2',
            tenantId: 'tenant-1',
            code: 'MOV-01',
            name: 'Técnico zona norte',
            type: StockLocationType.MOBILE_TECHNICIAN,
          } as any,
        ]}
        balances={[]}
        assets={[]}
        issues={[
          {
            id: 'issue-1',
            tenantId: 'tenant-1',
            type: StockIssueType.TECHNICIAN_CUSTODY,
            status: StockIssueStatus.REQUESTED,
            sourceLocationId: 'loc-1',
            destinationLocationId: 'loc-2',
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
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          } as any,
        ]}
        isLoading={false}
        onCreate={jest.fn().mockResolvedValue(undefined)}
        onUpdate={jest.fn().mockResolvedValue(undefined)}
        onCancel={jest.fn().mockResolvedValue(undefined)}
        onDispatch={jest.fn().mockResolvedValue(undefined)}
        onOpenDetail={onOpenDetail}
        onRefresh={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Despachar' }));
    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    expect(await screen.findByRole('heading', { name: 'Editar salida' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });
});
