/**
 * Facturación dividida en Facturas, Pagos y Estado de cuenta (spec MOD05↔MOD14 2026-11-13 D2, R1):
 * subpestañas por URL (`?tab=facturacion&sub=…`), accesibles con teclado y con estado conservado.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessPermissionKey, type BillingAccountStatement } from '@iwana/shared';
import { SubscriberBillingTab, billingSubtab } from './SubscriberBillingTab';
import type { SubscriberStatementLoad } from './use-subscriber-statement';

const mockSearch = { current: '' };
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearch.current),
  usePathname: () => '/dashboard/crm/subscribers/1',
  useRouter: (() => {
    const router = { replace: (...args: unknown[]) => mockReplace(...args), push: jest.fn() };
    return () => router;
  })(),
}));

const mockGranted = { current: new Set<AccessPermissionKey>() };
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    const ctx = { hasPermission: (key: AccessPermissionKey) => mockGranted.current.has(key) };
    return () => ctx;
  })(),
}));

const mockDocuments = jest.fn();
const mockLedger = jest.fn();
const mockEmailLog = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    billingApi: {
      documents: (...args: unknown[]) => mockDocuments(...args),
      statementLedger: (...args: unknown[]) => mockLedger(...args),
      emailLog: (...args: unknown[]) => mockEmailLog(...args),
    },
  };
});

const SUBSCRIBER_ID = '55555555-5555-4555-8555-555555555555';
const PAYMENT_ID = '66666666-6666-4666-8666-666666666666';

const STATEMENT: BillingAccountStatement = {
  subscriberId: SUBSCRIBER_ID,
  buyerProtected: false,
  impersonationHold: false,
  totalInvoiced: '119.00',
  totalPaid: '95.00',
  totalPending: '24.00',
  creditBalance: '0.00',
  documents: [],
  payments: [
    {
      id: PAYMENT_ID,
      tenantId: '22222222-2222-4222-8222-222222222222',
      subscriberId: SUBSCRIBER_ID,
      method: 'EFECTIVO',
      amount: '95.00',
      paidAt: '2026-11-06',
      reference: null,
      idempotencyKey: 'k-1',
      status: 'REGISTRADO',
      createdBy: '77777777-7777-4777-8777-777777777777',
      createdAt: '2026-11-06T12:00:00.000Z',
      allocatedAmount: '95.00',
      unallocatedAmount: '0.00',
      receiptNumber: 12,
      imported: false,
      externalId: null,
    },
  ],
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

function loaded(statement: BillingAccountStatement): SubscriberStatementLoad {
  return { data: statement, error: null, loading: false, reload: jest.fn() };
}

function renderTab(search: string) {
  mockSearch.current = search;
  window.history.replaceState({}, '', `/dashboard/crm/subscribers/1?${search}`);
  return render(
    <SubscriberBillingTab
      subscriberId={SUBSCRIBER_ID}
      contracts={[]}
      statement={loaded(STATEMENT)}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReplace.mockReset();
  mockGranted.current = new Set([
    AccessPermissionKey.BILLING_INVOICES_READ,
    AccessPermissionKey.BILLING_PAYMENTS_READ,
    AccessPermissionKey.BILLING_PAYMENTS_REGISTER,
  ]);
  mockDocuments.mockResolvedValue(EMPTY_PAGE);
  mockLedger.mockResolvedValue({
    subscriberId: SUBSCRIBER_ID,
    from: null,
    to: '2026-11-13',
    openingBalance: '0.00',
    closingBalance: '24.00',
    buyerProtected: false,
    rows: [],
  });
  mockEmailLog.mockResolvedValue({ subscriberId: SUBSCRIBER_ID, entries: [] });
});

function tabs() {
  const list = screen.getByRole('tablist', { name: 'Secciones de facturación' });
  return within(list).getAllByRole('tab');
}

describe('billingSubtab', () => {
  it.each([
    [null, 'facturas'],
    ['', 'facturas'],
    ['facturas', 'facturas'],
    ['pagos', 'pagos'],
    ['estado', 'estado'],
    ['otra-cosa', 'facturas'],
  ])('%p → %p', (value, expected) => {
    expect(billingSubtab(value)).toBe(expected);
  });
});

/** Router que sí actualiza la URL, como el real: lo leen `useSearchParams` y `window.location`. */
function followUrl() {
  mockReplace.mockImplementation((href: string) => {
    mockSearch.current = new URL(href, 'http://portal.test').search.slice(1);
    window.history.replaceState({}, '', href);
  });
}

