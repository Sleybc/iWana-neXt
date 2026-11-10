import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BillingAccountStatement } from '@iwana/shared';
import { SubscriberBillingTab } from './SubscriberBillingTab';
import { SubscriberStatementSummary } from './SubscriberStatementSummary';
import { useSubscriberStatement } from './use-subscriber-statement';

const mockStatement = jest.fn();
const mockDocuments = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
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

const EMPTY_PAGE = {
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
};

function Harness({ enabled }: { enabled: boolean }) {
  const statement = useSubscriberStatement(STATEMENT.subscriberId, enabled);
  return (
    <>
      <SubscriberStatementSummary statement={statement} onOpenBilling={() => undefined} />
      <SubscriberBillingTab
        subscriberId={STATEMENT.subscriberId}
        contracts={[]}
        statement={statement}
      />
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDocuments.mockResolvedValue(EMPTY_PAGE);
});

describe('carga compartida del estado de cuenta (CA-2, CA-8)', () => {
  it('una sola petición alimenta el resumen y la pestaña', async () => {
    mockStatement.mockResolvedValue(STATEMENT);
    render(<Harness enabled />);
    await waitFor(() => expect(screen.getByText('Saldo a favor disponible')).toBeInTheDocument());
    const summary = screen.getByRole('region', { name: 'Estado de cuenta' });
    expect(within(summary).getByText('Saldo a favor')).toBeInTheDocument();
    expect(mockStatement).toHaveBeenCalledTimes(1);
  });

  it('un reintento desde el resumen actualiza también la pestaña', async () => {
    const user = userEvent.setup();
    mockStatement.mockRejectedValueOnce(new Error('caída')).mockResolvedValueOnce(STATEMENT);
    render(<Harness enabled />);
    const summary = screen.getByRole('region', { name: 'Estado de cuenta' });
    await user.click(await within(summary).findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByText('Saldo a favor disponible')).toBeInTheDocument());
    expect(within(summary).getByText('Saldo a favor')).toBeInTheDocument();
    expect(mockStatement).toHaveBeenCalledTimes(2);
  });

  it('deshabilitado, no llama al estado de cuenta', async () => {
    render(<Harness enabled={false} />);
    // El hook resuelve sin llamar al servicio; se espera a que termine esa carga vacía.
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(mockStatement).not.toHaveBeenCalled();
  });
});
