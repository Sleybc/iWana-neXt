// apps/portal/src/app/dashboard/operations/tasks/new/page.tsx
// Alta de tarea (spec 2026-09-13 §4.5; CA-07: entrar a crear no monta el
// árbol de la OT). El gate hereda de tasks/layout (OPERATIONS_TASKS_READ).
// Suspense alrededor del cliente: `TaskIntakeClient` lee la query
// (`?ticketId=&fromAssurance=1`) vía `useSearchParams` (D-A8).
import { Suspense } from 'react';
import { TaskIntakeClient } from '@/components/operations/TaskIntakeClient';
import { PortalSkeletonBlock } from '@/components/shared/portal-ui';

export default function OperationsNewTaskPage() {
  return (
    <Suspense fallback={<PortalSkeletonBlock className="h-48" />}>
      <TaskIntakeClient />
    </Suspense>
  );
}
