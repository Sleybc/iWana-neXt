import type { ChangeEvent, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WfmWorkType } from '@iwana/shared';
import { RescheduleEventDialog } from './RescheduleEventDialog';

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
    Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
      open ? <div>{children}</div> : null,
    DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DialogClose: ({ children }: { children: ReactNode }) => <>{children}</>,
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

function buildEvent(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'evt-001',
    tenantId: 'tenant-wfm-001',
    workOrderId: 'wo-001',
    type: WfmWorkType.INSTALLATION,
    status: 'SCHEDULED',
    title: 'Alta fibra barrio sur',
    description: 'Cliente listo para visita.',
    scheduledStartAt: new Date('2026-06-03T08:00').toISOString(),
    scheduledEndAt: new Date('2026-06-03T10:00').toISOString(),
    assignedUserId: '11111111-1111-4111-8111-111111111111',
    assignedTeamId: null,
    address: 'Cra 10 # 10 - 10',
    municipality: 'Bogotá',
    latitude: null,
    longitude: null,
    expedienteId: null,
    subscriberId: null,
    ticketId: 'TK-001',
    contractId: null,
    createdBy: 'admin-001',
    updatedBy: 'admin-001',
    createdAt: '2026-06-01T08:00:00.000Z',
    updatedAt: '2026-06-01T08:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('RescheduleEventDialog', () => {
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

  it('hidrata la nueva franja operativa desde el evento', async () => {
    render(
      <RescheduleEventDialog
        open
        event={buildEvent() as never}
        onOpenChange={jest.fn()}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error={null}
      />,
    );

    expect(screen.getByLabelText('Fecha de visita')).toHaveValue('2026-06-03');
    expect(screen.getByLabelText('Hora de llegada')).toHaveValue('08:00');
    expect(screen.getByDisplayValue('2026-06-03 10:00')).toBeInTheDocument();
  });

  it('bloquea duraciones menores a 15 minutos', async () => {
    const onSubmit = jest.fn();

    render(
      <RescheduleEventDialog
        open
        event={
          buildEvent({
            scheduledStartAt: new Date('2026-06-03T08:00').toISOString(),
            scheduledEndAt: new Date('2026-06-03T08:10').toISOString(),
          }) as never
        }
        onOpenChange={jest.fn()}
        onSubmit={onSubmit}
        isSubmitting={false}
        error={null}
      />,
    );

    fireEvent.change(screen.getByLabelText('Motivo'), {
      target: { value: 'Cliente pidió cambio' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nueva franja' }));

    expect(await screen.findByText('La duración mínima es de 15 minutos.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('permite ajustar una duración rápida y recalcula el fin', async () => {
    render(
      <RescheduleEventDialog
        open
        event={buildEvent() as never}
        onOpenChange={jest.fn()}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '2 h 30 min' }));

    expect(screen.getByDisplayValue('2026-06-03 10:30')).toBeInTheDocument();
  });

  it('envía inicio y fin calculados al reagendar', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(
      <RescheduleEventDialog
        open
        event={buildEvent() as never}
        onOpenChange={jest.fn()}
        onSubmit={onSubmit}
        isSubmitting={false}
        error={null}
      />,
    );

    fireEvent.change(screen.getByLabelText('Hora de llegada'), {
      target: { value: '09:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: '2 h' }));
    fireEvent.change(screen.getByLabelText('Motivo'), {
      target: { value: '  Cliente solicitó mover la visita  ' },
    });
    fireEvent.change(screen.getByLabelText('Notas adicionales'), {
      target: { value: '  Confirmado por llamada.  ' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar nueva franja' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        scheduledStartAt: new Date('2026-06-03T09:00').toISOString(),
        scheduledEndAt: new Date('2026-06-03T11:00').toISOString(),
        reason: 'Cliente solicitó mover la visita',
        notes: 'Confirmado por llamada.',
      });
    });
  });

  it('usa la ventana operativa resuelta para filtrar horas de reagenda', () => {
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
      <RescheduleEventDialog
        open
        event={
          buildEvent({
            scheduledStartAt: new Date('2026-06-03T08:30').toISOString(),
            scheduledEndAt: new Date('2026-06-03T10:30').toISOString(),
          }) as never
        }
        onOpenChange={jest.fn()}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error={null}
      />,
    );

    const timeSelect = screen.getByLabelText('Hora de llegada');

    expect(timeSelect).toHaveValue('09:00');
    expect(screen.queryByRole('option', { name: '08:45' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: '09:00' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '16:00' })).not.toBeInTheDocument();
  });
});
