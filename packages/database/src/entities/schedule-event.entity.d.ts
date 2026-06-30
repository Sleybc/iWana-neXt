import { ScheduleEventStatus, WfmWorkType } from '@iwana/shared';
/**
 * Entidad ScheduleEvent — schema por tenant (dinamico via search_path).
 *
 * Representa un evento programado en la agenda operativa del ISP.
 * Puede vincularse opcionalmente a una WorkOrder, expediente, suscriptor,
 * ticket, contrato u otras referencias cross-module por ID logico.
 *
 * Sin @Entity({ schema }) — TypeORM genera referencias sin calificar.
 * PostgreSQL las resuelve via SET LOCAL search_path al inicio de cada
 * transaccion (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.1
 */
export declare class ScheduleEvent {
    id: string;
    /** FK logica a public.tenants.id — sin FK referencial cross-schema */
    tenantId: string;
    /**
     * Referencia canonica a work_orders.id dentro del mismo schema tenant.
     * La capa de servicios debe sincronizar este campo con `WorkOrder.scheduledEventId`
     * en la misma transaccion para evitar drift entre ambos lados de la relacion.
     */
    workOrderId: string | null;
    executionOrderId: string | null;
    type: WfmWorkType;
    status: ScheduleEventStatus;
    title: string;
    description: string | null;
    scheduledStartAt: Date;
    scheduledEndAt: Date;
    /** ID del usuario tecnico, soporte, NOC o contratista asignado (ref logica a users.id) */
    assignedUserId: string;
    /** Reservado para cuadrillas futuras */
    assignedTeamId: string | null;
    /** Sede organizacional desde donde se atiende la agenda; opcional */
    organizationSiteId: string | null;
    address: string | null;
    municipality: string | null;
    sector: string | null;
    latitude: string | null;
    longitude: string | null;
    /** Vinculo CRM — referencia logica a expediente_records.id */
    expedienteId: string | null;
    /** Vinculo suscriptor — referencia logica a subscribers.id */
    subscriberId: string | null;
    /** Vinculo Service Assurance o referencia externa; puede ser ID o codigo semantico */
    ticketId: string | null;
    /** Vinculo contrato — referencia logica a contracts.id */
    contractId: string | null;
    createdBy: string;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}
//# sourceMappingURL=schedule-event.entity.d.ts.map