/** Filtros de la página de Pagos del módulo (usuario 2026-11-14): en la URL, como en Facturas. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { billingApi } from '@/lib/api-client';
import { BillingPaymentsClient } from './BillingPaymentsClient';

const mockReplace = jest.fn();
let searchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  usePathname: () => '/dashboard/billing/payments',
  useRouter: (() => {
    let router: Record<string, unknown> | undefined;
    return () => (router ??= { replace: mockReplace, push: jest.fn() });
  })(),
}));

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, billingApi: { payments: jest.fn() } };
});

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () => (ctx ??= { hasPermission: () => true });
  })(),
}));

const mockedPayments = billingApi.payments as jest.Mock;
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

beforeEach(() => {
  jest.clearAllMocks();
  searchParams = new URLSearchParams();
  window.history.pushState({}, '', '/dashboard/billing/payments');
  mockedPayments.mockResolvedValue(EMPTY_PAGE);
});

describe('BillingPaymentsClient — filtros', () => {
  it('envía a la API los filtros que trae la URL', async () => {
    searchParams = new URLSearchParams(
      'method=EFECTIVO&status=REGISTRADO&from=2026-11-01&to=2026-11-30',
    );
    render(<BillingPaymentsClient />);
    await waitFor(() =>
      expect(mockedPayments).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        method: 'EFECTIVO',
        status: 'REGISTRADO',
        from: '2026-11-01',
        to: '2026-11-30',
      }),
    );
    expect(await screen.findByText('No encontramos pagos con estos filtros')).toBeInTheDocument();
  });

  it('guarda el método en la URL y solo ofrece limpiar con filtros activos', async () => {
    render(<BillingPaymentsClient />);
    expect(await screen.findByText('Aún no hay pagos registrados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Método'), { target: { value: 'TRANSFERENCIA' } });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(String(mockReplace.mock.calls.at(-1)?.[0] ?? '')).toContain('method=TRANSFERENCIA');
  });

  it('ignora valores de la URL que no son válidos', async () => {
    searchParams = new URLSearchParams('method=CRIPTO&from=ayer');
    render(<BillingPaymentsClient />);
    await waitFor(() => expect(mockedPayments).toHaveBeenCalledWith({ page: 1, limit: 20 }));
  });
});
