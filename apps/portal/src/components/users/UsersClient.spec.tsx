import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UserRole, UserStatus } from '@iwana/shared';
import { UsersClient } from './UsersClient';

const listMock = jest.fn();
const createMock = jest.fn();
const updateMock = jest.fn();
const replaceUserProfilesMock = jest.fn();
const resetPasswordMock = jest.fn();
const listPermissionsMock = jest.fn();
const listProfilesMock = jest.fn();
const getEffectivePermissionsMock = jest.fn();
const useAuthMock = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
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

const emptyList = { data: [], meta: { nextCursor: null, total: 0 } };

describe('UsersClient Ola B1', () => {
  beforeEach(() => {
    jest.useFakeTimers();
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
    render(<UsersClient />);

    await waitFor(() => {
      expect(listMock).toHaveBeenCalled();
    });
    listMock.mockClear();

    fireEvent.click(screen.getByRole('combobox', { name: 'Estado' }));
    fireEvent.click(screen.getByRole('option', { name: 'Suspendido' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar alta mock' }));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar alta mock' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar alta mock' }));

    await waitFor(() => {
      expect(
        screen.getByText(/el usuario se creó, pero no se pudieron asignar los roles/i),
      ).toBeInTheDocument();
    });
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
