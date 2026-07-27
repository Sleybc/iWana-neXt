import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { purchasingApi, type SupplierProfileRecord } from '@/lib/api-client';
import { SuppliersPanel } from './SuppliersPanel';

const pushMock = jest.fn();
const replaceMock = jest.fn();
let searchParamsMock = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => '/dashboard/inventory',
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    purchasingApi: {
      ...actual.purchasingApi,
      listSuppliers: jest.fn(),
    },
  };
});

const listSuppliersMock = purchasingApi.listSuppliers as jest.Mock;

function buildSupplier(overrides: Partial<SupplierProfileRecord> = {}): SupplierProfileRecord {
  return {
    partyRefId: 'party-001',
    supplierCode: 'PROV-001',
    status: 'ACTIVE',
    purchasingContactName: null,
    purchasingContactEmail: null,
    party: {
      displayName: 'Fibra Andina',
    },
    ...overrides,
  } as SupplierProfileRecord;
}

describe('SuppliersPanel ADR-065', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamsMock = new URLSearchParams();
    pushMock.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    replaceMock.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('lista proveedores con page y sin Cargar más', async () => {
    listSuppliersMock.mockResolvedValue({
      data: [buildSupplier()],
      total: 1,
      page: 1,
      limit: 20,
      meta: {
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasMore: false,
        mode: 'page',
        nextCursor: null,
        capabilities: { randomAccess: true, sortableFields: [] },
      },
    });

    render(<SuppliersPanel onCreate={jest.fn()} onRowClick={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Fibra Andina')).toBeInTheDocument();
    });
    expect(listSuppliersMock).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('ADR-065: reemplaza página (conjuntos disjuntos)', async () => {
    const user = userEvent.setup();
    const page1 = Array.from({ length: 20 }, (_, i) =>
      buildSupplier({
        partyRefId: `party-p1-${i}`,
        supplierCode: `PROV-P1-${i}`,
        party: { displayName: `Proveedor P1 ${i}` } as never,
      }),
    );
    const page2 = Array.from({ length: 20 }, (_, i) =>
      buildSupplier({
        partyRefId: `party-p2-${i}`,
        supplierCode: `PROV-P2-${i}`,
        party: { displayName: `Proveedor P2 ${i}` } as never,
      }),
    );

    listSuppliersMock.mockImplementation(async (params?: { page?: number }) => {
      const page = params?.page ?? 1;
      return {
        data: page === 1 ? page1 : page2,
        total: 40,
        page,
        limit: 20,
        meta: {
          total: 40,
          page,
          limit: 20,
          totalPages: 2,
          hasMore: page < 2,
          mode: 'page',
          nextCursor: null,
          capabilities: { randomAccess: true, sortableFields: [] },
        },
      };
    });

    const { rerender } = render(<SuppliersPanel onCreate={jest.fn()} onRowClick={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Proveedor P1 0')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    rerender(<SuppliersPanel onCreate={jest.fn()} onRowClick={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Proveedor P2 0')).toBeInTheDocument();
    });
    expect(screen.queryByText('Proveedor P1 0')).not.toBeInTheDocument();
    expect(listSuppliersMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 20 }));
  });
});
