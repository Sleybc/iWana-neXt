import { fireEvent, render, screen } from '@testing-library/react';
import { ScheduleEventStatus } from '@iwana/shared';
import { ScheduleEventDrawer } from './ScheduleEventDrawer';

describe('ScheduleEventDrawer', () => {
  it('muestra boton de reintento cuando falla la carga del detalle', () => {
    const onRetry = jest.fn().mockResolvedValue(undefined);

    render(
      <ScheduleEventDrawer
        open
        event={null}
        technician={null}
        workOrder={null}
        onOpenChange={jest.fn()}
        onOpenReschedule={jest.fn()}
        onTransitionEventStatus={jest.fn().mockResolvedValue(undefined)}
        onTransitionWorkOrderStatus={jest.fn().mockResolvedValue(undefined)}
        canReschedule={false}
        isLoading={false}
        error="Servicio no disponible"
        actionError={null}
        isEventTransitioning={false}
        isWorkOrderTransitioning={false}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('deshabilita transicion de evento terminal', () => {
    const event = {
      id: 'evt-1',
      title: 'Evento cerrado',
      type: 'INSTALLATION',
      status: ScheduleEventStatus.COMPLETED,
      scheduledStartAt: '2026-06-01T10:00:00.000Z',
      scheduledEndAt: '2026-06-01T11:00:00.000Z',
      assignedUserId: 'tech-1',
      address: 'Cra 1',
      municipality: 'Bogota',
      description: 'Detalle',
      workOrderId: null,
    } as any;

    render(
      <ScheduleEventDrawer
        open
        event={event}
        technician={null}
        workOrder={null}
        onOpenChange={jest.fn()}
        onOpenReschedule={jest.fn()}
        onTransitionEventStatus={jest.fn().mockResolvedValue(undefined)}
        onTransitionWorkOrderStatus={jest.fn().mockResolvedValue(undefined)}
        canReschedule
        isLoading={false}
        error={null}
        actionError={null}
        isEventTransitioning={false}
        isWorkOrderTransitioning={false}
        onRetry={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole('button', { name: 'Aplicar estado' })).toBeDisabled();
  });
});
