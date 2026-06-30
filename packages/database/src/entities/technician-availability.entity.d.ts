import { TechnicianAvailabilityType } from '@iwana/shared';
/**
 * Entidad TechnicianAvailability — schema por tenant (dinamico via search_path).
 *
 * Cubre bloqueos manuales y disponibilidad puntual por tecnico o contratista.
 * Horarios recurrentes se difieren a Fase 2 segun alcance aprobado.
 *
 * Sin @Entity({ schema }) — resuelto via SET LOCAL search_path (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.5
 */
export declare class TechnicianAvailability {
    id: string;
    /** FK logica a public.tenants.id — sin FK referencial cross-schema */
    tenantId: string;
    /** ID del tecnico o contratista (ref logica a users.id) */
    userId: string;
    type: TechnicianAvailabilityType;
    startsAt: Date;
    endsAt: Date;
    reason: string | null;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=technician-availability.entity.d.ts.map