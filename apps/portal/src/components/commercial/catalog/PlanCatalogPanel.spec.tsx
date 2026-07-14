import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlanCatalogPanel } from './PlanCatalogPanel';

const mockGetPlans = jest.fn();
const mockCreatePlan = jest.fn();
const mockUpdatePlan = jest.fn();
const mockDeletePlan = jest.fn();

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status?: number;
  },
  commercialApi: {
    getPlans: (...args: unknown[]) => mockGetPlans(...args),
    createPlan: (...args: unknown[]) => mockCreatePlan(...args),
    updatePlan: (...args: unknown[]) => mockUpdatePlan(...args),
    deletePlan: (...args: unknown[]) => mockDeletePlan(...args),
  },
}));

describe('PlanCatalogPanel', () => {
  beforeEach(() => {
    mockGetPlans.mockResolvedValue([]);
    mockCreatePlan.mockResolvedValue(undefined);
    mockUpdatePlan.mockResolvedValue(undefined);
    mockDeletePlan.mockResolvedValue(undefined);
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  it('no muestra FTTH en el selector de tecnología del nuevo plan', async () => {
    window.localStorage.setItem(
      'iwana.portal.commercial.plan-technology-options',
      JSON.stringify(['Fibra Optica', 'Radio Enlace', 'XGS-PON']),
    );

    render(<PlanCatalogPanel canEdit />);

    await waitFor(() => {
      expect(mockGetPlans).toHaveBeenCalled();
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo plan' }));

    const technologySelect = await screen.findByRole('combobox', { name: 'Tecnología' });
    fireEvent.click(technologySelect);

    const listbox = await screen.findByRole('listbox', { name: 'Tecnología' });
    const options = screen.getAllByRole('option');

    expect(listbox).toBeInTheDocument();
    expect(options).toHaveLength(3);
    expect(screen.queryByRole('option', { name: 'FTTH' })).not.toBeInTheDocument();
  });
});
