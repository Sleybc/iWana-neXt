'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@iwana/ui';
import {
  Badge,
  Button,
  DatePicker,
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
  type OrganizationBusinessHoursExceptionSnapshot,
  type OrganizationSiteSummary,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  portalCheckboxClassName,
  portalWellClassName,
} from '@/components/shared/portal-ui';
import { formatDateOnlyEsCo } from '@/lib/format-date';
import { CALENDAR_SETTINGS_COPY } from './mod00-settings-labels';

const tableHeadClass =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
const cellClass = 'px-4 py-3.5 align-middle text-sm text-gray-700 dark:text-gray-200';
const inputClassName =
  'h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-iwana-secondary focus:outline-none focus:ring-2 focus:ring-iwana-secondary/20 dark:border-iwana-neutral-600 dark:bg-dark-surface-2 dark:text-gray-100';
const selectClassName = 'rounded-2xl shadow-sm dark:bg-dark-surface-2';
const datePickerButtonClassName =
  'h-11 rounded-2xl border-gray-200 bg-white px-4 text-sm text-gray-900 shadow-sm dark:border-iwana-neutral-600 dark:bg-dark-surface-2 dark:text-gray-100';

function normalizeTime(value: string | null): string {
  if (!value) return '';
  return value.slice(0, 5);
}

