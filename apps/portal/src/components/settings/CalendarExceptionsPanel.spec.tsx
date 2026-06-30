import type { ChangeEvent } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      value,
      onChange,
      disabled,
    }: {
      id?: string;
      name?: string;
      value?: Date;
      onChange?: (date: Date | undefined) => void;
      disabled?: boolean;
    }) => (
      <input
        id={id}
        name={name}
        type="text"
        value={toInputDate(value)}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange?.(toDate(event.target.value))}
      />
    ),
  };
});

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
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '08:00' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '12:00' } });
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
    expect(screen.getByText('Año nuevo')).toBeInTheDocument();
    expect(screen.queryByTestId('exception-form')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar fecha especial' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar fecha especial' }));

    expect(screen.getByTestId('exception-form')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('bloquea aperturas especiales sin horas completas', () => {
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

    expect(screen.getByRole('button', { name: 'Agregar festivo o cierre' })).toBeDisabled();
  });

  it('bloquea el guardado si el horario de apertura especial es inválido', () => {
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
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '12:00' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '10:00' } });

    expect(screen.getByRole('button', { name: 'Agregar festivo o cierre' })).toBeDisabled();
  });
});
