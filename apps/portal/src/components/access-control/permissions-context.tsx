// apps/portal/src/components/access-control/permissions-context.tsx
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { accessControlApi } from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * Contexto de permisos efectivos del dashboard (spec MOD00 §1.3, HLD §6.6).
 *
 * Una sola llamada a GET /access-control/me/effective-permissions por carga del
 * dashboard (CA-NAV-07), compartida por Sidebar y gates de página. El fetch
 * arranca solo con sesión resuelta; los reintentos ante fallo son silenciosos
 * (backoff 5 s / 15 s) y el refetch por visibilitychange ocurre solo si el
 * último éxito tiene más de 60 s (TTL del cache Redis del backend).
 *
 * Prohibido ampliar permisos desde la presentación (HLD-DE-06): el contexto es
 * lectura pura; ninguna unión client-side agrega acceso.
 */
export type PermissionsStatus = 'loading' | 'ready' | 'degraded';

export interface PermissionsContextValue {
  status: PermissionsStatus;
  effectivePermissions: ReadonlySet<AccessPermissionKey>;
  hasPermission: (permission: AccessPermissionKey) => boolean;
  /** Semántica OR — ítem Operaciones del mapeo congelado (plan §2). */
  hasAnyPermission: (permissions: readonly AccessPermissionKey[]) => boolean;
  /** Reintento silencioso manual — gates §2.4 y tripwire §1.5. */
  retry: () => void;
}

/** Backoff de reintentos silenciosos (spec §1.3: 2 reintentos, 5 s / 15 s). */
const RETRY_BACKOFF_MS = [5_000, 15_000] as const;
/** Alineado al TTL del cache Redis `access:perms:{tenantId}:{userId}` (HLD §6.6). */
const REFRESH_MIN_INTERVAL_MS = 60_000;
/** Delay del reintento único del tripwire anti-nav vacía (spec §1.5). */
const TRIPWIRE_RETRY_DELAY_MS = 5_000;

/**
 * Valor de contexto sin proveedor: degradación estática (comportamiento previo
 * al corte). Existe para aislar pruebas y consumidores fuera del árbol del
 * dashboard; el árbol real siempre monta `PermissionsProvider` en el layout.
 */
export const STATIC_FALLBACK_PERMISSIONS_CONTEXT: PermissionsContextValue = {
  status: 'degraded',
  effectivePermissions: new Set<AccessPermissionKey>(),
  hasPermission: () => false,
  hasAnyPermission: () => false,
  retry: () => undefined,
};

const PermissionsContext = createContext<PermissionsContextValue>(
  STATIC_FALLBACK_PERMISSIONS_CONTEXT,
);

function isAdminRole(role: string | undefined): boolean {
  return role === UserRole.ADMIN;
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<PermissionsStatus>('loading');
  const [permissions, setPermissions] = useState<ReadonlySet<AccessPermissionKey>>(
    () => new Set<AccessPermissionKey>(),
  );

  const inFlightRef = useRef(false);
  const attemptRef = useRef(0);
  const lastSuccessAtRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const startedForUserRef = useRef<string | null>(null);
  // Un solo reintento agendado por episodio de tripwire; se rearma cuando el
  // set vuelve a traer permisos (p. ej. tras el corte del tenant).
  const tripwireScheduledRef = useRef(false);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const runFetch = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    try {
      const summary = await accessControlApi.getMyEffectivePermissions();
      if (!mountedRef.current) {
        return;
      }
      attemptRef.current = 0;
      lastSuccessAtRef.current = Date.now();
      const next = new Set<AccessPermissionKey>(summary.effectivePermissions);
      setPermissions(next);
      setStatus('ready');

      // Tripwire anti-nav vacía (§1.5 / CA-DEP-02): un no-ADMIN con set vacío
      // ("tenant sin corte") cae a filtrado estático en el nav y agenda un
      // reintento silencioso. Nunca queda la nav vacía para no-ADMIN.
      if (next.size > 0) {
        tripwireScheduledRef.current = false;
      } else if (!isAdminRole(user?.role) && !tripwireScheduledRef.current) {
        tripwireScheduledRef.current = true;
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          void runFetch();
        }, TRIPWIRE_RETRY_DELAY_MS);
      }
    } catch {
      if (!mountedRef.current) {
        return;
      }
      // Degradación inmediata y silenciosa (§1.5 / CA-NAV-05): el nav conmuta a
      // filtrado estático sin mensajes; el reintento sigue en segundo plano.
      attemptRef.current += 1;
      setStatus('degraded');
      const backoff = RETRY_BACKOFF_MS[attemptRef.current - 1];
      if (backoff !== undefined) {
        clearRetryTimer();
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          void runFetch();
        }, backoff);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [clearRetryTimer, user?.role]);

  // Ciclo de vida del dato (§1.3): fetch al montar con sesión; refetch en
  // visibilitychange → visible solo si el último éxito tiene > 60 s.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') {
        return;
      }
      if (inFlightRef.current) {
        return;
      }
      const lastSuccessAt = lastSuccessAtRef.current;
      if (lastSuccessAt !== null && Date.now() - lastSuccessAt <= REFRESH_MIN_INTERVAL_MS) {
        return;
      }
      void runFetch();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [runFetch]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

  useEffect(() => {
    if (!user) {
      startedForUserRef.current = null;
      setPermissions(new Set<AccessPermissionKey>());
      setStatus('loading');
      return;
    }

    // Una sola llamada por sesión de navegación (CA-NAV-07); el guard por id
    // evita duplicar el fetch en Strict Mode y en re-renders del layout.
    if (startedForUserRef.current === user.id) {
      return;
    }
    startedForUserRef.current = user.id;
    attemptRef.current = 0;
    lastSuccessAtRef.current = null;
    tripwireScheduledRef.current = false;
    setPermissions(new Set<AccessPermissionKey>());
    setStatus('loading');
    void runFetch();
  }, [runFetch, user]);

  const retry = useCallback(() => {
    clearRetryTimer();
    attemptRef.current = 0;
    if (inFlightRef.current) {
      return;
    }
    void runFetch();
  }, [clearRetryTimer, runFetch]);

  const hasPermission = useCallback(
    (permission: AccessPermissionKey) => permissions.has(permission),
    [permissions],
  );

  const hasAnyPermission = useCallback(
    (required: readonly AccessPermissionKey[]) => required.some((item) => permissions.has(item)),
    [permissions],
  );

  const value = useMemo<PermissionsContextValue>(
    () => ({
      status,
      effectivePermissions: permissions,
      hasPermission,
      hasAnyPermission,
      retry,
    }),
    [hasAnyPermission, hasPermission, permissions, retry, status],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsContextValue {
  return useContext(PermissionsContext);
}
