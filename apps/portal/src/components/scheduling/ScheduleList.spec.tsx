import { fireEvent, render, screen } from '@testing-library/react';
import { ScheduleEventStatus, WfmWorkType } from '@iwana/shared';
import { ScheduleList } from './ScheduleList';

function buildEvent(id: string, title: string) {
  return {
    id,
    title,
    description: 'Evento operativo',
    type: WfmWorkType.INSTALLATION,
    status: ScheduleEventStatus.SCHEDULED,
    assignedUserId: 'tech-1',
    scheduledStartAt: '2026-06-05T08:00:00.000Z',
    scheduledEndAt: '2026-06-05T10:00:00.000Z',
    address: 'Cra 10',
    sector: 'Centro',
    municipality: 'Bogotá',
  } as any;
}

describe('ScheduleList', () => {
  it('renderiza tabla accesible y ejecuta acción ver detalle', () => {
    const onSelectEvent = jest.fn();
    const event = buildEvent('evt-1', 'Instalación GPON');

    render(
      <ScheduleList
        events={[event]}
        techniciansById={
          new Map([['tech-1', { id: 'tech-1', firstName: 'Luisa', lastName: 'Campos' } as any]])
        }
        onSelectEvent={onSelectEvent}
      />,
    );

    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Evento' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ver detalle de Instalación GPON' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de Instalación GPON' }));
    expect(onSelectEvent).toHaveBeenCalledTimes(1);
  });

  it('muestra estado vacío cuando no hay eventos', () => {
    render(<ScheduleList events={[]} techniciansById={new Map()} onSelectEvent={jest.fn()} />);
    expect(screen.getByText('Sin eventos en el rango')).toBeInTheDocument();
  });
});
