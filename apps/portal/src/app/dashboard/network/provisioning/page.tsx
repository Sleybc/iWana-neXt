import { Suspense } from 'react';
import { NetworkProvisioningInboxClient } from '@/components/network/NetworkProvisioningInboxClient';
import { PortalSkeletonBlock } from '@/components/shared/portal-ui';

export const metadata = {
  title: 'Bandeja de aprovisionamiento | Portal Empresarial',
  description: 'Revisa instalaciones pendientes de aprovisionamiento.',
};

export default function NetworkProvisioningPage() {
  return (
    <Suspense fallback={<PortalSkeletonBlock className="h-96" />}>
      <NetworkProvisioningInboxClient />
    </Suspense>
  );
}
