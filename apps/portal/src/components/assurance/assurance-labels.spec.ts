import {
  ExecutionOrderResult,
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketQueue,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketTimelineEventType,
  TicketType,
} from '@iwana/shared';
import type { AssuranceTimelineEvent, InternalUser } from '@/lib/api-client';
import {
  ASSURANCE_EMPTY_QUEUE_LABEL,
  ASSURANCE_FIELD_DECISION_OPTIONS,
  ASSURANCE_QUEUE_LABELS,
  ASSURANCE_QUEUE_OPTIONS,
  ASSURANCE_SOURCE_LABELS,
  ASSURANCE_TICKET_STATUS_LABELS,
  ASSURANCE_TICKET_STATUS_VARIANTS,
  ASSURANCE_TIMELINE_EVENT_LABELS,
  ASSURANCE_UNLINKED_WORK_ORDER_LABEL,
  formatAssuranceDate,
  formatAssuranceDateTime,
  formatAssuranceReference,
  getAssuranceAssigneeLabel,
  getAssuranceAuthorDisplayName,
  getAssuranceExecutionResultLabel,
  getAssuranceFieldDecisionLabel,
  getAssuranceQueueLabel,
  getAssuranceRequesterTypeLabel,
  getAssuranceSlaStatusLabel,
  getAssuranceSlaStatusVariant,
  getAssuranceSourceLabel,
  getAssuranceSubjectTypeLabel,
  getAssuranceTicketPriorityLabel,
  getAssuranceTicketPriorityVariant,
  getAssuranceTicketStatusLabel,
  getAssuranceTicketStatusVariant,
  getAssuranceTicketTypeLabel,
  getAssuranceTimelineDescription,
  getAssuranceTimelineEventLabel,
  getAssuranceUserDisplayName,
} from './assurance-labels';

describe('assurance-labels', () => {
  it('mapea labels del dominio a copy en español y sentence case', () => {
    expect(getAssuranceTicketTypeLabel(TicketType.INTERNAL_SUPPORT)).toBe('Soporte interno');
    expect(getAssuranceTicketStatusLabel(TicketStatus.FIELD_SERVICE_REQUESTED)).toBe(
      'Visita técnica solicitada',
    );
  });

  it('separa responsable sin asignar y autor no disponible (spec MOD10 §4)', () => {
    expect(getAssuranceUserDisplayName(null)).toBe('Sin asignar');
    expect(getAssuranceAuthorDisplayName(null)).toBe('Usuario no disponible');
    expect(getAssuranceQueueLabel(null)).toBe('Sin área');
    expect(getAssuranceFieldDecisionLabel(TicketFieldDecision.NOT_REQUIRED)).toBe('No requiere');
  });

  it('responsable con referencia sin usuario: «Responsable no disponible» (§4 nota v1.1)', () => {
    expect(getAssuranceAssigneeLabel(null, null)).toBe('Sin asignar');
    expect(getAssuranceAssigneeLabel('user-1', null)).toBe('Responsable no disponible');
  });

  it('áreas, orígenes y resultados de la orden con su nombre de producto (§4 v1.1)', () => {
    expect(getAssuranceQueueLabel(TicketQueue.NOC)).toBe('Monitoreo operativo');
    expect(getAssuranceSourceLabel(TicketSource.NMS)).toBe('Monitoreo de red');
    expect(getAssuranceSourceLabel(TicketSource.WFM)).toBe('Programación');
    expect(getAssuranceExecutionResultLabel(ExecutionOrderResult.EXECUTED_WITH_OBSERVATIONS)).toBe(
      'Ejecutada con observaciones',
    );
    expect(getAssuranceExecutionResultLabel(undefined)).toBe('Sin resultado');
    const description = getAssuranceTimelineDescription(
      {
        id: 'event-1',
        tenantId: 'tenant-1',
        ticketId: 'ticket-1',
        eventType: TicketTimelineEventType.EXECUTION_ORDER_CLOSED,
        actorUserId: null,
        payload: { executionOrderId: 'OT-1', result: ExecutionOrderResult.NOT_EXECUTED },
        occurredAt: '2026-11-16T10:00:00.000Z',
      } as unknown as AssuranceTimelineEvent,
      new Map(),
    );
    expect(description).toBe('Orden de trabajo OT-1 cerrada con resultado «No ejecutada».');
    expect(description).not.toContain('NOT_EXECUTED');
  });

  it('mapea estados SLA sin exponer enums crudos al usuario final', () => {
    expect(getAssuranceSlaStatusLabel(SlaBreachStatus.RESOLUTION_BREACHED)).toBe(
      'Resolución vencida',
    );
  });
});

