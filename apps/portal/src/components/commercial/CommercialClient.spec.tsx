import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CommercialDashboardSummary } from '@/lib/api-client';
import { CommercialClient } from './CommercialClient';
import { commercialApi } from '@/lib/api-client';

let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
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
  CommercialTabLayout: ({ summary, activeTab }: { summary: ReactNode; activeTab?: string }) => (
    <div data-testid="tab-layout" data-active-tab={activeTab}>
      {summary}
    </div>
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
      expect(screen.getByText('Indicadores no disponibles')).toBeInTheDocument();
    });

    const retryButtons = screen.getAllByRole('button', { name: 'Actualizar' });
    expect(retryButtons.length).toBeGreaterThan(1);

    getDashboardSummary.mockClear();
    await user.click(retryButtons[retryButtons.length - 1] as HTMLElement);

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
});
