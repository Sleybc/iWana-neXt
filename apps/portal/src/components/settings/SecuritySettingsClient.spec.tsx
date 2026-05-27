import { render, screen } from '@testing-library/react';
import { UserRole } from '@iwana/shared';
import { type TenantSelfSettings } from '@/lib/api-client';
import { SecuritySettingsClient } from './SecuritySettingsClient';

const useAuthMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class MockApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  tenantSelfApi: {
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
  },
}));

const mockSettings = {
  features: {
    mfa_required_all: false,
    billing: true,
  },
} as unknown as TenantSelfSettings;

describe('SecuritySettingsClient', () => {
  beforeEach(() => {
    const { tenantSelfApi } = jest.requireMock('@/lib/api-client') as {
      tenantSelfApi: {
        getSettings: jest.Mock;
      };
    };

    jest.clearAllMocks();
    useAuthMock.mockReturnValue({
      user: { id: 'user-1', role: UserRole.ADMIN },
      isLoading: false,
    });
    tenantSelfApi.getSettings.mockResolvedValue(mockSettings);
  });

  it('renderiza un lenguaje claro para la configuración de seguridad', async () => {
    render(<SecuritySettingsClient />);

    expect(
      await screen.findByText(
        'Configura la autenticación de dos factores y revisa las opciones de seguridad.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Configura la autenticación de dos factores y revisa las opciones de seguridad.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Autenticación de dos factores y opciones de seguridad.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Límite de suscriptores')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });
});
