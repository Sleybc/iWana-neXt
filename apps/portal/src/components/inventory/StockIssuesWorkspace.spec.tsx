import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StockIssueStatus, StockIssueType, StockLocationType } from '@iwana/shared';
import { inventoryApi } from '@/lib/api-client';
import { StockIssuesWorkspace } from './StockIssuesWorkspace';

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
    inventoryApi: {
      ...actual.inventoryApi,
      listIssues: jest.fn(),
    },
  };
});

jest.mock('./StockIssueComposer', () => ({
  StockIssueComposer: () => <div>Composer salidas</div>,
}));

jest.mock('./StockIssueDetailDrawer', () => ({
  StockIssueDetailDrawer: () => null,
}));

const listIssuesMock = inventoryApi.listIssues as jest.Mock;

const emptyMeta = {
  nextCursor: null,
  total: 0,
  totalIsEstimate: false,
  page: 1,
  limit: 20,
  totalPages: 0,
  hasMore: false,
  mode: 'page' as const,
  capabilities: { randomAccess: true, sortableFields: [] as string[] },
  sort: null,
};

describe('StockIssuesWorkspace', () => {
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
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: true,
        media: '',
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
    listIssuesMock.mockResolvedValue({ data: [], meta: emptyMeta });
  });

  it('ADR-065: self-fetch page+limit, empty state y create mode', async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn().mockResolvedValue(undefined);

    render(
      <StockIssuesWorkspace
        locations={[
          {
            id: 'loc-1',
            tenantId: 'tenant-1',
            code: 'BOD-01',
            name: 'Bodega principal',
            type: StockLocationType.MAIN_WAREHOUSE,
            status: 'ACTIVE',
            responsibleRefId: null,
            maxCapacity: null,
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          } as never,
        ]}
        onCreate={onCreate}
        onUpdate={jest.fn().mockResolvedValue(undefined)}
        onCancel={jest.fn().mockResolvedValue(undefined)}
        onDispatch={jest.fn().mockResolvedValue(undefined)}
        onOpenDetail={jest.fn().mockResolvedValue({ id: 'issue-1', lines: [] } as never)}
        onRefresh={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(listIssuesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
    });

    expect(await screen.findByText('Sin salidas registradas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Crear salida' })[0]!);
    expect(await screen.findByText('Composer salidas')).toBeInTheDocument();
  });

  it('lista salidas de la página servidor', async () => {
    listIssuesMock.mockResolvedValue({
      data: [
        {
          id: 'issue-1',
          tenantId: 'tenant-1',
          type: StockIssueType.INTERNAL_CONSUMPTION,
          status: StockIssueStatus.REQUESTED,
          sourceLocationId: 'loc-1',
          destinationLocationId: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      meta: { ...emptyMeta, total: 1, totalPages: 1 },
    });

    render(
      <StockIssuesWorkspace
        onCreate={jest.fn()}
        onUpdate={jest.fn()}
        onCancel={jest.fn()}
        onDispatch={jest.fn()}
        onOpenDetail={jest.fn()}
        onRefresh={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('1–1 de 1 salida')).toBeInTheDocument();
    });
    expect(listIssuesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
  });
});
