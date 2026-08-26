import { fireEvent, render, screen } from '@testing-library/react';
import {
  ScheduleEventStatus,
  WfmWorkType,
  WorkOrderPriority,
  WorkOrderSourceContext,
  VisitRequestStatus,
} from '@iwana/shared';
import {
  ScheduleCalendar,
  getDailyDispatchTableMinWidth,
  getDailyTimelineWidthPercent,
} from './ScheduleCalendar';
import { buildDailyDraftFromDrop, serializePendingVisitDragPayload } from './daily-schedule-draft';

const technician = {
  id: 'tech-1',
  firstName: 'Luisa',
  lastName: 'Campos',
  email: 'luisa.campos@example.test',
};

type ScheduleEventFixture = {
  id: string;
  title: string;
  type: WfmWorkType;
  status: ScheduleEventStatus;
  scheduledStartAt: string;
  scheduledEndAt: string;
  assignedUserId: string | undefined;
  address: string;
  sector: string;
  municipality: string;
};

function buildEvent(overrides: Partial<ScheduleEventFixture> = {}): ScheduleEventFixture {
  return {
    id: 'evt-1',
    title: 'Instalación agenda',
    type: WfmWorkType.INSTALLATION,
    status: ScheduleEventStatus.SCHEDULED,
    scheduledStartAt: '2026-06-05T09:00:00.000Z',
    scheduledEndAt: '2026-06-05T11:00:00.000Z',
    assignedUserId: 'tech-1',
    address: 'Cra 11',
    sector: 'Norte',
    municipality: 'Bogotá',
    ...overrides,
  };
}

const day = {
  key: '2026-06-05',
  date: new Date('2026-06-05T00:00:00'),
  label: 'jueves 5 junio',
  shortLabel: 'JUE 05',
  events: [buildEvent()],
};

