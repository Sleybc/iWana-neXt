'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@iwana/ui';
import {
  ExecutionOrderResult,
  formatFullName,
  InventoryItemStatus,
  StockLocationStatus,
  type RegisterActivityCommand,
  TaskExecutionMode,
  TaskOriginContext,
  TaskStatus,
} from '@iwana/shared';
import type {
  ExecutionOrderRecord,
  CreateOperationalTaskDto,
  InternalUser,
  OperationalTaskAssignmentHistoryRecord,
  OperationalTaskRecord,
  OperationalTaskTimelineEvent,
  ExecutionOrderEvidenceRecord,
  RegisterExecutionOrderItemUsageDto,
  CloseExecutionOrderDto,
  ExecutionOrderDetailResponse,
  ExecutorCustodyResponse,
  SerializedAssetRecord,
  StockBalanceRecord,
} from '@/lib/api-client';
import type {
  ExecutionOrderActivity,
  ExecutionOrderItemUsage,
  ExecutionOrderEvidence,
  ExecutionOrderTemplateVersion,
} from '@iwana/shared';
import type { ListMeta } from '@iwana/shared';
import { ApiError, inventoryApi, tasksApi, usersApi } from '@/lib/api-client';
import { EMPTY_LIST_META, normalizeListMeta } from '@/lib/list-meta';
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
  | { data?: ExecutionOrderEvidenceRecord[] | null; meta?: Partial<ListMeta> | null }
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

type ExecutionOrderCollectionResponse<T> =
  | T[]
  | { data?: T[] | null; meta?: Partial<ListMeta> | null };

export interface CollectedExecutionOrderCollection<T> {
  data: T[];
  meta: ListMeta;
}

/**
 * Carga las páginas posteriores de una colección de OT sin convertirla en un
 * listado sin cota. Conserva el total del servidor y deja `hasMore` en true si
 * se alcanza el límite de seguridad antes de consumir todas las páginas.
 */
export async function collectExecutionOrderCollectionPages<T>(
  fetchPage: (page: number, limit: number) => Promise<ExecutionOrderCollectionResponse<T>>,
  options: { limit?: number; maxPages?: number } = {},
): Promise<CollectedExecutionOrderCollection<T>> {
  const limit = options.limit ?? 100;
  const maxPages = options.maxPages ?? 20;
  const data: T[] = [];
  let page = 1;
  let lastMeta = EMPTY_LIST_META;
  let serverHasMore = false;

  while (page <= maxPages) {
    const response = await fetchPage(page, limit);
    const pageData = Array.isArray(response) ? response : (response.data ?? []);
    const responseMeta = Array.isArray(response) ? undefined : response.meta;
    lastMeta = normalizeListMeta(responseMeta, { dataLength: pageData.length, limit });
    data.push(...pageData);
    serverHasMore = responseMeta
      ? (responseMeta.hasMore ??
        (responseMeta.nextCursor != null ||
          (responseMeta.total !== undefined && responseMeta.total > data.length)))
      : false;

    if (!serverHasMore) {
      break;
    }

    page += 1;
  }

  const reachedPageLimit = serverHasMore && page > maxPages;
  const total = Math.max(lastMeta.total, data.length);
  return {
    data,
    meta: {
      ...lastMeta,
      total,
      page: lastMeta.page ?? Math.min(page, maxPages),
      totalPages:
        lastMeta.limit > 0 ? Math.max(1, Math.ceil(total / lastMeta.limit)) : lastMeta.totalPages,
      hasMore: reachedPageLimit,
    },
  };
}

