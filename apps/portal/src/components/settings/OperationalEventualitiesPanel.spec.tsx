import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { OperationalEventualitiesPanel } from './OperationalEventualitiesPanel';

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

      expect(screen.getByText('Cargando eventualidades…')).toBeInTheDocument();

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
      expect(screen.getByText(/Sin cambios registrados/)).toBeInTheDocument();
    });

    it('muestra error cuando la carga falla', async () => {
      mockList.mockRejectedValue(new Error('Network error'));

      render(<OperationalEventualitiesPanel canEdit={false} />);

      await waitFor(() => {
        expect(
          screen.getByText('No se pudo cargar la información. Intenta de nuevo.'),
        ).toBeInTheDocument();
      });
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
    it('muestra el formulario al hacer clic en Registrar disponibilidad', async () => {
      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('add-eventuality-btn')).toBeInTheDocument();
      });

      expect(screen.getByText('+ Registrar disponibilidad')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('add-eventuality-btn'));

      expect(screen.getByTestId('eventuality-user-select')).toBeInTheDocument();
      expect(screen.getByTestId('eventuality-type-select')).toBeInTheDocument();
      expect(screen.getByTestId('eventuality-starts-at')).toBeInTheDocument();
      expect(screen.getByTestId('eventuality-ends-at')).toBeInTheDocument();
    });

    it('crea eventualidad con datos válidos', async () => {
      const newItem = { ...MOCK_ITEMS[0], id: 'ev-2' };
      mockCreate.mockResolvedValue(newItem);

      render(<OperationalEventualitiesPanel canEdit={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('add-eventuality-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('add-eventuality-btn'));

      fireEvent.change(screen.getByTestId('eventuality-user-select'), {
        target: { value: 'tech-1' },
      });
      fireEvent.change(screen.getByTestId('eventuality-type-select'), {
        target: { value: 'extra_availability' },
      });
      fireEvent.change(screen.getByTestId('eventuality-starts-at'), {
        target: { value: '2025-07-01T07:00' },
      });
      fireEvent.change(screen.getByTestId('eventuality-ends-at'), {
        target: { value: '2025-07-01T09:00' },
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

      fireEvent.change(screen.getByTestId('eventuality-user-select'), {
        target: { value: 'tech-1' },
      });
      fireEvent.change(screen.getByTestId('eventuality-type-select'), {
        target: { value: 'extra_availability' },
      });
      // Same time = invalid
      fireEvent.change(screen.getByTestId('eventuality-starts-at'), {
        target: { value: '2025-07-01T09:00' },
      });
      fireEvent.change(screen.getByTestId('eventuality-ends-at'), {
        target: { value: '2025-07-01T07:00' },
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
    });
  });
});
