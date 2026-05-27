'use client';

import { useCallback, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@iwana/ui';
import {
  organizationApi,
  type OrganizationSiteBusinessHourSnapshot,
  type OrganizationSiteDetail,
  type OrganizationSiteSummary,
} from '@/lib/api-client';
import { PortalEmptyState, PortalPanel, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import {
  BusinessHoursWeekEditor,
  buildBusinessHoursDraft,
  type BusinessHourDay,
} from './BusinessHoursWeekEditor';
import { CALENDAR_SETTINGS_COPY } from './mod00-settings-labels';

const inputClassName =
  'h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-iwana-secondary focus:outline-none focus:ring-2 focus:ring-iwana-secondary/20 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-100';

interface Props {
  sites: OrganizationSiteSummary[];
  canEdit: boolean;
}

export function CalendarSiteHoursPanel({ sites, canEdit }: Props) {
  const [selectedSiteId, setSelectedSiteId] = useState<string>(sites[0]?.id ?? '');
  const [siteDetail, setSiteDetail] = useState<OrganizationSiteDetail | null>(null);
  const [draft, setDraft] = useState<BusinessHourDay[]>(() => buildBusinessHoursDraft([]));
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async (siteId: string) => {
    if (!siteId) return;

    setIsLoadingDetail(true);
    setError(null);
    setFeedback(null);

    try {
      const detail = await organizationApi.get(siteId);
      setSiteDetail(detail);
      setDraft(buildBusinessHoursDraft(detail.businessHours));
    } catch {
      setError('No fue posible cargar el detalle de la sede.');
      setSiteDetail(null);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSiteId) {
      void loadDetail(selectedSiteId);
    }
  }, [selectedSiteId, loadDetail]);

  async function handleSaveOverride() {
    if (!siteDetail) return;

    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const updated = await organizationApi.replaceBusinessHours(siteDetail.id, {
        businessHours: draft.map((entry) => ({
          weekday: entry.weekday,
          isOpen: entry.isOpen,
          opensAt: entry.isOpen ? (entry.opensAt ?? null) : null,
          closesAt: entry.isOpen ? (entry.closesAt ?? null) : null,
        })),
      });
      setSiteDetail(updated);
      setDraft(buildBusinessHoursDraft(updated.businessHours));
      setFeedback(CALENDAR_SETTINGS_COPY.siteSaveSuccess);
    } catch {
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

    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const updated = await organizationApi.clearSiteOverride(siteDetail.id);
      setSiteDetail(updated);
      setDraft(buildBusinessHoursDraft(updated.businessHours));
      setFeedback(CALENDAR_SETTINGS_COPY.siteClearSuccess);
    } catch {
      setError(CALENDAR_SETTINGS_COPY.siteClearError);
    } finally {
      setIsSaving(false);
    }
  }

  if (sites.length === 0) {
    return (
      <PortalPanel
        title="Horario por sede"
        description={CALENDAR_SETTINGS_COPY.sitePanelDescription}
      >
        <PortalEmptyState
          title="Sin sedes registradas"
          description={CALENDAR_SETTINGS_COPY.siteEmptyDescription}
        />
      </PortalPanel>
    );
  }

  return (
    <PortalPanel
      title="Horario por sede"
      description={CALENDAR_SETTINGS_COPY.sitePanelDescription}
      actions={
        canEdit && siteDetail ? (
          <div className="flex flex-wrap gap-2">
            {siteDetail.businessHoursMode === 'OVERRIDE' ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void handleClearOverride()}
                disabled={isSaving}
              >
                Usar horario base
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleSaveOverride()}
              disabled={isSaving}
            >
              <Save className="mr-2 h-4 w-4" aria-hidden={true} />
              {CALENDAR_SETTINGS_COPY.siteSaveAction}
            </Button>
          </div>
        ) : undefined
      }
    >
      {/* Selector de sede */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-gray-500">Sede</label>
        <select
          value={selectedSiteId}
          onChange={(e) => setSelectedSiteId(e.target.value)}
          className={inputClassName}
        >
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name} ({site.code})
            </option>
          ))}
        </select>
      </div>

      {feedback ? (
        <p className="mb-3 text-sm text-green-700 dark:text-green-400">{feedback}</p>
      ) : null}
      {error ? <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {isLoadingDetail ? (
        <PortalSkeletonBlock className="h-48" />
      ) : siteDetail ? (
        <div className="space-y-3">
          {/* Indicador de modo activo */}
          {siteDetail.businessHoursMode === 'OVERRIDE' ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              {CALENDAR_SETTINGS_COPY.siteOverrideActive}
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-[#f8faf5] px-4 py-2 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
              {CALENDAR_SETTINGS_COPY.siteOverrideInactive}
            </div>
          )}

          <BusinessHoursWeekEditor days={draft} canEdit={canEdit} onChange={setDraft} />
        </div>
      ) : null}
    </PortalPanel>
  );
}
