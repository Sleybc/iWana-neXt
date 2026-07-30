'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@iwana/ui';
import {
  ExecutionOrderResult,
  InventoryItemStatus,
  StockLocationStatus,
  type RegisterActivityCommand,
  TaskExecutionMode,
  TaskOriginContext,
  TaskStatus,
} from '@iwana/shared';
import type {
  ExecutionOrderActivityRecord,
  ExecutionOrderItemUsageRecord,
  ExecutionOrderRecord,
  CreateOperationalTaskDto,
  InternalUser,
  OperationalTaskAssignmentHistoryRecord,
  OperationalTaskRecord,
  OperationalTaskTimelineEvent,
  ExecutionOrderEvidencePage,
  ExecutionOrderEvidenceRecord,
  RegisterExecutionOrderItemUsageDto,
  CloseExecutionOrderDto,
} from '@/lib/api-client';
import type {
  ExecutionOrderDetail,
  ExecutionOrderActivity,
  ExecutionOrderItemUsage,
  ExecutionOrderEvidence,
  ExecutionOrderTemplateVersion,
} from '@iwana/shared';
import { ApiError, inventoryApi, tasksApi, usersApi } from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSectionHeader,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import { TaskDetailDrawer } from './TaskDetailDrawer';
import { ExecutionOrderDrawer } from './ExecutionOrderDrawer';
import { TaskForm } from './TaskForm';
import type { TaskFormSubmitOptions } from './TaskForm';
import { TasksTable } from './TasksTable';
import { TasksToolbar } from './TasksToolbar';
import { createTaskVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';

type EvidenceCollection =
  | ExecutionOrderEvidencePage
  | ExecutionOrderEvidenceRecord[]
  | null
  | undefined;

export function normalizeExecutionOrderEvidence(
  value: EvidenceCollection,
): ExecutionOrderEvidenceRecord[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value?.data ?? [];
}

const USERS_PAGE_SIZE = 100;
const TASKS_PAGE_SIZE = 20;
const INTERNAL_AREA_OPTIONS = [
  { value: 'operations-area', label: 'Operaciones' },
  { value: 'noc-area', label: 'NOC' },
  { value: 'support-area', label: 'Soporte' },
];

function mapOperationsError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente para continuar.';
    if (error.status === 403) return 'No tienes permisos para operar esta vista de Operaciones.';
    if (error.status === 404) return 'La tarea consultada ya no está disponible.';
    return error.message;
  }

  return 'No fue posible completar la operación. Intenta de nuevo.';
}

export interface ExecutionOrderMissingRequirement {
  requirementId: string;
  label: string;
  kind: string;
  reason: string;
}

export function getMissingRequirements(error: unknown): ExecutionOrderMissingRequirement[] {
  if (!(error instanceof ApiError)) return [];
  const details = error.details;
  const values =
    error.missingRequirements ??
    (details && typeof details === 'object'
      ? (details as { missingRequirements?: unknown }).missingRequirements
      : undefined);
  if (!Array.isArray(values)) return [];

  return values.flatMap((value): ExecutionOrderMissingRequirement[] => {
    if (typeof value === 'string') {
      return [
        {
          requirementId: value,
          label: 'Requisito pendiente',
          kind: 'OTHER',
          reason: 'Completa el requisito pendiente antes de cerrar la orden.',
        },
      ];
    }
    if (!value || typeof value !== 'object') return [];
    const requirement = value as Record<string, unknown>;
    if (
      typeof requirement.requirementId !== 'string' ||
      typeof requirement.label !== 'string' ||
      typeof requirement.reason !== 'string'
    ) {
      return [];
    }
    return [
      {
        requirementId: requirement.requirementId,
        label: requirement.label,
        kind: typeof requirement.kind === 'string' ? requirement.kind : 'OTHER',
        reason: requirement.reason,
      },
    ];
  });
}

export function normalizeExecutionOrderCollection<T>(
  value: T[] | { data?: T[] | null; meta?: unknown } | null | undefined,
): T[] {
  return Array.isArray(value) ? value : (value?.data ?? []);
}