// ── Cobertura de §4 v1.1 (corrección H-A/H-B 2026-11-16): cada rótulo, sus valores por defecto
// y el respaldo para valores desconocidos, que nunca muestra el valor crudo con guiones bajos. ──

function timelineEvent(
  eventType: string,
  payload: Record<string, unknown> | null = {},
): AssuranceTimelineEvent {
  return {
    id: 'event-1',
    tenantId: 'tenant-1',
    ticketId: 'ticket-1',
    eventType,
    actorUserId: null,
    payload,
    occurredAt: '2026-11-16T10:00:00.000Z',
  } as unknown as AssuranceTimelineEvent;
}

const AGENT_USER = {
  id: 'user-1',
  email: 'agente@example.test',
  firstName: 'Agente',
  lastName: 'Sintético',
} as InternalUser;

describe('assurance-labels — tabla §4 v1.1 completa', () => {
  it('estados: cada estado tiene rótulo y variante; «Visita técnica solicitada» sustituye a trabajo de campo', () => {
    for (const status of Object.values(TicketStatus)) {
      expect(getAssuranceTicketStatusLabel(status)).toBe(ASSURANCE_TICKET_STATUS_LABELS[status]);
      expect(getAssuranceTicketStatusVariant(status)).toBe(
        ASSURANCE_TICKET_STATUS_VARIANTS[status],
      );
    }
    expect(Object.values(ASSURANCE_TICKET_STATUS_LABELS)).not.toContain(
      'Trabajo de campo solicitado',
    );
  });

  it('eventos del historial: rótulos de §4 sin «Work order», «SLA» ni «Deadline»', () => {
    expect(getAssuranceTimelineEventLabel(TicketTimelineEventType.FIELD_SERVICE_REQUESTED)).toBe(
      'Visita técnica solicitada',
    );
    expect(getAssuranceTimelineEventLabel(TicketTimelineEventType.WORK_ORDER_LINKED)).toBe(
      'Orden de trabajo vinculada',
    );
    expect(getAssuranceTimelineEventLabel(TicketTimelineEventType.SLA_BREACHED)).toBe(
      'Plazo de atención vencido',
    );
    expect(getAssuranceTimelineEventLabel(TicketTimelineEventType.PQR_DEADLINE_SET)).toBe(
      'Plazo de la PQR registrado',
    );
    const labels = Object.values(ASSURANCE_TIMELINE_EVENT_LABELS).join(' ');
    expect(labels).not.toMatch(/Work order|SLA|Deadline|Trabajo de campo/u);
  });

  it('descripciones del historial: una por evento, con vocabulario de §4', () => {
    const users = new Map([[AGENT_USER.id, AGENT_USER]]);
    const describeEvent = (type: string, payload?: Record<string, unknown> | null) =>
      getAssuranceTimelineDescription(timelineEvent(type, payload), users);

    expect(
      describeEvent(TicketTimelineEventType.STATUS_CHANGED, {
        from: TicketStatus.OPEN,
        to: TicketStatus.FIELD_SERVICE_REQUESTED,
      }),
    ).toBe('Abierto → Visita técnica solicitada');
    expect(describeEvent(TicketTimelineEventType.ASSIGNED, { assignedUserId: AGENT_USER.id })).toBe(
      'Responsable: Agente Sintético',
    );
    expect(describeEvent(TicketTimelineEventType.REASSIGNED, { assignedUserId: 'otro' })).toBe(
      'Responsable actualizado',
    );
    expect(describeEvent(TicketTimelineEventType.REASSIGNED, { assignedUserId: 7 })).toBe(
      'Responsable actualizado',
    );
    expect(
      describeEvent(TicketTimelineEventType.PRIORITY_CHANGED, {
        previousPriority: TicketPriority.LOW,
        priority: TicketPriority.URGENT,
      }),
    ).toBe('Prioridad: Baja → Urgente');
    expect(describeEvent(TicketTimelineEventType.FIELD_SERVICE_REQUESTED)).toBe(
      'Se solicitó una visita técnica.',
    );
    expect(
      describeEvent(TicketTimelineEventType.WORK_ORDER_LINKED, {
        workOrderId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      }),
    ).toBe('Orden de trabajo A1B2C3D4 vinculada al caso.');
    expect(describeEvent(TicketTimelineEventType.WORK_ORDER_LINKED, {})).toBe(
      'Orden de trabajo No disponible vinculada al caso.',
    );
    expect(describeEvent(TicketTimelineEventType.EXECUTION_ORDER_CLOSED, {})).toBe(
      'Orden de trabajo No disponible cerrada con resultado «Sin resultado».',
    );
    expect(describeEvent(TicketTimelineEventType.COMMENT_ADDED, { isInternal: true })).toBe(
      'Comentario interno registrado.',
    );
    expect(describeEvent(TicketTimelineEventType.COMMENT_ADDED, { isInternal: false })).toBe(
      'Comentario visible registrado.',
    );
    expect(describeEvent(TicketTimelineEventType.CLOSED)).toBe('Caso cerrado en la mesa de ayuda.');
    expect(describeEvent(TicketTimelineEventType.CREATED)).toBe(
      'Caso creado y disponible para operación.',
    );
    expect(describeEvent(TicketTimelineEventType.SLA_BREACHED)).toBe(
      'Se venció un plazo de atención de este caso.',
    );
    expect(describeEvent(TicketTimelineEventType.PQR_DEADLINE_SET)).toBe(
      'Se registró el control regulatorio inicial de la PQR.',
    );
    // Sin carga útil y con estados vacíos: no rompe ni muestra «undefined».
    expect(describeEvent(TicketTimelineEventType.STATUS_CHANGED, null)).not.toContain('undefined');
    expect(describeEvent(TicketTimelineEventType.PRIORITY_CHANGED, null)).not.toContain(
      'undefined',
    );
    // Evento sin descripción propia: usa su rótulo.
    expect(
      describeEvent(TicketTimelineEventType.EXECUTION_ORDER_CLOSED.replace('CLOSED', 'X')),
    ).toBe('Execution order x');
  });

  it('resultados de la orden: rótulo de Operaciones o respaldo legible, nunca el valor crudo', () => {
    for (const result of Object.values(ExecutionOrderResult)) {
      expect(getAssuranceExecutionResultLabel(result)).not.toContain('_');
    }
    expect(getAssuranceExecutionResultLabel('NUEVO_RESULTADO')).toBe('Nuevo resultado');
    expect(getAssuranceExecutionResultLabel('')).toBe('Sin resultado');
    expect(getAssuranceExecutionResultLabel(42)).toBe('Sin resultado');
  });

  it('orígenes y áreas: Monitoreo de red, Programación y Monitoreo operativo; sin siglas internas', () => {
    expect(getAssuranceSourceLabel(TicketSource.NMS)).toBe('Monitoreo de red');
    expect(getAssuranceSourceLabel(TicketSource.WFM)).toBe('Programación');
    expect(getAssuranceQueueLabel(TicketQueue.NOC)).toBe('Monitoreo operativo');
    expect(Object.values(ASSURANCE_SOURCE_LABELS)).not.toEqual(
      expect.arrayContaining(['NMS', 'WFM']),
    );
    expect(Object.values(ASSURANCE_QUEUE_LABELS)).not.toContain('NOC');
    expect(ASSURANCE_QUEUE_OPTIONS).toContainEqual({
      value: TicketQueue.NOC,
      label: 'Monitoreo operativo',
    });
  });

  it('relacionado con, solicitante, visita técnica, tipo, prioridad y plazo', () => {
    expect(getAssuranceSubjectTypeLabel(TicketSubjectType.WORK_ORDER)).toBe('Orden de trabajo');
    expect(getAssuranceRequesterTypeLabel(TicketRequesterType.SUBSCRIBER)).toBe('Suscriptor');
    expect(getAssuranceFieldDecisionLabel(TicketFieldDecision.NEEDS_DIAGNOSIS)).toBe(
      'Por definir tras diagnóstico',
    );
    expect(getAssuranceFieldDecisionLabel(TicketFieldDecision.FIELD_SERVICE_REQUIRED)).toBe(
      'Requerida',
    );
    expect(getAssuranceTicketPriorityLabel(TicketPriority.CRITICAL)).toBe('Crítica');
    expect(getAssuranceTicketPriorityVariant(TicketPriority.CRITICAL)).toBe('error');
    expect(getAssuranceSlaStatusVariant(SlaBreachStatus.AT_RISK)).toBe('warning');
    expect(ASSURANCE_FIELD_DECISION_OPTIONS.map((option) => option.label)).toEqual([
      'No requiere',
      'Por definir tras diagnóstico',
      'Requerida',
    ]);
  });

  it('valores desconocidos: respaldo en sentence case y variante neutral', () => {
    const unknown = 'VALOR_NUEVO';
    for (const label of [
      getAssuranceTicketTypeLabel(unknown),
      getAssuranceTicketStatusLabel(unknown),
      getAssuranceTicketPriorityLabel(unknown),
      getAssuranceRequesterTypeLabel(unknown),
      getAssuranceSubjectTypeLabel(unknown),
      getAssuranceQueueLabel(unknown),
      getAssuranceSourceLabel(unknown),
      getAssuranceFieldDecisionLabel(unknown),
      getAssuranceSlaStatusLabel(unknown),
      getAssuranceTimelineEventLabel(unknown),
    ]) {
      expect(label).toBe('Valor nuevo');
    }
    expect(getAssuranceTicketStatusVariant(unknown)).toBe('neutral');
    expect(getAssuranceTicketPriorityVariant(unknown)).toBe('neutral');
    expect(getAssuranceSlaStatusVariant(unknown)).toBe('neutral');
  });

  it('valores por defecto y formatos', () => {
    expect(getAssuranceQueueLabel(undefined)).toBe(ASSURANCE_EMPTY_QUEUE_LABEL);
    expect(ASSURANCE_EMPTY_QUEUE_LABEL).toBe('Sin área');
    expect(ASSURANCE_UNLINKED_WORK_ORDER_LABEL).toBe('Sin vincular');
    expect(formatAssuranceDateTime(null)).toBe('No disponible');
    expect(formatAssuranceDateTime('2026-11-16T10:00:00.000Z')).not.toBe('No disponible');
    expect(formatAssuranceDate(undefined)).toBe('No disponible');
    expect(formatAssuranceDate(new Date('2026-11-16T10:00:00.000Z'))).toMatch(/2026/u);
    expect(formatAssuranceReference('   ')).toBe('No disponible');
    expect(formatAssuranceReference('OT-1')).toBe('OT-1');
    expect(formatAssuranceReference('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')).toBe('A1B2C3D4');
  });

  it('nombres de personas: nombre completo, correo como respaldo y rótulos de ausencia', () => {
    expect(getAssuranceUserDisplayName(AGENT_USER)).toBe('Agente Sintético');
    const sinNombre = { ...AGENT_USER, firstName: '', lastName: '' } as InternalUser;
    expect(getAssuranceUserDisplayName(sinNombre)).toBe('agente@example.test');
    expect(getAssuranceAuthorDisplayName(AGENT_USER)).toBe('Agente Sintético');
    expect(getAssuranceAssigneeLabel(AGENT_USER.id, AGENT_USER)).toBe('Agente Sintético');
    expect(getAssuranceAssigneeLabel(undefined, AGENT_USER)).toBe('Sin asignar');
  });
});
