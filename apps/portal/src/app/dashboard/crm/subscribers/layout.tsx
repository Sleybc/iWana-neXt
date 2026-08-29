// apps/portal/src/app/dashboard/crm/subscribers/layout.tsx
// Gate de página Suscriptores (spec MOD00 §2.2 #1): crm.subscribers.read.
// La ruta padre gatea y las subrutas (/new, /[id]) heredan; /dashboard/subscribers
// es redirect a esta ruta y hereda el gate tras el redirect.
import type { ReactNode } from 'react';
import { AccessPermissionKey } from '@iwana/shared';
import { PagePermissionGate } from '@/components/access-control/PagePermissionGate';

export default function CrmSubscribersLayout({ children }: { children: ReactNode }) {
  return (
    <PagePermissionGate permission={AccessPermissionKey.CRM_SUBSCRIBERS_READ}>
      {children}
    </PagePermissionGate>
  );
}
