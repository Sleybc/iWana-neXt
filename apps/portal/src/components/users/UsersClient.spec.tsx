import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UserRole, UserStatus } from '@iwana/shared';
import { UsersClient } from './UsersClient';
import { EMPTY_LIST_META } from '@/lib/list-meta';

const listMock = jest.fn();
const createMock = jest.fn();
const updateMock = jest.fn();
const replaceUserProfilesMock = jest.fn();
const resetPasswordMock = jest.fn();
const listPermissionsMock = jest.fn();
const listProfilesMock = jest.fn();
const getEffectivePermissionsMock = jest.fn();
const useAuthMock = jest.fn();

let mockSearchParams = new URLSearchParams();
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/dashboard/users',
  useRouter: () => ({
    replace: (href: string) => {
      mockReplace(href);
      mockSearchParams = new URLSearchParams(String(href).split('?')[1] ?? '');
    },
  }),
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('@/lib/api-client', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }

  return {
    ApiError,
    usersApi: {
      list: (...args: unknown[]) => listMock(...args),
      create: (...args: unknown[]) => createMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
      remove: jest.fn(),
      resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
    },
    accessControlApi: {
      listPermissions: (...args: unknown[]) => listPermissionsMock(...args),
      listProfiles: (...args: unknown[]) => listProfilesMock(...args),
      replaceUserProfiles: (...args: unknown[]) => replaceUserProfilesMock(...args),
      getEffectivePermissions: (...args: unknown[]) => getEffectivePermissionsMock(...args),
    },
  };
});

jest.mock('./CreateUserModal', () => ({
  CreateUserModal: ({
    isOpen,
    onSubmit,
    error,
  }: {
    isOpen: boolean;
    onSubmit: (dto: { email: string; role: string }, companyRoleIds: string[]) => Promise<void>;
    error: string | null;
  }) =>
    isOpen ? (
      <div>
        <button
          type="button"
          onClick={() =>
            void onSubmit({ email: 'nuevo@empresa.com', role: UserRole.NOC }, ['profile-1'])
          }
        >
          Confirmar alta mock
        </button>
        {error ? <p>{error}</p> : null}
      </div>
    ) : null,
}));

jest.mock('./EditUserModal', () => ({
  EditUserModal: ({
    isOpen,
    onSubmit,
    error,
  }: {
    isOpen: boolean;
    onSubmit: (dto: { firstName: string }, companyRoleIds: string[]) => Promise<void>;
    error: string | null;
  }) =>
    isOpen ? (
      <div>
        <button type="button" onClick={() => void onSubmit({ firstName: 'Ada' }, ['profile-2'])}>
          Confirmar edición mock
        </button>
        {error ? <p>{error}</p> : null}
      </div>
    ) : null,
}));

jest.mock('./BulkImportUsersModal', () => ({
  BulkImportUsersModal: () => null,
}));

jest.mock('./DeleteUserDialog', () => ({
  DeleteUserDialog: () => null,
}));

jest.mock('./ResetPasswordDialog', () => ({
  ResetPasswordDialog: ({
    isOpen,
    onConfirm,
  }: {
    isOpen: boolean;
    onConfirm: () => Promise<void>;
  }) =>
    isOpen ? (
      <button type="button" onClick={() => void onConfirm()}>
        Confirmar reset mock
      </button>
    ) : null,
}));

const emptyList = { data: [], meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 } };

const sampleUser = {
  id: 'u-1',
  email: 'page@test.com',
  role: UserRole.NOC,
  status: UserStatus.ACTIVE,
  tenantId: 'tenant-1',
  mfaEnabled: false,
  mfaRequired: false,
  isOperationalResource: false,
  emailVerified: true,
  passwordResetRequired: false,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  firstName: 'Page',
  lastName: 'Test',
  phone: null,
  jobTitle: null,
  documentType: null,
  documentNumber: null,
  avatarUrl: null,
};

