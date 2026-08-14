'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@iwana/ui';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { CommercialTabLayout } from '@/components/commercial/CommercialTabLayout';
import { CommercialAlertsStrip } from '@/components/commercial/CommercialAlertsStrip';
import {
  applyCommercialFocusToSearchParams,
  applyCommercialOfferStatusToSearchParams,
  buildCommercialTabQuery,
  needsCommercialUrlCanonicalization,
  parseCommercialFocusId,
  parseCommercialOfferStatusFromSearchParams,
  resolveCommercialRoute,
  type CommercialOfferStatusFilter,
  type CommercialTab,
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
  method: 'push' | 'replace' = 'replace',
) {
  const nextSearchParams = new URLSearchParams(searchParams.toString());
  const nextTab = buildCommercialTabQuery(route);

  if (nextTab) {
    nextSearchParams.set('tab', nextTab);
  } else {
    nextSearchParams.delete('tab');
  }

  applyCommercialOfferStatusToSearchParams(nextSearchParams, route.status ?? null);
  applyCommercialFocusToSearchParams(nextSearchParams, route.focus ?? null);

  const nextQuery = nextSearchParams.toString();
  router[method](nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
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
    (a.status ?? null) === (b.status ?? null) &&
    (a.focus ?? null) === (b.focus ?? null)
  );
}

export function CommercialClient({ initialTab }: CommercialClientProps) {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [route, setRoute] = useState<ResolvedCommercialRoute>(() => ({
    ...resolveCommercialRoute(initialTab ?? searchParams.get('tab')),
    status: parseCommercialOfferStatusFromSearchParams(searchParams),
    focus: parseCommercialFocusId(searchParams.get('focus')),
  }));
  const [summary, setSummary] = useState<CommercialDashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

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
    const rawTabInUrl = searchParams.get('tab');
    const tabFromUrl = rawTabInUrl ?? initialTab;
    const statusFromUrl = parseCommercialOfferStatusFromSearchParams(searchParams);
    const focusFromUrl = parseCommercialFocusId(searchParams.get('focus'));
    const nextRoute: ResolvedCommercialRoute = {
      ...resolveCommercialRoute(tabFromUrl),
      status: statusFromUrl,
      focus: focusFromUrl,
    };

    setRoute((current) => {
      if (routesEqual(current, nextRoute)) {
        return current;
      }

      return nextRoute;
    });

    if (needsCommercialUrlCanonicalization(rawTabInUrl, nextRoute)) {
      syncRouteToUrl(pathname, router, searchParams, nextRoute);
    }
  }, [initialTab, pathname, router, searchParams]);

  useEffect(() => {
    if (!user) {
      return;
    }

    void loadSummary();
  }, [loadSummary, user]);

  const updateRoute = useCallback(
    (nextRoute: ResolvedCommercialRoute) => {
      // El cambio de tab es una navegación real (push); el resto son ajustes de la misma vista (replace).
      const method = nextRoute.tab !== route.tab ? 'push' : 'replace';
      setRoute(nextRoute);
      syncRouteToUrl(pathname, router, searchParams, nextRoute, method);
    },
    [pathname, route.tab, router, searchParams],
  );

  const handleTabChange = useCallback(
    (tab: CommercialTab) => {
      updateRoute({
        tab,
        taxationSubTab: route.taxationSubTab,
        status: null,
        focus: null,
      });
    },
    [route.taxationSubTab, updateRoute],
  );

  const handleNavigateTab = useCallback(
    (
      tab: CommercialTab,
      options?: { status?: CommercialOfferStatusFilter | null; focus?: string | null },
    ) => {
      updateRoute({
        tab,
        taxationSubTab: route.taxationSubTab,
        status: options?.status ?? null,
        focus: options?.focus ? parseCommercialFocusId(options.focus) : null,
      });
    },
    [route.taxationSubTab, updateRoute],
  );

  const handleFocusConsumed = useCallback(() => {
    if (!route.focus) {
      return;
    }

    updateRoute({
      ...route,
      focus: null,
    });
  }, [route, updateRoute]);

  const handleTaxationSubTabChange = useCallback(
    (taxationSubTab: TaxationSubTab) => {
      updateRoute({
        tab: 'taxation',
        taxationSubTab,
        status: null,
        focus: null,
      });
    },
    [updateRoute],
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

      {summaryError && (
        <PortalAlert
          variant="error"
          title="Resumen no disponible"
          description={summaryError}
          icon={AlertTriangle}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadSummary()}>
              Reintentar
            </Button>
          }
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
        focusId={route.focus ?? null}
        onFocusConsumed={handleFocusConsumed}
        onTabChange={handleTabChange}
        onTaxationSubTabChange={handleTaxationSubTabChange}
      />
    </div>
  );
}
