import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromotionsManager } from './PromotionsManager';

const mockGetPromotions = jest.fn();
const mockCreatePromotion = jest.fn();
const mockDeactivatePromotion = jest.fn();
const mockGetBundles = jest.fn();
const mockGetPlans = jest.fn();
const mockGetAdditionalProducts = jest.fn();
const mockGetAdditionalServices = jest.fn();
const mockReplace = jest.fn();

let mockSearchParams = new URLSearchParams('tab=promotions');

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
    getPromotions: (...args: unknown[]) => mockGetPromotions(...args),
    createPromotion: (...args: unknown[]) => mockCreatePromotion(...args),
    deactivatePromotion: (...args: unknown[]) => mockDeactivatePromotion(...args),
    getBundles: (...args: unknown[]) => mockGetBundles(...args),
    getPlans: (...args: unknown[]) => mockGetPlans(...args),
    getAdditionalProducts: (...args: unknown[]) => mockGetAdditionalProducts(...args),
    getAdditionalServices: (...args: unknown[]) => mockGetAdditionalServices(...args),
  },
}));

const samplePromotion = {
  id: 'promo-1',
  name: 'Promo abril',
  code: 'PROMO25',
  description: 'Descuento temporal',
  discountType: 'PERCENTAGE',
  discountValue: '25.00',
  appliesTo: 'ALL',
  currentUses: 0,
  maxUses: null,
  validFrom: '2026-04-01T00:00:00.000Z',
  validTo: '2026-04-30T23:59:59.000Z',
  isActive: true,
};

describe('PromotionsManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams('tab=promotions');
    mockGetPromotions.mockResolvedValue([samplePromotion]);
    mockGetBundles.mockResolvedValue([]);
    mockGetPlans.mockResolvedValue([]);
    mockGetAdditionalProducts.mockResolvedValue([]);
    mockGetAdditionalServices.mockResolvedValue([]);
    mockCreatePromotion.mockResolvedValue([samplePromotion]);
    mockDeactivatePromotion.mockResolvedValue([{ ...samplePromotion, isActive: false }]);
  });

  it('muestra CTA default y abre side peek al crear', async () => {
    const user = userEvent.setup();
    render(<PromotionsManager canEdit />);

    const createButton = await screen.findByRole('button', { name: 'Crear promoción' });
    expect(createButton).toBeInTheDocument();

    await user.click(createButton);

    expect(await screen.findByRole('dialog', { name: 'Crear promoción' })).toBeInTheDocument();
    expect(screen.getByText('Información básica')).toBeInTheDocument();
  });

  it('mantiene el listado visible si falla la desactivación', async () => {
    const user = userEvent.setup();
    mockDeactivatePromotion.mockRejectedValueOnce(new Error('fail'));

    render(<PromotionsManager canEdit />);

    expect(await screen.findByText('Promo abril')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Desactivar/i }));

    const confirmDialog = await screen.findByRole('dialog', { name: 'Desactivar promoción' });
    await user.click(within(confirmDialog).getByRole('button', { name: 'Desactivar' }));

    expect(await screen.findByText('No fue posible desactivar')).toBeInTheDocument();
    expect(screen.getAllByText('Promo abril').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('No fue posible cargar promociones')).not.toBeInTheDocument();
  });

  it('ofrece reintentar cuando falla la carga inicial', async () => {
    const user = userEvent.setup();
    mockGetPromotions
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce([samplePromotion]);

    render(<PromotionsManager canEdit />);

    expect(await screen.findByText('No fue posible cargar promociones')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Promo abril')).toBeInTheDocument();
  });

  it('muestra columna Estado con canEdit={false}', async () => {
    mockGetPromotions.mockResolvedValueOnce([
      samplePromotion,
      { ...samplePromotion, id: 'promo-2', name: 'Promo inactiva', isActive: false },
    ]);

    render(<PromotionsManager canEdit={false} />);

    expect(await screen.findByRole('columnheader', { name: 'Estado' })).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('Inactiva')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Desactivar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).not.toBeInTheDocument();
  });

  it('filtra promociones con status=expiring (vigencia o cerca de usos)', async () => {
    mockSearchParams = new URLSearchParams('tab=promotions&status=expiring');
    mockGetPromotions.mockResolvedValue([
      {
        ...samplePromotion,
        id: 'promo-ok',
        name: 'Promo estable',
        validTo: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        maxUses: 100,
        currentUses: 1,
      },
      {
        ...samplePromotion,
        id: 'promo-soon',
        name: 'Promo por vencer',
        validTo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        ...samplePromotion,
        id: 'promo-uses',
        name: 'Promo cerca de usos',
        validTo: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        maxUses: 10,
        currentUses: 9,
      },
    ]);

    render(<PromotionsManager canEdit />);

    expect(await screen.findByText('Promo por vencer')).toBeInTheDocument();
    expect(screen.getByText('Promo cerca de usos')).toBeInTheDocument();
    expect(screen.queryByText('Promo estable')).not.toBeInTheDocument();
    expect(screen.getByText('Filtro activo')).toBeInTheDocument();
  });

  it('muestra empty de filtro cuando no hay promociones en riesgo', async () => {
    mockSearchParams = new URLSearchParams('tab=promotions&status=expiring');
    mockGetPromotions.mockResolvedValue([
      {
        ...samplePromotion,
        validTo: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        maxUses: 100,
        currentUses: 1,
      },
    ]);

    render(<PromotionsManager canEdit />);

    expect(await screen.findByText('Sin promociones en riesgo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar filtro' })).toBeInTheDocument();
  });
});
