'use client';

import { useState, type FormEvent } from 'react';
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
  Input,
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
  PortalDataTableHead,
  PortalEmptyState,
  PortalPanel,
  interactiveFocusClassName,
  portalCheckboxClassName,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalSelectTriggerClassName,
  portalWellClassName,
} from '@/components/shared/portal-ui';
import { formatDateOnlyEsCo } from '@/lib/format-date';
import { CALENDAR_SETTINGS_COPY } from './mod00-settings-labels';
import { TimeFieldSelect } from './TimeFieldSelect';

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

function getExceptionSiteName(
  exception: OrganizationBusinessHoursExceptionSnapshot,
  sites: OrganizationSiteSummary[],
): string {
  const site = exception.organizationSiteId
    ? sites.find((candidate) => candidate.id === exception.organizationSiteId)
    : null;

  return site
    ? site.name
    : exception.organizationSiteId
      ? CALENDAR_SETTINGS_COPY.exceptionsSiteUnavailableLabel
      : CALENDAR_SETTINGS_COPY.exceptionsSiteAllLabel;
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

interface ExceptionValidationErrors {
  name?: string;
  exceptionDate?: string;
  opensAt?: string;
  closesAt?: string;
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
  const [validationErrors, setValidationErrors] = useState<ExceptionValidationErrors>({});
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
    setValidationErrors({});
  }

  function focusFirstExceptionError(errors: ExceptionValidationErrors) {
    const firstField = errors.name
      ? exceptionNameId
      : errors.exceptionDate
        ? exceptionDateId
        : errors.opensAt
          ? exceptionOpensAtId
          : exceptionClosesAtId;
    requestAnimationFrame(() => document.getElementById(firstField)?.focus());
  }

  async function handleCreate(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const nextErrors: ExceptionValidationErrors = {};

    if (!newException.name.trim()) nextErrors.name = CALENDAR_SETTINGS_COPY.exceptionsNameRequired;
    if (!newException.exceptionDate) {
      nextErrors.exceptionDate = CALENDAR_SETTINGS_COPY.exceptionsDateRequired;
    }

    if (newException.isOpen && (!newException.opensAt || !newException.closesAt)) {
      if (!newException.opensAt)
        nextErrors.opensAt = CALENDAR_SETTINGS_COPY.exceptionsOpenAtRequired;
      if (!newException.closesAt)
        nextErrors.closesAt = CALENDAR_SETTINGS_COPY.exceptionsCloseAtRequired;
    }

    if (newException.isOpen && newException.opensAt >= newException.closesAt) {
      nextErrors.closesAt = CALENDAR_SETTINGS_COPY.exceptionsOpenHoursOrder;
    }

    if (Object.keys(nextErrors).length > 0) {
      setValidationErrors(nextErrors);
      setError(
        newException.isOpen && (!newException.opensAt || !newException.closesAt)
          ? CALENDAR_SETTINGS_COPY.exceptionsOpenHoursRequired
          : null,
      );
      setFeedback(null);
      focusFirstExceptionError(nextErrors);
      return;
    }

    setIsSaving(true);
    setError(null);
    setValidationErrors({});
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
          <>
            <div data-testid="exceptions-desktop-table" className="hidden md:block">
              <div
                role="region"
                aria-label={`${CALENDAR_SETTINGS_COPY.exceptionsTitle} · tabla`}
                className="min-w-0"
              >
                <div className={portalDataTableShellClassName}>
                  <table className="min-w-full" aria-label={CALENDAR_SETTINGS_COPY.exceptionsTitle}>
                    <thead className={portalDataTableHeadRowClassName}>
                      <tr>
                        <PortalDataTableHead>
                          {CALENDAR_SETTINGS_COPY.exceptionsTableNameColumn}
                        </PortalDataTableHead>
                        <PortalDataTableHead>
                          {CALENDAR_SETTINGS_COPY.exceptionsTableDateColumn}
                        </PortalDataTableHead>
                        <PortalDataTableHead>
                          {CALENDAR_SETTINGS_COPY.exceptionsTableStatusColumn}
                        </PortalDataTableHead>
                        <PortalDataTableHead>
                          {CALENDAR_SETTINGS_COPY.exceptionsTableSiteColumn}
                        </PortalDataTableHead>
                        {canEdit ? (
                          <PortalDataTableHead>
                            {CALENDAR_SETTINGS_COPY.eventualitiesTableActionsColumn}
                          </PortalDataTableHead>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className={portalDataTableBodyClassName}>
                      {exceptions.map((exc) => {
                        const excSiteName = getExceptionSiteName(exc, sites);

                        return (
                          <tr key={exc.id}>
                            <td className={portalDataTableCellClassName}>
                              <div>
                                <p className="font-medium text-gray-900 dark:text-gray-400">
                                  {exc.name}
                                </p>
                                {exc.isRecurring ? (
                                  <Badge variant="neutral" className="mt-1">
                                    {CALENDAR_SETTINGS_COPY.exceptionsRecurringBadge}
                                  </Badge>
                                ) : null}
                              </div>
                            </td>
                            <td
                              className={`${portalDataTableCellClassName} font-mono tabular-nums`}
                            >
                              {formatDateOnlyEsCo(exc.exceptionDate)}
                            </td>
                            <td className={portalDataTableCellClassName}>
                              {exc.isOpen ? (
                                <Badge variant="success">
                                  {CALENDAR_SETTINGS_COPY.exceptionsOpenStatus}{' '}
                                  <span className="font-mono tabular-nums">
                                    {exc.opensAt
                                      ? `${normalizeTime(exc.opensAt)} – ${normalizeTime(exc.closesAt)}`
                                      : ''}
                                  </span>
                                </Badge>
                              ) : (
                                <Badge variant="error">
                                  {CALENDAR_SETTINGS_COPY.exceptionsClosedStatus}
                                </Badge>
                              )}
                            </td>
                            <td className={portalDataTableCellClassName}>{excSiteName}</td>
                            {canEdit ? (
                              <td className={portalDataTableCellClassName}>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    'min-h-11',
                                    interactiveFocusClassName,
                                    'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300',
                                  )}
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
              </div>
            </div>
            <div
              className="md:hidden"
              role="region"
              aria-label={`${CALENDAR_SETTINGS_COPY.exceptionsTitle} · lista`}
            >
              <ul
                data-testid="exceptions-mobile-list"
                className="space-y-3"
                aria-label={`${CALENDAR_SETTINGS_COPY.exceptionsTitle} · lista`}
              >
                {exceptions.map((exc) => {
                  const excSiteName = getExceptionSiteName(exc, sites);

                  return (
                    <li
                      key={exc.id}
                      data-testid={`exception-mobile-card-${exc.id}`}
                      className={cn(portalWellClassName, 'space-y-3 p-4')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-gray-400">{exc.name}</p>
                          {exc.isRecurring ? (
                            <Badge variant="neutral" className="mt-1">
                              {CALENDAR_SETTINGS_COPY.exceptionsRecurringBadge}
                            </Badge>
                          ) : null}
                        </div>
                        {exc.isOpen ? (
                          <Badge variant="success">
                            {CALENDAR_SETTINGS_COPY.exceptionsOpenStatus}
                          </Badge>
                        ) : (
                          <Badge variant="error">
                            {CALENDAR_SETTINGS_COPY.exceptionsClosedStatus}
                          </Badge>
                        )}
                      </div>
                      <dl className="grid gap-2 text-sm">
                        <div>
                          <dt className="text-gray-500 dark:text-gray-400">
                            {CALENDAR_SETTINGS_COPY.exceptionsTableDateColumn}
                          </dt>
                          <dd className="font-mono tabular-nums text-gray-900 dark:text-gray-400">
                            {formatDateOnlyEsCo(exc.exceptionDate)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-gray-500 dark:text-gray-400">
                            {CALENDAR_SETTINGS_COPY.exceptionsTableStatusColumn}
                          </dt>
                          <dd className="text-gray-900 dark:text-gray-400">
                            {exc.isOpen && exc.opensAt
                              ? `${normalizeTime(exc.opensAt)} – ${normalizeTime(exc.closesAt)}`
                              : exc.isOpen
                                ? CALENDAR_SETTINGS_COPY.exceptionsOpenStatus
                                : CALENDAR_SETTINGS_COPY.exceptionsClosedStatus}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-gray-500 dark:text-gray-400">
                            {CALENDAR_SETTINGS_COPY.exceptionsTableSiteColumn}
                          </dt>
                          <dd className="text-gray-900 dark:text-gray-400">{excSiteName}</dd>
                        </div>
                      </dl>
                      {canEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={cn(
                            'min-h-11',
                            interactiveFocusClassName,
                            'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300',
                          )}
                          onClick={() => void handleDelete(exc.id)}
                          disabled={isSaving}
                          data-testid={`delete-exception-mobile-${exc.id}`}
                        >
                          {CALENDAR_SETTINGS_COPY.exceptionsDeleteAction}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
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
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {CALENDAR_SETTINGS_COPY.exceptionsFormDescription}
                </p>
              </div>
              {!showForm ? (
                <Button
                  type="button"
                  variant="secondary"
                  className={cn('min-h-11', interactiveFocusClassName)}
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
                  className={cn('min-h-11', interactiveFocusClassName)}
                  aria-expanded={true}
                  aria-controls={exceptionFormRegionId}
                  onClick={handleCloseForm}
                >
                  {CALENDAR_SETTINGS_COPY.exceptionsHideFormAction}
                </Button>
              )}
            </div>

            {showForm ? (
              <form
                id={exceptionFormRegionId}
                aria-labelledby={exceptionFormHeadingId}
                data-testid="exception-form"
                className={cn(portalWellClassName, 'p-4')}
                onSubmit={(event) => void handleCreate(event)}
              >
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <Input
                        id={exceptionNameId}
                        name={exceptionNameId}
                        type="text"
                        label={CALENDAR_SETTINGS_COPY.exceptionsNameLabel}
                        error={validationErrors.name}
                        placeholder={CALENDAR_SETTINGS_COPY.exceptionsNamePlaceholder}
                        value={newException.name}
                        onChange={(e) =>
                          setNewException((prev) => ({ ...prev, name: e.target.value }))
                        }
                        className="h-11"
                      />
                    </div>
                    <div>
                      <DatePicker
                        id={exceptionDateId}
                        name={exceptionDateId}
                        label={CALENDAR_SETTINGS_COPY.exceptionsDateLabel}
                        error={validationErrors.exceptionDate}
                        placeholder="dd/mm/aaaa"
                        value={toDateFromLocalDateValue(newException.exceptionDate)}
                        onChange={(date) =>
                          setNewException((prev) => ({
                            ...prev,
                            exceptionDate: toLocalDateValue(date),
                          }))
                        }
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={exceptionSiteId}
                        className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-400"
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
                        className={cn(portalSelectTriggerClassName, 'h-11')}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 self-end">
                      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-400">
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
                      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-400">
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
                            className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-400"
                          >
                            {CALENDAR_SETTINGS_COPY.exceptionsOpensAtLabel}
                          </label>
                          <TimeFieldSelect
                            id={exceptionOpensAtId}
                            value={newException.opensAt}
                            disabled={false}
                            ariaLabel={CALENDAR_SETTINGS_COPY.exceptionsOpensAtLabel}
                            ariaInvalid={Boolean(validationErrors.opensAt)}
                            ariaDescribedBy={
                              validationErrors.opensAt ? `${exceptionOpensAtId}-error` : undefined
                            }
                            onChange={(nextValue) =>
                              setNewException((prev) => ({ ...prev, opensAt: nextValue }))
                            }
                            dataTestId="exception-opens-at"
                          />
                          {validationErrors.opensAt ? (
                            <p
                              id={`${exceptionOpensAtId}-error`}
                              role="alert"
                              className="mt-1 text-xs text-red-700 dark:text-red-300"
                            >
                              {validationErrors.opensAt}
                            </p>
                          ) : null}
                        </div>
                        <div>
                          <label
                            htmlFor={exceptionClosesAtId}
                            className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-400"
                          >
                            {CALENDAR_SETTINGS_COPY.exceptionsClosesAtLabel}
                          </label>
                          <TimeFieldSelect
                            id={exceptionClosesAtId}
                            value={newException.closesAt}
                            disabled={false}
                            ariaLabel={CALENDAR_SETTINGS_COPY.exceptionsClosesAtLabel}
                            ariaInvalid={Boolean(validationErrors.closesAt)}
                            ariaDescribedBy={
                              validationErrors.closesAt ? `${exceptionClosesAtId}-error` : undefined
                            }
                            onChange={(nextValue) =>
                              setNewException((prev) => ({ ...prev, closesAt: nextValue }))
                            }
                            dataTestId="exception-closes-at"
                          />
                          {validationErrors.closesAt ? (
                            <p
                              id={`${exceptionClosesAtId}-error`}
                              role="alert"
                              className="mt-1 text-xs text-red-700 dark:text-red-300"
                            >
                              {validationErrors.closesAt}
                            </p>
                          ) : null}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 sm:col-span-2">
                          {CALENDAR_SETTINGS_COPY.exceptionsOpenHoursHelper}
                        </p>
                      </>
                    ) : null}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      className={cn('min-h-11', interactiveFocusClassName)}
                      disabled={isSaving}
                    >
                      <Plus className="mr-2 h-4 w-4" aria-hidden={true} />
                      {CALENDAR_SETTINGS_COPY.exceptionsCreateAction}
                    </Button>
                  </div>
                </div>
              </form>
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
            <Button
              type="button"
              variant="secondary"
              className={cn('min-h-11', interactiveFocusClassName)}
              onClick={() => setExceptionToDelete(null)}
            >
              {CALENDAR_SETTINGS_COPY.cancelAction}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className={cn('min-h-11', interactiveFocusClassName)}
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
