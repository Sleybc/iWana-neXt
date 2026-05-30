import type { ChangeEvent } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { OperationalEventualitiesPanel } from './OperationalEventualitiesPanel';
import { CALENDAR_SETTINGS_COPY } from './mod00-settings-labels';

// ─── API mocks ───────────────────────────────────────────────────────────────

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockUpdateStatus = jest.fn();
const mockDelete = jest.fn();
const mockUsersList = jest.fn();

jest.mock('@/lib/api-client', () => ({
  wfmApi: {
    operationalEventualities: {
      list: (...args: unknown[]) => mockList(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
  usersApi: {
    list: (...args: unknown[]) => mockUsersList(...args),
  },
}));

jest.mock('@/components/shared/portal-ui', () => ({
  PortalPanel: ({
    children,
    title,
    description,
  }: {
    children: React.ReactNode;
    title: string;
    description?: string;
  }) => (
    <div data-testid="portal-panel">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children}
    </div>
  ),
  PortalEmptyState: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="portal-empty-state">
      {title} — {description}
    </div>
  ),
  PortalAlert: ({ title, description }: { title: string; description?: React.ReactNode }) => (
    <div data-testid="portal-alert">
      <span>{title}</span>
      {description ? <span>{description}</span> : null}
    </div>
  ),
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
      value,
      onChange,
      options = [],
      disabled,
      'data-testid': dataTestId,
    }: {
      id?: string;
      value?: string;
      onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
      options?: Array<{ value: string; label: string }>;
      disabled?: boolean;
      'data-testid'?: string;
    }) => (
      <select
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        data-testid={dataTestId}
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

jest.mock('./TimeFieldSelect', () => ({
  TimeFieldSelect: ({
    id,
    value,
    onChange,
    ariaLabel,
    disabled,
    dataTestId,
  }: {
    id?: string;
    value: string;
    onChange: (nextValue: string) => void;
    ariaLabel: string;
    disabled: boolean;
    dataTestId?: string;
  }) => (
    <input
      id={id}
      type="text"
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      data-testid={dataTestId}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
    />
  ),
}));

const useAuthMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_USER_AUTH = { id: 'user-admin', role: 'ADMIN', tenantSlug: 'tenant-test' };

const MOCK_USERS = [
  { id: 'tech-1', email: 'carlos@example.com', firstName: 'Carlos', lastName: 'Pérez' },
];

const MOCK_ITEMS = [
  {
    id: 'ev-1',
    tenantId: 'tenant-1',
    userId: 'tech-1',
    organizationSiteId: null,
    type: 'extra_availability',
    status: 'pending',
    startsAt: '2025-07-01T07:00:00.000Z',
    endsAt: '2025-07-01T09:00:00.000Z',
    reason: 'Refuerzo matutino',
    origin: null,
    requiresHrReview: false,
    createdById: 'user-admin',
    createdAt: '2025-07-01T00:00:00.000Z',
    updatedAt: '2025-07-01T00:00:00.000Z',
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('OperationalEventualitiesPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthMock.mockReturnValue({ user: MOCK_USER_AUTH, isLoading: false });
    mockList.mockResolvedValue(MOCK_ITEMS);
    mockUsersList.mockResolvedValue({ data: MOCK_USERS, meta: { total: 1 } });
  });

  describe('carga inicial', () => {
    it('muestra estado de carga y luego la tabla', async () => {
      render(<OperationalEventualitiesPanel canEdit={false} />);

      expect(screen.getByText('Cargando cambios puntuales de disponibilidad.')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByTestId('eventualities-table')).toBeInTheDocument();
      });
    });

    it('muestra empty state cuando no hay eventualidades', async () => {
      mockList.mockResolvedValue([]);

      render(<OperationalEventualitiesPanel canEdit={false} />);

      await waitFor(() => {
        expect(screen.getByTestId('portal-empty-state')).toBeInTheDocument();
      });
      expect(screen.getByText(/Sin cambios puntuales registrados/)).toBeInTheDocument();
    });

    it('muestra error cuando la carga falla', async () => {
      mockList.mockRejectedValue(new Error('Network error'));

      render(<OperationalEventualitiesPanel canEdit={false} />);

      await waitFor(() => {
        expect(
          screen.getByText(
            'No se pudieron cargar los cambios puntuales de disponibilidad. Intenta de nuevo.',
          ),
        ).toBeInTheDocument();
      });
    });

    it('oculta el alta cuando la carga inicial falla', async () => {
      mockList.mockRejectedValue(new Error('Network error'));

      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(
          screen.getByText(
            'No se pudieron cargar los cambios puntuales de disponibilidad. Intenta de nuevo.',
          ),
        ).toBeInTheDocument();
      });

      expect(screen.queryByTestId('add-eventuality-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('eventuality-form')).not.toBeInTheDocument();
    });

    it('oculta el alta cuando no hay usuarios disponibles para completar el formulario', async () => {
      mockUsersList.mockResolvedValue({ data: [], meta: { total: 0 } });

      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('eventualities-table')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('add-eventuality-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('eventuality-form')).not.toBeInTheDocument();
    });

    it('mantiene la tabla disponible si falla el directorio de personas y bloquea solo el alta', async () => {
      mockUsersList.mockRejectedValue(new Error('directory error'));

      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('eventualities-table')).toBeInTheDocument();
      });

      expect(
        screen.getByText(CALENDAR_SETTINGS_COPY.eventualitiesUsersUnavailableTitle),
      ).toBeInTheDocument();
      expect(
        screen.getByText(CALENDAR_SETTINGS_COPY.eventualitiesUsersUnavailableDescription),
      ).toBeInTheDocument();
      expect(
        screen.getByText(CALENDAR_SETTINGS_COPY.eventualitiesUnknownUserLabel),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('add-eventuality-btn')).not.toBeInTheDocument();
    });
  });

  describe('control de acceso', () => {
    it('muestra botón de registrar para usuarios con canEdit=true', async () => {
      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('add-eventuality-btn')).toBeInTheDocument();
      });
    });

    it('no muestra botón de registrar para usuarios con canEdit=false', async () => {
      render(<OperationalEventualitiesPanel canEdit={false} />);

      await waitFor(() => {
        expect(screen.queryByTestId('add-eventuality-btn')).not.toBeInTheDocument();
      });
    });

    it('no muestra columna de acciones con canEdit=false', async () => {
      render(<OperationalEventualitiesPanel canEdit={false} />);

      await waitFor(() => {
        expect(screen.queryByTestId(`confirm-eventuality-ev-1`)).not.toBeInTheDocument();
      });
    });
  });

  describe('formulario de creación', () => {
    it('muestra primero el listado y mantiene el formulario cerrado por defecto', async () => {
      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('eventualities-table')).toBeInTheDocument();
      });

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.queryByTestId('eventuality-form')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Registrar cambio puntual' })).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('add-eventuality-btn'));

      expect(screen.getByTestId('eventuality-form')).toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('expone el disclosure con aria y deja un solo control de cierre', async () => {
      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('add-eventuality-btn')).toBeInTheDocument();
      });

      const openButton = screen.getByRole('button', {
        name: CALENDAR_SETTINGS_COPY.eventualitiesShowFormAction,
      });

      expect(openButton).toHaveAttribute('aria-expanded', 'false');
      expect(openButton).toHaveAttribute('aria-controls', 'operational-eventuality-form-region');

      fireEvent.click(openButton);

      const closeButton = screen.getByRole('button', {
        name: CALENDAR_SETTINGS_COPY.eventualitiesHideFormAction,
      });

      expect(closeButton).toHaveAttribute('aria-expanded', 'true');
      expect(closeButton).toHaveAttribute('aria-controls', 'operational-eventuality-form-region');
      expect(screen.getByTestId('eventuality-form')).toHaveAttribute(
        'id',
        'operational-eventuality-form-region',
      );
      expect(
        screen.getAllByRole('button', { name: CALENDAR_SETTINGS_COPY.eventualitiesHideFormAction }),
      ).toHaveLength(1);
    });

    it('muestra el formulario al hacer clic en Registrar disponibilidad', async () => {
      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('add-eventuality-btn')).toBeInTheDocument();
      });

      expect(screen.getByText('Registrar cambio puntual')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('add-eventuality-btn'));

      expect(screen.getByTestId('eventuality-form')).toBeInTheDocument();
      expect(screen.getByLabelText('Persona afectada *')).toBeInTheDocument();
      expect(screen.getByLabelText('Tipo de ajuste *')).toBeInTheDocument();
      expect(screen.getByLabelText('Inicio del cambio *')).toBeInTheDocument();
      expect(screen.getByLabelText('Fin del cambio *')).toBeInTheDocument();
    });

    it('crea eventualidad con datos válidos', async () => {
      const newItem = { ...MOCK_ITEMS[0], id: 'ev-2' };
      mockCreate.mockResolvedValue(newItem);

      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('add-eventuality-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('add-eventuality-btn'));

      fireEvent.change(screen.getByLabelText('Persona afectada *'), {
        target: { value: 'tech-1' },
      });
      fireEvent.change(screen.getByLabelText('Tipo de ajuste *'), {
        target: { value: 'extra_availability' },
      });
      fireEvent.change(screen.getByLabelText('Inicio del cambio *'), {
        target: { value: '2025-07-01' },
      });
      fireEvent.change(screen.getByTestId('eventuality-starts-at-time'), {
        target: { value: '07:00' },
      });
      fireEvent.change(screen.getByLabelText('Fin del cambio *'), {
        target: { value: '2025-07-01' },
      });
      fireEvent.change(screen.getByTestId('eventuality-ends-at-time'), {
        target: { value: '09:00' },
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId('save-eventuality-btn'));
      });

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalledTimes(1);
      });
    });

    it('muestra error de validación cuando inicio >= fin', async () => {
      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('add-eventuality-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('add-eventuality-btn'));

      fireEvent.change(screen.getByLabelText('Persona afectada *'), {
        target: { value: 'tech-1' },
      });
      fireEvent.change(screen.getByLabelText('Tipo de ajuste *'), {
        target: { value: 'extra_availability' },
      });
      // Same time = invalid
      fireEvent.change(screen.getByLabelText('Inicio del cambio *'), {
        target: { value: '2025-07-01' },
      });
      fireEvent.change(screen.getByLabelText('Fin del cambio *'), {
        target: { value: '2025-07-01' },
      });
      fireEvent.change(screen.getByTestId('eventuality-starts-at-time'), {
        target: { value: '09:00' },
      });
      fireEvent.change(screen.getByTestId('eventuality-ends-at-time'), {
        target: { value: '07:00' },
      });

      fireEvent.click(screen.getByTestId('save-eventuality-btn'));

      expect(
        screen.getByText('La fecha de inicio debe ser anterior a la fecha de fin.'),
      ).toBeInTheDocument();
    });
  });

  describe('acciones sobre eventualidades', () => {
    it('confirma una eventualidad pendiente', async () => {
      mockUpdateStatus.mockResolvedValue({ ...MOCK_ITEMS[0], status: 'confirmed' });

      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('confirm-eventuality-ev-1')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId('confirm-eventuality-ev-1'));
      });

      expect(mockUpdateStatus).toHaveBeenCalledWith('ev-1', { status: 'confirmed' });
      expect(screen.getByText('Cambio puntual confirmado.')).toBeInTheDocument();
    });

    it('cancela una eventualidad pendiente', async () => {
      mockUpdateStatus.mockResolvedValue({ ...MOCK_ITEMS[0], status: 'cancelled' });

      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('cancel-eventuality-ev-1')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId('cancel-eventuality-ev-1'));
      });

      expect(mockUpdateStatus).toHaveBeenCalledWith('ev-1', { status: 'cancelled' });
      expect(screen.getByText('Cambio puntual cancelado.')).toBeInTheDocument();
    });

    it('limpia el error previo cuando un reintento de confirmación termina bien', async () => {
      mockUpdateStatus.mockRejectedValueOnce(new Error('error')).mockResolvedValueOnce({
        ...MOCK_ITEMS[0],
        status: 'confirmed',
      });

      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('confirm-eventuality-ev-1')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId('confirm-eventuality-ev-1'));
      });

      expect(screen.getByText('No se pudo actualizar el estado.')).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByTestId('confirm-eventuality-ev-1'));
      });

      expect(screen.queryByText('No se pudo actualizar el estado.')).not.toBeInTheDocument();
      expect(screen.getByText('Cambio puntual confirmado.')).toBeInTheDocument();
    });

    it('pide confirmación antes de eliminar y muestra feedback al completar', async () => {
      const originalConfirm = globalThis.confirm;
      globalThis.confirm = jest.fn(() => true);
      mockList.mockResolvedValue([{ ...MOCK_ITEMS[0], status: 'confirmed' }]);
      mockDelete.mockResolvedValue(undefined);

      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('delete-eventuality-ev-1')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId('delete-eventuality-ev-1'));
      });

      expect(globalThis.confirm).toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalledWith('ev-1');
      expect(screen.getByText('Cambio puntual eliminado.')).toBeInTheDocument();

      globalThis.confirm = originalConfirm;
    });

    it('bloquea las acciones de fila mientras una actualización está en curso', async () => {
      let resolveUpdate: ((value: unknown) => void) | null = null;
      mockUpdateStatus.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpdate = resolve;
          }),
      );

      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('confirm-eventuality-ev-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('confirm-eventuality-ev-1'));

      expect(screen.getByTestId('confirm-eventuality-ev-1')).toBeDisabled();
      expect(screen.getByTestId('cancel-eventuality-ev-1')).toBeDisabled();

      await act(async () => {
        resolveUpdate?.({ ...MOCK_ITEMS[0], status: 'confirmed' });
      });

      await waitFor(() => {
        expect(screen.queryByTestId('confirm-eventuality-ev-1')).not.toBeInTheDocument();
      });
    });
  });
});
