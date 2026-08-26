'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { UserRole } from '@iwana/shared';
import { Button } from '@iwana/ui';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  organizationApi,
  type OrganizationBusinessHoursExceptionSnapshot,
  type OrganizationCompanyBusinessHoursDay,
  type OrganizationSiteSummary,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalPanel,
  PortalSkeletonBlock,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';
import { CALENDAR_SETTINGS_COPY } from './mod00-settings-labels';
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

interface CalendarResourceLoaded {
  companyHours: boolean;
  sites: boolean;
  exceptions: boolean;
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resourceErrors, setResourceErrors] = useState<CalendarResourceErrors>(emptyResourceErrors);
  const [loadedResources, setLoadedResources] = useState<CalendarResourceLoaded>({
    companyHours: false,
    sites: false,
    exceptions: false,
  });
  const [pendingChanges, setPendingChanges] = useState({ organization: false, site: false });
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const loadRequestSequenceRef = useRef(0);

  const handleOrganizationDirtyChange = useCallback((isDirty: boolean) => {
    setPendingChanges((current) =>
      current.organization === isDirty ? current : { ...current, organization: isDirty },
    );
  }, []);
  const handleSiteDirtyChange = useCallback((isDirty: boolean) => {
    setPendingChanges((current) =>
      current.site === isDirty ? current : { ...current, site: isDirty },
    );
  }, []);

  const canEdit = user?.role === UserRole.ADMIN;
  const canRead = user?.role ? calendarReadableRoles.has(user.role as UserRole) : false;
  const loadData = useCallback(async (options?: { initial?: boolean }) => {
    const requestSequence = loadRequestSequenceRef.current + 1;
    loadRequestSequenceRef.current = requestSequence;
    const initial = options?.initial === true;

    if (initial) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);
    setResourceErrors(emptyResourceErrors);
    setRefreshNotice(null);

    try {
      // Carga los tres recursos en paralelo para minimizar latencia
      const [hoursResult, sitesResult, exceptionsResult] = await Promise.allSettled([
        organizationApi.getCompanyHours(),
        organizationApi.list({ page: 1, limit: 100 }),
        organizationApi.getExceptions(),
      ]);

      if (loadRequestSequenceRef.current !== requestSequence) return;

      if (hoursResult.status === 'fulfilled') {
        setCompanyHours(hoursResult.value);
        setLoadedResources((current) => ({ ...current, companyHours: true }));
      }

      if (sitesResult.status === 'fulfilled') {
        setSites(sitesResult.value.data);
        setLoadedResources((current) => ({ ...current, sites: true }));
      }

      if (exceptionsResult.status === 'fulfilled') {
        setExceptions(exceptionsResult.value);
        setLoadedResources((current) => ({ ...current, exceptions: true }));
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
        setError(CALENDAR_SETTINGS_COPY.calendarLoadError);
      }
    } catch {
      setError(CALENDAR_SETTINGS_COPY.calendarLoadError);
    } finally {
      if (loadRequestSequenceRef.current === requestSequence) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!user || !canRead) {
      setIsLoading(false);
      return;
    }

    void loadData({ initial: true });
  }, [authLoading, canRead, loadData, user]);

  function handleRefresh() {
    if (pendingChanges.organization || pendingChanges.site) {
      setRefreshNotice(CALENDAR_SETTINGS_COPY.refreshPendingChangesWarning);
      return;
    }

    void loadData();
  }

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6" aria-busy={true}>
        <p className="sr-only" role="status">
          {CALENDAR_SETTINGS_COPY.calendarLoadingAnnouncement}
        </p>
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
    className,
  }: {
    eyebrow: string;
    title: string;
    description: string;
    unavailableDescription: string;
    className?: string | undefined;
  }) {
    return (
      <PortalPanel className={className} eyebrow={eyebrow} title={title} description={description}>
        <PortalAlert
          variant="warning"
          title={CALENDAR_SETTINGS_COPY.calendarBlockUnavailableTitle}
          description={unavailableDescription}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={interactiveFocusClassName}
              onClick={handleRefresh}
            >
              <RefreshCcw className="h-4 w-4" aria-hidden={true} />
              {CALENDAR_SETTINGS_COPY.calendarRetryAction}
            </Button>
          }
        />
      </PortalPanel>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={CALENDAR_SETTINGS_COPY.pageTitle}
        subtitle={CALENDAR_SETTINGS_COPY.pageSubtitle}
      />

      {refreshNotice ? <PortalAlert variant="warning" title={refreshNotice} /> : null}

      {error ? (
        <PortalAlert
          variant="error"
          live="assertive"
          title={CALENDAR_SETTINGS_COPY.calendarLoadFailedTitle}
          description={error}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              className={interactiveFocusClassName}
            >
              <RefreshCcw className="h-4 w-4" aria-hidden={true} />
              {CALENDAR_SETTINGS_COPY.calendarRetryAction}
            </Button>
          }
        />
      ) : null}

      <section
        data-testid="calendar-shell-grid"
        className="grid gap-8 xl:grid-cols-2 xl:items-start xl:gap-6"
        aria-label="Distribución del calendario operativo"
        aria-busy={isRefreshing}
      >
        <div
          data-testid="calendar-column-left"
          className="contents xl:col-start-1 xl:flex xl:flex-col xl:gap-6"
        >
          <div
            data-testid="calendar-step-1"
            role="group"
            aria-label={CALENDAR_SETTINGS_COPY.organizationTitle}
            className="order-1 min-w-0"
          >
            {resourceErrors.companyHours && !loadedResources.companyHours ? (
              renderUnavailablePanel({
                eyebrow: CALENDAR_SETTINGS_COPY.organizationEyebrow,
                title: CALENDAR_SETTINGS_COPY.organizationTitle,
                description: CALENDAR_SETTINGS_COPY.organizationDescription,
                unavailableDescription: resourceErrors.companyHours,
              })
            ) : (
              <CalendarOrganizationHoursPanel
                companyHours={companyHours}
                canEdit={canEdit && !isRefreshing}
                onUpdated={setCompanyHours}
                onDirtyChange={handleOrganizationDirtyChange}
              />
            )}
            {resourceErrors.companyHours && loadedResources.companyHours ? (
              <PortalAlert variant="warning" title={resourceErrors.companyHours} />
            ) : null}
          </div>

          <div
            data-testid="calendar-step-3"
            role="group"
            aria-label={CALENDAR_SETTINGS_COPY.exceptionsTitle}
            className="order-3 min-w-0"
          >
            {resourceErrors.exceptions && !loadedResources.exceptions ? (
              renderUnavailablePanel({
                eyebrow: CALENDAR_SETTINGS_COPY.exceptionsEyebrow,
                title: CALENDAR_SETTINGS_COPY.exceptionsTitle,
                description: CALENDAR_SETTINGS_COPY.exceptionsDescription,
                unavailableDescription: resourceErrors.exceptions,
              })
            ) : (
              <CalendarExceptionsPanel
                exceptions={exceptions}
                sites={sites}
                canEdit={canEdit && !isRefreshing}
                onCreated={(exc) => setExceptions((current) => [...current, exc])}
                onDeleted={(id) => setExceptions((current) => current.filter((e) => e.id !== id))}
              />
            )}
            {resourceErrors.exceptions && loadedResources.exceptions ? (
              <PortalAlert variant="warning" title={resourceErrors.exceptions} />
            ) : null}
          </div>
        </div>

        <div
          data-testid="calendar-column-right"
          className="contents xl:col-start-2 xl:flex xl:flex-col xl:gap-6"
        >
          <div
            data-testid="calendar-step-2"
            role="group"
            aria-label={CALENDAR_SETTINGS_COPY.sitePanelTitle}
            className="order-2 min-w-0"
          >
            {resourceErrors.sites && !loadedResources.sites ? (
              renderUnavailablePanel({
                eyebrow: CALENDAR_SETTINGS_COPY.siteEyebrow,
                title: CALENDAR_SETTINGS_COPY.sitePanelTitle,
                description: CALENDAR_SETTINGS_COPY.sitePanelDescription,
                unavailableDescription: resourceErrors.sites,
              })
            ) : (
              <CalendarSiteHoursPanel
                sites={sites}
                canEdit={canEdit && !isRefreshing}
                onDirtyChange={handleSiteDirtyChange}
              />
            )}
            {resourceErrors.sites && loadedResources.sites ? (
              <PortalAlert variant="warning" title={resourceErrors.sites} />
            ) : null}
          </div>

          <div
            data-testid="calendar-step-4"
            role="group"
            aria-label={CALENDAR_SETTINGS_COPY.eventualitiesTitle}
            className="order-4 min-w-0"
          >
            <OperationalEventualitiesPanel canEdit={canEdit && !isRefreshing} />
          </div>
        </div>
      </section>
    </div>
  );
}
