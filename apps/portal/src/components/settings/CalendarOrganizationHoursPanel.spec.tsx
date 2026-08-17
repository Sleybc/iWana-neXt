import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BusinessHoursWeekday } from '@iwana/shared';
import { CalendarOrganizationHoursPanel } from './CalendarOrganizationHoursPanel';

jest.mock('@/lib/api-client', () => ({
  organizationApi: {
    replaceCompanyHours: jest.fn(),
  },
}));

jest.mock('./BusinessHoursWeekEditor', () => {
  const actual = jest.requireActual('./BusinessHoursWeekEditor');

  return {
    ...actual,
    BusinessHoursWeekEditor: ({
      days,
      canEdit,
      onChange,
    }: {
      days: Array<{ weekday: string; opensAt: string | null }>;
      canEdit: boolean;
      onChange: (
        days: Array<{
          weekday: string;
          isOpen: boolean;
          opensAt: string | null;
          closesAt: string | null;
        }>,
      ) => void;
    }) => (
      <div>
        <output data-testid="organization-draft">{JSON.stringify(days)}</output>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() =>
            onChange([
              {
                weekday: 'MONDAY',
                isOpen: true,
                opensAt: '10:00',
                closesAt: '18:00',
              },
            ])
          }
        >
          Cambiar draft
        </button>
      </div>
    ),
  };
});

const mondayHours = [
  {
    weekday: BusinessHoursWeekday.MONDAY,
    isOpen: true,
    opensAt: '08:00',
    closesAt: '18:00',
  },
];

describe('CalendarOrganizationHoursPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mantiene visible el editor semanal como tarea principal y deja el contexto como apoyo ligero', () => {
    render(
      <CalendarOrganizationHoursPanel
        companyHours={mondayHours}
        canEdit={true}
        onUpdated={jest.fn()}
      />,
    );

    expect(screen.getByTestId('organization-draft')).toHaveTextContent('08:00');
    expect(screen.getByText('Referencia para las sedes')).toBeInTheDocument();
    expect(screen.getByText('Referencia para las sedes').closest('[role="status"]')).toBeNull();
    expect(
      screen.getByText('Las sedes sin ajuste propio usarán este horario como base operativa.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar horario base' })).toBeInTheDocument();
  });

  it('mantiene visible el feedback de guardado cuando el padre sincroniza el nuevo horario', async () => {
    const updatedHours = [
      {
        weekday: BusinessHoursWeekday.MONDAY,
        isOpen: true,
        opensAt: '10:00',
        closesAt: '18:00',
      },
    ];
    const onUpdated = jest.fn();
    const { organizationApi } = jest.requireMock('@/lib/api-client') as {
      organizationApi: {
        replaceCompanyHours: jest.Mock;
      };
    };

    organizationApi.replaceCompanyHours.mockResolvedValueOnce(updatedHours);

    const { rerender } = render(
      <CalendarOrganizationHoursPanel
        companyHours={mondayHours}
        canEdit={true}
        onUpdated={onUpdated}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horario base' }));

    await waitFor(() => {
      expect(organizationApi.replaceCompanyHours).toHaveBeenCalledWith({
        businessHours: [
          {
            weekday: BusinessHoursWeekday.MONDAY,
            isOpen: true,
            opensAt: '10:00',
            closesAt: '18:00',
          },
        ],
      });
      expect(onUpdated).toHaveBeenCalledWith(updatedHours);
    });

    rerender(
      <CalendarOrganizationHoursPanel
        companyHours={updatedHours}
        canEdit={true}
        onUpdated={onUpdated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Horario base actualizado correctamente.')).toBeInTheDocument();
    });
  });

  it('bloquea la edición del horario base mientras el guardado está en curso', async () => {
    const saveDeferred = new Promise<typeof mondayHours>(() => undefined);
    const { organizationApi } = jest.requireMock('@/lib/api-client') as {
      organizationApi: {
        replaceCompanyHours: jest.Mock;
      };
    };

    organizationApi.replaceCompanyHours.mockReturnValueOnce(saveDeferred);

    render(
      <CalendarOrganizationHoursPanel
        companyHours={mondayHours}
        canEdit={true}
        onUpdated={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Guardar horario base' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cambiar draft' })).toBeDisabled();
    });
  });

  it('respeta el modo solo lectura en el editor del horario base', () => {
    render(
      <CalendarOrganizationHoursPanel
        companyHours={mondayHours}
        canEdit={false}
        onUpdated={jest.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Guardar horario base' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar draft' })).toBeDisabled();
  });

  it('muestra la alerta de solo lectura cuando el perfil no puede editar', () => {
    render(
      <CalendarOrganizationHoursPanel
        companyHours={mondayHours}
        canEdit={false}
        onUpdated={jest.fn()}
      />,
    );

    expect(
      screen.getByText('Tu perfil puede consultar estos horarios, pero no modificarlos.'),
    ).toBeInTheDocument();
    expect(
      screen
        .getByText('Tu perfil puede consultar estos horarios, pero no modificarlos.')
        .closest('[role="status"]'),
    ).not.toBeNull();
  });

  it('muestra feedback de error si el guardado falla', async () => {
    const { organizationApi } = jest.requireMock('@/lib/api-client') as {
      organizationApi: {
        replaceCompanyHours: jest.Mock;
      };
    };

    organizationApi.replaceCompanyHours.mockRejectedValueOnce(new Error('error'));

    render(
      <CalendarOrganizationHoursPanel
        companyHours={mondayHours}
        canEdit={true}
        onUpdated={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Guardar horario base' }));

    await waitFor(() => {
      expect(
        screen.getByText('No fue posible guardar el horario base. Intenta nuevamente.'),
      ).toBeInTheDocument();
    });
  });

  it('resincroniza el draft cuando cambian las props del horario base', async () => {
    const { rerender } = render(
      <CalendarOrganizationHoursPanel
        companyHours={mondayHours}
        canEdit={true}
        onUpdated={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar draft' }));

    expect(screen.getByTestId('organization-draft')).toHaveTextContent('10:00');

    rerender(
      <CalendarOrganizationHoursPanel
        companyHours={[
          {
            weekday: BusinessHoursWeekday.MONDAY,
            isOpen: true,
            opensAt: '09:00',
            closesAt: '17:00',
          },
        ]}
        canEdit={true}
        onUpdated={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('organization-draft')).toHaveTextContent('09:00');
    });
  });
});
