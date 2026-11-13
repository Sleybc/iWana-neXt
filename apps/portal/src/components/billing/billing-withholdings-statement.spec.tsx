import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  BillingAccountStatement,
  BillingDocumentResponse,
  BillingPaymentResponse,
} from '@iwana/shared';
import { BillingPaymentTable } from './BillingPaymentsClient';
import { SubscriberBillingTab } from './SubscriberBillingTab';
import { SubscriberStatementSummary } from './SubscriberStatementSummary';
import { formatBillingMoney } from './billing-copy';
import type { SubscriberStatementLoad } from './use-subscriber-statement';

const mockDocuments = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    billingApi: {
      statement: jest.fn(),
      documents: (...args: unknown[]) => mockDocuments(...args),
      document: jest.fn(),
      documentPdf: jest.fn(),
      issue: jest.fn(),
      voidDocument: jest.fn(),
      voidPayment: jest.fn(),
    },
  };
});

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    const ctx = { hasPermission: () => true };
    return () => ctx;
  })(),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard/crm/subscribers/1',
  useRouter: (() => {
    let router: Record<string, unknown> | undefined;
    return () => (router ??= { replace: jest.fn(), push: jest.fn() });
  })(),
}));

const SUBSCRIBER_ID = '55555555-5555-4555-8555-555555555555';
const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const PAYMENT_ID = '66666666-6666-4666-8666-666666666666';
const USER_ID = '77777777-7777-4777-8777-777777777777';
const money = (value: string) => formatBillingMoney(value).replace(/\s/gu, ' ');

const DOCUMENT: BillingDocumentResponse = {
  id: DOCUMENT_ID,
  tenantId: '22222222-2222-4222-8222-222222222222',
  periodId: '33333333-3333-4333-8333-333333333333',
  contractId: '44444444-4444-4444-8444-444444444444',
  subscriberId: SUBSCRIBER_ID,
  status: 'EMITIDO',
  number: 'DC-000401',
  dueDate: '2026-11-25',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  coveredStart: '2026-11-01',
  paymentState: 'PARCIAL',
  buyerProtected: false,
  subtotal: '1200000.00',
  taxTotal: '0.00',
  total: '1200000.00',
  unbilledAdditionalCount: 0,
  createdAt: '2026-11-11T12:00:00.000Z',
  updatedAt: '2026-11-11T12:00:00.000Z',
  pendingAmount: '200000.00',
  withholdingAmount: '49660.00',
};

function payment(overrides: Partial<BillingPaymentResponse> = {}): BillingPaymentResponse {
  return {
    id: PAYMENT_ID,
    tenantId: '22222222-2222-4222-8222-222222222222',
    subscriberId: SUBSCRIBER_ID,
    method: 'TRANSFERENCIA',
    amount: '950340.00',
    paidAt: '2026-11-13',
    reference: null,
    note: null,
    idempotencyKey: '88888888-8888-4888-8888-888888888888',
    status: 'REGISTRADO',
    voidReasonCode: null,
    voidNote: null,
    voidedBy: null,
    createdBy: USER_ID,
    createdAt: '2026-11-13T15:00:00.000Z',
    allocatedAmount: '1000000.00',
    unallocatedAmount: '0.00',
    allocations: [],
    withholdingAmount: '49660.00',
    withholdings: [
      {
        id: '99999999-9999-4999-8999-999999999991',
        paymentId: PAYMENT_ID,
        documentId: DOCUMENT_ID,
        taxCode: 'RETE_FUENTE_SERVICIOS',
        base: '1000000.00',
        rate: '4.0000',
        amount: '40000.00',
        certificateNumber: 'RF-2026-17',
        voidedAt: null,
        createdBy: USER_ID,
        createdAt: '2026-11-13T15:00:00.000Z',
      },
      {
        id: '99999999-9999-4999-8999-999999999992',
        paymentId: PAYMENT_ID,
        documentId: DOCUMENT_ID,
        taxCode: 'RETE_ICA',
        base: '1000000.00',
        rate: '0.9660',
        amount: '9660.00',
        certificateNumber: null,
        voidedAt: null,
        createdBy: USER_ID,
        createdAt: '2026-11-13T15:00:01.000Z',
      },
    ],
    ...overrides,
  } as BillingPaymentResponse;
}

const STATEMENT: BillingAccountStatement = {
  subscriberId: SUBSCRIBER_ID,
  buyerProtected: false,
  impersonationHold: false,
  totalInvoiced: '1200000.00',
  totalPaid: '1000000.00',
  totalPending: '200000.00',
  totalWithholding: '49660.00',
  creditBalance: '0.00',
  documents: [DOCUMENT],
  payments: [payment()],
  contractSummaries: [],
};

