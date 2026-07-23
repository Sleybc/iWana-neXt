'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@iwana/ui';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { CommercialTabLayout } from '@/components/commercial/CommercialTabLayout';
import { CommercialActivityPanel } from '@/components/commercial/CommercialActivityPanel';
import { CommercialAlertsStrip } from '@/components/commercial/CommercialAlertsStrip';
import {
  applyCommercialOfferStatusToSearchParams,
  buildCommercialTabQuery,
  needsCommercialUrlCanonicalization,
  parseCommercialOfferStatus,
  resolveCommercialRoute,
  type CommercialOfferStatusFilter,
  type CommercialTab,
  type ResolvedCommercialRoute,
  type TaxationSubTab,
} from '@/components/commercial/commercial-tab-params';
import { PortalAlert, PortalSidePeek, PortalSkeletonBlock } from '@/components/shared/portal-ui';
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

  applyCommercialOfferStatusToSearchParams(nextSearchParams, route.status ?? null);

  const nextQuery = nextSearchParams.toString();
  router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
}

function mapSummaryError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return 'No fue posible cargar el resumen comercial. Intenta de nuevo.';
}

function routesEqual(a: ResolvedCommercialRoute, b: ResolvedCommercialRoute): boolean {
  return (
    a.tab === b.tab &&
    a.taxationSubTab === b.taxationSubTab &&
    (a.status ?? null) === (b.status ?? null)
  );
}

export function CommercialClient({ initialTab }: CommercialClientProps) {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [route, setRoute] = useState<ResolvedCommercialRoute>(() => ({
    ...resolveCommercialRoute(initialTab ?? searchParams.get('tab')),
    status: parseCommercialOfferStatus(searchParams.get('status')),
  }));
  const [summary, setSummary] = useState<CommercialDashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [isActivityOpen, setIsActivityOpen] = useState(false);

  const canEdit = user?.role === 'ADMIN';
  const attentionCount = useMemo(() => summary?.attentionItems.length ?? 0, [summary]);

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
    const rawTabInUrl = searchParams.get('tab');
    const tabFromUrl = rawTabInUrl ?? initialTab;
    const statusFromUrl = parseCommercialOfferStatus(searchParams.get('status'));
    const nextRoute: ResolvedCommercialRoute = {
      ...resolveCommercialRoute(tabFromUrl),
      status: statusFromUrl,
    };

    setRoute((current) => {
      if (routesEqual(current, nextRoute)) {
        return current;
      }

      return nextRoute;
    });

    // Reescribe aliases legacy (`summary`, `offers`, `tab=plans` explícito) a la query canónica.
    if (needsCommercialUrlCanonicalization(rawTabInUrl, nextRoute)) {
      syncRouteToUrl(pathname, router, searchParams, nextRoute);
    }
  }, [initialTab, pathname, router, searchParams]);

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
        status: null,
      });
    },
    [route.taxationSubTab, updateRoute],
  );

  const handleNavigateTab = useCallback(
    (tab: CommercialTab, options?: { status?: CommercialOfferStatusFilter | null }) => {
      updateRoute({
        tab,
        taxationSubTab: route.taxationSubTab,
        status: options?.status ?? null,
      });
    },
    [route.taxationSubTab, updateRoute],
  );

  const handleTaxationSubTabChange = useCallback(
    (taxationSubTab: TaxationSubTab) => {
      updateRoute({
        tab: 'taxation',
        taxationSubTab,
        status: null,
      });
    },
    [updateRoute],
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
          <>
            <Button
              variant={attentionCount > 0 ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setIsActivityOpen(true)}
              aria-label={
                attentionCount > 0
                  ? `Actividad comercial, ${attentionCount} ${attentionCount === 1 ? 'ítem requiere' : 'ítems requieren'} atención`
                  : 'Actividad comercial'
              }
            >
              <Activity className="h-4 w-4" aria-hidden="true" />
              Actividad
              {attentionCount > 0 && (
                <span className="ml-1 rounded-full bg-iwana-surface-soft px-2 py-0.5 font-mono text-xs tabular-nums text-amber-700 dark:bg-dark-surface-3 dark:text-amber-300">
                  {attentionCount}
                </span>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Actualizar
            </Button>
          </>
        }
      />

      {summaryError && (
        <PortalAlert
          variant="error"
          title="Resumen no disponible"
          description={summaryError}
          icon={AlertTriangle}
        />
      )}

      <CommercialAlertsStrip
        summary={summary}
        isLoading={summaryLoading}
        onNavigateTab={handleNavigateTab}
      />

      <CommercialTabLayout
        canEdit={canEdit}
        activeTab={route.tab}
        taxationSubTab={route.taxationSubTab}
        onTabChange={handleTabChange}
        onTaxationSubTabChange={handleTaxationSubTabChange}
      />

      <PortalSidePeek
        open={isActivityOpen}
        onClose={() => setIsActivityOpen(false)}
        title="Actividad comercial"
        description="Qué requiere atención y qué cambió en los últimos 7 días."
      >
        <CommercialActivityPanel
          summary={summary}
          isLoading={summaryLoading}
          onNavigateTab={(tab, options) => {
            setIsActivityOpen(false);
            handleNavigateTab(tab, options);
          }}
          onRetry={handleRefresh}
        />
      </PortalSidePeek>
    </div>
  );
}
