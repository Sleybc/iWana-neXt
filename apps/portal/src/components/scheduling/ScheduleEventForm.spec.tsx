import type { ChangeEvent } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WfmWorkType } from '@iwana/shared';
import { ScheduleEventForm } from './ScheduleEventForm';

const useOperatingWindowMock = jest.fn();

jest.mock('./useOperatingWindow', () => ({
  useOperatingWindow: (...args: unknown[]) => useOperatingWindowMock(...args),
  getOperatingWindowMessage: (
    window: {
      status?: 'OPEN' | 'CLOSED';
      startTime?: string | null;
      endTime?: string | null;
      reason?: string | null;
    } | null,
  ) => {
    if (!window) {
      return null;
    }

    if (window.status === 'OPEN' && window.startTime && window.endTime) {
      return `Ventana operativa vigente: ${window.startTime} a ${window.endTime}.`;
    }

    return window.reason ?? null;
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
      label,
      value,
      onChange,
      options = [],
      placeholder,
      error,
      disabled,
    }: {
      id?: string;
      label?: string;
      value?: string;
      onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
      options?: Array<{ value: string; label: string }>;
      placeholder?: string;
      error?: string;
      disabled?: boolean;
    }) => (
      <div>
        {label && <label htmlFor={id}>{label}</label>}
        <select id={id} value={value} onChange={onChange} disabled={disabled}>
          <option value="">{placeholder ?? 'Selecciona'}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && <span>{error}</span>}
      </div>
    ),
    DatePicker: ({
      id,
      label,
      value,
      onChange,
      error,
      disabled,
    }: {
      id?: string;
      label?: string;
      value?: Date;
      onChange?: (date: Date | undefined) => void;
      error?: string;
      disabled?: boolean;
    }) => (
      <div>
        {label && <label htmlFor={id}>{label}</label>}
        <input
          id={id}
          type="text"
          value={toInputDate(value)}
          disabled={disabled}
          onChange={(event) => onChange?.(toDate(event.target.value))}
        />
        {error && <span>{error}</span>}
      </div>
    ),
  };
});

function buildTechnician() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'tecnico@demo.co',
    role: 'TECHNICIAN',
    status: 'ACTIVE',
    tenantId: 'tenant-1',
    mfaEnabled: true,
    mfaRequired: false,
    isOperationalResource: true,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
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

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Título operativo'), {
    target: { value: 'Visita técnica centro' },
  });
  fireEvent.change(screen.getByLabelText('Responsable'), {
    target: { value: '11111111-1111-4111-8111-111111111111' },
  });
}

describe('ScheduleEventForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useOperatingWindowMock.mockReturnValue({
      operatingWindow: {
        status: 'OPEN',
        source: 'COMPANY_HOURS',
        startTime: '07:00',
        endTime: '18:00',
        reason: null,
      },
      isLoadingOperatingWindow: false,
      operatingWindowError: null,
    });
  });

  it('valida campos requeridos antes de enviar', async () => {
    const onSubmit = jest.fn();

    render(
      <ScheduleEventForm
        technicians={[buildTechnician()]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));

    expect(await screen.findByText('El título es obligatorio.')).toBeInTheDocument();
    expect(screen.getByText('Selecciona un responsable válido.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('bloquea franjas menores a 15 minutos', async () => {
    const onSubmit = jest.fn();

    render(
      <ScheduleEventForm
        technicians={[buildTechnician()]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
        initialValues={{ durationMinutes: 0 }}
      />,
    );

    fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));

    expect(await screen.findByText('La duración mínima es de 15 minutos.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('exige resumen cuando se habilita orden de trabajo asociada', async () => {
    const onSubmit = jest.fn();

    render(
      <ScheduleEventForm
        technicians={[buildTechnician()]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
      />,
    );

    fillRequiredFields();
    fireEvent.click(screen.getByRole('checkbox', { name: /Crear orden de trabajo asociada/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));

    expect(await screen.findByText('Resume la orden de trabajo asociada.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rechaza coordenadas inválidas antes de enviar', async () => {
    const onSubmit = jest.fn();

    render(
      <ScheduleEventForm
        technicians={[buildTechnician()]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
      />,
    );

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('Coordenadas'), {
      target: { value: 'abc' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));

    expect(
      await screen.findByText(
        'Ingresa coordenadas válidas (latitud, longitud) — ej: 4.7110, -74.0721',
      ),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envía inicio y fin calculados al crear el evento', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(
      <ScheduleEventForm
        technicians={[buildTechnician()]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
        initialValues={{
          scheduledDateLocal: '2026-07-15',
          scheduledStartTimeLocal: '08:30',
          durationMinutes: 150,
        }}
      />,
    );

    fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledStartAt: new Date('2026-07-15T08:30').toISOString(),
          scheduledEndAt: new Date('2026-07-15T11:00').toISOString(),
        }),
      );
    });
  });

  it('usa la ventana operativa resuelta para filtrar horas de instalación', () => {
    useOperatingWindowMock.mockReturnValue({
      operatingWindow: {
        status: 'OPEN',
        source: 'SITE_HOURS',
        startTime: '09:00',
        endTime: '17:00',
        reason: null,
      },
      isLoadingOperatingWindow: false,
      operatingWindowError: null,
    });

    render(
      <ScheduleEventForm
        technicians={[buildTechnician()]}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
        initialValues={{
          type: WfmWorkType.INSTALLATION,
          scheduledStartTimeLocal: '06:30',
        }}
      />,
    );

    const timeSelect = screen.getByLabelText('Hora de llegada');

    expect(timeSelect).toHaveValue('09:00');
    expect(screen.queryByRole('option', { name: '08:45' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: '09:00' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '16:00' })).not.toBeInTheDocument();
  });

  it('no muestra el label legado Agendar tarea en el boton de envio', () => {
    render(
      <ScheduleEventForm
        technicians={[buildTechnician()]}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Agendar tarea' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear tarea' })).toBeInTheDocument();
  });
});
