import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BusinessHoursWeekday, UserRole } from '@iwana/shared';
import { usersApi, wfmApi } from '@/lib/api-client';
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
    usersApi: {
      list: jest.fn(),
    },
    wfmApi: {
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
      technicianBusinessOverrides: {
        list: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
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

const usersApiMock = usersApi as unknown as {
  list: jest.Mock;
};

const wfmApiMock = wfmApi as unknown as {
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
  technicianBusinessOverrides: {
    list: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
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

function buildTechnician() {
  return {
    id: 'tech-1',
    email: 'tecnico@demo.co',
    role: UserRole.TECHNICIAN,
    status: 'ACTIVE',
    tenantId: 'tenant-1',
    mfaEnabled: true,
    mfaRequired: false,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    deletedAt: null,
    firstName: 'Luisa',
    lastName: 'Campos',
    phone: null,
    jobTitle: 'Técnica de campo',
    documentType: null,
    documentNumber: null,
    avatarUrl: null,
  };
}

describe('WfmOperatingHoursManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usersApiMock.list.mockResolvedValue({
      data: [buildTechnician()],
      meta: { nextCursor: null, total: 1 },
    });
    wfmApiMock.businessHours.getCompany.mockResolvedValue(buildWeek());
    wfmApiMock.operatingSites.list.mockResolvedValue([]);
    wfmApiMock.operatingSites.getBusinessHours.mockResolvedValue(buildWeek());
    wfmApiMock.technicianBusinessOverrides.list.mockResolvedValue([]);
    wfmApiMock.holidayBlackouts.list.mockResolvedValue([]);
  });

  it('should render the manager summary and company week', async () => {
    const { container } = render(<WfmOperatingHoursManager canEdit={true} />);

    expect(await screen.findByText('Operación de campo')).toBeInTheDocument();
    expect(screen.getByText('Horarios operativos')).toBeInTheDocument();
    expect(screen.getByText('Horario base de empresa')).toBeInTheDocument();
    expect(screen.getByText('Sin sedes operativas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar horario base' })).toBeInTheDocument();
    expect(container.querySelector('input[type="time"]')).toBeNull();
  });

  it('should show readonly guidance when the role cannot edit', async () => {
    render(<WfmOperatingHoursManager canEdit={false} />);

    expect(await screen.findByText('Modo solo lectura')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar horario base' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear sede' })).not.toBeInTheDocument();
  });

  it('should create an operating site from the inline form', async () => {
    const createdSite = {
      id: 'site-1',
      tenantId: 'tenant-1',
      name: 'Bogotá centro',
      code: 'BOG-CEN',
      address: 'Cra 10 # 10-10',
      municipality: 'Bogotá',
      sector: 'Centro',
      latitude: null,
      longitude: null,
      isActive: true,
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
      deletedAt: null,
    };

    wfmApiMock.operatingSites.list.mockResolvedValueOnce([]).mockResolvedValueOnce([createdSite]);
    wfmApiMock.operatingSites.create.mockResolvedValue(createdSite);

    render(<WfmOperatingHoursManager canEdit={true} />);

    await screen.findByText('Nueva sede operativa');

    fireEvent.change(screen.getByLabelText('Nombre de la sede'), {
      target: { value: 'Bogotá centro' },
    });
    fireEvent.change(screen.getByLabelText('Código operativo'), {
      target: { value: 'bog-cen' },
    });
    fireEvent.change(screen.getByLabelText('Coordenadas (Lat, Lng)'), {
      target: { value: '4.6097, -74.0817' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sede' }));

    await waitFor(() => {
      expect(wfmApiMock.operatingSites.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Bogotá centro',
          code: 'BOG-CEN',
          latitude: 4.6097,
          longitude: -74.0817,
        }),
      );
    });

    expect(await screen.findByText('Bogotá centro')).toBeInTheDocument();
  });

  it('should collapse the operating sites list inside an accordion', async () => {
    const existingSite = {
      id: 'site-1',
      tenantId: 'tenant-1',
      name: 'Oficina El Colegio - Principal',
      code: 'OECP',
      address: 'Centro',
      municipality: 'El Colegio',
      sector: 'Principal',
      latitude: null,
      longitude: null,
      isActive: true,
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
      deletedAt: null,
    };

    wfmApiMock.operatingSites.list.mockResolvedValue([existingSite]);

    render(<WfmOperatingHoursManager canEdit={true} />);

    const accordionTrigger = await screen.findByRole('button', { name: /Sedes registradas/i });

    expect(screen.queryByText('Oficina El Colegio - Principal')).not.toBeInTheDocument();

    fireEvent.click(accordionTrigger);

    expect(await screen.findByText('Oficina El Colegio - Principal')).toBeInTheDocument();
  });

  it('should normalize site business hours with seconds before saving', async () => {
    const existingSite = {
      id: 'site-1',
      tenantId: 'tenant-1',
      name: 'Oficina El Colegio - Principal',
      code: 'OECP',
      address: 'Centro',
      municipality: 'El Colegio',
      sector: 'Principal',
      latitude: null,
      longitude: null,
      isActive: true,
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
      deletedAt: null,
    };

    wfmApiMock.operatingSites.list.mockResolvedValue([existingSite]);
    wfmApiMock.operatingSites.getBusinessHours.mockResolvedValue(buildWeekWithSeconds());
    wfmApiMock.operatingSites.updateBusinessHours.mockResolvedValue(buildWeek());

    render(<WfmOperatingHoursManager canEdit={true} />);

    await screen.findByText('Horario por sede');
    await waitFor(() => {
      expect(wfmApiMock.operatingSites.getBusinessHours).toHaveBeenCalledWith('site-1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar horario de sede' }));

    await waitFor(() => {
      expect(wfmApiMock.operatingSites.updateBusinessHours).toHaveBeenCalledWith(
        'site-1',
        expect.objectContaining({
          days: expect.arrayContaining([
            expect.objectContaining({
              weekday: BusinessHoursWeekday.MONDAY,
              startTime: '08:00',
              endTime: '18:00',
              isEnabled: true,
            }),
            expect.objectContaining({
              weekday: BusinessHoursWeekday.SUNDAY,
              startTime: null,
              endTime: null,
              isEnabled: false,
            }),
          ]),
        }),
      );
    });
  });
});
