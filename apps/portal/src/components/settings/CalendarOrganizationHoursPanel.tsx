'use client';

import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@iwana/ui';
import { organizationApi, type OrganizationCompanyBusinessHoursDay } from '@/lib/api-client';
import { PortalAlert, PortalPanel, portalWellClassName } from '@/components/shared/portal-ui';
import { CALENDAR_SETTINGS_COPY } from './mod00-settings-labels';
import {
  BusinessHoursWeekEditor,
  buildBusinessHoursDraft,
  type BusinessHourDay,
} from './BusinessHoursWeekEditor';

interface Props {
  companyHours: OrganizationCompanyBusinessHoursDay[];
  canEdit: boolean;
  onUpdated: (hours: OrganizationCompanyBusinessHoursDay[]) => void;
  className?: string | undefined;
}

export function CalendarOrganizationHoursPanel({
  companyHours,
  canEdit,
  onUpdated,
  className,
}: Props) {
  const [draft, setDraft] = useState<BusinessHourDay[]>(() =>
    buildBusinessHoursDraft(companyHours),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preserveFeedbackOnNextSyncRef = useRef(false);

  useEffect(() => {
    setDraft(buildBusinessHoursDraft(companyHours));
    setError(null);

    if (preserveFeedbackOnNextSyncRef.current) {
      preserveFeedbackOnNextSyncRef.current = false;
      return;
    }

    setFeedback(null);
  }, [companyHours]);

  function handleDraftChange(nextDraft: BusinessHourDay[]) {
    setDraft(nextDraft);
    setFeedback(null);
    setError(null);
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const updated = await organizationApi.replaceCompanyHours({
        businessHours: draft.map((entry) => ({
          weekday: entry.weekday,
          isOpen: entry.isOpen,
          opensAt: entry.isOpen ? (entry.opensAt ?? null) : null,
          closesAt: entry.isOpen ? (entry.closesAt ?? null) : null,
        })),
      });
      setDraft(buildBusinessHoursDraft(updated));
      preserveFeedbackOnNextSyncRef.current = true;
      onUpdated(updated);
      setFeedback(CALENDAR_SETTINGS_COPY.organizationSaveSuccess);
    } catch {
      setError(CALENDAR_SETTINGS_COPY.organizationSaveError);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PortalPanel
      className={className}
      eyebrow={CALENDAR_SETTINGS_COPY.organizationEyebrow}
      title={CALENDAR_SETTINGS_COPY.organizationTitle}
      description={CALENDAR_SETTINGS_COPY.organizationDescription}
      actions={
        canEdit ? (
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" aria-hidden={true} />
            {CALENDAR_SETTINGS_COPY.organizationSaveAction}
          </Button>
        ) : undefined
      }
      contentClassName="space-y-4"
    >
      {feedback ? <PortalAlert variant="success" title={feedback} /> : null}
      {error ? <PortalAlert variant="error" title={error} /> : null}
      {!canEdit ? (
        <PortalAlert variant="info" title={CALENDAR_SETTINGS_COPY.calendarReadOnlyHint} />
      ) : null}

      <div className={portalWellClassName}>
        <p className="portal-eyebrow text-iwana-secondary-700 dark:text-iwana-secondary-400">
          {CALENDAR_SETTINGS_COPY.organizationStatusTitle}
        </p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          {CALENDAR_SETTINGS_COPY.organizationStatusDescription}
        </p>
      </div>

      <BusinessHoursWeekEditor
        days={draft}
        canEdit={canEdit && !isSaving}
        onChange={handleDraftChange}
      />
    </PortalPanel>
  );
}
