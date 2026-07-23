import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommercialClient } from './CommercialClient';
import { commercialApi } from '@/lib/api-client';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/dashboard/commercial',
  useSearchParams: () => new URLSearchParams(),
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
  CommercialTabLayout: ({ summary }: { summary: ReactNode }) => (
    <div data-testid="tab-layout">{summary}</div>
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

describe('CommercialClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
