import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BusinessHoursWeekday, OrganizationSiteCapability } from '@iwana/shared';
import { wfmApi } from '@/lib/api-client';
import { WfmOperatingHoursManager } from './WfmOperatingHoursManager';

jest.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    status: number;
    code: string;
    details?: unknown;

    constructor(status: number, code: string, message: string, details?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  return {
    ApiError: MockApiError,
    wfmApi: {
      dispatchSites: {
        list: jest.fn(),
        getBusinessHours: jest.fn(),
        updateBusinessHours: jest.fn(),
      },
      businessHours: {
        getCompany: jest.fn(),
        updateCompany: jest.fn(),
      },
      operatingSites: {
        list: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
        getBusinessHours: jest.fn(),
        updateBusinessHours: jest.fn(),
      },
      holidayBlackouts: {
        list: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
      },
    },
  };
});

const wfmApiMock = wfmApi as unknown as {
  dispatchSites: {
    list: jest.Mock;
    getBusinessHours: jest.Mock;
    updateBusinessHours: jest.Mock;
  };
  businessHours: {
    getCompany: jest.Mock;
    updateCompany: jest.Mock;
  };
  operatingSites: {
    list: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    getBusinessHours: jest.Mock;
    updateBusinessHours: jest.Mock;
  };
  holidayBlackouts: {
    list: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
};

function buildWeek() {
  return [
    {
      weekday: BusinessHoursWeekday.MONDAY,
      startTime: '08:00',
      endTime: '18:00',
      isEnabled: true,
    },
    {
      weekday: BusinessHoursWeekday.TUESDAY,
      startTime: '08:00',
      endTime: '18:00',
      isEnabled: true,
    },
    {
      weekday: BusinessHoursWeekday.WEDNESDAY,
      startTime: '08:00',
      endTime: '18:00',
      isEnabled: true,
    },
    {
      weekday: BusinessHoursWeekday.THURSDAY,
      startTime: '08:00',
      endTime: '18:00',
      isEnabled: true,
    },
    {
      weekday: BusinessHoursWeekday.FRIDAY,
      startTime: '08:00',
      endTime: '18:00',
      isEnabled: true,
    },
    {
      weekday: BusinessHoursWeekday.SATURDAY,
      startTime: '08:00',
      endTime: '12:00',
      isEnabled: true,
    },
    {
      weekday: BusinessHoursWeekday.SUNDAY,
      startTime: null,
      endTime: null,
      isEnabled: false,
    },
  ];
}

function buildWeekWithSeconds() {
  return buildWeek().map((day) => ({
    ...day,
    startTime: day.startTime ? `${day.startTime}:00` : null,
    endTime: day.endTime ? `${day.endTime}:00` : null,
  }));
}

describe('Gestor de operaciones de campo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wfmApiMock.businessHours.getCompany.mockResolvedValue(buildWeek());
    wfmApiMock.dispatchSites.list.mockResolvedValue([]);
    wfmApiMock.dispatchSites.getBusinessHours.mockResolvedValue(buildWeek());
    wfmApiMock.dispatchSites.updateBusinessHours.mockResolvedValue(buildWeek());
    wfmApiMock.holidayBlackouts.list.mockResolvedValue([]);
  });

  it('should render organizational dispatch sites as the visible site source for operations', async () => {
    wfmApiMock.dispatchSites.list.mockResolvedValue([
      {
        id: 'org-site-1',
        name: 'Sede norte',
        code: 'NOR',
        capabilities: [OrganizationSiteCapability.TECH_DISPATCH],
        isActive: true,
        operatingSiteId: 'site-1',
      },
    ]);

    render(<WfmOperatingHoursManager canEdit={true} />);

    await waitFor(() => {
      expect(wfmApiMock.dispatchSites.list).toHaveBeenCalled();
    });
    expect(await screen.findByText('Horario operativo para visitas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cierre' }));
    expect(screen.getByLabelText('Sede empresarial')).toBeInTheDocument();
    expect(screen.queryByText('Sedes operativas')).not.toBeInTheDocument();
  });

  it('should degrade safely when visit sites cannot be loaded in compact framing', async () => {
    wfmApiMock.dispatchSites.list.mockRejectedValueOnce(new Error('network'));
    wfmApiMock.holidayBlackouts.list.mockResolvedValueOnce([
      {
        id: 'blackout-1',
        organizationSiteId: 'site-1',
        blackoutDate: '2026-07-10',
        isRecurring: false,
        name: 'Mantenimiento local',
        description: null,
        isEnabled: true,
      },
    ]);

    render(<WfmOperatingHoursManager canEdit={true} compactFraming />);

    await waitFor(() => {
      expect(screen.getByText('Sedes de visitas no disponibles')).toBeInTheDocument();
    });

    expect(
      screen.queryByText('Este bloque solo afecta visitas programadas'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('site-1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar cierre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
  });

  it('should render the manager summary and company week', async () => {
    const { container } = render(<WfmOperatingHoursManager canEdit={true} />);

    expect(
      await screen.findByText('Este bloque solo afecta visitas programadas'),
    ).toBeInTheDocument();
    expect(screen.getByText('Semana operativa')).toBeInTheDocument();
    expect(screen.getByText('Horario operativo para visitas')).toBeInTheDocument();
    expect(screen.getByText('Cierres que bloquean visitas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar horarios' })).toBeInTheDocument();
    expect(screen.queryByTestId('wfm-blackout-form')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar cierre' })).toBeInTheDocument();
    expect(container.querySelector('input[type="time"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Hora inicial Lunes' })).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Hora inicial Lunes hora' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Hora inicial Lunes minutos' }),
    ).not.toBeInTheDocument();
  });

  it('should show readonly guidance when the role cannot edit in compact framing', async () => {
    render(<WfmOperatingHoursManager canEdit={false} compactFraming />);

    expect(await screen.findByText('Modo solo lectura')).toBeInTheDocument();
    expect(
      screen.queryByText('Este bloque solo afecta visitas programadas'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar horarios' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear sede' })).not.toBeInTheDocument();
  });

  it('should keep a single dominant frame when compact framing is enabled', async () => {
    render(<WfmOperatingHoursManager canEdit={true} compactFraming />);

    expect(await screen.findByText('Horario operativo para visitas')).toBeInTheDocument();
    expect(
      screen.queryByText('Este bloque solo afecta visitas programadas'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('wfm-company-week-section')).toBeInTheDocument();
    expect(screen.getByTestId('wfm-blackouts-section')).toBeInTheDocument();
    expect(screen.getByText('Cierres que bloquean visitas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar cierre' })).toBeInTheDocument();
  });

  it('should subordinate the blackout form until the user requests it', async () => {
    render(<WfmOperatingHoursManager canEdit={true} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Registrar cierre' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Registrar cierre' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByTestId('wfm-blackout-form')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar cierre' }));

    expect(screen.getByTestId('wfm-blackout-form')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del cierre')).toHaveFocus();
    expect(screen.getByText('Registrar un cierre para visitas')).toBeInTheDocument();
  });
});
