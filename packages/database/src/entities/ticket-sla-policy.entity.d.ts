/**
 * Entidad TicketSlaPolicy — schema por tenant (dinamico via search_path).
 *
 * Politica de SLA configurable por tenant. Puede aplicarse a un tipo de ticket
 * especifico, una prioridad especifica, o ambos. La politica mas especifica gana.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
export declare class TicketSlaPolicy {
    id: string;
    tenantId: string;
    name: string;
    /** Tipo de ticket al que aplica (valor de TicketType como string) — null = cualquiera */
    appliesToType: string | null;
    /** Prioridad a la que aplica (valor de TicketPriority como string) — null = cualquiera */
    appliesToPriority: string | null;
    /** Minutos para primera respuesta desde creacion */
    firstResponseMinutes: number;
    /** Minutos para resolucion desde creacion */
    resolutionMinutes: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=ticket-sla-policy.entity.d.ts.map