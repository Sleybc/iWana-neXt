import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdditionalProductsPanel } from './AdditionalProductsPanel';

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
    mockGetAdditionalProducts.mockResolvedValue([sampleProduct]);
    mockCreateAdditionalProduct.mockResolvedValue([]);
    mockUpdateAdditionalProduct.mockResolvedValue([]);
    mockDeleteAdditionalProduct.mockResolvedValue([]);
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
    mockGetAdditionalProducts
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce([sampleProduct]);

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
});
