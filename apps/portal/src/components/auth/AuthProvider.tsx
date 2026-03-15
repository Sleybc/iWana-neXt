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
import { authApi, type JwtProfile } from '@/lib/api-client';

interface AuthUser {
  id: string;
  emailHash: string;
  role: string;
  type: 'platform' | 'tenant';
  tenantId: string | null;
  displayName: string;
  subtitle: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  logout: (tenantSlug?: string) => Promise<void>;
  refreshProfile: (tenantSlug?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function roleToDisplayName(role: string): string {
  if (role === 'tenant_admin') {
    return 'Administrador del tenant';
  }
  if (role === 'tenant_support') {
    return 'Soporte del tenant';
  }
  return 'Suscriptor';
}

function toAuthUser(profile: JwtProfile): AuthUser {
  const tenantCode = profile.tenantId ? profile.tenantId.slice(0, 8) : 'n/a';

  return {
    id: profile.sub,
    emailHash: profile.email,
    role: profile.role,
    type: profile.type,
    tenantId: profile.tenantId,
    displayName: roleToDisplayName(profile.role),
    subtitle: `Tenant: ${tenantCode}...`,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = useCallback(async (tenantSlug?: string) => {
    try {
      const profile = await authApi.me(tenantSlug);
      setUser(toAuthUser(profile));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const profile = await authApi.me();
        if (mounted) {
          setUser(toAuthUser(profile));
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
  }, []);

  const login = useCallback(async (email: string, password: string, tenantSlug?: string) => {
    await authApi.tenantLogin(email, password, tenantSlug);
    const profile = await authApi.me(tenantSlug);
    setUser(toAuthUser(profile));
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
      logout,
      refreshProfile,
    }),
    [user, isLoading, login, logout, refreshProfile],
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
