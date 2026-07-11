'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { CommercialTabLayout } from '@/components/commercial/CommercialTabLayout';
import {
  buildCommercialTabQuery,
  resolveCommercialRoute,
  type CommercialTab,
  type OffersSubTab,
  type ResolvedCommercialRoute,
  type TaxationSubTab,
} from '@/components/commercial/commercial-tab-params';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';

function CommercialSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <PortalSkeletonBlock className="h-20" />
      <PortalSkeletonBlock className="h-96" />
    </div>
  );
}

interface CommercialClientProps {
  initialTab?: string;
}

function syncRouteToUrl(
  pathname: string,
  router: ReturnType<typeof useRouter>,
  searchParams: URLSearchParams,
  route: ResolvedCommercialRoute,
) {
  const nextSearchParams = new URLSearchParams(searchParams.toString());
  const nextTab = buildCommercialTabQuery(route);

  if (nextTab) {
    nextSearchParams.set('tab', nextTab);
  } else {
    nextSearchParams.delete('tab');
  }

  const nextQuery = nextSearchParams.toString();
  router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
}

export function CommercialClient({ initialTab }: CommercialClientProps) {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [route, setRoute] = useState<ResolvedCommercialRoute>(() =>
    resolveCommercialRoute(initialTab ?? searchParams.get('tab')),
  );

  const canEdit = user?.role === 'ADMIN';

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') ?? initialTab;
    setRoute((current) => {
      const nextRoute = resolveCommercialRoute(tabFromUrl);
      if (
        current.tab === nextRoute.tab &&
        current.taxationSubTab === nextRoute.taxationSubTab &&
        current.offersSubTab === nextRoute.offersSubTab
      ) {
        return current;
      }

      return nextRoute;
    });
  }, [initialTab, searchParams]);

  const updateRoute = useCallback(
    (nextRoute: ResolvedCommercialRoute) => {
      setRoute(nextRoute);
      syncRouteToUrl(pathname, router, searchParams, nextRoute);
    },
    [pathname, router, searchParams],
  );

  const handleTabChange = useCallback(
    (tab: CommercialTab) => {
      updateRoute({
        tab,
        taxationSubTab: route.taxationSubTab,
        offersSubTab: route.offersSubTab,
      });
    },
    [route.offersSubTab, route.taxationSubTab, updateRoute],
  );

  const handleTaxationSubTabChange = useCallback(
    (taxationSubTab: TaxationSubTab) => {
      updateRoute({
        tab: 'taxation',
        taxationSubTab,
        offersSubTab: route.offersSubTab,
      });
    },
    [route.offersSubTab, updateRoute],
  );

  const handleOffersSubTabChange = useCallback(
    (offersSubTab: OffersSubTab) => {
      updateRoute({
        tab: 'offers',
        taxationSubTab: route.taxationSubTab,
        offersSubTab,
      });
    },
    [route.taxationSubTab, updateRoute],
  );

  if (authLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Comercial"
          subtitle="Cargando catálogo comercial y reglas operativas de la empresa autenticada"
        />
        <CommercialSkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="Comercial" subtitle="Error al cargar el módulo" />
        <PortalAlert
          variant="error"
          title="Módulo temporalmente no disponible"
          description="No fue posible resolver la sesión del portal para cargar el módulo Comercial. Inicia sesión nuevamente para recuperar el acceso al catálogo comercial del portal empresarial."
          icon={AlertTriangle}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comercial"
        subtitle="Gestiona catálogo, precios vigentes y reglas operativas."
      />
      <CommercialTabLayout
        canEdit={canEdit}
        activeTab={route.tab}
        taxationSubTab={route.taxationSubTab}
        offersSubTab={route.offersSubTab}
        onTabChange={handleTabChange}
        onTaxationSubTabChange={handleTaxationSubTabChange}
        onOffersSubTabChange={handleOffersSubTabChange}
      />
    </div>
  );
}
