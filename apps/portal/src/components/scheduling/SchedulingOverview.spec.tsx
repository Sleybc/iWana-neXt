import { fireEvent, render, screen } from '@testing-library/react';
import { ScheduleEventStatus, UserRole, WfmWorkType } from '@iwana/shared';
import { SchedulingOverview } from './SchedulingOverview';

const technician = {
  id: 'tech-1',
  email: 'tecnico@demo.co',
  role: UserRole.TECHNICIAN,
  firstName: 'Luisa',
  lastName: 'Campos',
} as any;

const event = {
  id: 'evt-1',
  title: 'Instalación GPON barrio norte',
  type: WfmWorkType.INSTALLATION,
  status: ScheduleEventStatus.DRAFT,
  scheduledStartAt: '2026-05-09T13:00:00.000Z',
  scheduledEndAt: '2026-05-09T15:00:00.000Z',
  assignedUserId: 'tech-1',
  municipality: 'Bogotá',
} as any;

const summary = {
  todayCount: 1,
  overdueCount: 1,
  upcomingCount: 3,
  activeCount: 2,
  enRouteCount: 1,
  atRiskCount: 1,
  alerts: [
    {
      id: 'overdue-evt-1',
      type: 'OVERDUE_EVENT',
      severity: 'critical',
      title: 'Evento atrasado',
      description: 'Instalación GPON barrio norte',
      eventId: 'evt-1',
      assignedUserId: 'tech-1',
      scheduledStartAt: '2026-05-09T13:00:00.000Z',
    },
  ],
  technicianLoad: [
    {
      assignedUserId: 'tech-1',
      todayCount: 1,
      overdueCount: 1,
      totalScheduledMinutes: 420,
      utilizationPercent: 88,
      riskLevel: 'HIGH',
    },
  ],
} as any;

describe('SchedulingOverview', () => {
  it('renders command center KPIs, alerts, timeline and load strip', () => {
    render(
      <SchedulingOverview
        summary={summary}
        events={[event]}
        techniciansById={new Map([['tech-1', technician]])}
        selectedDayKey="2026-05-09"
        onSelectEvent={jest.fn()}
        onFilterTechnician={jest.fn()}
      />,
    );

    expect(screen.getByText('Command center')).toBeInTheDocument();
    expect(screen.getByText('Activos')).toBeInTheDocument();
    expect(screen.getByText('Evento atrasado')).toBeInTheDocument();
    expect(screen.getAllByText('Luisa Campos').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Instalación GPON barrio norte').length).toBeGreaterThan(0);
    expect(screen.getByText('Saturación alta')).toBeInTheDocument();
  });

  it('opens event detail from alert and timeline actions', () => {
    const onSelectEvent = jest.fn();

    render(
      <SchedulingOverview
        summary={summary}
        events={[event]}
        techniciansById={new Map([['tech-1', technician]])}
        selectedDayKey="2026-05-09"
        onSelectEvent={onSelectEvent}
        onFilterTechnician={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Abrir alerta Evento atrasado/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /Abrir evento Instalación GPON barrio norte/i }),
    );

    expect(onSelectEvent).toHaveBeenCalledTimes(2);
  });
});
