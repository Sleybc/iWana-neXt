import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BundlesManager } from './BundlesManager';

const mockGetBundles = jest.fn();
const mockCreateBundle = jest.fn();
const mockDeactivateBundle = jest.fn();
const mockGetPlans = jest.fn();
const mockGetAdditionalProducts = jest.fn();
const mockGetAdditionalServices = jest.fn();
const mockReplace = jest.fn();

let mockSearchParams = new URLSearchParams('tab=bundles');

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/dashboard/commercial',
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
  commercialApi: {
    getBundles: (...args: unknown[]) => mockGetBundles(...args),
    createBundle: (...args: unknown[]) => mockCreateBundle(...args),
    deactivateBundle: (...args: unknown[]) => mockDeactivateBundle(...args),
    getPlans: (...args: unknown[]) => mockGetPlans(...args),
    getAdditionalProducts: (...args: unknown[]) => mockGetAdditionalProducts(...args),
    getAdditionalServices: (...args: unknown[]) => mockGetAdditionalServices(...args),
  },
}));

const sampleBundle = {
  id: 'bundle-1',
  name: 'Combo hogar',
  description: 'Internet + TV',
  discountType: 'PERCENTAGE',
  discountValue: '10.00',
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: null,
  isActive: true,
  itemCount: 2,
};

describe('BundlesManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams('tab=bundles');
    mockGetBundles.mockResolvedValue([sampleBundle]);
    mockGetPlans.mockResolvedValue([]);
    mockGetAdditionalProducts.mockResolvedValue([]);
    mockGetAdditionalServices.mockResolvedValue([]);
    mockCreateBundle.mockResolvedValue([sampleBundle]);
    mockDeactivateBundle.mockResolvedValue([{ ...sampleBundle, isActive: false }]);
  });

  it('muestra alerta de éxito tras desactivar un combo', async () => {
    const user = userEvent.setup();

    render(<BundlesManager canEdit />);

    expect(await screen.findByText('Combo hogar')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Desactivar/i }));
    const confirmDialog = await screen.findByRole('dialog', { name: 'Desactivar combo' });
    await user.click(within(confirmDialog).getByRole('button', { name: 'Desactivar' }));

    expect(await screen.findByText('Operación completada')).toBeInTheDocument();
    expect(screen.getByText('Combo desactivado.')).toBeInTheDocument();
  });

  it('filtra combos con status=expiring y muestra empty si no hay', async () => {
    mockSearchParams = new URLSearchParams('tab=bundles&status=expiring');
    mockGetBundles.mockResolvedValue([
      sampleBundle,
      {
        ...sampleBundle,
        id: 'bundle-soon',
        name: 'Combo por vencer',
        validTo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]);

    render(<BundlesManager canEdit />);

    expect(await screen.findByText('Combo por vencer')).toBeInTheDocument();
    expect(screen.queryByText('Combo hogar')).not.toBeInTheDocument();
    expect(screen.getByText('Filtro activo')).toBeInTheDocument();
  });

  it('muestra empty de filtro cuando no hay combos por vencer', async () => {
    mockSearchParams = new URLSearchParams('tab=bundles&status=expiring');

    render(<BundlesManager canEdit />);

    expect(await screen.findByText('Sin combos que vencen pronto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar filtro' })).toBeInTheDocument();
  });

  it('muestra CTA default y abre side peek al crear', async () => {
    const user = userEvent.setup();
    render(<BundlesManager canEdit />);

    const createButton = await screen.findByRole('button', { name: 'Crear combo' });
    expect(createButton).toBeInTheDocument();

    await user.click(createButton);

    expect(await screen.findByRole('dialog', { name: 'Crear combo' })).toBeInTheDocument();
    expect(screen.getByText('Información básica')).toBeInTheDocument();
  });

  it('mantiene el listado visible si falla la desactivación', async () => {
    const user = userEvent.setup();
    mockDeactivateBundle.mockRejectedValueOnce(new Error('fail'));

    render(<BundlesManager canEdit />);

    expect(await screen.findByText('Combo hogar')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Desactivar/i }));

    const confirmDialog = await screen.findByRole('dialog', { name: 'Desactivar combo' });
    await user.click(within(confirmDialog).getByRole('button', { name: 'Desactivar' }));

    expect(await screen.findByText('No fue posible desactivar')).toBeInTheDocument();
    expect(screen.getAllByText('Combo hogar').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('No fue posible cargar combos')).not.toBeInTheDocument();
  });

  it('ofrece reintentar cuando falla la carga inicial', async () => {
    const user = userEvent.setup();
    mockGetBundles
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce([sampleBundle]);

    render(<BundlesManager canEdit />);

    expect(await screen.findByText('No fue posible cargar combos')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Combo hogar')).toBeInTheDocument();
  });
});
