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

jest.mock('./OperationalEventualitiesPanel', () => ({
  OperationalEventualitiesPanel: () => (
    <div data-testid="operational-eventualities-panel">
      <p>Cambios puntuales</p>
      <p>Cambios puntuales de disponibilidad</p>
    </div>
  ),
}));

jest.mock('./CalendarOrganizationHoursPanel', () => ({
  CalendarOrganizationHoursPanel: ({
    onDirtyChange,
  }: {
    onDirtyChange?: (isDirty: boolean) => void;
  }) => (
    <section>
      <p>Base empresarial</p>
      <h2>Horario base de la empresa</h2>
      <p>
        Define el horario semanal que servirá como referencia para toda la empresa y para las sedes
        que no tengan un ajuste propio.
      </p>
      <button type="button" onClick={() => onDirtyChange?.(true)}>
        Simular cambios pendientes
      </button>
    </section>
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
        'Consulta en una sola vista los horarios habituales y los cambios por fecha que afectan la operación.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Consulta en una sola vista los horarios habituales y los cambios por fecha que afectan la operación.',
      ),
    ).toBeInTheDocument();
  });

  it('renderiza el panel de horario base de empresa', async () => {
    render(<CalendarSettingsClient />);

    expect(await screen.findByText('Base empresarial')).toBeInTheDocument();
    expect(await screen.findByText('Horario base de la empresa')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Define el horario semanal que servirá como referencia para toda la empresa y para las sedes que no tengan un ajuste propio.',
      ),
    ).toBeInTheDocument();
  });

  it('renderiza el panel de horario por sede', async () => {
    render(<CalendarSettingsClient />);

    expect(await screen.findByText('Por sede')).toBeInTheDocument();
    expect(await screen.findByText('Horarios por sede')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Revisa qué sede sigue el horario base y cuál necesita un ajuste propio antes de guardar cambios.',
      ),
    ).toBeInTheDocument();
  });

  it('renderiza el panel de festivos y cierres especiales', async () => {
    render(<CalendarSettingsClient />);

    expect(await screen.findByText('Por fecha')).toBeInTheDocument();
    expect(await screen.findByText('Cierres por fecha y aperturas especiales')).toBeInTheDocument();
  });

  it('agrupa los carriles 1–2 y 3–4 y mantiene el orden DOM', async () => {
    render(<CalendarSettingsClient />);

    await screen.findByText('Horario base de la empresa');

    expect(screen.getByTestId('calendar-shell-grid')).toBeInTheDocument();
    expect(
      Array.from(
        screen.getByTestId('calendar-lane-1-2').querySelectorAll('[data-testid^="calendar-step-"]'),
      ).map((step) => step.getAttribute('data-testid')),
    ).toEqual(['calendar-step-1', 'calendar-step-2']);
    expect(
      Array.from(
        screen.getByTestId('calendar-lane-3-4').querySelectorAll('[data-testid^="calendar-step-"]'),
      ).map((step) => step.getAttribute('data-testid')),
    ).toEqual(['calendar-step-3', 'calendar-step-4']);

    const steps = Array.from(
      screen.getByTestId('calendar-shell-grid').querySelectorAll('[data-testid^="calendar-step-"]'),
    );
    expect(steps.map((step) => step.getAttribute('data-testid'))).toEqual([
      'calendar-step-1',
      'calendar-step-2',
      'calendar-step-3',
      'calendar-step-4',
    ]);
    expect(steps[0]).toHaveTextContent('Horario base de la empresa');
    expect(steps[1]).toHaveTextContent('Horarios por sede');
    expect(steps[2]).toHaveTextContent('Cierres por fecha y aperturas especiales');
    expect(steps[3]).toHaveTextContent('Cambios puntuales de disponibilidad');
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
    expect(screen.queryByRole('button', { name: 'Guardar horario base' })).not.toBeInTheDocument();
    expect(screen.getByText('Horarios por sede')).toBeInTheDocument();
    expect(screen.getByText('Cierres por fecha y aperturas especiales')).toBeInTheDocument();
  });

  it('reintenta una carga parcial desde el bloque afectado', async () => {
    const { organizationApi } = jest.requireMock('@/lib/api-client') as {
      organizationApi: {
        getCompanyHours: jest.Mock;
      };
    };

    organizationApi.getCompanyHours
      .mockRejectedValueOnce(new Error('error'))
      .mockResolvedValue(mockCompanyHours);

    render(<CalendarSettingsClient />);
    await screen.findByText(
      'No pudimos cargar el horario base. Este bloque queda bloqueado hasta que vuelvas a actualizar.',
    );

    screen.getAllByRole('button', { name: 'Reintentar' })[0]?.click();

    await waitFor(() => expect(organizationApi.getCompanyHours).toHaveBeenCalledTimes(2));
  });

  it('no muestra Actualizar dentro del contenedor del título', async () => {
    render(<CalendarSettingsClient />);
    await screen.findByText('Calendario operativo y jornadas');

    expect(screen.queryByRole('button', { name: 'Actualizar' })).not.toBeInTheDocument();
    expect(screen.queryByText('Resumen del calendario')).not.toBeInTheDocument();
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