describe('ScheduleCalendar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-05T05:00:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('convierte semana en tablero de capacidad y deriva al detalle diario', () => {
    const onOpenDay = jest.fn();
    const denseWeekDay = {
      ...day,
      events: Array.from({ length: 20 }, (_, index) =>
        buildEvent({
          id: `evt-${index + 1}`,
          title: `Instalación ${index + 1}`,
          scheduledStartAt: `2026-06-05T${String(6 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'}:00.000Z`,
          scheduledEndAt: `2026-06-05T${String(6 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '30' : '59'}:00.000Z`,
          assignedUserId: index === 19 ? undefined : index % 2 === 0 ? 'tech-1' : 'tech-2',
        }),
      ),
    };

    render(
      <ScheduleCalendar
        days={[denseWeekDay as any]}
        technicians={[technician as any]}
        view="week"
        techniciansById={
          new Map([
            ['tech-1', technician as any],
            ['tech-2', { id: 'tech-2', firstName: 'Mario', lastName: 'Rojas' } as any],
          ])
        }
        onSelectEvent={jest.fn()}
        onOpenDay={onOpenDay}
      />,
    );

    expect(screen.getByText('Alta densidad')).toBeInTheDocument();
    expect(screen.getByText('20 tareas')).toBeInTheDocument();
    expect(screen.getByText('Responsables')).toBeInTheDocument();
    expect(screen.getByText('Ventana operativa')).toBeInTheDocument();
    expect(screen.getByText('1 tarea por asignar')).toBeInTheDocument();
    expect(screen.queryByText('Instalación 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Abrir día jueves 5 junio/i }));
    expect(onOpenDay).toHaveBeenCalledWith('2026-06-05');
  });

  it('muestra estado vacío cuando no hay días visibles', () => {
    render(
      <ScheduleCalendar
        days={[]}
        view="month"
        technicians={[]}
        techniciansById={new Map()}
        onSelectEvent={jest.fn()}
      />,
    );
    expect(screen.getByText('No hay días visibles')).toBeInTheDocument();
  });

  it('abre creación rápida al seleccionar una franja libre en vista diaria', () => {
    const onCreateEventSlot = jest.fn();

    render(
      <ScheduleCalendar
        days={[day as any]}
        technicians={[technician as any]}
        view="day"
        techniciansById={new Map([['tech-1', technician as any]])}
        onSelectEvent={jest.fn()}
        onCreateEventSlot={onCreateEventSlot}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Crear evento para Luisa Campos a las 06:00/i }),
    );
    expect(
      screen.getByRole('button', { name: /Crear evento para Luisa Campos a las 06:30/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Crear evento para Luisa Campos a las 06:15/i }),
    ).not.toBeInTheDocument();

    expect(onCreateEventSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedUserId: 'tech-1',
        dayKey: '2026-06-05',
      }),
    );
  });

  it('muestra eventos agendados en la grilla diaria solo con hora y titulo visibles', () => {
    render(
      <ScheduleCalendar
        days={[day as any]}
        technicians={[technician as any]}
        view="day"
        techniciansById={new Map([['tech-1', technician as any]])}
        onSelectEvent={jest.fn()}
      />,
    );

    expect(screen.getByText('Instalación agenda')).toBeInTheDocument();
    expect(screen.queryByText('Programado')).not.toBeInTheDocument();
    expect(screen.queryByText('Programada')).not.toBeInTheDocument();
  });

  it('calcula un mínimo de tabla diario con horas amplias y columna de responsable compacta', () => {
    expect(getDailyDispatchTableMinWidth(14)).toBe(136 + 14 * 160);
  });

  it('mantiene el ancho de un bloque proporcional a su duración real', () => {
    const dayMinutes = 14 * 60;

    expect(getDailyTimelineWidthPercent(30, dayMinutes)).toBeCloseTo((30 / dayMinutes) * 100);
    expect(getDailyTimelineWidthPercent(30, dayMinutes) * 2).toBeCloseTo(
      getDailyTimelineWidthPercent(60, dayMinutes),
    );
    expect(getDailyTimelineWidthPercent(30, dayMinutes)).toBeLessThan(5);
  });

  it('compacta la columna de responsable y deja que las horas usen el ancho disponible', () => {
    render(
      <ScheduleCalendar
        days={[day as any]}
        technicians={[technician as any]}
        view="day"
        techniciansById={new Map([['tech-1', technician as any]])}
        onSelectEvent={jest.fn()}
      />,
    );

    const table = screen.getByRole('table');
    expect(table).toHaveClass('w-full', 'table-fixed');
    expect(table).not.toHaveClass('min-w-[1912px]');
    expect(table).toHaveStyle({
      minWidth: `${getDailyDispatchTableMinWidth(14)}px`,
    });

    const responsibleCell = screen
      .getByRole('button', { name: 'Ver nombre completo de Luisa Campos' })
      .closest('td');
    expect(responsibleCell).toHaveClass('sticky', 'left-0', 'z-30');
    expect(responsibleCell).not.toHaveClass('z-10');
  });

  it('muestra el nombre completo del responsable al hacer clic en la columna compacta', () => {
    render(
      <ScheduleCalendar
        days={[day as any]}
        technicians={[technician as any]}
        view="day"
        techniciansById={new Map([['tech-1', technician as any]])}
        onSelectEvent={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ver nombre completo de Luisa Campos' }));

    expect(screen.getByRole('dialog', { name: 'Nombre completo' })).toHaveTextContent(
      'Luisa Campos',
    );
  });

  it('convierte mes en mapa de carga con drill-down al día', () => {
    const onOpenDay = jest.fn();
    const monthDay = {
      ...day,
      events: Array.from({ length: 14 }, (_, index) =>
        buildEvent({
          id: `month-evt-${index + 1}`,
          title: `Visita ${index + 1}`,
          scheduledStartAt: `2026-06-05T${String(7 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'}:00.000Z`,
          scheduledEndAt: `2026-06-05T${String(7 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '30' : '59'}:00.000Z`,
          assignedUserId: index % 3 === 0 ? 'tech-1' : 'tech-2',
        }),
      ),
    };

    render(
      <ScheduleCalendar
        days={[monthDay as any]}
        view="month"
        technicians={[]}
        techniciansById={new Map()}
        onSelectEvent={jest.fn()}
        onOpenDay={onOpenDay}
      />,
    );

    expect(screen.getByText('Jornada exigente')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('Responsables')).toBeInTheDocument();
    expect(screen.getByText('Ventana operativa')).toBeInTheDocument();
    expect(screen.queryByText('Visita 1')).not.toBeInTheDocument();
    expect(screen.queryByText(/\+\d+ eventos más/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Abrir el detalle del jueves 5 junio/i }));

    expect(onOpenDay).toHaveBeenCalledWith('2026-06-05');
  });

  it('muestra rail lateral sin texto descriptivo redundante', () => {
    render(
      <ScheduleCalendar
        days={[day as any]}
        technicians={[technician as any]}
        view="day"
        techniciansById={new Map([['tech-1', technician as any]])}
        pendingVisitRequests={[
          {
            id: 'visit-1',
            tenantId: 'tenant-1',
            status: VisitRequestStatus.READY_TO_SCHEDULE,
            originContext: WorkOrderSourceContext.CRM,
            originRef: 'exp-1',
            originLabel: 'Expediente',
            customerDisplayName: 'Cliente Norte',
            workType: WfmWorkType.INSTALLATION,
            priority: WorkOrderPriority.NORMAL,
            title: 'Instalación fibra',
            description: null,
            requestedWindowStartAt: null,
            requestedWindowEndAt: null,
            slaDueAt: null,
            address: 'Calle 1',
            municipality: 'Bogotá',
            sector: 'Norte',
            latitude: null,
            longitude: null,
            organizationSiteId: 'site-1',
            expedienteId: null,
            subscriberId: null,
            ticketId: null,
            contractId: null,
            scheduleEventId: null,
            workOrderId: null,
            requestedByUserId: 'user-1',
            scheduledByUserId: null,
            scheduledAt: null,
            cancelledAt: null,
            cancelledByUserId: null,
            cancelReason: null,
            createdAt: '2026-06-05T08:00:00.000Z',
            updatedAt: '2026-06-05T08:00:00.000Z',
            deletedAt: null,
          },
        ]}
        onSelectEvent={jest.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Pendientes por programar' })).toBeInTheDocument();
    expect(
      screen.queryByText('Tareas listas para pasar a agenda desde la misma mesa de despacho.'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Cliente Norte')).toBeInTheDocument();
    expect(screen.getByText(/Creada /i)).toBeInTheDocument();
    expect(screen.getByText('Instalación')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Abrir/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Programar/i })).not.toBeInTheDocument();
  });

  it('oculta solicitudes ya agendadas del rail de pendientes', () => {
    render(
      <ScheduleCalendar
        days={[day as any]}
        technicians={[technician as any]}
        view="day"
        techniciansById={new Map([['tech-1', technician as any]])}
        pendingVisitRequests={[
          {
            id: 'visit-scheduled',
            status: VisitRequestStatus.SCHEDULED,
            customerDisplayName: 'Cliente ya agendado',
            title: 'Instalación cerrada',
          } as any,
        ]}
        onSelectEvent={jest.fn()}
      />,
    );

    expect(screen.getByText('Sin pendientes inmediatos')).toBeInTheDocument();
    expect(screen.queryByText('Cliente ya agendado')).not.toBeInTheDocument();
  });

  it('dispara drop de pendiente sobre franja diaria', () => {
    const onPendingVisitDrop = jest.fn();
    const dragPayload = serializePendingVisitDragPayload({
      visitRequestId: 'visit-1',
      organizationSiteId: 'site-1',
      workType: WfmWorkType.INSTALLATION,
      durationMinutes: 120,
      customerDisplayName: 'Cliente Norte',
      title: 'Instalación fibra',
    });

    render(
      <ScheduleCalendar
        days={[day as any]}
        technicians={[technician as any]}
        view="day"
        techniciansById={new Map([['tech-1', technician as any]])}
        onSelectEvent={jest.fn()}
        onPendingVisitDrop={onPendingVisitDrop}
      />,
    );

    const dropTarget = screen.getByRole('button', {
      name: /Crear evento para Luisa Campos a las 09:00/i,
    });
    const dataTransfer = {
      getData: jest.fn(() => dragPayload),
      dropEffect: 'copy',
    };

    fireEvent.dragOver(dropTarget, { dataTransfer });
    fireEvent.drop(dropTarget, { dataTransfer });

    expect(onPendingVisitDrop).toHaveBeenCalledWith(
      expect.objectContaining({
        visitRequestId: 'visit-1',
        assignedUserId: 'tech-1',
        dayKey: '2026-06-05',
      }),
    );
  });

  it('renderiza borrador editable en la grilla diaria', () => {
    const draft = buildDailyDraftFromDrop({
      visitRequestId: 'visit-1',
      organizationSiteId: 'site-1',
      workType: WfmWorkType.INSTALLATION,
      durationMinutes: 120,
      customerDisplayName: 'Cliente Norte',
      title: 'Instalación fibra',
      assignedUserId: 'tech-1',
      dayKey: '2026-06-05',
      scheduledStartAt: '2026-06-05T09:00:00.000Z',
      scheduledEndAt: '2026-06-05T11:00:00.000Z',
    });

    render(
      <ScheduleCalendar
        days={[day as any]}
        technicians={[technician as any]}
        view="day"
        techniciansById={new Map([['tech-1', technician as any]])}
        dailyDraft={{ ...draft, validationState: 'valid' }}
        onSelectEvent={jest.fn()}
        onDailyDraftConfirm={jest.fn()}
        onDailyDraftDiscard={jest.fn()}
      />,
    );

    expect(screen.getByLabelText(/Instalación fibra/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar agenda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar borrador' })).toBeInTheDocument();
  });
});
