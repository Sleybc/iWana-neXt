'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { Button, Select, type SelectOption } from '@iwana/ui';
import {
  organizationApi,
  type OrganizationSiteBusinessHourSnapshot,
  type OrganizationSiteDetail,
  type OrganizationSiteSummary,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import {
  BusinessHoursWeekEditor,
  buildBusinessHoursDraft,
  type BusinessHourDay,
} from './BusinessHoursWeekEditor';
import { CALENDAR_SETTINGS_COPY } from './mod00-settings-labels';

const selectClassName = 'rounded-2xl shadow-sm dark:bg-dark-surface-2 md:min-w-[18rem]';

interface Props {
  sites: OrganizationSiteSummary[];
  canEdit: boolean;
}

export function CalendarSiteHoursPanel({ sites, canEdit }: Props) {
  const siteOptions: SelectOption[] = sites.map((site) => ({
    value: site.id,
    label: `${site.name} (${site.code})`,
  }));
  const [selectedSiteId, setSelectedSiteId] = useState<string>(sites[0]?.id ?? '');
  const [siteDetail, setSiteDetail] = useState<OrganizationSiteDetail | null>(null);
  const [draft, setDraft] = useState<BusinessHourDay[]>(() => buildBusinessHoursDraft([]));
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const siteSelectorId = 'calendar-site-selector';
  const siteSelectorHintId = 'calendar-site-selector-hint';
  const siteSelectorStatusId = 'calendar-site-selector-status';
  const selectedSiteIdRef = useRef(selectedSiteId);
  const loadRequestIdRef = useRef(0);
  const mutationRequestIdRef = useRef(0);

  function syncSelectedSiteId(nextSiteId: string) {
    selectedSiteIdRef.current = nextSiteId;
    setSelectedSiteId(nextSiteId);
  }

  function isActiveRequest(siteId: string, requestId: number) {
    return loadRequestIdRef.current === requestId && selectedSiteIdRef.current === siteId;
  }

  function isActiveMutation(siteId: string, requestId: number) {
    return mutationRequestIdRef.current === requestId && selectedSiteIdRef.current === siteId;
  }

  const loadDetail = useCallback(async (siteId: string) => {
    if (!siteId) return;

    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    setIsLoadingDetail(true);
    setError(null);
    setFeedback(null);

    try {
      const detail = await organizationApi.get(siteId);
      if (!isActiveRequest(siteId, requestId)) {
        return;
      }

      setSiteDetail(detail);
      setDraft(buildBusinessHoursDraft(detail.businessHours));
    } catch {
      if (!isActiveRequest(siteId, requestId)) {
        return;
      }

      setError(CALENDAR_SETTINGS_COPY.siteDetailLoadError);
      setSiteDetail(null);
      setDraft(buildBusinessHoursDraft([]));
    } finally {
      if (isActiveRequest(siteId, requestId)) {
        setIsLoadingDetail(false);
      }
    }
  }, []);

  useEffect(() => {
    if (sites.length === 0) {
      syncSelectedSiteId('');
      setSiteDetail(null);
      setDraft(buildBusinessHoursDraft([]));
      setIsLoadingDetail(false);
      setFeedback(null);
      setError(null);
      return;
    }

    if (!sites.some((site) => site.id === selectedSiteId)) {
      const [firstSite] = sites;

      if (!firstSite) {
        return;
      }

      syncSelectedSiteId(firstSite.id);
      setSiteDetail(null);
      setDraft(buildBusinessHoursDraft([]));
      setFeedback(null);
      setError(null);
    }
  }, [selectedSiteId, sites]);

  useEffect(() => {
    if (selectedSiteId && sites.some((site) => site.id === selectedSiteId)) {
      void loadDetail(selectedSiteId);
    }
  }, [selectedSiteId, loadDetail]);

  async function handleSaveOverride() {
    if (!siteDetail) return;
    const siteId = siteDetail.id;
    const requestId = mutationRequestIdRef.current + 1;
    mutationRequestIdRef.current = requestId;

    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const updated = await organizationApi.replaceBusinessHours(siteId, {
        businessHours: draft.map((entry) => ({
          weekday: entry.weekday,
          isOpen: entry.isOpen,
          opensAt: entry.isOpen ? (entry.opensAt ?? null) : null,
          closesAt: entry.isOpen ? (entry.closesAt ?? null) : null,
        })),
      });

      if (!isActiveMutation(siteId, requestId)) {
        return;
      }

      setSiteDetail(updated);
      setDraft(buildBusinessHoursDraft(updated.businessHours));
      setFeedback(CALENDAR_SETTINGS_COPY.siteSaveSuccess);
    } catch {
      if (!isActiveMutation(siteId, requestId)) {
        return;
      }

      setError(CALENDAR_SETTINGS_COPY.siteSaveError);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClearOverride() {
    if (!siteDetail) return;

    if (!(globalThis.confirm?.(CALENDAR_SETTINGS_COPY.siteClearConfirm) ?? true)) {
      return;
    }

    const siteId = siteDetail.id;
    const requestId = mutationRequestIdRef.current + 1;
    mutationRequestIdRef.current = requestId;

    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const updated = await organizationApi.clearSiteOverride(siteId);

      if (!isActiveMutation(siteId, requestId)) {
        return;
      }

      setSiteDetail(updated);
      setDraft(buildBusinessHoursDraft(updated.businessHours));
      setFeedback(CALENDAR_SETTINGS_COPY.siteClearSuccess);
    } catch {
      if (!isActiveMutation(siteId, requestId)) {
        return;
      }

      setError(CALENDAR_SETTINGS_COPY.siteClearError);
    } finally {
      setIsSaving(false);
    }
  }

  function handleRetryDetail() {
    if (!selectedSiteId) return;

    void loadDetail(selectedSiteId);
  }

  if (sites.length === 0) {
    return (
      <PortalPanel
        eyebrow={CALENDAR_SETTINGS_COPY.siteEyebrow}
        title={CALENDAR_SETTINGS_COPY.sitePanelTitle}
        description={CALENDAR_SETTINGS_COPY.sitePanelDescription}
      >
        <PortalEmptyState
          title={CALENDAR_SETTINGS_COPY.siteEmptyTitle}
          description={CALENDAR_SETTINGS_COPY.siteEmptyDescription}
        />
      </PortalPanel>
    );
  }

  return (
    <PortalPanel
      eyebrow={CALENDAR_SETTINGS_COPY.siteEyebrow}
      title={CALENDAR_SETTINGS_COPY.sitePanelTitle}
      description={CALENDAR_SETTINGS_COPY.sitePanelDescription}
      actions={
        canEdit && siteDetail && siteDetail.id === selectedSiteId && !isLoadingDetail ? (
          <Button type="button" onClick={() => void handleSaveOverride()} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" aria-hidden={true} />
            {CALENDAR_SETTINGS_COPY.siteSaveAction}
          </Button>
        ) : undefined
      }
      contentClassName="space-y-4"
    >
      <div className="rounded-2xl border border-gray-200 bg-iwana-surface-soft/70 p-4 dark:border-dark-border dark:bg-dark-surface-3/60">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 md:max-w-xl">
            <label
              htmlFor={siteSelectorId}
              className="portal-eyebrow text-iwana-secondary-700 dark:text-iwana-secondary-400"
            >
              {CALENDAR_SETTINGS_COPY.siteSelectorLabel}
            </label>
            <p id={siteSelectorHintId} className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {CALENDAR_SETTINGS_COPY.siteSelectorHint}
            </p>
          </div>

          <div className="w-full md:max-w-sm">
            <Select
              id={siteSelectorId}
              name={siteSelectorId}
              aria-describedby={
                isLoadingDetail
                  ? `${siteSelectorHintId} ${siteSelectorStatusId}`
                  : siteSelectorHintId
              }
              aria-label={CALENDAR_SETTINGS_COPY.siteSelectorLabel}
              value={selectedSiteId}
              onChange={(e) => syncSelectedSiteId(e.target.value)}
              disabled={isSaving}
              options={siteOptions}
              className={selectClassName}
            />
            {isLoadingDetail ? (
              <p
                id={siteSelectorStatusId}
                role="status"
                aria-live="polite"
                className="mt-2 text-xs text-gray-500 dark:text-gray-400"
              >
                {CALENDAR_SETTINGS_COPY.siteLoadingStatus}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {feedback ? <PortalAlert variant="success" title={feedback} /> : null}
      {error ? (
        <PortalAlert
          variant="error"
          title={error}
          action={
            !siteDetail && selectedSiteId ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleRetryDetail}
                disabled={isLoadingDetail}
              >
                {CALENDAR_SETTINGS_COPY.siteDetailRetryAction}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {isLoadingDetail ? (
        <PortalSkeletonBlock className="h-48" />
      ) : siteDetail && siteDetail.id === selectedSiteId ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200/80 bg-iwana-surface-soft/60 p-4 dark:border-dark-border dark:bg-dark-surface-3/50">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="space-y-1">
                  <p className="portal-eyebrow">{CALENDAR_SETTINGS_COPY.siteSelectedEyebrow}</p>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    {CALENDAR_SETTINGS_COPY.siteSelectedTitle(siteDetail.name, siteDetail.code)}
                  </h3>
                </div>

                <div className="space-y-2">
                  <p
                    className={
                      siteDetail.businessHoursMode === 'OVERRIDE'
                        ? 'inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-200'
                        : 'inline-flex rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-iwana-secondary-700 dark:border-dark-border dark:bg-dark-surface-2 dark:text-iwana-secondary-400'
                    }
                  >
                    {siteDetail.businessHoursMode === 'OVERRIDE'
                      ? CALENDAR_SETTINGS_COPY.siteOverrideAlertTitle
                      : CALENDAR_SETTINGS_COPY.siteBaseAlertTitle}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {siteDetail.businessHoursMode === 'OVERRIDE'
                      ? CALENDAR_SETTINGS_COPY.siteOverrideAlertDescription
                      : CALENDAR_SETTINGS_COPY.siteBaseAlertDescription}
                  </p>
                </div>
              </div>

              {canEdit && siteDetail.businessHoursMode === 'OVERRIDE' ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void handleClearOverride()}
                  disabled={isSaving}
                >
                  {CALENDAR_SETTINGS_COPY.siteClearAction}
                </Button>
              ) : null}
            </div>
          </div>

          <BusinessHoursWeekEditor
            days={draft}
            canEdit={canEdit && !isSaving}
            onChange={setDraft}
          />
        </div>
      ) : null}
    </PortalPanel>
  );
}
