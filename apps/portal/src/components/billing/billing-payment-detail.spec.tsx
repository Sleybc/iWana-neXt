/**
 * Detalle del pago en Facturación → Pagos (spec MOD05↔MOD14 2026-11-13 D3, D6, D8, R3, R5, CA-3,
 * CA-5, CA-7): facturas cubiertas, desasociar con motivo, recibo numerado y su registro de envíos.
 */
import { randomUUID } from 'node:crypto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
  type BillingDocumentResponse,
  type BillingPaymentResponse,
} from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import { BillingPaymentDetail, unlinkBlockReason } from './BillingPaymentDetail';
import { BillingPaymentTable } from './BillingPaymentsClient';
import { billingError } from './billing-ui';

const mockGranted = { current: new Set<AccessPermissionKey>() };
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    const ctx = { hasPermission: (key: AccessPermissionKey) => mockGranted.current.has(key) };
    return () => ctx;
  })(),
}));

const mockUnlink = jest.fn();
const mockReceiptPdf = jest.fn();
const mockSendReceipt = jest.fn();
const mockEmailLog = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    billingApi: {
      unlinkAllocation: (...args: unknown[]) => mockUnlink(...args),
      receiptPdf: (...args: unknown[]) => mockReceiptPdf(...args),
      sendReceiptEmail: (...args: unknown[]) => mockSendReceipt(...args),
      emailLog: (...args: unknown[]) => mockEmailLog(...args),
    },
  };
});

const SUBSCRIBER_ID = '55555555-5555-4555-8555-555555555555';
const PAYMENT_ID = '66666666-6666-4666-8666-666666666666';
const USER_ID = '77777777-7777-4777-8777-777777777777';
const DOC_OK = '11111111-1111-4111-8111-111111111111';
const DOC_VOIDED = '11111111-1111-4111-8111-111111111112';
const DOC_IMPORTED = '11111111-1111-4111-8111-111111111113';
const DOC_WITHHELD = '11111111-1111-4111-8111-111111111114';

function allocation(id: string, documentId: string, extra: object = {}) {
  return {
    id,
    tenantId: '22222222-2222-4222-8222-222222222222',
    paymentId: PAYMENT_ID,
    documentId,
    amount: '50.00',
    reversedAt: null,
    reversedBy: null,
    reversalReasonCode: null,
    createdBy: USER_ID,
    createdAt: '2026-11-06T12:00:00.000Z',
    ...extra,
  };
}

const ALLOC_OK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

function payment(overrides: Partial<BillingPaymentResponse> = {}): BillingPaymentResponse {
  return {
    id: PAYMENT_ID,
    tenantId: '22222222-2222-4222-8222-222222222222',
    subscriberId: SUBSCRIBER_ID,
    method: 'TRANSFERENCIA',
    amount: '200.00',
    paidAt: '2026-11-06',
    reference: 'TR-1',
    idempotencyKey: 'k-1',
    status: 'REGISTRADO',
    createdBy: USER_ID,
    createdAt: '2026-11-06T12:00:00.000Z',
    allocatedAmount: '200.00',
    unallocatedAmount: '0.00',
    allocations: [
      allocation(ALLOC_OK, DOC_OK),
      allocation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', DOC_VOIDED),
      allocation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', DOC_IMPORTED),
      allocation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', DOC_WITHHELD),
      allocation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', DOC_OK, {
        reversedAt: '2026-11-07T12:00:00.000Z',
        reversalReasonCode: 'VALOR_EQUIVOCADO',
      }),
    ],
    withholdingAmount: '4.00',
    withholdings: [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
        paymentId: PAYMENT_ID,
        documentId: DOC_WITHHELD,
        taxCode: 'RETE_ICA',
        base: '100.00',
        rate: '4.0000',
        amount: '4.00',
        certificateNumber: null,
        voidedAt: null,
        createdBy: USER_ID,
        createdAt: '2026-11-06T12:00:00.000Z',
      },
    ],
    receiptNumber: 12,
    imported: false,
    externalId: null,
    ...overrides,
  };
}

