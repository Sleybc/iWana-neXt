import { WorkOrderTaskStatus } from '@iwana/shared';
/**
 * Entidad WorkOrderTask — schema por tenant (dinamico via search_path).
 *
 * Tareas internas de una Work Order. En Fase 1 puede existir una tarea
 * por defecto; el modelo queda listo para multiples tareas.
 *
 * Sin @Entity({ schema }) — resuelto via SET LOCAL search_path (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.3
 */
export declare class WorkOrderTask {
    id: string;
    /** FK logica a public.tenants.id — sin FK referencial cross-schema */
    tenantId: string;
    /** Referencia a work_orders.id dentro del mismo schema tenant */
    workOrderId: string;
    title: string;
    description: string | null;
    status: WorkOrderTaskStatus;
    /** Momento de llegada del tecnico registrado en campo */
    arrivalAt: Date | null;
    /** Momento de salida del tecnico registrado en campo */
    departureAt: Date | null;
    resultNotes: string | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=work-order-task.entity.d.ts.map