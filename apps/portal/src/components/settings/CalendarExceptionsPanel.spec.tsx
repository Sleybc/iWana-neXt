import type { ChangeEvent } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrganizationSiteType } from '@iwana/shared';
import { CalendarExceptionsPanel } from './CalendarExceptionsPanel';
import { CALENDAR_SETTINGS_COPY } from './mod00-settings-labels';

const createExceptionMock = jest.fn();
const deleteExceptionMock = jest.fn();

jest.mock('@/lib/api-client', () => ({
  organizationApi: {
    createException: (...args: unknown[]) => createExceptionMock(...args),
    deleteException: (...args: unknown[]) => deleteExceptionMock(...args),
  },
}));

jest.mock('@iwana/ui', () => {
  const actual = jest.requireActual('@iwana/ui');

  function toInputDate(value?: Date): string {
    if (!value) {
      return '';
    }

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  function toDate(value: string): Date | undefined {
    if (!value) {
      return undefined;
    }

    const [yearPart, monthPart, dayPart] = value.split('-');
    if (!yearPart || !monthPart || !dayPart) {
      return undefined;
    }

    const year = Number(yearPart);
    const month = Number(monthPart);
    const day = Number(dayPart);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return undefined;
    }

    return new Date(year, month - 1, day);
  }

  return {
    ...actual,
    Select: ({
      id,
      name,
      value,
      onChange,
      options = [],
      disabled,
      'aria-label': ariaLabel,
    }: {
      id?: string;
      name?: string;
      value?: string;
      onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
      options?: Array<{ value: string; label: string }>;
      disabled?: boolean;
      'aria-label'?: string;
    }) => (
      <select
        id={id}
        name={name}
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
    DatePicker: ({
      id,
      name,
      label,
      value,
      onChange,
      disabled,
    }: {
      id?: string;
      name?: string;
      label?: string;
      value?: Date;
      onChange?: (date: Date | undefined) => void;
      disabled?: boolean;
    }) => (
      <label>
        {label}
        <input
          id={id}
          name={name}
          type="text"
          value={toInputDate(value)}
          disabled={disabled}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onChange?.(toDate(event.target.value))
          }
        />
      </label>
    ),
  };
});

