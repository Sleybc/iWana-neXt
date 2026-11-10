import { render, screen, waitFor } from '@testing-library/react';
import type { BillingAccountStatement } from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import { SubscriberBillingTab } from './SubscriberBillingTab';
import { PROTECTED_LABEL, PROTECTED_NOTICE, additionalNotice } from './billing-copy';
import { useSubscriberStatement } from './use-subscriber-statement';

function TabWithStatement({ subscriberId }: { subscriberId: string }) {
  const statement = useSubscriberStatement(subscriberId, true);
  return <SubscriberBillingTab subscriberId={subscriberId} contracts={[]} statement={statement} />;
}

const mockStatement = jest.fn();
const mockDocuments = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    ApiError: actual.ApiError,
    billingApi: {
      statement: (...args: unknown[]) => mockStatement(...args),
      documents: (...args: unknown[]) => mockDocuments(...args),
      document: jest.fn(),
      documentPdf: jest.fn(),
      issue: jest.fn(),
      voidDocument: jest.fn(),
    },
  };
});

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () => (ctx ??= { hasPermission: () => false });
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

const STATEMENT: BillingAccountStatement = {
  subscriberId: '55555555-5555-4555-8555-555555555555',
  buyerProtected: false,
  impersonationHold: false,
  totalInvoiced: '119.00',
  totalPaid: '95.00',
  totalPending: '24.00',
  creditBalance: '25.00',
  documents: [],
  payments: [],
  contractSummaries: [],
};

function renderTab(statement: BillingAccountStatement) {
  mockStatement.mockResolvedValue(statement);
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
  return render(<TabWithStatement subscriberId={statement.subscriberId} />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SubscriberBillingTab (CA-UX-FAC-12, 13; RS-21, RS-22)', () => {
  it('presenta las tarjetas de total facturado, pagado, deuda y saldo a favor', async () => {
    renderTab(STATEMENT);
    await waitFor(() => expect(screen.getByText('Total facturado')).toBeInTheDocument());
    expect(screen.getByText('Total pagado')).toBeInTheDocument();
    expect(screen.getByText('Deuda pendiente actual')).toBeInTheDocument();
    expect(screen.getByText('Saldo a favor disponible')).toBeInTheDocument();
  });

  it('alerta la suspensión por suplantación sin generar cobros', async () => {
    renderTab({ ...STATEMENT, impersonationHold: true });
    await waitFor(() =>
      expect(
        screen.getByText(
          'Cobro suspendido preventivamente por investigación de suplantación de identidad (Ley 2573 de 2022).',
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('No se generarán nuevos cobros hasta resolución.')).toBeInTheDocument();
  });

  it('muestra el estado redactado del titular bloqueado con el aviso institucional', async () => {
    renderTab({ ...STATEMENT, buyerProtected: true });
    await waitFor(() => expect(screen.getAllByText(PROTECTED_LABEL).length).toBeGreaterThan(0));
    expect(screen.getByText(PROTECTED_NOTICE)).toBeInTheDocument();
  });

  it('muestra el aviso de adicionales sin cobrar de la pestaña', async () => {
    renderTab({
      ...STATEMENT,
      documents: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          tenantId: '22222222-2222-4222-8222-222222222222',
          periodId: '33333333-3333-4333-8333-333333333333',
          contractId: '44444444-4444-4444-8444-444444444444',
          subscriberId: STATEMENT.subscriberId,
          status: 'EMITIDO',
          number: 'DC-000101',
          dueDate: '2026-11-19',
          periodStart: '2026-10-05',
          periodEnd: '2026-11-04',
          coveredStart: '2026-10-05',
          paymentState: 'PENDIENTE',
          buyerProtected: false,
          subtotal: '100.00',
          taxTotal: '19.00',
          total: '119.00',
          unbilledAdditionalCount: 2,
          createdAt: '2026-11-05T12:00:00.000Z',
          updatedAt: '2026-11-05T12:00:00.000Z',
        },
      ],
    });
    await waitFor(() => expect(screen.getByText(additionalNotice(2))).toBeInTheDocument());
  });

  it('explica el 503 de auditoría sin exponer el dato', async () => {
    mockStatement.mockRejectedValue(
      new ApiError(503, 'PRIVACY_AUDIT_UNAVAILABLE', 'No fue posible auditar.'),
    );
    render(<TabWithStatement subscriberId={STATEMENT.subscriberId} />);
    await waitFor(() =>
      expect(
        screen.getByText(
          'No fue posible auditar la consulta de datos protegidos. Por seguridad, la información permanece oculta.',
        ),
      ).toBeInTheDocument(),
    );
  });
});
