'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
  PortalSkeletonBlock,
  PortalTablePager,
  PortalDataTableHead,
  portalCheckboxClassName,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  interactiveFocusClassName,
  portalSelectTriggerClassName,
  portalWellClassName,
} from '@/components/shared/portal-ui';
import {
  CALENDAR_SETTINGS_COPY,
  OPERATIONAL_EVENTUALITY_STATUS_LABELS,
  OPERATIONAL_EVENTUALITY_TYPE_LABELS,
} from './mod00-settings-labels';
import { TimeFieldSelect } from './TimeFieldSelect';

const EVENTUALITIES_RESOURCE = { singular: 'eventualidad', plural: 'eventualidades' } as const;
const EVENTUALITIES_NAMESPACE = 'eventualities';

const STATUS_BADGE_VARIANTS: Record<
  OperationalEventualityStatus,
  'warning' | 'success' | 'neutral'
> = {
  pending: 'warning',
  confirmed: 'success',
  cancelled: 'neutral',
};

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
  className?: string | undefined;
}

export function OperationalEventualitiesPanel({ canEdit, className }: Props) {
  return (
    <Suspense
      fallback={
        <PortalPanel
          className={className}
          title={CALENDAR_SETTINGS_COPY.eventualitiesTitle}
          description={CALENDAR_SETTINGS_COPY.eventualitiesDescription}
        >
          <PortalSkeletonBlock className="h-48" />
        </PortalPanel>
      }
    >
      <OperationalEventualitiesPanelInner canEdit={canEdit} className={className} />
    </Suspense>
  );
}

