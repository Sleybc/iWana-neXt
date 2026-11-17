import { act, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthProvider';
import {
  clearDashboardSessionCache,
  readDashboardSessionCache,
  writeDashboardSessionCache,
} from '@/lib/dashboard-session-cache';

const me = jest.fn();
const logoutApi = jest.fn();

jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));

jest.mock('@/lib/api-client', () => ({
  ApiError: class extends Error {},
  authApi: {
    me: (...args: unknown[]) => me(...args),
    logout: (...args: unknown[]) => logoutApi(...args),
  },
  userApi: { getMe: () => Promise.resolve({ firstName: null, lastName: null }) },
  clearPendingTenantMfaLogin: jest.fn(),
  getPendingTenantMfaLogin: jest.fn(),
  persistAccessToken: jest.fn(),
  setPendingTenantMfaLogin: jest.fn(),
}));

const cacheKey = { userId: 'u-1', role: 'ADMIN', slug: 'demo-isp' };

let auth: ReturnType<typeof useAuth> | null = null;
function Probe() {
  auth = useAuth();
  return <p>{auth.user ? `con sesión ${auth.user.id}` : 'sin sesión'}</p>;
}

describe('AuthProvider · cierre de sesión (P2-2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearDashboardSessionCache();
    me.mockResolvedValue({
      sub: 'u-1',
      email: 'hash',
      role: 'ADMIN',
      type: 'tenant',
      tenantId: 't-1',
      passwordResetRequired: false,
    });
  });

  it('vacía la caché del inicio al cerrar sesión', async () => {
    logoutApi.mockResolvedValue(undefined);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('con sesión u-1');
    writeDashboardSessionCache(cacheKey, { cifra: 1 });

    await act(async () => {
      await auth!.logout();
    });

    expect(readDashboardSessionCache(cacheKey)).toBeNull();
    expect(screen.getByText('sin sesión')).toBeInTheDocument();
  });

  it('la vacía también si el servidor rechaza el cierre', async () => {
    logoutApi.mockRejectedValue(new Error('caída'));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(auth?.user).not.toBeNull());
    writeDashboardSessionCache(cacheKey, { cifra: 1 });

    await act(async () => {
      await expect(auth!.logout()).rejects.toThrow('caída');
    });

    expect(readDashboardSessionCache(cacheKey)).toBeNull();
  });
});
