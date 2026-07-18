import { render, screen, waitFor } from '@testing-library/react';
import {
  PurchaseRequestLineSourceKind,
  PurchaseRequestLineStatus,
  PurchaseRequestPriority,
  PurchaseRequestType,
} from '@iwana/shared';
import type { PurchaseComposerInitialValues } from './PurchaseRequestComposer';
import { PurchaseWorkspace } from './PurchaseWorkspace';

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

const baseProps = {
  requests: [],
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
  onRefresh: jest.fn(),
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
      sourceKind: PurchaseRequestLineSourceKind.REPLENISHMENT_SUGGESTION,
      inventoryItemId: 'item-1',
      freeTextDescription: 'CAB-01 - Cable',
      quantityRequested: '40',
      unitOfMeasure: 'metro',
      suggestedPartyRefId: 'party-1',
      lineStatus: PurchaseRequestLineStatus.OPEN,
      notes: null,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
    {
      id: 'line-temp-2',
      tenantId: '',
      purchaseRequestId: '',
      sourceKind: PurchaseRequestLineSourceKind.REPLENISHMENT_SUGGESTION,
      inventoryItemId: 'item-2',
      freeTextDescription: 'ONT-01 - ONT',
      quantityRequested: '10',
      unitOfMeasure: 'unidad',
      suggestedPartyRefId: null,
      lineStatus: PurchaseRequestLineStatus.OPEN,
      notes: null,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
  ],
};

describe('PurchaseWorkspace', () => {
  it('abre el composer en modo create con líneas cuando recibe createInitialValues', async () => {
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

    expect(
      screen.getByText('Reposición sugerida 2026-07-18 — 2 ítems bajo punto de reorden'),
    ).toBeInTheDocument();
    expect(screen.getByText('Líneas: 2')).toBeInTheDocument();
    expect(screen.getByText(`Tipo: ${PurchaseRequestType.REPLENISHMENT}`)).toBeInTheDocument();
    expect(onConsumed).toHaveBeenCalled();
  });
});
