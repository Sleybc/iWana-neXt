import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BusinessHoursWeekday, OrganizationSiteType } from '@iwana/shared';
import { CalendarSiteHoursPanel } from './CalendarSiteHoursPanel';

jest.mock('@iwana/ui', () => {
  const actual = jest.requireActual('@iwana/ui');
  return {
    ...actual,
    Select: React.forwardRef(
      (
        {
          id,
          value,
          onChange,
          options,
          disabled,
          'aria-describedby': ariaDescribedBy,
          'aria-label': ariaLabel,
        }: {
          id?: string;
          value?: string;
          onChange?: React.ChangeEventHandler<HTMLSelectElement>;
          options?: Array<{ value: string; label: string }>;
          disabled?: boolean;
          'aria-describedby'?: string;
          'aria-label'?: string;
        },
        ref: React.ForwardedRef<HTMLSelectElement>,
      ) => (
        <select
          id={id}
          ref={ref}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          value={value ?? ''}
          onChange={onChange}
          disabled={disabled}
        >
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ),
    ),
  };
});

const getMock = jest.fn();
const replaceBusinessHoursMock = jest.fn();
const clearSiteOverrideMock = jest.fn();

jest.mock('@/lib/api-client', () => ({
  organizationApi: {
    get: (...args: unknown[]) => getMock(...args),
    replaceBusinessHours: (...args: unknown[]) => replaceBusinessHoursMock(...args),
    clearSiteOverride: (...args: unknown[]) => clearSiteOverrideMock(...args),
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
      days: Array<{
        weekday: string;
        opensAt: string | null;
        closesAt: string | null;
        isOpen?: boolean;
      }>;
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
        <output data-testid="site-draft">{JSON.stringify(days)}</output>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() =>
            onChange([
              {
                weekday: 'MONDAY',
                isOpen: true,
                opensAt: '10:00',
                closesAt: '19:00',
              },
            ])
          }
        >
          Cambiar draft de sede
        </button>
      </div>
    ),
  };
});

const baseSite = {
  id: 'site-1',
  name: 'Sede centro',
  code: 'CENTRO',
  capabilities: [],
  isActive: true,
  siteType: OrganizationSiteType.OFFICE,
  address: null,
  municipality: null,
  department: null,
};

