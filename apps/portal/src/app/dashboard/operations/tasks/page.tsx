// apps/portal/src/app/dashboard/operations/tasks/page.tsx
// Bandeja de tareas (spec 2026-09-13 §4.5). Suspense alrededor del cliente:
// `TasksInboxClient` lee la query (`?taskId=`) vía `useSearchParams` (D-A8).
import { Suspense } from 'react';
import { TasksInboxClient } from '@/components/operations/TasksInboxClient';
import { PortalSkeletonBlock } from '@/components/shared/portal-ui';

export default function OperationsTasksPage() {
  return (
    <Suspense fallback={<PortalSkeletonBlock className="h-48" />}>
      <TasksInboxClient />
    </Suspense>
  );
}
