// apps/portal/src/app/dashboard/scheduling/layout.tsx
// Gate de página Programación (spec MOD00 §2.2 #6): wfm.schedule.read.
// La ruta padre gatea y las subrutas (/agenda, /pending-visits,
// /unrealized-visits) heredan.
import type { ReactNode } from 'react';
import { AccessPermissionKey } from '@iwana/shared';
import { PagePermissionGate } from '@/components/access-control/PagePermissionGate';

export default function SchedulingLayout({ children }: { children: ReactNode }) {
  return (
    <PagePermissionGate permission={AccessPermissionKey.WFM_SCHEDULE_READ}>
      {children}
    </PagePermissionGate>
  );
}