export function resolveAssignedTemplateVersion(
  versions: ExecutionOrderTemplateVersion[],
  assignedVersion: number,
): ExecutionOrderTemplateVersion | null {
  return versions.find((version) => version.version === assignedVersion) ?? null;
}

export function isValidFutureEvidenceExpiry(
  expiresAt: string | null | undefined,
  now = Date.now(),
): expiresAt is string {
  if (!expiresAt) {
    return false;
  }

  const parsedExpiry = Date.parse(expiresAt);
  return Number.isFinite(parsedExpiry) && parsedExpiry > now;
}

async function loadOperationalUsers(): Promise<InternalUser[]> {
  const collected = new Map<string, InternalUser>();
  let cursor: string | undefined;

  do {
    const response = await usersApi.list(
      cursor ? { cursor, limit: USERS_PAGE_SIZE } : { limit: USERS_PAGE_SIZE },
    );
    response.data.forEach((user) => collected.set(user.id, user));
    cursor = response.meta.nextCursor ?? undefined;
  } while (cursor);

  return Array.from(collected.values());
}

function buildUserLabel(user: InternalUser): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || 'Usuario del equipo';
}

function requiresScheduling(task: OperationalTaskRecord | null): boolean {
  if (!task) {
    return false;
  }

  return (
    task.scheduledRequired ||
    [TaskExecutionMode.SCHEDULED, TaskExecutionMode.FIELD_SERVICE].includes(task.executionMode)
  );
}

