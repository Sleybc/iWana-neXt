import type { ReactNode } from 'react';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { PagePermissionGate } from '@/components/access-control/PagePermissionGate';

const PROVISIONING_ROLES = [UserRole.ADMIN, UserRole.NOC];

export default function NetworkProvisioningLayout({ children }: { children: ReactNode }) {
  return (
    <PagePermissionGate
      permission={AccessPermissionKey.NETWORK_PROVISIONING_READ}
      allowedRoles={PROVISIONING_ROLES}
    >
      {children}
    </PagePermissionGate>
  );
}
