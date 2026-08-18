import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdditionalProductsPanel } from './AdditionalProductsPanel';
import { EMPTY_LIST_META } from '@/lib/list-meta';

const mockGetAdditionalProducts = jest.fn();
const mockCreateAdditionalProduct = jest.fn();
const mockUpdateAdditionalProduct = jest.fn();
const mockDeleteAdditionalProduct = jest.fn();
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/dashboard/commercial',
  useSearchParams: () => new URLSearchParams('tab=products'),
}));

jest.mock('@/lib/api-client', () => ({
  commercialApi: {
    getAdditionalProducts: (...args: unknown[]) => mockGetAdditionalProducts(...args),
    createAdditionalProduct: (...args: unknown[]) => mockCreateAdditionalProduct(...args),
    updateAdditionalProduct: (...args: unknown[]) => mockUpdateAdditionalProduct(...args),
    deleteAdditionalProduct: (...args: unknown[]) => mockDeleteAdditionalProduct(...args),
  },
  COMMERCIAL_LIST_PAGE_SIZE: 20,
}));

const sampleProduct = {
  id: 'prod-1',
  name: 'Router WiFi 6',
  description: 'Equipo empresarial',
  category: 'NETWORKING',
  isLoan: false,
  requiresInventory: true,
  isActive: true,
  createdAt: '2026-05-01T10:00:00.000Z',
  updatedAt: '2026-05-02T11:00:00.000Z',
};

describe('AdditionalProductsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAdditionalProducts.mockResolvedValue({
      data: [sampleProduct],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    });
    mockCreateAdditionalProduct.mockResolvedValue(undefined);
    mockUpdateAdditionalProduct.mockResolvedValue(undefined);
    mockDeleteAdditionalProduct.mockResolvedValue(undefined);
  });

  it('muestra acciones accesibles para editar y eliminar productos', async () => {
    render(<AdditionalProductsPanel canEdit />);

    await waitFor(() => {
      expect(mockGetAdditionalProducts).toHaveBeenCalled();
    });

    expect(await screen.findByRole('button', { name: 'Agregar producto' })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Editar producto Router WiFi 6' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Eliminar producto Router WiFi 6' }),
    ).toBeInTheDocument();
  });

  it('mantiene el catálogo visible si falla la eliminación', async () => {
    const user = userEvent.setup();
    mockDeleteAdditionalProduct.mockRejectedValueOnce(new Error('fail'));

    render(<AdditionalProductsPanel canEdit />);

    expect(await screen.findByText('Router WiFi 6')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Eliminar producto Router WiFi 6' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('No fue posible eliminar')).toBeInTheDocument();
    expect(screen.getAllByText('Router WiFi 6').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.queryByText('No fue posible cargar productos adicionales'),
    ).not.toBeInTheDocument();
  });

  it('ofrece reintentar cuando falla la carga inicial', async () => {
    const user = userEvent.setup();
    mockGetAdditionalProducts.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      data: [sampleProduct],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    });

    render(<AdditionalProductsPanel canEdit />);

    expect(
      await screen.findByText('No fue posible cargar productos adicionales'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Router WiFi 6')).toBeInTheDocument();
  });

  it('filtra categoría con chips y no expone select de categoría en toolbar', async () => {
    render(<AdditionalProductsPanel canEdit />);

    expect(await screen.findByRole('button', { name: /Todas/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Red/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Categoría')).not.toBeInTheDocument();
  });

  it('envía category al servidor al filtrar por chip', async () => {
    const user = userEvent.setup();
    render(<AdditionalProductsPanel canEdit />);

    expect(await screen.findByText('Router WiFi 6')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Red/i }));

    await waitFor(() => {
      expect(
        mockGetAdditionalProducts.mock.calls.some((call) => call[0]?.category === 'NETWORKING'),
      ).toBe(true);
    });
  });

  it('ADR-064: envía sort al servidor y no reordena solo la página local', async () => {
    const user = userEvent.setup();
    render(<AdditionalProductsPanel canEdit />);

    await waitFor(() => {
      expect(mockGetAdditionalProducts).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'ACTIVE_NAME', limit: 20 }),
      );
    });

    await user.click(screen.getByRole('combobox', { name: 'Orden' }));
    await user.click(await screen.findByRole('option', { name: 'Recientes primero' }));

    await waitFor(() => {
      expect(
        mockGetAdditionalProducts.mock.calls.some(
          (call) => call[0]?.sort === 'RECENTLY_UPDATED' && call[0]?.cursor === undefined,
        ),
      ).toBe(true);
    });
  });

  it('reinicia el cursor en memoria al cambiar un filtro URL', async () => {
    const user = userEvent.setup();
    mockGetAdditionalProducts
      .mockResolvedValueOnce({
        data: [sampleProduct],
        meta: { ...EMPTY_LIST_META, nextCursor: 'cursor-products-2', total: 2 },
      })
      .mockResolvedValueOnce({
        data: [sampleProduct],
        meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
      });

    render(<AdditionalProductsPanel canEdit />);

    expect(await screen.findByRole('button', { name: 'Cargar más' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Red/i }));

    await waitFor(() => {
      expect(
        mockGetAdditionalProducts.mock.calls.some(
          (call) => call[0]?.category === 'NETWORKING' && call[0]?.cursor === undefined,
        ),
      ).toBe(true);
    });
    expect(mockReplace).toHaveBeenCalled();
  });
});
