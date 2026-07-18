import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PurchaseRequestLineSourceKind,
  PurchaseRequestLineStatus,
  PurchaseRequestStatus,
  PurchaseRfqInvitationStatus,
  PurchaseRfqStatus,
} from '@iwana/shared';
import type {
  PurchaseRequestLineRecord,
  PurchaseRfqDetailRecord,
  SupplierQuoteRecord,
} from '@/lib/api-client';
import { purchasingApi } from '@/lib/api-client';
import { formatInventoryCurrency } from './inventory-labels';
import { RfqInvitationsPanel } from './RfqInvitationsPanel';

jest.mock('@/lib/api-client', () => ({
  purchasingApi: {
    downloadRfqInvitationsZip: jest.fn(),
    downloadRfqInvitationPdf: jest.fn(),
    createRfq: jest.fn(),
    inviteSuppliers: jest.fn(),
    sendRfq: jest.fn(),
    closeRfq: jest.fn(),
    declineInvitation: jest.fn(),
    addQuote: jest.fn(),
  },
}));

jest.mock('./SupplierMultiPicker', () => ({
  SupplierMultiPicker: () => <div data-testid="supplier-multi-picker" />,
}));

const purchasingApiMock = purchasingApi as jest.Mocked<typeof purchasingApi>;

function buildRfqDetail(overrides?: {
  rfq?: Partial<PurchaseRfqDetailRecord['rfq']>;
  invitations?: PurchaseRfqDetailRecord['invitations'];
}): PurchaseRfqDetailRecord {
  const base: PurchaseRfqDetailRecord = {
    rfq: {
      id: 'rfq-1',
      tenantId: 'tenant-1',
      purchaseRequestId: 'req-1',
      rfqNumber: 'RFQ-000001',
      status: PurchaseRfqStatus.SENT,
      currency: 'COP',
      responseDeadline: null,
      sentAt: '2026-07-01T00:00:00.000Z',
      closedAt: null,
      createdByUserId: 'user-1',
      notes: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    invitations: [
      {
        id: 'inv-1',
        tenantId: 'tenant-1',
        rfqId: 'rfq-1',
        partyRefId: 'party-1',
        displayName: 'Proveedor Alfa',
        status: PurchaseRfqInvitationStatus.INVITED,
        invitedAt: '2026-07-01T00:00:00.000Z',
        respondedAt: null,
        declinedAt: null,
        declineReason: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      {
        id: 'inv-2',
        tenantId: 'tenant-1',
        rfqId: 'rfq-1',
        partyRefId: 'party-2',
        displayName: 'Proveedor Beta',
        status: PurchaseRfqInvitationStatus.INVITED,
        invitedAt: '2026-07-01T00:00:00.000Z',
        respondedAt: null,
        declinedAt: null,
        declineReason: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
  };

  return {
    rfq: { ...base.rfq, ...overrides?.rfq },
    invitations: overrides?.invitations ?? base.invitations,
  };
}

function buildQuote(overrides: Partial<SupplierQuoteRecord> = {}): SupplierQuoteRecord {
  return {
    id: 'quote-1',
    tenantId: 'tenant-1',
    purchaseRequestId: 'req-1',
    partyRefId: 'party-1',
    quoteNumber: 'COT-100',
    amount: '1500000',
    shippingCost: '0',
    currency: 'COP',
    validUntil: null,
    notes: null,
    rfqId: 'rfq-1',
    rfqInvitationId: 'inv-1',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('RfqInvitationsPanel', () => {
  const onRefresh = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    URL.createObjectURL = jest.fn(() => 'blob:mock');
    URL.revokeObjectURL = jest.fn();
    purchasingApiMock.downloadRfqInvitationPdf.mockImplementation(async (_rfqId, invitationId) => ({
      blob: new Blob(['pdf'], { type: 'application/pdf' }),
      filename: `RFQ-000001-${invitationId}.pdf`,
    }));
    purchasingApiMock.downloadRfqInvitationsZip.mockResolvedValue({
      blob: new Blob(['zip'], { type: 'application/zip' }),
      filename: 'RFQ-000001-cotizaciones.zip',
    });
    purchasingApiMock.addQuote.mockResolvedValue(buildQuote());
  });

  function buildRfqDetailWithoutInvitations(): PurchaseRfqDetailRecord {
    return { ...buildRfqDetail(), invitations: [] };
  }

  it('descarga el PDF personalizado de un proveedor desde su fila', async () => {
    const user = userEvent.setup();

    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_QUOTES}
        rfqDetail={buildRfqDetail()}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Descargar PDF de Proveedor Beta' }));

    await waitFor(() => {
      expect(purchasingApiMock.downloadRfqInvitationPdf).toHaveBeenCalledWith('rfq-1', 'inv-2');
    });
    expect(purchasingApiMock.downloadRfqInvitationPdf).toHaveBeenCalledTimes(1);
    expect(purchasingApiMock.downloadRfqInvitationsZip).not.toHaveBeenCalled();
  });

  it('descarga todos los PDFs personalizados como ZIP', async () => {
    const user = userEvent.setup();

    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_QUOTES}
        rfqDetail={buildRfqDetail()}
        onRefresh={onRefresh}
      />,
    );

    const downloadAll = screen.getByRole('button', { name: 'Descargar todos (ZIP)' });
    expect(downloadAll).toBeEnabled();

    await user.click(downloadAll);

    await waitFor(() => {
      expect(purchasingApiMock.downloadRfqInvitationsZip).toHaveBeenCalledWith('rfq-1');
    });
    expect(purchasingApiMock.downloadRfqInvitationPdf).not.toHaveBeenCalled();
  });

  it('deshabilita la descarga y muestra el hint cuando no hay invitaciones', () => {
    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_QUOTES}
        rfqDetail={buildRfqDetailWithoutInvitations()}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByRole('button', { name: 'Descargar todos (ZIP)' })).toBeDisabled();
    expect(
      screen.getByText('Invita al menos un proveedor para generar PDFs personalizados.'),
    ).toBeInTheDocument();
  });

  it('muestra error si falla la descarga de la fila', async () => {
    const user = userEvent.setup();
    purchasingApiMock.downloadRfqInvitationPdf.mockRejectedValueOnce(new Error('fallo'));

    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_QUOTES}
        rfqDetail={buildRfqDetail()}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Descargar PDF de Proveedor Alfa' }));

    await waitFor(() => {
      expect(
        screen.getByText(/No fue posible descargar el PDF de: Proveedor Alfa/i),
      ).toBeInTheDocument();
    });
  });

  it('CA-17-01/02: registra oferta ligada a la invitación y refresca', async () => {
    const user = userEvent.setup();

    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_QUOTES}
        rfqDetail={buildRfqDetail()}
        onRefresh={onRefresh}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Registrar cotización de Proveedor Alfa' }),
    );

    const quoteNumberInput = screen.getByLabelText('Número de cotización');
    const amountInput = screen.getByLabelText('Monto');
    await user.type(quoteNumberInput, 'COT-ALFA-01');
    await user.type(amountInput, '250000');
    await user.click(screen.getByRole('checkbox', { name: /Envío gratis/i }));

    await user.click(screen.getByRole('button', { name: 'Guardar cotización' }));

    await waitFor(() => {
      expect(purchasingApiMock.addQuote).toHaveBeenCalledWith('req-1', {
        partyRefId: 'party-1',
        rfqInvitationId: 'inv-1',
        quoteNumber: 'COT-ALFA-01',
        amount: 250000,
        currency: 'COP',
        shippingCost: 0,
      });
    });
    expect(onRefresh).toHaveBeenCalled();
    expect(screen.getByText('Cotización registrada.')).toBeInTheDocument();
  });

  it('CA-17-02: invitación RESPONDED muestra monto y oculta registrar oferta', () => {
    const quote = buildQuote({ amount: '1500000', rfqInvitationId: 'inv-1' });
    const detail = buildRfqDetail({
      invitations: [
        {
          id: 'inv-1',
          tenantId: 'tenant-1',
          rfqId: 'rfq-1',
          partyRefId: 'party-1',
          displayName: 'Proveedor Alfa',
          status: PurchaseRfqInvitationStatus.RESPONDED,
          invitedAt: '2026-07-01T00:00:00.000Z',
          respondedAt: '2026-07-02T00:00:00.000Z',
          declinedAt: null,
          declineReason: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
        },
      ],
    });

    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_QUOTES}
        rfqDetail={detail}
        quotes={[quote]}
        onRefresh={onRefresh}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Registrar cotización de Proveedor Alfa' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText((_content, element) => {
        const text = element?.textContent?.replace(/\u00a0/g, ' ') ?? '';
        const expected = `Cotización: ${formatInventoryCurrency(quote.amount)}`.replace(
          /\u00a0/g,
          ' ',
        );
        return element?.tagName === 'P' && text === expected;
      }),
    ).toBeInTheDocument();
  });

  it('CA-17-01: con RFQ RECEIVING e invitación INVITED muestra registrar oferta', () => {
    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_QUOTES}
        rfqDetail={buildRfqDetail({ rfq: { status: PurchaseRfqStatus.RECEIVING } })}
        onRefresh={onRefresh}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Registrar cotización de Proveedor Alfa' }),
    ).toBeInTheDocument();
  });

  it('CA-17-03: no muestra registrar oferta con RFQ DRAFT o CLOSED', () => {
    const { rerender } = render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_QUOTES}
        rfqDetail={buildRfqDetail({ rfq: { status: PurchaseRfqStatus.DRAFT } })}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.queryByRole('button', { name: /Registrar cotización/i })).not.toBeInTheDocument();

    rerender(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_QUOTES}
        rfqDetail={buildRfqDetail({ rfq: { status: PurchaseRfqStatus.CLOSED } })}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.queryByRole('button', { name: /Registrar cotización/i })).not.toBeInTheDocument();
  });

  it('CA-17-03: no muestra registrar oferta en invitaciones DECLINED, EXPIRED o CANCELLED', () => {
    const excludedStatuses = [
      PurchaseRfqInvitationStatus.DECLINED,
      PurchaseRfqInvitationStatus.EXPIRED,
      PurchaseRfqInvitationStatus.CANCELLED,
    ] as const;

    for (const status of excludedStatuses) {
      const { unmount } = render(
        <RfqInvitationsPanel
          purchaseRequestId="req-1"
          requestStatus={PurchaseRequestStatus.PENDING_QUOTES}
          rfqDetail={buildRfqDetail({
            invitations: [
              {
                id: 'inv-1',
                tenantId: 'tenant-1',
                rfqId: 'rfq-1',
                partyRefId: 'party-1',
                displayName: 'Proveedor Alfa',
                status,
                invitedAt: '2026-07-01T00:00:00.000Z',
                respondedAt: null,
                declinedAt:
                  status === PurchaseRfqInvitationStatus.DECLINED
                    ? '2026-07-02T00:00:00.000Z'
                    : null,
                declineReason: status === PurchaseRfqInvitationStatus.DECLINED ? 'Sin stock' : null,
                createdAt: '2026-07-01T00:00:00.000Z',
                updatedAt: '2026-07-02T00:00:00.000Z',
              },
            ],
          })}
          onRefresh={onRefresh}
        />,
      );

      expect(
        screen.queryByRole('button', { name: 'Registrar cotización de Proveedor Alfa' }),
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it('CA-17-04: Guardar cotización queda deshabilitado con monto o número inválidos', async () => {
    const user = userEvent.setup();

    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_QUOTES}
        rfqDetail={buildRfqDetail()}
        onRefresh={onRefresh}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Registrar cotización de Proveedor Alfa' }),
    );

    const saveButton = screen.getByRole('button', { name: 'Guardar cotización' });
    expect(saveButton).toBeDisabled();

    await user.type(screen.getByLabelText('Número de cotización'), 'COT-X');
    expect(saveButton).toBeDisabled();

    await user.clear(screen.getByLabelText('Número de cotización'));
    await user.type(screen.getByLabelText('Monto'), '0');
    expect(saveButton).toBeDisabled();
    expect(screen.getByText('Ingresa un monto válido mayor a cero.')).toBeInTheDocument();
  });

  it('CA-18-04: registra oferta con líneas de solicitud y rfqInvitationId', async () => {
    const user = userEvent.setup();
    const requestLines: PurchaseRequestLineRecord[] = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        tenantId: 'tenant-1',
        purchaseRequestId: 'req-1',
        sourceKind: PurchaseRequestLineSourceKind.FREE_TEXT,
        inventoryItemId: null,
        freeTextDescription: 'Cable UTP',
        quantityRequested: '10',
        unitOfMeasure: 'UND',
        suggestedPartyRefId: null,
        lineStatus: PurchaseRequestLineStatus.OPEN,
        notes: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ];

    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_QUOTES}
        rfqDetail={buildRfqDetail()}
        requestLines={requestLines}
        onRefresh={onRefresh}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Registrar cotización de Proveedor Alfa' }),
    );
    await user.type(screen.getByLabelText('Número de cotización'), 'COT-LINES');
    await user.type(screen.getByLabelText('Costo unitario de Cable UTP'), '1500');
    await user.click(screen.getByRole('checkbox', { name: /Envío gratis/i }));
    await user.click(screen.getByRole('button', { name: 'Guardar cotización' }));

    await waitFor(() => {
      expect(purchasingApiMock.addQuote).toHaveBeenCalledWith('req-1', {
        partyRefId: 'party-1',
        rfqInvitationId: 'inv-1',
        quoteNumber: 'COT-LINES',
        currency: 'COP',
        shippingCost: 0,
        lines: [
          {
            purchaseRequestLineId: '11111111-1111-1111-1111-111111111111',
            unitCost: 1500,
          },
        ],
      });
    });
  });

  it('CA-17-05: muestra error si addQuote rechaza y el panel sigue usable', async () => {
    const user = userEvent.setup();
    purchasingApiMock.addQuote.mockRejectedValueOnce(
      new Error('Esta invitación ya tiene una cotización registrada.'),
    );

    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_QUOTES}
        rfqDetail={buildRfqDetail()}
        onRefresh={onRefresh}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Registrar cotización de Proveedor Alfa' }),
    );
    await user.type(screen.getByLabelText('Número de cotización'), 'COT-DUP');
    await user.type(screen.getByLabelText('Monto'), '1000');
    await user.click(screen.getByRole('checkbox', { name: /Envío gratis/i }));
    await user.click(screen.getByRole('button', { name: 'Guardar cotización' }));

    await waitFor(() => {
      expect(
        screen.getByText('Esta invitación ya tiene una cotización registrada.'),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Descargar todos (ZIP)' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Registrar cotización de Proveedor Alfa' }),
    ).toBeInTheDocument();
  });
});
