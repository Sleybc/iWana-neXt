// apps/portal/src/components/operations/OperationsCreateTaskAction.tsx
// CTA "Crear tarea" del encabezado del módulo (UX spec §4.3, D2 — ratificado
// por AI-PROD-UX): es una acción del PageHeader, no una tercera pestaña.
// Visible solo con el permiso de creación de tareas (el mismo que protege
// POST /tasks: `operations.tasks.manage`); sin permiso no se pinta, nunca se
// pinta deshabilitado. Ocupa la misma posición en las tres rutas del módulo
// porque vive en el layout (UX spec §11.5, navegación consistente).
'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { AccessPermissionKey } from '@iwana/shared';
import { Button } from '@iwana/ui';
import { usePermissions } from '@/components/access-control/permissions-context';
import { mergeUrlSearchParams, withSearchParams } from '@/lib/merge-url-search-params';

const TASKS_PATH = '/dashboard/operations/tasks';
const CREATE_TASK_PATH = '/dashboard/operations/tasks/new';

export function OperationsCreateTaskAction() {
  const { status, hasPermission } = usePermissions();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (status !== 'ready' || !hasPermission(AccessPermissionKey.OPERATIONS_TASKS_MANAGE)) {
    return null;
  }

  // M3.1 (UX spec §5.4): desde la bandeja de tareas el alta lleva su estado
  // vigente como `returnTo`; desde otra sub-ruta no hay estado de bandeja de
  // tareas que preservar (el retorno del alta es la bandeja de tareas).
  const tasksQuery = pathname === TASKS_PATH ? (searchParams?.toString() ?? '') : '';
  const href = tasksQuery
    ? withSearchParams(
        CREATE_TASK_PATH,
        mergeUrlSearchParams('', { returnTo: withSearchParams(TASKS_PATH, tasksQuery) }),
      )
    : CREATE_TASK_PATH;

  return (
    <Button asChild={true} variant="primary" size="lg" className="min-h-11">
      <Link href={href}>Crear tarea</Link>
    </Button>
  );
}
