import { z } from 'zod';
import { TicketActiveVisitSchema, TicketExecutionOrderSchema } from './ticket-detail.contract';

/** Largo máximo de `firstCommentExcerpt`. */
export const TICKET_LIST_COMMENT_EXCERPT_MAX = 200;

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
    /**
     * Nombre visible del solicitante (spec MOD10 bandeja §3 L), con la regla del detalle: nulo si
     * el solicitante no es un suscriptor, sin `crm.subscribers.read`, con titular suprimido o con
     * DATOS_BLOQUEADOS, con referencia no resoluble o si CRM falla.
     */
    requesterDisplayName: z.string().max(300).nullable(),
    /**
     * Comentarios que quien consulta ve en el detalle, con su misma regla: los internos no
     * cuentan para técnico ni contratista (spec MOD05 Soporte vista dividida §4, CA-9).
     * Opcional solo por compatibilidad; el listado siempre lo envía.
     */
    commentCount: z.number().int().min(0).optional(),
    /**
     * Extracto del primer comentario visible para quien consulta, en espacios simples y
     * truncado en servidor a 200 caracteres. Nulo si la descripción tiene texto, si no hay
     * comentario visible con texto (CA-10). Opcional solo por compatibilidad.
     */
    firstCommentExcerpt: z.string().max(TICKET_LIST_COMMENT_EXCERPT_MAX).nullable().optional(),
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
