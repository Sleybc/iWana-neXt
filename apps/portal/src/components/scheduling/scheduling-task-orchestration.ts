/**
 * scheduling-task-orchestration.ts
 *
 * Orquesta la secuencia atómica: Tarea → Evento de agenda → OT.
 *
 * Reglas de negocio:
 *  1. La Task se crea siempre.
 *  2. El evento WFM se crea solo cuando executionMode exige agenda
 *     (SCHEDULED o FIELD_SERVICE) y hay una fecha/hora válida.
 *  3. Tras crear el evento se vincula a la Task via linkScheduleEvent.
 *  4. Si el evento tiene workOrderId (OT embebida), se vincula también via linkWorkOrder.
 *
 * No lanza excepciones parciales visibles: si los pasos 3-4 fallan, el error
 * se propaga al llamador para que lo maneje con setError. La Task ya quedó creada.
 */

import {
  TaskExecutionMode,
  TaskOriginContext,
  TaskRecipientType,
  TaskResponsibleType,
  WorkOrderSourceContext,
} from '@iwana/shared';
import { tasksApi, wfmApi } from '@/lib/api-client';
import type {
  CreateOperationalTaskDto,
  CreateWfmScheduleEventDto,
  OperationalTaskRecord,
  WfmScheduleEvent,
} from '@/lib/api-client';
import type { CreateTaskSchedulingValues } from './CreateTaskSchedulingDialog';

function parseCoordinates(value: string | undefined): {
  latitude: number | null;
  longitude: number | null;
} {
  if (!value?.trim()) {
    return { latitude: null, longitude: null };
  }

  const parts = value.split(',').map((s) => s.trim());
  if (parts.length !== 2) {
    return { latitude: null, longitude: null };
  }

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { latitude: null, longitude: null };
  }

  return { latitude: lat, longitude: lng };
}

const SCHEDULING_MODES: string[] = [TaskExecutionMode.SCHEDULED, TaskExecutionMode.FIELD_SERVICE];

/**
 * Convierte una cadena de fecha/hora local ("2026-06-24T09:00") a ISO 8601 UTC.
 * Si el valor está vacío o es inválido devuelve null.
 */
function toIso(datetimeLocal: string | undefined | null): string | null {
  if (!datetimeLocal?.trim()) return null;
  const date = new Date(datetimeLocal);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Calcula scheduledEndAt sumando durationMinutes a scheduledStartAt.
 */
function calcEndAt(startIso: string, durationMinutes: number): string {
  return new Date(new Date(startIso).getTime() + durationMinutes * 60_000).toISOString();
}

export interface CreateTaskWithOptionalSchedulingArgs {
  /** Valores del formulario wizard CreateTaskSchedulingDialog. */
  values: CreateTaskSchedulingValues;
  /** Contexto de origen de la tarea. Por defecto MANUAL. */
  sourceContext?: TaskOriginContext;
  /** ID de ticket de instalación a vincular. */
  linkedTicketId?: string | null;
  /** ID de expediente CRM a vincular al evento de agenda. */
  linkedExpedienteId?: string | null;
}

export interface CreateTaskWithOptionalSchedulingResult {
  task: OperationalTaskRecord;
  event: WfmScheduleEvent | null;
}

export async function createTaskWithOptionalScheduling({
  values,
  sourceContext = TaskOriginContext.MANUAL,
  linkedTicketId = null,
  linkedExpedienteId = null,
}: CreateTaskWithOptionalSchedulingArgs): Promise<CreateTaskWithOptionalSchedulingResult> {
  // ——— 1. Construir y crear la Task ———
  const requiresSchedule = SCHEDULING_MODES.includes(values.executionMode);

  const dueAtIso = values.executionMode === TaskExecutionMode.DUE_DATE ? toIso(values.dueAt) : null;

  const taskDto: CreateOperationalTaskDto = {
    type: values.type,
    priority: values.priority,
    title: values.title,
    description: null,
    originContext: sourceContext,
    originRefId: linkedExpedienteId ?? null,
    ticketId: linkedTicketId ?? null,
    responsibleType: TaskResponsibleType.USER,
    responsibleRefId: values.responsibleRefId,
    recipientType: values.recipientType,
    recipientRefId: values.recipientRefId?.trim() || null,
    recipientLabel: values.recipientLabel?.trim() || null,
    executionMode: values.executionMode,
    dueAt: dueAtIso,
    scheduledRequired: requiresSchedule,
  };

  const task = await tasksApi.create(taskDto);

  // ——— 2. Si no requiere agenda, terminar ———
  if (!requiresSchedule) {
    return { task, event: null };
  }

  // ——— 3. Construir el evento de agenda ———
  const startDatetime = `${values.scheduledDateLocal}T${values.scheduledStartTimeLocal}`;
  const startIso = toIso(startDatetime);

  if (!startIso) {
    // No hay fecha válida: la Task ya existe, no se puede crear agenda.
    // El llamador decide si informar al usuario.
    return { task, event: null };
  }

  const durationMin = values.durationMinutes ?? 60;
  const endIso = calcEndAt(startIso, durationMin);

  const assignedUserId = values.agendaResponsibleRefId?.trim() || values.responsibleRefId;

  const eventDto: CreateWfmScheduleEventDto = {
    type: values.scheduleWorkType,
    title: values.title,
    description: null,
    scheduledStartAt: startIso,
    scheduledEndAt: endIso,
    assignedUserId,
    address: values.address?.trim() || null,
    municipality: values.municipality?.trim() || null,
    sector: values.sector?.trim() || null,
    ...parseCoordinates(values.coordinates),
    expedienteId: linkedExpedienteId ?? null,
    ticketId: linkedTicketId ?? null,
    workOrder:
      values.createWorkOrder && values.workOrderSummary?.trim()
        ? {
            summary: values.workOrderSummary.trim(),
            notes: values.workOrderNotes?.trim() || null,
            priority: values.workOrderPriority,
            sourceContext: values.workOrderSourceContext ?? WorkOrderSourceContext.MANUAL,
            sourceRef: values.workOrderSourceRef?.trim() || null,
          }
        : undefined,
  };

  const event = await wfmApi.events.create(eventDto);

  // ——— 4. Vincular evento a Task ———
  await tasksApi.linkScheduleEvent(task.id, { scheduleEventId: event.id });

  // ——— 5. Vincular OT a Task si el evento creó una ———
  if (event.workOrderId) {
    await tasksApi.linkWorkOrder(task.id, { workOrderId: event.workOrderId });
  }

  return { task, event };
}

/**
 * Construye el mensaje de confirmación para el usuario.
 */
export function buildOrchestrationFeedback(result: CreateTaskWithOptionalSchedulingResult): string {
  const { task, event } = result;

  if (!event) {
    return `La tarea ${task.taskNumber} quedó creada sin agenda.`;
  }

  const withOt = event.workOrderId ? ' y la orden de trabajo vinculadas.' : ' vinculada.';
  return `La tarea ${task.taskNumber} quedó creada con la agenda${withOt}`;
}