function loaded(data: BillingAccountStatement): SubscriberStatementLoad {
  return { data, loading: false, error: null, reload: jest.fn() };
}

beforeEach(() => {
  mockDocuments.mockResolvedValue({
    data: [],
    meta: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasMore: false,
      mode: 'page',
      nextCursor: null,
      totalIsEstimate: false,
      capabilities: { randomAccess: true, sortableFields: [] },
      sort: null,
    },
  });
});

describe('Retenciones en el estado de cuenta (spec MOD14 2026-11-13 R8)', () => {
  it('el resumen de la ficha muestra el total, el detalle y la retención del documento', () => {
    render(<SubscriberStatementSummary statement={loaded(STATEMENT)} onOpenBilling={jest.fn()} />);
    expect(screen.getByText(/Retenciones del cliente:/u)).toHaveTextContent(
      `Retenciones del cliente: ${money('49660')}. Ya están incluidas en lo pagado.`,
    );
    const detail = screen.getByRole('region', { name: 'Detalle de retenciones' });
    const items = within(detail).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('Retención de ICA')).toBeInTheDocument();
    expect(within(items[0]!).getByText(/Certificado no disponible/u)).toBeInTheDocument();
    expect(within(items[1]!).getByText('Retención en la fuente por servicios')).toBeInTheDocument();
    expect(
      within(items[1]!).getByText(/Base .* × 4 % · Certificado RF-2026-17/u),
    ).toBeInTheDocument();
    expect(within(items[1]!).getByText(/DC-000401/u)).toBeInTheDocument();
    expect(screen.getByText(`Retenciones ${money('49660')}`)).toBeInTheDocument();
  });

  it('muestra «Certificado protegido» si el número viene nulo por datos bloqueados', () => {
    render(
      <SubscriberStatementSummary
        statement={loaded({ ...STATEMENT, buyerProtected: true })}
        onOpenBilling={jest.fn()}
      />,
    );
    const detail = screen.getByRole('region', { name: 'Detalle de retenciones' });
    const items = within(detail).getAllByRole('listitem');
    expect(within(items[0]!).getByText(/Certificado protegido/u)).toBeInTheDocument();
    expect(within(detail).queryByText(/Certificado no disponible/u)).not.toBeInTheDocument();
  });

  it('sin retenciones no muestra nada nuevo', () => {
    render(
      <SubscriberStatementSummary
        statement={loaded({
          ...STATEMENT,
          totalWithholding: '0.00',
          payments: [],
          documents: [{ ...DOCUMENT, withholdingAmount: '0.00' }],
        })}
        onOpenBilling={jest.fn()}
      />,
    );
    expect(screen.queryByText(/Retenciones/u)).not.toBeInTheDocument();
  });

  it('la pestaña de facturación muestra la tarjeta de retenciones y su detalle', async () => {
    render(
      <SubscriberBillingTab
        subscriberId={SUBSCRIBER_ID}
        contracts={[]}
        statement={loaded(STATEMENT)}
      />,
    );
    const card = screen.getByText('Retenciones', { selector: 'p, h3, span, div' });
    expect(card).toBeInTheDocument();
    expect(screen.getAllByText('Ya están incluidas en lo pagado.').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Detalle de retenciones' })).toBeInTheDocument();
    expect(await screen.findByRole('columnheader', { name: 'Retenciones' })).toBeInTheDocument();
  });

  it('la tabla de pagos muestra la retención por pago y avisa que se anulan con el pago', async () => {
    render(<BillingPaymentTable payments={[payment()]} onChanged={jest.fn()} />);
    expect(screen.getByRole('columnheader', { name: 'Retenciones' })).toBeInTheDocument();
    expect(screen.getByText(money('49660'))).toBeInTheDocument();
    expect(
      screen.getByText('Retención en la fuente por servicios · Retención de ICA'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Anular pago' }));
    expect(await screen.findByText(/Sus retenciones también se anularán\./u)).toBeInTheDocument();
  });

  it('sin retenciones la tabla de pagos no agrega la columna', () => {
    render(
      <BillingPaymentTable
        payments={[payment({ withholdingAmount: '0.00', withholdings: [] })]}
        onChanged={jest.fn()}
      />,
    );
    expect(screen.queryByRole('columnheader', { name: 'Retenciones' })).not.toBeInTheDocument();
  });

  it('un pago anulado muestra sus retenciones como anuladas', () => {
    render(
      <BillingPaymentTable
        payments={[
          payment({
            status: 'ANULADO',
            withholdingAmount: '0.00',
            withholdings: payment().withholdings!.map((line) => ({
              ...line,
              voidedAt: '2026-11-14T10:00:00.000Z',
            })),
          }),
        ]}
        onChanged={jest.fn()}
      />,
    );
    expect(screen.getByText('Anuladas')).toBeInTheDocument();
  });
});
