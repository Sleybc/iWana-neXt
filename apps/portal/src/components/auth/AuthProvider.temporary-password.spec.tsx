import { act, render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthProvider';

const me = jest.fn();
const tenantLogin = jest.fn();
const clearPending = jest.fn();
const setPending = jest.fn();
const getPending = jest.fn();

jest.mock('next/navigation', () => ({ usePathname: () => '/auth/login' }));

jest.mock('@/lib/api-client', () => ({
  ApiError: class extends Error {},
  authApi: {
    me: (...args: unknown[]) => me(...args),
    tenantLogin: (...args: unknown[]) => tenantLogin(...args),
  },
  userApi: { getMe: () => Promise.resolve({ firstName: null, lastName: null }) },
  clearPendingTenantMfaLogin: () => clearPending(),
  getPendingTenantMfaLogin: () => getPending(),
  persistAccessToken: jest.fn(),
  setPendingTenantMfaLogin: (...args: unknown[]) => setPending(...args),
}));

let auth: ReturnType<typeof useAuth> | null = null;
function Probe() {
  auth = useAuth();
  return <p>{auth.user ? 'con sesión' : 'sin sesión'}</p>;
}

describe('AuthProvider · contraseña temporal (ADR-117)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    me.mockRejectedValue(new Error('sin sesión'));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('sin sesión');
    me.mockClear();
  });

  it('login: exige el cambio, sin perfil ni sesión', async () => {
    tenantLogin.mockResolvedValue({ accessToken: 't', passwordResetRequired: true });

    let result: unknown;
    await act(async () => {
      result = await auth!.login('a@example.invalid', 'Temporal1!', 'demo-isp');
    });

    expect(result).toBe('password_reset_required');
    expect(me).not.toHaveBeenCalled();
    expect(clearPending).toHaveBeenCalled();
    expect(screen.getByText('sin sesión')).toBeInTheDocument();
  });

  it('con MFA: pide el código y después exige el cambio, sin perfil ni sesión', async () => {
    tenantLogin.mockResolvedValueOnce({ accessToken: '', mfaRequired: true });
    let first: unknown;
    await act(async () => {
      first = await auth!.login('a@example.invalid', 'Temporal1!', 'demo-isp');
    });
    expect(first).toBe('mfa_required');
    const pending = setPending.mock.calls[0]![0];

    getPending.mockReturnValue(pending);
    tenantLogin.mockResolvedValueOnce({ accessToken: 't', passwordResetRequired: true });
    let second: unknown;
    await act(async () => {
      second = await auth!.completeMfaLogin('123456');
    });

    expect(tenantLogin).toHaveBeenLastCalledWith(
      'a@example.invalid',
      'Temporal1!',
      'demo-isp',
      '123456',
    );
    expect(second).toBe('password_reset_required');
    expect(me).not.toHaveBeenCalled();
    expect(clearPending).toHaveBeenCalled();
    expect(screen.getByText('sin sesión')).toBeInTheDocument();
  });
});
