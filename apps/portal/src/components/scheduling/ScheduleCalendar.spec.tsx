import { fireEvent, render, screen } from '@testing-library/react';
import { ScheduleEventStatus, WfmWorkType } from '@iwana/shared';
import { ScheduleCalendar } from './ScheduleCalendar';

const day = {
  key: '2026-06-05',
  label: 'jueves 5 junio',
  shortLabel: 'JUE 05',
  events: [
    {
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
    },
  ],
};

describe('ScheduleCalendar', () => {
  it('renderiza evento y permite abrir detalle desde botón accesible', () => {
    const onSelectEvent = jest.fn();

    render(
      <ScheduleCalendar
        days={[day as any]}
        techniciansById={
          new Map([['tech-1', { id: 'tech-1', firstName: 'Luisa', lastName: 'Campos' } as any]])
        }
        onSelectEvent={onSelectEvent}
      />,
    );

    const trigger = screen.getByRole('button', { name: /Evento Instalación agenda/i });
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(onSelectEvent).toHaveBeenCalledTimes(1);
  });

  it('muestra estado vacío cuando no hay días visibles', () => {
    render(<ScheduleCalendar days={[]} techniciansById={new Map()} onSelectEvent={jest.fn()} />);
    expect(screen.getByText('No hay días visibles')).toBeInTheDocument();
  });
});
