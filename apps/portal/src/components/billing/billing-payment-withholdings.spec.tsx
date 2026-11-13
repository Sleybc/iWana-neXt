import { randomUUID } from 'node:crypto';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  BillingAccountStatement,
  BillingDocumentResponse,
  BillingWithholdingOptionsResponse,
} from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import { BillingPaymentDialog } from './BillingPaymentDialog';
import { formatBillingMoneyExact } from './billing-copy';

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    const ctx = { hasPermission: () => true };
    return () => ctx;
  })(),
}));

const mockRegisterPayment = jest.fn();
const mockWithholdingOptions = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ApiError: actual.ApiError,
    billingApi: {
      statement: jest.fn(),
      registerPayment: (...args: unknown[]) => mockRegisterPayment(...args),
      withholdingOptions: (...args: unknown[]) => mockWithholdingOptions(...args),
    },
    tenantSelfApi: { getSettings: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) },
  };
});

const SUBSCRIBER_ID = '55555555-5555-4555-8555-555555555555';
const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const money = (value: string) => formatBillingMoneyExact(value).replace(/\s/gu, ' ');

const DOCUMENT: BillingDocumentResponse = {
  id: DOCUMENT_ID,
  tenantId: '22222222-2222-4222-8222-222222222222',
  periodId: '33333333-3333-4333-8333-333333333333',
  contractId: '44444444-4444-4444-8444-444444444444',
  subscriberId: SUBSCRIBER_ID,
  status: 'EMITIDO',
  number: 'DC-000201',
  dueDate: '2026-11-25',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  coveredStart: '2026-11-01',
  paymentState: 'PENDIENTE',
  buyerProtected: false,
  subtotal: '1000000.00',
  taxTotal: '0.00',
  total: '1000000.00',
  unbilledAdditionalCount: 0,
  createdAt: '2026-11-11T12:00:00.000Z',
  updatedAt: '2026-11-11T12:00:00.000Z',
  pendingAmount: '1000000.00',
};

const STATEMENT: BillingAccountStatement = {
  subscriberId: SUBSCRIBER_ID,
  buyerProtected: false,
  impersonationHold: false,
  totalInvoiced: '1000000.00',
  totalPaid: '0.00',
  totalPending: '1000000.00',
  creditBalance: '0.00',
  documents: [DOCUMENT],
  payments: [],
  contractSummaries: [],
};

const ELIGIBLE: BillingWithholdingOptionsResponse = {
  subscriberId: SUBSCRIBER_ID,
  eligible: true,
  eligibility: 'PERSONA_JURIDICA',
  options: [
    {
      taxCode: 'RETE_FUENTE_SERVICIOS',
      name: 'Retención en la fuente servicios',
      suggestedRate: '4.0000',
      source: 'TRIBUTACION',
    },
    { taxCode: 'RETE_ICA', name: 'ReteICA', suggestedRate: '0.9660', source: 'PRESET' },
  ],
};

function renderDialog() {
  render(
    <BillingPaymentDialog
      statement={STATEMENT}
      subscriberId={SUBSCRIBER_ID}
      onClose={jest.fn()}
      onSaved={jest.fn()}
    />,
  );
}

async function addLine(index: number) {
  await userEvent.click(await screen.findByRole('button', { name: 'Agregar retención' }));
  return screen.getByRole('group', { name: `Retención ${index}` });
}

// jsdom no expone crypto.randomUUID; la clave de idempotencia la necesita al registrar.
const originalUuid = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');

beforeEach(() => {
  mockRegisterPayment.mockReset();
  mockWithholdingOptions.mockReset();
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: randomUUID });
});

afterEach(() => {
  if (originalUuid) Object.defineProperty(globalThis.crypto, 'randomUUID', originalUuid);
  else Reflect.deleteProperty(globalThis.crypto, 'randomUUID');
});

