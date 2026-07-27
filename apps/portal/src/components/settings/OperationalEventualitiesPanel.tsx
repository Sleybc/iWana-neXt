'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, DatePicker, Select, type SelectOption } from '@iwana/ui';
import type { ListMeta } from '@iwana/shared';
import {
  wfmApi,
  usersApi,
  type OperationalEventuality,
  type OperationalEventualityType,
  type OperationalEventualityStatus,
  type CreateOperationalEventualityDto,
  type InternalUser,
  type ListUsersResponse,
} from '@/lib/api-client';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalPanel,
  PortalTablePager,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import {
  CALENDAR_SETTINGS_COPY,
  OPERATIONAL_EVENTUALITY_STATUS_LABELS,
  OPERATIONAL_EVENTUALITY_TYPE_LABELS,
} from './mod00-settings-labels';
import { TimeFieldSelect } from './TimeFieldSelect';

const EVENTUALITIES_RESOURCE = { singular: 'eventualidad', plural: 'eventualidades' } as const;
const EVENTUALITIES_NAMESPACE = 'eventualities';

const STATUS_BADGE_CLASSES: Record<OperationalEventualityStatus, string> = {
  pending:
    'inline-flex rounded-full px-2.5 py-1 text-xs font-medium leading-5 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  confirmed:
    'inline-flex rounded-full px-2.5 py-1 text-xs font-medium leading-5 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelled:
    'inline-flex rounded-full px-2.5 py-1 text-xs font-medium leading-5 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const inputClass =
  'h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-iwana-secondary focus:outline-none focus:ring-2 focus:ring-iwana-secondary/20 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-100';

const selectClassName = 'rounded-2xl shadow-sm dark:bg-dark-surface-2';
const datePickerButtonClassName =
  'h-10 rounded-2xl border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-100';

interface EmptyDraft {
  userId: string;
  type: OperationalEventualityType | '';
  startsAt: string;
  endsAt: string;
  reason: string;
  origin: string;
  requiresHrReview: boolean;
}

const EMPTY_DRAFT: EmptyDraft = {
  userId: '',
  type: '',
  startsAt: '',
  endsAt: '',
  reason: '',
  origin: '',
  requiresHrReview: false,
};

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

  const [yearPart, monthPart, dayPart] = trimmed.split('-');
  if (!yearPart || !monthPart || !dayPart) {
    return undefined;
  }

  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return undefined;
  }

  return new Date(year, month - 1, day);
}

function getLocalDatePart(value: string): string {
  const [datePart = ''] = value.split('T');
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : '';
}

function getLocalTimePart(value: string): string {
  const [, timePart = ''] = value.split('T');
  return /^\d{2}:\d{2}$/.test(timePart) ? timePart : '';
}

function mergeLocalDateTimeValue(datePart: string, timePart: string): string {
  if (!datePart && !timePart) {
    return '';
  }

  if (!datePart) {
    return '';
  }

  return timePart ? `${datePart}T${timePart}` : datePart;
}

function isCompleteLocalDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
}

interface Props {
  canEdit: boolean;
}

export function OperationalEventualitiesPanel({ canEdit }: Props) {
  return (
    <Suspense
      fallback={
        <PortalPanel
          title={CALENDAR_SETTINGS_COPY.eventualitiesTitle}
          description={CALENDAR_SETTINGS_COPY.eventualitiesDescription}
        >
          <p className="text-sm text-gray-500">
            {CALENDAR_SETTINGS_COPY.eventualitiesLoadingStatus}
          </p>
        </PortalPanel>
      }
    >
      <OperationalEventualitiesPanelInner canEdit={canEdit} />
    </Suspense>
  );
}

