import { WfmWorkType, WorkOrderPriority, WorkOrderSourceContext, WorkOrderStatus } from '@iwana/shared';
/**
 * Entidad WorkOrder — schema por tenant (dinamico via search_path).
 *
 * Orden operativa ligera vinculada a un evento de agenda.
 * Puede originarse desde CRM, Service Assurance, Provisioning o manualmente.
 *
 * `code` es unico por tenant via indice parcial en la migracion.
 * Sin @Entity({ schema }) — resuelto via SET LOCAL search_path (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.2
 */
export declare class WorkOrder {
    id: string;
    /** FK logica a public.tenants.id — sin FK referencial cross-schema */
    tenantId: string;
    /** Consecutivo legible, ej. WO-20260506-001 — unicidad por tenant via constraint en migracion */
    code: string;
    type: WfmWorkType;
    status: WorkOrderStatus;
    priority: WorkOrderPriority;
    /** ID del tecnico responsable (ref logica a users.id) */
    assignedUserId: string;
    /**
     * Vinculo inverso para lectura rapida desde la OT.
     * No debe mutarse de forma independiente: `ScheduleEvent.workOrderId` es la
     * referencia canonica y la capa de servicios debe mantener ambos campos
     * sincronizados dentro de la misma transaccion tenant-aware.
     */
    scheduledEventId: string | null;
    sourceContext: WorkOrderSourceContext;
    /** ID externo o referencia semantica del sistema origen */
    sourceRef: string | null;
    summary: string;
    notes: string | null;
    createdBy: string;
    closedBy: string | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}
//# sourceMappingURL=work-order.entity.d.ts.map