describe('BillingPaymentDialog — retenciones (spec MOD14 2026-11-13 R6, R7)', () => {
  it('no muestra retenciones si el titular no es elegible', async () => {
    mockWithholdingOptions.mockResolvedValue({
      subscriberId: SUBSCRIBER_ID,
      eligible: false,
      eligibility: null,
      options: [],
    });
    renderDialog();
    expect(await screen.findByLabelText('Monto del pago (COP)')).toBeInTheDocument();
    expect(mockWithholdingOptions).toHaveBeenCalledWith(SUBSCRIBER_ID);
    expect(screen.queryByRole('heading', { name: 'Retenciones' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar retención' })).not.toBeInTheDocument();
  });

  it('CA-4: retefuente 4 % y reteICA saldan 1.000.000 con el valor recibido neto', async () => {
    mockWithholdingOptions.mockResolvedValue(ELIGIBLE);
    mockRegisterPayment.mockResolvedValue({});
    renderDialog();
    expect(await screen.findByRole('heading', { name: 'Retenciones' })).toBeInTheDocument();
    expect(
      screen.getByText(/El titular es persona jurídica y puede practicar retenciones/u),
    ).toBeInTheDocument();

    const first = await addLine(1);
    expect(within(first).getByLabelText('Tipo de retención')).toHaveValue('RETE_FUENTE_SERVICIOS');
    expect(within(first).getByLabelText('Base (COP)')).toHaveValue('1000000.00');
    expect(within(first).getByLabelText('Tarifa (%)')).toHaveValue('4');
    expect(within(first).getByLabelText('Valor retenido (COP)')).toHaveValue('40000.00');
    await userEvent.type(within(first).getByLabelText('Número de certificado'), 'RF-2026-17');

    const second = await addLine(2);
    await userEvent.selectOptions(within(second).getByLabelText('Tipo de retención'), 'RETE_ICA');
    expect(within(second).getByLabelText('Tarifa (%)')).toHaveValue('0.966');
    expect(within(second).getByLabelText('Valor retenido (COP)')).toHaveValue('9660.00');
    await userEvent.type(within(second).getByLabelText('Número de certificado'), 'ICA-2026-04');

    // «Pagar el saldo completo» descuenta lo retenido del valor recibido.
    await userEvent.click(screen.getByRole('button', { name: 'Pagar el saldo completo' }));
    expect(screen.getByLabelText('Monto del pago (COP)')).toHaveValue('950340.00');
    expect(
      screen.getByText(
        `Valor recibido: ${money('950340')} + Retenciones: ${money('49660')} = Total del pago: ${money('1000000')} · Total aplicado: ${money('1000000')}`,
        { exact: false },
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Monto aplicado a DC-000201')).toHaveValue('1000000.00');

    await userEvent.selectOptions(screen.getByLabelText('Método de pago'), 'TRANSFERENCIA');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));

    expect(mockRegisterPayment).toHaveBeenCalledTimes(1);
    const [payload] = mockRegisterPayment.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({
      subscriberId: SUBSCRIBER_ID,
      method: 'TRANSFERENCIA',
      amount: '950340.00',
      allocations: [{ documentId: DOCUMENT_ID, amount: '1000000.00' }],
      withholdings: [
        {
          taxCode: 'RETE_FUENTE_SERVICIOS',
          base: '1000000.00',
          rate: '4',
          amount: '40000.00',
          certificateNumber: 'RF-2026-17',
        },
        {
          taxCode: 'RETE_ICA',
          base: '1000000.00',
          rate: '0.966',
          amount: '9660.00',
          certificateNumber: 'ICA-2026-04',
        },
      ],
    });
  });

  it('valida localmente la tolerancia de 1 peso y el certificado obligatorio', async () => {
    mockWithholdingOptions.mockResolvedValue(ELIGIBLE);
    renderDialog();
    const line = await addLine(1);
    const amount = within(line).getByLabelText('Valor retenido (COP)');
    await userEvent.clear(amount);
    await userEvent.type(amount, '40101');
    await userEvent.type(screen.getByLabelText('Monto del pago (COP)'), '959899');
    await userEvent.selectOptions(screen.getByLabelText('Método de pago'), 'EFECTIVO');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));

    expect(mockRegisterPayment).not.toHaveBeenCalled();
    expect(
      screen.getByText('Revisa las retenciones marcadas antes de registrar el pago.'),
    ).toBeInTheDocument();
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(amount).toHaveAccessibleDescription(/El valor debe estar a máximo/u);
    const certificate = within(line).getByLabelText('Número de certificado');
    expect(certificate).toHaveAccessibleDescription(
      'Escribe el número del certificado de retención.',
    );

    // Dentro de la tolerancia y con certificado, se envía.
    mockRegisterPayment.mockResolvedValue({});
    await userEvent.clear(amount);
    await userEvent.type(amount, '40001');
    await userEvent.type(certificate, 'RF-1');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    expect(mockRegisterPayment).toHaveBeenCalledTimes(1);
  });

  it('marca la retención atribuida a un documento que el pago no salda', async () => {
    mockWithholdingOptions.mockResolvedValue(ELIGIBLE);
    renderDialog();
    const line = await addLine(1);
    await userEvent.type(within(line).getByLabelText('Número de certificado'), 'RF-1');
    await userEvent.selectOptions(within(line).getByLabelText('Documento (opcional)'), DOCUMENT_ID);
    await userEvent.type(screen.getByLabelText('Monto del pago (COP)'), '100');
    await userEvent.click(screen.getByLabelText(/Distribuir automáticamente/u));
    const applied = screen.getByLabelText('Monto aplicado a DC-000201');
    await userEvent.clear(applied);
    await userEvent.type(applied, '10');
    await userEvent.selectOptions(screen.getByLabelText('Método de pago'), 'EFECTIVO');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));

    expect(mockRegisterPayment).not.toHaveBeenCalled();
    expect(within(line).getByLabelText('Documento (opcional)')).toHaveAccessibleDescription(
      'La retención supera lo que este pago aplica a ese documento.',
    );
  });

  it('traduce el 422 de retención no permitida', async () => {
    mockWithholdingOptions.mockResolvedValue(ELIGIBLE);
    mockRegisterPayment.mockRejectedValue(
      new ApiError(422, 'BILLING_WITHHOLDING_NOT_ALLOWED', 'Solo persona jurídica'),
    );
    renderDialog();
    const line = await addLine(1);
    await userEvent.type(within(line).getByLabelText('Número de certificado'), 'RF-1');
    await userEvent.click(screen.getByRole('button', { name: 'Pagar el saldo completo' }));
    await userEvent.selectOptions(screen.getByLabelText('Método de pago'), 'EFECTIVO');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    expect(
      await screen.findByText(/Este titular no puede registrar retenciones/u),
    ).toBeInTheDocument();
  });

  it('traduce el 422 de retención no atribuible', async () => {
    mockWithholdingOptions.mockResolvedValue(ELIGIBLE);
    mockRegisterPayment.mockRejectedValue(
      new ApiError(422, 'BILLING_WITHHOLDING_NOT_ATTRIBUTABLE', 'No atribuible'),
    );
    renderDialog();
    const line = await addLine(1);
    await userEvent.type(within(line).getByLabelText('Número de certificado'), 'RF-1');
    await userEvent.click(screen.getByRole('button', { name: 'Pagar el saldo completo' }));
    await userEvent.selectOptions(screen.getByLabelText('Método de pago'), 'EFECTIVO');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    expect(
      await screen.findByText(
        /Cada retención debe corresponder a un documento que este pago salda/u,
      ),
    ).toBeInTheDocument();
  });

  it('prellena la base con el saldo que el pago aplica cuando ya hay valor recibido', async () => {
    mockWithholdingOptions.mockResolvedValue(ELIGIBLE);
    renderDialog();
    await userEvent.type(await screen.findByLabelText('Monto del pago (COP)'), '500000');
    const line = await addLine(1);
    expect(within(line).getByLabelText('Base (COP)')).toHaveValue('500000.00');
    expect(within(line).getByLabelText('Valor retenido (COP)')).toHaveValue('20000.00');
  });

  it('quita una línea y vuelve al resumen sin retenciones', async () => {
    mockWithholdingOptions.mockResolvedValue(ELIGIBLE);
    renderDialog();
    await addLine(1);
    expect(screen.getByText(/Valor recibido: /u)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar retención 1' }));
    expect(screen.queryByRole('group', { name: 'Retención 1' })).not.toBeInTheDocument();
    expect(screen.getByText(/Total pago: /u)).toBeInTheDocument();
  });

  it('si la consulta de retenciones falla, avisa y permite reintentar sin bloquear el pago', async () => {
    mockWithholdingOptions.mockRejectedValueOnce(new Error('red')).mockResolvedValue(ELIGIBLE);
    renderDialog();
    expect(
      await screen.findByText('No pudimos consultar si el titular practica retenciones'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Monto del pago (COP)')).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Retenciones' })).toBeInTheDocument();
  });
});

