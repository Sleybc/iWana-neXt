import { z } from 'zod';

/**
 * Colas de trabajo de la bandeja (spec MOD10 bandeja 2026-11-18 §3 J, §4, D1). «Activo» = estado
 * distinto de Resuelto, Cerrado y Cancelado.
 * - mine: activos asignados a quien consulta.
 * - dueSoon: plazo en riesgo (AT_RISK).
 * - waitingCustomer: estado PENDING_CUSTOMER.
 * - fieldService: estado FIELD_SERVICE_REQUESTED.
 * - unassigned: activos sin responsable.
 * - breached: plazo incumplido (FIRST_RESPONSE_BREACHED o RESOLUTION_BREACHED), igual que `breachedCount`.
 * - all: todos los activos.
 */
export const ASSURANCE_WORK_QUEUES = [
  'mine',
  'dueSoon',
  'waitingCustomer',
  'fieldService',
  'unassigned',
  'breached',
  'all',
] as const;
export type AssuranceWorkQueue = (typeof ASSURANCE_WORK_QUEUES)[number];
export const AssuranceWorkQueueSchema = z.enum(ASSURANCE_WORK_QUEUES);

/** Búsqueda de servidor por número, asunto o cliente (§3 K). Se recorta antes de medir. */
export const TICKET_LIST_SEARCH_MIN_LENGTH = 2;
export const TICKET_LIST_SEARCH_MAX_LENGTH = 100;
export const TicketListSearchSchema = z
  .string()
  .trim()
  .min(TICKET_LIST_SEARCH_MIN_LENGTH)
  .max(TICKET_LIST_SEARCH_MAX_LENGTH);

/** Conteo por cola del resumen, relativo a quien consulta; cada valor = `meta.total` de su lista (CA-10). */
export const AssuranceWorkQueueCountsSchema = z
  .object(
    Object.fromEntries(
      ASSURANCE_WORK_QUEUES.map((queue) => [queue, z.number().int().min(0)]),
    ) as Record<AssuranceWorkQueue, z.ZodNumber>,
  )
  .strict();
export type AssuranceWorkQueueCounts = Record<AssuranceWorkQueue, number>;
