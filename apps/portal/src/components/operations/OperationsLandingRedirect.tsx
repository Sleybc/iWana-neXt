// apps/portal/src/components/operations/OperationsLandingRedirect.tsx
// Caso sin parámetros de la raíz /dashboard/operations (spec 2026-09-13 §4.2):
// componente cliente SOLO para este caso, porque la elección de la primera
// pestaña permitida depende de `usePermissions()` (contexto cliente; el
// fallback SSR deniega por defecto — dictamen G3 §3.1).
//
// D-A7: si la query trajo alguna de las tres llaves reconocidas el despachador
// ya redirigió en servidor; cualquier otra query (parámetros no reconocidos)
// cae aquí y se comporta como landing sin parámetros.
//
// D-A5: cuando el usuario no tiene NINGUNA pestaña permitida se reutiliza el
// shell del estado restringido del gate (`restrictedShellClassName`, exportado
// para eso; precedente `InventoryClient.tsx`) — prohibido duplicar la cadena.
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { AccessPermissionKey } from '@iwana/shared';
import { Badge, Button, buttonVariants, cn } from '@iwana/ui';
import { restrictedShellClassName } from '@/components/access-control/PagePermissionGate';
import { usePermissions } from '@/components/access-control/permissions-context';
import { PortalSkeletonBlock } from '@/components/shared/portal-ui';

// Orden ratificado por AI-PROD-UX (UX spec §4.2, D1): Tareas primero.
const OPERATIONS_TAB_ORDER = [
  { href: '/dashboard/operations/tasks', permission: AccessPermissionKey.OPERATIONS_TASKS_READ },
  {
    href: '/dashboard/operations/execution-orders',
    permission: AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
  },
] as const;

export function OperationsLandingRedirect() {
  const router = useRouter();
  const { status, hasPermission } = usePermissions();

  useEffect(() => {
    if (status !== 'ready') {
      return;
    }
    const firstPermitted = OPERATIONS_TAB_ORDER.find((tab) => hasPermission(tab.permission));
    if (firstPermitted) {
      router.replace(firstPermitted.href);
    }
  }, [status, hasPermission, router]);

  if (status !== 'ready') {
    return (
      <div className="space-y-4" aria-busy="true">
        <PortalSkeletonBlock className="h-16" />
        <PortalSkeletonBlock className="h-48" />
      </div>
    );
  }

  const firstPermitted = OPERATIONS_TAB_ORDER.find((tab) => hasPermission(tab.permission));
  if (firstPermitted) {
    // Redirección en curso: el marco del módulo ya está pintado por el layout.
    return null;
  }

  return (
    <section
      className={restrictedShellClassName}
      aria-labelledby="operations-landing-restricted-title"
    >
      <Badge variant="warning" className="gap-1.5">
        <Lock className="h-3.5 w-3.5" aria-hidden={true} />
        Acceso restringido
      </Badge>
      <h2
        id="operations-landing-restricted-title"
        className="text-xl font-semibold text-gray-900 dark:text-white md:text-2xl"
      >
        No tienes acceso a esta sección
      </h2>
      <p className="max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
        Tu tipo de usuario y sus perfiles asignados no incluyen el acceso necesario para usar esta
        sección.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'min-h-11')}
        >
          Volver a inicio
        </Link>
      </div>
    </section>
  );
}
