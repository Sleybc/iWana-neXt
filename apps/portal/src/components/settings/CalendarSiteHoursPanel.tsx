'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Save } from 'lucide-react';
import { BusinessHoursWeekday } from '@iwana/shared';
import { cn } from '@iwana/ui';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  type SelectOption,
} from '@iwana/ui';
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
  portalWellClassName,
} from '@/components/shared/portal-ui';
import {
  BusinessHoursWeekEditor,
  areBusinessHoursEqual,
  buildBusinessHoursDraft,
  getBusinessHoursFieldId,
  validateBusinessHours,
  type BusinessHoursValidationErrors,
  type BusinessHourDay,
} from './BusinessHoursWeekEditor';
import { CALENDAR_SETTINGS_COPY } from './mod00-settings-labels';

const selectClassName = 'rounded-2xl shadow-sm dark:bg-dark-surface-2 md:min-w-[18rem]';

interface Props {
  sites: OrganizationSiteSummary[];
  canEdit: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  className?: string | undefined;
}

export function CalendarSiteHoursPanel({ sites, canEdit, onDirtyChange, className }: Props) {
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
  const [validationErrors, setValidationErrors] = useState<BusinessHoursValidationErrors>({});
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [siteChangePendingId, setSiteChangePendingId] = useState<string | null>(null);
  const siteSelectorId = 'calendar-site-selector';
  const siteSelectorHintId = 'calendar-site-selector-hint';
  const siteSelectorStatusId = 'calendar-site-selector-status';
  const selectedSiteIdRef = useRef(selectedSiteId);
  const loadRequestIdRef = useRef(0);
  const mutationRequestIdRef = useRef(0);
  const hasSelectedSite = Boolean(
    selectedSiteId && sites.some((site) => site.id === selectedSiteId),
  );
  const isDraftDirty =
    siteDetail !== null && !areBusinessHoursEqual(draft, siteDetail.businessHours);

  useEffect(() => {
    onDirtyChange?.(siteDetail !== null && !areBusinessHoursEqual(draft, siteDetail.businessHours));
  }, [draft, onDirtyChange, siteDetail]);

  function syncSelectedSiteId(nextSiteId: string) {
    selectedSiteIdRef.current = nextSiteId;
    setSelectedSiteId(nextSiteId);
  }

  function handleSiteSelectionChange(nextSiteId: string) {
    if (nextSiteId === selectedSiteId) return;
    if (isDraftDirty) {
      setSiteChangePendingId(nextSiteId);
      return;
    }

    applySiteSelection(nextSiteId);
  }

  function applySiteSelection(nextSiteId: string) {
    setSiteChangePendingId(null);
    syncSelectedSiteId(nextSiteId);
    setSiteDetail(null);
    setDraft(buildBusinessHoursDraft([]));
    setValidationErrors({});
    setFeedback(null);
    setError(null);
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
      setValidationErrors({});
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
      setValidationErrors({});
    }
  }, [selectedSiteId, sites]);

  useEffect(() => {
    if (selectedSiteId && hasSelectedSite) {
      void loadDetail(selectedSiteId);
    }
  }, [hasSelectedSite, selectedSiteId, loadDetail]);

  async function handleSaveOverride() {
    if (!siteDetail) return;
    const nextValidationErrors = validateBusinessHours(draft);
    if (Object.keys(nextValidationErrors).length > 0) {
      setValidationErrors(nextValidationErrors);
      setError(CALENDAR_SETTINGS_COPY.siteHoursValidationError);
      const firstErrorDay = Object.keys(nextValidationErrors)[0];
      const firstField = nextValidationErrors[firstErrorDay as keyof BusinessHoursValidationErrors]
        ?.opensAt
        ? 'opens'
        : 'closes';
      requestAnimationFrame(() =>
        document
          .getElementById(
            getBusinessHoursFieldId('site', firstErrorDay as BusinessHoursWeekday, firstField),
          )
          ?.focus(),
      );
      return;
    }

    setValidationErrors({});
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
      onDirtyChange?.(false);
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
      setValidationErrors({});
      onDirtyChange?.(false);
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
        className={className}
        eyebrow={CALENDAR_SETTINGS_COPY.siteEyebrow}
        title={CALENDAR_SETTINGS_COPY.sitePanelTitle}
        description={CALENDAR_SETTINGS_COPY.sitePanelDescription}
      >
        <PortalEmptyState
          title={CALENDAR_SETTINGS_COPY.siteEmptyTitle}
          description={
            canEdit
              ? CALENDAR_SETTINGS_COPY.siteEmptyDescription
              : CALENDAR_SETTINGS_COPY.siteEmptyReadOnlyDescription
          }
          action={
            canEdit ? (
              <Button asChild variant="secondary" size="sm">
                <Link href="/dashboard/settings/organization">
                  {CALENDAR_SETTINGS_COPY.createSiteAction}
                </Link>
              </Button>
            ) : undefined
          }
        />
      </PortalPanel>
    );
  }

  return (
    <>
      <PortalPanel
        className={className}
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
        <div
          className={cn(
            portalWellClassName,
            'p-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between',
          )}
        >
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
              onChange={(e) => handleSiteSelectionChange(e.target.value)}
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

        {feedback ? <PortalAlert variant="success" title={feedback} /> : null}
        {error ? (
          <PortalAlert
            variant="error"
            live="assertive"
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

        {!canEdit ? (
          <PortalAlert variant="info" title={CALENDAR_SETTINGS_COPY.calendarReadOnlyHint} />
        ) : null}

        {isLoadingDetail ? (
          <PortalSkeletonBlock className="h-48" />
        ) : siteDetail && siteDetail.id === selectedSiteId ? (
          <>
            <div className="space-y-4">
              <div
                className={cn(
                  portalWellClassName,
                  'p-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between',
                )}
              >
                <div className="min-w-0 space-y-3">
                  <div className="space-y-1">
                    <p className="portal-eyebrow">{CALENDAR_SETTINGS_COPY.siteSelectedEyebrow}</p>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                      {CALENDAR_SETTINGS_COPY.siteSelectedTitle(siteDetail.name, siteDetail.code)}
                    </h3>
                  </div>

                  <div className="space-y-2">
                    <Badge
                      variant={siteDetail.businessHoursMode === 'OVERRIDE' ? 'warning' : 'neutral'}
                    >
                      {siteDetail.businessHoursMode === 'OVERRIDE'
                        ? CALENDAR_SETTINGS_COPY.siteOverrideAlertTitle
                        : CALENDAR_SETTINGS_COPY.siteBaseAlertTitle}
                    </Badge>
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
                    onClick={() => setClearDialogOpen(true)}
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
              validationErrors={validationErrors}
              idPrefix="site"
              onChange={(nextDraft) => {
                setDraft(nextDraft);
                setValidationErrors({});
                setError(null);
              }}
            />
          </>
        ) : null}
      </PortalPanel>

      <Dialog
        open={siteChangePendingId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSiteChangePendingId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{CALENDAR_SETTINGS_COPY.siteChangeDialogTitle}</DialogTitle>
            <DialogDescription>
              {CALENDAR_SETTINGS_COPY.siteChangeDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => setSiteChangePendingId(null)}
            >
              {CALENDAR_SETTINGS_COPY.cancelAction}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              onClick={() => {
                if (siteChangePendingId) applySiteSelection(siteChangePendingId);
              }}
            >
              {CALENDAR_SETTINGS_COPY.siteChangeDialogConfirm}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={clearDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setClearDialogOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <p className="portal-eyebrow">Confirmación</p>
            <DialogTitle className="mt-1">
              {CALENDAR_SETTINGS_COPY.siteClearDialogTitle}
            </DialogTitle>
            <DialogDescription>
              {CALENDAR_SETTINGS_COPY.siteClearDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setClearDialogOpen(false)}>
              {CALENDAR_SETTINGS_COPY.cancelAction}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setClearDialogOpen(false);
                void handleClearOverride();
              }}
            >
              {CALENDAR_SETTINGS_COPY.siteClearAction}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
