import type { ChangeEvent } from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import { emptyPageListMeta } from '@/lib/list-meta';
import { OperationalEventualitiesPanel } from './OperationalEventualitiesPanel';
import { CALENDAR_SETTINGS_COPY } from './mod00-settings-labels';

// ─── API mocks ───────────────────────────────────────────────────────────────

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockUpdateStatus = jest.fn();
const mockDelete = jest.fn();
const mockUsersList = jest.fn();
const useAuthMock = jest.fn();
const pushMock = jest.fn();
const replaceMock = jest.fn();
let searchParamsMock = new URLSearchParams();
const routerMock = {
  push: (...args: unknown[]) => pushMock(...args),
  replace: (...args: unknown[]) => replaceMock(...args),
};

jest.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/dashboard/settings/calendar',
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

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
  PortalAlert: ({
    title,
    description,
    action,
  }: {
    title: string;
    description?: React.ReactNode;
    action?: React.ReactNode;
  }) => (
    <div data-testid="portal-alert">
      <span>{title}</span>
      {description ? <span>{description}</span> : null}
      {action}
    </div>
  ),
  PortalTablePager: ({
    page,
    pageCount,
    onPageChange,
    pageSizeControl,
  }: {
    page: number;
    pageCount: number;
    onPageChange: (page: number) => void;
    pageSizeControl?: React.ReactNode;
  }) => (
    <div data-testid="portal-table-pager">
      <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))}>
        Anterior
      </button>
      <span>{`Página ${page} de ${pageCount}`}</span>
      <button type="button" onClick={() => onPageChange(Math.min(pageCount, page + 1))}>
        Siguiente
      </button>
      {pageSizeControl}
    </div>
  ),
  PortalPageSizeSelect: ({
    value,
    onChange,
  }: {
    value: number;
    onChange: (value: number) => void;
  }) => (
    <select
      data-testid="portal-page-size"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      <option value={10}>10</option>
      <option value={20}>20</option>
      <option value={50}>50</option>
    </select>
  ),
  PortalSkeletonBlock: ({ className }: { className?: string }) => (
    <div data-testid="portal-skeleton-block" className={className} />
  ),
  PortalDataTableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  portalDataTableShellClassName: 'portal-table-shell',
  portalDataTableHeadRowClassName: 'portal-table-head-row',
  portalDataTableBodyClassName: 'portal-table-body',
  portalDataTableCellClassName: 'portal-table-cell',
  portalCheckboxClassName: 'portal-checkbox',
  portalFieldClassName: 'portal-field',
  portalSelectTriggerClassName: 'portal-select-trigger',
  portalWellClassName: 'portal-well',
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
    searchParamsMock = new URLSearchParams();
    useAuthMock.mockReturnValue({ user: MOCK_USER_AUTH, isLoading: false });
    mockList.mockResolvedValue({
      data: MOCK_ITEMS,
      meta: emptyPageListMeta({
        page: 1,
        limit: 20,
        total: MOCK_ITEMS.length,
        totalPages: 1,
        hasMore: false,
      }),
    });
    mockUsersList.mockResolvedValue({ data: MOCK_USERS, meta: { total: 1 } });
  });

  describe('carga inicial', () => {
    it('muestra estado de carga y luego la tabla', async () => {
      render(<OperationalEventualitiesPanel canEdit={false} />);

      expect(screen.getByTestId('portal-skeleton-block')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByTestId('eventualities-table')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('portal-skeleton-block')).not.toBeInTheDocument();
      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
      expect(mockList).toHaveBeenCalledTimes(1);
    });

    it('no presenta violaciones de accesibilidad con el panel real', async () => {
      const { container } = render(<OperationalEventualitiesPanel canEdit={false} />);

      await waitFor(() => {
        expect(screen.getByTestId('eventualities-table')).toBeInTheDocument();
      });

      expect(await axe(container)).toHaveNoViolations();
    });

    it('hace una sola llamada inicial aunque cambie el modo de acceso del listado', async () => {
      mockList.mockResolvedValueOnce({
        data: MOCK_ITEMS,
        meta: {
          ...emptyPageListMeta({ page: 1, limit: 20, total: 1, totalPages: 1, hasMore: false }),
          capabilities: { randomAccess: false, sortableFields: [] },
        },
      });

      render(<OperationalEventualitiesPanel canEdit={false} />);

      await waitFor(() => {
        expect(screen.getByTestId('eventualities-table')).toBeInTheDocument();
      });

      expect(mockList).toHaveBeenCalledTimes(1);
    });

    it('muestra estado vacío cuando no hay cambios puntuales', async () => {
      mockList.mockResolvedValue({
        data: [],
        meta: emptyPageListMeta({ page: 1, limit: 20, total: 0, totalPages: 0, hasMore: false }),
      });

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
        within(screen.getByTestId('eventualities-desktop-table')).getByText(
          CALENDAR_SETTINGS_COPY.eventualitiesUnknownUserLabel,
        ),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('add-eventuality-btn')).not.toBeInTheDocument();
    });
  });

  it('distingue error de estado vacío y permite reintentar el listado', async () => {
    mockList.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({
      data: MOCK_ITEMS,
      meta: emptyPageListMeta({ page: 1, limit: 20, total: 1, totalPages: 1, hasMore: false }),
    });

    render(<OperationalEventualitiesPanel canEdit={false} />);

    await waitFor(() => expect(screen.getByTestId('portal-alert')).toBeInTheDocument());
    expect(screen.queryByTestId('portal-empty-state')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('portal-alert')).toHaveLength(1);
    expect(screen.queryByTestId('eventualities-load-error-state')).not.toBeInTheDocument();

    const retry = screen.getAllByRole('button', { name: 'Reintentar' })[0];
    expect(retry).toBeDefined();
    fireEvent.click(retry!);

    await waitFor(() => expect(screen.getByTestId('eventualities-table')).toBeInTheDocument());
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

  it('muestra una lista apilada en mobile con horario, alcance, estado y acciones operables', async () => {
    render(<OperationalEventualitiesPanel canEdit={true} />);

    await waitFor(() => {
      expect(screen.getByTestId('eventualities-mobile-list')).toBeInTheDocument();
    });

    const mobileList = screen.getByTestId('eventualities-mobile-list');
    const mobileCard = within(mobileList).getByTestId('eventuality-mobile-card-ev-1');
    expect(mobileCard).toHaveTextContent('Carlos Pérez');
    expect(mobileCard).toHaveTextContent('Organización');
    expect(mobileCard).toHaveTextContent('Pendiente');
    expect(within(mobileCard).getByRole('button', { name: 'Confirmar' })).toHaveClass('min-h-11');
    expect(within(mobileCard).getByRole('button', { name: 'Cancelar' })).toHaveClass('min-h-11');
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

    it('crea un cambio puntual con datos válidos', async () => {
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

  describe('acciones sobre cambios puntuales', () => {
    it('protege el listado si el servidor declara randomAccess=false sin contrato cursor', async () => {
      mockList.mockResolvedValueOnce({
        data: MOCK_ITEMS,
        meta: {
          ...emptyPageListMeta({
            page: null,
            limit: 20,
            total: 2,
            totalPages: null,
            hasMore: true,
          }),
          mode: 'cursor',
          capabilities: { randomAccess: false, sortableFields: [] },
          nextCursor: 'cursor-no-admitido-por-el-cliente',
        },
      });

      render(<OperationalEventualitiesPanel canEdit={false} />);

      await waitFor(() =>
        expect(
          screen.getByText(CALENDAR_SETTINGS_COPY.eventualitiesCursorUnavailable),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
      expect(mockList).toHaveBeenCalledTimes(1);
    });

    it('confirma un cambio puntual pendiente', async () => {
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

    it('cancela un cambio puntual pendiente', async () => {
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

    it('pide confirmación en el diálogo antes de eliminar y muestra feedback al completar', async () => {
      mockList.mockResolvedValue({
        data: [{ ...MOCK_ITEMS[0], status: 'confirmed' }],
        meta: emptyPageListMeta({
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasMore: false,
        }),
      });
      mockDelete.mockResolvedValue(undefined);

      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('delete-eventuality-ev-1')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId('delete-eventuality-ev-1'));
      });

      expect(
        screen.getByText('¿Eliminar este cambio puntual de disponibilidad?'),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
      ).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
        );
      });

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith('ev-1');
        expect(screen.getByText('Cambio puntual eliminado.')).toBeInTheDocument();
      });
    });

    it('cancela la eliminación en el diálogo sin borrar el cambio puntual', async () => {
      mockList.mockResolvedValue({
        data: [{ ...MOCK_ITEMS[0], status: 'confirmed' }],
        meta: emptyPageListMeta({
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasMore: false,
        }),
      });
      mockDelete.mockResolvedValue(undefined);

      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('delete-eventuality-ev-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('delete-eventuality-ev-1'));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('muestra alerta de error cuando falla la creación', async () => {
      mockCreate.mockRejectedValue(new Error('error'));

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
        expect(screen.getByText('No se pudo registrar el cambio puntual.')).toBeInTheDocument();
      });
    });

    it('muestra alerta de error cuando falla la eliminación', async () => {
      mockList.mockResolvedValue({
        data: [{ ...MOCK_ITEMS[0], status: 'confirmed' }],
        meta: emptyPageListMeta({
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasMore: false,
        }),
      });
      mockDelete.mockRejectedValue(new Error('error'));

      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('delete-eventuality-ev-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('delete-eventuality-ev-1'));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }));

      await waitFor(() => {
        expect(screen.getByText('No se pudo eliminar el cambio puntual.')).toBeInTheDocument();
      });
    });

    it('navega con el paginador y solicita la página indicada', async () => {
      mockList.mockResolvedValue({
        data: MOCK_ITEMS,
        meta: emptyPageListMeta({
          page: 1,
          limit: 20,
          total: 3,
          totalPages: 2,
          hasMore: true,
        }),
      });

      const { rerender } = render(<OperationalEventualitiesPanel canEdit={false} />);

      await waitFor(() => {
        expect(screen.getByTestId('eventualities-table')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

      // setPage escribe en la URL (history.push) con el namespace de la tabla
      await waitFor(() => {
        expect(pushMock).toHaveBeenCalled();
      });
      expect(String(pushMock.mock.calls[0]?.[0])).toContain('eventualities.page=2');

      mockList.mockResolvedValue({
        data: [{ ...MOCK_ITEMS[0], id: 'ev-2' }],
        meta: emptyPageListMeta({
          page: 2,
          limit: 20,
          total: 3,
          totalPages: 2,
          hasMore: true,
        }),
      });
      searchParamsMock = new URLSearchParams('eventualities.page=2');
      rerender(<OperationalEventualitiesPanel canEdit={false} />);

      await waitFor(() => {
        expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, limit: 20 }));
      });

      fireEvent.click(await screen.findByRole('button', { name: 'Anterior' }));

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledTimes(2);
      });
      // Volver a página 1 limpia el parámetro de la URL (default del hook)
      expect(String(pushMock.mock.calls[1]?.[0])).not.toContain('page=');

      searchParamsMock = new URLSearchParams('');
      rerender(<OperationalEventualitiesPanel canEdit={false} />);

      await waitFor(() => {
        expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
      });
    });

    it('cambia el tamaño de página con el selector y recarga el listado', async () => {
      mockList.mockResolvedValue({
        data: MOCK_ITEMS,
        meta: emptyPageListMeta({
          page: 1,
          limit: 20,
          total: 25,
          totalPages: 2,
          hasMore: true,
        }),
      });

      const { rerender } = render(<OperationalEventualitiesPanel canEdit={false} />);

      await waitFor(() => {
        expect(screen.getByTestId('portal-page-size')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('portal-page-size'), {
        target: { value: '50' },
      });

      // setPageSize escribe en la URL (history.replace) y resetea a página 1
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalled();
      });
      expect(String(replaceMock.mock.calls[0]?.[0])).toContain('eventualities.size=50');

      searchParamsMock = new URLSearchParams('eventualities.size=50');
      rerender(<OperationalEventualitiesPanel canEdit={false} />);

      await waitFor(() => {
        expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, limit: 50 }));
      });
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
