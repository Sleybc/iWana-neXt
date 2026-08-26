import { fireEvent, render, screen } from '@testing-library/react';
import { ScheduleEventStatus, WfmWorkType } from '@iwana/shared';
import type { InternalUser, WfmScheduleEvent } from '@/lib/api-client';
import { ScheduleList } from './ScheduleList';

function buildEvent(
  id: string,
  title: string,
  status: ScheduleEventStatus = ScheduleEventStatus.SCHEDULED,
): WfmScheduleEvent {
  return {
    id,
    tenantId: 'tenant-1',
    workOrderId: null,
    title,
    description: 'Evento operativo',
    type: WfmWorkType.INSTALLATION,
    status,
    assignedUserId: 'tech-1',
    assignedTeamId: null,
    scheduledStartAt: '2026-06-05T08:00:00.000Z',
    scheduledEndAt: '2026-06-05T10:00:00.000Z',
    address: 'Cra 10',
    sector: 'Centro',
    municipality: 'Bogotá',
    latitude: null,
    longitude: null,
    expedienteId: null,
    subscriberId: null,
    organizationSiteId: null,
    ticketId: null,
    contractId: null,
    createdBy: 'admin-1',
    updatedBy: null,
    createdAt: '2026-06-05T07:00:00.000Z',
    updatedAt: '2026-06-05T07:00:00.000Z',
    deletedAt: null,
  };
}

function buildTechnician(): InternalUser {
  return {
    id: 'tech-1',
    email: 'luisa@example.com',
    role: 'TECHNICIAN',
    status: 'ACTIVE',
    tenantId: 'tenant-1',
    mfaEnabled: true,
    mfaRequired: false,
    isOperationalResource: true,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
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

describe('ScheduleList', () => {
  it('muestra el copy de volumen alto, conserva todos los eventos y ejecuta acción ver detalle', () => {
    const onSelectEvent = jest.fn();
    const scheduledEvent = buildEvent('evt-1', 'Instalación GPON');
    const completedEvent = buildEvent(
      'evt-2',
      'Mantenimiento de cierre',
      ScheduleEventStatus.COMPLETED,
    );

    render(
      <ScheduleList
        events={[scheduledEvent, completedEvent]}
        techniciansById={new Map([['tech-1', buildTechnician()]])}
        onSelectEvent={onSelectEvent}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Todo el volumen del rango' })).toBeInTheDocument();
    expect(screen.getByText('Todo el rango, sin recortes')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Usa la tabla para revisar la jornada completa, ordenar prioridades y detectar excepciones sin perder detalle por tarea.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('2 tareas')).toBeInTheDocument();
    expect(screen.getByText('Mantenimiento de cierre')).toBeInTheDocument();
    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Evento' })).toBeInTheDocument();
    expect(screen.getByText('Tareas visibles')).toBeInTheDocument();
    expect(screen.getByText('Por atender')).toBeInTheDocument();
    expect(screen.getByText('Sin acción pendiente')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ver detalle de Instalación GPON' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de Instalación GPON' }));
    expect(onSelectEvent).toHaveBeenCalledTimes(1);
    expect(onSelectEvent).toHaveBeenCalledWith(scheduledEvent);
  });

  it('muestra estado vacío cuando no hay eventos', () => {
    render(<ScheduleList events={[]} techniciansById={new Map()} onSelectEvent={jest.fn()} />);
    expect(screen.getByText('Sin eventos en el rango')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Evento' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva solicitud' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Prueba otro rango o vuelve a Día para revisar una jornada específica.'),
    ).toBeInTheDocument();
  });
});
