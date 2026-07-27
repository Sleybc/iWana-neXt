import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdditionalServicesPanel } from './AdditionalServicesPanel';
import { EMPTY_LIST_META } from '@/lib/list-meta';

const mockGetAdditionalServices = jest.fn();
const mockCreateAdditionalService = jest.fn();
const mockUpdateAdditionalService = jest.fn();
const mockDeleteAdditionalService = jest.fn();
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/dashboard/commercial',
  useSearchParams: () => new URLSearchParams('tab=services'),
}));

jest.mock('@/lib/api-client', () => ({
  commercialApi: {
    getAdditionalServices: (...args: unknown[]) => mockGetAdditionalServices(...args),
    createAdditionalService: (...args: unknown[]) => mockCreateAdditionalService(...args),
    updateAdditionalService: (...args: unknown[]) => mockUpdateAdditionalService(...args),
    deleteAdditionalService: (...args: unknown[]) => mockDeleteAdditionalService(...args),
  },
  COMMERCIAL_LIST_PAGE_SIZE: 20,
}));

const sampleService = {
  id: 'srv-1',
  name: 'IP pública',
  description: 'Servicio recurrente para clientes empresariales',
  chargeType: 'RECURRING',
  basePrice: 78000,
  installationFee: 0,
  isActive: true,
  createdAt: '2026-05-01T10:00:00.000Z',
  updatedAt: '2026-05-02T11:00:00.000Z',
};

describe('AdditionalServicesPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAdditionalServices.mockResolvedValue({
      data: [sampleService],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    });
    mockCreateAdditionalService.mockResolvedValue(undefined);
    mockUpdateAdditionalService.mockResolvedValue(undefined);
    mockDeleteAdditionalService.mockResolvedValue(undefined);
  });

  it('muestra acciones compactas accesibles para editar y eliminar servicios', async () => {
    render(<AdditionalServicesPanel canEdit />);

    await waitFor(() => {
      expect(mockGetAdditionalServices).toHaveBeenCalled();
    });

    expect(await screen.findByRole('button', { name: 'Agregar servicio' })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Editar servicio IP pública' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Eliminar servicio IP pública' }),
    ).toBeInTheDocument();
  });

  it('mantiene el catálogo visible si falla la eliminación', async () => {
    const user = userEvent.setup();
    mockDeleteAdditionalService.mockRejectedValueOnce(new Error('fail'));

    render(<AdditionalServicesPanel canEdit />);

    expect(await screen.findByText('IP pública')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Eliminar servicio IP pública' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('No fue posible eliminar')).toBeInTheDocument();
    expect(screen.getAllByText('IP pública').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('No fue posible cargar servicios')).not.toBeInTheDocument();
  });

  it('ofrece reintentar cuando falla la carga inicial', async () => {
    const user = userEvent.setup();
    mockGetAdditionalServices.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      data: [sampleService],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    });

    render(<AdditionalServicesPanel canEdit />);

    expect(await screen.findByText('No fue posible cargar servicios')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('IP pública')).toBeInTheDocument();
  });

  it('envía charge al servidor al filtrar tipo de cargo', async () => {
    const user = userEvent.setup();
    render(<AdditionalServicesPanel canEdit />);

    expect(await screen.findByText('IP pública')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Tipo de cobro' }));
    await user.click(await screen.findByRole('option', { name: /Recurrente/i }));

    await waitFor(() => {
      expect(
        mockGetAdditionalServices.mock.calls.some((call) => call[0]?.charge === 'RECURRING'),
      ).toBe(true);
    });
  });
});