function buildSiteDetail(siteId: string, opensAt: string) {
  return {
    id: siteId,
    name: siteId === 'site-2' ? 'Sede norte' : 'Sede centro',
    code: siteId === 'site-2' ? 'NORTE' : 'CENTRO',
    capabilities: [],
    isActive: true,
    siteType: 'OFFICE',
    address: null,
    municipality: null,
    department: null,
    isPrimary: siteId === 'site-1',
    businessHours: [
      {
        weekday: BusinessHoursWeekday.MONDAY,
        isOpen: true,
        opensAt,
        closesAt: '18:00',
      },
    ],
    businessHoursResolved: [],
    businessHoursMode: 'BASE' as const,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('CalendarSiteHoursPanel', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('mantiene visible la edición semanal mientras el selector queda como toolbar compacta', async () => {
    getMock.mockResolvedValueOnce(buildSiteDetail('site-1', '08:00'));

    const { rerender } = render(<CalendarSiteHoursPanel sites={[baseSite]} canEdit={true} />);

    expect(screen.getByRole('combobox', { name: 'Sede' })).toHaveTextContent(
      'Sede centro (CENTRO)',
    );
    expect(
      screen.getByText(
        'Elige una sede para revisar si usa el horario base o si necesita un horario propio.',
      ),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('site-draft')).toHaveTextContent('08:00');
    });

    expect(screen.getByText('Sede seleccionada')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Sede centro (CENTRO)', level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Usa el horario base')).toBeInTheDocument();
    expect(screen.getByText('Usa el horario base').closest('[role="status"]')).toBeNull();
    expect(screen.getByTestId('site-draft')).toHaveTextContent('08:00');

    rerender(<CalendarSiteHoursPanel sites={[{ ...baseSite }]} canEdit={true} />);

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('site-draft')).toHaveTextContent('08:00');
    });
  });

  it('resetea la selección cuando la sede activa deja de existir en las props', async () => {
    getMock.mockResolvedValueOnce(buildSiteDetail('site-1', '08:00'));
    getMock.mockResolvedValueOnce(buildSiteDetail('site-2', '10:00'));
    getMock.mockResolvedValueOnce(buildSiteDetail('site-1', '11:00'));

    const { rerender } = render(
      <CalendarSiteHoursPanel
        sites={[baseSite, { ...baseSite, id: 'site-2', name: 'Sede norte', code: 'NORTE' }]}
        canEdit={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Sede' })).toHaveTextContent(
        'Sede centro (CENTRO)',
      );
      expect(screen.getByTestId('site-draft')).toHaveTextContent('08:00');
    });

    fireEvent.change(screen.getByLabelText('Sede'), { target: { value: 'site-2' } });

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Sede' })).toHaveTextContent(
        'Sede norte (NORTE)',
      );
      expect(screen.getByTestId('site-draft')).toHaveTextContent('10:00');
    });

    rerender(<CalendarSiteHoursPanel sites={[{ ...baseSite }]} canEdit={true} />);

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Sede' })).toHaveTextContent(
        'Sede centro (CENTRO)',
      );
      expect(screen.getByTestId('site-draft')).toHaveTextContent('11:00');
    });
  });

  it('relega la acción de volver al horario base cuando la sede usa horario propio', async () => {
    getMock.mockResolvedValueOnce({
      ...buildSiteDetail('site-1', '08:00'),
      businessHoursMode: 'OVERRIDE' as const,
    });

    render(<CalendarSiteHoursPanel sites={[baseSite]} canEdit={true} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Volver al horario base' })).toBeInTheDocument();
    });

    expect(screen.getByText('Horario propio activo')).toBeInTheDocument();
    expect(screen.getByText('Horario propio activo').closest('[role="alert"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Guardar horario de la sede' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver al horario base' })).toBeInTheDocument();
  });

  it('muestra una señal de carga y permite reintentar si falla el detalle de la sede', async () => {
    const firstLoad = createDeferred<ReturnType<typeof buildSiteDetail>>();

    getMock.mockImplementationOnce(() => firstLoad.promise);
    getMock.mockResolvedValueOnce(buildSiteDetail('site-1', '08:00'));

    render(<CalendarSiteHoursPanel sites={[baseSite]} canEdit={true} />);

    expect(screen.getByText('Cargando detalle de la sede seleccionada.')).toBeInTheDocument();
    expect(screen.getByLabelText('Sede')).toHaveAttribute(
      'aria-describedby',
      'calendar-site-selector-hint calendar-site-selector-status',
    );

    await act(async () => {
      firstLoad.reject(new Error('error'));
      try {
        await firstLoad.promise;
      } catch {
        // Ignorado: el componente ya transforma este fallo en feedback visible.
      }
    });

    await waitFor(() => {
      expect(
        screen.getByText('No fue posible cargar el detalle de la sede. Intenta nuevamente.'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Reintentar detalle de la sede' }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar detalle de la sede' }));

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('site-draft')).toHaveTextContent('08:00');
    });
  });

  it('guarda el horario de la sede y muestra feedback accesible', async () => {
    replaceBusinessHoursMock.mockResolvedValueOnce(buildSiteDetail('site-1', '08:00'));
    getMock.mockResolvedValueOnce(buildSiteDetail('site-1', '08:00'));

    render(<CalendarSiteHoursPanel sites={[baseSite]} canEdit={true} />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Guardar horario de la sede' }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar draft de sede' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horario de la sede' }));

    await waitFor(() => {
      expect(replaceBusinessHoursMock).toHaveBeenCalledWith('site-1', {
        businessHours: [
          {
            weekday: 'MONDAY',
            isOpen: true,
            opensAt: '10:00',
            closesAt: '19:00',
          },
        ],
      });
      expect(screen.getByText('Horario personalizado guardado correctamente.')).toBeInTheDocument();
    });
  });

  it('bloquea el selector mientras guarda para evitar mezclar sedes durante la mutación', async () => {
    const saveDeferred = createDeferred<ReturnType<typeof buildSiteDetail>>();

    getMock.mockResolvedValueOnce(buildSiteDetail('site-1', '08:00'));
    replaceBusinessHoursMock.mockImplementationOnce(() => saveDeferred.promise);

    render(
      <CalendarSiteHoursPanel
        sites={[baseSite, { ...baseSite, id: 'site-2', name: 'Sede norte', code: 'NORTE' }]}
        canEdit={true}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Guardar horario de la sede' }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar horario de la sede' }));

    expect(screen.getByLabelText('Sede')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cambiar draft de sede' })).toBeDisabled();

    await act(async () => {
      saveDeferred.resolve(buildSiteDetail('site-1', '08:00'));
      await saveDeferred.promise;
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Sede')).not.toBeDisabled();
    });
  });

  it('permite volver al horario base y confirma el cambio con feedback visible', async () => {
    const originalConfirm = globalThis.confirm;
    globalThis.confirm = jest.fn(() => true);

    getMock.mockResolvedValueOnce({
      ...buildSiteDetail('site-1', '08:00'),
      businessHoursMode: 'OVERRIDE' as const,
    });
    clearSiteOverrideMock.mockResolvedValueOnce({
      ...buildSiteDetail('site-1', '08:00'),
      businessHoursMode: 'BASE' as const,
    });

    render(<CalendarSiteHoursPanel sites={[baseSite]} canEdit={true} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Volver al horario base' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Volver al horario base' }));

    await waitFor(() => {
      expect(globalThis.confirm).toHaveBeenCalled();
      expect(clearSiteOverrideMock).toHaveBeenCalledWith('site-1');
      expect(
        screen.getByText('La sede volvió a usar el horario general de la empresa.'),
      ).toBeInTheDocument();
    });

    globalThis.confirm = originalConfirm;
  });

  it('oculta las acciones cuando el panel está en solo lectura', async () => {
    getMock.mockResolvedValueOnce({
      ...buildSiteDetail('site-1', '08:00'),
      businessHoursMode: 'OVERRIDE' as const,
    });

    render(<CalendarSiteHoursPanel sites={[baseSite]} canEdit={false} />);

    await waitFor(() => {
      expect(screen.getByText('Horario propio activo')).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', { name: 'Guardar horario de la sede' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Volver al horario base' }),
    ).not.toBeInTheDocument();
  });

  it('muestra estado vacío cuando no hay sedes registradas', () => {
    render(<CalendarSiteHoursPanel sites={[]} canEdit={true} />);

    expect(screen.getByText('Sin sedes registradas')).toBeInTheDocument();
    expect(
      screen.getByText('Crea al menos una sede para configurar su horario.'),
    ).toBeInTheDocument();
  });

  it('ignora respuestas antiguas cuando cambia la sede seleccionada antes de que termine la carga previa', async () => {
    const firstLoad = createDeferred<ReturnType<typeof buildSiteDetail>>();
    const secondLoad = createDeferred<ReturnType<typeof buildSiteDetail>>();

    getMock.mockImplementationOnce(() => firstLoad.promise);
    getMock.mockImplementationOnce(() => secondLoad.promise);

    render(
      <CalendarSiteHoursPanel
        sites={[baseSite, { ...baseSite, id: 'site-2', name: 'Sede norte', code: 'NORTE' }]}
        canEdit={true}
      />,
    );

    fireEvent.change(screen.getByLabelText('Sede'), { target: { value: 'site-2' } });

    await act(async () => {
      secondLoad.resolve(buildSiteDetail('site-2', '10:00'));
      await secondLoad.promise;
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Sede' })).toHaveTextContent(
        'Sede norte (NORTE)',
      );
      expect(screen.getByTestId('site-draft')).toHaveTextContent('10:00');
    });

    await act(async () => {
      firstLoad.resolve(buildSiteDetail('site-1', '08:00'));
      await firstLoad.promise;
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Sede' })).toHaveTextContent(
        'Sede norte (NORTE)',
      );
      expect(screen.getByTestId('site-draft')).toHaveTextContent('10:00');
      expect(screen.getByTestId('site-draft')).not.toHaveTextContent('08:00');
    });
  });

  it('oculta acciones y detalle anterior mientras carga la nueva sede seleccionada', async () => {
    const secondLoad = createDeferred<ReturnType<typeof buildSiteDetail>>();

    getMock.mockResolvedValueOnce(buildSiteDetail('site-1', '08:00'));
    getMock.mockImplementationOnce(() => secondLoad.promise);

    render(
      <CalendarSiteHoursPanel
        sites={[baseSite, { ...baseSite, id: 'site-2', name: 'Sede norte', code: 'NORTE' }]}
        canEdit={true}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Guardar horario de la sede' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Sede centro (CENTRO)', level: 3 }),
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Sede'), { target: { value: 'site-2' } });

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Guardar horario de la sede' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Sede centro (CENTRO)', level: 3 }),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Cargando detalle de la sede seleccionada.')).toBeInTheDocument();
    });

    await act(async () => {
      secondLoad.resolve(buildSiteDetail('site-2', '10:00'));
      await secondLoad.promise;
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Guardar horario de la sede' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Sede norte (NORTE)', level: 3 }),
      ).toBeInTheDocument();
    });
  });
});
