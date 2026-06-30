/**
 * Entidad ScheduleRescheduleLog — schema por tenant (dinamico via search_path).
 *
 * Historial append-only de reagendamientos. No tiene updatedAt ni deletedAt
 * por diseno: cada registro es inmutable desde su creacion.
 *
 * Sin @Entity({ schema }) — resuelto via SET LOCAL search_path (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.4
 */
export declare class ScheduleRescheduleLog {
    id: string;
    /** FK logica a public.tenants.id — sin FK referencial cross-schema */
    tenantId: string;
    /** Referencia al evento de agenda reagendado */
    scheduleEventId: string;
    fromStartAt: Date;
    fromEndAt: Date;
    toStartAt: Date;
    toEndAt: Date;
    /** Motivo obligatorio del reagendamiento */
    reason: string;
    notes: string | null;
    changedBy: string;
    createdAt: Date;
}
//# sourceMappingURL=schedule-reschedule-log.entity.d.ts.map