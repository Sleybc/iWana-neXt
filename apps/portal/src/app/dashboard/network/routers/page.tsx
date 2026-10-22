import { Suspense } from 'react';
import { NetworkRouterCatalogClient } from '@/components/network/NetworkRouterCatalogClient';
import { PortalSkeletonBlock } from '@/components/shared/portal-ui';

export const metadata = {
  title: 'Routers | Portal Empresarial',
  description: 'Consulta y administra el catálogo de routers de la empresa.',
};

export default function NetworkRoutersPage() {
  return (
    <Suspense fallback={<PortalSkeletonBlock className="h-96" />}>
      <NetworkRouterCatalogClient />
    </Suspense>
  );
}
