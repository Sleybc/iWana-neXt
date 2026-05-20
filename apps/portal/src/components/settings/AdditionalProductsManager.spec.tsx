import { render, screen, waitFor } from '@testing-library/react';
import { AdditionalProductsManager } from './AdditionalProductsManager';

const mockGetAdditionalProducts = jest.fn();
const mockCreateAdditionalProduct = jest.fn();
const mockUpdateAdditionalProduct = jest.fn();
const mockDeleteAdditionalProduct = jest.fn();

jest.mock('@/lib/api-client', () => ({
  commercialApi: {
    getAdditionalProducts: (...args: unknown[]) => mockGetAdditionalProducts(...args),
    createAdditionalProduct: (...args: unknown[]) => mockCreateAdditionalProduct(...args),
    updateAdditionalProduct: (...args: unknown[]) => mockUpdateAdditionalProduct(...args),
    deleteAdditionalProduct: (...args: unknown[]) => mockDeleteAdditionalProduct(...args),
  },
}));

describe('AdditionalProductsManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAdditionalProducts.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Router WiFi 6',
        description: 'Equipo empresarial',
        category: 'NETWORKING',
        isLoan: false,
        requiresInventory: true,
        isActive: true,
        createdAt: '2026-05-01T10:00:00.000Z',
        updatedAt: '2026-05-02T11:00:00.000Z',
      },
    ]);
    mockCreateAdditionalProduct.mockResolvedValue([]);
    mockUpdateAdditionalProduct.mockResolvedValue([]);
    mockDeleteAdditionalProduct.mockResolvedValue([]);
  });

  it('muestra acciones accesibles para editar y eliminar productos', async () => {
    render(<AdditionalProductsManager canEdit />);

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
});