async function selectExceptionTime(label: string, value: string): Promise<void> {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Hora inválida en test: ${value}`);
  }

  const hour = match[1];
  const minute = match[2];
  if (!hour || !minute) {
    throw new Error(`Hora inválida en test: ${value}`);
  }
  const user = userEvent.setup();
  await user.click(screen.getByLabelText(label));
  const dialog = await screen.findByRole('dialog', { name: 'Selecciona una hora' });
  await user.click(
    within(within(dialog).getByRole('listbox', { name: 'Hora' })).getByRole('option', {
      name: hour,
    }),
  );
  await user.click(
    within(within(dialog).getByRole('listbox', { name: 'Minutos' })).getByRole('option', {
      name: minute,
    }),
  );
}

describe('CalendarExceptionsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const sites = [
    {
      id: 'site-1',
      name: 'Sede centro',
      code: 'CENTRO',
      capabilities: [],
      isActive: true,
      siteType: OrganizationSiteType.OFFICE,
      address: null,
      municipality: null,
      department: null,
    },
  ];

  it('asocia labels accesibles a los controles del formulario', () => {
    render(
      <CalendarExceptionsPanel
        exceptions={[]}
        sites={sites}
        canEdit={true}
        onCreated={jest.fn()}
        onDeleted={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('exception-form')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar fecha especial' }));

    expect(screen.getByLabelText('Nombre del cierre o apertura')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha afectada')).toBeInTheDocument();
    expect(screen.getByLabelText('Sede afectada (opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Abrir ese día')).toBeInTheDocument();
    expect(screen.getByLabelText('Repetir cada año')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Abrir ese día'));

    expect(screen.getByLabelText('Desde')).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toBeInTheDocument();
    expect(document.querySelector('input[type="time"]')).toBeNull();
  });

  it('expone el disclosure con aria y deja un solo control de cierre', () => {
    render(
      <CalendarExceptionsPanel
        exceptions={[]}
        sites={sites}
        canEdit={true}
        onCreated={jest.fn()}
        onDeleted={jest.fn()}
      />,
    );

    const openButton = screen.getByRole('button', {
      name: CALENDAR_SETTINGS_COPY.exceptionsShowFormAction,
    });

    expect(openButton).toHaveAttribute('aria-expanded', 'false');
    expect(openButton).toHaveAttribute('aria-controls', 'calendar-exception-form-region');

    fireEvent.click(openButton);

    const closeButton = screen.getByRole('button', {
      name: CALENDAR_SETTINGS_COPY.exceptionsHideFormAction,
    });

    expect(closeButton).toHaveAttribute('aria-expanded', 'true');
    expect(closeButton).toHaveAttribute('aria-controls', 'calendar-exception-form-region');
    expect(screen.getByTestId('exception-form')).toHaveAttribute(
      'id',
      'calendar-exception-form-region',
    );
    expect(
      screen.getAllByRole('button', { name: CALENDAR_SETTINGS_COPY.exceptionsHideFormAction }),
    ).toHaveLength(1);
  });

  it('permite crear una excepción usando queries accesibles', async () => {
    const onCreated = jest.fn();
    createExceptionMock.mockResolvedValue({
      id: 'exc-1',
      exceptionDate: '2026-01-01',
      name: 'Año nuevo',
      isOpen: true,
      isRecurring: true,
      opensAt: '08:00',
      closesAt: '12:00',
      organizationSiteId: 'site-1',
    });

    render(
      <CalendarExceptionsPanel
        exceptions={[]}
        sites={sites}
        canEdit={true}
        onCreated={onCreated}
        onDeleted={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Registrar fecha especial' }));
    fireEvent.change(screen.getByLabelText('Nombre del cierre o apertura'), {
      target: { value: 'Año nuevo' },
    });
    fireEvent.change(screen.getByLabelText('Fecha afectada'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Sede afectada (opcional)'), {
      target: { value: 'site-1' },
    });
    fireEvent.click(screen.getByLabelText('Abrir ese día'));
    fireEvent.click(screen.getByLabelText('Repetir cada año'));
    await selectExceptionTime('Desde', '08:00');
    await selectExceptionTime('Hasta', '12:00');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar festivo o cierre' }));

    await waitFor(() => {
      expect(createExceptionMock).toHaveBeenCalledWith({
        exceptionDate: '2026-01-01',
        name: 'Año nuevo',
        isOpen: true,
        isRecurring: true,
        opensAt: '08:00',
        closesAt: '12:00',
        organizationSiteId: 'site-1',
      });
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'exc-1',
          name: 'Año nuevo',
        }),
      );
    });
  });

  it('muestra primero el listado y mantiene el formulario cerrado por defecto', () => {
    render(
      <CalendarExceptionsPanel
        exceptions={[
          {
            id: 'exc-1',
            exceptionDate: '2026-01-01',
            name: 'Año nuevo',
            description: null,
            isOpen: false,
            isRecurring: true,
            opensAt: null,
            closesAt: null,
            organizationSiteId: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
        sites={sites}
        canEdit={true}
        onCreated={jest.fn()}
        onDeleted={jest.fn()}
      />,
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('exceptions-desktop-table')).getByText('Año nuevo'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('exception-form')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar fecha especial' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar fecha especial' }));

    expect(screen.getByTestId('exception-form')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('muestra una lista apilada en mobile con estado, alcance y acción operable', () => {
    render(
      <CalendarExceptionsPanel
        exceptions={[
          {
            id: 'exc-mobile-1',
            exceptionDate: '2026-01-01',
            name: 'Año nuevo',
            description: null,
            isOpen: true,
            isRecurring: true,
            opensAt: '08:00',
            closesAt: '12:00',
            organizationSiteId: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
        sites={sites}
        canEdit={true}
        onCreated={jest.fn()}
        onDeleted={jest.fn()}
      />,
    );

    const mobileList = screen.getByTestId('exceptions-mobile-list');
    const mobileCard = within(mobileList).getByTestId('exception-mobile-card-exc-mobile-1');
    expect(mobileCard).toHaveTextContent('Año nuevo');
    expect(mobileCard).toHaveTextContent('Todas las sedes');
    expect(mobileCard).toHaveTextContent('Abierto');
    expect(within(mobileCard).getByRole('button', { name: 'Eliminar' })).toHaveClass('min-h-11');
    expect(screen.getByTestId('exceptions-desktop-table')).toBeInTheDocument();
  });

  it('valida aperturas especiales sin horas completas al enviar', async () => {
    render(
      <CalendarExceptionsPanel
        exceptions={[]}
        sites={sites}
        canEdit={true}
        onCreated={jest.fn()}
        onDeleted={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Registrar fecha especial' }));
    fireEvent.change(screen.getByLabelText('Nombre del cierre o apertura'), {
      target: { value: 'Apertura especial' },
    });
    fireEvent.change(screen.getByLabelText('Fecha afectada'), {
      target: { value: '2026-02-01' },
    });
    fireEvent.click(screen.getByLabelText('Abrir ese día'));

    // El botón de crear siempre está habilitado (contrato: validación al enviar)
    const createButton = screen.getByRole('button', { name: 'Agregar festivo o cierre' });
    expect(createButton).toBeEnabled();

    // El helper de horas es persistente mientras «Abrir ese día» está marcado
    expect(
      screen.getByText('Si marcas «Abrir ese día», define la hora de inicio y de fin.'),
    ).toBeInTheDocument();

    fireEvent.click(createButton);

    await waitFor(() => {
      expect(
        screen.getByText('Si abres ese día, define hora de inicio y de fin.'),
      ).toBeInTheDocument();
    });
    expect(createExceptionMock).not.toHaveBeenCalled();
  });

  it('valida el orden del horario de apertura especial al enviar', async () => {
    render(
      <CalendarExceptionsPanel
        exceptions={[]}
        sites={sites}
        canEdit={true}
        onCreated={jest.fn()}
        onDeleted={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Registrar fecha especial' }));
    fireEvent.change(screen.getByLabelText('Nombre del cierre o apertura'), {
      target: { value: 'Apertura especial' },
    });
    fireEvent.change(screen.getByLabelText('Fecha afectada'), {
      target: { value: '2026-02-01' },
    });
    fireEvent.click(screen.getByLabelText('Abrir ese día'));
    await selectExceptionTime('Desde', '12:00');
    await selectExceptionTime('Hasta', '10:00');

    const createButton = screen.getByRole('button', { name: 'Agregar festivo o cierre' });
    expect(createButton).toBeEnabled();

    fireEvent.click(createButton);

    await waitFor(() => {
      expect(
        screen.getByText('La hora de cierre debe ser posterior a la hora de inicio.'),
      ).toBeInTheDocument();
    });
    expect(createExceptionMock).not.toHaveBeenCalled();
  });

  it('elimina una excepción tras confirmar en el diálogo', async () => {
    const onDeleted = jest.fn();
    deleteExceptionMock.mockResolvedValue(undefined);

    render(
      <CalendarExceptionsPanel
        exceptions={[
          {
            id: 'exc-1',
            exceptionDate: '2026-01-01',
            name: 'Año nuevo',
            description: null,
            isOpen: false,
            isRecurring: true,
            opensAt: null,
            closesAt: null,
            organizationSiteId: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
        sites={sites}
        canEdit={true}
        onCreated={jest.fn()}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(
      within(screen.getByTestId('exceptions-desktop-table')).getByRole('button', {
        name: 'Eliminar',
      }),
    );

    expect(screen.getByText('¿Eliminar este festivo o cierre especial?')).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => {
      expect(deleteExceptionMock).toHaveBeenCalledWith('exc-1');
      expect(onDeleted).toHaveBeenCalledWith('exc-1');
    });
    expect(screen.getByText('Festivo o cierre especial eliminado.')).toBeInTheDocument();
  });

  it('cancela la eliminación sin borrar la excepción', async () => {
    const onDeleted = jest.fn();
    deleteExceptionMock.mockResolvedValue(undefined);

    render(
      <CalendarExceptionsPanel
        exceptions={[
          {
            id: 'exc-1',
            exceptionDate: '2026-01-01',
            name: 'Año nuevo',
            description: null,
            isOpen: false,
            isRecurring: true,
            opensAt: null,
            closesAt: null,
            organizationSiteId: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
        sites={sites}
        canEdit={true}
        onCreated={jest.fn()}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(
      within(screen.getByTestId('exceptions-desktop-table')).getByRole('button', {
        name: 'Eliminar',
      }),
    );
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(deleteExceptionMock).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('oculta el alta y las acciones de fila en modo solo lectura', () => {
    render(
      <CalendarExceptionsPanel
        exceptions={[
          {
            id: 'exc-1',
            exceptionDate: '2026-01-01',
            name: 'Año nuevo',
            description: null,
            isOpen: false,
            isRecurring: true,
            opensAt: null,
            closesAt: null,
            organizationSiteId: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
        sites={sites}
        canEdit={false}
        onCreated={jest.fn()}
        onDeleted={jest.fn()}
      />,
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('exceptions-desktop-table')).getByText('Año nuevo'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Registrar fecha especial' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('muestra alerta de error cuando falla la creación de la excepción', async () => {
    createExceptionMock.mockRejectedValue(new Error('error'));

    render(
      <CalendarExceptionsPanel
        exceptions={[]}
        sites={sites}
        canEdit={true}
        onCreated={jest.fn()}
        onDeleted={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Registrar fecha especial' }));
    fireEvent.change(screen.getByLabelText('Nombre del cierre o apertura'), {
      target: { value: 'Apertura especial' },
    });
    fireEvent.change(screen.getByLabelText('Fecha afectada'), {
      target: { value: '2026-02-01' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Agregar festivo o cierre' }));

    await waitFor(() => {
      expect(
        screen.getByText('No fue posible crear el festivo o cierre especial. Intenta nuevamente.'),
      ).toBeInTheDocument();
    });
  });
});
