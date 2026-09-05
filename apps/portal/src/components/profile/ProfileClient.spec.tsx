import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ProfileClient } from './ProfileClient';
import type { UserProfile } from '@/lib/api-client';

const useAuthMock = jest.fn();
const getMeMock = jest.fn();
const updateMeMock = jest.fn();
const changeLoginEmailMock = jest.fn();
const getSummaryMock = jest.fn();
const changePasswordMock = jest.fn();
const logoutMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string }>) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

jest.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      Object.setPrototypeOf(this, MockApiError.prototype);
      this.name = 'ApiError';
      this.status = status;
    }
  }

  return {
    ApiError: MockApiError,
    userApi: {
      getMe: (...args: unknown[]) => getMeMock(...args),
      updateMe: (...args: unknown[]) => updateMeMock(...args),
      changeLoginEmail: (...args: unknown[]) => changeLoginEmailMock(...args),
    },
    dashboardApi: {
      getSummary: (...args: unknown[]) => getSummaryMock(...args),
    },
    authApi: {
      changePassword: (...args: unknown[]) => changePasswordMock(...args),
    },
  };
});

jest.mock('@/components/dashboard/OnboardingAlerts', () => ({
  OnboardingAlerts: () => <div data-testid="alertas-configuracion" />,
}));

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-uuid-001',
    email: 'ada@prueba.local',
    role: 'ADMIN',
    status: 'ACTIVE',
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '+573001234567',
    jobTitle: 'Administración',
    avatarUrl: null,
    mfaEnabled: true,
    emailVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockAuth(role = 'ADMIN', userId: string | null = 'user-uuid-001') {
  useAuthMock.mockReturnValue({
    user:
      userId === null
        ? null
        : {
            id: userId,
            emailHash: 'hash-ficticio',
            role,
            type: 'tenant',
            tenantId: 'tenant-uuid-001',
            displayName: 'Ada Lovelace',
            subtitle: '',
            firstName: 'Ada',
            lastName: 'Lovelace',
          },
    isAuthenticated: userId !== null,
    isLoading: false,
    login: jest.fn(),
    completeMfaLogin: jest.fn(),
    logout: logoutMock,
    refreshProfile: jest.fn(),
  });
}

describe('ProfileClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth();
    getMeMock.mockResolvedValue(buildProfile());
    getSummaryMock.mockResolvedValue({ alerts: [], settings: { country: 'CO' } });
  });

  it('PC-01 (P-01/CA-P01) — solicita el perfil sin transportar identidad ni tenant', async () => {
    render(<ProfileClient />);

    await waitFor(() => {
      expect(getMeMock).toHaveBeenCalled();
    });
    // La aridad es el contrato: /users/me se resuelve por el sub del JWT.
    expect(getMeMock).toHaveBeenCalledWith();
    expect(getMeMock.mock.calls[0]).toHaveLength(0);
  });

  it('PC-02 (P-01/CA-P01) — el reintento tras un fallo tampoco transporta identidad', async () => {
    getMeMock.mockRejectedValueOnce(new Error('red caída'));
    getMeMock.mockResolvedValue(buildProfile());

    render(<ProfileClient />);

    const retry = await screen.findByRole('button', { name: /Reintentar carga/i });
    fireEvent.click(retry);

    await waitFor(() => {
      expect(getMeMock.mock.calls.length).toBeGreaterThan(1);
    });
    for (const call of getMeMock.mock.calls) {
      expect(call).toHaveLength(0);
    }
  });

  it('muestra el encabezado y las secciones tras cargar el perfil', async () => {
    render(<ProfileClient />);

    expect(await screen.findByRole('heading', { name: 'Mi perfil' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Datos personales' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cambiar contraseña' })).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('muestra el estado de carga antes de resolver', () => {
    render(<ProfileClient />);

    expect(screen.getByText(/Estamos preparando tus datos/i)).toBeInTheDocument();
  });

  it('muestra error controlado con reintento cuando la carga falla', async () => {
    getMeMock.mockRejectedValue(new Error('red caída'));

    render(<ProfileClient />);

    expect(await screen.findByText('Perfil no disponible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reintentar carga/i })).toBeInTheDocument();
  });

  it('guardar en el formulario refresca el encabezado del perfil', async () => {
    updateMeMock.mockResolvedValue(buildProfile({ firstName: 'Ada Augusta' }));
    render(<ProfileClient />);

    await screen.findByRole('heading', { name: 'Datos personales' });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ada Augusta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Ada Augusta Lovelace')).toBeInTheDocument();
  });

  it('muestra la sección de alertas cuando hay configuración pendiente', async () => {
    getSummaryMock.mockResolvedValue({
      alerts: [{ key: 'BRANDING_NOT_CUSTOMIZED', level: 'LOW' }],
      settings: { country: 'CO' },
    });
    render(<ProfileClient />);

    await screen.findByRole('heading', { name: 'Datos personales' });
    expect(screen.getByText('Configuración pendiente')).toBeInTheDocument();
    expect(screen.getByTestId('alertas-configuracion')).toBeInTheDocument();
  });

  it('ADMIN solicita el resumen del panel para contexto del tenant', async () => {
    render(<ProfileClient />);

    await screen.findByRole('heading', { name: 'Datos personales' });
    expect(getSummaryMock).toHaveBeenCalled();
  });

  it('un rol no ADMIN no solicita el resumen del panel', async () => {
    mockAuth('TECHNICIAN');

    render(<ProfileClient />);

    await screen.findByRole('heading', { name: 'Datos personales' });
    expect(getSummaryMock).not.toHaveBeenCalled();
  });

  it('sin usuario en sesión muestra el estado no disponible', async () => {
    mockAuth('ADMIN', null);

    render(<ProfileClient />);

    expect(await screen.findByText('Perfil no disponible')).toBeInTheDocument();
    expect(getMeMock).not.toHaveBeenCalled();
  });

  it('perfil renderizado sin violaciones de accesibilidad', async () => {
    const { container } = render(<ProfileClient />);

    await screen.findByRole('heading', { name: 'Datos personales' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
