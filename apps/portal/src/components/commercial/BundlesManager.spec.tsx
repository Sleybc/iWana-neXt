import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BundlesManager } from './BundlesManager';
import { EMPTY_LIST_META } from '@/lib/list-meta';

const mockGetBundles = jest.fn();
const mockCreateBundle = jest.fn();
const mockUpdateBundle = jest.fn();
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
  COMMERCIAL_LIST_PAGE_SIZE: 20,
  COMMERCIAL_PICKER_LIMIT: 100,
  commercialApi: {
    getBundles: (...args: unknown[]) => mockGetBundles(...args),
    createBundle: (...args: unknown[]) => mockCreateBundle(...args),
    updateBundle: (...args: unknown[]) => mockUpdateBundle(...args),
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
    mockGetBundles.mockResolvedValue({
      data: [sampleBundle],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    });
    mockGetPlans.mockResolvedValue({
      data: [],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 },
    });
    mockGetAdditionalProducts.mockResolvedValue({
      data: [],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 },
    });
    mockGetAdditionalServices.mockResolvedValue({
      data: [],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 },
    });
    mockCreateBundle.mockResolvedValue(sampleBundle);
    mockUpdateBundle.mockResolvedValue({ ...sampleBundle, name: 'Combo hogar actualizado' });
    mockDeactivateBundle.mockResolvedValue(undefined);
  });

  it('abre side peek de edición desde la acción Editar', async () => {
    const user = userEvent.setup();

    render(<BundlesManager canEdit />);

    expect(await screen.findByText('Combo hogar')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Editar combo Combo hogar/i }));

    expect(await screen.findByRole('dialog', { name: 'Editar combo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
    expect(screen.getByText(/Los ítems del combo no se editan aquí/i)).toBeInTheDocument();
  });

  it('abre peek de edición cuando focusId encuentra el combo', async () => {
    const onFocusConsumed = jest.fn();

    render(<BundlesManager canEdit focusId="bundle-1" onFocusConsumed={onFocusConsumed} />);

    expect(await screen.findByRole('dialog', { name: 'Editar combo' })).toBeInTheDocument();
    expect(onFocusConsumed).toHaveBeenCalled();
  });

  it('llama updateBundle al guardar desde el peek de edición', async () => {
    const user = userEvent.setup();

    render(<BundlesManager canEdit />);

    expect(await screen.findByText('Combo hogar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Editar combo Combo hogar/i }));

    const nameInput = await screen.findByLabelText('Nombre');
    await user.clear(nameInput);
    await user.type(nameInput, 'Combo hogar plus');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(mockUpdateBundle).toHaveBeenCalledWith(
      'bundle-1',
      expect.objectContaining({ name: 'Combo hogar plus' }),
    );
    expect(await screen.findByText('Combo actualizado.')).toBeInTheDocument();
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

  it('filtra combos con offerStatus=expiring en el fetch', async () => {
    mockSearchParams = new URLSearchParams('tab=bundles&offerStatus=expiring');
    mockGetBundles.mockResolvedValue({
      data: [
        {
          ...sampleBundle,
          id: 'bundle-soon',
          name: 'Combo por vencer',
          validTo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    });

    render(<BundlesManager canEdit />);

    await waitFor(() => {
      expect(mockGetBundles.mock.calls.some((call) => call[0]?.offerStatus === 'expiring')).toBe(
        true,
      );
    });
    expect(await screen.findByText('Combo por vencer')).toBeInTheDocument();
    expect(screen.getByText('Filtro activo')).toBeInTheDocument();
  });

  it('muestra empty de filtro cuando no hay combos por vencer', async () => {
    mockSearchParams = new URLSearchParams('tab=bundles&offerStatus=expiring');
    mockGetBundles.mockResolvedValue({
      data: [],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 },
    });

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
    mockGetBundles.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      data: [sampleBundle],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    });

    render(<BundlesManager canEdit />);

    expect(await screen.findByText('No fue posible cargar combos')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Combo hogar')).toBeInTheDocument();
  });
});
