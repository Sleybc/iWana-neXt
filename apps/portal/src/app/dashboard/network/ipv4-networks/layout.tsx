import type { ReactNode } from 'react';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { PagePermissionGate } from '@/components/access-control/PagePermissionGate';

const NETWORK_CATALOG_ROLES = [UserRole.ADMIN, UserRole.NOC];

export default function Ipv4NetworksLayout({ children }: { children: ReactNode }) {
  return (
    <PagePermissionGate
      permission={AccessPermissionKey.NETWORK_CATALOG_READ}
      allowedRoles={NETWORK_CATALOG_ROLES}
    >
      {children}
    </PagePermissionGate>
  );
}
