import { PqrDeadlineType } from '@iwana/shared';
/**
 * Entidad TicketPqrRecord — schema por tenant (dinamico via search_path).
 *
 * Registro de plazos regulatorios CRC para tickets de tipo PQR.
 * Cada plazo (respuesta inicial, resolucion final, correccion) se registra
 * como una fila independiente para trazabilidad completa.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
export declare class TicketPqrRecord {
    id: string;
    /** FK logica a support_tickets.id — sin FK referencial */
    ticketId: string;
    tenantId: string;
    /** Numero de radicacion ante la CRC — null si aun no asignado */
    pqrNumber: string | null;
    deadlineType: PqrDeadlineType;
    deadlineAt: Date;
    notifiedAt: Date | null;
    resolvedAt: Date | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=ticket-pqr-record.entity.d.ts.map