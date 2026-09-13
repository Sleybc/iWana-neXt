// apps/portal/src/components/operations/TasksInboxClient.tsx
// Bandeja de tareas de /dashboard/operations/tasks. Extracción F2 (split de
// OperationsClient.tsx); integración F5: lee `meta` del envelope (contrato
// operational-tasks.ts v1), el pie se elige por
// `meta.capabilities.randomAccess` (ADR-065 — un solo pie), y página, tamaño,
// filtros y detalle viven en la URL vía `tasks-query.ts` (ADR-065 §9:
// página → push, filtro/tamaño → replace + página 1).
//
// Fin del crawl (spec §4.8): el directorio de usuarios desaparece; el
// responsable se muestra con `responsibleLabel` proyectado por el backend
// (F1) y el filtro usa el typeahead `GET /users/search` con degradación 403
// visible (D-P1, Salida 2).
//
// Estados vacíos E1–E3 con acción (UX spec §6.1). Deep link `?taskId=`
// (spec §4.6) con cierre no destructivo (CA-06). `TaskDetailDrawer.tsx` no
// cambia: sigue controlado por props.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@iwana/ui';
import { AccessPermissionKey, TaskStatus, TaskType } from '@iwana/shared';
import type {
  OperationalTaskAssignmentHistoryRecord,
  OperationalTaskRecord,
  OperationalTaskTimelineEvent,
} from '@/lib/api-client';
import { tasksApi } from '@/lib/api-client';
import type { ListMeta } from '@iwana/shared';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSectionHeader,
} from '@/components/shared/portal-ui';
import { usePermissions } from '@/components/access-control/permissions-context';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { mergeUrlSearchParams, withSearchParams } from '@/lib/merge-url-search-params';
import { TaskDetailDrawer } from './TaskDetailDrawer';
import { TasksTable } from './TasksTable';
import { TasksToolbar } from './TasksToolbar';
import { mapOperationsError } from './execution-order-requirements';
import {
  parseTasksInboxQuery,
  serializeTasksInboxQuery,
  type TasksInboxQuery,
  type TasksInboxQueryPatch,
} from './tasks-query';

const TASKS_PATH = '/dashboard/operations/tasks';

