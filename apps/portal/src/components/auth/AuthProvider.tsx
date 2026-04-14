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
import {
  authApi,
  userApi,
  ApiError,
  clearPendingTenantMfaLogin,
  getPendingTenantMfaLogin,
  isStoredTokenValid,
  persistAccessToken,
  setPendingTenantMfaLogin,
  type JwtProfile,
} from '@/lib/api-client';

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

/**
 * Mapea el rol del usuario a etiqueta legible para el panel empresarial.
 * Alineado con UserRole enum del backend (valores en UPPER_CASE).
 * Gotcha: los roles vienen como 'ADMIN', 'NOC', etc. — nunca como 'tenant_admin'.
 * CLAUDE.md §Gotchas conocidos — Auth / MFA
 */
function roleToDisplayName(role: string): string {
  const labels: Record<string, string> = {
    ADMIN: 'Administrador',
    NOC: 'Operador NOC',
    ACCOUNTANT: 'Contabilidad',
    SUPPORT: 'Soporte',
    SALES: 'Ventas',
    TECHNICIAN: 'Técnico',
    HR: 'Recursos Humanos',
    AUDITOR: 'Auditor',
    SUBSCRIBER: 'Suscriptor',
    SYSTEM_ADMIN: 'Admin de plataforma',
    IWANA_SUPPORT: 'Soporte iWana',
  };
  return labels[role] ?? role;
}

function toAuthUser(
  profile: JwtProfile,
  firstName: string | null = null,
  lastName: string | null = null,
): AuthUser {
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
  return {
    id: profile.sub,
    emailHash: profile.email,
    role: profile.role,
    type: profile.type,
    tenantId: profile.tenantId,
    // displayName: nombre real si existe, si no el rol
    displayName: fullName ?? roleToDisplayName(profile.role),
    subtitle: roleToDisplayName(profile.role),
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
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

        if (!isStoredTokenValid()) {
          // Token ausente o expirado localmente: limpiar y no hacer round-trip innecesario.
          persistAccessToken('');
          return;
        }

        const profile = await authApi.me();
        if (mounted) {
          if (profile.passwordResetRequired) {
            setUser(null);
          } else {
            const { firstName, lastName } = await fetchUserName(profile.sub);
            setUser(toAuthUser(profile, firstName, lastName));
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

    bootstrap();

    return () => {
      mounted = false;
    };
  }, [pathname]);

  const login = useCallback(
    async (email: string, password: string, tenantSlug?: string): Promise<LoginResult> => {
      const result = await authApi.tenantLogin(email, password, tenantSlug);
      const resolvedTenantSlug = tenantSlug?.trim().toLowerCase();

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
            'El tenant es obligatorio para completar el MFA.',
          );
        }

        setPendingTenantMfaLogin({
          email,
          password,
          tenantSlug: resolvedTenantSlug,
        });

        return 'mfa_required';
      }

      const profile = await authApi.me(tenantSlug);
      clearPendingTenantMfaLogin();

      // Si el backend indica que se debe cambiar la contrasena, informar al formulario
      // Y no popular el estado de usuario para mantener 'user' en null en estados intermedios.
      if (profile.passwordResetRequired) {
        setUser(null);
        return 'password_reset_required';
      }

      const { firstName, lastName } = await fetchUserName(profile.sub);
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
