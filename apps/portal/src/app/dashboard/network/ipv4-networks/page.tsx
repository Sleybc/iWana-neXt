import { Suspense } from 'react';
import { Ipv4NetworkCatalogClient } from '@/components/network/Ipv4NetworkCatalogClient';
import { PortalSkeletonBlock } from '@/components/shared/portal-ui';

export const metadata = {
  title: 'Redes IPv4 | Portal Empresarial',
  description: 'Consulta y administra redes IPv4 y su ocupación.',
};

export default function Ipv4NetworksPage() {
  return (
    <Suspense fallback={<PortalSkeletonBlock className="h-96" />}>
      <Ipv4NetworkCatalogClient />
    </Suspense>
  );
}
