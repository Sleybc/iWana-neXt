import { render, screen, waitFor } from '@testing-library/react';
import { AdditionalServicesPanel } from './AdditionalServicesPanel';

const mockGetAdditionalServices = jest.fn();
const mockCreateAdditionalService = jest.fn();
const mockUpdateAdditionalService = jest.fn();
const mockDeleteAdditionalService = jest.fn();

jest.mock('@/lib/api-client', () => ({
  commercialApi: {
    getAdditionalServices: (...args: unknown[]) => mockGetAdditionalServices(...args),
    createAdditionalService: (...args: unknown[]) => mockCreateAdditionalService(...args),
    updateAdditionalService: (...args: unknown[]) => mockUpdateAdditionalService(...args),
    deleteAdditionalService: (...args: unknown[]) => mockDeleteAdditionalService(...args),
  },
}));

describe('AdditionalServicesPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAdditionalServices.mockResolvedValue([
      {
        id: 'srv-1',
        name: 'IP publica',
        description: 'Servicio recurrente para clientes empresariales',
        chargeType: 'RECURRING',
        basePrice: 78000,
        installationFee: 0,
        isActive: true,
        createdAt: '2026-05-01T10:00:00.000Z',
        updatedAt: '2026-05-02T11:00:00.000Z',
      },
    ]);
    mockCreateAdditionalService.mockResolvedValue([]);
    mockUpdateAdditionalService.mockResolvedValue([]);
    mockDeleteAdditionalService.mockResolvedValue([]);
  });

  it('muestra acciones compactas accesibles para editar y eliminar servicios', async () => {
    render(<AdditionalServicesPanel canEdit />);

    await waitFor(() => {
      expect(mockGetAdditionalServices).toHaveBeenCalled();
    });

    expect(await screen.findByRole('button', { name: 'Agregar servicio' })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Editar servicio IP publica' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Eliminar servicio IP publica' }),
    ).toBeInTheDocument();
  });
});
