export enum TicketStatus {
  /** Ticket registrado, sin asignar */
  OPEN = 'OPEN',
  /** Ticket asignado a un agente/técnico */
  ASSIGNED = 'ASSIGNED',
  /** Trabajo en curso */
  IN_PROGRESS = 'IN_PROGRESS',
  /** Esperando respuesta del solicitante */
  PENDING_CUSTOMER = 'PENDING_CUSTOMER',
  /** Esperando recurso interno (pieza, aprobación, WFM) */
  PENDING_INTERNAL = 'PENDING_INTERNAL',
  /** Solicitud de trabajo de campo emitida hacia WFM */
  FIELD_SERVICE_REQUESTED = 'FIELD_SERVICE_REQUESTED',
  /** Ticket resuelto — pendiente confirmación */
  RESOLVED = 'RESOLVED',
  /** Ticket cerrado y confirmado */
  CLOSED = 'CLOSED',
  /** Ticket cancelado sin resolución */
  CANCELLED = 'CANCELLED',
}
