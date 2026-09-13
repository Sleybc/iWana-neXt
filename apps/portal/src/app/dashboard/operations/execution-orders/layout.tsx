// apps/portal/src/app/dashboard/operations/execution-orders/layout.tsx
// Gate de la sub-ruta Órdenes de ejecución (spec 2026-09-13 §4.1): gate por
// sub-ruta, no por módulo. Precedente:
// apps/portal/src/app/dashboard/scheduling/layout.tsx.
import type { ReactNode } from 'react';
import { AccessPermissionKey } from '@iwana/shared';
import { PagePermissionGate } from '@/components/access-control/PagePermissionGate';

export default function OperationsExecutionOrdersLayout({ children }: { children: ReactNode }) {
  return (
    <PagePermissionGate permission={AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ}>
      {children}
    </PagePermissionGate>
  );
}
