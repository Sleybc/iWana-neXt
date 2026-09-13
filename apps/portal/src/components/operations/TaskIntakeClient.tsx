// apps/portal/src/components/operations/TaskIntakeClient.tsx
// Extracción del intake de OperationsClient.tsx (:1130-1175) — split F2
// (spec 2026-09-13 §4.5). Vive en su propia ruta /dashboard/operations/tasks/new
// (CA-07: entrar a crear no monta el árbol de la OT).
//
// Fin del crawl (spec §4.8, F5): el formulario ya no recibe un directorio de
// usuarios; responsable y destinatario interno usan el typeahead
// `GET /users/search` con degradación 403 visible (D-P1, Salida 2).
//
// D-A3 (única excepción autorizada al refactor puro): el alta exitosa redirige
// a /tasks?taskId=<nuevo> con el detalle abierto — spec de diseño §4.4
// (mecanismo 3) y UX spec §5.3: el detalle abierto ES la confirmación, de modo
// que el PortalAlert de éxito del monolito (:1145-1163) desaparece junto con
// `lastCreatedTask` y `requiresScheduling`, cuyos únicos consumidores eran esa
// alerta. La llamada `loadTasks()` del alta (:766) es imposible aquí: la
// bandeja está en otra ruta y desmontada.
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TaskOriginContext } from '@iwana/shared';
import type { CreateOperationalTaskDto } from '@/lib/api-client';
import { tasksApi } from '@/lib/api-client';
import { PortalAlert, PortalPanel } from '@/components/shared/portal-ui';
import { TaskForm } from './TaskForm';
import type { TaskFormSubmitOptions } from './TaskForm';
import { createTaskVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';
import { mapOperationsError } from './execution-order-requirements';
import { mergeUrlSearchParams, withSearchParams } from '@/lib/merge-url-search-params';

const TASKS_PATH = '/dashboard/operations/tasks';

/**
 * M3.1 (UX spec §5.4): el `returnTo` solo puede apuntar a la bandeja de tareas
 * —la URL de retorno se escribe desde el CTA de origen—; cualquier otro valor
 * se descarta para no navegar a un destino arbitrario.
 */
function resolveReturnTo(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value === TASKS_PATH || value.startsWith(`${TASKS_PATH}?`) ? value : null;
}

/** Separa `path` y `query` de la URL de retorno para fusionar por merge. */
function splitPathAndQuery(url: string): { path: string; query: string } {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1
    ? { path: url, query: '' }
    : { path: url.slice(0, queryIndex), query: url.slice(queryIndex + 1) };
}

// Deuda registrada (spec §10.2): catálogo de negocio hardcodeado en un
// componente; se mantiene verbatim hasta su resolución.
const INTERNAL_AREA_OPTIONS = [
  { value: 'operations-area', label: 'Operaciones' },
  { value: 'noc-area', label: 'NOC' },
  { value: 'support-area', label: 'Soporte' },
];

export function TaskIntakeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const linkedTicketId = searchParams.get('ticketId');
  const fromAssurance = searchParams.get('fromAssurance') === '1';
  const initialTicketId = linkedTicketId?.trim() ? linkedTicketId : null;
  const initialOriginContext =
    initialTicketId && fromAssurance ? TaskOriginContext.ASSURANCE : undefined;
  // Estado de la bandeja de origen cuando el alta se inició desde ella (M3.1).
  const returnTo = resolveReturnTo(searchParams.get('returnTo'));

  async function handleCreate(payload: CreateOperationalTaskDto, options?: TaskFormSubmitOptions) {
    setIsSubmitting(true);
    setCreateError(null);
    try {
      const createdTask = await tasksApi.create(payload);

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
        return;
      }

      // D-A3 + M3.1: redirección post-alta con el detalle abierto sobre el
      // estado de la bandeja de origen (UX spec §5.3–§5.4) o sobre la bandeja
      // por defecto en llegada directa. `replace` consume la pantalla de
      // creación, que ya no tiene estado que conservar.
      const { path, query } = splitPathAndQuery(returnTo ?? TASKS_PATH);
      router.replace(
        withSearchParams(path, mergeUrlSearchParams(query, { taskId: createdTask.id })),
      );
    } catch (createTaskError) {
      setCreateError(mapOperationsError(createTaskError));
      throw createTaskError;
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    // UX spec §5.4.3: cancelar vuelve al estado de origen sin parámetro de
    // detalle (o a la bandeja por defecto en llegada directa).
    const { path, query } = splitPathAndQuery(returnTo ?? TASKS_PATH);
    router.replace(withSearchParams(path, mergeUrlSearchParams(query, { taskId: null })));
  }

  return (
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

      <TaskForm
        internalAreaOptions={INTERNAL_AREA_OPTIONS}
        {...(initialTicketId ? { initialTicketId } : {})}
        {...(initialOriginContext ? { initialOriginContext } : {})}
        onSubmit={handleCreate}
        onCancel={handleCancel}
        isSubmitting={isSubmitting}
        error={createError}
      />
    </PortalPanel>
  );
}
