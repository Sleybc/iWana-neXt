import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CommercialDashboardSummary } from '@/lib/api-client';
import { CommercialClient } from './CommercialClient';
import { commercialApi } from '@/lib/api-client';

let mockSearchParams = new URLSearchParams();
const replaceMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/dashboard/commercial',
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@/components/auth/AuthProvider', () => {
  const user = { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-1' };
  return {
    useAuth: () => ({
      user,
      isLoading: false,
    }),
  };
});

jest.mock('@/components/commercial/CommercialTabLayout', () => ({
  CommercialTabLayout: ({ activeTab }: { activeTab?: string }) => (
    <div data-testid="tab-layout" data-active-tab={activeTab} />
  ),
}));

jest.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  }

  return {
    ApiError: MockApiError,
    commercialApi: {
      getDashboardSummary: jest.fn(),
    },
  };
});

const getDashboardSummary = commercialApi.getDashboardSummary as jest.Mock;

function buildSummary(
  overrides: Partial<CommercialDashboardSummary> = {},
): CommercialDashboardSummary {
  return {
    plansCount: 4,
    activePlansCount: 3,
    productsCount: 6,
    activeProductsCount: 5,
    servicesCount: 2,
    activeServicesCount: 2,
    bundlesCount: 1,
    activeBundlesCount: 1,
    promotionsCount: 3,
    activePromotionsCount: 2,
    compatibilityRulesCount: 4,
    activeCompatibilityRulesCount: 3,
    taxRulesCount: 5,
    activeTaxRulesCount: 4,
    offersExpiringSoonCount: 0,
    offersNearUseLimitCount: 0,
    offersAtRiskCount: 0,
    catalogActiveCount: 10,
    catalogSellableActiveCount: 10,
    catalogIncompleteActiveCount: 0,
    missingCurrentPriceCount: 0,
    activeBundlesWithInactiveItemsCount: 0,
    taxRulesCoverageGapCount: 0,
    rulesGapCount: 0,
    activeOffersCount: 3,
    attentionItems: [],
    recentChanges: [],
    ...overrides,
  };
}

describe('CommercialClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('ofrece reintentar junto al estado vacío cuando falla la carga', async () => {
    const user = userEvent.setup();
    getDashboardSummary.mockRejectedValue(new Error('network'));

    render(<CommercialClient />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Actividad/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Actividad/ }));

    await waitFor(() => {
      expect(screen.getByText('Actividad no disponible')).toBeInTheDocument();
    });

    getDashboardSummary.mockClear();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => {
      expect(getDashboardSummary).toHaveBeenCalledTimes(1);
    });
  });

  it('muestra alertas operativas aunque el tab activo no sea Resumen', async () => {
    mockSearchParams = new URLSearchParams('tab=plans');
    getDashboardSummary.mockResolvedValue(buildSummary({ offersAtRiskCount: 3 }));

    render(<CommercialClient />);

    await waitFor(() => {
      expect(screen.getByTestId('tab-layout')).toHaveAttribute('data-active-tab', 'plans');
      expect(screen.getByRole('region', { name: 'Alertas operativas' })).toBeInTheDocument();
    });

    expect(screen.getByText('Ofertas en riesgo')).toBeInTheDocument();
  });

  it('abre la actividad comercial desde la cabecera en cualquier tab', async () => {
    const user = userEvent.setup();
    mockSearchParams = new URLSearchParams('tab=taxation');
    getDashboardSummary.mockResolvedValue(
      buildSummary({
        attentionItems: [
          {
            id: 'b1',
            name: 'Combo hogar',
            entityType: 'bundle',
            reason: 'expiring_soon',
            destinoTab: 'bundles',
            validTo: '2026-07-30T00:00:00.000Z',
            usesRemaining: null,
          },
        ],
      }),
    );

    render(<CommercialClient />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Actividad/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Actividad/ }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Requiere atención')).toBeInTheDocument();
    expect(screen.getByText('Cambios recientes')).toBeInTheDocument();
  });

  it('mantiene el botón Actividad en ghost y sin badge cuando no hay ítems de atención', async () => {
    getDashboardSummary.mockResolvedValue(buildSummary());

    render(<CommercialClient />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Actividad comercial' })).toBeInTheDocument();
    });

    const activityButton = screen.getByRole('button', {
      name: 'Actividad comercial',
    });
    expect(activityButton.classList.contains('border')).toBe(false);

    const badge = within(activityButton).queryByText(/\d+/);
    expect(badge).toBeNull();
  });

  it('anuncia en el botón cuántos ítems requieren atención', async () => {
    mockSearchParams = new URLSearchParams('tab=plans');
    getDashboardSummary.mockResolvedValue(
      buildSummary({
        attentionItems: [
          {
            id: 'b1',
            name: 'Combo hogar',
            entityType: 'bundle',
            reason: 'expiring_soon',
            destinoTab: 'bundles',
            validTo: null,
            usesRemaining: null,
          },
          {
            id: 'p1',
            name: 'Plan fibra',
            entityType: 'plan',
            reason: 'missing_current_price',
            destinoTab: 'plans',
            validTo: null,
            usesRemaining: null,
          },
        ],
      }),
    );

    render(<CommercialClient />);

    await waitFor(() => {
      const button = screen.getByRole('button', {
        name: 'Actividad comercial, 2 ítems requieren atención',
      });
      expect(button).toBeInTheDocument();

      const badge = within(button).getByText('2');
      expect(badge.className).toContain('text-amber-700');
    });
  });

  it('eleva el botón Actividad a secondary cuando hay ítems de atención', async () => {
    getDashboardSummary.mockResolvedValue(
      buildSummary({
        attentionItems: [
          {
            id: 'p1',
            name: 'Plan fibra',
            entityType: 'plan',
            reason: 'missing_current_price',
            destinoTab: 'plans',
            validTo: null,
            usesRemaining: null,
          },
        ],
      }),
    );

    const { container } = render(<CommercialClient />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Actividad comercial, 1 ítem requiere atención' }),
      ).toBeInTheDocument();
    });

    const activityButton = screen.getByRole('button', {
      name: 'Actividad comercial, 1 ítem requiere atención',
    });
    // El variante secondary aplica border; ghost no tiene borde.
    expect(activityButton.classList.contains('border')).toBe(true);
    expect(container.querySelector('[aria-label="Actividad comercial"]')).not.toBeInTheDocument();
  });

  it('reescribe ?tab=summary a la URL canónica sin tab', async () => {
    mockSearchParams = new URLSearchParams('tab=summary');
    getDashboardSummary.mockResolvedValue(buildSummary());

    render(<CommercialClient />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard/commercial', { scroll: false });
    });
  });
});