function toLocalDateValue(date: Date | undefined): string {
  if (!date) {
    return '';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function toDateFromLocalDateValue(value: string): Date | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const [year, month, day] = trimmed.split('-').map((segment) => Number(segment));
  if (!year || !month || !day) {
    return undefined;
  }

  return new Date(year, month - 1, day);
}

interface Props {
  exceptions: OrganizationBusinessHoursExceptionSnapshot[];
  sites: OrganizationSiteSummary[];
  canEdit: boolean;
  onCreated: (exception: OrganizationBusinessHoursExceptionSnapshot) => void;
  onDeleted: (id: string) => void;
  className?: string | undefined;
}

interface NewExceptionDraft {
  name: string;
  exceptionDate: string;
  isOpen: boolean;
  isRecurring: boolean;
  opensAt: string;
  closesAt: string;
  organizationSiteId: string;
}

const emptyDraft: NewExceptionDraft = {
  name: '',
  exceptionDate: '',
  isOpen: false,
  isRecurring: false,
  opensAt: '',
  closesAt: '',
  organizationSiteId: '',
};

export function CalendarExceptionsPanel({
  exceptions,
  sites,
  canEdit,
  onCreated,
  onDeleted,
  className,
}: Props) {
  const siteOptions: SelectOption[] = [
    { value: '', label: CALENDAR_SETTINGS_COPY.exceptionsSiteAllLabel },
    ...sites.map((site) => ({ value: site.id, label: site.name })),
  ];
  const [newException, setNewException] = useState<NewExceptionDraft>(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exceptionToDelete, setExceptionToDelete] = useState<string | null>(null);
  const exceptionFormRegionId = 'calendar-exception-form-region';
  const exceptionFormHeadingId = 'calendar-exception-form-heading';
  const exceptionNameId = 'calendar-exception-name';
  const exceptionDateId = 'calendar-exception-date';
  const exceptionSiteId = 'calendar-exception-site';
  const exceptionOpenId = 'calendar-exception-is-open';
  const exceptionRecurringId = 'calendar-exception-is-recurring';
  const exceptionOpensAtId = 'calendar-exception-opens-at';
  const exceptionClosesAtId = 'calendar-exception-closes-at';

  function handleCloseForm() {
    setShowForm(false);
    setNewException(emptyDraft);
    setError(null);
  }

  async function handleCreate() {
    if (!newException.name.trim() || !newException.exceptionDate) return;

    if (newException.isOpen && (!newException.opensAt || !newException.closesAt)) {
      setError(CALENDAR_SETTINGS_COPY.exceptionsOpenHoursRequired);
      setFeedback(null);
      return;
    }

    if (newException.isOpen && newException.opensAt >= newException.closesAt) {
      setError(CALENDAR_SETTINGS_COPY.exceptionsOpenHoursOrder);
      setFeedback(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const created = await organizationApi.createException({
        exceptionDate: newException.exceptionDate,
        name: newException.name.trim(),
        isOpen: newException.isOpen,
        isRecurring: newException.isRecurring,
        opensAt: newException.isOpen ? newException.opensAt || null : null,
        closesAt: newException.isOpen ? newException.closesAt || null : null,
        organizationSiteId: newException.organizationSiteId || null,
      });
      onCreated(created);
      setNewException(emptyDraft);
      setShowForm(false);
      setFeedback(CALENDAR_SETTINGS_COPY.exceptionsCreated);
    } catch {
      setError(CALENDAR_SETTINGS_COPY.exceptionsCreateError);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteConfirmed(id: string) {
    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      await organizationApi.deleteException(id);
      onDeleted(id);
      setFeedback(CALENDAR_SETTINGS_COPY.exceptionsDeleted);
    } catch {
      setError(CALENDAR_SETTINGS_COPY.exceptionsDeleteError);
    } finally {
      setIsSaving(false);
    }
  }

  function handleDelete(id: string) {
    setExceptionToDelete(id);
  }

  return (
    <>
      <PortalPanel
        className={className}
        eyebrow={CALENDAR_SETTINGS_COPY.exceptionsEyebrow}
        title={CALENDAR_SETTINGS_COPY.exceptionsTitle}
        description={CALENDAR_SETTINGS_COPY.exceptionsDescription}
        contentClassName="space-y-4"
      >
        {feedback ? <PortalAlert variant="success" title={feedback} /> : null}
        {error ? <PortalAlert variant="error" live="assertive" title={error} /> : null}

        {exceptions.length === 0 ? (
          <PortalEmptyState
            title={CALENDAR_SETTINGS_COPY.exceptionsEmptyTitle}
            description={CALENDAR_SETTINGS_COPY.exceptionsEmptyDescription}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-dark-border">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
              <thead className="bg-iwana-surface-soft dark:bg-dark-surface-3">
                <tr>
                  <th className={tableHeadClass}>
                    {CALENDAR_SETTINGS_COPY.exceptionsTableNameColumn}
                  </th>
                  <th className={tableHeadClass}>
                    {CALENDAR_SETTINGS_COPY.exceptionsTableDateColumn}
                  </th>
                  <th className={tableHeadClass}>
                    {CALENDAR_SETTINGS_COPY.exceptionsTableStatusColumn}
                  </th>
                  <th className={tableHeadClass}>
                    {CALENDAR_SETTINGS_COPY.exceptionsTableSiteColumn}
                  </th>
                  {canEdit ? (
                    <th className={tableHeadClass}>
                      {CALENDAR_SETTINGS_COPY.eventualitiesTableActionsColumn}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2">
                {exceptions.map((exc) => {
                  const excSite = exc.organizationSiteId
                    ? sites.find((s) => s.id === exc.organizationSiteId)
                    : null;
                  const excSiteName = excSite
                    ? excSite.name
                    : exc.organizationSiteId
                      ? CALENDAR_SETTINGS_COPY.exceptionsSiteUnavailableLabel
                      : CALENDAR_SETTINGS_COPY.exceptionsSiteAllLabel;

                  return (
                    <tr key={exc.id}>
                      <td className={cellClass}>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{exc.name}</p>
                          {exc.isRecurring ? (
                            <Badge variant="neutral" className="mt-1">
                              {CALENDAR_SETTINGS_COPY.exceptionsRecurringBadge}
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className={cellClass}>{formatDateOnlyEsCo(exc.exceptionDate)}</td>
                      <td className={cellClass}>
                        {exc.isOpen ? (
                          <Badge variant="success">
                            {CALENDAR_SETTINGS_COPY.exceptionsOpenStatus}{' '}
                            {exc.opensAt
                              ? `${normalizeTime(exc.opensAt)} – ${normalizeTime(exc.closesAt)}`
                              : ''}
                          </Badge>
                        ) : (
                          <Badge variant="error">
                            {CALENDAR_SETTINGS_COPY.exceptionsClosedStatus}
                          </Badge>
                        )}
                      </td>
                      <td className={cellClass}>{excSiteName}</td>
                      {canEdit ? (
                        <td className={cellClass}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDelete(exc.id)}
                            disabled={isSaving}
                          >
                            {CALENDAR_SETTINGS_COPY.exceptionsDeleteAction}
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {canEdit ? (
          <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-dark-border/70">
            <div
              className={cn(
                portalWellClassName,
                'p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
              )}
            >
              <div className="min-w-0">
                <p id={exceptionFormHeadingId} className="portal-eyebrow">
                  {CALENDAR_SETTINGS_COPY.exceptionsCreateTitle}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {CALENDAR_SETTINGS_COPY.exceptionsFormDescription}
                </p>
              </div>
              {!showForm ? (
                <Button
                  type="button"
                  variant="secondary"
                  aria-expanded={false}
                  aria-controls={exceptionFormRegionId}
                  onClick={() => setShowForm(true)}
                >
                  <Plus className="mr-2 h-4 w-4" aria-hidden={true} />
                  {CALENDAR_SETTINGS_COPY.exceptionsShowFormAction}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  aria-expanded={true}
                  aria-controls={exceptionFormRegionId}
                  onClick={handleCloseForm}
                >
                  {CALENDAR_SETTINGS_COPY.exceptionsHideFormAction}
                </Button>
              )}
            </div>

            {showForm ? (
              <div
                id={exceptionFormRegionId}
                role="region"
                aria-labelledby={exceptionFormHeadingId}
                data-testid="exception-form"
                className={cn(portalWellClassName, 'p-4')}
              >
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label
                        htmlFor={exceptionNameId}
                        className="mb-1 block text-xs font-medium text-gray-500"
                      >
                        {CALENDAR_SETTINGS_COPY.exceptionsNameLabel}
                      </label>
                      <input
                        id={exceptionNameId}
                        name={exceptionNameId}
                        type="text"
                        placeholder={CALENDAR_SETTINGS_COPY.exceptionsNamePlaceholder}
                        value={newException.name}
                        onChange={(e) =>
                          setNewException((prev) => ({ ...prev, name: e.target.value }))
                        }
                        className={inputClassName}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={exceptionDateId}
                        className="mb-1 block text-xs font-medium text-gray-500"
                      >
                        {CALENDAR_SETTINGS_COPY.exceptionsDateLabel}
                      </label>
                      <DatePicker
                        id={exceptionDateId}
                        name={exceptionDateId}
                        placeholder="dd/mm/aaaa"
                        value={toDateFromLocalDateValue(newException.exceptionDate)}
                        onChange={(date) =>
                          setNewException((prev) => ({
                            ...prev,
                            exceptionDate: toLocalDateValue(date),
                          }))
                        }
                        className="w-full"
                        buttonClassName={datePickerButtonClassName}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={exceptionSiteId}
                        className="mb-1 block text-xs font-medium text-gray-500"
                      >
                        {CALENDAR_SETTINGS_COPY.exceptionsSiteLabel}
                      </label>
                      <Select
                        id={exceptionSiteId}
                        name={exceptionSiteId}
                        aria-label={CALENDAR_SETTINGS_COPY.exceptionsSiteLabel}
                        value={newException.organizationSiteId}
                        onChange={(e) =>
                          setNewException((prev) => ({
                            ...prev,
                            organizationSiteId: e.target.value,
                          }))
                        }
                        options={siteOptions}
                        className={selectClassName}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 self-end">
                      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                        <input
                          id={exceptionOpenId}
                          name={exceptionOpenId}
                          type="checkbox"
                          checked={newException.isOpen}
                          onChange={(e) =>
                            setNewException((prev) => ({ ...prev, isOpen: e.target.checked }))
                          }
                          className={portalCheckboxClassName}
                        />
                        <label htmlFor={exceptionOpenId}>
                          {CALENDAR_SETTINGS_COPY.exceptionsOpenLabel}
                        </label>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                        <input
                          id={exceptionRecurringId}
                          name={exceptionRecurringId}
                          type="checkbox"
                          checked={newException.isRecurring}
                          onChange={(e) =>
                            setNewException((prev) => ({ ...prev, isRecurring: e.target.checked }))
                          }
                          className={portalCheckboxClassName}
                        />
                        <label htmlFor={exceptionRecurringId}>
                          {CALENDAR_SETTINGS_COPY.exceptionsRecurringLabel}
                        </label>
                      </div>
                    </div>
                    {newException.isOpen ? (
                      <>
                        <div>
                          <label
                            htmlFor={exceptionOpensAtId}
                            className="mb-1 block text-xs font-medium text-gray-500"
                          >
                            {CALENDAR_SETTINGS_COPY.exceptionsOpensAtLabel}
                          </label>
                          <input
                            id={exceptionOpensAtId}
                            name={exceptionOpensAtId}
                            type="time"
                            value={newException.opensAt}
                            onChange={(e) =>
                              setNewException((prev) => ({ ...prev, opensAt: e.target.value }))
                            }
                            className={inputClassName}
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={exceptionClosesAtId}
                            className="mb-1 block text-xs font-medium text-gray-500"
                          >
                            {CALENDAR_SETTINGS_COPY.exceptionsClosesAtLabel}
                          </label>
                          <input
                            id={exceptionClosesAtId}
                            name={exceptionClosesAtId}
                            type="time"
                            value={newException.closesAt}
                            onChange={(e) =>
                              setNewException((prev) => ({ ...prev, closesAt: e.target.value }))
                            }
                            className={inputClassName}
                          />
                        </div>
                        <p className="text-xs text-gray-500 sm:col-span-2">
                          {CALENDAR_SETTINGS_COPY.exceptionsOpenHoursHelper}
                        </p>
                      </>
                    ) : null}
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" onClick={() => void handleCreate()} disabled={isSaving}>
                      <Plus className="mr-2 h-4 w-4" aria-hidden={true} />
                      {CALENDAR_SETTINGS_COPY.exceptionsCreateAction}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </PortalPanel>

      <Dialog
        open={exceptionToDelete !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setExceptionToDelete(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <p className="portal-eyebrow">Confirmación</p>
            <DialogTitle className="mt-1">
              {CALENDAR_SETTINGS_COPY.exceptionsDeleteConfirm}
            </DialogTitle>
            <DialogDescription>
              {CALENDAR_SETTINGS_COPY.exceptionsDeleteDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setExceptionToDelete(null)}>
              {CALENDAR_SETTINGS_COPY.cancelAction}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const id = exceptionToDelete;
                setExceptionToDelete(null);
                if (id) {
                  void handleDeleteConfirmed(id);
                }
              }}
            >
              {CALENDAR_SETTINGS_COPY.exceptionsDeleteAction}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
