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
import { formatFullName } from '@iwana/shared';
import {
  authApi,
  clearPendingPlatformMfaLogin,
  getPendingPlatformMfaLogin,
  platformUsersApi,
  setPendingPlatformMfaLogin,
  ApiError,
  type JwtProfile,
  type PlatformUserProfile,
} from '@/lib/api-client';

interface AuthUser {
  id: string;
  emailHash: string;
  role: string;
  type: 'platform' | 'tenant';
  displayName: string;
  subtitle: string;
}

/** Resultados posibles del metodo login */
export type LoginResult = 'authenticated' | 'mfa_required' | 'password_reset_required';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  completeMfaLogin: (code: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function roleToDisplayName(role: string): string {
  if (role === 'system_admin') {
    return 'Administrador de plataforma';
  }
  if (role === 'SYSTEM_ADMIN') {
    return 'Administrador de plataforma';
  }
  if (role === 'iwana_support') {
    return 'Soporte iWana';
  }
  if (role === 'IWANA_SUPPORT') {
    return 'Soporte iWana';
  }
  return 'Usuario de plataforma';
}

function buildPlatformDisplayName(platformProfile?: PlatformUserProfile | null): string | null {
  if (!platformProfile) {
    return null;
  }

  const fullName = formatFullName(platformProfile.firstName, platformProfile.lastName).trim();

  return fullName || null;
}

function toAuthUser(profile: JwtProfile, platformProfile?: PlatformUserProfile | null): AuthUser {
  const displayName = buildPlatformDisplayName(platformProfile);

  return {
    id: profile.sub,
    emailHash: profile.email,
    role: profile.role,
    type: profile.type,
    displayName: displayName || roleToDisplayName(profile.role),
    subtitle: roleToDisplayName(profile.role),
  };
}

async function fetchPlatformProfileSafely(): Promise<PlatformUserProfile | null> {
  try {
    return await platformUsersApi.me();
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await authApi.me();

      if (profile.passwordResetRequired) {
        setUser(null);
        return;
      }

      const platformProfile = await fetchPlatformProfileSafely();
      setUser(toAuthUser(profile, platformProfile));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        if (pathname.startsWith('/auth')) {
          // Rutas públicas de autenticación: sin sesión visible en el shell.
          setUser(null);
          return;
        }

        // La sesión vive en la cookie httpOnly y el cliente ya no puede
        // validarla localmente (ADR-081): siempre se pregunta al servidor.
        // Si la cookie no existe o expiró, /auth/me responde 401 y el flujo de
        // refresh (o la redirección a login) resuelve el estado.
        const profile = await authApi.me();
        if (mounted) {
          if (profile.passwordResetRequired) {
            setUser(null);
          } else {
            const platformProfile = await fetchPlatformProfileSafely();
            setUser(toAuthUser(profile, platformProfile));
          }
        }
      } catch {
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

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const result = await authApi.platformLogin(email, password);
    if (result.mfaRequired) {
      setPendingPlatformMfaLogin({ email, password });
      return 'mfa_required';
    }

    // Primer ingreso con la credencial de arranque: el token recibido solo
    // alcanza /auth/change-password. Hay que decidir con el indicador de la
    // respuesta —no con /auth/me, que ese token ya no puede consultar— y dejar
    // al usuario sin sesion (user = null) para que el layout protegido no le
    // abra ninguna ruta de la consola hasta completar el cambio.
    if (result.passwordResetRequired) {
      clearPendingPlatformMfaLogin();
      setUser(null);
      return 'password_reset_required';
    }

    const profile = await authApi.me();
    const platformProfile = await fetchPlatformProfileSafely();
    setUser(toAuthUser(profile, platformProfile));
    clearPendingPlatformMfaLogin();

    // Si el backend indica que se debe cambiar la contrasena, informar al formulario
    if (profile.passwordResetRequired) {
      return 'password_reset_required';
    }

    return 'authenticated';
  }, []);

  const completeMfaLogin = useCallback(async (code: string): Promise<LoginResult> => {
    const pendingLogin = getPendingPlatformMfaLogin();
    if (!pendingLogin) {
      throw new ApiError(
        400,
        'MFA_CONTEXT_MISSING',
        'La sesión MFA expiró. Inicia sesión de nuevo.',
      );
    }

    const result = await authApi.platformLogin(pendingLogin.email, pendingLogin.password, code);
    if (result.mfaRequired) {
      throw new ApiError(401, 'MFA_CODE_INVALID', 'Código incorrecto. Intenta de nuevo.');
    }

    clearPendingPlatformMfaLogin();
    const profile = await authApi.me();

    if (profile.passwordResetRequired) {
      setUser(null);
      return 'password_reset_required';
    }

    const platformProfile = await fetchPlatformProfileSafely();
    setUser(toAuthUser(profile, platformProfile));
    return 'authenticated';
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
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
