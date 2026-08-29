// apps/portal/src/app/dashboard/commercial/layout.tsx
// Gate de página Comercial (spec MOD00 §2.2 #5): commercial.catalog.read.
import type { ReactNode } from 'react';
import { AccessPermissionKey } from '@iwana/shared';
import { PagePermissionGate } from '@/components/access-control/PagePermissionGate';

export default function CommercialLayout({ children }: { children: ReactNode }) {
  return (
    <PagePermissionGate permission={AccessPermissionKey.COMMERCIAL_CATALOG_READ}>
      {children}
    </PagePermissionGate>
  );
}
