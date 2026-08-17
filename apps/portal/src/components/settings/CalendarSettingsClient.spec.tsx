import { render, screen, waitFor, within } from '@testing-library/react';
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

jest.mock('./OperationalEventualitiesPanel', () => ({
  OperationalEventualitiesPanel: () => (
    <div data-testid="operational-eventualities-panel">
      <p>Paso 4 · Cambios puntuales</p>
      <p>Cambios puntuales de disponibilidad</p>
    </div>
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
    organizationApi.list.mockResolvedValue({
      data: mockSites,
      meta: {
        nextCursor: null,
        total: mockSites.length,
        totalIsEstimate: false,
        page: 1,
        limit: 100,
        totalPages: 1,
        hasMore: false,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    });
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
        'Ordena el horario base de tu empresa y luego ajusta sedes, cierres por fecha y cambios puntuales desde una sola vista.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ordena el horario base de tu empresa y luego ajusta sedes, cierres por fecha y cambios puntuales desde una sola vista.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Estado operativo')).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 día abierto en horario base, 1 sede activa y 1 cierre por fecha registrado.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('calendar-operational-status')).toBeInTheDocument();
  });

  it('renderiza el panel de horario base de empresa', async () => {
    render(<CalendarSettingsClient />);

    expect(await screen.findByText('Paso 1 · Horario base')).toBeInTheDocument();
    expect(await screen.findByText('Horario base de la empresa')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Define el horario semanal que servirá como referencia para toda la empresa y para las sedes que no tengan un ajuste propio.',
      ),
    ).toBeInTheDocument();
  });

  it('renderiza el panel de horario por sede', async () => {
    render(<CalendarSettingsClient />);

    expect(await screen.findByText('Paso 2 · Horarios por sede')).toBeInTheDocument();
    expect(await screen.findByText('Horarios por sede')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Revisa qué sede sigue el horario base y cuál necesita un ajuste propio antes de guardar cambios.',
      ),
    ).toBeInTheDocument();
  });

  it('renderiza el panel de festivos y cierres especiales', async () => {
    render(<CalendarSettingsClient />);

    expect(await screen.findByText('Paso 3 · Cierres por fecha')).toBeInTheDocument();
    expect(await screen.findByText('Cierres por fecha y aperturas especiales')).toBeInTheDocument();
  });

  it('agrupa horarios estructurales y relega capas operativas secundarias', async () => {
    render(<CalendarSettingsClient />);

    await screen.findByText('Horario base de la empresa');

    expect(screen.getByTestId('calendar-shell-grid')).toBeInTheDocument();

    const primaryGroup = screen.getByTestId('calendar-shell-primary');
    const secondaryGroup = screen.getByTestId('calendar-shell-secondary');

    expect(within(primaryGroup).getByText('Horario base de la empresa')).toBeInTheDocument();
    expect(
      within(primaryGroup).getByText('Cierres por fecha y aperturas especiales'),
    ).toBeInTheDocument();
    expect(within(secondaryGroup).getByText('Horarios por sede')).toBeInTheDocument();
    expect(within(secondaryGroup).queryByText('Programación de visitas')).not.toBeInTheDocument();
    expect(
      within(secondaryGroup).getByText('Cambios puntuales de disponibilidad'),
    ).toBeInTheDocument();
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
      expect(organizationApi.list).toHaveBeenCalledWith({ page: 1, limit: 100 });
      expect(organizationApi.getExceptions).toHaveBeenCalledTimes(1);
    });

    // H-FE-ENVELOPE-OLA7: sedes desde envelope.data, no Array.isArray(response)
    expect(await screen.findAllByText(/Sede centro/i)).not.toHaveLength(0);
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

  it('bloquea solo el bloque afectado cuando falla una carga parcial', async () => {
    const { organizationApi } = jest.requireMock('@/lib/api-client') as {
      organizationApi: {
        getCompanyHours: jest.Mock;
      };
    };

    organizationApi.getCompanyHours.mockRejectedValue(new Error('error'));

    render(<CalendarSettingsClient />);

    expect(
      await screen.findByText(
        'No pudimos cargar el horario base. Este bloque queda bloqueado hasta que vuelvas a actualizar.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Algunos bloques no se pudieron cargar. Actualiza la vista antes de confirmar el estado operativo o guardar cambios.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar horario base' })).not.toBeInTheDocument();
    expect(screen.getByText('Horarios por sede')).toBeInTheDocument();
    expect(screen.getByText('Cierres por fecha y aperturas especiales')).toBeInTheDocument();
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