export function OperationsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<OperationalTaskRecord[]>([]);
  const [tasksPage, setTasksPage] = useState(1);
  const [tasksTotal, setTasksTotal] = useState(0);
  const [users, setUsers] = useState<InternalUser[]>([]);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [lastCreatedTask, setLastCreatedTask] = useState<OperationalTaskRecord | null>(null);
  const [selectedTask, setSelectedTask] = useState<OperationalTaskRecord | null>(null);
  const [timeline, setTimeline] = useState<OperationalTaskTimelineEvent[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<
    OperationalTaskAssignmentHistoryRecord[]
  >([]);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [selectedExecutionOrder, setSelectedExecutionOrder] = useState<ExecutionOrderDetail | null>(
    null,
  );
  const [executionOrderActivities, setExecutionOrderActivities] = useState<
    ExecutionOrderActivity[]
  >([]);
  const [executionOrderItemUsage, setExecutionOrderItemUsage] = useState<ExecutionOrderItemUsage[]>(
    [],
  );
  const [executionOrderEvidence, setExecutionOrderEvidence] = useState<ExecutionOrderEvidence[]>(
    [],
  );
  const [executionOrderEvidenceState, setExecutionOrderEvidenceState] = useState<
    'loading' | 'available' | 'unavailable'
  >('available');
  const [executionOrderTemplate, setExecutionOrderTemplate] =
    useState<ExecutionOrderTemplateVersion | null>(null);
  const [executionOrderItemOptions, setExecutionOrderItemOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [executionOrderCustodyOptions, setExecutionOrderCustodyOptions] = useState<
    Array<{ type: 'TECHNICIAN' | 'CREW'; id: string; label: string }>
  >([]);
  const [executionOrderMissingRequirements, setExecutionOrderMissingRequirements] = useState<
    ExecutionOrderMissingRequirement[]
  >([]);
  const [executionOrderError, setExecutionOrderError] = useState<string | null>(null);
  const [executionOrderSuccess, setExecutionOrderSuccess] = useState<string | null>(null);
  const [isLoadingExecutionOrder, setIsLoadingExecutionOrder] = useState(false);
  const [isSubmittingExecutionOrder, setIsSubmittingExecutionOrder] = useState(false);
  const [offline, setOffline] = useState(false);
  const detailRequestRef = useRef(0);

  useEffect(() => {
    const updateConnectionState = () => setOffline(!navigator.onLine);
    updateConnectionState();
    window.addEventListener('online', updateConnectionState);
    window.addEventListener('offline', updateConnectionState);

    return () => {
      window.removeEventListener('online', updateConnectionState);
      window.removeEventListener('offline', updateConnectionState);
    };
  }, []);

  const responsibleOptions = useMemo(
    () =>
      users.map((user) => ({
        value: user.id,
        label: buildUserLabel(user),
      })),
    [users],
  );

  const userLabelMap = useMemo(
    () => new Map(users.map((user) => [user.id, buildUserLabel(user)])),
    [users],
  );

  const lastCreatedTaskNeedsScheduling = useMemo(
    () => requiresScheduling(lastCreatedTask),
    [lastCreatedTask],
  );
  const linkedTicketId = searchParams.get('ticketId');
  const fromAssurance = searchParams.get('fromAssurance') === '1';
  const initialTicketId = linkedTicketId?.trim() ? linkedTicketId : null;
  const initialOriginContext =
    initialTicketId && fromAssurance ? TaskOriginContext.ASSURANCE : undefined;

  const loadTasks = useCallback(
    async (options?: { append?: boolean }) => {
      const append = options?.append === true;
      const nextPage = append ? tasksPage + 1 : 1;

      if (append) {
        if (isLoadingMore || tasks.length >= tasksTotal) {
          return;
        }
        setIsLoadingMore(true);
      } else {
        setIsRefreshing(true);
      }

      setError(null);
      try {
        const response = await tasksApi.list({
          ...(statusFilter ? { status: statusFilter } : {}),
          page: nextPage,
          limit: TASKS_PAGE_SIZE,
        });
        setTasks((prev) => (append ? [...prev, ...response.data] : response.data));
        setTasksTotal(response.total);
        setTasksPage(response.page);
      } catch (loadError) {
        setError(mapOperationsError(loadError));
        if (!append) {
          setTasks([]);
          setTasksTotal(0);
          setTasksPage(1);
        }
      } finally {
        if (append) {
          setIsLoadingMore(false);
        } else {
          setIsRefreshing(false);
          setIsLoading(false);
        }
      }
    },
    [isLoadingMore, statusFilter, tasks.length, tasksPage, tasksTotal],
  );

  // Reset al filtrar.
  useEffect(() => {
    void loadTasks();
  }, [statusFilter]);

  const hasMoreTasks = tasks.length < tasksTotal;

  useEffect(() => {
    void loadOperationalUsers()
      .then(setUsers)
      .catch(() => {
        /* usuarios opcionales para el formulario */
      });
  }, []);

  const openExecutionOrder = useCallback(async (executionOrderId: string) => {
    setIsLoadingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    setExecutionOrderEvidenceState('loading');
    try {
      const [order, activities, itemUsage] = await Promise.all([
        tasksApi.executionOrders.get(executionOrderId),
        tasksApi.executionOrders.listActivities(executionOrderId),
        tasksApi.executionOrders.listItemUsage(executionOrderId),
      ]);
      const detail = order as unknown as ExecutionOrderDetail;
      setSelectedExecutionOrder(detail);
      setExecutionOrderActivities(
        normalizeExecutionOrderCollection(activities) as unknown as ExecutionOrderActivity[],
      );
      setExecutionOrderItemUsage(
        normalizeExecutionOrderCollection(itemUsage) as unknown as ExecutionOrderItemUsage[],
      );

      try {
        const [items, locations] = await Promise.all([
          inventoryApi.listItems({ status: InventoryItemStatus.ACTIVE, limit: 100 }),
          inventoryApi.listLocations({
            custody: 'mobile',
            status: StockLocationStatus.ACTIVE,
            withStock: true,
            limit: 100,
          }),
        ]);
        setExecutionOrderItemOptions(
          items.data.map((item) => ({ value: item.id, label: `${item.sku} · ${item.name}` })),
        );
        setExecutionOrderCustodyOptions(
          locations.data.map((location) => ({
            type: location.type === 'MOBILE_CREW' ? 'CREW' : 'TECHNICIAN',
            id: location.id,
            label: location.name,
          })),
        );
      } catch {
        setExecutionOrderItemOptions([]);
        setExecutionOrderCustodyOptions([]);
      }

      try {
        const evidence = await tasksApi.executionOrders.listEvidence(executionOrderId);
        setExecutionOrderEvidence(
          normalizeExecutionOrderEvidence(evidence) as unknown as ExecutionOrderEvidence[],
        );
        setExecutionOrderEvidenceState('available');
      } catch {
        setExecutionOrderEvidence([]);
        setExecutionOrderEvidenceState('unavailable');
      }

      const templateReference = detail.template;
      if (templateReference?.id) {
        try {
          const versions = await tasksApi.executionOrders.listTemplateVersions(
            templateReference.id,
          );
          const templateVersions = normalizeExecutionOrderCollection(versions);
          setExecutionOrderTemplate(
            resolveAssignedTemplateVersion(templateVersions, templateReference.version),
          );
        } catch {
          setExecutionOrderTemplate(null);
          setExecutionOrderError(
            'No fue posible cargar la plantilla aplicada. La orden se conserva abierta y el cierre permanece bloqueado.',
          );
        }
      } else {
        setExecutionOrderTemplate(null);
      }
      setExecutionOrderMissingRequirements([]);
    } catch (loadError) {
      setExecutionOrderError(mapOperationsError(loadError));
      setSelectedExecutionOrder(null);
      setExecutionOrderActivities([]);
      setExecutionOrderItemUsage([]);
      setExecutionOrderEvidence([]);
      setExecutionOrderEvidenceState('available');
      setExecutionOrderTemplate(null);
      setExecutionOrderItemOptions([]);
      setExecutionOrderCustodyOptions([]);
      setExecutionOrderMissingRequirements([]);
    } finally {
      setIsLoadingExecutionOrder(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const executionOrderId = new URLSearchParams(window.location.search).get('executionOrderId');
    if (executionOrderId) {
      void openExecutionOrder(executionOrderId);
    }
  }, [openExecutionOrder]);

  const openTaskDetail = useCallback(async (task: OperationalTaskRecord) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setSelectedTask(task);
    setDrawerError(null);
    setTimeline([]);
    setAssignmentHistory([]);
    setIsLoadingDetail(true);
    try {
      const [timelineEvents, history] = await Promise.all([
        tasksApi.timeline(task.id),
        tasksApi.assignmentHistory(task.id),
      ]);
      if (detailRequestRef.current !== requestId) {
        return;
      }
      setTimeline(timelineEvents);
      setAssignmentHistory(history);
    } catch (detailError) {
      if (detailRequestRef.current !== requestId) {
        return;
      }
      setDrawerError(mapOperationsError(detailError));
      setTimeline([]);
      setAssignmentHistory([]);
    } finally {
      if (detailRequestRef.current === requestId) {
        setIsLoadingDetail(false);
      }
    }
  }, []);

  async function handleCreate(payload: CreateOperationalTaskDto, options?: TaskFormSubmitOptions) {
    setIsSubmitting(true);
    setCreateError(null);
    setLastCreatedTask(null);
    try {
      const createdTask = await tasksApi.create(payload);
      setLastCreatedTask(createdTask);
      await loadTasks();

      if (options?.followUpAction) {
        const result = await createTaskVisitRequestAndRoute({
          taskId: createdTask.id,
          taskType: createdTask.type,
          title: createdTask.title,
          ticketId: createdTask.ticketId ?? null,
          municipality: null,
          address: null,
          nextAction: options.followUpAction,
        });
        router.push(result.href);
      }
    } catch (createTaskError) {
      setCreateError(mapOperationsError(createTaskError));
      throw createTaskError;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTransition(status: TaskStatus) {
    if (!selectedTask) return;
    setIsTransitioning(true);
    setDrawerError(null);
    try {
      const updated = await tasksApi.transition(selectedTask.id, { status });
      setSelectedTask(updated);
      await loadTasks();
      await openTaskDetail(updated);
    } catch (transitionError) {
      setDrawerError(mapOperationsError(transitionError));
    } finally {
      setIsTransitioning(false);
    }
  }

  async function refreshExecutionOrder(executionOrderId: string) {
    await openExecutionOrder(executionOrderId);
  }

  async function handleStartExecutionOrder(note?: string | null) {
    if (!selectedExecutionOrder) return;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      await tasksApi.executionOrders.start(selectedExecutionOrder.id, { note: note ?? null });
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('La ejecución fue iniciada.');
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleRegisterExecutionOrderFieldWork(payload: RegisterActivityCommand) {
    if (!selectedExecutionOrder) return;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      await tasksApi.executionOrders.registerFieldWork(selectedExecutionOrder.id, payload);
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('El trabajo realizado fue registrado.');
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleRegisterExecutionOrderItemUsage(
    payload: RegisterExecutionOrderItemUsageDto,
  ) {
    if (!selectedExecutionOrder) return;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      await tasksApi.executionOrders.registerItemUsage(selectedExecutionOrder.id, payload);
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('El material fue registrado.');
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleUploadEvidence(files: File[], requirementKey: string) {
    if (!selectedExecutionOrder) return;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      for (const file of files) {
        const uploadReceipt = await tasksApi.executionOrders.uploadEvidenceAsset(
          selectedExecutionOrder.id,
          file,
        );
        if (!isValidFutureEvidenceExpiry(uploadReceipt.expiresAt)) {
          throw new Error('La evidencia subida no tiene una fecha de expiración válida.');
        }
        await tasksApi.executionOrders.registerEvidence(selectedExecutionOrder.id, {
          mediaAssetId: uploadReceipt.mediaAssetId,
          evidenceType: file.type.startsWith('image/') ? 'PHOTO' : 'DOCUMENT',
          requirementKey,
          expiresAt: uploadReceipt.expiresAt,
        });
      }
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('La evidencia fue registrada.');
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleCloseExecutionOrder(payload: CloseExecutionOrderDto) {
    if (!selectedExecutionOrder) return;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      await tasksApi.executionOrders.close(selectedExecutionOrder.id, payload);
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('El cierre fue registrado.');
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
      setExecutionOrderMissingRequirements(getMissingRequirements(error));
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operaciones"
        subtitle="Crea, despacha y sigue tareas con responsable y destinatario explícitos."
        actions={
          <Button asChild={true} variant="secondary">
            <Link href="/dashboard/scheduling">Abrir Programación</Link>
          </Button>
        }
      />

      {error && (
        <PortalAlert variant="error" title="No fue posible cargar las tareas" description={error} />
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <PortalPanel
          eyebrow="Despacho operativo"
          title="Crear tarea"
          description="Registra el trabajo primero en Operaciones para conservar trazabilidad, responsable y destinatario."
        >
          {initialTicketId && fromAssurance && (
            <PortalAlert
              variant="info"
              title="Tarea vinculada a ticket"
              description="El formulario quedó prellenado para crear una tarea asociada al ticket de mesa de ayuda."
              className="mb-4"
            />
          )}

          {lastCreatedTask && (
            <PortalAlert
              variant="success"
              title={`Tarea ${lastCreatedTask.taskNumber} creada`}
              description={
                lastCreatedTaskNeedsScheduling
                  ? 'La tarea ya quedó registrada. Si no elegiste un siguiente paso, puedes crear la solicitud de visita desde el detalle.'
                  : 'La tarea ya aparece en la bandeja operativa y puede ejecutarse o seguirse desde el detalle.'
              }
              action={
                lastCreatedTaskNeedsScheduling ? (
                  <Button asChild={true} variant="secondary" size="sm">
                    <Link href="/dashboard/scheduling/pending-visits">Ver pendientes</Link>
                  </Button>
                ) : undefined
              }
              className="mb-4"
            />
          )}

          <TaskForm
            responsibleOptions={responsibleOptions}
            internalAreaOptions={INTERNAL_AREA_OPTIONS}
            internalUserOptions={responsibleOptions}
            {...(initialTicketId ? { initialTicketId } : {})}
            {...(initialOriginContext ? { initialOriginContext } : {})}
            onSubmit={handleCreate}
            isSubmitting={isSubmitting}
            error={createError}
          />
        </PortalPanel>

        <PortalPanel
          eyebrow="Seguimiento"
          title="Bandeja de tareas"
          description="Filtra el trabajo activo y abre el detalle para transiciones, historial y vinculaciones."
        >
          <div className="space-y-4">
            <PortalSectionHeader
              title="Cola operativa"
              description="La apertura del detalle conserva la historia de asignaciones y eventos de la tarea."
            />

            <TasksToolbar
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              onRefresh={() => void loadTasks()}
              isRefreshing={isRefreshing}
            />

            {isLoading ? (
              <PortalSkeletonBlock className="h-48" />
            ) : tasks.length === 0 ? (
              <PortalEmptyState
                title="Sin tareas para este filtro"
                description="Ajusta el estado seleccionado o crea una nueva tarea para iniciar el flujo operativo."
              />
            ) : (
              <TasksTable
                tasks={tasks}
                selectedTaskId={selectedTask?.id ?? null}
                totalCount={tasksTotal}
                hasMore={hasMoreTasks}
                isLoadingMore={isLoadingMore}
                onLoadMore={() => void loadTasks({ append: true })}
                onSelect={(task) => void openTaskDetail(task)}
              />
            )}
          </div>
        </PortalPanel>
      </div>

      <TaskDetailDrawer
        open={Boolean(selectedTask)}
        task={selectedTask}
        timeline={timeline}
        assignmentHistory={assignmentHistory}
        onClose={() => {
          detailRequestRef.current += 1;
          setSelectedTask(null);
          setTimeline([]);
          setAssignmentHistory([]);
          setIsLoadingDetail(false);
        }}
        onTransition={handleTransition}
        isTransitioning={isTransitioning}
        isLoadingDetails={isLoadingDetail}
        error={drawerError}
        resolveResponsibleLabel={(value) =>
          userLabelMap.get(value ?? '') ?? value ?? 'Sin responsable'
        }
      />

      <ExecutionOrderDrawer
        open={Boolean(selectedExecutionOrder) || isLoadingExecutionOrder}
        order={selectedExecutionOrder}
        activities={executionOrderActivities}
        itemUsage={executionOrderItemUsage}
        evidence={executionOrderEvidence}
        evidenceState={executionOrderEvidenceState}
        template={executionOrderTemplate}
        itemOptions={executionOrderItemOptions}
        custodyOptions={executionOrderCustodyOptions}
        missingRequirements={executionOrderMissingRequirements}
        isLoading={isLoadingExecutionOrder}
        isSubmitting={isSubmittingExecutionOrder}
        error={executionOrderError}
        successMessage={executionOrderSuccess}
        offline={offline}
        onClose={() => {
          setSelectedExecutionOrder(null);
          setExecutionOrderActivities([]);
          setExecutionOrderItemUsage([]);
          setExecutionOrderEvidence([]);
          setExecutionOrderEvidenceState('available');
          setExecutionOrderError(null);
          setExecutionOrderSuccess(null);
          setExecutionOrderTemplate(null);
          setExecutionOrderItemOptions([]);
          setExecutionOrderCustodyOptions([]);
          setExecutionOrderMissingRequirements([]);
          router.replace('/dashboard/operations');
        }}
        onStart={handleStartExecutionOrder}
        onRegisterActivity={handleRegisterExecutionOrderFieldWork}
        onRegisterItemUsage={handleRegisterExecutionOrderItemUsage}
        onUploadEvidence={handleUploadEvidence}
        onCloseOrder={handleCloseExecutionOrder}
      />
    </div>
  );
}