const doc = (id: string, number: string, status: BillingDocumentResponse['status']) => ({
  id,
  number,
  externalNumber: null,
  status,
  periodStart: null,
});

const DOCUMENTS = [
  doc(DOC_OK, 'DC-1', 'EMITIDO'),
  doc(DOC_VOIDED, 'DC-2', 'ANULADO'),
  { ...doc(DOC_IMPORTED, 'x', 'IMPORTADO'), number: null, externalNumber: 'UISP-7' },
  doc(DOC_WITHHELD, 'DC-4', 'EMITIDO'),
];

const onChanged = jest.fn();

// jsdom no expone crypto.randomUUID; la confirmación lo usa para su llave de intento.
const originalUuid = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
beforeAll(() => {
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: randomUUID });
});
afterAll(() => {
  if (originalUuid) Object.defineProperty(globalThis.crypto, 'randomUUID', originalUuid);
  else Reflect.deleteProperty(globalThis.crypto, 'randomUUID');
});

function renderDetail(value = payment()) {
  return render(
    <BillingPaymentDetail
      payment={value}
      documents={DOCUMENTS}
      subscriberId={SUBSCRIBER_ID}
      onChanged={onChanged}
      onClose={jest.fn()}
    />,
  );
}

function coverage() {
  return screen.getByRole('region', { name: 'Facturas cubiertas por el pago' });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGranted.current = new Set([
    AccessPermissionKey.BILLING_INVOICES_READ,
    AccessPermissionKey.BILLING_PAYMENTS_READ,
    AccessPermissionKey.BILLING_PAYMENTS_REGISTER,
  ]);
  mockEmailLog.mockResolvedValue({ subscriberId: SUBSCRIBER_ID, entries: [] });
  URL.createObjectURL = jest.fn(() => 'blob:recibo');
  URL.revokeObjectURL = jest.fn();
});

describe('unlinkBlockReason (R5, P3, CA-7)', () => {
  const vigente = { documentId: DOC_OK, reversedAt: null };
  it('permite una aplicación vigente sobre un emitido sin retención', () => {
    expect(unlinkBlockReason(payment(), vigente, { status: 'EMITIDO' })).toBeNull();
  });
  it.each([
    ['ANULADO', /anulado/u],
    ['IMPORTADO', /histórico importado/u],
  ] as const)('bloquea un documento %s', (status, message) => {
    expect(unlinkBlockReason(payment(), vigente, { status })).toMatch(message);
  });
  it('bloquea si el pago tiene una retención vigente sobre el documento', () => {
    expect(
      unlinkBlockReason(
        payment(),
        { documentId: DOC_WITHHELD, reversedAt: null },
        { status: 'EMITIDO' },
      ),
    ).toMatch(/anula el pago/u);
  });
  it('una retención anulada no bloquea', () => {
    const voided = payment({
      withholdings: payment().withholdings!.map((line) => ({ ...line, voidedAt: '2026-11-08' })),
    });
    expect(
      unlinkBlockReason(
        voided,
        { documentId: DOC_WITHHELD, reversedAt: null },
        { status: 'EMITIDO' },
      ),
    ).toBeNull();
  });
});

