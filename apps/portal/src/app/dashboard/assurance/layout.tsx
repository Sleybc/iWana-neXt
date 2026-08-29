// apps/portal/src/app/dashboard/assurance/layout.tsx
// Gate de página Mesa de ayuda (spec MOD00 §2.2 #3): assurance.tickets.read.
import type { ReactNode } from 'react';
import { AccessPermissionKey } from '@iwana/shared';
import { PagePermissionGate } from '@/components/access-control/PagePermissionGate';

export default function AssuranceLayout({ children }: { children: ReactNode }) {
  return (
    <PagePermissionGate permission={AccessPermissionKey.ASSURANCE_TICKETS_READ}>
      {children}
    </PagePermissionGate>
  );
}