const USERS_PAGE_SIZE = 100;
const TASKS_PAGE_SIZE = 20;
/** Tamaño de página por defecto del contrato de custodia del ejecutor (§1). */
const EXECUTOR_CUSTODY_PAGE_SIZE = 25;
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
    if (typeof requirement.requirementId !== 'string') {
      return [];
    }
    const kind = typeof requirement.kind === 'string' ? requirement.kind : 'OTHER';
    const label = productRequirementLabel(
      typeof requirement.label === 'string' ? requirement.label : undefined,
      kind,
      requirement.requirementId,
    );
    return [
      {
        requirementId: requirement.requirementId,
        label,
        kind,
        reason: productRequirementReason(
          typeof requirement.reason === 'string' ? requirement.reason : undefined,
          kind,
          label,
        ),
      },
    ];
  });
}

const REQUIREMENT_KIND_LABELS: Record<string, string> = {
  FIELD: 'Información requerida',
  ACTIVITY: 'Actividad pendiente',
  MEASUREMENT: 'Medición pendiente',
  EVIDENCE: 'Evidencia pendiente',
  MATERIAL: 'Material pendiente',
  COMPLIANCE: 'Aceptación del cliente pendiente',
  OTHER: 'Requisito pendiente',
};

function containsRawRequirementToken(value: string): boolean {
  return (
    /^[A-Z0-9_:-]+$/u.test(value) ||
    /\b(?:FIELD|ACTIVITY|MEASUREMENT|EVIDENCE|MATERIAL|COMPLIANCE|PHOTO|DOCUMENT|SIGNATURE)\b/u.test(
      value,
    )
  );
}

export function productRequirementLabel(
  label: string | undefined,
  kind: string,
  requirementId: string,
): string {
  if (label?.trim()) {
    return label.trim();
  }

  const normalizedId = requirementId.toLowerCase();
  if (/(?:photo|foto|evidence|evidencia)/u.test(normalizedId)) return 'Evidencia requerida';
  if (/(?:signature|firma|acceptance|aceptación)/u.test(normalizedId)) {
    return 'Aceptación del cliente';
  }
  if (/(?:serial|ont|material|item|equipment|equipo)/u.test(normalizedId)) {
    return 'Material o equipo requerido';
  }
  if (/(?:measurement|medición|speed|prueba)/u.test(normalizedId)) return 'Medición requerida';
  if (/(?:activity|actividad|install|installation)/u.test(normalizedId)) {
    return 'Actividad requerida';
  }
  return REQUIREMENT_KIND_LABELS[kind] ?? 'Requisito pendiente';
}

function productRequirementReason(reason: string | undefined, kind: string, label: string): string {
  if (reason?.trim() && !containsRawRequirementToken(reason) && !/categoría\s+"/iu.test(reason)) {
    return reason.trim();
  }

  switch (kind) {
    case 'EVIDENCE':
      return `Adjunta ${label.toLowerCase()} antes de cerrar la orden.`;
    case 'MATERIAL':
      return 'Registra el material o equipo requerido antes de cerrar la orden.';
    case 'COMPLIANCE':
      return 'Registra la aceptación del cliente antes de cerrar la orden.';
    case 'ACTIVITY':
      return 'Registra la actividad requerida antes de cerrar la orden.';
    case 'MEASUREMENT':
      return 'Registra la medición requerida antes de cerrar la orden.';
    case 'FIELD':
      return 'Completa la información requerida antes de cerrar la orden.';
    default:
      return 'Completa el requisito pendiente antes de cerrar la orden.';
  }
}

export function normalizeExecutionOrderCollection<T>(
  value: T[] | { data?: T[] | null; meta?: unknown } | null | undefined,
): T[] {
  return Array.isArray(value) ? value : (value?.data ?? []);
}

export async function loadMoreExecutionOrderCollection<T>(
  fetchPage: (page: number, limit: number) => Promise<ExecutionOrderCollectionResponse<T>>,
  currentMeta: ListMeta,
  currentLength: number,
): Promise<CollectedExecutionOrderCollection<T>> {
  const response = await fetchPage((currentMeta.page ?? 1) + 1, currentMeta.limit);
  const pageData = normalizeExecutionOrderCollection(response);
  const responseMeta = Array.isArray(response) ? undefined : response.meta;
  const nextMeta = normalizeListMeta(responseMeta, {
    dataLength: pageData.length,
    limit: currentMeta.limit,
  });

  return {
    data: pageData,
    meta: {
      ...nextMeta,
      total: Math.max(nextMeta.total, currentMeta.total, currentLength + pageData.length),
    },
  };
}