export function TasksInboxClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status: permissionsStatus, hasPermission } = usePermissions();
  const canManageTasks =
    permissionsStatus === 'ready' && hasPermission(AccessPermissionKey.OPERATIONS_TASKS_MANAGE);

  // ── Estado de bandeja en la URL (ADR-065 §9) ─────────────────────────────
  // La query se deriva del STRING de la URL (no de la identidad del objeto
  // `useSearchParams()`), de modo que un re-render sin navegación no
  // reinicia la carga.
  const searchString = searchParams.toString();
  const query = useMemo(
    () => parseTasksInboxQuery(new URLSearchParams(searchString)),
    [searchString],
  );

  const [tasks, setTasks] = useState<OperationalTaskRecord[]>([]);
  const [tasksMeta, setTasksMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<OperationalTaskRecord | null>(null);
  const [timeline, setTimeline] = useState<OperationalTaskTimelineEvent[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<
    OperationalTaskAssignmentHistoryRecord[]
  >([]);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  // Deep link `?taskId=` inexistente o sin acceso (UX spec §6.3, estado E7):
  // redacción genérica que no confirma la existencia del recurso.
  const [detailLinkError, setDetailLinkError] = useState<string | null>(null);
  const detailRequestRef = useRef(0);
  const listRequestRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const metaRef = useRef<ListMeta>(EMPTY_LIST_META);
  // PROD-UX #7 (OLA 4.1): al cerrar por deep link no hay disparador de fila
  // al que devolver el foco; el contenedor lo lleva al encabezado de la región
  // de resultados. La apertura por fila conserva el retorno al disparador.
  const resultsHeaderRef = useRef<HTMLDivElement | null>(null);
  const openedFromRowRef = useRef(false);

  const taskIdParam = searchParams.get('taskId');

  const loadTasks = useCallback(
    async (options?: { append?: boolean }) => {
      const append = options?.append === true;
      const currentPage = metaRef.current.page ?? 1;
      const nextPage = append ? currentPage + 1 : (query.page ?? 1);
      const limit = metaRef.current.limit || query.limit || PORTAL_DEFAULT_PAGE_SIZE;
      const requestId = ++listRequestRef.current;

      if (append) {
        setIsLoadingMore(true);
      } else if (hasLoadedRef.current) {
        setIsRefreshing(true);
      }

      setError(null);
      try {
        const response = await tasksApi.list({
          ...(query.status ? { status: query.status } : {}),
          ...(query.type ? { type: query.type } : {}),
          ...(query.responsibleRefId ? { responsibleRefId: query.responsibleRefId } : {}),
          ...(query.ticketId ? { ticketId: query.ticketId } : {}),
          page: nextPage,
          limit,
        });
        if (requestId !== listRequestRef.current) {
          return;
        }
        const meta = normalizeListMeta(response.meta, {
          dataLength: response.data.length,
          limit,
        });
        metaRef.current = meta;
        setTasksMeta(meta);
        setTasks((prev) => (append ? [...prev, ...response.data] : response.data));
        hasLoadedRef.current = true;
      } catch (loadError) {
        if (requestId !== listRequestRef.current) {
          return;
        }
        setError(mapOperationsError(loadError));
        // Contrato de componente v1.1 §6.7: la tabla conserva el último dato
        // válido. Solo se limpia la grilla cuando nunca hubo una carga exitosa:
        // sin filas previas el error sustituye a la composición vacía.
        if (!append && !hasLoadedRef.current) {
          metaRef.current = EMPTY_LIST_META;
          setTasksMeta(EMPTY_LIST_META);
          setTasks([]);
        }
      } finally {
        if (requestId === listRequestRef.current) {
          setIsLoadingMore(false);
          setIsRefreshing(false);
          setIsLoading(false);
        }
      }
    },
    [query],
  );

  // Carga (y recarga) al cambiar el estado de la URL. El append del modo
  // «Cargar más» es explícito: no participa de este efecto.
  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  /** Escribe la bandeja en la URL (el detalle `taskId` viaja en la query). */
  const updateQuery = useCallback(
    (patch: TasksInboxQueryPatch, history: 'push' | 'replace') => {
      const serialized = serializeTasksInboxQuery({ ...query, ...patch });
      const href = withSearchParams(TASKS_PATH, serialized);
      if (history === 'push') {
        router.push(href, { scroll: false });
      } else {
        router.replace(href, { scroll: false });
      }
    },
    [query, router],
  );

  // ADR-065 §9: página → push (Atrás vuelve); filtro/tamaño → replace + página 1.
  const handleFilterChange = useCallback(
    (
      patch: Partial<{
        status: TaskStatus | '';
        type: TaskType | '';
        responsibleRefId: string;
        ticketId: string;
      }>,
    ) => {
      updateQuery(
        {
          ...(patch.status !== undefined ? { status: patch.status || undefined } : {}),
          ...(patch.type !== undefined ? { type: patch.type || undefined } : {}),
          ...(patch.responsibleRefId !== undefined
            ? { responsibleRefId: patch.responsibleRefId || undefined }
            : {}),
          ...(patch.ticketId !== undefined ? { ticketId: patch.ticketId || undefined } : {}),
          page: undefined,
        },
        'replace',
      );
    },
    [updateQuery],
  );
  const handlePageChange = useCallback(
    (page: number) => {
      updateQuery({ page }, 'push');
    },
    [updateQuery],
  );
  const handlePageSizeChange = useCallback(
    (size: number) => {
      updateQuery({ limit: size, page: undefined }, 'replace');
    },
    [updateQuery],
  );
  const handleClearFilters = useCallback(() => {
    updateQuery(
      {
        status: undefined,
        type: undefined,
        responsibleRefId: undefined,
        ticketId: undefined,
        page: undefined,
      },
      'replace',
    );
  }, [updateQuery]);

  // Receta del contrato §5: el modo lo calcula el contenedor desde `meta`.
  const randomAccess = tasksMeta.capabilities.randomAccess === true;
  const pageCount = tasksMeta.totalPages ?? (tasksMeta.total > 0 ? 1 : 0);
  const effectivePage = tasksMeta.page ?? query.page ?? 1;
  const pageSize = tasksMeta.limit || query.limit || PORTAL_DEFAULT_PAGE_SIZE;
  const { from, to } = listPageWindow({
    page: effectivePage,
    limit: pageSize,
    total: tasksMeta.total,
  });

  const pagination = randomAccess
    ? {
        randomAccess: true as const,
        page: effectivePage,
        pageCount,
        pageSize,
        onPageChange: handlePageChange,
        onPageSizeChange: handlePageSizeChange,
      }
    : {
        randomAccess: false as const,
        hasMore: tasksMeta.hasMore,
        onLoadMore: () => void loadTasks({ append: true }),
      };

  const hasActiveFilters = Boolean(
    query.status || query.type || query.responsibleRefId || query.ticketId,
  );

  // M3.1 (UX spec §5.4): el alta desde la bandeja lleva su estado vigente como
  // `returnTo` para restaurarlo al volver —con el detalle abierto en éxito y
  // sin detalle al cancelar—.
  const createTaskHref = searchString
    ? withSearchParams(
        `${TASKS_PATH}/new`,
        mergeUrlSearchParams('', { returnTo: withSearchParams(TASKS_PATH, searchString) }),
      )
    : `${TASKS_PATH}/new`;

  const responsibleLabel = query.responsibleRefId
    ? (tasks.find((task) => task.responsibleRefId === query.responsibleRefId)?.responsibleLabel ??
      null)
    : null;

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

  // Deep link `?taskId=` (spec §4.6): resuelve el registro por id — la fila
  // puede no estar en la página actual de la bandeja. Si el detalle ya está
  // abierto para esa tarea (apertura por fila, que también escribe la URL),
  // no se refetcha: la resolución por URL es el único camino, no un duplicado.
  useEffect(() => {
    if (!taskIdParam) {
      // PROD-UX #4 (OLA 4.1): al desaparecer el parámetro (p. ej. tras
      // «Ver todas las tareas») la alerta E7 deja de aplicar y no debe quedar
      // visible en la bandeja.
      setDetailLinkError(null);
      return;
    }
    if (selectedTask?.id === taskIdParam) {
      return;
    }
    let cancelled = false;
    setDetailLinkError(null);
    setIsLoadingDetail(true);
    tasksApi
      .get(taskIdParam)
      .then((task) => {
        if (cancelled) {
          return;
        }
        void openTaskDetail(task);
      })
      .catch((detailError: unknown) => {
        if (cancelled) {
          return;
        }
        setIsLoadingDetail(false);
        setDetailLinkError(mapOperationsError(detailError));
      });
    return () => {
      cancelled = true;
    };
  }, [taskIdParam, openTaskDetail, selectedTask?.id]);

  /** Apertura por fila: estado local inmediato + parámetro en la URL (spec §4.6). */
  const handleOpenRow = useCallback(
    (task: OperationalTaskRecord) => {
      openedFromRowRef.current = true;
      void openTaskDetail(task);
      const nextSearch = mergeUrlSearchParams(searchParams, { taskId: task.id });
      router.push(withSearchParams(TASKS_PATH, nextSearch), { scroll: false });
    },
    [openTaskDetail, router, searchParams],
  );

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

  function closeTaskDetail() {
    const openedFromRow = openedFromRowRef.current;
    openedFromRowRef.current = false;
    detailRequestRef.current += 1;
    setSelectedTask(null);
    setTimeline([]);
    setAssignmentHistory([]);
    setIsLoadingDetail(false);
    // Cierre no destructivo (spec §4.6; CA-06): retira solo `taskId` y
    // preserva filtros, página y orden.
    router.replace(
      withSearchParams(TASKS_PATH, mergeUrlSearchParams(searchParams, { taskId: null })),
    );
    if (!openedFromRow) {
      // Deep link sin disparador de fila: el foco aterriza en el encabezado de
      // la región de resultados (UX spec §8.2.2/§11.3).
      window.requestAnimationFrame(() => {
        resultsHeaderRef.current?.focus();
      });
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <PortalAlert
          variant="error"
          title="No pudimos cargar la información"
          description={error}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadTasks()}>
              Reintentar
            </Button>
          }
        />
      )}

      {detailLinkError && (
        <PortalAlert
          variant="error"
          title="No pudimos abrir esta tarea"
          description="El enlace puede estar desactualizado o el elemento puede no estar disponible para ti."
          action={
            <Button asChild={true} variant="secondary" size="sm">
              <Link href={TASKS_PATH}>Ver todas las tareas</Link>
            </Button>
          }
        />
      )}

      <PortalPanel
        eyebrow="Seguimiento"
        title="Bandeja de tareas"
        description="Filtra el trabajo activo y abre el detalle para transiciones, historial y vinculaciones."
      >
        <div className="space-y-4">
          {/* Encabezado de la región de resultados: destino de foco al cerrar
              el detalle llegado por deep link (PROD-UX #7, UX spec §8.2.2). */}
          <div
            id="tasks-results"
            ref={resultsHeaderRef}
            tabIndex={-1}
            className="rounded-2xl focus:outline-none"
          >
            <PortalSectionHeader
              title="Cola operativa"
              description="La apertura del detalle conserva la historia de asignaciones y eventos de la tarea."
            />
          </div>

          <TasksToolbar
            filters={{
              status: query.status ?? '',
              type: query.type ?? '',
              responsibleRefId: query.responsibleRefId ?? '',
              ticketId: query.ticketId ?? '',
            }}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
            onRefresh={() => void loadTasks()}
            isRefreshing={isRefreshing}
            responsibleLabel={responsibleLabel}
          />

          {/* Carga inicial: filas skeleton con forma de tabla dentro del shell
              (contrato de componente §6.5); sin datos reales aún. */}
          {!isLoading && tasks.length === 0 ? (
            /* El error no co-renderiza el vacío (§6.7): sin filas previas, la
               alerta superior ES el estado de la bandeja. */
            error ? null : hasActiveFilters ? (
              query.ticketId ? (
                <PortalEmptyState
                  title="No hay tareas para ese ticket"
                  description="Revisa la referencia del ticket o limpia los filtros para ver todas las tareas."
                  action={
                    <Button type="button" variant="outline" size="sm" onClick={handleClearFilters}>
                      Limpiar filtros
                    </Button>
                  }
                />
              ) : (
                <PortalEmptyState
                  title="No hay tareas con estos filtros"
                  description="Prueba con otros filtros o límpialos para ver todas las tareas."
                  action={
                    <Button type="button" variant="outline" size="sm" onClick={handleClearFilters}>
                      Limpiar filtros
                    </Button>
                  }
                />
              )
            ) : (
              <PortalEmptyState
                title="Aún no hay tareas aquí"
                description={
                  canManageTasks
                    ? 'Las tareas que crees o te asignen aparecerán en esta bandeja.'
                    : 'Cuando te asignen una tarea, la verás aquí.'
                }
                action={
                  canManageTasks ? (
                    <Button asChild={true} variant="primary" size="sm">
                      <Link href={createTaskHref}>Crear tarea</Link>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void loadTasks()}
                    >
                      Actualizar
                    </Button>
                  )
                }
              />
            )
          ) : (
            <TasksTable
              tasks={tasks}
              total={tasksMeta.total}
              isLoading={isLoading}
              refreshing={isRefreshing || isLoadingMore}
              from={from}
              to={to}
              onOpenRow={handleOpenRow}
              activeRowId={selectedTask?.id ?? taskIdParam}
              pagination={pagination}
            />
          )}
        </div>
      </PortalPanel>

      <TaskDetailDrawer
        open={Boolean(selectedTask)}
        task={selectedTask}
        timeline={timeline}
        assignmentHistory={assignmentHistory}
        onClose={closeTaskDetail}
        onTransition={handleTransition}
        isTransitioning={isTransitioning}
        isLoadingDetails={isLoadingDetail}
        error={drawerError}
        resolveResponsibleLabel={(value) => {
          // Fin del crawl (spec §4.8): el responsable vigente usa la etiqueta
          // proyectada por el backend (`responsibleLabel`, F1); el resto de
          // referencias (historial) se muestran con su identificador.
          if (!value) {
            return 'Sin responsable';
          }
          if (value === selectedTask?.responsibleRefId) {
            return selectedTask.responsibleLabel ?? value;
          }
          return value;
        }}
      />
    </div>
  );
}
