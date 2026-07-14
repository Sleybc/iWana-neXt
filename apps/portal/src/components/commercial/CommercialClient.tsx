'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@iwana/ui';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { CommercialTabLayout } from '@/components/commercial/CommercialTabLayout';
import { CommercialDashboard } from '@/components/commercial/CommercialDashboard';
import {
  buildCommercialTabQuery,
  resolveCommercialRoute,
  type CommercialTab,
  type OffersSubTab,
  type ResolvedCommercialRoute,
  type TaxationSubTab,
} from '@/components/commercial/commercial-tab-params';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { ApiError, commercialApi, type CommercialDashboardSummary } from '@/lib/api-client';

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

function mapSummaryError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return 'No fue posible cargar el resumen comercial. Intenta de nuevo.';
}

export function CommercialClient({ initialTab }: CommercialClientProps) {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [route, setRoute] = useState<ResolvedCommercialRoute>(() =>
    resolveCommercialRoute(initialTab ?? searchParams.get('tab')),
  );
  const [summary, setSummary] = useState<CommercialDashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const canEdit = user?.role === 'ADMIN';

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);

    try {
      const data = await commercialApi.getDashboardSummary();
      setSummary(data);
    } catch (error) {
      setSummary(null);
      setSummaryError(mapSummaryError(error));
    } finally {
      setSummaryLoading(false);
    }
  }, []);

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

  useEffect(() => {
    if (!user) {
      return;
    }

    void loadSummary();
  }, [loadSummary, refreshToken, user]);

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

  const handleRefresh = useCallback(() => {
    setRefreshToken((current) => current + 1);
  }, []);

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
        actions={
          <Button variant="secondary" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Actualizar
          </Button>
        }
      />

      {summaryError && route.tab === 'summary' && (
        <PortalAlert
          variant="error"
          title="Resumen no disponible"
          description={summaryError}
          icon={AlertTriangle}
        />
      )}

      <CommercialTabLayout
        canEdit={canEdit}
        activeTab={route.tab}
        taxationSubTab={route.taxationSubTab}
        offersSubTab={route.offersSubTab}
        summary={<CommercialDashboard summary={summary} isLoading={summaryLoading} />}
        onTabChange={handleTabChange}
        onTaxationSubTabChange={handleTaxationSubTabChange}
        onOffersSubTabChange={handleOffersSubTabChange}
      />
    </div>
  );
}
