import { fireEvent, render, screen } from '@testing-library/react';
import { TechnicianLoadStrip } from './TechnicianLoadStrip';

describe('TechnicianLoadStrip', () => {
  it('expone barra de progreso accesible y permite filtrar por técnico', () => {
    const onFilterTechnician = jest.fn();

    render(
      <TechnicianLoadStrip
        summary={
          {
            technicianLoad: [
              {
                assignedUserId: 'tech-1',
                todayCount: 3,
                overdueCount: 1,
                totalScheduledMinutes: 420,
                utilizationPercent: 88,
                riskLevel: 'HIGH',
              },
            ],
          } as any
        }
        techniciansById={
          new Map([['tech-1', { id: 'tech-1', firstName: 'Luisa', lastName: 'Campos' } as any]])
        }
        selectedTechnicianId=""
        onFilterTechnician={onFilterTechnician}
      />,
    );

    expect(
      screen.getByRole('progressbar', { name: /Luisa Campos 88% de saturación/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(onFilterTechnician).toHaveBeenCalledWith('tech-1');
  });
});