describe('SubscriberBillingTab — filtro del estado de cuenta en la URL (R1)', () => {
  it('sobrevive a ir a Pagos y volver', async () => {
    const user = userEvent.setup();
    followUrl();
    const { rerender } = renderTab('tab=facturacion&sub=estado');
    await screen.findByText('Saldo final:', { exact: false });
    await user.click(screen.getByRole('button', { name: '6 meses' }));
    await waitFor(() =>
      expect(mockLedger).toHaveBeenLastCalledWith(SUBSCRIBER_ID, {
        from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
      }),
    );
    await user.click(screen.getByRole('tab', { name: 'Pagos' }));
    expect(screen.queryByRole('button', { name: '6 meses' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Estado de cuenta' }));
    rerender(
      <SubscriberBillingTab
        subscriberId={SUBSCRIBER_ID}
        contracts={[]}
        statement={loaded(STATEMENT)}
      />,
    );
    expect(await screen.findByRole('button', { name: '6 meses' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const params = new URLSearchParams(mockSearch.current);
    expect(params.get('tab')).toBe('facturacion');
    expect(params.get('sub')).toBe('estado');
    expect(params.get('periodo')).toBe('6m');
    await screen.findByText('Saldo final:', { exact: false });
  });

  it('al montar con la URL ya puesta (recarga) abre el filtro guardado', async () => {
    renderTab('tab=facturacion&sub=estado&periodo=rango&desde=2026-01-01&hasta=2026-06-30');
    await waitFor(() =>
      expect(mockLedger).toHaveBeenCalledWith(SUBSCRIBER_ID, {
        from: '2026-01-01',
        to: '2026-06-30',
      }),
    );
    expect(screen.getByRole('button', { name: 'Rango de fechas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-06-30');
    await screen.findByText('Saldo final:', { exact: false });
  });
});

describe('SubscriberBillingTab — subpestañas', () => {
  it('abre Facturas por defecto y conserva arriba las métricas y los botones', async () => {
    renderTab('tab=facturacion');
    expect(tabs().map((tab) => tab.textContent)).toEqual(['Facturas', 'Pagos', 'Estado de cuenta']);
    const [facturas, pagos, estado] = tabs();
    expect(facturas).toHaveAttribute('aria-selected', 'true');
    expect(pagos).toHaveAttribute('aria-selected', 'false');
    expect(estado).toHaveAttribute('aria-selected', 'false');
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', facturas!.id);
    expect(facturas).toHaveAttribute('aria-controls', panel.id);
    expect(within(panel).getByText('Documentos de cobro')).toBeInTheDocument();
    expect(screen.getByText('Total facturado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar saldo a favor' })).toBeInTheDocument();
    await waitFor(() => expect(mockDocuments).toHaveBeenCalled());
  });

  it('un valor desconocido de sub abre Facturas', async () => {
    renderTab('tab=facturacion&sub=desconocida');
    expect(tabs()[0]).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Aún no hay documentos de cobro')).toBeInTheDocument();
  });

  it('sub=pagos abre Pagos con la columna Recibo y el número del recibo', () => {
    renderTab('tab=facturacion&sub=pagos');
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('columnheader', { name: 'Recibo' })).toBeInTheDocument();
    expect(within(panel).getByText('N.º 12')).toBeInTheDocument();
    expect(mockDocuments).not.toHaveBeenCalled();
  });

  it('al elegir una subpestaña escribe sub en la URL y conserva tab y los demás parámetros', async () => {
    const user = userEvent.setup();
    renderTab('tab=facturacion&documentPage=2');
    await user.click(screen.getByRole('tab', { name: 'Pagos' }));
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true');
    const [href, options] = mockReplace.mock.calls.at(-1) ?? [];
    const url = new URL(String(href), 'http://portal.test');
    expect(url.pathname).toBe('/dashboard/crm/subscribers/1');
    expect(url.searchParams.get('tab')).toBe('facturacion');
    expect(url.searchParams.get('sub')).toBe('pagos');
    expect(url.searchParams.get('documentPage')).toBe('2');
    expect(options).toEqual({ scroll: false });
  });

  it('solo la pestaña activa entra en el orden de tabulación', async () => {
    renderTab('tab=facturacion&sub=estado');
    expect(await screen.findByText('Saldo final:', { exact: false })).toBeInTheDocument();
    const [facturas, pagos, estado] = tabs();
    expect(estado).toHaveAttribute('tabindex', '0');
    expect(facturas).toHaveAttribute('tabindex', '-1');
    expect(pagos).toHaveAttribute('tabindex', '-1');
  });

  it('flechas, Inicio y Fin mueven el foco y activan la pestaña', async () => {
    const user = userEvent.setup();
    renderTab('tab=facturacion');
    const [facturas, pagos, estado] = tabs();
    facturas!.focus();
    await user.keyboard('{ArrowRight}');
    expect(pagos).toHaveFocus();
    expect(pagos).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{End}');
    expect(estado).toHaveFocus();
    expect(estado).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Saldo final:', { exact: false })).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(facturas).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(estado).toHaveFocus();
    await user.keyboard('{Home}');
    expect(facturas).toHaveFocus();
    expect(facturas).toHaveAttribute('aria-selected', 'true');
    expect(
      new URL(String(mockReplace.mock.calls.at(-1)?.[0]), 'http://x').searchParams.get('sub'),
    ).toBe('facturas');
  });
});
