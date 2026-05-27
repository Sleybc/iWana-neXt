'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@iwana/ui';
import { organizationApi, type OrganizationCompanyBusinessHoursDay } from '@/lib/api-client';
import { PortalPanel } from '@/components/shared/portal-ui';
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
}

export function CalendarOrganizationHoursPanel({ companyHours, canEdit, onUpdated }: Props) {
  const [draft, setDraft] = useState<BusinessHourDay[]>(() =>
    buildBusinessHoursDraft(companyHours),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      title={CALENDAR_SETTINGS_COPY.organizationTitle}
      description={CALENDAR_SETTINGS_COPY.organizationDescription}
      actions={
        canEdit ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleSave()}
            disabled={isSaving}
          >
            <Save className="mr-2 h-4 w-4" aria-hidden={true} />
            {CALENDAR_SETTINGS_COPY.organizationSaveAction}
          </Button>
        ) : undefined
      }
    >
      {feedback ? (
        <p className="mb-3 text-sm text-green-700 dark:text-green-400">{feedback}</p>
      ) : null}
      {error ? <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <BusinessHoursWeekEditor days={draft} canEdit={canEdit} onChange={setDraft} />
    </PortalPanel>
  );
}