/**
 * Deriva la plantilla aplicada desde el snapshot congelado que viaja en el
 * detalle de la OT (DATA-P1-3). Devuelve null cuando la OT no tiene plantilla
 * vinculada o cuando el snapshot no está disponible; en ambos casos el cierre
 * queda bloqueado en coherencia con el gate de cierre del backend.
 */
export function deriveTemplateFromDetail(
  detail: ExecutionOrderDetailResponse | null,
): ExecutionOrderTemplateVersion | null {
  const reference = detail?.template;
  if (!detail || !reference?.requirements) {
    return null;
  }
  return {
    id: reference.id,
    templateId: reference.id,
    key: reference.key,
    version: reference.version,
    label: reference.label,
    workType: detail.workType,
    status: 'PUBLISHED',
    requirements: reference.requirements,
    reasonCatalogs: [],
  };
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
  const fullName = formatFullName(user.firstName, user.lastName).trim();
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
  const [selectedExecutionOrder, setSelectedExecutionOrder] =
    useState<ExecutionOrderDetailResponse | null>(null);
  const [executionOrderActivities, setExecutionOrderActivities] = useState<
    ExecutionOrderActivity[]
  >([]);
  const [executionOrderActivitiesMeta, setExecutionOrderActivitiesMeta] =
    useState<ListMeta>(EMPTY_LIST_META);
  const [executionOrderItemUsage, setExecutionOrderItemUsage] = useState<ExecutionOrderItemUsage[]>(
    [],
  );
  const [executionOrderItemUsageMeta, setExecutionOrderItemUsageMeta] =
    useState<ListMeta>(EMPTY_LIST_META);
  const [executionOrderEvidence, setExecutionOrderEvidence] = useState<ExecutionOrderEvidence[]>(
    [],
  );
  const [executionOrderEvidenceMeta, setExecutionOrderEvidenceMeta] =
    useState<ListMeta>(EMPTY_LIST_META);
  const [executionOrderEvidenceState, setExecutionOrderEvidenceState] = useState<
    'loading' | 'available' | 'unavailable'
  >('available');
  const [executionOrderInventoryState, setExecutionOrderInventoryState] = useState<
    'loading' | 'available' | 'unavailable'
  >('loading');
  // Custodia del ejecutor: misma gramática de estados que el inventario del
  // formulario; alimenta la sub-sección de solo lectura del bloque 4.
  const [executorCustodyState, setExecutorCustodyState] = useState<
    'loading' | 'available' | 'unavailable'
  >('loading');
  const [executorCustodyName, setExecutorCustodyName] = useState<string | null>(null);
  const [executorCustodyAssets, setExecutorCustodyAssets] = useState<SerializedAssetRecord[]>([]);
  const [executorCustodyAssetsMeta, setExecutorCustodyAssetsMeta] =
    useState<ListMeta>(EMPTY_LIST_META);
  const [executorCustodyBalances, setExecutorCustodyBalances] = useState<StockBalanceRecord[]>([]);
  const [executorCustodyBalancesMeta, setExecutorCustodyBalancesMeta] =
    useState<ListMeta>(EMPTY_LIST_META);
  const [isLoadingMoreExecutionOrderActivities, setIsLoadingMoreExecutionOrderActivities] =
    useState(false);
  const [isLoadingMoreExecutionOrderItemUsage, setIsLoadingMoreExecutionOrderItemUsage] =
    useState(false);
  const [isLoadingMoreExecutionOrderEvidence, setIsLoadingMoreExecutionOrderEvidence] =
    useState(false);
  const [isLoadingMoreExecutorCustody, setIsLoadingMoreExecutorCustody] = useState(false);
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
  // Contador secuencial: descarta respuestas tardías de aperturas/refresh previos
  // para que no reabran el drawer ni pisen el estado de la OT vigente.
  const executionOrderRequestSeqRef = useRef(0);

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

  const executionOrderTemplate = useMemo(
    () => deriveTemplateFromDetail(selectedExecutionOrder),
    [selectedExecutionOrder],
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
    const requestSeq = executionOrderRequestSeqRef.current + 1;
    executionOrderRequestSeqRef.current = requestSeq;
    setIsLoadingMoreExecutionOrderActivities(false);
    setIsLoadingMoreExecutionOrderItemUsage(false);
    setIsLoadingMoreExecutionOrderEvidence(false);
    setIsLoadingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    setExecutionOrderEvidenceState('loading');
    setExecutionOrderInventoryState('loading');
    setExecutorCustodyState('loading');

    // El detalle es la única llamada crítica; actividades, consumos, evidencias
    // e inventario son concerns independientes y se cargan en paralelo para que
    // el fallo de uno no degrade ni retrase a los demás. La custodia del
    // ejecutor depende del detalle (order.assignee.id) pero viaja en el mismo
    // allSettled reutilizando su promesa, así el guard secuencial la cubre igual.
    const detailPromise = tasksApi.executionOrders.get(executionOrderId);
    const executorCustodyPromise = detailPromise.then((detail) => {
      const assigneeId = detail.assignee?.id;
      if (!assigneeId) {
        return null;
      }
      return inventoryApi.getExecutorCustody(assigneeId, {
        page: 1,
        limit: EXECUTOR_CUSTODY_PAGE_SIZE,
      });
    });
    const [
      orderResult,
      activitiesResult,
      itemUsageResult,
      evidenceResult,
      inventoryResult,
      custodyResult,
    ] = await Promise.allSettled([
      detailPromise,
      collectExecutionOrderCollectionPages((page, limit) =>
        tasksApi.executionOrders.listActivities(executionOrderId, { page, limit }),
      ),
      collectExecutionOrderCollectionPages((page, limit) =>
        tasksApi.executionOrders.listItemUsage(executionOrderId, { page, limit }),
      ),
      collectExecutionOrderCollectionPages((page, limit) =>
        tasksApi.executionOrders.listEvidence(executionOrderId, { page, limit }),
      ),
      Promise.all([
        inventoryApi.listItems({ status: InventoryItemStatus.ACTIVE, limit: 100 }),
        inventoryApi.listLocations({
          custody: 'mobile',
          status: StockLocationStatus.ACTIVE,
          withStock: true,
          limit: 100,
        }),
      ]),
      executorCustodyPromise,
    ]);

    // Respuesta tardía de una apertura/refresh anterior: descartar completa.
    if (executionOrderRequestSeqRef.current !== requestSeq) {
      return;
    }

    if (orderResult.status === 'rejected') {
      setExecutionOrderError(mapOperationsError(orderResult.reason));
      setExecutionOrderEvidenceState('unavailable');
      setExecutionOrderInventoryState('unavailable');
      setExecutorCustodyState('unavailable');
      setIsLoadingExecutionOrder(false);
      return;
    }

    const detail = orderResult.value;
    setSelectedExecutionOrder(detail);

    if (activitiesResult.status === 'fulfilled') {
      setExecutionOrderActivities(activitiesResult.value.data);
      setExecutionOrderActivitiesMeta(activitiesResult.value.meta);
    } else {
      setExecutionOrderActivities([]);
      setExecutionOrderActivitiesMeta(EMPTY_LIST_META);
    }

    if (itemUsageResult.status === 'fulfilled') {
      setExecutionOrderItemUsage(itemUsageResult.value.data);
      setExecutionOrderItemUsageMeta(itemUsageResult.value.meta);
    } else {
      setExecutionOrderItemUsage([]);
      setExecutionOrderItemUsageMeta(EMPTY_LIST_META);
    }

    if (evidenceResult.status === 'fulfilled') {
      setExecutionOrderEvidence(evidenceResult.value.data);
      setExecutionOrderEvidenceMeta(evidenceResult.value.meta);
      setExecutionOrderEvidenceState('available');
    } else {
      setExecutionOrderEvidence([]);
      setExecutionOrderEvidenceMeta(EMPTY_LIST_META);
      setExecutionOrderEvidenceState('unavailable');
    }

    if (inventoryResult.status === 'fulfilled') {
      const [items, locations] = inventoryResult.value;
      setExecutionOrderItemOptions(
        items.data.map((item) => ({ value: item.id, label: `${item.sku} · ${item.name}` })),
      );
      // El backend exige que technicianCustodyId sea el ID del técnico/cuadrilla
      // asignados (assertCustodyAssignment), no el ID de la ubicación; la
      // ubicación móvil aporta el responsable (responsibleRefId).
      setExecutionOrderCustodyOptions(
        locations.data.flatMap((location) =>
          location.responsibleRefId
            ? [
                {
                  type: location.type === 'MOBILE_CREW' ? 'CREW' : 'TECHNICIAN',
                  id: location.responsibleRefId,
                  label: location.name,
                },
              ]
            : [],
        ),
      );
      setExecutionOrderInventoryState('available');
    } else {
      setExecutionOrderItemOptions([]);
      setExecutionOrderCustodyOptions([]);
      setExecutionOrderInventoryState('unavailable');
    }

    // Custodia del ejecutor: disponible, vacía informativa (sin assignee o sin
    // custodia activa) o no disponible con fallback silencioso; un fallo aquí
    // nunca degrada el resto del drawer.
    if (custodyResult.status === 'fulfilled' && custodyResult.value) {
      const custody: ExecutorCustodyResponse = custodyResult.value;
      setExecutorCustodyName(custody.location?.name ?? null);
      setExecutorCustodyAssets(custody.assets.items);
      setExecutorCustodyAssetsMeta(custody.assets.meta);
      setExecutorCustodyBalances(custody.balances.items);
      setExecutorCustodyBalancesMeta(custody.balances.meta);
      setExecutorCustodyState('available');
    } else if (custodyResult.status === 'fulfilled') {
      setExecutorCustodyName(null);
      setExecutorCustodyAssets([]);
      setExecutorCustodyAssetsMeta(EMPTY_LIST_META);
      setExecutorCustodyBalances([]);
      setExecutorCustodyBalancesMeta(EMPTY_LIST_META);
      setExecutorCustodyState('available');
    } else {
      setExecutorCustodyName(null);
      setExecutorCustodyAssets([]);
      setExecutorCustodyAssetsMeta(EMPTY_LIST_META);
      setExecutorCustodyBalances([]);
      setExecutorCustodyBalancesMeta(EMPTY_LIST_META);
      setExecutorCustodyState('unavailable');
    }

    // La plantilla aplicada se deriva del snapshot congelado que viaja en el
    // detalle (DATA-P1-3); no se consulta el catálogo vivo de plantillas.
    setExecutionOrderMissingRequirements([]);
    setIsLoadingExecutionOrder(false);
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

  const loadMoreExecutionOrderActivities = useCallback(async () => {
    const executionOrderId = selectedExecutionOrder?.id;
    if (
      !executionOrderId ||
      !executionOrderActivitiesMeta.hasMore ||
      isLoadingMoreExecutionOrderActivities
    ) {
      return;
    }

    setIsLoadingMoreExecutionOrderActivities(true);
    try {
      const nextPage = await loadMoreExecutionOrderCollection(
        (page, limit) => tasksApi.executionOrders.listActivities(executionOrderId, { page, limit }),
        executionOrderActivitiesMeta,
        executionOrderActivities.length,
      );
      setExecutionOrderActivities((current) => [...current, ...nextPage.data]);
      setExecutionOrderActivitiesMeta(nextPage.meta);
    } catch (loadError) {
      setExecutionOrderError(mapOperationsError(loadError));
    } finally {
      setIsLoadingMoreExecutionOrderActivities(false);
    }
  }, [
    executionOrderActivities,
    executionOrderActivitiesMeta,
    isLoadingMoreExecutionOrderActivities,
    selectedExecutionOrder?.id,
  ]);

  const loadMoreExecutionOrderItemUsage = useCallback(async () => {
    const executionOrderId = selectedExecutionOrder?.id;
    if (
      !executionOrderId ||
      !executionOrderItemUsageMeta.hasMore ||
      isLoadingMoreExecutionOrderItemUsage
    ) {
      return;
    }

    setIsLoadingMoreExecutionOrderItemUsage(true);
    try {
      const nextPage = await loadMoreExecutionOrderCollection(
        (page, limit) => tasksApi.executionOrders.listItemUsage(executionOrderId, { page, limit }),
        executionOrderItemUsageMeta,
        executionOrderItemUsage.length,
      );
      setExecutionOrderItemUsage((current) => [...current, ...nextPage.data]);
      setExecutionOrderItemUsageMeta(nextPage.meta);
    } catch (loadError) {
      setExecutionOrderError(mapOperationsError(loadError));
    } finally {
      setIsLoadingMoreExecutionOrderItemUsage(false);
    }
  }, [
    executionOrderItemUsage,
    executionOrderItemUsageMeta,
    isLoadingMoreExecutionOrderItemUsage,
    selectedExecutionOrder?.id,
  ]);

  const loadMoreExecutionOrderEvidence = useCallback(async () => {
    const executionOrderId = selectedExecutionOrder?.id;
    if (
      !executionOrderId ||
      !executionOrderEvidenceMeta.hasMore ||
      isLoadingMoreExecutionOrderEvidence
    ) {
      return;
    }

    setIsLoadingMoreExecutionOrderEvidence(true);
    try {
      const nextPage = await loadMoreExecutionOrderCollection(
        (page, limit) => tasksApi.executionOrders.listEvidence(executionOrderId, { page, limit }),
        executionOrderEvidenceMeta,
        executionOrderEvidence.length,
      );
      setExecutionOrderEvidence((current) => [...current, ...nextPage.data]);
      setExecutionOrderEvidenceMeta(nextPage.meta);
    } catch (loadError) {
      setExecutionOrderError(mapOperationsError(loadError));
    } finally {
      setIsLoadingMoreExecutionOrderEvidence(false);
    }
  }, [
    executionOrderEvidence,
    executionOrderEvidenceMeta,
    isLoadingMoreExecutionOrderEvidence,
    selectedExecutionOrder?.id,
  ]);

  const retryExecutionOrder = useCallback(async () => {
    const executionOrderId = selectedExecutionOrder?.id;
    if (executionOrderId) {
      await openExecutionOrder(executionOrderId);
    }
  }, [selectedExecutionOrder?.id, openExecutionOrder]);

  // Paginación compartida del contrato de custodia: page/limit aplican a ambas
  // colecciones, así que un solo onLoadMore avanza equipos y materiales.
  const loadMoreExecutorCustody = useCallback(async () => {
    const assigneeId = selectedExecutionOrder?.assignee?.id;
    if (
      !assigneeId ||
      isLoadingMoreExecutorCustody ||
      (!executorCustodyAssetsMeta.hasMore && !executorCustodyBalancesMeta.hasMore)
    ) {
      return;
    }

    setIsLoadingMoreExecutorCustody(true);
    try {
      const currentPage = executorCustodyAssetsMeta.page ?? executorCustodyBalancesMeta.page ?? 1;
      const nextPage = await inventoryApi.getExecutorCustody(assigneeId, {
        page: currentPage + 1,
        limit: executorCustodyAssetsMeta.limit || EXECUTOR_CUSTODY_PAGE_SIZE,
      });
      setExecutorCustodyAssets((current) => [...current, ...nextPage.assets.items]);
      setExecutorCustodyAssetsMeta(nextPage.assets.meta);
      setExecutorCustodyBalances((current) => [...current, ...nextPage.balances.items]);
      setExecutorCustodyBalancesMeta(nextPage.balances.meta);
    } catch (loadError) {
      setExecutionOrderError(mapOperationsError(loadError));
    } finally {
      setIsLoadingMoreExecutorCustody(false);
    }
  }, [
    executorCustodyAssetsMeta,
    executorCustodyBalancesMeta,
    isLoadingMoreExecutorCustody,
    selectedExecutionOrder?.assignee?.id,
  ]);

  async function handleStartExecutionOrder(note?: string | null) {
    if (!selectedExecutionOrder) return;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      await tasksApi.executionOrders.start(
        selectedExecutionOrder.id,
        { note: note ?? null },
        selectedExecutionOrder.version,
      );
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('La ejecución fue iniciada.');
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleRegisterExecutionOrderFieldWork(payload: RegisterActivityCommand) {
    if (!selectedExecutionOrder) return false;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      await tasksApi.executionOrders.registerFieldWork(
        selectedExecutionOrder.id,
        payload,
        selectedExecutionOrder.version,
      );
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('El trabajo realizado fue registrado.');
      return true;
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
      return false;
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleUpdateExecutionOrderFieldWork(
    activityId: string,
    payload: Partial<RegisterActivityCommand>,
  ) {
    if (!selectedExecutionOrder) return false;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      await tasksApi.executionOrders.updateFieldWork(
        selectedExecutionOrder.id,
        activityId,
        payload,
        selectedExecutionOrder.version,
      );
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('El trabajo realizado fue actualizado.');
      return true;
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
      return false;
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleDeleteExecutionOrderFieldWork(activityId: string) {
    if (!selectedExecutionOrder) return false;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      await tasksApi.executionOrders.deleteFieldWork(
        selectedExecutionOrder.id,
        activityId,
        selectedExecutionOrder.version,
      );
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('El trabajo realizado fue eliminado.');
      return true;
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
      return false;
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleRegisterExecutionOrderItemUsage(
    payload: RegisterExecutionOrderItemUsageDto,
  ) {
    if (!selectedExecutionOrder) return false;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      await tasksApi.executionOrders.registerItemUsage(
        selectedExecutionOrder.id,
        payload,
        selectedExecutionOrder.version,
      );
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('El material fue registrado.');
      return true;
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
      return false;
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleUploadEvidence(file: File, requirementKey: string) {
    if (!selectedExecutionOrder) return false;
    if (!requirementKey.trim()) {
      setExecutionOrderError(
        'No hay un requisito de evidencia válido para asociar el archivo. Actualiza el detalle antes de intentarlo.',
      );
      return false;
    }
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      const uploadReceipt = await tasksApi.executionOrders.uploadEvidenceAsset(
        selectedExecutionOrder.id,
        file,
        selectedExecutionOrder.version,
      );
      if (!isValidFutureEvidenceExpiry(uploadReceipt.expiresAt)) {
        throw new Error('La evidencia subida no tiene una fecha de expiración válida.');
      }
      await tasksApi.executionOrders.registerEvidence(
        selectedExecutionOrder.id,
        {
          mediaAssetId: uploadReceipt.mediaAssetId,
          evidenceType: file.type.startsWith('image/') ? 'PHOTO' : 'DOCUMENT',
          requirementKey,
          expiresAt: uploadReceipt.expiresAt,
        },
        selectedExecutionOrder.version,
      );
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('La evidencia fue registrada.');
      return true;
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
      return false;
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
      await tasksApi.executionOrders.close(
        selectedExecutionOrder.id,
        payload,
        selectedExecutionOrder.version,
      );
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
        open={
          Boolean(selectedExecutionOrder) || isLoadingExecutionOrder || Boolean(executionOrderError)
        }
        order={selectedExecutionOrder}
        activities={executionOrderActivities}
        activitiesMeta={executionOrderActivitiesMeta}
        itemUsage={executionOrderItemUsage}
        itemUsageMeta={executionOrderItemUsageMeta}
        evidence={executionOrderEvidence}
        evidenceMeta={executionOrderEvidenceMeta}
        isLoadingMoreActivities={isLoadingMoreExecutionOrderActivities}
        isLoadingMoreItemUsage={isLoadingMoreExecutionOrderItemUsage}
        isLoadingMoreEvidence={isLoadingMoreExecutionOrderEvidence}
        onLoadMoreActivities={loadMoreExecutionOrderActivities}
        onLoadMoreItemUsage={loadMoreExecutionOrderItemUsage}
        onLoadMoreEvidence={loadMoreExecutionOrderEvidence}
        evidenceState={executionOrderEvidenceState}
        itemsState={executionOrderInventoryState}
        executorCustodyState={executorCustodyState}
        executorCustodyName={executorCustodyName}
        executorCustodyAssets={executorCustodyAssets}
        executorCustodyAssetsMeta={executorCustodyAssetsMeta}
        executorCustodyBalances={executorCustodyBalances}
        executorCustodyBalancesMeta={executorCustodyBalancesMeta}
        isLoadingMoreExecutorCustody={isLoadingMoreExecutorCustody}
        onLoadMoreExecutorCustody={loadMoreExecutorCustody}
        template={executionOrderTemplate}
        itemOptions={executionOrderItemOptions}
        custodyOptions={executionOrderCustodyOptions}
        missingRequirements={executionOrderMissingRequirements}
        isLoading={isLoadingExecutionOrder}
        isSubmitting={isSubmittingExecutionOrder}
        error={executionOrderError}
        successMessage={executionOrderSuccess}
        offline={offline}
        onRefreshDetail={retryExecutionOrder}
        onClose={() => {
          // Invalida cualquier apertura/refresh en vuelo para que una respuesta
          // tardía no reabra el drawer con estado stale.
          executionOrderRequestSeqRef.current += 1;
          setSelectedExecutionOrder(null);
          setExecutionOrderActivities([]);
          setExecutionOrderActivitiesMeta(EMPTY_LIST_META);
          setExecutionOrderItemUsage([]);
          setExecutionOrderItemUsageMeta(EMPTY_LIST_META);
          setExecutionOrderEvidence([]);
          setExecutionOrderEvidenceMeta(EMPTY_LIST_META);
          setIsLoadingMoreExecutionOrderActivities(false);
          setIsLoadingMoreExecutionOrderItemUsage(false);
          setIsLoadingMoreExecutionOrderEvidence(false);
          setIsLoadingMoreExecutorCustody(false);
          setExecutionOrderEvidenceState('available');
          setExecutionOrderInventoryState('loading');
          setExecutorCustodyState('loading');
          setExecutorCustodyName(null);
          setExecutorCustodyAssets([]);
          setExecutorCustodyAssetsMeta(EMPTY_LIST_META);
          setExecutorCustodyBalances([]);
          setExecutorCustodyBalancesMeta(EMPTY_LIST_META);
          setExecutionOrderError(null);
          setExecutionOrderSuccess(null);
          setExecutionOrderItemOptions([]);
          setExecutionOrderCustodyOptions([]);
          setExecutionOrderMissingRequirements([]);
          router.replace('/dashboard/operations');
        }}
        onStart={handleStartExecutionOrder}
        onRegisterActivity={handleRegisterExecutionOrderFieldWork}
        onUpdateActivity={handleUpdateExecutionOrderFieldWork}
        onDeleteActivity={handleDeleteExecutionOrderFieldWork}
        onRegisterItemUsage={handleRegisterExecutionOrderItemUsage}
        onUploadEvidence={handleUploadEvidence}
        onCloseOrder={handleCloseExecutionOrder}
      />
    </div>
  );
}
