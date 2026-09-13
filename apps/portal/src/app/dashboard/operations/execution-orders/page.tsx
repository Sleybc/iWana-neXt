// apps/portal/src/app/dashboard/operations/execution-orders/page.tsx
// Sub-ruta de OT de ejecución (spec 2026-09-13 §4.5). En F2 monta la consola
// vía `ExecutionOrdersClient` (deep links `?executionOrderId=` vivos); la
// bandeja de OT se cablea en F5. Suspense alrededor del cliente: lee la query
// vía `useSearchParams` (D-A8).
import { Suspense } from 'react';
import { ExecutionOrdersClient } from '@/components/operations/ExecutionOrdersClient';
import { PortalSkeletonBlock } from '@/components/shared/portal-ui';

export default function OperationsExecutionOrdersPage() {
  return (
    <Suspense fallback={<PortalSkeletonBlock className="h-48" />}>
      <ExecutionOrdersClient />
    </Suspense>
  );
}
