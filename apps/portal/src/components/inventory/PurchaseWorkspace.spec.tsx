import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PurchaseRequestLineSourceKind,
  PurchaseRequestLineStatus,
  PurchaseRequestPriority,
  PurchaseRequestType,
} from '@iwana/shared';
import { purchasingApi } from '@/lib/api-client';
import type { PurchaseComposerInitialValues } from './PurchaseRequestComposer';
import { PurchaseWorkspace } from './PurchaseWorkspace';

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
    purchasingApi: {
      ...actual.purchasingApi,
      listRequests: jest.fn(),
    },
  };
});

jest.mock('./PurchaseRequestComposer', () => ({
  PurchaseRequestComposer: ({
    initialValues,
  }: {
    initialValues?: PurchaseComposerInitialValues;
  }) => (
    <div>
      <p>Composer activo</p>
      {initialValues ? (
        <>
          <p>{initialValues.title}</p>
          <p>{`Líneas: ${initialValues.lines.length}`}</p>
          <p>{`Tipo: ${initialValues.requestType}`}</p>
        </>
      ) : (
        <p>Sin prefill</p>
      )}
    </div>
  ),
}));

jest.mock('./PurchaseWorkspaceSummary', () => ({
  PurchaseWorkspaceSummary: () => <div>Resumen compras</div>,
}));

jest.mock('./PurchaseRequestsToolbar', () => ({
  PurchaseRequestsToolbar: () => <div>Toolbar compras</div>,
}));

jest.mock('./PurchaseRequestsTable', () => ({
  PurchaseRequestsTable: () => <div>Tabla compras</div>,
}));

jest.mock('./PurchaseRequestWorkbenchDrawer', () => ({
  PurchaseRequestWorkbenchDrawer: () => null,
}));

jest.mock('./PurchaseOrderDrawer', () => ({
  PurchaseOrderDrawer: () => null,
}));

jest.mock('./PurchaseCreateModeHeader', () => ({
  PurchaseCreateModeHeader: () => <div>Cabecera create</div>,
}));

jest.mock('./PurchaseCreateModeShell', () => ({
  PurchaseCreateModeShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const listRequestsMock = purchasingApi.listRequests as jest.Mock;

const baseProps = {
  items: [],
  catalogOptions: [],
  locations: [],
  latestOrder: null,
  latestOrderLines: [],
  latestReceipt: null,
  isSubmittingRequest: false,
  isSubmittingQuote: false,
  isSubmittingApprove: false,
  isSubmittingAwards: false,
  isSubmittingReject: false,
  isSubmittingCancel: false,
  isSubmittingOrder: false,
  isSubmittingReceipt: false,
  isSubmittingUpdateRequest: false,
  isSubmittingApproveOrder: false,
  isSubmittingCancelOrder: false,
  isSubmittingCloseOrder: false,
  createError: null,
  quoteError: null,
  approveError: null,
  awardsError: null,
  rejectError: null,
  cancelError: null,
  orderError: null,
  receiptError: null,
  updateRequestError: null,
  approveOrderError: null,
  cancelOrderError: null,
  closeOrderError: null,
  onCreateRequest: jest.fn().mockResolvedValue({ ok: true, requestId: 'req-1' }),
  onAddQuote: jest.fn(),
  onUpdateQuote: jest.fn().mockResolvedValue(true),
  onApproveRequest: jest.fn(),
  onCreateAwards: jest.fn(),
  onRejectRequest: jest.fn(),
  onCancelRequest: jest.fn(),
  onUpdateRequest: jest.fn(),
  onCreateOrder: jest.fn(),
  onReceiveOrder: jest.fn(),
  onApproveOrder: jest.fn(),
  onCancelOrder: jest.fn(),
  onCloseOrder: jest.fn(),
  onPrepareOrderDrawer: jest.fn(),
  onSelectOrder: jest.fn(),
  onRefresh: jest.fn().mockResolvedValue(undefined),
};

const prefill: PurchaseComposerInitialValues = {
  title: 'Reposición sugerida 2026-07-18 — 2 ítems bajo punto de reorden',
  requestType: PurchaseRequestType.REPLENISHMENT,
  priority: PurchaseRequestPriority.NORMAL,
  requestingArea: 'Existencias',
  justification: 'Generada desde existencias con 2 productos bajo punto de reorden.',
  neededByDate: null,
  lines: [
    {
      id: 'line-temp-1',
      tenantId: '',
      purchaseRequestId: '',
      sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
      inventoryItemId: 'item-1',
      freeTextDescription: null,
      quantityRequested: '2',
      unitOfMeasure: 'unidad',
      suggestedPartyRefId: null,
      notes: null,
      lineStatus: PurchaseRequestLineStatus.OPEN,
      createdAt: '',
      updatedAt: '',
    },
  ],
};

describe('PurchaseWorkspace', () => {
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
    listRequestsMock.mockResolvedValue({
      data: [],
      meta: {
        nextCursor: null,
        total: 0,
        totalIsEstimate: false,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasMore: false,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    });
  });

  it('ADR-065: self-fetch con page+limit y sin Cargar más', async () => {
    listRequestsMock.mockResolvedValue({
      data: [
        {
          id: 'req-1',
          requestNumber: 'SC-1',
          title: 'Solicitud demo',
          status: 'DRAFT',
          requestType: PurchaseRequestType.REPLENISHMENT,
          priority: PurchaseRequestPriority.NORMAL,
        },
      ],
      meta: {
        nextCursor: null,
        total: 1,
        totalIsEstimate: false,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasMore: false,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    });

    render(<PurchaseWorkspace {...baseProps} />);

    await waitFor(() => {
      expect(listRequestsMock).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 20 }),
      );
    });
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(screen.getByText('Tabla compras')).toBeInTheDocument();
  });

  it('abre el composer con prefill desde reposición', async () => {
    const onConsumed = jest.fn();

    render(
      <PurchaseWorkspace
        {...baseProps}
        createInitialValues={prefill}
        onCreateInitialValuesConsumed={onConsumed}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Composer activo')).toBeInTheDocument();
    });
    expect(screen.getByText(prefill.title)).toBeInTheDocument();
    expect(onConsumed).toHaveBeenCalled();
  });
});
