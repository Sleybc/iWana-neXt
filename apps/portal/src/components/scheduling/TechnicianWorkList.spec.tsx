import { render, screen } from '@testing-library/react';
import { UserRole, WfmWorkType } from '@iwana/shared';
import { TechnicianWorkList } from './TechnicianWorkList';

function buildTechnician(id: string, firstName: string, lastName: string) {
  return {
    id,
    email: `${id}@demo.co`,
    role: UserRole.TECHNICIAN,
    firstName,
    lastName,
    status: 'ACTIVE',
    deletedAt: null,
  } as any;
}

function buildWorkOrder(index: number, assignedUserId: string) {
  return {
    id: `wo-${index}`,
    code: `OT-${index}`,
    type: WfmWorkType.INSTALLATION,
    status: 'ASSIGNED',
    priority: 'NORMAL',
    summary: `Orden ${index}`,
    assignedUserId,
  } as any;
}

function buildAvailability(index: number, userId: string) {
  return {
    id: `av-${index}`,
    userId,
    type: 'BLOCKED',
    startsAt: `2026-06-0${index}T10:00:00.000Z`,
    endsAt: `2026-06-0${index}T12:00:00.000Z`,
    reason: `Bloqueo ${index}`,
  } as any;
}

describe('TechnicianWorkList', () => {
  it('muestra indicadores de elementos ocultos cuando hay truncamiento por densidad', () => {
    const technicians = Array.from({ length: 10 }).map((_, index) =>
      buildTechnician(`tech-${index + 1}`, `Tecnico${index + 1}`, 'Demo'),
    );

    const workOrders = Array.from({ length: 5 }).map((_, index) =>
      buildWorkOrder(index + 1, 'tech-1'),
    );
    const availability = Array.from({ length: 4 }).map((_, index) =>
      buildAvailability(index + 1, 'tech-1'),
    );

    const summary = {
      technicianLoad: technicians.map((technician) => ({
        assignedUserId: technician.id,
        todayCount: 1,
      })),
    } as any;

    render(
      <TechnicianWorkList
        technicians={technicians}
        workOrders={workOrders}
        summary={summary}
        availability={availability}
        selectedTechnicianId=""
      />,
    );

    expect(screen.getByText('+2 adicionales')).toBeInTheDocument();
    expect(screen.getByText('+2 ordenes de trabajo adicionales')).toBeInTheDocument();
    expect(screen.getByText('+2 franjas adicionales')).toBeInTheDocument();
  });
});
