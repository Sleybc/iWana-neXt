import { render, screen, waitFor } from '@testing-library/react';
import { UserRole } from '@iwana/shared';
import { CalendarSettingsClient } from './CalendarSettingsClient';

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
  organizationApi: {
    getCompanyHours: jest.fn(),
    list: jest.fn(),
    getExceptions: jest.fn(),
    get: jest.fn(),
    replaceCompanyHours: jest.fn(),
    replaceBusinessHours: jest.fn(),
    clearSiteOverride: jest.fn(),
    createException: jest.fn(),
    deleteException: jest.fn(),
  },
}));

// Suprime errores de consola de react-dom en tests de error boundary
jest.spyOn(console, 'error').mockImplementation(() => undefined);

jest.mock('./CalendarWfmPanel', () => ({
  CalendarWfmPanel: () => <div data-testid="calendar-wfm-panel">Ventana técnica WFM</div>,
}));

jest.mock('./OperationalEventualitiesPanel', () => ({
  OperationalEventualitiesPanel: () => (
    <div data-testid="operational-eventualities-panel">Eventualidades operativas</div>
  ),
}));

const mockCompanyHours = [
  { weekday: 'MONDAY' as const, isOpen: true, opensAt: '08:00', closesAt: '18:00' },
];

const mockSites = [
  { id: 'site-1', name: 'Sede centro', code: 'CENTRO', capabilities: [], isActive: true },
];

const mockExceptions = [
  {
    id: 'exc-1',
    exceptionDate: '2026-01-01',
    name: 'Año nuevo',
    isOpen: false,
    isRecurring: true,
    opensAt: null,
    closesAt: null,
    organizationSiteId: null,
  },
];

describe('CalendarSettingsClient', () => {
  beforeEach(() => {
    const { organizationApi } = jest.requireMock('@/lib/api-client') as {
      organizationApi: {
        getCompanyHours: jest.Mock;
        list: jest.Mock;
        getExceptions: jest.Mock;
        get: jest.Mock;
      };
    };

    jest.clearAllMocks();

    useAuthMock.mockReturnValue({
      user: { id: 'user-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    organizationApi.getCompanyHours.mockResolvedValue(mockCompanyHours);
    organizationApi.list.mockResolvedValue(mockSites);
    organizationApi.getExceptions.mockResolvedValue(mockExceptions);
    organizationApi.get.mockResolvedValue({
      ...mockSites[0],
      siteType: 'OFFICE',
      address: null,
      municipality: null,
      department: null,
      isPrimary: true,
      businessHours: [],
      businessHoursResolved: [],
      businessHoursMode: 'BASE' as const,
    });
  });

  it('muestra esqueleto de carga mientras authLoading está activo', () => {
    useAuthMock.mockReturnValue({ user: null, isLoading: true });

    render(<CalendarSettingsClient />);

    // El título aparece incluso en estado de carga
    expect(screen.getByText('Calendario operativo y jornadas')).toBeInTheDocument();
  });

  it('renderiza el título de la sección tras cargar los datos', async () => {
    render(<CalendarSettingsClient />);

    expect(
      await screen.findByText(
        'Define el horario general de tu organización, ajustes por sede y festivos especiales.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Define el horario general de tu organización, ajustes por sede y festivos especiales.',
      ),
    ).toBeInTheDocument();
  });

  it('renderiza el panel de horario base de empresa', async () => {
    render(<CalendarSettingsClient />);

    expect(await screen.findByText('Horario general de atención y recaudo')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Horario semanal general para toda la organización. Las sedes que no tengan horario propio usarán este horario automáticamente.',
      ),
    ).toBeInTheDocument();
  });

  it('renderiza el panel de horario por sede', async () => {
    render(<CalendarSettingsClient />);

    expect(await screen.findByText('Horario por sede')).toBeInTheDocument();
    expect(
      screen.getByText('Elige si una sede usa el horario general o tiene su propio horario.'),
    ).toBeInTheDocument();
  });

  it('renderiza el panel de festivos y cierres especiales', async () => {
    render(<CalendarSettingsClient />);

    expect(await screen.findByText('Festivos y cierres especiales')).toBeInTheDocument();
  });

  it('llama a getCompanyHours, list y getExceptions al montar', async () => {
    const { organizationApi } = jest.requireMock('@/lib/api-client') as {
      organizationApi: {
        getCompanyHours: jest.Mock;
        list: jest.Mock;
        getExceptions: jest.Mock;
      };
    };

    render(<CalendarSettingsClient />);

    await waitFor(() => {
      expect(organizationApi.getCompanyHours).toHaveBeenCalledTimes(1);
      expect(organizationApi.list).toHaveBeenCalledTimes(1);
      expect(organizationApi.getExceptions).toHaveBeenCalledTimes(1);
    });
  });

  it('muestra alerta de error cuando todos los recursos fallan', async () => {
    const { organizationApi } = jest.requireMock('@/lib/api-client') as {
      organizationApi: {
        getCompanyHours: jest.Mock;
        list: jest.Mock;
        getExceptions: jest.Mock;
      };
    };

    organizationApi.getCompanyHours.mockRejectedValue(new Error('error'));
    organizationApi.list.mockRejectedValue(new Error('error'));
    organizationApi.getExceptions.mockRejectedValue(new Error('error'));

    render(<CalendarSettingsClient />);

    expect(
      await screen.findByText('No fue posible cargar el calendario operativo. Intenta nuevamente.'),
    ).toBeInTheDocument();
  });

  it('muestra alerta de acceso restringido para roles sin permiso', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'user-1', role: 'VIEWER' },
      isLoading: false,
    });

    render(<CalendarSettingsClient />);

    expect(screen.getByText('Sin autorización')).toBeInTheDocument();
  });
});