function OperationalEventualitiesPanelInner({ canEdit }: Props) {
  const [items, setItems] = useState<OperationalEventuality[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [users, setUsers] = useState<InternalUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [usersUnavailable, setUsersUnavailable] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<EmptyDraft>(EMPTY_DRAFT);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const eventualityFormRegionId = 'operational-eventuality-form-region';
  const eventualityFormHeadingId = 'operational-eventuality-form-heading';
  const eventualityUserId = 'eventuality-user-id';
  const eventualityTypeId = 'eventuality-type-id';
  const eventualityStartsAtId = 'eventuality-starts-at-id';
  const eventualityEndsAtId = 'eventuality-ends-at-id';
  const eventualityReasonId = 'eventuality-reason-id';
  const eventualityOriginId = 'eventuality-origin-id';

  const { page, pageSize, setPage, setPageSize, setQuery } = useTableQueryState({
    namespace: EVENTUALITIES_NAMESPACE,
    defaultPageSize: PORTAL_DEFAULT_PAGE_SIZE,
  });

  const canOpenCreateForm =
    canEdit && !isLoading && !loadFailed && !usersUnavailable && users.length > 0;
  const userOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: CALENDAR_SETTINGS_COPY.eventualitiesUserPlaceholder },
      ...users.map((user) => ({
        value: user.id,
        label:
          user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : (user.email ?? user.id),
      })),
    ],
    [users],
  );
  const eventualityTypeOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: CALENDAR_SETTINGS_COPY.eventualitiesTypePlaceholder },
      ...(Object.keys(OPERATIONAL_EVENTUALITY_TYPE_LABELS) as OperationalEventualityType[]).map(
        (key) => ({
          value: key,
          label: OPERATIONAL_EVENTUALITY_TYPE_LABELS[key],
        }),
      ),
    ],
    [],
  );

  const loadUsers = useCallback(async () => {
    try {
      const usersResult = await usersApi.list();
      const usersData = usersResult as ListUsersResponse | InternalUser[];
      setUsers(
        Array.isArray(usersData) ? usersData : ((usersData as ListUsersResponse).data ?? []),
      );
      setUsersUnavailable(false);
    } catch {
      setUsers([]);
      setUsersUnavailable(true);
    }
  }, []);

  const loadPage = useCallback(
    async (opts?: { soft?: boolean; withUsers?: boolean }) => {
      const soft = opts?.soft === true && hasLoadedOnceRef.current;
      if (soft) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      setLoadFailed(false);

      try {
        const itemsPromise = wfmApi.operationalEventualities.list({
          page,
          limit: pageSize,
        });
        const usersPromise = opts?.withUsers ? loadUsers() : Promise.resolve();
        const [itemsResult] = await Promise.all([itemsPromise, usersPromise]);

        const nextMeta = normalizeListMeta(itemsResult.meta, {
          dataLength: itemsResult.data.length,
          limit: pageSize,
        });
        // sortableFields: [] — no inventar orden.
        const totalPages = nextMeta.totalPages ?? 0;

        if (itemsResult.data.length === 0 && page > 1 && nextMeta.total > 0) {
          setQuery({ page: Math.max(1, totalPages || page - 1) }, { history: 'replace' });
          return;
        }

        setItems(itemsResult.data);
        setMeta(nextMeta);
        hasLoadedOnceRef.current = true;
      } catch {
        setItems([]);
        setMeta(EMPTY_LIST_META);
        setLoadFailed(true);
        setError(CALENDAR_SETTINGS_COPY.eventualitiesLoadError);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [loadUsers, page, pageSize, setQuery],
  );

  useEffect(() => {
    void loadPage({ withUsers: !hasLoadedOnceRef.current });
  }, [loadPage]);

  function updateDraft<K extends keyof EmptyDraft>(key: K, value: EmptyDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleCloseForm() {
    setShowForm(false);
    setDraft(EMPTY_DRAFT);
    setError(null);
  }

  async function handleCreate() {
    if (
      !draft.userId ||
      !draft.type ||
      !isCompleteLocalDateTime(draft.startsAt) ||
      !isCompleteLocalDateTime(draft.endsAt)
    ) {
      setError(CALENDAR_SETTINGS_COPY.eventualitiesValidationRequired);
      return;
    }
    if (draft.startsAt >= draft.endsAt) {
      setError(CALENDAR_SETTINGS_COPY.eventualitiesValidationDates);
      return;
    }
    setError(null);
    setFeedback(null);
    setIsSaving(true);
    try {
      const dto: CreateOperationalEventualityDto = {
        userId: draft.userId,
        type: draft.type as OperationalEventualityType,
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: new Date(draft.endsAt).toISOString(),
        reason: draft.reason.trim() || null,
        origin: draft.origin.trim() || null,
        requiresHrReview: draft.requiresHrReview,
      };
      await wfmApi.operationalEventualities.create(dto);
      setDraft(EMPTY_DRAFT);
      setShowForm(false);
      setFeedback(CALENDAR_SETTINGS_COPY.eventualitiesCreated);
      await loadPage({ soft: true });
    } catch {
      setError(CALENDAR_SETTINGS_COPY.eventualitiesCreateError);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateStatus(id: string, status: OperationalEventualityStatus) {
    setError(null);
    setFeedback(null);
    setPendingActionId(id);

    try {
      const updated = await wfmApi.operationalEventualities.updateStatus(id, { status });
      setItems((prev) =>
        prev.map((item) => (item.id === id ? (updated as OperationalEventuality) : item)),
      );
      setFeedback(
        status === 'confirmed'
          ? CALENDAR_SETTINGS_COPY.eventualitiesConfirmed
          : CALENDAR_SETTINGS_COPY.eventualitiesCancelled,
      );
    } catch {
      setError(CALENDAR_SETTINGS_COPY.eventualitiesStatusError);
    } finally {
      setPendingActionId((current) => (current === id ? null : current));
    }
  }

  async function handleDelete(id: string) {
    if (!(globalThis.confirm?.(CALENDAR_SETTINGS_COPY.eventualitiesDeleteConfirm) ?? true)) {
      return;
    }

    setError(null);
    setFeedback(null);
    setPendingActionId(id);

    try {
      await wfmApi.operationalEventualities.delete(id);
      setFeedback(CALENDAR_SETTINGS_COPY.eventualitiesDeleted);
      await loadPage({ soft: true });
    } catch {
      setError(CALENDAR_SETTINGS_COPY.eventualitiesDeleteError);
    } finally {
      setPendingActionId((current) => (current === id ? null : current));
    }
  }

  function getUserName(userId: string): string {
    const found = users.find((u) => u.id === userId);
    return found
      ? found.firstName && found.lastName
        ? `${found.firstName} ${found.lastName}`
        : (found.email ?? userId)
      : CALENDAR_SETTINGS_COPY.eventualitiesUnknownUserLabel;
  }

  function formatDateLocal(iso: string): string {
    try {
      return new Date(iso).toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  const pageCount = meta.totalPages ?? (meta.total > 0 ? 1 : 0);
  const effectivePage = meta.page ?? page;
  const { from, to } = listPageWindow({
    page: effectivePage,
    limit: meta.limit || pageSize,
    total: meta.total,
  });
  const randomAccess = meta.capabilities.randomAccess;
  const showPager = !isLoading && !loadFailed && meta.total > 0;
  const showPageSize = showPager && randomAccess && meta.total > Math.min(...[10, 20, 50]);

  function updateDraftDateTimeField(
    key: 'startsAt' | 'endsAt',
    part: 'date' | 'time',
    nextValue: Date | undefined | string,
  ) {
    const currentValue = draft[key];
    const nextDatePart =
      part === 'date'
        ? toLocalDateValue(nextValue as Date | undefined)
        : getLocalDatePart(currentValue);
    const nextTimePart =
      part === 'time' ? String(nextValue ?? '').trim() : getLocalTimePart(currentValue);

    updateDraft(key, mergeLocalDateTimeValue(nextDatePart, nextTimePart));
  }

  return (
    <PortalPanel
      eyebrow={CALENDAR_SETTINGS_COPY.eventualitiesEyebrow}
      title={CALENDAR_SETTINGS_COPY.eventualitiesTitle}
      description={CALENDAR_SETTINGS_COPY.eventualitiesDescription}
      contentClassName="space-y-4"
    >
      {feedback ? <PortalAlert variant="success" title={feedback} /> : null}
      {error ? <PortalAlert variant="error" title={error} /> : null}
      {usersUnavailable ? (
        <PortalAlert
          variant="warning"
          title={CALENDAR_SETTINGS_COPY.eventualitiesUsersUnavailableTitle}
          description={CALENDAR_SETTINGS_COPY.eventualitiesUsersUnavailableDescription}
        />
      ) : null}

      {isLoading ? (
        <PortalAlert variant="info" title={CALENDAR_SETTINGS_COPY.eventualitiesLoadingStatus} />
      ) : items.length === 0 ? (
        <PortalEmptyState
          title={CALENDAR_SETTINGS_COPY.eventualitiesEmptyTitle}
          description={CALENDAR_SETTINGS_COPY.eventualitiesEmptyDescription}
        />
      ) : (
        <div className="space-y-3">
          <div className={portalDataTableShellClassName}>
            <table
              className="min-w-full divide-y divide-gray-200 dark:divide-dark-border"
              data-testid="eventualities-table"
            >
              <thead className="bg-gray-50 dark:bg-dark-surface-2">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {CALENDAR_SETTINGS_COPY.eventualitiesTableUserColumn}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {CALENDAR_SETTINGS_COPY.eventualitiesTableTypeColumn}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {CALENDAR_SETTINGS_COPY.eventualitiesTableStartsAtColumn}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {CALENDAR_SETTINGS_COPY.eventualitiesTableEndsAtColumn}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {CALENDAR_SETTINGS_COPY.eventualitiesTableStatusColumn}
                  </th>
                  {canEdit && (
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {CALENDAR_SETTINGS_COPY.eventualitiesTableActionsColumn}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3.5 align-middle text-sm text-gray-700 dark:text-gray-200">
                      {getUserName(item.userId)}
                    </td>
                    <td className="px-4 py-3.5 align-middle text-sm text-gray-700 dark:text-gray-200">
                      {OPERATIONAL_EVENTUALITY_TYPE_LABELS[item.type] ?? item.type}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 align-middle text-sm text-gray-700 dark:text-gray-200">
                      {formatDateLocal(item.startsAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 align-middle text-sm text-gray-700 dark:text-gray-200">
                      {formatDateLocal(item.endsAt)}
                    </td>
                    <td className="px-4 py-3.5 align-middle">
                      <span className={STATUS_BADGE_CLASSES[item.status]}>
                        {OPERATIONAL_EVENTUALITY_STATUS_LABELS[item.status] ?? item.status}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3.5 align-middle">
                        <div className="flex items-center gap-2">
                          {item.status === 'pending' && (
                            <>
                              <button
                                className="text-xs font-medium text-green-600 hover:underline dark:text-green-400"
                                onClick={() => void handleUpdateStatus(item.id, 'confirmed')}
                                disabled={pendingActionId === item.id}
                                data-testid={`confirm-eventuality-${item.id}`}
                              >
                                {CALENDAR_SETTINGS_COPY.eventualitiesConfirmAction}
                              </button>
                              <button
                                className="text-xs font-medium text-red-500 hover:underline dark:text-red-400"
                                onClick={() => void handleUpdateStatus(item.id, 'cancelled')}
                                disabled={pendingActionId === item.id}
                                data-testid={`cancel-eventuality-${item.id}`}
                              >
                                {CALENDAR_SETTINGS_COPY.eventualitiesCancelAction}
                              </button>
                            </>
                          )}
                          {item.status !== 'pending' && (
                            <button
                              className="text-xs font-medium text-gray-400 hover:underline dark:text-gray-500"
                              onClick={() => void handleDelete(item.id)}
                              disabled={pendingActionId === item.id}
                              data-testid={`delete-eventuality-${item.id}`}
                            >
                              {CALENDAR_SETTINGS_COPY.eventualitiesDeleteAction}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showPager && randomAccess ? (
            <PortalTablePager
              page={effectivePage}
              pageCount={Math.max(1, pageCount)}
              onPageChange={setPage}
              from={from}
              to={to}
              total={meta.total}
              resource={EVENTUALITIES_RESOURCE}
              loading={isRefreshing}
              pageSizeControl={
                showPageSize ? (
                  <PortalPageSizeSelect
                    value={pageSize}
                    onChange={setPageSize}
                    disabled={isRefreshing}
                  />
                ) : undefined
              }
            />
          ) : null}
        </div>
      )}

      {canOpenCreateForm && (
        <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-dark-border/70">
          <div className="flex flex-col gap-3 rounded-2xl border border-gray-200/80 bg-iwana-surface-soft/50 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3/40 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p id={eventualityFormHeadingId} className="portal-eyebrow">
                {CALENDAR_SETTINGS_COPY.eventualitiesFormTitle}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {CALENDAR_SETTINGS_COPY.eventualitiesFormDescription}
              </p>
            </div>
            {!showForm ? (
              <Button
                size="sm"
                variant="secondary"
                aria-expanded={false}
                aria-controls={eventualityFormRegionId}
                onClick={() => setShowForm(true)}
                data-testid="add-eventuality-btn"
              >
                {CALENDAR_SETTINGS_COPY.eventualitiesShowFormAction}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={true}
                aria-controls={eventualityFormRegionId}
                onClick={handleCloseForm}
              >
                {CALENDAR_SETTINGS_COPY.eventualitiesHideFormAction}
              </Button>
            )}
          </div>

          {showForm ? (
            <div
              id={eventualityFormRegionId}
              role="region"
              aria-labelledby={eventualityFormHeadingId}
              data-testid="eventuality-form"
              className="rounded-2xl border border-gray-200 bg-iwana-surface-soft/60 p-4 dark:border-dark-border dark:bg-dark-surface-3/50"
            >
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor={eventualityUserId}
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {CALENDAR_SETTINGS_COPY.eventualitiesUserLabel}
                    </label>
                    <Select
                      id={eventualityUserId}
                      className={selectClassName}
                      value={draft.userId}
                      onChange={(e) => updateDraft('userId', e.target.value)}
                      options={userOptions}
                      data-testid="eventuality-user-select"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={eventualityTypeId}
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {CALENDAR_SETTINGS_COPY.eventualitiesTypeLabel}
                    </label>
                    <Select
                      id={eventualityTypeId}
                      className={selectClassName}
                      value={draft.type}
                      onChange={(e) =>
                        updateDraft('type', e.target.value as OperationalEventualityType | '')
                      }
                      options={eventualityTypeOptions}
                      data-testid="eventuality-type-select"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={eventualityStartsAtId}
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {CALENDAR_SETTINGS_COPY.eventualitiesStartsAtLabel}
                    </label>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                      <DatePicker
                        id={eventualityStartsAtId}
                        placeholder="dd/mm/aaaa"
                        value={toDateFromLocalDateValue(getLocalDatePart(draft.startsAt))}
                        onChange={(date) => updateDraftDateTimeField('startsAt', 'date', date)}
                        className="w-full"
                        buttonClassName={datePickerButtonClassName}
                      />
                      <TimeFieldSelect
                        id={`${eventualityStartsAtId}-time`}
                        value={getLocalTimePart(draft.startsAt)}
                        disabled={false}
                        ariaLabel={`${CALENDAR_SETTINGS_COPY.eventualitiesStartsAtLabel} · hora`}
                        onChange={(nextValue) =>
                          updateDraftDateTimeField('startsAt', 'time', nextValue)
                        }
                        dataTestId="eventuality-starts-at-time"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor={eventualityEndsAtId}
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {CALENDAR_SETTINGS_COPY.eventualitiesEndsAtLabel}
                    </label>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                      <DatePicker
                        id={eventualityEndsAtId}
                        placeholder="dd/mm/aaaa"
                        value={toDateFromLocalDateValue(getLocalDatePart(draft.endsAt))}
                        onChange={(date) => updateDraftDateTimeField('endsAt', 'date', date)}
                        className="w-full"
                        buttonClassName={datePickerButtonClassName}
                      />
                      <TimeFieldSelect
                        id={`${eventualityEndsAtId}-time`}
                        value={getLocalTimePart(draft.endsAt)}
                        disabled={false}
                        ariaLabel={`${CALENDAR_SETTINGS_COPY.eventualitiesEndsAtLabel} · hora`}
                        onChange={(nextValue) =>
                          updateDraftDateTimeField('endsAt', 'time', nextValue)
                        }
                        dataTestId="eventuality-ends-at-time"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor={eventualityReasonId}
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {CALENDAR_SETTINGS_COPY.eventualitiesReasonLabel}
                    </label>
                    <input
                      id={eventualityReasonId}
                      type="text"
                      className={inputClass}
                      maxLength={320}
                      value={draft.reason}
                      onChange={(e) => updateDraft('reason', e.target.value)}
                      placeholder={CALENDAR_SETTINGS_COPY.eventualitiesReasonPlaceholder}
                      data-testid="eventuality-reason"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={eventualityOriginId}
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {CALENDAR_SETTINGS_COPY.eventualitiesOriginLabel}
                    </label>
                    <input
                      id={eventualityOriginId}
                      type="text"
                      className={inputClass}
                      maxLength={80}
                      value={draft.origin}
                      onChange={(e) => updateDraft('origin', e.target.value)}
                      placeholder={CALENDAR_SETTINGS_COPY.eventualitiesOriginPlaceholder}
                      data-testid="eventuality-origin"
                    />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    id="requires-hr-review"
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-iwana-secondary focus:ring-iwana-secondary"
                    checked={draft.requiresHrReview}
                    onChange={(e) => updateDraft('requiresHrReview', e.target.checked)}
                    data-testid="eventuality-requires-hr"
                  />
                  <label
                    htmlFor="requires-hr-review"
                    className="text-sm text-gray-700 dark:text-gray-300"
                  >
                    {CALENDAR_SETTINGS_COPY.eventualitiesRequiresReviewLabel}
                  </label>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleCreate}
                    disabled={isSaving}
                    data-testid="save-eventuality-btn"
                  >
                    {isSaving
                      ? CALENDAR_SETTINGS_COPY.eventualitiesSavingAction
                      : CALENDAR_SETTINGS_COPY.eventualitiesSaveAction}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </PortalPanel>
  );
}
