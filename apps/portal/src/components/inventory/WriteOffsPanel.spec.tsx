import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WriteOffReason, WriteOffStatus } from '@iwana/shared';
import { inventoryApi, type InventoryWriteOffRecord } from '@/lib/api-client';
import { WriteOffsPanel, type WriteOffRequestFormState } from './WriteOffsPanel';
import { WRITE_OFF_STATUS_LABELS } from './inventory-labels';

const pushMock = jest.fn();
const replaceMock = jest.fn();
let searchParamsMock = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => '/dashboard/inventory',
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      writeOffs: {
        ...actual.inventoryApi.writeOffs,
        list: jest.fn(),
      },
    },
  };
});

jest.mock('./InventoryItemPicker', () => ({
  InventoryItemPicker: () => <div data-testid="item-picker-stub" />,
}));
jest.mock('./InventoryAssetPicker', () => ({
  InventoryAssetPicker: () => <div data-testid="asset-picker-stub" />,
}));
jest.mock('./InventoryLocationPicker', () => ({
  InventoryLocationPicker: () => <div data-testid="location-picker-stub" />,
}));

const listWriteOffsMock = inventoryApi.writeOffs.list as jest.Mock;

const emptyForm: WriteOffRequestFormState = {
  itemId: '',
  serializedAssetId: '',
  locationId: '',
  quantity: '1',
  reason: WriteOffReason.DAMAGED,
  notes: '',
};

function buildWriteOff(overrides: Partial<InventoryWriteOffRecord> = {}): InventoryWriteOffRecord {
  return {
    id: 'wo-001',
    tenantId: 'tenant-1',
    itemId: 'item-001',
    serializedAssetId: null,
    locationId: 'loc-001',
    quantity: '1',
    reason: WriteOffReason.DAMAGED,
    status: WriteOffStatus.COMPLETED,
    notes: null,
    rejectionNotes: null,
    requestedByUserId: 'user-1',
    approvedByUserId: 'user-2',
    approvedAt: '2026-06-01T11:00:00.000Z',
    rejectedByUserId: null,
    rejectedAt: null,
    stockMovementId: 'mov-001',
    movementNumber: 'MOV-1',
    idempotencyKey: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T11:00:00.000Z',
    ...overrides,
  };
}

const baseProps = {
  pending: [] as InventoryWriteOffRecord[],
  requestForm: emptyForm,
  onRequestFormChange: jest.fn(),
  isSubmittingRequest: false,
  requestError: null,
  requestSuccess: null,
  onSubmitRequest: jest.fn(),
  userLabelById: new Map([['user-1', 'Ana Pérez']]),
  isLoadingPending: false,
  pendingError: null,
  actionError: null,
  processingWriteOffId: null,
  onRefreshPending: jest.fn(),
  onApprove: jest.fn(),
  onReject: jest.fn(),
  onOpenMovement: jest.fn(),
};

describe('WriteOffsPanel historial ADR-065', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamsMock = new URLSearchParams();
    pushMock.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    replaceMock.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('lista historial y abre movimiento', async () => {
    listWriteOffsMock.mockResolvedValue({
      data: [buildWriteOff()],
      total: 1,
      page: 1,
      limit: 20,
    });
    const onOpenMovement = jest.fn();

    render(<WriteOffsPanel {...baseProps} onOpenMovement={onOpenMovement} />);

    await waitFor(() => {
      expect(screen.getByTestId('write-off-history-row-wo-001')).toBeInTheDocument();
    });
    expect(listWriteOffsMock).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(
      within(screen.getByTestId('write-off-history-row-wo-001')).getByText(
        WRITE_OFF_STATUS_LABELS[WriteOffStatus.COMPLETED],
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver MOV-1' }));
    expect(onOpenMovement).toHaveBeenCalledWith('mov-001');
  });

  it('muestra estado vacío del historial', async () => {
    listWriteOffsMock.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    render(<WriteOffsPanel {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByText('Sin solicitudes registradas')).toBeInTheDocument();
    });
  });

  it('filtra historial por estado', async () => {
    const user = userEvent.setup();
    listWriteOffsMock.mockResolvedValue({
      data: [buildWriteOff({ status: WriteOffStatus.REJECTED, stockMovementId: null })],
      total: 1,
      page: 1,
      limit: 20,
    });

    const { rerender } = render(<WriteOffsPanel {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('write-offs-history-status-filter')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(
      await screen.findByRole('option', {
        name: WRITE_OFF_STATUS_LABELS[WriteOffStatus.REJECTED],
      }),
    );
    rerender(<WriteOffsPanel {...baseProps} />);

    await waitFor(() => {
      expect(listWriteOffsMock).toHaveBeenCalledWith({
        status: WriteOffStatus.REJECTED,
        page: 1,
        limit: 20,
      });
    });
  });

  it('ADR-065: reemplaza página (conjuntos disjuntos, sin Cargar más)', async () => {
    const user = userEvent.setup();
    const page1 = Array.from({ length: 20 }, (_, i) =>
      buildWriteOff({ id: `wo-p1-${i}`, movementNumber: `MOV-P1-${i}` }),
    );
    const page2 = Array.from({ length: 20 }, (_, i) =>
      buildWriteOff({ id: `wo-p2-${i}`, movementNumber: `MOV-P2-${i}` }),
    );

    listWriteOffsMock.mockImplementation(async (params?: { page?: number }) => {
      const page = params?.page ?? 1;
      return {
        data: page === 1 ? page1 : page2,
        total: 40,
        page,
        limit: 20,
      };
    });

    const { rerender } = render(<WriteOffsPanel {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('write-off-history-row-wo-p1-0')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Mostrando 1\u201320 de 40 bajas/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    rerender(<WriteOffsPanel {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('write-off-history-row-wo-p2-0')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('write-off-history-row-wo-p1-0')).not.toBeInTheDocument();
    expect(listWriteOffsMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 20 }));
  });
});
