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
import { PortalAlert, PortalPanel, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import {
  CALENDAR_SETTINGS_COPY,
  getCalendarOperationalStatusSummary,
} from './mod00-settings-labels';
import { CalendarOrganizationHoursPanel } from './CalendarOrganizationHoursPanel';
import { CalendarSiteHoursPanel } from './CalendarSiteHoursPanel';
import { CalendarExceptionsPanel } from './CalendarExceptionsPanel';
import { OperationalEventualitiesPanel } from './OperationalEventualitiesPanel';

const calendarReadableRoles = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.NOC,
  UserRole.SUPPORT,
  UserRole.ACCOUNTANT,
  UserRole.HR,
]);

interface CalendarResourceErrors {
  companyHours: string | null;
  sites: string | null;
  exceptions: string | null;
}

const emptyResourceErrors: CalendarResourceErrors = {
  companyHours: null,
  sites: null,
  exceptions: null,
};

export function CalendarSettingsClient() {
  const { user, isLoading: authLoading } = useAuth();
  const [companyHours, setCompanyHours] = useState<OrganizationCompanyBusinessHoursDay[]>([]);
  const [sites, setSites] = useState<OrganizationSiteSummary[]>([]);
  const [exceptions, setExceptions] = useState<OrganizationBusinessHoursExceptionSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resourceErrors, setResourceErrors] = useState<CalendarResourceErrors>(emptyResourceErrors);

  const canEdit = user?.role === UserRole.ADMIN;
  const canRead = user?.role ? calendarReadableRoles.has(user.role as UserRole) : false;
  const activeSitesCount = sites.filter((site) => site.isActive).length;
  const openDaysCount = companyHours.filter((day) => day.isOpen).length;
  const hasPartialLoadFailure = Object.values(resourceErrors).some(
    (resourceError) => resourceError,
  );
  const operationalStatusSummary = hasPartialLoadFailure
    ? CALENDAR_SETTINGS_COPY.pagePartialStatus
    : getCalendarOperationalStatusSummary({
        openDaysCount,
        activeSitesCount,
        exceptionCount: exceptions.length,
      });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setResourceErrors(emptyResourceErrors);

    try {
      // Carga los tres recursos en paralelo para minimizar latencia
      const [hoursResult, sitesResult, exceptionsResult] = await Promise.allSettled([
        organizationApi.getCompanyHours(),
        organizationApi.list(),
        organizationApi.getExceptions(),
      ]);

      if (hoursResult.status === 'fulfilled') {
        setCompanyHours(hoursResult.value);
      } else {
        setCompanyHours([]);
      }

      if (sitesResult.status === 'fulfilled') {
        setSites(sitesResult.value);
      } else {
        setSites([]);
      }

      if (exceptionsResult.status === 'fulfilled') {
        setExceptions(exceptionsResult.value);
      } else {
        setExceptions([]);
      }

      setResourceErrors({
        companyHours:
          hoursResult.status === 'rejected' ? CALENDAR_SETTINGS_COPY.organizationLoadError : null,
        sites: sitesResult.status === 'rejected' ? CALENDAR_SETTINGS_COPY.siteLoadError : null,
        exceptions:
          exceptionsResult.status === 'rejected'
            ? CALENDAR_SETTINGS_COPY.exceptionsLoadError
            : null,
      });

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
          title={CALENDAR_SETTINGS_COPY.pageTitle}
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
        <PageHeader
          title={CALENDAR_SETTINGS_COPY.pageTitle}
          subtitle={CALENDAR_SETTINGS_COPY.sessionUnavailableSubtitle}
        />
        <PortalAlert
          variant="error"
          title={CALENDAR_SETTINGS_COPY.sessionUnavailableTitle}
          description={CALENDAR_SETTINGS_COPY.sessionUnavailableDescription}
        />
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={CALENDAR_SETTINGS_COPY.pageTitle}
          subtitle={CALENDAR_SETTINGS_COPY.restrictedSubtitle}
        />
        <PortalAlert
          variant="info"
          title={CALENDAR_SETTINGS_COPY.restrictedTitle}
          description={CALENDAR_SETTINGS_COPY.restrictedDescription}
        />
      </div>
    );
  }

  function renderUnavailablePanel({
    eyebrow,
    title,
    description,
    unavailableDescription,
  }: {
    eyebrow: string;
    title: string;
    description: string;
    unavailableDescription: string;
  }) {
    return (
      <PortalPanel eyebrow={eyebrow} title={title} description={description}>
        <PortalAlert
          variant="warning"
          title="Bloque temporalmente no disponible"
          description={unavailableDescription}
        />
      </PortalPanel>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={CALENDAR_SETTINGS_COPY.pageTitle}
        subtitle={CALENDAR_SETTINGS_COPY.pageSubtitle}
        actions={
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-1.5 text-sm font-medium text-gray-500 transition hover:border-gray-200 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:border-dark-border dark:hover:bg-dark-surface-3 dark:hover:text-white"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden={true} />
            {CALENDAR_SETTINGS_COPY.refreshAction}
          </button>
        }
      />

      <div
        data-testid="calendar-operational-status"
        className="rounded-2xl border border-gray-200/80 bg-iwana-surface-soft/75 px-4 py-2.5 dark:border-dark-border dark:bg-dark-surface-3/60"
      >
        <p className="portal-eyebrow text-iwana-secondary-700 dark:text-iwana-secondary-400">
          {CALENDAR_SETTINGS_COPY.pageStatusEyebrow}
        </p>
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{operationalStatusSummary}</p>
      </div>

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

      <section
        data-testid="calendar-shell-grid"
        className="grid gap-4 xl:grid-cols-2 xl:items-start"
        aria-label="Distribución del calendario operativo"
      >
        <div
          data-testid="calendar-shell-primary"
          className="space-y-0 [&>*:first-child]:rounded-b-none [&>*:last-child]:rounded-t-none [&>*:last-child]:border-t-0"
          aria-label="Columna izquierda del calendario operativo"
        >
          {resourceErrors.companyHours ? (
            renderUnavailablePanel({
              eyebrow: CALENDAR_SETTINGS_COPY.organizationEyebrow,
              title: CALENDAR_SETTINGS_COPY.organizationTitle,
              description: CALENDAR_SETTINGS_COPY.organizationDescription,
              unavailableDescription: resourceErrors.companyHours,
            })
          ) : (
            <CalendarOrganizationHoursPanel
              companyHours={companyHours}
              canEdit={canEdit}
              onUpdated={setCompanyHours}
            />
          )}

          {resourceErrors.sites || resourceErrors.exceptions ? (
            renderUnavailablePanel({
              eyebrow: CALENDAR_SETTINGS_COPY.exceptionsEyebrow,
              title: CALENDAR_SETTINGS_COPY.exceptionsTitle,
              description: CALENDAR_SETTINGS_COPY.exceptionsDescription,
              unavailableDescription:
                resourceErrors.exceptions ??
                resourceErrors.sites ??
                CALENDAR_SETTINGS_COPY.exceptionsLoadError,
            })
          ) : (
            <CalendarExceptionsPanel
              exceptions={exceptions}
              sites={sites}
              canEdit={canEdit}
              onCreated={(exc) => setExceptions((current) => [...current, exc])}
              onDeleted={(id) => setExceptions((current) => current.filter((e) => e.id !== id))}
            />
          )}
        </div>

        <div
          data-testid="calendar-shell-secondary"
          className="space-y-0 [&>*:first-child]:rounded-b-none [&>*:last-child]:rounded-t-none [&>*:last-child]:border-t-0"
          aria-label="Columna derecha del calendario operativo"
        >
          {resourceErrors.sites ? (
            renderUnavailablePanel({
              eyebrow: CALENDAR_SETTINGS_COPY.siteEyebrow,
              title: CALENDAR_SETTINGS_COPY.sitePanelTitle,
              description: CALENDAR_SETTINGS_COPY.sitePanelDescription,
              unavailableDescription: resourceErrors.sites,
            })
          ) : (
            <CalendarSiteHoursPanel sites={sites} canEdit={canEdit} />
          )}

          <OperationalEventualitiesPanel canEdit={canEdit} />
        </div>
      </section>
    </div>
  );
}
