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

describe('WfmOperatingHoursManager', () => {
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
    expect(await screen.findByText('Horarios operativos')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Sede empresarial').length).toBeGreaterThan(0);
    expect(screen.queryByText('Sedes operativas')).not.toBeInTheDocument();
  });

  it('should render the manager summary and company week', async () => {
    const { container } = render(<WfmOperatingHoursManager canEdit={true} />);

    expect(await screen.findByText('Despacho técnico')).toBeInTheDocument();
    expect(screen.getByText('Horarios operativos')).toBeInTheDocument();
    expect(screen.getByText('Horario base de despacho técnico')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar horario base' })).toBeInTheDocument();
    expect(screen.queryByText('Excepciones por técnico')).not.toBeInTheDocument();
    expect(screen.queryByText('Nueva excepción')).not.toBeInTheDocument();
    expect(container.querySelector('input[type="time"]')).toBeNull();
  });

  it('should show readonly guidance when the role cannot edit', async () => {
    render(<WfmOperatingHoursManager canEdit={false} />);

    expect(await screen.findByText('Modo solo lectura')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar horario base' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear sede' })).not.toBeInTheDocument();
  });
});
