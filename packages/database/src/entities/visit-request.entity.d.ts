import { VisitRequestStatus, WorkOrderSourceContext, WfmWorkType, WorkOrderPriority } from '@iwana/shared';
/**
 * Entidad VisitRequest — schema por tenant (dinamico via search_path).
 *
 * Solicitud operativa inicial que origina la creacion de Work Orders y ScheduleEvents.
 * Captura la demanda, contexto de origen, prioridad y datos del solicitante antes de
 * pasar a programacion WFM.
 *
 * Puede generarse desde CRM, Service Assurance, Provisioning o flujos manuales.
 * Status PENDING → NEEDS_CONTEXT → READY_TO_SCHEDULE → SCHEDULED | CANCELLED | REJECTED
 *
 * Sin @Entity({ schema }) — resuelto via SET LOCAL search_path (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.2
 */
export declare class VisitRequest {
    id: string;
    /** FK logica a public.tenants.id — sin FK referencial cross-schema */
    tenantId: string;
    status: VisitRequestStatus;
    /** Contexto de origen — sistema que solicita la visita */
    originContext: WorkOrderSourceContext;
    /** ID externo o referencia semantica del sistema origen */
    originRef: string | null;
    /** Etiqueta legible del sistema origen (ej. "Ticket #123", "Expediente EXP-001") */
    originLabel: string | null;
    workType: WfmWorkType;
    priority: WorkOrderPriority;
    title: string;
    description: string | null;
    /** Inicio de la ventana temporal solicitada por el negocio */
    requestedWindowStartAt: Date | null;
    /** Fin de la ventana temporal solicitada por el negocio */
    requestedWindowEndAt: Date | null;
    /** Fecha limite de atencion por SLA del negocio */
    slaDueAt: Date | null;
    /** Sede organizacional sugerida o seleccionada; opcional para tenants monosede */
    organizationSiteId: string | null;
    address: string | null;
    municipality: string | null;
    sector: string | null;
    latitude: number | null;
    longitude: number | null;
    /** FK logica a expediente_records.id — vinculo opcional de contexto CRM */
    expedienteId: string | null;
    /** FK logica a subscribers.id — vinculo opcional de contexto CRM */
    subscriberId: string | null;
    /** ID externo de ticket en Service Assurance — vinculo opcional */
    ticketId: string | null;
    /** FK logica a contracts.id — vinculo opcional de contexto comercial */
    contractId: string | null;
    /** ScheduleEvent generado al programar la visita — vinculo bidireccional */
    scheduleEventId: string | null;
    /** WorkOrder generada al programar la visita — vinculo bidireccional */
    workOrderId: string | null;
    /** ExecutionOrder generada al confirmar agenda — referencia logica MOD11 */
    executionOrderId: string | null;
    /** Usuario que creo la solicitud */
    requestedByUserId: string;
    /** Usuario que agendo la visita (cuando status = SCHEDULED) */
    scheduledByUserId: string | null;
    /** Timestamp de agendamiento (cuando status = SCHEDULED) */
    scheduledAt: Date | null;
    /** Timestamp de cancelacion (cuando status = CANCELLED) */
    cancelledAt: Date | null;
    /** Usuario que cancelo la solicitud */
    cancelledByUserId: string | null;
    /** Motivo de cancelacion */
    cancelReason: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}
//# sourceMappingURL=visit-request.entity.d.ts.map