describe('BillingPaymentDialog — reglas por documento y tipo, y tarifa sugerida', () => {
  const WITH_VAT: BillingDocumentResponse = {
    ...DOCUMENT,
    subtotal: '840336.13',
    taxTotal: '159663.87',
    total: '1000000.00',
  };

  function renderWith(statement: BillingAccountStatement) {
    render(
      <BillingPaymentDialog
        statement={statement}
        subscriberId={SUBSCRIBER_ID}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
  }

  async function submitWithFullBalance() {
    await userEvent.click(screen.getByRole('button', { name: 'Pagar el saldo completo' }));
    await userEvent.selectOptions(screen.getByLabelText('Método de pago'), 'EFECTIVO');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
  }

  it('prellena la base con el subtotal antes de IVA y rechaza una base mayor', async () => {
    mockWithholdingOptions.mockResolvedValue(ELIGIBLE);
    renderWith({ ...STATEMENT, documents: [WITH_VAT] });
    const line = await addLine(1);
    const base = within(line).getByLabelText('Base (COP)');
    expect(base).toHaveValue('840336.13');
    await userEvent.type(within(line).getByLabelText('Número de certificado'), 'RF-1');
    await userEvent.clear(base);
    await userEvent.type(base, '1000000');
    await submitWithFullBalance();

    expect(mockRegisterPayment).not.toHaveBeenCalled();
    expect(base).toHaveAttribute('aria-invalid', 'true');
    expect(base).toHaveAccessibleDescription(
      /^La base de este tipo de retención supera el subtotal antes de IVA del documento/u,
    );
  });

  it('no deja dos retenciones del mismo tipo en el mismo documento', async () => {
    mockWithholdingOptions.mockResolvedValue(ELIGIBLE);
    renderWith(STATEMENT);
    const first = await addLine(1);
    const second = await addLine(2);
    for (const [line, certificate] of [
      [first, 'RF-1'],
      [second, 'RF-2'],
    ] as const) {
      const base = within(line).getByLabelText('Base (COP)');
      await userEvent.clear(base);
      await userEvent.type(base, '100000');
      await userEvent.type(within(line).getByLabelText('Número de certificado'), certificate);
    }
    await submitWithFullBalance();

    expect(mockRegisterPayment).not.toHaveBeenCalled();
    expect(within(second).getByLabelText('Documento (opcional)')).toHaveAccessibleDescription(
      /^Ese documento ya tiene una retención de este tipo/u,
    );
  });

  it('cuenta la retención vigente de un pago anterior sobre el mismo documento', async () => {
    mockWithholdingOptions.mockResolvedValue(ELIGIBLE);
    renderWith({
      ...STATEMENT,
      payments: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          withholdings: [
            {
              id: '77777777-7777-4777-8777-777777777777',
              paymentId: '66666666-6666-4666-8666-666666666666',
              documentId: DOCUMENT_ID,
              taxCode: 'RETE_FUENTE_SERVICIOS',
              base: '100000.00',
              rate: '4.0000',
              amount: '4000.00',
              certificateNumber: 'RF-0',
              voidedAt: null,
              createdBy: '88888888-8888-4888-8888-888888888888',
              createdAt: '2026-11-10T12:00:00.000Z',
            },
          ],
        } as BillingAccountStatement['payments'][number],
      ],
    });
    const line = await addLine(1);
    await userEvent.type(within(line).getByLabelText('Número de certificado'), 'RF-1');
    await submitWithFullBalance();

    expect(mockRegisterPayment).not.toHaveBeenCalled();
    expect(within(line).getByLabelText('Documento (opcional)')).toHaveAccessibleDescription(
      /^Ese documento ya tiene una retención de este tipo/u,
    );
  });

  it('avisa, sin bloquear, si la tarifa supera la sugerida por Tributación', async () => {
    mockWithholdingOptions.mockResolvedValue(ELIGIBLE);
    mockRegisterPayment.mockResolvedValue({});
    renderWith(STATEMENT);
    const line = await addLine(1);
    const rate = within(line).getByLabelText('Tarifa (%)');
    expect(within(line).queryByText(/Supera la tarifa sugerida/u)).not.toBeInTheDocument();
    await userEvent.clear(rate);
    await userEvent.type(rate, '5');
    expect(rate).toHaveAccessibleDescription(
      /Supera la tarifa sugerida por Tributación \(4 %\)\. Tu permiso de cortesías te permite registrarla\./u,
    );
    await userEvent.type(within(line).getByLabelText('Número de certificado'), 'RF-1');
    await submitWithFullBalance();
    expect(mockRegisterPayment).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'BILLING_WITHHOLDING_RATE_ABOVE_CEILING',
      /La tarifa de una retención supera la sugerida por Tributación/u,
    ],
    ['BILLING_WITHHOLDING_DUPLICATE', /Un documento ya tiene una retención vigente/u],
    ['BILLING_WITHHOLDING_BASE_EXCEEDS_SUBTOTAL', /La base de una retención supera el subtotal/u],
    // Fuera del contrato compartido: mapeo tolerante por el texto del código.
    ['BILLING_WITHHOLDING_RATE_TOO_HIGH', /La tarifa de una retención supera la sugerida/u],
    ['BILLING_WITHHOLDING_SOMETHING_NEW', /No pudimos registrar las retenciones de este pago/u],
  ])('traduce el 422 %s', async (code, message) => {
    mockWithholdingOptions.mockResolvedValue(ELIGIBLE);
    mockRegisterPayment.mockRejectedValue(new ApiError(422, code, 'detalle técnico'));
    renderWith(STATEMENT);
    const line = await addLine(1);
    await userEvent.type(within(line).getByLabelText('Número de certificado'), 'RF-1');
    await submitWithFullBalance();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText('detalle técnico')).not.toBeInTheDocument();
  });
});
