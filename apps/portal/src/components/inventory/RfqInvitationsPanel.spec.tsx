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
import { formatInventoryMoney } from './inventory-labels';
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
    updateQuote: jest.fn(),
  },
}));

jest.mock('./SupplierMultiPicker', () => ({
  SupplierMultiPicker: ({
    value,
    onChange,
    label,
  }: {
    value: Array<{ partyRefId: string; displayName: string }>;
    onChange: (next: Array<{ partyRefId: string; displayName: string }>) => void;
    label?: string;
  }) => (
    <div data-testid="supplier-multi-picker">
      {label ? <span>{label}</span> : null}
      {value.map((entry) => (
        <span key={entry.partyRefId}>{entry.displayName}</span>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([...value, { partyRefId: 'party-1', displayName: 'Proveedor Alfa' }])
        }
      >
        Elegir Proveedor Alfa
      </button>
    </div>
  ),
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
    purchasingApiMock.updateQuote.mockResolvedValue(buildQuote({ quoteNumber: 'COT-101' }));
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

  it('DRAFT sin invitaciones: Enviar deshabilitado con guía de 2 pasos', async () => {
    const user = userEvent.setup();

    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.DRAFT}
        rfqDetail={buildRfqDetail({
          rfq: { status: PurchaseRfqStatus.DRAFT },
          invitations: [],
        })}
        onRefresh={onRefresh}
      />,
    );

    const sendButton = screen.getByRole('button', { name: 'Enviar solicitud' });
    expect(sendButton).toBeDisabled();
    expect(
      screen.getByText('Invita al menos un proveedor antes de enviar la solicitud.'),
    ).toBeInTheDocument();

    await user.click(sendButton);
    expect(purchasingApiMock.sendRfq).not.toHaveBeenCalled();
  });

  it('DRAFT con invitación: Enviar habilitado y envía la ronda', async () => {
    const user = userEvent.setup();

    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.DRAFT}
        rfqDetail={buildRfqDetail({ rfq: { status: PurchaseRfqStatus.DRAFT } })}
        onRefresh={onRefresh}
      />,
    );

    const sendButton = screen.getByRole('button', { name: 'Enviar solicitud' });
    expect(sendButton).toBeEnabled();

    await user.click(sendButton);

    await waitFor(() => {
      expect(purchasingApiMock.sendRfq).toHaveBeenCalledWith('rfq-1');
    });
    expect(screen.getByText('Solicitud de cotización enviada.')).toBeInTheDocument();
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

    const quoteNumberInput = screen.getByLabelText(/Número de cotización/i);
    const amountInput = screen.getByLabelText('Monto');
    await user.type(quoteNumberInput, 'COT-ALFA-01');
    await user.type(amountInput, '250000');
    await user.click(screen.getByRole('button', { name: 'Guardar cotización' }));

    await waitFor(() => {
      expect(purchasingApiMock.addQuote).toHaveBeenCalledWith('req-1', {
        partyRefId: 'party-1',
        rfqInvitationId: 'inv-1',
        quoteNumber: 'COT-ALFA-01',
        amount: 250000,
        currency: 'COP',
        shippingCost: 0,
        shippingArrangement: 'ON_INVOICE',
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
      screen.getByRole('button', { name: 'Modificar cotización de Proveedor Alfa' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_content, element) => {
        const text = element?.textContent?.replace(/\u00a0/g, ' ') ?? '';
        const expected = `Cotización: ${formatInventoryMoney(quote.amount, 'COP')} COP`.replace(
          /\u00a0/g,
          ' ',
        );
        return element?.tagName === 'P' && text === expected;
      }),
    ).toBeInTheDocument();
  });

  function buildRespondedInvitation(): PurchaseRfqDetailRecord['invitations'][number] {
    return {
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
    };
  }

  it('prellena la cotización respondida y guarda cambios con PATCH', async () => {
    const user = userEvent.setup();
    const quote = buildQuote({
      amount: '1500000',
      shippingCost: '250',
      shippingArrangement: 'ON_INVOICE',
      taxes: [
        {
          code: 'IVA_19',
          name: 'IVA',
          category: 'VAT',
          effect: 'ADD',
          applies: true,
          rate: '19',
          baseAmount: '1500000',
          taxAmount: '285000',
        },
      ],
    });

    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_APPROVAL}
        rfqDetail={buildRfqDetail({
          rfq: { status: PurchaseRfqStatus.RECEIVING },
          invitations: [buildRespondedInvitation()],
        })}
        quotes={[quote]}
        onRefresh={onRefresh}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Modificar cotización de Proveedor Alfa' }),
    );

    expect(screen.getByDisplayValue('COT-100')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1500000')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'IVA' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(purchasingApiMock.updateQuote).toHaveBeenCalledWith(
        'req-1',
        'quote-1',
        expect.objectContaining({
          quoteNumber: 'COT-100',
          amount: 1500000,
          shippingCost: 250,
          shippingArrangement: 'ON_INVOICE',
          taxes: [{ code: 'IVA_19', applies: true, rate: 19 }],
        }),
      );
    });
    expect(purchasingApiMock.addQuote).not.toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalled();
    expect(screen.getByText('Cotización actualizada.')).toBeInTheDocument();
  });

  it('no muestra modificar si la ronda ya cerró o la cotización está adjudicada', () => {
    const quote = buildQuote();
    const { rerender } = render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_APPROVAL}
        rfqDetail={buildRfqDetail({
          rfq: { status: PurchaseRfqStatus.CLOSED },
          invitations: [buildRespondedInvitation()],
        })}
        quotes={[quote]}
        onRefresh={onRefresh}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Modificar cotización de Proveedor Alfa' }),
    ).not.toBeInTheDocument();

    rerender(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_APPROVAL}
        rfqDetail={buildRfqDetail({
          rfq: { status: PurchaseRfqStatus.SENT },
          invitations: [buildRespondedInvitation()],
        })}
        quotes={[quote]}
        awardedQuoteIds={['quote-1']}
        onRefresh={onRefresh}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Modificar cotización de Proveedor Alfa' }),
    ).not.toBeInTheDocument();
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
    expect(screen.getByText('Indica el número de cotización para guardar.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Número de cotización/i), 'COT-X');
    expect(saveButton).toBeDisabled();

    await user.clear(screen.getByLabelText(/Número de cotización/i));
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
    await user.type(screen.getByLabelText(/Número de cotización/i), 'COT-LINES');
    await user.type(screen.getByLabelText('Costo unitario de Cable UTP (sin IVA)'), '1500');
    await user.click(screen.getByRole('button', { name: 'Guardar cotización' }));

    await waitFor(() => {
      expect(purchasingApiMock.addQuote).toHaveBeenCalledWith('req-1', {
        partyRefId: 'party-1',
        rfqInvitationId: 'inv-1',
        quoteNumber: 'COT-LINES',
        currency: 'COP',
        shippingCost: 0,
        shippingArrangement: 'ON_INVOICE',
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
    await user.type(screen.getByLabelText(/Número de cotización/i), 'COT-DUP');
    await user.type(screen.getByLabelText('Monto'), '1000');
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

  it('CA-25-14: muestra tributos en el registro inline y omite el payload si están apagados', async () => {
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

    expect(screen.getByRole('checkbox', { name: 'IVA' })).not.toBeChecked();
    expect(screen.getByText(/No son una factura electrónica/i)).toBeInTheDocument();
    expect(screen.queryByText('IVA_19')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Número de cotización/i), 'COT-ALFA-01');
    await user.type(screen.getByLabelText('Monto'), '250000');
    await user.click(screen.getByRole('button', { name: 'Guardar cotización' }));

    await waitFor(() => {
      expect(purchasingApiMock.addQuote).toHaveBeenCalledWith(
        'req-1',
        expect.not.objectContaining({ taxes: expect.anything() }),
      );
    });
  });

  it('CA-25-03: envía solo el tributo encendido y deshabilita guardar con tasa inválida', async () => {
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
    await user.type(screen.getByLabelText(/Número de cotización/i), 'COT-IVA');
    await user.type(screen.getByLabelText('Monto'), '100');
    await user.click(screen.getByRole('checkbox', { name: 'IVA' }));

    const rateInput = screen.getByLabelText('Tasa de IVA (%)');
    await user.clear(rateInput);
    await user.type(rateInput, '101');
    expect(screen.getByRole('button', { name: 'Guardar cotización' })).toBeDisabled();

    await user.clear(rateInput);
    await user.type(rateInput, '19');
    await user.click(screen.getByRole('button', { name: 'Guardar cotización' }));

    await waitFor(() => {
      expect(purchasingApiMock.addQuote).toHaveBeenCalledWith(
        'req-1',
        expect.objectContaining({
          taxes: [{ code: 'IVA_19', applies: true, rate: 19 }],
        }),
      );
    });
  });

  it('CA-28-01/03: DRAFT sin ronda muestra el selector y exige selección', () => {
    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.DRAFT}
        rfqDetail={null}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByTestId('supplier-multi-picker')).toBeInTheDocument();
    expect(screen.getByText('Proveedores a invitar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear e invitar' })).toBeDisabled();
    expect(
      screen.getByText('Selecciona al menos un proveedor para abrir la ronda.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Crear solicitud de cotización' }),
    ).not.toBeInTheDocument();
  });

  it('CA-28-02: Crear e invitar encadena createRfq e inviteSuppliers en un acto', async () => {
    const user = userEvent.setup();
    purchasingApiMock.createRfq.mockResolvedValue(
      buildRfqDetail({ rfq: { status: PurchaseRfqStatus.DRAFT } }).rfq,
    );
    purchasingApiMock.inviteSuppliers.mockResolvedValue([]);

    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.DRAFT}
        rfqDetail={null}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Elegir Proveedor Alfa' }));
    expect(screen.getByRole('button', { name: 'Crear e invitar' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Crear e invitar' }));

    await waitFor(() => {
      expect(purchasingApiMock.createRfq).toHaveBeenCalledWith(
        'req-1',
        expect.objectContaining({ currency: 'COP' }),
      );
    });
    expect(purchasingApiMock.inviteSuppliers).toHaveBeenCalledWith('rfq-1', {
      partyRefIds: ['party-1'],
    });
    expect(onRefresh).toHaveBeenCalled();
    expect(
      screen.getByText('Ronda de cotización creada y proveedores invitados.'),
    ).toBeInTheDocument();
  });

  it('CA-28-04: fallo parcial conserva la selección y ofrece Invitar seleccionados', async () => {
    const user = userEvent.setup();
    purchasingApiMock.createRfq.mockResolvedValue(
      buildRfqDetail({ rfq: { status: PurchaseRfqStatus.DRAFT } }).rfq,
    );
    purchasingApiMock.inviteSuppliers.mockRejectedValueOnce(new Error('fallo de red'));

    const { rerender } = render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.DRAFT}
        rfqDetail={null}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Elegir Proveedor Alfa' }));
    await user.click(screen.getByRole('button', { name: 'Crear e invitar' }));

    await waitFor(() => {
      expect(purchasingApiMock.inviteSuppliers).toHaveBeenCalledTimes(1);
    });
    expect(purchasingApiMock.createRfq).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Proveedor Alfa')).toBeInTheDocument();
    expect(
      screen.getByText(
        'La ronda quedó creada, solo falta invitar. Revisa la selección y pulsa Invitar seleccionados.',
      ),
    ).toBeInTheDocument();
    expect(onRefresh).toHaveBeenCalled();

    // Tras el refresh la ronda existe: el modo «ronda existente» ofrece
    // invitar sin volver a crear (ningún reintento produce un 400 opaco).
    rerender(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.DRAFT}
        rfqDetail={buildRfqDetail({ rfq: { status: PurchaseRfqStatus.DRAFT }, invitations: [] })}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByRole('button', { name: 'Invitar seleccionados' })).toBeEnabled();
    expect(purchasingApiMock.createRfq).toHaveBeenCalledTimes(1);
  });

  it('CA-28-05: PENDING_QUOTES sin ronda ofrece el formulario de crear e invitar', () => {
    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_QUOTES}
        rfqDetail={null}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByTestId('supplier-multi-picker')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear e invitar' })).toBeDisabled();
  });

  it('CA-28-08: en PENDING_APPROVAL no aparece el formulario de crear ronda', () => {
    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_APPROVAL}
        rfqDetail={null}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Crear e invitar' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('supplier-multi-picker')).not.toBeInTheDocument();
    expect(screen.getByText('Cotización sin ronda formal')).toBeInTheDocument();
  });
});

