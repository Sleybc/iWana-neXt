import { z } from 'zod';
import { TicketActiveVisitSchema, TicketExecutionOrderSchema } from './ticket-detail.contract';

/**
 * Listado de tickets, paso 2 (spec MOD05 pestaña Soporte 2026-11-17 §16 B-1 a B-3). Campos que
 * `GET /assurance/tickets` añade a cada ticket, con las mismas formas que el detalle.
 */
export const TicketListItemExtensionSchema = z
  .object({
    /**
     * Nombre y apellido del responsable, sin exigir `users.read`. Nulo sin responsable, con el
     * usuario desactivado (INACTIVE, SUSPENDED), inexistente, borrado o sin nombre. Nunca el correo.
     */
    assignedUserDisplayName: z.string().max(201).nullable(),
    /** Visita activa del ticket; nula sin visita o sin `wfm.schedule.read`. */
    activeVisit: TicketActiveVisitSchema.nullable(),
    /** Orden de ejecución más reciente no anulada; nula sin orden o sin `operations.execution_orders.read`. */
    executionOrder: TicketExecutionOrderSchema.nullable(),
  })
  .strict();
export type TicketListItemExtension = z.infer<typeof TicketListItemExtensionSchema>;

/**
 * Orden del listado. `recent`: más reciente primero (por defecto). `urgency`: abiertos primero
 * (vencido → en riesgo → prioridad → plazo más próximo → más antiguo); luego resueltos, cerrados
 * y cancelados, el más reciente primero (spec §5.1).
 */
export const TICKET_LIST_ORDERS = ['recent', 'urgency'] as const;
export type ListTicketsOrder = (typeof TICKET_LIST_ORDERS)[number];
export const ListTicketsOrderSchema = z.enum(TICKET_LIST_ORDERS).optional().default('recent');
