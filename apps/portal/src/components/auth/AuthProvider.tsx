'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { getPortalUserRoleLabel } from '@/lib/user-labels';
import {
  authApi,
  userApi,
  ApiError,
  clearPendingTenantMfaLogin,
  getPendingTenantMfaLogin,
  persistAccessToken,
  setPendingTenantMfaLogin,
  type JwtProfile,
} from '@/lib/api-client';
import { resolveTenantSlug } from '@/lib/tenant-resolution';

interface AuthUser {
  id: string;
  emailHash: string;
  role: string;
  type: 'platform' | 'tenant';
  tenantId: string | null;
  displayName: string;
  subtitle: string;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Resultados posibles del metodo login en el portal de tenant.
 * - 'authenticated': sesion completa, tokens emitidos.
 * - 'mfa_required': MFA configurado pero no se envio TOTP — pedir codigo.
 * - 'password_reset_required': primer acceso con password temporal.
 * - 'mfa_setup_required': rol critico (ADMIN/NOC/ACCOUNTANT) sin MFA configurado
 *   — token limitado emitido, redirigir a /auth/mfa/setup.
 *   HLD-MOD02-ARQUITECTURA-v1.0 §6.2 (DA-MOD02-01)
 */
export type LoginResult =
  | 'authenticated'
  | 'mfa_required'
  | 'password_reset_required'
  | 'mfa_setup_required';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<LoginResult>;
  completeMfaLogin: (code: string) => Promise<LoginResult>;
  logout: (tenantSlug?: string) => Promise<void>;
  refreshProfile: (tenantSlug?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toAuthUser(
  profile: JwtProfile,
  firstName: string | null = null,
  lastName: string | null = null,
): AuthUser {
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
  const roleLabel = getPortalUserRoleLabel(profile.role);
  return {
    id: profile.sub,
    emailHash: profile.email,
    role: profile.role,
    type: profile.type,
    tenantId: profile.tenantId,
    displayName: fullName ?? roleLabel,
    subtitle: fullName ? roleLabel : '',
    firstName,
    lastName,
  };
}

/** Carga el perfil del usuario y retorna nombre/apellido si están disponibles */
async function fetchUserName(
  userId: string,
): Promise<{ firstName: string | null; lastName: string | null }> {
  try {
    const profile = await userApi.getMe(userId);
    return { firstName: profile.firstName, lastName: profile.lastName };
  } catch {
    return { firstName: null, lastName: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // No reiniciar isLoading en cada cambio de ruta cuando ya hay sesión:
  // el layout del dashboard muestra «Validando sesión...» si authLoading||!user,
  // y un reset síncrono dejaba la UI colgada aunque /auth/me ya hubiera resuelto.

  const refreshProfile = useCallback(async (tenantSlug?: string) => {
    try {
      const profile = await authApi.me(tenantSlug);

      if (profile.passwordResetRequired) {
        setUser(null);
        return;
      }

      const { firstName, lastName } = await fetchUserName(profile.sub);
      setUser(toAuthUser(profile, firstName, lastName));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const isAuthRoute = pathname.startsWith('/auth');

    const bootstrap = async () => {
      try {
        if (isAuthRoute) {
          setUser(null);
          return;
        }

        // La sesión vive en la cookie httpOnly y el cliente ya no puede
        // validarla localmente (ADR-081): siempre se pregunta al servidor.
        // Si la cookie no existe o expiró, /auth/me responde 401 y el flujo de
        // refresh (o el estado terminal de sesión) resuelve el estado.
        const profile = await authApi.me();
        if (mounted) {
          if (profile.passwordResetRequired) {
            setUser(null);
          } else {
            // No bloquear el bootstrap por /users/:id (mocks E2E incompletos
            // o latencia): la sesión queda usable y el nombre se completa async.
            setUser(toAuthUser(profile));
            void fetchUserName(profile.sub).then(({ firstName, lastName }) => {
              if (!mounted || (!firstName && !lastName)) {
                return;
              }
              setUser((current) =>
                current && current.id === profile.sub
                  ? { ...current, firstName, lastName }
                  : current,
              );
            });
          }
        }
      } catch {
        persistAccessToken('');
        clearPendingTenantMfaLogin();
        if (mounted) {
          setUser(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [pathname]);

  const login = useCallback(
    async (email: string, password: string, tenantSlug?: string): Promise<LoginResult> => {
      const tenantResolution = resolveTenantSlug(tenantSlug);
      const resolvedTenantSlug = tenantResolution.slug;

      if (!resolvedTenantSlug) {
        throw new ApiError(
          400,
          'TENANT_SLUG_REQUIRED',
          'Ingresa el identificador de la empresa antes de iniciar sesión.',
        );
      }

      const result = await authApi.tenantLogin(email, password, resolvedTenantSlug);

      // Rol critico sin MFA configurado: token de alcance limitado ya persistido en api-client
      // El usuario NO queda autenticado — user permanece null
      if (result.mfaSetupRequired) {
        return 'mfa_setup_required';
      }

      if (result.mfaRequired) {
        if (!resolvedTenantSlug) {
          throw new ApiError(
            400,
            'TENANT_SLUG_REQUIRED',
            'La empresa es obligatoria para completar la verificación en dos pasos.',
          );
        }

        setPendingTenantMfaLogin({
          email,
          password,
          tenantSlug: resolvedTenantSlug,
        });

        return 'mfa_required';
      }

      const profile = await authApi.me(resolvedTenantSlug);
      clearPendingTenantMfaLogin();

      // Si el backend indica que se debe cambiar la contrasena, informar al formulario
      // Y no popular el estado de usuario para mantener 'user' en null en estados intermedios.
      if (profile.passwordResetRequired) {
        setUser(null);
        return 'password_reset_required';
      }

      const { firstName, lastName } = await fetchUserName(profile.sub).catch(() => ({
        firstName: null as string | null,
        lastName: null as string | null,
      }));
      setUser(toAuthUser(profile, firstName, lastName));

      return 'authenticated';
    },
    [],
  );

  const completeMfaLogin = useCallback(async (code: string): Promise<LoginResult> => {
    const pendingLogin = getPendingTenantMfaLogin();
    if (!pendingLogin) {
      throw new ApiError(
        400,
        'MFA_CONTEXT_MISSING',
        'La sesión MFA expiró. Inicia sesión nuevamente.',
      );
    }

    const result = await authApi.tenantLogin(
      pendingLogin.email,
      pendingLogin.password,
      pendingLogin.tenantSlug,
      code,
    );

    if (result.mfaRequired) {
      throw new ApiError(401, 'MFA_CODE_INVALID', 'Código incorrecto. Intenta de nuevo.');
    }

    const profile = await authApi.me(pendingLogin.tenantSlug);

    if (profile.passwordResetRequired) {
      setUser(null);
      clearPendingTenantMfaLogin();
      return 'password_reset_required';
    }

    const { firstName, lastName } = await fetchUserName(profile.sub);
    setUser(toAuthUser(profile, firstName, lastName));
    clearPendingTenantMfaLogin();
    return 'authenticated';
  }, []);

  const logout = useCallback(async (tenantSlug?: string) => {
    await authApi.logout(tenantSlug);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      login,
      completeMfaLogin,
      logout,
      refreshProfile,
    }),
    [user, isLoading, login, completeMfaLogin, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider.');
  }

  return context;
}
