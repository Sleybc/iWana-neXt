import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { BillingDocumentResponse } from '@iwana/shared';
import { billingApi } from '@/lib/api-client';
import { BillingDocumentList } from './BillingDocumentsClient';
import { BillingDocumentTable } from './BillingDocumentTable';

const mockReplace = jest.fn();
const mockPush = jest.fn();
let searchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  usePathname: () => '/dashboard/billing/documents',
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    billingApi: { documents: jest.fn() },
    billingCyclesApi: { list: jest.fn().mockResolvedValue([]) },
    contractsApi: { listBySubscriber: jest.fn() },
  };
});

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

const mockedDocuments = billingApi.documents as jest.Mock;

function buildDocument(id: string, number: string | null): BillingDocumentResponse {
  return {
    id,
    tenantId: '22222222-2222-4222-8222-222222222222',
    periodId: '33333333-3333-4333-8333-333333333333',
    contractId: '44444444-4444-4444-8444-444444444444',
    subscriberId: '55555555-5555-4555-8555-555555555555',
    status: 'BORRADOR',
    number,
    issueDate: null,
    dueDate: '2026-11-19',
    periodStart: '2026-10-05',
    periodEnd: '2026-11-04',
    coveredStart: '2026-10-05',
    paymentState: null,
    buyerProtected: false,
    subtotal: '100.00',
    taxTotal: '19.00',
    total: '119.00',
    unbilledAdditionalCount: 0,
    blockingReason: null,
    buyerSnapshot: { displayName: 'Titular Sintético', rutResponsibilities: [] },
    createdAt: '2026-11-05T12:00:00.000Z',
    updatedAt: '2026-11-05T12:00:00.000Z',
    lines: [],
    paidAmount: '0.00',
    pendingAmount: '119.00',
  };
}

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
  window.history.pushState({}, '', '/dashboard/billing/documents');
});

describe('BillingDocumentList — filtros en URL y estados vacíos (CA-UX-FAC-04, 17)', () => {
  it('conserva el filtro de estado de pago en la URL', async () => {
    mockedDocuments.mockResolvedValue(EMPTY_PAGE);
    render(<BillingDocumentList />);
    const select = await screen.findByLabelText('Estado de pago');
    fireEvent.change(select, { target: { value: 'PAGADO' } });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    const href = String(mockReplace.mock.calls.at(-1)?.[0] ?? '');
    expect(href).toContain('paymentState=PAGADO');
  });

  it('muestra primera visita con acción de generar cuando no hay filtros', async () => {
    mockedDocuments.mockResolvedValue(EMPTY_PAGE);
    render(<BillingDocumentList />);
    expect(await screen.findByText('Aún no hay documentos de cobro')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Generar documentos' }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('muestra sin resultados con limpiar filtros y restaura la URL', async () => {
    searchParams = new URLSearchParams('status=BORRADOR');
    window.history.pushState({}, '', '/dashboard/billing/documents?status=BORRADOR');
    mockedDocuments.mockResolvedValue(EMPTY_PAGE);
    render(<BillingDocumentList />);
    expect(
      await screen.findByText('No encontramos documentos con estos filtros'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0]!);
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    const href = String(mockReplace.mock.calls.at(-1)?.[0] ?? '');
    expect(href).toBe('/dashboard/billing/documents');
  });
});

describe('BillingDocumentList — diálogo de emisión en lote (spec UX §3)', () => {
  function pageWith(documents: BillingDocumentResponse[]) {
    return {
      data: documents,
      meta: { ...EMPTY_PAGE.meta, total: documents.length },
    };
  }

  it('indica cuántos borradores válidos se emitirán y cuántos deben corregirse', async () => {
    const validA = buildDocument('11111111-1111-4111-8111-111111111111', 'DC-000001');
    const validB = buildDocument('22222222-2222-4222-8222-222222222222', 'DC-000002');
    const blocked = {
      ...buildDocument('33333333-3333-4333-8333-333333333333', 'DC-000003'),
      blockingReason: 'SIN_PRECIO' as const,
    };
    mockedDocuments.mockResolvedValue(pageWith([validA, validB, blocked]));
    render(<BillingDocumentList />);
    fireEvent.click(await screen.findByLabelText('Seleccionar documento DC-000001'));
    fireEvent.click(await screen.findByLabelText('Seleccionar documento DC-000002'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Emitir 2 documentos seleccionados' }),
    );
    expect(await screen.findByText(/Se emitirán 2 borradores válidos/)).toBeInTheDocument();
    expect(
      screen.getByText(/1 borradores tienen datos incompletos y deben corregirse/),
    ).toBeInTheDocument();
  });

  it('omite la segunda frase cuando no hay borradores bloqueados', async () => {
    mockedDocuments.mockResolvedValue(
      pageWith([
        buildDocument('11111111-1111-4111-8111-111111111111', 'DC-000001'),
        buildDocument('22222222-2222-4222-8222-222222222222', 'DC-000002'),
      ]),
    );
    render(<BillingDocumentList />);
    fireEvent.click(await screen.findByLabelText('Seleccionar documento DC-000001'));
    fireEvent.click(await screen.findByLabelText('Seleccionar documento DC-000002'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Emitir 2 documentos seleccionados' }),
    );
    expect(await screen.findByText(/Se emitirán 2 borradores válidos/)).toBeInTheDocument();
    expect(screen.queryByText(/datos incompletos/)).not.toBeInTheDocument();
  });
});

describe('BillingDocumentTable — tope de selección en lote (CA-UX-FAC-06)', () => {
  it('deshabilita la casilla 101 cuando ya hay 100 seleccionados', () => {
    const documents = Array.from({ length: 101 }, (_, index) =>
      buildDocument(
        `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
        `DC-${String(index + 1).padStart(6, '0')}`,
      ),
    );
    const selected = new Set(documents.slice(0, 100).map((document) => document.id));
    render(
      <BillingDocumentTable
        documents={documents}
        onChanged={() => undefined}
        selection={selected}
        onSelectionChange={() => undefined}
      />,
    );
    const extra = screen.getByLabelText('Seleccionar documento DC-000101');
    expect(extra).toBeDisabled();
    expect(
      within(screen.getByRole('table')).getAllByRole('checkbox', { checked: true }),
    ).toHaveLength(100);
  });
});