describe('UsersClient Ola B1', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSearchParams = new URLSearchParams();
    mockReplace.mockReset();
    listMock.mockReset().mockResolvedValue(emptyList);
    createMock.mockReset();
    updateMock.mockReset();
    replaceUserProfilesMock.mockReset();
    resetPasswordMock.mockReset();
    listPermissionsMock.mockReset().mockResolvedValue({ version: 1, permissions: [] });
    listProfilesMock.mockReset().mockResolvedValue([]);
    getEffectivePermissionsMock.mockReset().mockResolvedValue({ profileSources: [] });
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
    });
    let uuidSeq = 0;
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: () => {
          uuidSeq += 1;
          return `11111111-1111-4111-8111-11111111111${uuidSeq}`;
        },
      },
      configurable: true,
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('FE-01: filtro + búsqueda simultáneos llegan juntos al listado', async () => {
    const { rerender } = render(<UsersClient />);

    await waitFor(() => {
      expect(listMock).toHaveBeenCalled();
    });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Usuarios internos' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Directorio')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Listado de usuarios' }),
    ).toBeInTheDocument();

    listMock.mockClear();

    fireEvent.click(screen.getByRole('combobox', { name: 'Estado' }));
    fireEvent.click(screen.getByRole('option', { name: 'Suspendido' }));
    rerender(<UsersClient />);

    await waitFor(() => {
      expect(listMock).toHaveBeenLastCalledWith({
        limit: 20,
        status: UserStatus.SUSPENDED,
      });
    });

    fireEvent.change(screen.getByLabelText('Buscar usuario'), {
      target: { value: 'ana' },
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    rerender(<UsersClient />);

    await waitFor(() => {
      expect(listMock).toHaveBeenLastCalledWith({
        limit: 20,
        status: UserStatus.SUSPENDED,
        search: 'ana',
      });
    });

    expect(screen.getByRole('combobox', { name: 'Estado' })).toHaveTextContent('Suspendido');
    expect(screen.getByLabelText('Buscar usuario')).toHaveValue('ana');
  });

  it('FE-02: reutiliza Idempotency-Key en reintentos de la misma intención de alta', async () => {
    createMock
      .mockRejectedValueOnce(new Error('fallo transitorio'))
      .mockResolvedValueOnce({ id: 'user-new', temporaryPassword: 'tmp-1' });
    replaceUserProfilesMock.mockResolvedValue(undefined);

    render(<UsersClient />);
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('button', { name: 'Nuevo usuario' })[0]!);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar alta mock' }));
    });

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar alta mock' }));
    });

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(2);
    });

    const firstKey = createMock.mock.calls[0]?.[1];
    const secondKey = createMock.mock.calls[1]?.[1];
    expect(firstKey).toBe('11111111-1111-4111-8111-111111111111');
    expect(secondKey).toBe(firstKey);
  });

  it('FE-04: distingue fallo parcial de perfiles tras create exitoso', async () => {
    createMock.mockResolvedValue({ id: 'user-new', temporaryPassword: null });
    replaceUserProfilesMock.mockRejectedValue(new Error('profiles down'));

    render(<UsersClient />);
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('button', { name: 'Nuevo usuario' })[0]!);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar alta mock' }));
    });

    await waitFor(() => {
      expect(
        screen.getByText(/el usuario se creó, pero no se pudieron asignar los roles/i),
      ).toBeInTheDocument();
    });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('ADR-065: muestra PortalTablePager cuando el API devuelve meta page-based', async () => {
    listMock.mockResolvedValue({
      data: [sampleUser],
      meta: {
        ...EMPTY_LIST_META,
        page: 1,
        totalPages: 2,
        limit: 10,
        total: 15,
        mode: 'page' as const,
        nextCursor: null,
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    });

    render(<UsersClient />);

    await waitFor(() => {
      // PortalTablePager con 2 páginas: botón Siguiente visible y habilitado
      expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument();
    });

    // Cargar más no aparece porque el pager está activo
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Filas por página')).toBeInTheDocument();
    // El pager muestra el rango (visible + sr-only → múltiples matches)
    expect(screen.getAllByText(/Mostrando 1–10 de 15 usuarios/).length).toBeGreaterThan(0);
  });

  it('ADR-065: usa Cargar más cuando randomAccess es false', async () => {
    listMock
      .mockResolvedValueOnce({
        data: [sampleUser],
        meta: {
          ...EMPTY_LIST_META,
          nextCursor: 'cursor-2',
          total: 5,
          capabilities: { randomAccess: false, sortableFields: [] },
          mode: 'cursor' as const,
        },
      })
      .mockResolvedValueOnce({
        data: [sampleUser],
        meta: {
          ...EMPTY_LIST_META,
          nextCursor: null,
          total: 5,
          capabilities: { randomAccess: false, sortableFields: [] },
          mode: 'cursor' as const,
        },
      });

    render(<UsersClient />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cargar más' })).toBeInTheDocument();
    });
    expect(screen.queryByText('1 de 5 usuarios')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /Paginación/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    await waitFor(() => {
      expect(listMock).toHaveBeenLastCalledWith({ limit: 20, cursor: 'cursor-2' });
    });
  });

  it('normaliza metadata legacy y conserva Cargar más con el cursor recibido', async () => {
    listMock
      .mockResolvedValueOnce({
        data: [],
        meta: { nextCursor: 'cursor-legacy', total: 5 },
      })
      .mockResolvedValueOnce({ data: [], meta: { nextCursor: null, total: 5 } });

    render(<UsersClient />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cargar más' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    await waitFor(() => {
      expect(listMock).toHaveBeenLastCalledWith({ limit: 20, cursor: 'cursor-legacy' });
    });
  });

  it('tolera una respuesta sin data ni meta sin activar un pager', async () => {
    listMock.mockResolvedValueOnce({});

    render(<UsersClient />);

    await waitFor(() => {
      expect(screen.getByText('0 usuarios en total')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /Paginación/ })).not.toBeInTheDocument();
  });

  it('muestra el estado de error y la acción para reintentar cuando falla el listado', async () => {
    listMock.mockRejectedValueOnce(new Error('fallo de prueba')).mockResolvedValueOnce(emptyList);

    render(<UsersClient />);

    await waitFor(() => {
      expect(screen.getByText('Incidente en la carga')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(2);
      expect(screen.getByText('0 usuarios en total')).toBeInTheDocument();
    });
  });
});
