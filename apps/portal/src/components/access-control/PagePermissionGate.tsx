// apps/portal/src/components/access-control/PagePermissionGate.tsx
'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { Badge, Button, buttonVariants, cn } from '@iwana/ui';
import { useAuth } from '@/components/auth/AuthProvider';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { usePermissions } from './permissions-context';

/**
 * Gate de página de la convergencia RBAC (spec MOD00 §2).
 *
 * Resuelve ANTES de renderizar contenido contra el mismo contexto
 * `usePermissions()` del layout (sin fetch propio). Estados congelados:
 * checking (skeleton con forma de página), autorizado (children), restringido
 * (explicación + salidas, URL conservada) y error (alerta sanitizada +
 * Reintentar). El contenido sensible nunca se monta en restringido (§5.3.7).
 */

const RESTRICTED_COPY = {
  badge: 'Acceso restringido',
  title: 'No tienes acceso a esta sección',
  description:
    'Tu tipo de usuario y sus perfiles asignados no incluyen el acceso necesario para usar esta sección.',
  primaryAction: 'Volver a inicio',
  secondaryAction: 'Ver usuarios y accesos',
} as const;

const ERROR_COPY = {
  title: 'No pudimos verificar tu acceso',
  description:
    'Intenta nuevamente en unos segundos. Si el problema continúa, contacta a un administrador.',
  action: 'Reintentar',
} as const;

const CHECKING_ANNOUNCEMENT = 'Verificando acceso';

/**
 * Shell visual del estado restringido del gate de página. Exportado para que
 * el estado restringido inline de gates de pestaña (spec subnav Inventario
 * v1.3 §2.4) reutilice la misma cadena — prohibido duplicarla.
 */
export const restrictedShellClassName =
  'flex flex-col items-start gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2 md:p-8';

interface PagePermissionGateProps {
  /** Permiso de lectura efectivo requerido (mapeo congelado, plan §2). */
  permission: AccessPermissionKey;
  /**
   * Techo estático estructural (espejo de `@Roles`, spec §1.2). Se usa SOLO en
   * degradación: techo que permite la ruta → autoriza (continuidad); techo que
   * excluye → restringido; sin techo aplicable → estado error (CA-GATE-05).
   */
  allowedRoles?: UserRole[];
  children: ReactNode;
}

export function PagePermissionGate({
  permission,
  allowedRoles,
  children,
}: PagePermissionGateProps) {
  const { status, hasPermission, retry } = usePermissions();
  const { user } = useAuth();

  if (status === 'loading') {
    return (
      <div className="space-y-4" aria-busy="true">
        <p role="status" aria-live="polite" className="sr-only">
          {CHECKING_ANNOUNCEMENT}
        </p>
        <PortalSkeletonBlock className="h-16" />
        <PortalSkeletonBlock className="h-80" />
      </div>
    );
  }

  if (status === 'ready') {
    if (!hasPermission(permission)) {
      return <RestrictedState canViewUsers={hasPermission(AccessPermissionKey.USERS_READ)} />;
    }
    return <>{children}</>;
  }

  // Degradado (§2.4 / §5.2): el gate no muestra error por sí solo cuando hay
  // techo estático aplicable; sin datos y sin techo, estado error explícito.
  if (allowedRoles !== undefined) {
    const ceilingAllows = user?.role !== undefined && allowedRoles.includes(user.role as UserRole);
    if (ceilingAllows) {
      return <>{children}</>;
    }
    return <RestrictedState canViewUsers={hasPermission(AccessPermissionKey.USERS_READ)} />;
  }

  return (
    <PortalAlert
      variant="error"
      title={ERROR_COPY.title}
      description={ERROR_COPY.description}
      action={
        <Button type="button" variant="link" size="lg" className="min-h-11" onClick={retry}>
          {ERROR_COPY.action}
        </Button>
      }
    />
  );
}

function RestrictedState({ canViewUsers }: { canViewUsers: boolean }) {
  return (
    <section className={restrictedShellClassName} aria-labelledby="page-gate-restricted-title">
      <Badge variant="warning" className="gap-1.5">
        <Lock className="h-3.5 w-3.5" aria-hidden={true} />
        {RESTRICTED_COPY.badge}
      </Badge>
      <h1
        id="page-gate-restricted-title"
        className="text-xl font-semibold text-gray-900 dark:text-white md:text-2xl"
      >
        {RESTRICTED_COPY.title}
      </h1>
      <p className="max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
        {RESTRICTED_COPY.description}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'min-h-11')}
        >
          {RESTRICTED_COPY.primaryAction}
        </Link>
        {canViewUsers ? (
          <Link
            href="/dashboard/users"
            className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'min-h-11')}
          >
            {RESTRICTED_COPY.secondaryAction}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
