// apps/portal/src/components/auth/AuthReadyGate.tsx
'use client';

import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';

/**
 * Gate de sesión del portal. Mantiene el contenido protegido fuera del HTML
 * hasta que AuthProvider termina de validar la sesión en el navegador. El
 * layout server de dashboard opta por `instant = false` porque la sesión
 * depende de una validación cliente.
 */
export function AuthReadyGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  return !isLoading && user ? <>{children}</> : <AuthValidatingShell />;
}

/** Shell mostrado mientras se valida la sesión o se completa el redirect. */
function AuthValidatingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-iwana-neutral-50 dark:bg-dark-surface">
      <p className="text-sm text-gray-600 dark:text-gray-300">Validando sesión...</p>
    </div>
  );
}