describe('BillingPaymentDetail — facturas cubiertas y desasociar', () => {
  it('lista cada documento cubierto con su importe y el estado de la aplicación', async () => {
    renderDetail();
    const rows = within(coverage()).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('DC-1');
    expect(rows[2]).toHaveTextContent('UISP-7');
    expect(rows[4]).toHaveTextContent('Desasociada');
    expect(rows[4]).toHaveTextContent('El valor aplicado es incorrecto');
    expect(within(rows[4]!).queryByRole('button')).not.toBeInTheDocument();
    expect(await screen.findByText('Aún no hay envíos por correo.')).toBeInTheDocument();
  });

  it('deshabilita Desasociar con explicación en anulado, importado y con retención vigente', async () => {
    renderDetail();
    const voided = screen.getByRole('button', { name: 'Desasociar del documento DC-2' });
    const imported = screen.getByRole('button', { name: 'Desasociar del documento UISP-7' });
    const withheld = screen.getByRole('button', { name: 'Desasociar del documento DC-4' });
    expect(voided).toBeDisabled();
    expect(voided).toHaveAccessibleDescription(
      'No se puede desasociar: el documento está anulado.',
    );
    expect(imported).toBeDisabled();
    expect(imported).toHaveAccessibleDescription(/histórico importado/u);
    expect(withheld).toBeDisabled();
    expect(withheld).toHaveAccessibleDescription(/Para corregirlo, anula el pago\./u);
    expect(screen.getByRole('button', { name: 'Desasociar del documento DC-1' })).toBeEnabled();
    await screen.findByText('Aún no hay envíos por correo.');
  });

  it('exige el motivo y llama a la API con el código elegido', async () => {
    const user = userEvent.setup();
    mockUnlink.mockResolvedValue(payment());
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Desasociar del documento DC-1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desasociar del documento DC-1' });
    const confirm = within(dialog).getByRole('button', { name: 'Desasociar' });
    expect(confirm).toBeDisabled();
    expect(within(dialog).queryByLabelText('Observación o nota adicional')).not.toBeInTheDocument();
    const reason = within(dialog).getByLabelText('Motivo');
    expect(
      within(reason)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Selecciona un motivo',
      'Se aplicó al documento equivocado',
      'El valor aplicado es incorrecto',
      'Se va a aplicar a otro documento',
    ]);
    await user.selectOptions(reason, 'Se va a aplicar a otro documento');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() =>
      expect(mockUnlink).toHaveBeenCalledWith(PAYMENT_ID, ALLOC_OK, { reasonCode: 'REASIGNACION' }),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('muestra el error de la API si el servidor rechaza la desasociación', async () => {
    const user = userEvent.setup();
    mockUnlink.mockRejectedValue(
      new ApiError(422, 'BILLING_ALLOCATION_HAS_WITHHOLDING', 'Mensaje del servidor'),
    );
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Desasociar del documento DC-1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desasociar del documento DC-1' });
    await user.selectOptions(
      within(dialog).getByLabelText('Motivo'),
      'El valor aplicado es incorrecto',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Desasociar' }));
    expect(
      await within(dialog).findByText(
        'Este pago tiene una retención sobre el documento. Para corregirlo, anula el pago.',
      ),
    ).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('sin permiso para registrar pagos no ofrece Desasociar ni Enviar recibo', async () => {
    mockGranted.current = new Set([
      AccessPermissionKey.BILLING_INVOICES_READ,
      AccessPermissionKey.BILLING_PAYMENTS_READ,
    ]);
    renderDetail();
    expect(screen.queryByRole('button', { name: /Desasociar/u })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar recibo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar recibo' })).toBeInTheDocument();
    await screen.findByText('Aún no hay envíos por correo.');
  });
});

describe('BillingPaymentDetail — registro de envíos del recibo', () => {
  it('sin lectura de documentos no muestra ni consulta el registro (la API la exige)', () => {
    mockGranted.current = new Set([
      AccessPermissionKey.BILLING_PAYMENTS_READ,
      AccessPermissionKey.BILLING_PAYMENTS_REGISTER,
    ]);
    renderDetail();
    expect(screen.getByRole('button', { name: 'Descargar recibo' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Registro de envíos' })).not.toBeInTheDocument();
    expect(mockEmailLog).not.toHaveBeenCalled();
  });

  it('sin lectura de pagos tampoco lo muestra', () => {
    mockGranted.current = new Set([AccessPermissionKey.BILLING_INVOICES_READ]);
    renderDetail();
    expect(screen.queryByRole('heading', { name: 'Registro de envíos' })).not.toBeInTheDocument();
    expect(mockEmailLog).not.toHaveBeenCalled();
  });

  it('el pago inexistente se explica con un texto legible', () => {
    expect(billingError(new ApiError(404, 'BILLING_PAYMENT_NOT_FOUND', 'x'))).toBe(
      'No se encontró el pago. Actualiza la información de facturación.',
    );
  });
});

describe('BillingPaymentDetail — recibo (CA-3)', () => {
  it('descarga el recibo con su número', async () => {
    const user = userEvent.setup();
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const names: string[] = [];
    click.mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    mockReceiptPdf.mockResolvedValue(new Blob(['%PDF']));
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Recibo N.º 12' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Descargar recibo' }));
    await waitFor(() => expect(mockReceiptPdf).toHaveBeenCalledWith(PAYMENT_ID));
    await waitFor(() => expect(names).toEqual(['recibo-12.pdf']));
    click.mockRestore();
  });

  it('envía el recibo, informa el resultado y recarga el registro de envíos', async () => {
    const user = userEvent.setup();
    mockSendReceipt.mockResolvedValue({
      id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      subscriberId: SUBSCRIBER_ID,
      kind: 'RECIBO',
      documentId: null,
      paymentId: PAYMENT_ID,
      periodFrom: null,
      periodTo: null,
      recipientMasked: 'j***@d***.co',
      subject: 'Recibo de pago N.º 12',
      status: 'EN_COLA',
      reasonCode: null,
      resend: false,
      requestedBy: USER_ID,
      createdAt: '2026-11-13T15:00:00.000Z',
      processedAt: null,
    });
    renderDetail();
    await screen.findByText('Aún no hay envíos por correo.');
    expect(mockEmailLog).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Enviar recibo' }));
    expect(mockSendReceipt).toHaveBeenCalledWith(PAYMENT_ID);
    expect(await screen.findByText('Envío en cola')).toBeInTheDocument();
    await waitFor(() => expect(mockEmailLog).toHaveBeenCalledTimes(2));
  });

  it('un pago anulado conserva la descarga pero no se envía', async () => {
    renderDetail(payment({ status: 'ANULADO' }));
    expect(screen.getByText('Pago anulado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar recibo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar recibo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Desasociar/u })).not.toBeInTheDocument();
    await screen.findByText('Aún no hay envíos por correo.');
  });

  it('un pago importado no tiene número, ni descarga, ni envío, y muestra su referencia de origen', () => {
    renderDetail(payment({ imported: true, receiptNumber: null, externalId: 'uisp:99' }));
    expect(screen.getByRole('heading', { name: 'Pago importado' })).toBeInTheDocument();
    expect(screen.getAllByText('Importado · uisp:99').length).toBeGreaterThan(0);
    expect(screen.queryByText(/N\.º/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar recibo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar recibo' })).not.toBeInTheDocument();
    expect(mockEmailLog).not.toHaveBeenCalled();
  });
});

describe('BillingPaymentTable — columna Recibo', () => {
  it('muestra el número o la referencia del importado y abre el detalle', async () => {
    const user = userEvent.setup();
    const open = jest.fn();
    render(
      <BillingPaymentTable
        payments={[
          payment(),
          payment({
            id: '66666666-6666-4666-8666-666666666667',
            imported: true,
            receiptNumber: null,
            externalId: 'uisp:99',
          }),
        ]}
        onChanged={jest.fn()}
        showReceipt
        onOpenDetail={open}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Recibo' })).toBeInTheDocument();
    expect(screen.getByText('N.º 12')).toBeInTheDocument();
    expect(screen.getByText('Importado · uisp:99')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /^Ver detalle del pago/u })[0]!);
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: PAYMENT_ID }));
  });

  it('sin la opción no agrega la columna (página de Pagos del módulo)', () => {
    render(<BillingPaymentTable payments={[payment()]} onChanged={jest.fn()} />);
    expect(screen.queryByRole('columnheader', { name: 'Recibo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ver detalle/u })).not.toBeInTheDocument();
  });
});