describe('RfqInvitationsPanel — hallazgos de auditoría Fase 28', () => {
  const onRefresh = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    onRefresh.mockResolvedValue(undefined);
    URL.createObjectURL = jest.fn(() => 'blob:mock');
    URL.revokeObjectURL = jest.fn();
  });

  it('FE-ALTO-1: si el refresco falla tras una escritura exitosa, no se reporta como fallo de la acción', async () => {
    const user = userEvent.setup();
    purchasingApiMock.sendRfq.mockResolvedValue(undefined as never);
    onRefresh.mockRejectedValue(new Error('GET 503'));

    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.DRAFT}
        rfqDetail={buildRfqDetail({ rfq: { status: PurchaseRfqStatus.DRAFT } })}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

    await waitFor(() => {
      expect(screen.getByText('Solicitud de cotización enviada.')).toBeInTheDocument();
    });
    expect(screen.getByText(/El cambio quedó guardado/i)).toBeInTheDocument();
    expect(screen.getByText(/no repitas la acción/i)).toBeInTheDocument();
    expect(purchasingApiMock.sendRfq).toHaveBeenCalledTimes(1);
  });

  it('FE-ALTO-1: un fallo real de la escritura no muestra mensaje de éxito', async () => {
    const user = userEvent.setup();
    purchasingApiMock.sendRfq.mockRejectedValue(new Error('La ronda ya fue enviada.'));

    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.DRAFT}
        rfqDetail={buildRfqDetail({ rfq: { status: PurchaseRfqStatus.DRAFT } })}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

    await waitFor(() => {
      expect(screen.getByText('La ronda ya fue enviada.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Solicitud de cotización enviada.')).not.toBeInTheDocument();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('FE-ALTO-2: una cotización en USD no se pinta en formato COP', () => {
    const quote = buildQuote({ amount: '1200', currency: 'USD', rfqInvitationId: 'inv-1' });

    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.PENDING_QUOTES}
        rfqDetail={buildRfqDetail()}
        quotes={[quote]}
        onRefresh={onRefresh}
      />,
    );

    const expected = `Cotización: ${formatInventoryMoney('1200', 'USD')} USD`.replace(/ /g, ' ');
    expect(
      screen.getByText((_content, element) => {
        const text = element?.textContent?.replace(/ /g, ' ') ?? '';
        return element?.tagName === 'P' && text === expected;
      }),
    ).toBeInTheDocument();
    // El importe COP y el USD no pueden compartir renderizado.
    expect(expected).not.toBe(
      `Cotización: ${formatInventoryMoney('1200', 'COP')} COP`.replace(/ /g, ' '),
    );
  });

  it('FE-ALTO-4: el motivo de bloqueo del envío se expone por aria-describedby, no por title', () => {
    render(
      <RfqInvitationsPanel
        purchaseRequestId="req-1"
        requestStatus={PurchaseRequestStatus.DRAFT}
        rfqDetail={buildRfqDetail({ rfq: { status: PurchaseRfqStatus.DRAFT }, invitations: [] })}
        onRefresh={onRefresh}
      />,
    );

    const sendButton = screen.getByRole('button', { name: 'Enviar solicitud' });
    expect(sendButton).toBeDisabled();
    expect(sendButton).not.toHaveAttribute('title');

    const describedBy = sendButton.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const reason = document.getElementById(describedBy as string);
    expect(reason).not.toBeNull();
    expect(reason).toHaveTextContent('Invita al menos un proveedor antes de enviar la solicitud.');
  });
});
