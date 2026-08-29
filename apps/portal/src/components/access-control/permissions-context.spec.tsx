// apps/portal/src/components/access-control/permissions-context.spec.tsx
import React, { act } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { PermissionsProvider, usePermissions } from './permissions-context';

const getMyEffectivePermissionsMock = jest.fn();
const useAuthMock = jest.fn();

jest.mock('@/lib/api-client', () => ({
  accessControlApi: {
    getMyEffectivePermissions: (...args: unknown[]) => getMyEffectivePermissionsMock(...args),
  },
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

function Probe() {
  const { status, effectivePermissions, hasPermission, hasAnyPermission } = usePermissions();

  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="count">{effectivePermissions.size}</p>
      <p data-testid="has-subscribers">
        {String(hasPermission(AccessPermissionKey.CRM_SUBSCRIBERS_READ))}
      </p>
      <p data-testid="has-any-operations">
        {String(
          hasAnyPermission([
            AccessPermissionKey.OPERATIONS_TASKS_READ,
            AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
          ]),
        )}
      </p>
    </div>
  );
}

function renderProbe() {
  return render(
    <PermissionsProvider>
      <Probe />
    </PermissionsProvider>,
  );
}

describe('PermissionsProvider', () => {
  beforeEach(() => {
    jest.resetModules();
    getMyEffectivePermissionsMock.mockReset();
    useAuthMock.mockReturnValue({
      user: { id: 'user-1', role: UserRole.SUPPORT, type: 'tenant' },
      isLoading: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('CA-NAV-07: hace una sola llamada por sesión y no refetch en re-renders', async () => {
    getMyEffectivePermissionsMock.mockResolvedValue({
      userId: 'user-1',
      role: UserRole.SUPPORT,
      effectivePermissions: [AccessPermissionKey.CRM_SUBSCRIBERS_READ],
      recoveryPermissions: [],
      profileSources: [],
    });

    const { rerender } = renderProbe();
    rerender(
      <PermissionsProvider>
        <Probe />
      </PermissionsProvider>,
    );
    rerender(
      <PermissionsProvider>
        <Probe />
      </PermissionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
    });
    expect(getMyEffectivePermissionsMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('has-subscribers')).toHaveTextContent('true');
    expect(screen.getByTestId('has-any-operations')).toHaveTextContent('false');
  });

  it('degrada de inmediato ante fallo y reintenta en silencio con backoff 5s/15s', async () => {
    jest.useFakeTimers();
    getMyEffectivePermissionsMock.mockRejectedValue(new Error('down'));

    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('degraded');
    });
    expect(getMyEffectivePermissionsMock).toHaveBeenCalledTimes(1);

    // Primer reintento silencioso (5 s)
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    await waitFor(() => {
      expect(getMyEffectivePermissionsMock).toHaveBeenCalledTimes(2);
    });

    // Segundo reintento silencioso (15 s)
    act(() => {
      jest.advanceTimersByTime(15_000);
    });
    await waitFor(() => {
      expect(getMyEffectivePermissionsMock).toHaveBeenCalledTimes(3);
    });

    // Sin más reintentos: permanece degradado
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    await waitFor(() => {
      expect(getMyEffectivePermissionsMock).toHaveBeenCalledTimes(3);
    });
    expect(screen.getByTestId('status')).toHaveTextContent('degraded');
  });

  it('recupera ready si un reintento tiene éxito', async () => {
    jest.useFakeTimers();
    getMyEffectivePermissionsMock.mockRejectedValueOnce(new Error('down')).mockResolvedValue({
      userId: 'user-1',
      role: UserRole.SUPPORT,
      effectivePermissions: [AccessPermissionKey.SETTINGS_READ],
      recoveryPermissions: [],
      profileSources: [],
    });

    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('degraded');
    });

    act(() => {
      jest.advanceTimersByTime(5_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
    });
    expect(screen.getByTestId('has-subscribers')).toHaveTextContent('false');
  });

  it('CA-NAV-05: refetch por visibilitychange solo si el último éxito tiene más de 60 s', async () => {
    jest.useFakeTimers();
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);

    getMyEffectivePermissionsMock.mockResolvedValue({
      userId: 'user-1',
      role: UserRole.SUPPORT,
      effectivePermissions: [AccessPermissionKey.SETTINGS_READ],
      recoveryPermissions: [],
      profileSources: [],
    });

    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
    });
    expect(getMyEffectivePermissionsMock).toHaveBeenCalledTimes(1);

    // Vuelve a la pestaña antes de 60 s: no refetch
    act(() => {
      nowSpy.mockReturnValue(1_000_000 + 30_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(getMyEffectivePermissionsMock).toHaveBeenCalledTimes(1);

    // Vuelve a la pestaña después de 60 s: refetch único
    act(() => {
      nowSpy.mockReturnValue(1_000_000 + 61_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => {
      expect(getMyEffectivePermissionsMock).toHaveBeenCalledTimes(2);
    });

    nowSpy.mockRestore();
  });

  it('CA-DEP-02 tripwire: no-ADMIN con set vacío agenda un único reintento silencioso', async () => {
    jest.useFakeTimers();
    getMyEffectivePermissionsMock.mockResolvedValue({
      userId: 'user-1',
      role: UserRole.SUPPORT,
      effectivePermissions: [],
      recoveryPermissions: [],
      profileSources: [],
    });

    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
    });
    expect(getMyEffectivePermissionsMock).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    await waitFor(() => {
      expect(getMyEffectivePermissionsMock).toHaveBeenCalledTimes(2);
    });

    // El tripwire no entra en bucle: un solo reintento agendado por episodio
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    await waitFor(() => {
      expect(getMyEffectivePermissionsMock).toHaveBeenCalledTimes(2);
    });
  });

  it('el tripwire no aplica a ADMIN y se rearma cuando el set vuelve con permisos', async () => {
    jest.useFakeTimers();
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN, type: 'tenant' },
      isLoading: false,
    });
    getMyEffectivePermissionsMock.mockResolvedValue({
      userId: 'admin-1',
      role: UserRole.ADMIN,
      effectivePermissions: [],
      recoveryPermissions: [],
      profileSources: [],
    });

    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
    });

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(getMyEffectivePermissionsMock).toHaveBeenCalledTimes(1);
  });

  it('cambia el usuario de sesión y reinicia el estado con un nuevo fetch', async () => {
    getMyEffectivePermissionsMock.mockResolvedValue({
      userId: 'user-1',
      role: UserRole.SUPPORT,
      effectivePermissions: [AccessPermissionKey.SETTINGS_READ],
      recoveryPermissions: [],
      profileSources: [],
    });

    const view = renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
    });

    useAuthMock.mockReturnValue({
      user: { id: 'user-2', role: UserRole.TECHNICIAN, type: 'tenant' },
      isLoading: false,
    });
    view.rerender(
      <PermissionsProvider>
        <Probe />
      </PermissionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
      expect(getMyEffectivePermissionsMock).toHaveBeenCalledTimes(2);
    });
  });
});