function OperationalEventualitiesPanelInner({ canEdit, className }: Props) {
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
  const [validationErrors, setValidationErrors] = useState<
    Partial<Record<'userId' | 'type' | 'startsAt' | 'endsAt', string>>
  >({});
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [eventualityToDelete, setEventualityToDelete] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const usersRequestIdRef = useRef(0);
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
    const requestId = usersRequestIdRef.current + 1;
    usersRequestIdRef.current = requestId;
    try {
      const usersResult = await usersApi.list();
      const usersData = usersResult as ListUsersResponse | InternalUser[];
      if (usersRequestIdRef.current !== requestId) return;
      setUsers(
        Array.isArray(usersData) ? usersData : ((usersData as ListUsersResponse).data ?? []),
      );
      setUsersUnavailable(false);
    } catch {
      if (usersRequestIdRef.current === requestId) setUsersUnavailable(true);
    }
  }, []);

  const loadPage = useCallback(
    async (opts?: { soft?: boolean; withUsers?: boolean }) => {
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      const soft = opts?.soft === true && hasLoadedOnceRef.current;
      const requestedPage = page;
      if (soft) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      setLoadFailed(false);

      try {
        const itemsPromise = wfmApi.operationalEventualities.list({
          page: requestedPage,
          limit: pageSize,
        });
        const usersPromise = opts?.withUsers ? loadUsers() : Promise.resolve();
        const [itemsResult] = await Promise.allSettled([itemsPromise, usersPromise]);

        if (loadRequestIdRef.current !== requestId) return;
        if (itemsResult.status === 'rejected') throw itemsResult.reason;

        const nextMeta = normalizeListMeta(itemsResult.value.meta, {
          dataLength: itemsResult.value.data.length,
          limit: pageSize,
        });
        // sortableFields: [] — no inventar orden.
        const totalPages = nextMeta.totalPages ?? 0;

        if (itemsResult.value.data.length === 0 && requestedPage > 1 && nextMeta.total > 0) {
          setQuery({ page: Math.max(1, totalPages || requestedPage - 1) }, { history: 'replace' });
          return;
        }

        setItems(itemsResult.value.data);
        setMeta(nextMeta);
        hasLoadedOnceRef.current = true;
        setLoadFailed(false);
      } catch {
        if (loadRequestIdRef.current !== requestId) return;
        setLoadFailed(true);
        setError(CALENDAR_SETTINGS_COPY.eventualitiesLoadError);
      } finally {
        if (loadRequestIdRef.current === requestId) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [loadUsers, page, pageSize, setQuery],
  );

  useEffect(() => {
    void loadPage({ withUsers: !hasLoadedOnceRef.current });
  }, [loadPage]);

  function updateDraft<K extends keyof EmptyDraft>(key: K, value: EmptyDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (key === 'userId' || key === 'type' || key === 'startsAt' || key === 'endsAt') {
      setValidationErrors((current) => ({ ...current, [key]: undefined }));
    }
  }

  function handleCloseForm() {
    setShowForm(false);
    setDraft(EMPTY_DRAFT);
    setValidationErrors({});
    setError(null);
  }

  async function handleCreate(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const nextErrors: Partial<Record<'userId' | 'type' | 'startsAt' | 'endsAt', string>> = {};
    if (!draft.userId) nextErrors.userId = CALENDAR_SETTINGS_COPY.eventualitiesValidationRequired;
    if (!draft.type) nextErrors.type = CALENDAR_SETTINGS_COPY.eventualitiesValidationRequired;
    if (!isCompleteLocalDateTime(draft.startsAt)) {
      nextErrors.startsAt = CALENDAR_SETTINGS_COPY.eventualitiesValidationRequired;
    }
    if (!isCompleteLocalDateTime(draft.endsAt)) {
      nextErrors.endsAt = CALENDAR_SETTINGS_COPY.eventualitiesValidationRequired;
    }
    if (draft.startsAt && draft.endsAt && draft.startsAt >= draft.endsAt) {
      nextErrors.endsAt = CALENDAR_SETTINGS_COPY.eventualitiesValidationDates;
    }

    if (Object.keys(nextErrors).length > 0) {
      setValidationErrors(nextErrors);
      setError(null);
      const firstField = (['userId', 'type', 'startsAt', 'endsAt'] as const).find(
        (field) => nextErrors[field],
      );
      requestAnimationFrame(() => {
        if (firstField)
          document
            .getElementById(
              firstField === 'startsAt'
                ? eventualityStartsAtId
                : firstField === 'endsAt'
                  ? eventualityEndsAtId
                  : firstField === 'userId'
                    ? eventualityUserId
                    : eventualityTypeId,
            )
            ?.focus();
      });
      return;
    }

    setValidationErrors({});
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
      setValidationErrors({});
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

  async function handleDeleteConfirmed(id: string) {
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

  function handleDelete(id: string) {
    setEventualityToDelete(id);
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
  const showPager = randomAccess && !isLoading && !loadFailed && meta.total > 0;
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
    <>
      <PortalPanel
        className={className}
        eyebrow={CALENDAR_SETTINGS_COPY.eventualitiesEyebrow}
        title={CALENDAR_SETTINGS_COPY.eventualitiesTitle}
        description={CALENDAR_SETTINGS_COPY.eventualitiesDescription}
        contentClassName="space-y-4"
      >
        {feedback ? <PortalAlert variant="success" title={feedback} /> : null}
        {error ? (
          <PortalAlert
            variant="error"
            live="assertive"
            title={error}
            action={
              loadFailed ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className={cn('min-h-11', interactiveFocusClassName)}
                  onClick={() => void loadPage({ soft: true, withUsers: false })}
                >
                  {CALENDAR_SETTINGS_COPY.calendarRetryAction}
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {usersUnavailable ? (
          <PortalAlert
            variant="warning"
            title={CALENDAR_SETTINGS_COPY.eventualitiesUsersUnavailableTitle}
            description={CALENDAR_SETTINGS_COPY.eventualitiesUsersUnavailableDescription}
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn('min-h-11', interactiveFocusClassName)}
                onClick={() => void loadUsers()}
              >
                {CALENDAR_SETTINGS_COPY.eventualitiesDirectoryRetryAction}
              </Button>
            }
          />
        ) : null}
        {!isLoading && !loadFailed && !randomAccess ? (
          <PortalAlert
            variant="warning"
            title={CALENDAR_SETTINGS_COPY.eventualitiesCursorUnavailable}
          />
        ) : null}

        {isLoading ? (
          <PortalSkeletonBlock className="h-48" />
        ) : loadFailed ? null : items.length === 0 ? (
          <PortalEmptyState
            title={CALENDAR_SETTINGS_COPY.eventualitiesEmptyTitle}
            description={CALENDAR_SETTINGS_COPY.eventualitiesEmptyDescription}
          />
        ) : (
          <div className="space-y-3">
            <div data-testid="eventualities-desktop-table" className="hidden md:block">
              <div
                role="region"
                aria-label={`${CALENDAR_SETTINGS_COPY.eventualitiesTitle} · tabla`}
                className="min-w-0"
              >
                <div className={portalDataTableShellClassName}>
                  <table
                    className="min-w-full"
                    aria-label={CALENDAR_SETTINGS_COPY.eventualitiesTitle}
                    data-testid="eventualities-table"
                  >
                    <thead className={portalDataTableHeadRowClassName}>
                      <tr>
                        <PortalDataTableHead>
                          {CALENDAR_SETTINGS_COPY.eventualitiesTableUserColumn}
                        </PortalDataTableHead>
                        <PortalDataTableHead>
                          {CALENDAR_SETTINGS_COPY.eventualitiesTableTypeColumn}
                        </PortalDataTableHead>
                        <PortalDataTableHead>
                          {CALENDAR_SETTINGS_COPY.eventualitiesTableStartsAtColumn}
                        </PortalDataTableHead>
                        <PortalDataTableHead>
                          {CALENDAR_SETTINGS_COPY.eventualitiesTableEndsAtColumn}
                        </PortalDataTableHead>
                        <PortalDataTableHead>
                          {CALENDAR_SETTINGS_COPY.eventualitiesTableStatusColumn}
                        </PortalDataTableHead>
                        {canEdit && (
                          <PortalDataTableHead>
                            {CALENDAR_SETTINGS_COPY.eventualitiesTableActionsColumn}
                          </PortalDataTableHead>
                        )}
                      </tr>
                    </thead>
                    <tbody className={portalDataTableBodyClassName}>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td className={portalDataTableCellClassName}>
                            {getUserName(item.userId)}
                          </td>
                          <td className={portalDataTableCellClassName}>
                            {OPERATIONAL_EVENTUALITY_TYPE_LABELS[item.type] ?? item.type}
                          </td>
                          <td
                            className={`whitespace-nowrap ${portalDataTableCellClassName} font-mono tabular-nums`}
                          >
                            {formatDateLocal(item.startsAt)}
                          </td>
                          <td
                            className={`whitespace-nowrap ${portalDataTableCellClassName} font-mono tabular-nums`}
                          >
                            {formatDateLocal(item.endsAt)}
                          </td>
                          <td className={portalDataTableCellClassName}>
                            <Badge variant={STATUS_BADGE_VARIANTS[item.status]}>
                              {OPERATIONAL_EVENTUALITY_STATUS_LABELS[item.status] ?? item.status}
                            </Badge>
                          </td>
                          {canEdit && (
                            <td className={portalDataTableCellClassName}>
                              <div className="flex items-center gap-2">
                                {item.status === 'pending' && (
                                  <>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className={cn('min-h-11', interactiveFocusClassName)}
                                      onClick={() => void handleUpdateStatus(item.id, 'confirmed')}
                                      disabled={pendingActionId === item.id}
                                      data-testid={`confirm-eventuality-${item.id}`}
                                    >
                                      {CALENDAR_SETTINGS_COPY.eventualitiesConfirmAction}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className={cn(
                                        'min-h-11',
                                        interactiveFocusClassName,
                                        'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300',
                                      )}
                                      onClick={() => void handleUpdateStatus(item.id, 'cancelled')}
                                      disabled={pendingActionId === item.id}
                                      data-testid={`cancel-eventuality-${item.id}`}
                                    >
                                      {CALENDAR_SETTINGS_COPY.eventualitiesCancelAction}
                                    </Button>
                                  </>
                                )}
                                {item.status !== 'pending' && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                      'min-h-11',
                                      interactiveFocusClassName,
                                      'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300',
                                    )}
                                    onClick={() => handleDelete(item.id)}
                                    disabled={pendingActionId === item.id}
                                    data-testid={`delete-eventuality-${item.id}`}
                                  >
                                    {CALENDAR_SETTINGS_COPY.eventualitiesDeleteAction}
                                  </Button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div
              className="md:hidden"
              role="region"
              aria-label={`${CALENDAR_SETTINGS_COPY.eventualitiesTitle} · lista`}
            >
              <ul
                data-testid="eventualities-mobile-list"
                className="space-y-3"
                aria-label={`${CALENDAR_SETTINGS_COPY.eventualitiesTitle} · lista`}
              >
                {items.map((item) => (
                  <li
                    key={item.id}
                    data-testid={`eventuality-mobile-card-${item.id}`}
                    className={cn(portalWellClassName, 'space-y-3 p-4')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-gray-400">
                          {getUserName(item.userId)}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {OPERATIONAL_EVENTUALITY_TYPE_LABELS[item.type] ?? item.type}
                        </p>
                      </div>
                      <Badge variant={STATUS_BADGE_VARIANTS[item.status]}>
                        {OPERATIONAL_EVENTUALITY_STATUS_LABELS[item.status] ?? item.status}
                      </Badge>
                    </div>
                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-gray-500 dark:text-gray-400">
                          {CALENDAR_SETTINGS_COPY.eventualitiesMobileScheduleLabel}
                        </dt>
                        <dd className="font-mono tabular-nums text-gray-900 dark:text-gray-400">
                          {formatDateLocal(item.startsAt)} — {formatDateLocal(item.endsAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500 dark:text-gray-400">
                          {CALENDAR_SETTINGS_COPY.eventualitiesMobileScopeLabel}
                        </dt>
                        <dd className="text-gray-900 dark:text-gray-400">
                          {item.organizationSiteId
                            ? CALENDAR_SETTINGS_COPY.eventualitiesMobileScopeSite
                            : CALENDAR_SETTINGS_COPY.eventualitiesMobileScopeOrganization}
                        </dd>
                      </div>
                    </dl>
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        {item.status === 'pending' ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={cn('min-h-11', interactiveFocusClassName)}
                              onClick={() => void handleUpdateStatus(item.id, 'confirmed')}
                              disabled={pendingActionId === item.id}
                              data-testid={`confirm-eventuality-mobile-${item.id}`}
                            >
                              {CALENDAR_SETTINGS_COPY.eventualitiesConfirmAction}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={cn(
                                'min-h-11',
                                interactiveFocusClassName,
                                'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300',
                              )}
                              onClick={() => void handleUpdateStatus(item.id, 'cancelled')}
                              disabled={pendingActionId === item.id}
                              data-testid={`cancel-eventuality-mobile-${item.id}`}
                            >
                              {CALENDAR_SETTINGS_COPY.eventualitiesCancelAction}
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={cn(
                              'min-h-11',
                              interactiveFocusClassName,
                              'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300',
                            )}
                            onClick={() => handleDelete(item.id)}
                            disabled={pendingActionId === item.id}
                            data-testid={`delete-eventuality-mobile-${item.id}`}
                          >
                            {CALENDAR_SETTINGS_COPY.eventualitiesDeleteAction}
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            {showPager ? (
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
            <div
              className={cn(
                portalWellClassName,
                'p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
              )}
            >
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
                  className={cn('min-h-11', interactiveFocusClassName)}
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
                  className={cn('min-h-11', interactiveFocusClassName)}
                  aria-expanded={true}
                  aria-controls={eventualityFormRegionId}
                  onClick={handleCloseForm}
                >
                  {CALENDAR_SETTINGS_COPY.eventualitiesHideFormAction}
                </Button>
              )}
            </div>

            {showForm ? (
              <form
                id={eventualityFormRegionId}
                aria-labelledby={eventualityFormHeadingId}
                data-testid="eventuality-form"
                className={cn(portalWellClassName, 'p-4')}
                onSubmit={(event) => void handleCreate(event)}
              >
                <div className="space-y-4">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {CALENDAR_SETTINGS_COPY.eventualitiesOperationalScopeHint}
                  </p>
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
                        className={cn(portalSelectTriggerClassName, 'h-11')}
                        value={draft.userId}
                        onChange={(e) => updateDraft('userId', e.target.value)}
                        options={userOptions}
                        error={validationErrors.userId ?? ''}
                        aria-describedby={
                          validationErrors.userId ? `${eventualityUserId}-error` : undefined
                        }
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
                        className={cn(portalSelectTriggerClassName, 'h-11')}
                        value={draft.type}
                        onChange={(e) =>
                          updateDraft('type', e.target.value as OperationalEventualityType | '')
                        }
                        options={eventualityTypeOptions}
                        error={validationErrors.type ?? ''}
                        aria-describedby={
                          validationErrors.type ? `${eventualityTypeId}-error` : undefined
                        }
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
                          error={validationErrors.startsAt}
                          placeholder="dd/mm/aaaa"
                          value={toDateFromLocalDateValue(getLocalDatePart(draft.startsAt))}
                          onChange={(date) => updateDraftDateTimeField('startsAt', 'date', date)}
                          className="w-full"
                        />
                        <TimeFieldSelect
                          id={`${eventualityStartsAtId}-time`}
                          value={getLocalTimePart(draft.startsAt)}
                          disabled={false}
                          ariaLabel={`${CALENDAR_SETTINGS_COPY.eventualitiesStartsAtLabel} · hora`}
                          ariaInvalid={Boolean(validationErrors.startsAt)}
                          ariaDescribedBy={
                            validationErrors.startsAt
                              ? eventualityFormRegionId + '-starts-error'
                              : undefined
                          }
                          onChange={(nextValue) =>
                            updateDraftDateTimeField('startsAt', 'time', nextValue)
                          }
                          dataTestId="eventuality-starts-at-time"
                        />
                      </div>
                      {validationErrors.startsAt ? (
                        <p
                          id={`${eventualityFormRegionId}-starts-error`}
                          role="alert"
                          className="text-xs text-red-700 dark:text-red-300 sm:col-span-2"
                        >
                          {validationErrors.startsAt}
                        </p>
                      ) : null}
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
                          error={validationErrors.endsAt}
                          placeholder="dd/mm/aaaa"
                          value={toDateFromLocalDateValue(getLocalDatePart(draft.endsAt))}
                          onChange={(date) => updateDraftDateTimeField('endsAt', 'date', date)}
                          className="w-full"
                        />
                        <TimeFieldSelect
                          id={`${eventualityEndsAtId}-time`}
                          value={getLocalTimePart(draft.endsAt)}
                          disabled={false}
                          ariaLabel={`${CALENDAR_SETTINGS_COPY.eventualitiesEndsAtLabel} · hora`}
                          ariaInvalid={Boolean(validationErrors.endsAt)}
                          ariaDescribedBy={
                            validationErrors.endsAt
                              ? eventualityFormRegionId + '-ends-error'
                              : undefined
                          }
                          onChange={(nextValue) =>
                            updateDraftDateTimeField('endsAt', 'time', nextValue)
                          }
                          dataTestId="eventuality-ends-at-time"
                        />
                      </div>
                      {validationErrors.endsAt ? (
                        <p
                          id={`${eventualityFormRegionId}-ends-error`}
                          role="alert"
                          className="text-xs text-red-700 dark:text-red-300 sm:col-span-2"
                        >
                          {validationErrors.endsAt}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <Input
                        id={eventualityReasonId}
                        type="text"
                        label={CALENDAR_SETTINGS_COPY.eventualitiesReasonLabel}
                        className="h-11"
                        maxLength={320}
                        value={draft.reason}
                        onChange={(e) => updateDraft('reason', e.target.value)}
                        placeholder={CALENDAR_SETTINGS_COPY.eventualitiesReasonPlaceholder}
                        data-testid="eventuality-reason"
                      />
                    </div>
                    <div>
                      <Input
                        id={eventualityOriginId}
                        type="text"
                        label={CALENDAR_SETTINGS_COPY.eventualitiesOriginLabel}
                        className="h-11"
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
                      className={portalCheckboxClassName}
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
                      type="submit"
                      className={cn('min-h-11', interactiveFocusClassName)}
                      disabled={isSaving}
                      data-testid="save-eventuality-btn"
                    >
                      {isSaving
                        ? CALENDAR_SETTINGS_COPY.eventualitiesSavingAction
                        : CALENDAR_SETTINGS_COPY.eventualitiesSaveAction}
                    </Button>
                  </div>
                </div>
              </form>
            ) : null}
          </div>
        )}
      </PortalPanel>

      <Dialog
        open={eventualityToDelete !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEventualityToDelete(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <p className="portal-eyebrow">Confirmación</p>
            <DialogTitle className="mt-1">
              {CALENDAR_SETTINGS_COPY.eventualitiesDeleteConfirm}
            </DialogTitle>
            <DialogDescription>
              {CALENDAR_SETTINGS_COPY.eventualitiesDeleteDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              className={cn('min-h-11', interactiveFocusClassName)}
              onClick={() => setEventualityToDelete(null)}
            >
              {CALENDAR_SETTINGS_COPY.cancelAction}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className={cn('min-h-11', interactiveFocusClassName)}
              onClick={() => {
                const id = eventualityToDelete;
                setEventualityToDelete(null);
                if (id) {
                  void handleDeleteConfirmed(id);
                }
              }}
            >
              {CALENDAR_SETTINGS_COPY.eventualitiesDeleteAction}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
