// apps/portal/src/app/dashboard/crm/expedientes/layout.tsx
// Gate de página Oportunidades (spec MOD00 §2.2 #2): crm.expedientes.read.
// La ruta padre gatea y la subruta /[id] hereda.
import type { ReactNode } from 'react';
import { AccessPermissionKey } from '@iwana/shared';
import { PagePermissionGate } from '@/components/access-control/PagePermissionGate';

export default function CrmExpedientesLayout({ children }: { children: ReactNode }) {
  return (
    <PagePermissionGate permission={AccessPermissionKey.CRM_EXPEDIENTES_READ}>
      {children}
    </PagePermissionGate>
  );
}
