// apps/portal/src/app/dashboard/operations/tasks/layout.tsx
// Gate de la sub-ruta Tareas (spec 2026-09-13 §4.1): gate por sub-ruta, no por
// módulo — `PagePermissionGate` acepta un solo permiso y un técnico con
// `execution_orders.read` y sin `tasks.read` ve OT y no ve tareas. Precedente:
// apps/portal/src/app/dashboard/scheduling/layout.tsx.
import type { ReactNode } from 'react';
import { AccessPermissionKey } from '@iwana/shared';
import { PagePermissionGate } from '@/components/access-control/PagePermissionGate';

export default function OperationsTasksLayout({ children }: { children: ReactNode }) {
  return (
    <PagePermissionGate permission={AccessPermissionKey.OPERATIONS_TASKS_READ}>
      {children}
    </PagePermissionGate>
  );
}
