import { act, render, screen } from '@testing-library/react';
import { AuthProvider, useAuth, type LoginResult } from './AuthProvider';

/**
 * MOD01 — primer ingreso con la credencial de arranque, lado consola.
 *
 * El backend entrega un token de alcance limitado y el indicador
 * `passwordResetRequired` en la respuesta del login. La consola tiene que
 * decidir con ESE indicador: el token recibido no puede consultar /auth/me (el
 * guard responde 403), así que resolver el estado por perfil dejaría al usuario
 * atrapado o —peor— lo dejaría pasar si el error se tragase en silencio.
 *
 * Y mientras el cambio esté pendiente la sesión debe quedar vacía: el layout
 * protegido se apoya en `isAuthenticated` para no abrir ninguna ruta.
 */

const platformLogin = jest.fn();
const me = jest.fn();
const platformUsersMe = jest.fn();

jest.mock('@/lib/api-client', () => ({
  authApi: {
    platformLogin: (...args: unknown[]) => platformLogin(...args),
    me: () => me(),
    logout: jest.fn().mockResolvedValue(undefined),
  },
  platformUsersApi: {
    me: () => platformUsersMe(),
  },
  isStoredTokenValid: () => false,
  persistAccessToken: jest.fn(),
  setPendingPlatformMfaLogin: jest.fn(),
  getPendingPlatformMfaLogin: jest.fn().mockReturnValue(null),
  clearPendingPlatformMfaLogin: jest.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

let resultadoLogin: LoginResult | undefined;
let autenticado = false;

function Sonda() {
  const { login, isAuthenticated } = useAuth();
  autenticado = isAuthenticated;

  return (
    <button
      type="button"
      onClick={() => {
        void login('admin@example.test', 'CredencialArranque1!').then((resultado) => {
          resultadoLogin = resultado;
        });
      }}
    >
      entrar
    </button>
  );
}

async function ingresar(): Promise<void> {
  render(
    <AuthProvider>
      <Sonda />
    </AuthProvider>,
  );

  await act(async () => {
    screen.getByText('entrar').click();
  });
}

describe('AuthProvider — primer ingreso de plataforma', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resultadoLogin = undefined;
    autenticado = false;
    me.mockResolvedValue({
      sub: 'platform-uuid-1',
      email: 'hash',
      role: 'system_admin',
      tenantId: null,
      schemaName: null,
      jti: 'jti-1',
      type: 'platform',
    });
    platformUsersMe.mockResolvedValue(null);
  });

  it('devuelve password_reset_required cuando el login lo indica', async () => {
    platformLogin.mockResolvedValue({
      accessToken: 'jwt-scoped',
      passwordResetRequired: true,
    });

    await ingresar();

    expect(resultadoLogin).toBe('password_reset_required');
  });

  it('no consulta /auth/me con el token de alcance limitado', async () => {
    // Ese token responde 403 en /auth/me. Si la consola dependiera de esa
    // llamada, el primer ingreso quedaría bloqueado por un error tragado.
    platformLogin.mockResolvedValue({
      accessToken: 'jwt-scoped',
      passwordResetRequired: true,
    });

    await ingresar();

    expect(me).not.toHaveBeenCalled();
    expect(platformUsersMe).not.toHaveBeenCalled();
  });

  it('deja la sesión vacía: el layout protegido no debe abrir ninguna ruta', async () => {
    platformLogin.mockResolvedValue({
      accessToken: 'jwt-scoped',
      passwordResetRequired: true,
    });

    await ingresar();

    expect(autenticado).toBe(false);
  });

  it('sin el indicador, el ingreso sigue su curso normal y establece la sesión', async () => {
    platformLogin.mockResolvedValue({ accessToken: 'jwt-full' });

    await ingresar();

    expect(resultadoLogin).toBe('authenticated');
    expect(me).toHaveBeenCalled();
    expect(autenticado).toBe(true);
  });

  it('el MFA pendiente sigue teniendo prioridad de flujo propio', async () => {
    platformLogin.mockResolvedValue({ accessToken: '', mfaRequired: true });

    await ingresar();

    expect(resultadoLogin).toBe('mfa_required');
    expect(me).not.toHaveBeenCalled();
  });
});
