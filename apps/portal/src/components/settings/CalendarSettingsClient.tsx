'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { UserRole } from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  organizationApi,
  type OrganizationBusinessHoursExceptionSnapshot,
  type OrganizationCompanyBusinessHoursDay,
  type OrganizationSiteSummary,
} from '@/lib/api-client';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { CALENDAR_SETTINGS_COPY } from './mod00-settings-labels';
import { CalendarOrganizationHoursPanel } from './CalendarOrganizationHoursPanel';
import { CalendarSiteHoursPanel } from './CalendarSiteHoursPanel';
import { CalendarExceptionsPanel } from './CalendarExceptionsPanel';
import { CalendarWfmPanel } from './CalendarWfmPanel';
import { OperationalEventualitiesPanel } from './OperationalEventualitiesPanel';

const calendarReadableRoles = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.NOC,
  UserRole.SUPPORT,
  UserRole.ACCOUNTANT,
  UserRole.HR,
]);

export function CalendarSettingsClient() {
  const { user, isLoading: authLoading } = useAuth();
  const [companyHours, setCompanyHours] = useState<OrganizationCompanyBusinessHoursDay[]>([]);
  const [sites, setSites] = useState<OrganizationSiteSummary[]>([]);
  const [exceptions, setExceptions] = useState<OrganizationBusinessHoursExceptionSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canEdit = user?.role === UserRole.ADMIN;
  const canRead = user?.role ? calendarReadableRoles.has(user.role as UserRole) : false;

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Carga los tres recursos en paralelo para minimizar latencia
      const [hoursResult, sitesResult, exceptionsResult] = await Promise.allSettled([
        organizationApi.getCompanyHours(),
        organizationApi.list(),
        organizationApi.getExceptions(),
      ]);

      if (hoursResult.status === 'fulfilled') {
        setCompanyHours(hoursResult.value);
      }

      if (sitesResult.status === 'fulfilled') {
        setSites(sitesResult.value);
      }

      if (exceptionsResult.status === 'fulfilled') {
        setExceptions(exceptionsResult.value);
      }

      // Si los tres fallan, muestra error global
      if (
        hoursResult.status === 'rejected' &&
        sitesResult.status === 'rejected' &&
        exceptionsResult.status === 'rejected'
      ) {
        setError('No fue posible cargar el calendario operativo. Intenta nuevamente.');
      }
    } catch {
      setError('No fue posible cargar el calendario operativo.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!user || !canRead) {
      setIsLoading(false);
      return;
    }

    void loadData();
  }, [authLoading, canRead, loadData, user]);

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Calendario operativo y jornadas"
          subtitle={CALENDAR_SETTINGS_COPY.loadingSubtitle}
        />
        <PortalSkeletonBlock className="h-36" />
        <PortalSkeletonBlock className="h-80" />
        <PortalSkeletonBlock className="h-48" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="Calendario operativo y jornadas" subtitle="Sesión no disponible" />
        <PortalAlert
          variant="error"
          title="No fue posible abrir la vista"
          description="Inicia sesión nuevamente para consultar esta sección."
        />
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Calendario operativo y jornadas" subtitle="Acceso restringido" />
        <PortalAlert
          variant="info"
          title="Sin autorización"
          description="Tu rol no puede consultar el calendario operativo."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendario operativo y jornadas"
        subtitle={CALENDAR_SETTINGS_COPY.pageSubtitle}
        actions={
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden={true} />
            Actualizar
          </button>
        }
      />

      {error ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar el calendario"
          description={error}
          action={
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-2 text-sm font-medium text-red-700 underline decoration-red-300 underline-offset-4 hover:no-underline dark:text-red-300"
            >
              <RefreshCcw className="h-4 w-4" aria-hidden={true} />
              Reintentar
            </button>
          }
        />
      ) : null}

      <CalendarOrganizationHoursPanel
        companyHours={companyHours}
        canEdit={canEdit}
        onUpdated={setCompanyHours}
      />

      <CalendarSiteHoursPanel sites={sites} canEdit={canEdit} />

      <CalendarExceptionsPanel
        exceptions={exceptions}
        sites={sites}
        canEdit={canEdit}
        onCreated={(exc) => setExceptions((current) => [...current, exc])}
        onDeleted={(id) => setExceptions((current) => current.filter((e) => e.id !== id))}
      />

      <CalendarWfmPanel />

      <OperationalEventualitiesPanel canEdit={canEdit} />
    </div>
  );
}
